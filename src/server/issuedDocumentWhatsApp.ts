import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import { globalStore } from './dataStore';
import { getRuleValue } from './businessRules';
import { sendWhatsAppPdfBuffer } from './whatsappDocuments';
import type { CorporateDocumentKind } from './corporateDocumentEngine';

export class IssuedDocumentWhatsAppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'IssuedDocumentWhatsAppError';
    this.status = status;
  }
}

export type IssuedDocumentWhatsAppActor = {
  uid: string;
  name: string;
  role: string;
};

export type IssuedDocumentWhatsAppResult = {
  archiveId: string;
  kind: CorporateDocumentKind;
  serial: string;
  customerId: string;
  customerName: string;
  status: 'sent' | 'failed' | 'not_configured';
  mediaId?: string;
  error?: string;
};

function firestore() {
  if (admin.apps.length === 0) {
    throw new IssuedDocumentWhatsAppError(503, 'Server persistence is not configured.');
  }
  return admin.firestore();
}

function customerIdFromArchive(data: any): string {
  const snapshot = data?.sourceSnapshot || {};
  const id = snapshot?.customer?.id
    || (data?.relatedEntityType === 'customer' ? data?.relatedEntityId : '')
    || snapshot?.contract?.customerId
    || snapshot?.payment?.customerId
    || snapshot?.invoice?.customerId
    || snapshot?.note?.customerId;
  return String(id || '').trim();
}

async function persistDeliveryLog(entry: Record<string, unknown>) {
  const id = `WA-DOC-${randomUUID()}`;
  const record = { id, ...entry };
  await firestore().collection('whatsapp_message_log').doc(id).set(record);

  // Keep the existing Control Center cache in sync when this serverless
  // instance already has it hydrated. Firestore remains the durable source.
  globalStore.whatsappMessageLog.unshift(record as any);
  if (globalStore.whatsappMessageLog.length > 500) globalStore.whatsappMessageLog.length = 500;
}

/**
 * Sends an already-issued immutable corporate PDF to the customer bound to
 * the archived source snapshot. The caller supplies NO phone number and NO
 * arbitrary storage path: both are resolved server-side from trusted data.
 */
export async function sendIssuedDocumentToCustomerWhatsApp(
  archiveId: string,
  actor: IssuedDocumentWhatsAppActor
): Promise<IssuedDocumentWhatsAppResult> {
  if (getRuleValue('killSwitch.whatsappOutbound', false)) {
    throw new IssuedDocumentWhatsAppError(503, 'WhatsApp outbound messaging is suspended by the emergency kill switch.');
  }

  const id = String(archiveId || '').trim();
  if (!id) throw new IssuedDocumentWhatsAppError(400, 'Issued document archive id is required.');

  const db = firestore();
  const archiveSnap = await db.collection('issued_documents').doc(id).get();
  if (!archiveSnap.exists) throw new IssuedDocumentWhatsAppError(404, 'Issued document not found.');
  const archive = { id: archiveSnap.id, ...(archiveSnap.data() as any) };

  if (archive.status !== 'issued' || !archive.storagePath || !archive.kind) {
    throw new IssuedDocumentWhatsAppError(409, 'Only a fully issued and archived document can be delivered to WhatsApp.');
  }
  if (!String(archive.storagePath).startsWith('issued-documents/') || String(archive.storagePath).includes('..')) {
    throw new IssuedDocumentWhatsAppError(409, 'Issued document storage binding is invalid.');
  }

  const customerId = customerIdFromArchive(archive);
  if (!customerId) {
    throw new IssuedDocumentWhatsAppError(409, 'This issued document is not bound to a customer and cannot be sent through the customer-delivery workflow.');
  }

  const customerSnap = await db.collection('customers').doc(customerId).get();
  if (!customerSnap.exists) throw new IssuedDocumentWhatsAppError(409, 'The customer bound to this issued document no longer exists.');
  const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };
  const phone = String(customer.whatsapp || customer.phone || '').trim();
  if (!phone) throw new IssuedDocumentWhatsAppError(409, 'The customer has no WhatsApp/phone number on file.');

  let pdf: Buffer;
  try {
    [pdf] = await admin.storage().bucket().file(String(archive.storagePath)).download();
  } catch {
    throw new IssuedDocumentWhatsAppError(500, 'The archived PDF could not be read from private storage.');
  }

  const serial = String(archive.serial || archive.id);
  const kind = archive.kind as CorporateDocumentKind;
  const fileName = String(archive.fileName || `${serial}.pdf`);
  const caption = customer.preferredLanguage === 'ar'
    ? `مستند سبلندر الرسمي — ${serial}`
    : `Official SPLENDOR document — ${serial}`;

  const delivery = await sendWhatsAppPdfBuffer(phone, pdf, fileName, caption);
  const createdAt = new Date().toISOString();
  await persistDeliveryLog({
    eventKey: 'issued_document_delivery',
    documentArchiveId: archive.id,
    documentKind: kind,
    documentSerial: serial,
    recipientType: 'customer',
    recipientLabel: customer.fullName || customer.companyName || customer.id,
    recipientPhone: phone,
    customerId,
    status: delivery.status,
    errorMessage: delivery.error,
    mediaId: delivery.mediaId,
    sentBy: actor.uid,
    sentByName: actor.name,
    sentByRole: actor.role,
    createdAt
  });

  return {
    archiveId: archive.id,
    kind,
    serial,
    customerId,
    customerName: customer.fullName || customer.companyName || customer.id,
    status: delivery.status,
    ...(delivery.mediaId ? { mediaId: delivery.mediaId } : {}),
    ...(delivery.error ? { error: delivery.error } : {})
  };
}
