import admin from 'firebase-admin';
import { createHash, randomUUID } from 'node:crypto';
import { composeApprovedCorporateDocument, type ApprovedCompositionAudit } from './approvedDocumentComposer';
import { getCorporateDocumentMeta, type CorporateDocumentInput, type CorporateDocumentKind } from './corporateDocumentEngine';
import { issueNextNumber } from './idGenerator';

export type ContextualDocumentSourceType =
  | 'contract'
  | 'contract_extension'
  | 'invoice'
  | 'payment'
  | 'customer'
  | 'vehicle'
  | 'financial_note'
  | 'purchase_order';

export type ContextualDocumentSource = {
  type: ContextualDocumentSourceType;
  id: string;
  childId?: string;
};

export type ContextualDocumentActor = { uid: string; name: string; role: string };

export type ContextualDocumentResult = {
  serial: string;
  kind: CorporateDocumentKind;
  pdf: Buffer;
  fileName: string;
  audit: ApprovedCompositionAudit;
  archived: boolean;
  archiveId?: string;
};

type HydratedDocument = {
  input: CorporateDocumentInput;
  serial: string;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedEntityName: string;
  sourceSnapshot: Record<string, unknown>;
};

const ISSUE_LOCK_MS = 10 * 60 * 1000;
const ISSUE_TIME_SERIAL_KINDS = new Set<CorporateDocumentKind>(['account_statement', 'payment_demand', 'lpo']);
const LPO_ISSUABLE_PO_STATUSES = new Set(['approved', 'partially_fulfilled', 'fulfilled', 'partially_cancelled']);

export class DocumentIssuanceInProgressError extends Error {
  constructor() {
    super('Document issuance is already in progress for this source.');
    this.name = 'DocumentIssuanceInProgressError';
  }
}

function firestore() {
  if (admin.apps.length === 0) throw new Error('Firebase Admin is not initialized.');
  return admin.firestore();
}

async function requiredDoc(collection: string, id: string): Promise<any> {
  const snap = await firestore().collection(collection).doc(id).get();
  if (!snap.exists) throw new Error(`${collection} record not found.`);
  return { id: snap.id, ...snap.data() };
}

function dateOnly(value: unknown): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function timeOnly(value: unknown): string {
  const raw = String(value || '');
  return raw.includes('T') ? raw.slice(11, 16) : '';
}

async function contractContext(contractId: string) {
  const contract = await requiredDoc('contracts', contractId);
  const [customer, vehicle] = await Promise.all([
    contract.customerId ? requiredDoc('customers', contract.customerId) : Promise.resolve(null),
    contract.vehicleId ? requiredDoc('vehicles', contract.vehicleId) : Promise.resolve(null)
  ]);
  return { contract, customer, vehicle };
}

function customerPayload(customer: any): Record<string, unknown> {
  if (!customer) return {};
  const custom = customer.customFields || {};
  return {
    customerType: customer.type === 'corporate' ? 'company' : 'individual',
    name: customer.fullName || customer.companyName,
    fullName: customer.fullName,
    companyName: customer.companyName || custom.companyName,
    nationality: customer.nationality,
    idNumber: customer.idNumber,
    passportNumber: customer.idType === 'passport' ? customer.idNumber : custom.passportNumber,
    idIssueDate: custom.idIssueDate,
    idExpiryDate: customer.idExpiryDate,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    drivingLicenseNumber: customer.licenseNumber,
    licenseIssueDate: custom.licenseIssueDate,
    licenseExpiryDate: customer.licenseExpiryDate,
    licenseIssuingCountry: customer.licenseCountry || custom.licenseIssuingCountry,
    internationalLicenseNumber: custom.internationalLicenseNumber,
    internationalLicenseIssueDate: custom.internationalLicenseIssueDate,
    internationalLicenseExpiryDate: custom.internationalLicenseExpiryDate,
    tradeLicenseNumber: custom.tradeLicenseNumber,
    trn: custom.taxRegistrationNumber,
    taxRegistrationNumber: custom.taxRegistrationNumber,
    issuingCountry: custom.tradeLicenseIssuingCountry,
    authorizedPerson: custom.responsibleManager,
    responsibleManager: custom.responsibleManager,
    ownerName: custom.ownerName,
    poNumber: custom.poNumber
  };
}

