/**
 * WhatsApp Conversational Commerce Engine (Splendor Master Rule Set, Module 13)
 * ===========================================================================
 * Runs against the REAL Firestore emulator (not a mock): the conversation
 * engine reads/writes a real document plus a real messages subcollection,
 * and the reservation-confirmation step calls the exact same
 * reserveVehicleSlot() transaction the rest of the app depends on for
 * double-booking protection -- none of that can be genuinely verified
 * against a hand-rolled in-memory mock. Route-level authorization for the
 * Unified Inbox HTTP endpoints is covered separately in
 * tests/coreWorkflows.test.ts against the mocked-HTTP suite.
 *
 * global.fetch is left unmocked and WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID
 * are deliberately left UNSET here, so every outbound send resolves to
 * 'not_configured' -- exactly the real state of this sandbox, and
 * irrelevant to what these tests are proving (the STATE MACHINE and the
 * RESERVATION CREATION, neither of which depend on whether the send to
 * Meta itself succeeded). See tests/whatsappSend.test.ts for the separate,
 * mocked-fetch verification of the actual Meta payload shapes.
 */

import { generateKeyPairSync } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Vehicle } from '../src/types';

let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;
let globalStore: typeof import('../src/server/dataStore').globalStore;
let processInboundWhatsAppMessage: typeof import('../src/server/whatsappConversation').processInboundWhatsAppMessage;
let getConversation: typeof import('../src/server/whatsappConversation').getConversation;
let listConversations: typeof import('../src/server/whatsappConversation').listConversations;
let listConversationMessages: typeof import('../src/server/whatsappConversation').listConversationMessages;
let matchCustomerByPhone: typeof import('../src/server/whatsappConversation').matchCustomerByPhone;
let assignConversation: typeof import('../src/server/whatsappConversation').assignConversation;
let setConversationBotActive: typeof import('../src/server/whatsappConversation').setConversationBotActive;
let sendManualReply: typeof import('../src/server/whatsappConversation').sendManualReply;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-splendor-crm-rules-test';
const STAFF = { uid: 'staff-uid', name: 'Test Staff', role: 'operations' as const };

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set -- run via `npm test` (firebase emulators:exec), not vitest directly.');
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const fakeServiceAccount = {
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: 'test-key',
    private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: '000000000000000000000',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  const adminModule = await import('firebase-admin');
  admin = adminModule.default ?? (adminModule as any);
  admin.initializeApp({ credential: admin.credential.cert(fakeServiceAccount as any), projectId: PROJECT_ID });
  db = admin.firestore();

  ({ globalStore } = await import('../src/server/dataStore'));
  ({
    processInboundWhatsAppMessage, getConversation, listConversations, listConversationMessages,
    matchCustomerByPhone, assignConversation, setConversationBotActive, sendManualReply
  } = await import('../src/server/whatsappConversation'));
});

afterAll(async () => {
  await Promise.all(admin.apps.map((app) => app?.delete()));
});

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

afterEach(async () => {
  await Promise.all(['whatsapp_conversations', 'idempotency_keys', 'audit_logs', 'vehicles', 'reservations', 'customers'].map(clearCollection));
  globalStore.vehicles.length = 0;
  globalStore.customers.length = 0;
  globalStore.reservations.length = 0;
});

const noopAudit = vi.fn().mockResolvedValue(undefined);

async function seedVehicle(overrides: Partial<Vehicle> = {}): Promise<Vehicle> {
  const vehicle = {
    id: 'VEH-WA-1',
    vin: 'VIN-WA-1',
    plateNumber: 'A-11111',
    plateCity: 'Dubai',
    make: 'Bugatti',
    model: 'Chiron',
    year: 2025,
    trim: 'Base',
    exteriorColor: 'Black',
    interiorColor: 'Tan',
    category: 'supercar',
    engine: 'W16',
    horsepower: 1500,
    transmission: 'Automatic',
    fuelType: 'petrol',
    status: 'available',
    lifecycleStatus: 'ACTIVE',
    dailyRate: 15000,
    weeklyRate: 90000,
    monthlyRate: 350000,
    minDeposit: 50000,
    mileageLimit: 250,
    registrationExpiry: '2027-01-01',
    insuranceExpiry: '2027-01-01',
    images: [],
    thumbnail: '',
    plateHistory: [],
    timeline: [],
    ownershipSource: 'OWNED',
    totalRevenue: 0,
    totalExpenses: 0,
    profitabilityScore: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    website: {
      enabled: true,
      visibility: 'WEBSITE',
      featured: false,
      publicVehicleId: 'bugatti-chiron-wa',
      publicName: 'Bugatti Chiron',
      publicDescription: 'A hypercar.',
      category: 'supercar',
      images: [],
      dailyRate: 15000,
      weeklyRate: 90000,
      monthlyRate: 350000,
      deposit: 50000,
      mileageAllowance: 250,
      slug: 'bugatti-chiron-wa'
    },
    ...overrides
  } as unknown as Vehicle;
  globalStore.vehicles.push(vehicle);
  // reserveVehicleSlot() (the real booking-conflict engine) reads the
  // vehicle from Firestore directly, by design, for cross-instance safety
  // -- see availability.ts's own doc comment. globalStore alone (used only
  // for the eventually-consistent BROWSING/catalog read) is not enough.
  await db.collection('vehicles').doc(vehicle.id).set(vehicle as unknown as Record<string, unknown>);
  return vehicle;
}

