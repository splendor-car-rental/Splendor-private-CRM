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

function validPdf() {
  return Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
}

describe('WhatsApp issued-PDF delivery', () => {
  it('uploads the PDF privately to Meta media, then sends only the returned media ID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'MEDIA-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.TEST' }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const { sendWhatsAppPdfBuffer } = await import('../src/server/whatsappDocuments');
    const result = await sendWhatsAppPdfBuffer(
      '+971 50 111 2222',
      validPdf(),
      'CON-2026-00001.pdf',
      'Your SPLENDOR document'
    );

    expect(result).toMatchObject({ success: true, status: 'sent', mediaId: 'MEDIA-123' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe('https://graph.facebook.com/v21.0/1234567890/media');
    expect(uploadOptions.method).toBe('POST');
    expect(uploadOptions.headers.Authorization).toBe('Bearer test-token');
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect((uploadOptions.body as FormData).get('messaging_product')).toBe('whatsapp');
    expect((uploadOptions.body as FormData).get('file')).toBeInstanceOf(Blob);

    const [sendUrl, sendOptions] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    const message = JSON.parse(sendOptions.body);
    expect(message).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '971501112222',
      type: 'document',
      document: {
        id: 'MEDIA-123',
        filename: 'CON-2026-00001.pdf',
        caption: 'Your SPLENDOR document'
      }
    });
    expect(JSON.stringify(message)).not.toContain('firebase');
    expect(JSON.stringify(message)).not.toContain('/api/documents/file');
    expect(JSON.stringify(message)).not.toContain('http');
  });

  it('fails before network activity for a non-PDF payload', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendWhatsAppPdfBuffer } = await import('../src/server/whatsappDocuments');
    const result = await sendWhatsAppPdfBuffer('971501112222', Buffer.from('not a pdf'), 'bad.pdf');
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/valid PDF signature/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not attempt upload when WhatsApp is not configured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendWhatsAppPdfBuffer } = await import('../src/server/whatsappDocuments');
    const result = await sendWhatsAppPdfBuffer('971501112222', validPdf(), 'doc.pdf');
    expect(result.status).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