function vehiclePayload(vehicle: any, fallback?: any): Record<string, unknown> {
  if (!vehicle && !fallback) return {};
  const source = vehicle || fallback || {};
  return {
    name: source.name || source.vehicleName || [source.make, source.model].filter(Boolean).join(' '),
    make: source.make,
    brand: source.make,
    model: source.model,
    year: source.year,
    color: source.exteriorColor || source.color,
    plateNumber: source.plateNumber || source.vehiclePlate,
    vin: source.vin,
    mileage: source.mileage
  };
}

async function hydrateRentalContract(source: ContextualDocumentSource): Promise<HydratedDocument> {
  if (source.type !== 'contract') throw new Error('Rental agreement must be bound to a contract record.');
  const { contract, customer, vehicle } = await contractContext(source.id);
  const serial = String(contract.contractNumber || contract.id);
  return {
    serial,
    relatedEntityType: 'contract',
    relatedEntityId: contract.id,
    relatedEntityName: serial,
    sourceSnapshot: { contract, customer, vehicle },
    input: {
      kind: 'rental_contract', serial, date: dateOnly(contract.issueDate || contract.createdAt),
      customer: customerPayload(customer), vehicle: vehiclePayload(vehicle, contract),
      fields: {
        customerType: customer?.type === 'corporate' ? 'company' : 'individual',
        pickupDate: dateOnly(contract.startDateTime), pickupTime: timeOnly(contract.startDateTime),
        returnDate: dateOnly(contract.endDateTime), returnTime: timeOnly(contract.endDateTime),
        rentalDuration: contract.durationDays ? `${contract.durationDays} days` : '',
        rentalAmount: contract.totalAmount || contract.totalRentalAmount || contract.dailyRate,
        securityDeposit: contract.securityDeposit || contract.depositAmount,
        paymentMethod: contract.paymentMethod,
        odometerOut: contract.handoverOdometer || contract.odometerOut
      }
    }
  };
}