const PHONE = '971501112233';

async function inbound(phone: string, msg: { text?: string; interactiveReplyId?: string; type?: string }, id: string) {
  await processInboundWhatsAppMessage({ phone, type: msg.type || 'text', text: msg.text, interactiveReplyId: msg.interactiveReplyId, messageId: id }, noopAudit);
}

describe('matchCustomerByPhone', () => {
  it('returns unmatched when nobody has this phone', () => {
    expect(matchCustomerByPhone('971500000001').status).toBe('unmatched');
  });

  it('returns matched for exactly one customer with this phone', () => {
    globalStore.customers.push({ id: 'CUS-1', phone: '971500000002', fullName: 'Ali' } as any);
    const result = matchCustomerByPhone('971500000002');
    expect(result.status).toBe('matched');
    expect(result.customer?.id).toBe('CUS-1');
  });

  it('returns ambiguous_review when more than one customer shares this phone -- never guesses', () => {
    globalStore.customers.push({ id: 'CUS-1', phone: '971500000003', fullName: 'Ali' } as any);
    globalStore.customers.push({ id: 'CUS-2', phone: '971500000003', fullName: 'Sara' } as any);
    expect(matchCustomerByPhone('971500000003').status).toBe('ambiguous_review');
  });
});

describe('conversation state machine', () => {
  it('starts a new conversation in NEW/BROWSING on the first message and persists it durably', async () => {
    await inbound(PHONE, { text: 'hi' }, 'm1');
    const convo = await getConversation(PHONE);
    expect(convo).toBeTruthy();
    expect(convo!.state).toBe('BROWSING');
    expect(convo!.botActive).toBe(true);
    expect(convo!.customerMatchStatus).toBe('unmatched');

    const messages = await listConversationMessages(PHONE);
    expect(messages.some(m => m.direction === 'inbound')).toBe(true);
    expect(messages.some(m => m.direction === 'outbound')).toBe(true);
  });

  it('walks a customer through category -> vehicle -> dates -> locations -> name -> confirm -> a real reservation', async () => {
    await seedVehicle();
    await inbound(PHONE, { text: 'hi' }, 'm1');
    await inbound(PHONE, { interactiveReplyId: 'category:supercar' }, 'm2');
    let convo = await getConversation(PHONE);
    expect(convo!.draft.category).toBe('supercar');

    await inbound(PHONE, { interactiveReplyId: 'vehicle:bugatti-chiron-wa' }, 'm3');
    convo = await getConversation(PHONE);
    expect(convo!.state).toBe('VEHICLE_SELECTED');
    expect(convo!.draft.vehicleId).toBe('VEH-WA-1');

    await inbound(PHONE, { text: '2026-09-10 14:00' }, 'm4');
    convo = await getConversation(PHONE);
    expect(convo!.state).toBe('DATES_PENDING');
    expect(convo!.draft.pickupDateTime).toContain('2026-09-10');

    await inbound(PHONE, { text: '2026-09-15 12:00' }, 'm5');
    convo = await getConversation(PHONE);
    expect(convo!.state).toBe('LOCATION_PENDING');

    await inbound(PHONE, { text: 'DXB Airport' }, 'm6');
    await inbound(PHONE, { text: 'same' }, 'm7');
    await inbound(PHONE, { text: 'Ahmed Al Maktoum' }, 'm8');
    convo = await getConversation(PHONE);
    expect(convo!.state).toBe('RESERVATION_CONFIRM');
    expect(convo!.draft.fullName).toBe('Ahmed Al Maktoum');

    await inbound(PHONE, { interactiveReplyId: 'confirm_reservation' }, 'm9');
    convo = await getConversation(PHONE);
    expect(convo!.state).toBe('RESERVATION_CREATED');
    expect(convo!.lastReservationId).toBeTruthy();

    const reservation = globalStore.reservations.find(r => r.id === convo!.lastReservationId);
    expect(reservation).toBeTruthy();
    expect(reservation!.vehicleId).toBe('VEH-WA-1');
    expect(reservation!.customerPhone).toBe(PHONE);

    // A real Customer was created (matches by phone), never a second/shadow database.
    const customer = globalStore.customers.find(c => c.phone === PHONE);
    expect(customer).toBeTruthy();
    expect(customer!.fullName).toBe('Ahmed Al Maktoum');
    expect(customer!.source).toBe('whatsapp');
  });

  it('rejects an unparsable date and re-asks instead of crashing or advancing state', async () => {
    await seedVehicle();
    await inbound(PHONE, { text: 'hi' }, 'm1');
    await inbound(PHONE, { interactiveReplyId: 'category:supercar' }, 'm2');
    await inbound(PHONE, { interactiveReplyId: 'vehicle:bugatti-chiron-wa' }, 'm3');
    await inbound(PHONE, { text: 'sometime next week' }, 'm4');
    const convo = await getConversation(PHONE);
    expect(convo!.state).toBe('VEHICLE_SELECTED'); // did not advance
    expect(convo!.draft.pickupDateTime).toBeUndefined();
  });

  it('never auto-charges or auto-mutates finances -- the reservation is created in "pending" review status, never auto-confirmed', async () => {
    // Deliberately different dates from the previous test -- handleWhatsAppReservation's
    // idempotencyKey is derived from (phone, vehicleId, pickup, return), and
    // SplendorConnectEngine's own in-memory idempotency cache (a 60s TTL Map,
    // pre-existing and shared by every public/WhatsApp reservation path) is
    // not reset between tests in the same file. Reusing the exact same
    // dates here would silently replay the previous test's cached result
    // instead of exercising this test's own flow.
    await seedVehicle();
    await inbound(PHONE, { text: 'hi' }, 'm1');
    await inbound(PHONE, { interactiveReplyId: 'category:supercar' }, 'm2');
    await inbound(PHONE, { interactiveReplyId: 'vehicle:bugatti-chiron-wa' }, 'm3');
    await inbound(PHONE, { text: '2026-11-10 14:00' }, 'm4');
    await inbound(PHONE, { text: '2026-11-15 12:00' }, 'm5');
    await inbound(PHONE, { text: 'DXB Airport' }, 'm6');
    await inbound(PHONE, { text: 'same' }, 'm7');
    await inbound(PHONE, { text: 'Ahmed Al Maktoum' }, 'm8');
    await inbound(PHONE, { interactiveReplyId: 'confirm_reservation' }, 'm9');
    const convo = await getConversation(PHONE);
    const reservation = globalStore.reservations.find(r => r.id === convo!.lastReservationId);
    expect(reservation!.status).toBe('pending');
    expect(reservation!.depositStatus).toBe('pending');
  });

  it('a real double-tap of confirm (two distinct messages) creates exactly one reservation -- protected by reserveVehicleSlot\'s own idempotency key, independent of message-id dedup', async () => {
    await seedVehicle();
    await inbound(PHONE, { text: 'hi' }, 'd1');
    await inbound(PHONE, { interactiveReplyId: 'category:supercar' }, 'd2');
    await inbound(PHONE, { interactiveReplyId: 'vehicle:bugatti-chiron-wa' }, 'd3');
    await inbound(PHONE, { text: '2026-10-01 10:00' }, 'd4');
    await inbound(PHONE, { text: '2026-10-05 10:00' }, 'd5');
    await inbound(PHONE, { text: 'Showroom' }, 'd6');
    await inbound(PHONE, { text: 'same' }, 'd7');
    await inbound(PHONE, { text: 'Double Tap Customer' }, 'd8');

    await Promise.all([
      inbound(PHONE, { interactiveReplyId: 'confirm_reservation' }, 'd9a'),
      inbound(PHONE, { interactiveReplyId: 'confirm_reservation' }, 'd9b')
    ]);

    const matching = globalStore.reservations.filter(r => r.customerPhone === PHONE && r.vehicleId === 'VEH-WA-1' && r.pickupDateTime === '2026-10-01T10:00:00.000Z');
    expect(matching.length).toBe(1);
  });

  it('"menu" resets the conversation from any state back to BROWSING', async () => {
    await seedVehicle();
    await inbound(PHONE, { text: 'hi' }, 'r1');
    await inbound(PHONE, { interactiveReplyId: 'category:supercar' }, 'r2');
    await inbound(PHONE, { interactiveReplyId: 'vehicle:bugatti-chiron-wa' }, 'r3');
    await inbound(PHONE, { text: 'menu' }, 'r4');
    const convo = await getConversation(PHONE);
    expect(convo!.state).toBe('BROWSING');
    expect(convo!.draft.vehicleId).toBeUndefined();
  });

  it('"agent" escalates to HUMAN_ASSISTANCE and turns the bot off, from any state', async () => {
    await inbound(PHONE, { text: 'hi' }, 'h1');
    await inbound(PHONE, { text: 'agent' }, 'h2');
    const convo = await getConversation(PHONE);
    expect(convo!.state).toBe('HUMAN_ASSISTANCE');
    expect(convo!.botActive).toBe(false);
    expect(convo!.priority).toBe('high');
    expect(noopAudit).toHaveBeenCalled();
  });

  it('once a human has taken over, the bot stays silent -- no new outbound message is sent for a further inbound message', async () => {
    await inbound(PHONE, { text: 'hi' }, 's1');
    await inbound(PHONE, { text: 'agent' }, 's2');
    const before = await listConversationMessages(PHONE);
    const outboundBefore = before.filter(m => m.direction === 'outbound').length;

    await inbound(PHONE, { text: 'are you there?' }, 's3');
    const after = await listConversationMessages(PHONE);
    const outboundAfter = after.filter(m => m.direction === 'outbound').length;
    expect(outboundAfter).toBe(outboundBefore); // no new bot reply
    expect(after.some(m => m.body.includes('are you there?'))).toBe(true); // but the inbound message IS logged
  });

  it('a CLOSED conversation reopens on the next inbound message instead of staying a dead end', async () => {
    await inbound(PHONE, { text: 'hi' }, 'c1');
    await setConversationBotActive(PHONE, false, STAFF, noopAudit);
    // Manually force to CLOSED to simulate a staff-archived conversation.
    await db.collection('whatsapp_conversations').doc(PHONE).set({ state: 'CLOSED', botActive: true }, { merge: true });
    await inbound(PHONE, { text: 'hello again' }, 'c2');
    const convo = await getConversation(PHONE);
    expect(convo!.state).toBe('BROWSING');
  });
});

