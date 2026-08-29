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
//
// Module 10 (conversational commerce) added the three interactive senders
// below. They share one Graph API call helper with the original plain-text
// sender so the "not configured" / network-error / HTTP-error handling
// logic exists in exactly one place. Every payload shape follows Meta's
// documented Cloud API schema for that message type; the Meta-imposed
// limits (button count, title lengths, list row count) are validated
// BEFORE the call, using the same numbers as src/config/whatsappCatalog.ts,
// so a bug here fails fast and locally with a clear message instead of a
// cryptic Graph API rejection at send time. No real WhatsApp Business
// account was available in this environment to exercise these against
// live Meta -- see the test suite for what WAS verified (the exact JSON
// payload shape sent to the Graph API for each message type) and the
// Master Rule Set for the LIVE META VERIFICATION = UNVERIFIED / BLOCKED
// label this carries until real credentials are configured.

import { META_INTERACTIVE_LIMITS } from '../config/whatsappCatalog';

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
 * Posts one message payload to the Cloud API's /messages endpoint. Shared
 * by every sender below -- never throws, always returns a result object, so
 * callers (event dispatch, custom reminders, the conversation engine) can
 * log every attempt uniformly regardless of outcome.
 */
async function postWhatsAppPayload(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { success: false, status: 'not_configured', error: 'WhatsApp Business API credentials are not configured on the server.' };
  }

  try {
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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

function cleanRecipient(toPhone: string): string | null {
  const cleanPhone = toPhone.replace(/[^0-9]/g, '');
  return cleanPhone || null;
}

/** Sends a plain-text WhatsApp message via the Cloud API. */
export async function sendWhatsAppMessage(toPhone: string, message: string): Promise<WhatsAppSendResult> {
  const cleanPhone = cleanRecipient(toPhone);
  if (!cleanPhone) {
    return { success: false, status: 'failed', error: 'No valid phone number for this recipient.' };
  }
  return postWhatsAppPayload({
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'text',
    text: { body: message, preview_url: false }
  });
}

export interface InteractiveButton {
  id: string;
  /** Meta hard limit: 20 characters, rendered as the tappable button label. */
  title: string;
}

/**
 * Sends up to 3 quick-reply buttons under a body message (Meta's
 * `interactive.button` type). Used for binary/ternary decisions -- confirm
 * or cancel a reservation, for example -- never for open-ended menus (use
 * sendWhatsAppInteractiveList for anything with more than 3 options, since
 * that is exactly what Meta's own button type is NOT designed for and
 * silently truncates/rejects beyond 3).
 */
export async function sendWhatsAppInteractiveButtons(
  toPhone: string,
  bodyText: string,
  buttons: InteractiveButton[],
  footerText?: string
): Promise<WhatsAppSendResult> {
  const cleanPhone = cleanRecipient(toPhone);
  if (!cleanPhone) {
    return { success: false, status: 'failed', error: 'No valid phone number for this recipient.' };
  }
  if (buttons.length === 0 || buttons.length > META_INTERACTIVE_LIMITS.MAX_BUTTONS) {
    return { success: false, status: 'failed', error: `Interactive button messages must have between 1 and ${META_INTERACTIVE_LIMITS.MAX_BUTTONS} buttons (Meta Cloud API limit).` };
  }
  const overLong = buttons.find(b => b.title.length > META_INTERACTIVE_LIMITS.MAX_BUTTON_TITLE_CHARS);
  if (overLong) {
    return { success: false, status: 'failed', error: `Button title "${overLong.title}" exceeds Meta's ${META_INTERACTIVE_LIMITS.MAX_BUTTON_TITLE_CHARS}-character limit.` };
  }

  return postWhatsAppPayload({
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))
      }
    }
  });
}

export interface InteractiveListRow {
  id: string;
  /** Meta hard limit: 24 characters. */
  title: string;
  /** Meta hard limit: 72 characters. */
  description?: string;
}