async function hydrateExtension(source: ContextualDocumentSource): Promise<HydratedDocument> {
  if (!['contract', 'contract_extension'].includes(source.type)) throw new Error('Extension addendum must be bound to a contract.');
  const { contract, customer, vehicle } = await contractContext(source.id);
  const extensions = Array.isArray(contract.extensions) ? contract.extensions : [];
  const extension = source.childId
    ? extensions.find((item: any) => item.id === source.childId || item.addendumNumber === source.childId)
    : [...extensions].sort((a: any, b: any) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')))[0];
  if (!extension) throw new Error('No contract extension exists for this contract.');
  const serial = String(extension.addendumNumber || extension.id || `${contract.contractNumber}-EXT`);
  return {
    serial, relatedEntityType: 'contract', relatedEntityId: contract.id,
    relatedEntityName: `${contract.contractNumber} / ${serial}`,
    sourceSnapshot: { contract, extension, customer, vehicle },
    input: {
      kind: 'contract_extension', serial, date: dateOnly(extension.issueDate),
      customer: customerPayload(customer), vehicle: vehiclePayload(vehicle, contract),
      fields: {
        originalContractNumber: contract.contractNumber,
        currentEndDate: extension.oldEndDateTime || contract.endDateTime,
        newEndDate: extension.newEndDateTime,
        extensionPeriod: extension.extraDays ? `${extension.extraDays} يوم` : '',
        currentOdometer: extension.currentOdometerKm,
        periodRent: extension.extraAmount,
        paymentMethod: extension.paymentMethodLabel || extension.paymentMethod,
        subtotal: extension.subtotal || extension.extraAmount,
        vat: extension.vatAmount,
        total: extension.totalAmount || extension.extraAmount
      }
    }
  };
}

async function hydrateInvoice(source: ContextualDocumentSource, kind: 'tax_invoice' | 'simplified_tax_invoice'): Promise<HydratedDocument> {
  if (source.type !== 'invoice') throw new Error('Invoice document must be bound to an invoice record.');
  const invoice = await requiredDoc('invoices', source.id);
  const customer = invoice.customerId ? await requiredDoc('customers', invoice.customerId) : null;
  const contract = invoice.contractId ? await requiredDoc('contracts', invoice.contractId) : null;
  const vehicle = contract?.vehicleId ? await requiredDoc('vehicles', contract.vehicleId) : null;
  const serial = String(invoice.invoiceNumber || invoice.id);
  return {
    serial, relatedEntityType: 'invoice', relatedEntityId: invoice.id, relatedEntityName: serial,
    sourceSnapshot: { invoice, customer, contract, vehicle },
    input: {
      kind, serial, date: dateOnly(invoice.issueDate),
      customer: customer ? customerPayload(customer) : { name: invoice.customerName }, vehicle: vehiclePayload(vehicle, contract),
      fields: {
        contractNumber: contract?.contractNumber || invoice.contractId,
        supplyDate: invoice.supplyDate || invoice.issueDate,
        rentalPeriod: contract ? `${dateOnly(contract.startDateTime)} - ${dateOnly(contract.endDateTime)}` : '',
        subtotal: invoice.subtotal || 0, discount: invoice.discountAmount || 0,
        taxable: Math.max(0, Number(invoice.subtotal || 0) - Number(invoice.discountAmount || 0)),
        vat: invoice.vatAmount || 0, total: invoice.totalAmount || 0
      },
      rows: (invoice.items || []).map((line: any, index: number) => ({
        no: index + 1, description: line.description || line.name || line.type || '', quantity: line.quantity || 1,
        unitPrice: line.unitPrice || line.rate || line.amount || 0,
        subtotal: line.subtotal || line.amountBeforeVat || line.amount || 0,
        vatRate: line.vatRate ?? 5, vatAmount: line.vatAmount || 0,
        total: line.total || line.totalAmount || line.amount || 0
      }))
    }
  };
}

async function hydrateReceipt(source: ContextualDocumentSource): Promise<HydratedDocument> {
  if (source.type !== 'payment') throw new Error('Receipt must be bound to a payment record.');
  const payment = await requiredDoc('payments', source.id);
  const customer = payment.customerId ? await requiredDoc('customers', payment.customerId) : null;
  const contract = payment.contractId ? await requiredDoc('contracts', payment.contractId) : null;
  const vehicle = contract?.vehicleId ? await requiredDoc('vehicles', contract.vehicleId) : null;
  const serial = String(payment.receiptNumber || payment.id);
  return {
    serial, relatedEntityType: 'payment', relatedEntityId: payment.id, relatedEntityName: serial,
    sourceSnapshot: { payment, customer, contract, vehicle },
    input: {
      kind: 'payment_receipt', serial, date: dateOnly(payment.receivedAt || payment.date || payment.createdAt),
      customer: customerPayload(customer), vehicle: vehiclePayload(vehicle, contract),
      fields: {
        contractNumber: contract?.contractNumber || payment.contractId,
        paymentMethod: payment.method || payment.paymentMethod,
        referenceNumber: payment.referenceNumber || payment.reference,
        amountInWords: payment.amountInWords,
        subtotal: payment.amount || 0, vat: 0, total: payment.amount || 0
      },
      rows: [{ no: 1, description: payment.notes || payment.description || 'دفعة مستلمة', amount: payment.amount || 0 }]
    }
  };
}

async function hydrateCustomerDocument(source: ContextualDocumentSource, kind: 'account_statement' | 'payment_demand'): Promise<HydratedDocument> {
  if (source.type !== 'customer') throw new Error(`${kind} must be bound to a customer record.`);
  const customer = await requiredDoc('customers', source.id);
  const [invoiceSnap, contractSnap, paymentSnap] = await Promise.all([
    firestore().collection('invoices').where('customerId', '==', customer.id).get(),
    firestore().collection('contracts').where('customerId', '==', customer.id).get(),
    firestore().collection('payments').where('customerId', '==', customer.id).get()
  ]);
  const invoices = invoiceSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const contracts = contractSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const payments = paymentSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const currentContract = contracts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const serial = kind === 'account_statement' ? 'PREVIEW-STATEMENT' : 'PREVIEW-DEMAND';
  const outstanding = Number(customer.outstandingBalance || 0);
  const common = {
    kind, serial, date: new Date().toISOString().slice(0, 10), customer: customerPayload(customer),
    vehicle: { name: currentContract?.vehicleName || '', plateNumber: currentContract?.vehiclePlate || '' }
  } as CorporateDocumentInput;
  const input = kind === 'account_statement' ? {
    ...common,
    fields: {
      contractNumber: currentContract?.contractNumber || '', contractDate: dateOnly(currentContract?.createdAt),
      asOfDate: new Date().toISOString().slice(0, 10), totalDue: outstanding,
      receiptNumber: payments.sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')))[0]?.receiptNumber || ''
    },
    rows: invoices.sort((a, b) => String(a.issueDate || '').localeCompare(String(b.issueDate || ''))).map((invoice, index) => ({
      no: index + 1, date: invoice.issueDate, description: `فاتورة ${invoice.invoiceNumber || invoice.id}`,
      debit: invoice.totalAmount || 0, credit: invoice.paidAmount || 0,
      balance: Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0))
    }))
  } : {
    ...common,
    fields: { contractNumber: currentContract?.contractNumber || '', amountDue: outstanding },
    body: `نرجو سداد إجمالي المبلغ المستحق وقدره ${outstanding.toLocaleString()} درهم وفق المستندات والفواتير المسجلة على حساب العميل.`
  };
  return {
    serial, relatedEntityType: 'customer', relatedEntityId: customer.id, relatedEntityName: customer.fullName || customer.id,
    sourceSnapshot: { customer, invoices, contracts, payments }, input
  };
}

