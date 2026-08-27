// WhatsApp Cloud API (Meta Business Platform) integration. Configured
// entirely through environment variables -- exactly like GEMINI_API_KEY
// elsewhere in this project -- so nothing here ever needs code changes once
// the business owner provides real credentials:
//
//   WHATSAPP_ACCESS_TOKEN     -- permanent/system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  -- the sending number's Phone Number ID
//   WHATSAPP_GROUP_RECIPIENTS -- comma-separated phone numbers (E.164, no
//                                 "+") standing in for "the general WhatsApp
//                                 group". The Cloud API can only send to
//                                 individual numbers -- it cannot post into
//                                 a group chat -- so "broadcast to group" is
//                                 implemented as messaging every number in
//                                 this list, which is functionally the same
//                                 thing a person forwarding to a group does.
//
// Until these are set, isWhatsAppConfigured() is false and every send is
// recorded as 'not_configured' rather than silently pretending to succeed --
// the Control Center is fully usable in this state (toggles, recipients,
// custom reminders all save normally), it just doesn't actually dispatch
// anything over WhatsApp yet.

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function getWhatsAppGroupRecipients(): string[] {
  return (process.env.WHATSAPP_GROUP_RECIPIENTS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export interface WhatsAppSendResult {
  success: boolean;
  status: 'sent' | 'failed' | 'not_configured';
  error?: string;
}

/**
 * Sends a plain-text WhatsApp message via the Cloud API. Never throws --
 * always returns a result object, so callers (event dispatch, custom
 * reminders) can log every attempt uniformly regardless of outcome.
 */
export async function sendWhatsAppMessage(toPhone: string, message: string): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { success: false, status: 'not_configured', error: 'WhatsApp Business API credentials are not configured on the server.' };
  }

  const cleanPhone = toPhone.replace(/[^0-9]/g, '');
  if (!cleanPhone) {
    return { success: false, status: 'failed', error: 'No valid phone number for this recipient.' };
  }

  try {
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: message, preview_url: false }
      })
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, status: 'failed', error: data?.error?.message || `WhatsApp API error (HTTP ${res.status})` };
    }
    return { success: true, status: 'sent' };
  } catch (error: any) {
    return { success: false, status: 'failed', error: error?.message || 'Network error contacting WhatsApp API.' };
  }
}
