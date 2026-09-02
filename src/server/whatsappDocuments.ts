import { isWhatsAppConfigured, type WhatsAppSendResult } from './whatsapp';

const MAX_WHATSAPP_DOCUMENT_BYTES = 100 * 1024 * 1024;

function cleanRecipient(toPhone: string): string | null {
  const clean = String(toPhone || '').replace(/[^0-9]/g, '');
  return clean || null;
}

function graphBase(): string {
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  return `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
}

/**
 * Uploads an issued PDF directly from server memory to Meta's WhatsApp media
 * store. We intentionally do NOT generate a public Firebase/CRM URL: issued
 * corporate documents remain private and RBAC-protected in SPLENDOR storage.
 */
export async function uploadWhatsAppPdf(
  pdf: Buffer,
  fileName: string
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  if (!isWhatsAppConfigured()) {
    return { success: false, error: 'WhatsApp Business API credentials are not configured on the server.' };
  }
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
    return { success: false, error: 'A non-empty PDF buffer is required.' };
  }
  if (pdf.length > MAX_WHATSAPP_DOCUMENT_BYTES) {
    return { success: false, error: 'PDF exceeds the WhatsApp document size limit (100 MB).' };
  }
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return { success: false, error: 'Document payload is not a valid PDF signature.' };
  }

  const safeFileName = String(fileName || 'Splendor-document.pdf')
    .replace(/[\r\n"\\/]/g, '_')
    .slice(0, 180) || 'Splendor-document.pdf';

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), safeFileName);

    const response = await fetch(`${graphBase()}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      body: form
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok || !data?.id) {
      return {
        success: false,
        error: data?.error?.message || `WhatsApp media upload failed (HTTP ${response.status}).`
      };
    }
    return { success: true, mediaId: String(data.id) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Network error uploading PDF to WhatsApp.' };
  }
}

/**
 * Sends an already-uploaded Meta-hosted PDF by media ID. Meta fetches no
 * SPLENDOR URL, so the issued-document archive never has to become public.
 */
export async function sendWhatsAppPdfByMediaId(
  toPhone: string,
  mediaId: string,
  fileName: string,
  caption?: string
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { success: false, status: 'not_configured', error: 'WhatsApp Business API credentials are not configured on the server.' };
  }
  const to = cleanRecipient(toPhone);
  if (!to) return { success: false, status: 'failed', error: 'No valid phone number for this recipient.' };
  if (!String(mediaId || '').trim()) return { success: false, status: 'failed', error: 'A WhatsApp media ID is required.' };

  const safeFileName = String(fileName || 'Splendor-document.pdf')
    .replace(/[\r\n"\\/]/g, '_')
    .slice(0, 180) || 'Splendor-document.pdf';
  const safeCaption = String(caption || '').trim().slice(0, 1024);

  try {
    const response = await fetch(`${graphBase()}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          id: String(mediaId).trim(),
          filename: safeFileName,
          ...(safeCaption ? { caption: safeCaption } : {})
        }
      })
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, status: 'failed', error: data?.error?.message || `WhatsApp API error (HTTP ${response.status}).` };
    }
    return { success: true, status: 'sent' };
  } catch (error: any) {
    return { success: false, status: 'failed', error: error?.message || 'Network error contacting WhatsApp API.' };
  }
}

export async function sendWhatsAppPdfBuffer(
  toPhone: string,
  pdf: Buffer,
  fileName: string,
  caption?: string
): Promise<WhatsAppSendResult & { mediaId?: string }> {
  const upload = await uploadWhatsAppPdf(pdf, fileName);
  if (!upload.success || !upload.mediaId) {
    return {
      success: false,
      status: isWhatsAppConfigured() ? 'failed' : 'not_configured',
      error: upload.error || 'WhatsApp media upload failed.'
    };
  }

  const sent = await sendWhatsAppPdfByMediaId(toPhone, upload.mediaId, fileName, caption);
  return { ...sent, mediaId: upload.mediaId };
}