async function hydrateVehicleDocument(source: ContextualDocumentSource, kind: 'vehicle_record_card' | 'vehicle_exit_permit'): Promise<HydratedDocument> {
  if (source.type !== 'vehicle') throw new Error(`${kind} must be bound to a vehicle record.`);
  const vehicle = await requiredDoc('vehicles', source.id);
  const serial = `${kind === 'vehicle_record_card' ? 'VEHICLE' : 'EXIT'}-${vehicle.id}`;
  let customer: any = null;
  if (vehicle.currentCustomerId) customer = await requiredDoc('customers', vehicle.currentCustomerId).catch(() => null);
  const input: CorporateDocumentInput = kind === 'vehicle_record_card'
    ? { kind, serial, date: new Date().toISOString().slice(0, 10), vehicle: vehiclePayload(vehicle), fields: { registrationExpiry: vehicle.registrationExpiry, insuranceExpiry: vehicle.insuranceExpiry } }
    : { kind, serial, date: new Date().toISOString().slice(0, 10), vehicle: vehiclePayload(vehicle), customer: customerPayload(customer), fields: { licenseNumber: customer?.licenseNumber || '' } };
  return {
    serial, relatedEntityType: 'vehicle', relatedEntityId: vehicle.id,
    relatedEntityName: `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.plateNumber || ''}`.trim(),
    sourceSnapshot: { vehicle, customer }, input
  };
}

async function hydrateFinancialNote(source: ContextualDocumentSource, kind: 'credit_note' | 'debit_note'): Promise<HydratedDocument> {
  if (source.type !== 'financial_note') throw new Error(`${kind} must be bound to a financial note record.`);
  const note = await requiredDoc('accounting_financial_notes', source.id);
  if (note.type && note.type !== kind) throw new Error('Financial note type does not match the requested document kind.');
  const invoice = note.invoiceId ? await requiredDoc('invoices', note.invoiceId) : null;
  const customer = note.customerId ? await requiredDoc('customers', note.customerId) : null;
  const contract = invoice?.contractId ? await requiredDoc('contracts', invoice.contractId) : null;
  const vehicle = contract?.vehicleId ? await requiredDoc('vehicles', contract.vehicleId) : null;
  const serial = String(note.noteNumber || note.id);
  return {
    serial, relatedEntityType: 'invoice', relatedEntityId: invoice?.id || note.id, relatedEntityName: serial,
    sourceSnapshot: { note, invoice, customer, contract, vehicle },
    input: {
      kind, serial, date: dateOnly(note.issueDate || note.createdAt), customer: customerPayload(customer), vehicle: vehiclePayload(vehicle, contract),
      fields: {
        originalInvoiceNumber: invoice?.invoiceNumber || invoice?.id, originalInvoiceDate: invoice?.issueDate,
        contractNumber: contract?.contractNumber || invoice?.contractId, reason: note.reason,
        subtotal: note.amountBeforeVat, vat: note.vatAmount, total: note.totalAmount
      },
      rows: [{ no: 1, description: note.reason || kind, quantity: 1, unitPrice: note.amountBeforeVat, subtotal: note.amountBeforeVat, vatRate: note.amountBeforeVat ? (Number(note.vatAmount || 0) / Number(note.amountBeforeVat)) * 100 : 0, vatAmount: note.vatAmount, total: note.totalAmount }]
    }
  };
}