export interface InteractiveListSection {
  /** Meta hard limit: 24 characters. */
  title: string;
  rows: InteractiveListRow[];
}

/**
 * Sends a scrollable interactive list (Meta's `interactive.list` type) --
 * used for menus with more than 3 options (vehicle categories, the vehicle
 * catalog within a category). Meta caps the TOTAL row count across all
 * sections at 10; a category/vehicle list longer than that is truncated by
 * the caller (the conversation engine), never silently overflowed here.
 */
export async function sendWhatsAppInteractiveList(
  toPhone: string,
  bodyText: string,
  buttonText: string,
  sections: InteractiveListSection[],
  footerText?: string
): Promise<WhatsAppSendResult> {
  const cleanPhone = cleanRecipient(toPhone);
  if (!cleanPhone) {
    return { success: false, status: 'failed', error: 'No valid phone number for this recipient.' };
  }
  if (buttonText.length > META_INTERACTIVE_LIMITS.MAX_LIST_BUTTON_TEXT_CHARS) {
    return { success: false, status: 'failed', error: `List button text exceeds Meta's ${META_INTERACTIVE_LIMITS.MAX_LIST_BUTTON_TEXT_CHARS}-character limit.` };
  }
  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows === 0 || totalRows > META_INTERACTIVE_LIMITS.MAX_LIST_ROWS_TOTAL) {
    return { success: false, status: 'failed', error: `Interactive lists must have between 1 and ${META_INTERACTIVE_LIMITS.MAX_LIST_ROWS_TOTAL} rows total across all sections (Meta Cloud API limit).` };
  }
  for (const section of sections) {
    if (section.title.length > META_INTERACTIVE_LIMITS.MAX_LIST_SECTION_TITLE_CHARS) {
      return { success: false, status: 'failed', error: `List section title "${section.title}" exceeds Meta's ${META_INTERACTIVE_LIMITS.MAX_LIST_SECTION_TITLE_CHARS}-character limit.` };
    }
    for (const row of section.rows) {
      if (row.title.length > META_INTERACTIVE_LIMITS.MAX_LIST_ROW_TITLE_CHARS) {
        return { success: false, status: 'failed', error: `List row title "${row.title}" exceeds Meta's ${META_INTERACTIVE_LIMITS.MAX_LIST_ROW_TITLE_CHARS}-character limit.` };
      }
      if (row.description && row.description.length > META_INTERACTIVE_LIMITS.MAX_LIST_ROW_DESCRIPTION_CHARS) {
        return { success: false, status: 'failed', error: `List row description for "${row.title}" exceeds Meta's ${META_INTERACTIVE_LIMITS.MAX_LIST_ROW_DESCRIPTION_CHARS}-character limit.` };
      }
    }
  }

  return postWhatsAppPayload({
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        button: buttonText,
        sections: sections.map(s => ({ title: s.title, rows: s.rows.map(r => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })) }))
      }
    }
  });
}

/**
 * Sends a pre-approved Message Template -- the ONLY message type Meta
 * allows outside a customer-initiated 24-hour session window (e.g. a
 * proactive campaign or a reminder the customer didn't just ask for). This
 * function is implemented to the correct Graph API schema, but no template
 * has been registered/approved with Meta in this environment -- calling it
 * against a real WhatsApp Business Account requires a template name that
 * was actually submitted and approved in Meta Business Manager first, or
 * Meta rejects the call. See the Master Rule Set: MISSING credential /
 * REQUIRES_PARTNER_ACCESS, not claimed as a working send path.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[] = []
): Promise<WhatsAppSendResult> {
  const cleanPhone = cleanRecipient(toPhone);
  if (!cleanPhone) {
    return { success: false, status: 'failed', error: 'No valid phone number for this recipient.' };
  }
  return postWhatsAppPayload({
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParameters.length > 0
        ? { components: [{ type: 'body', parameters: bodyParameters.map(text => ({ type: 'text', text })) }] }
        : {})
    }
  });
}
