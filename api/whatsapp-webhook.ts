import crypto from 'crypto';
import { processInboundWhatsAppMessage } from '../src/server/whatsappConversation.js';

let admin: any = null;

async function initFirebase(): Promise<boolean> {
  if (admin?.apps?.length > 0) return true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return false;
  try {
    const mod = await import('firebase-admin');
    admin = mod.default;
    if (admin.apps.length > 0) return true;
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'splendor-private-crm.firebasestorage.app'
    });
    if (typeof admin.firestore().settings === 'function') {
      admin.firestore().settings({ ignoreUndefinedProperties: true });
    }
    return true;
  } catch (error) {
    console.error('[whatsapp webhook] Firebase initialization failed:', error);
    return false;
  }
}

async function readRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody);
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string') {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifySignature(rawBody: Buffer, header: unknown): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const received = Buffer.from(header.slice(7), 'hex');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function recordAudit(entry: any) {
  if (!(await initFirebase())) return;
  const id = `WA-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await admin.firestore().collection('audit_logs').doc(id).set({
    ...entry,
    id,
    timestamp: new Date().toISOString()
  });
}

async function recordInboundEvent(eventId: string, data: any) {
  if (!(await initFirebase())) throw new Error('Firebase is not configured.');
  const ref = admin.firestore().collection('whatsapp_inbound_events').doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(data);
    return false;
  }
  return !!snap.data()?.processedAt;
}

export default async function handler(req: any, res: any) {
  // The GET handshake still runs Firebase-free (Firebase Admin is only
  // initialized lazily via initFirebase(), never at module load) even though
  // the conversation engine is now a static top-level import above --
  // Vercel's Node bundler cannot resolve a dynamic import() of a literal
  // .ts specifier at runtime (it looks for a file that only exists as
  // source, not in the deployed bundle), which is exactly what silently
  // broke every inbound WhatsApp message with a 500 (ERR_MODULE_NOT_FOUND)
  // before this fix. A static import is traced and bundled correctly, the
  // same pattern already used by api/fleet-safe.ts and
  // api/contract-extension-safe.ts.
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && expected && token === expected) {
      return res.status(200).send(String(challenge ?? ''));
    }
    return res.status(403).end();
  }

  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await readRawBody(req);
  if (!verifySignature(rawBody, req.headers['x-hub-signature-256'])) {
    return res.status(403).end();
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  if (payload?.object !== 'whatsapp_business_account') return res.status(404).end();
  if (!(await initFirebase())) return res.status(503).json({ error: 'Webhook storage is not configured.' });

  const now = new Date().toISOString();
  const messages = (payload.entry || []).flatMap((entry: any) =>
    (entry.changes || []).flatMap((change: any) => change.value?.messages || [])
  );

  for (const message of messages) {
    if (!message?.id || !message?.from) continue;
    const eventId = `msg_${message.id}`;
    const alreadyProcessed = await recordInboundEvent(eventId, {
      direction: 'inbound',
      messageId: message.id,
      phone: message.from,
      type: message.type || 'unknown',
      body: message.text?.body || null,
      status: 'received',
      receivedAt: now
    });
    if (alreadyProcessed) continue;

    const interactive = message.interactive;
    await processInboundWhatsAppMessage({
      phone: message.from,
      type: message.type || 'unknown',
      text: message.text?.body,
      interactiveReplyId: interactive?.button_reply?.id || interactive?.list_reply?.id,
      messageId: message.id
    }, recordAudit);

    await admin.firestore().collection('whatsapp_inbound_events').doc(eventId).update({
      processedAt: new Date().toISOString()
    });
  }

  return res.status(200).end();
}