function assertPurchaseOrderIssuableAsLpo(po: any): void {
  if (!LPO_ISSUABLE_PO_STATUSES.has(String(po?.status || '')) || !po?.approvedBy || !po?.approvedAt) {
    throw new Error('LPO issue requires an approved purchase order with recorded server-side approval.');
  }
}

function formatAed(value: unknown): string {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function hydratePurchaseOrderRecord(po: any): HydratedDocument {
  const serial = 'PREVIEW-LPO';
  const activeLines = (Array.isArray(po.lineItems) ? po.lineItems : []).filter((line: any) => line.status !== 'cancelled');
  const itemLines = activeLines.map((line: any, index: number) => {
    const vehicle = line.vehicleDescription ? ` | Vehicle: ${line.vehicleDescription}` : '';
    return `${index + 1}. ${line.description || line.operationType || 'Item'}${vehicle} | Qty: ${Number(line.quantity || 0)} | Unit: ${formatAed(line.unitPrice)} AED | Total: ${formatAed(line.lineTotal)} AED`;
  });
  const body = [
    `Purchase Order / أمر الشراء: ${po.id}`,
    `Supplier / المورد: ${po.supplierName || ''}`,
    po.approvedByName ? `Approved by / اعتماد: ${po.approvedByName}` : `Status / الحالة: ${po.status || ''}`,
    '',
    ...itemLines,
    '',
    `Total / الإجمالي: ${formatAed(po.totalValue)} AED`,
    po.notes || po.termsAndConditions || ''
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '')).join('\n');

  return {
    serial,
    relatedEntityType: 'purchase_order',
    relatedEntityId: po.id,
    relatedEntityName: String(po.id),
    sourceSnapshot: { purchaseOrder: po },
    input: {
      kind: 'lpo',
      serial,
      date: dateOnly(po.approvedAt || po.createdAt),
      fields: {
        recipient: po.supplierName,
        supplierName: po.supplierName,
        subject: `Local Purchase Order — ${po.id}`,
        purchaseOrderNumber: po.id,
        approvalStatus: po.status,
        approvedBy: po.approvedByName,
        approvedAt: po.approvedAt,
        total: po.totalValue
      },
      rows: activeLines.map((line: any, index: number) => ({
        no: index + 1,
        description: line.description || line.operationType || '',
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        total: Number(line.lineTotal || 0)
      })),
      body
    }
  };
}

async function hydratePurchaseOrder(source: ContextualDocumentSource): Promise<HydratedDocument> {
  if (source.type !== 'purchase_order') throw new Error('LPO must be bound to a purchase order record.');
  const po = await requiredDoc('purchase_orders', source.id);
  return hydratePurchaseOrderRecord(po);
}

export async function hydrateContextualDocument(kind: CorporateDocumentKind, source: ContextualDocumentSource): Promise<HydratedDocument> {
  if (!source?.type || !source?.id) throw new Error('Document source type and id are required.');
  switch (kind) {
    case 'rental_contract': return hydrateRentalContract(source);
    case 'contract_extension': return hydrateExtension(source);
    case 'tax_invoice': return hydrateInvoice(source, 'tax_invoice');
    case 'simplified_tax_invoice': return hydrateInvoice(source, 'simplified_tax_invoice');
    case 'payment_receipt': return hydrateReceipt(source);
    case 'account_statement': return hydrateCustomerDocument(source, 'account_statement');
    case 'payment_demand': return hydrateCustomerDocument(source, 'payment_demand');
    case 'vehicle_record_card': return hydrateVehicleDocument(source, 'vehicle_record_card');
    case 'vehicle_exit_permit': return hydrateVehicleDocument(source, 'vehicle_exit_permit');
    case 'credit_note': return hydrateFinancialNote(source, 'credit_note');
    case 'debit_note': return hydrateFinancialNote(source, 'debit_note');
    case 'lpo': return hydratePurchaseOrder(source);
    default: throw new Error(`Context-bound source hydration is not yet registered for ${kind}.`);
  }
}

