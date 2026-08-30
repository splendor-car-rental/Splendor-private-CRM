/**
 * WhatsApp Cloud API outbound senders (Splendor Master Rule Set, Module 13)
 * ===========================================================================
 * Pure unit tests -- no Firestore, no real network. global.fetch is mocked
 * so these tests verify the EXACT JSON payload shape sent to Meta's Graph
 * API against Meta's own documented Cloud API schema for each message type.
 * This is MOCK VERIFIED, not LIVE META VERIFIED: no real WhatsApp Business
 * Account/credentials were available in this environment to confirm Meta
 * actually accepts these payloads end-to-end. See the Master Rule Set for
 * that distinction.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
  process.env.WHATSAPP_API_VERSION = 'v21.0';
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function mockFetchOnce(status = 200, body: any = { messages: [{ id: 'wamid.TEST' }] }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('sendWhatsAppMessage', () => {
  it('posts the documented plain-text payload shape', async () => {
    const fetchMock = mockFetchOnce();
    const { sendWhatsAppMessage } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppMessage('971501112222', 'Hello');
    expect(result.status).toBe('sent');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/1234567890/messages');
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '971501112222',
      type: 'text',
      text: { body: 'Hello', preview_url: false }
    });
  });
});

describe('sendWhatsAppInteractiveButtons', () => {
  it('posts the documented interactive.button payload shape', async () => {
    const fetchMock = mockFetchOnce();
    const { sendWhatsAppInteractiveButtons } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppInteractiveButtons('971501112222', 'Confirm?', [
      { id: 'confirm_reservation', title: 'Confirm' },
      { id: 'cancel_reservation', title: 'Cancel' }
    ]);
    expect(result.status).toBe('sent');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('button');
    expect(body.interactive.body.text).toBe('Confirm?');
    expect(body.interactive.action.buttons).toEqual([
      { type: 'reply', reply: { id: 'confirm_reservation', title: 'Confirm' } },
      { type: 'reply', reply: { id: 'cancel_reservation', title: 'Cancel' } }
    ]);
  });

  it('refuses more than 3 buttons -- Meta Cloud API hard limit', async () => {
    const { sendWhatsAppInteractiveButtons } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppInteractiveButtons('971501112222', 'x', [
      { id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' }
    ]);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/3 buttons/);
  });

  it('refuses a button title over Meta\'s 20-character limit', async () => {
    const { sendWhatsAppInteractiveButtons } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppInteractiveButtons('971501112222', 'x', [
      { id: 'a', title: 'This title is definitely way too long' }
    ]);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/20-character/);
  });
});

describe('sendWhatsAppInteractiveList', () => {
  it('posts the documented interactive.list payload shape', async () => {
    const fetchMock = mockFetchOnce();
    const { sendWhatsAppInteractiveList } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppInteractiveList('971501112222', 'Pick one', 'Browse', [
      { title: 'Categories', rows: [{ id: 'category:supercar', title: 'Supercars', description: 'From AED 3000/day' }] }
    ]);
    expect(result.status).toBe('sent');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('list');
    expect(body.interactive.action.button).toBe('Browse');
    expect(body.interactive.action.sections).toEqual([
      { title: 'Categories', rows: [{ id: 'category:supercar', title: 'Supercars', description: 'From AED 3000/day' }] }
    ]);
  });

  it('refuses more than 10 total rows across sections -- Meta Cloud API hard limit', async () => {
    const { sendWhatsAppInteractiveList } = await import('../src/server/whatsapp');
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `v${i}`, title: `Vehicle ${i}` }));
    const result = await sendWhatsAppInteractiveList('971501112222', 'x', 'Select', [{ title: 'Vehicles', rows }]);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/10 rows/);
  });
});

describe('sendWhatsAppTemplate', () => {
  it('posts the documented template payload shape', async () => {
    const fetchMock = mockFetchOnce();
    const { sendWhatsAppTemplate } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppTemplate('971501112222', 'booking_confirmation', 'en', ['RES-000001']);
    expect(result.status).toBe('sent');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('template');
    expect(body.template).toEqual({
      name: 'booking_confirmation',
      language: { code: 'en' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'RES-000001' }] }]
    });
  });
});

describe('not_configured behavior (no credentials in this environment)', () => {
  it('never calls fetch when WhatsApp credentials are absent', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const fetchMock = mockFetchOnce();
    const { sendWhatsAppMessage } = await import('../src/server/whatsapp');
    const result = await sendWhatsAppMessage('971501112222', 'Hello');
    expect(result.status).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