describe('human concierge actions', () => {
  it('assignConversation updates employee/priority/tags and audits the change', async () => {
    await inbound(PHONE, { text: 'hi' }, 'a1');
    const updated = await assignConversation(PHONE, { employeeId: 'USR-002', employeeName: 'Fleet Manager', priority: 'vip', tags: ['returning-customer'] }, STAFF, noopAudit);
    expect(updated.assignedEmployeeId).toBe('USR-002');
    expect(updated.priority).toBe('vip');
    expect(noopAudit).toHaveBeenCalled();
  });

  it('sendManualReply is refused while the bot is still active', async () => {
    await inbound(PHONE, { text: 'hi' }, 'b1');
    await expect(sendManualReply(PHONE, 'hello from staff', STAFF, noopAudit)).rejects.toThrow(/Take over/);
  });

  it('sendManualReply succeeds once a human has taken over, and is logged in the thread', async () => {
    await inbound(PHONE, { text: 'hi' }, 'b2');
    await setConversationBotActive(PHONE, false, STAFF, noopAudit);
    await sendManualReply(PHONE, 'A team member will call you shortly.', STAFF, noopAudit);
    const messages = await listConversationMessages(PHONE);
    expect(messages.some(m => m.direction === 'outbound' && m.sentBy === STAFF.uid)).toBe(true);
  });

  it('setConversationBotActive(true) returns to automation and resets to BROWSING', async () => {
    await inbound(PHONE, { text: 'hi' }, 'b3');
    await setConversationBotActive(PHONE, false, STAFF, noopAudit);
    const back = await setConversationBotActive(PHONE, true, STAFF, noopAudit);
    expect(back.botActive).toBe(true);
    expect(back.state).toBe('BROWSING');
  });
});

describe('listConversations', () => {
  it('lists conversations filterable by state', async () => {
    await inbound('971500000010', { text: 'hi' }, 'l1');
    await inbound('971500000011', { text: 'agent' }, 'l2');
    const needingHuman = await listConversations({ state: 'HUMAN_ASSISTANCE' });
    expect(needingHuman.length).toBe(1);
    expect(needingHuman[0].phone).toBe('971500000011');
  });
});