function archiveKey(kind: CorporateDocumentKind, source: ContextualDocumentSource): string {
  const raw = `${kind}:${source.type}:${source.id}:${source.childId || ''}`;
  return createHash('sha256').update(raw).digest('hex');
}

function snapshotHash(snapshot: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function compose(hydrated: HydratedDocument): Promise<ContextualDocumentResult> {
  const composed = await composeApprovedCorporateDocument(hydrated.input, hydrated.serial);
  return {
    serial: hydrated.serial,
    kind: hydrated.input.kind,
    pdf: composed.pdf,
    fileName: `${safeSegment(hydrated.serial)}-${hydrated.input.kind}.pdf`,
    audit: composed.audit,
    archived: false
  };
}

async function readIssuedResult(kind: CorporateDocumentKind, archiveId: string, data: any): Promise<ContextualDocumentResult> {
  const [pdf] = await admin.storage().bucket().file(data.storagePath).download();
  return {
    serial: data.serial,
    kind,
    pdf,
    fileName: data.fileName,
    audit: data.compositionAudit,
    archived: true,
    archiveId
  };
}

async function reserveIssueLock(ref: FirebaseFirestore.DocumentReference, kind: CorporateDocumentKind, source: ContextualDocumentSource, lockOwner: string) {
  const now = Date.now();
  return firestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as any) : null;
    if (data?.status === 'issued' && data.storagePath) return { state: 'issued' as const, data, lpoPurchaseOrder: undefined };

    let lpoPurchaseOrder: any = undefined;
    if (kind === 'lpo') {
      if (source.type !== 'purchase_order') throw new Error('LPO must be bound to a purchase order record.');
      const poRef = firestore().collection('purchase_orders').doc(source.id);
      const poSnap = await tx.get(poRef);
      if (!poSnap.exists) throw new Error('Purchase order record not found.');
      lpoPurchaseOrder = { id: poSnap.id, ...poSnap.data() };
      assertPurchaseOrderIssuableAsLpo(lpoPurchaseOrder);
    }

    const lockExpiresAt = data?.lockExpiresAt ? Date.parse(String(data.lockExpiresAt)) : 0;
    if (data?.status === 'issuing' && data.lockOwner !== lockOwner && Number.isFinite(lockExpiresAt) && lockExpiresAt > now) {
      return { state: 'busy' as const, lpoPurchaseOrder: undefined };
    }

    tx.set(ref, {
      id: ref.id,
      status: 'issuing',
      kind,
      source,
      serial: data?.serial || null,
      lockOwner,
      lockExpiresAt: new Date(now + ISSUE_LOCK_MS).toISOString(),
      createdAt: data?.createdAt || new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    }, { merge: true });
    return { state: 'acquired' as const, serial: data?.serial as string | undefined, lpoPurchaseOrder };
  });
}

async function persistReservedSerial(ref: FirebaseFirestore.DocumentReference, lockOwner: string, serial: string) {
  await firestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data() as any;
    if (!snap.exists || data?.status !== 'issuing' || data?.lockOwner !== lockOwner) throw new DocumentIssuanceInProgressError();
    tx.set(ref, { serial, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

async function finalizeIssuedRecord(ref: FirebaseFirestore.DocumentReference, lockOwner: string, record: Record<string, unknown>) {
  await firestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data() as any;
    if (!snap.exists || data?.status !== 'issuing' || data?.lockOwner !== lockOwner) throw new DocumentIssuanceInProgressError();
    tx.set(ref, record, { merge: false });
  });
}

async function markIssuanceFailed(ref: FirebaseFirestore.DocumentReference, lockOwner: string, error: unknown) {
  try {
    await firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.data() as any;
      if (!snap.exists || data?.status !== 'issuing' || data?.lockOwner !== lockOwner) return;
      const now = new Date().toISOString();
      tx.set(ref, {
        status: 'failed',
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'Document issuance failed.',
        failedAt: now,
        lockOwner: null,
        lockExpiresAt: null,
        updatedAt: now
      }, { merge: true });
    });
  } catch {
    console.error('[contextual-documents] failed to persist issuance failure state');
  }
}

async function resolveIssueSerial(kind: CorporateDocumentKind, hydrated: HydratedDocument, previouslyReserved?: string): Promise<string> {
  if (!ISSUE_TIME_SERIAL_KINDS.has(kind)) return hydrated.serial;
  if (previouslyReserved) return previouslyReserved;
  if (kind === 'lpo') return issueNextNumber('LPO');
  return issueNextNumber(getCorporateDocumentMeta(kind).numbering);
}

export async function previewContextualDocument(kind: CorporateDocumentKind, source: ContextualDocumentSource): Promise<ContextualDocumentResult> {
  const hydrated = await hydrateContextualDocument(kind, source);
  return compose(hydrated);
}

export async function issueContextualDocument(kind: CorporateDocumentKind, source: ContextualDocumentSource, actor: ContextualDocumentActor): Promise<ContextualDocumentResult> {
  const archiveId = archiveKey(kind, source);
  const ref = firestore().collection('issued_documents').doc(archiveId);

  const existing = await ref.get();
  if (existing.exists && existing.data()?.status === 'issued' && existing.data()?.storagePath) {
    return readIssuedResult(kind, archiveId, existing.data());
  }

  const hydrated = await hydrateContextualDocument(kind, source);
  const lockOwner = randomUUID();
  const reservation = await reserveIssueLock(ref, kind, source, lockOwner);
  if (reservation.state === 'issued') return readIssuedResult(kind, archiveId, reservation.data);
  if (reservation.state === 'busy') throw new DocumentIssuanceInProgressError();

  try {
    // For LPO, use the exact purchase-order snapshot read inside the same
    // Firestore transaction that acquired the issuance lock. This prevents
    // a stale pre-lock preview from becoming the official archived LPO after
    // an approval/status change racing with issuance.
    const issuanceHydrated = kind === 'lpo' && reservation.lpoPurchaseOrder
      ? hydratePurchaseOrderRecord(reservation.lpoPurchaseOrder)
      : hydrated;
    const serial = await resolveIssueSerial(kind, issuanceHydrated, reservation.serial);
    issuanceHydrated.serial = serial;
    issuanceHydrated.input = { ...issuanceHydrated.input, serial };
    await persistReservedSerial(ref, lockOwner, serial);

    const result = await compose(issuanceHydrated);
    const storagePath = `issued-documents/${safeSegment(issuanceHydrated.relatedEntityType)}/${safeSegment(issuanceHydrated.relatedEntityId)}/${archiveId}/${safeSegment(result.fileName)}`;
    const file = admin.storage().bucket().file(storagePath);
    await file.save(result.pdf, {
      resumable: false,
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'private, no-store',
        metadata: {
          archiveId, serial: result.serial, kind,
          sourceType: source.type, sourceId: source.id,
          sourceSnapshotSha256: snapshotHash(issuanceHydrated.sourceSnapshot),
          approvedTemplateSha256: result.audit.templateSha256
        }
      }
    });

    const now = new Date().toISOString();
    const record = {
      id: archiveId, status: 'issued', kind, serial: result.serial,
      source, relatedEntityType: issuanceHydrated.relatedEntityType, relatedEntityId: issuanceHydrated.relatedEntityId,
      relatedEntityName: issuanceHydrated.relatedEntityName, fileName: result.fileName,
      fileSizeBytes: result.pdf.length, fileType: 'application/pdf', storagePath,
      fileUrl: `/api/documents/file?path=${encodeURIComponent(storagePath)}`,
      sourceSnapshotSha256: snapshotHash(issuanceHydrated.sourceSnapshot),
      sourceSnapshot: issuanceHydrated.sourceSnapshot,
      compositionAudit: result.audit,
      issuedBy: actor.uid, issuedByName: actor.name, issuedByRole: actor.role,
      issuedAt: now, createdAt: now, updatedAt: now
    };
    await finalizeIssuedRecord(ref, lockOwner, record);
    return { ...result, archived: true, archiveId };
  } catch (error) {
    await markIssuanceFailed(ref, lockOwner, error);
    throw error;
  }
}
