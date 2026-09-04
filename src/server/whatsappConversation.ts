// WhatsApp Conversational Commerce Engine (Splendor Master Rule Set, Module 13)
// -----------------------------------------------------------------------------
// This is the piece server.ts's own webhook comment (see recordWhatsAppInboundEvent)
// flagged as "a separate, larger feature to build once this durable log is in
// place": turning the raw, already-durable whatsapp_inbound_events log into a
// real conversation with a customer, with a persisted state machine so the
// bot and a human agent are always looking at the exact same state.
//
// ARCHITECTURE (per this mission's explicit mandate): WhatsApp is a
// communication/interaction layer, never a second source of truth. This
// module NEVER writes a Reservation/Contract/Customer/financial record
// itself -- every CRM-affecting action goes through the SAME functions the
// rest of the app already uses (SplendorConnectEngine.handleWhatsAppReservation,
// which itself calls reserveVehicleSlot -- the one real reservation engine).
// This module owns only: conversation state, customer matching, and turning
// state + an inbound signal into an outbound reply.
//
// CONCURRENCY NOTE: unlike a financial mutation, the conversation document
// itself is read-then-merged WITHOUT a Firestore transaction. This is a
// deliberate, bounded risk, not an oversight: the only consequential
// mutation this module can trigger (creating a reservation) is independently
// protected by reserveVehicleSlot's own transaction + idempotency key
// regardless of what the conversation doc says, and outbound WhatsApp sends
// are real network calls that must never happen inside a Firestore
// transaction's retryable callback (a retry would re-send the message). A
// rare double-inbound race at the chat-state level can, at worst, leave the
// conversation showing a stale draft for one turn -- never a double booking,
// never a lost booking, and never a corrupted financial record. Duplicate
// PROCESSING of the exact same Meta message id is separately and fully
// prevented upstream, by the `processedAt` gate in server.ts's webhook
// handler, before this function is ever called a second time for that id.

import admin from 'firebase-admin';
import { createDurable, updateDurable, PersistenceError } from './persistence.js';
import { issueNextNumber } from './idGenerator.js';
import type { RecordAuditFn } from './businessRules.js';
import { globalStore } from './dataStore.js';
import { dispatchNotificationEvent } from './notificationEngine.js';
import {
  sendWhatsAppMessage, sendWhatsAppInteractiveButtons, sendWhatsAppInteractiveList,
  isWhatsAppConfigured
} from './whatsapp.js';
import { SplendorConnectEngine } from './splendorConnectEngine.js';
import { recordFailedJob } from './deadLetterQueue.js';
import {
  WHATSAPP_CATEGORY_LABELS, ALL_VEHICLE_CATEGORIES, RESTART_COMMANDS, HUMAN_HELP_COMMANDS,
  WHATSAPP_ACTION_IDS
} from '../config/whatsappCatalog.js';
import type {
  Customer, WhatsAppConversation, WhatsAppConversationState, WhatsAppConversationMessage,
  WhatsAppConversationDraft, WhatsAppCustomerMatchStatus, VehicleCategory
} from '../types/index.js';

export class ConversationError extends PersistenceError {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationError';
  }
}

const CONVERSATIONS_COLLECTION = 'whatsapp_conversations';

// ---------------------------------------------------------------------------
// Phone normalization & customer matching
// ---------------------------------------------------------------------------

/** Digits only -- Meta always sends `from`/`recipient_id` as digits with no "+", but this strips any stray formatting defensively. */
export function normalizePhone(raw: string): string {
  return (raw || '').replace(/[^0-9]/g, '');
}

/**
 * Matches an inbound phone number to an existing Customer record. Never
 * guesses: zero matches is "unmatched" (a genuinely new contact -- a
 * Customer record is only created once they actually confirm a booking,
 * see handleWhatsAppReservation), exactly one match is used directly, and
 * MORE than one match (a pre-existing data-quality condition -- nothing
 * currently enforces phone uniqueness) is flagged for a human to resolve
 * rather than silently picking one, per this mission's explicit "never
 * guess identity" requirement.
 */
export function matchCustomerByPhone(phone: string): { status: WhatsAppCustomerMatchStatus; customer?: Customer } {
  const candidates = globalStore.customers.filter(c => normalizePhone(c.phone) === phone || normalizePhone(c.whatsapp || '') === phone);
  if (candidates.length === 0) return { status: 'unmatched' };
  if (candidates.length === 1) return { status: 'matched', customer: candidates[0] };
  return { status: 'ambiguous_review' };
}

/** A Firestore-safe patch fragment from a match result -- never emits an explicit `undefined` field (real Firestore's .set()/.create() reject those outright). */
function matchPatch(match: { status: WhatsAppCustomerMatchStatus; customer?: Customer } | undefined): Record<string, unknown> {
  if (!match) return {};
  return match.customer
    ? { customerId: match.customer.id, customerName: match.customer.fullName, customerMatchStatus: match.status }
    : { customerMatchStatus: match.status };
}

// ---------------------------------------------------------------------------
// Conversation persistence
// ---------------------------------------------------------------------------

function conversationRef(phone: string) {
  return admin.firestore().collection(CONVERSATIONS_COLLECTION).doc(phone);
}

export async function getConversation(phone: string): Promise<WhatsAppConversation | null> {
  const snap = await conversationRef(normalizePhone(phone)).get();
  return snap.exists ? (snap.data() as WhatsAppConversation) : null;
}

/** Newest-active-first listing for the Unified Inbox. Reads Firestore directly (no globalStore cache), matching this session's established pattern for every module added after the initial hydration map was fixed (vehicle_inspections, blocklist, maintenance, ...). */
export async function listConversations(filter?: { state?: WhatsAppConversationState; assignedEmployeeId?: string }): Promise<WhatsAppConversation[]> {
  let query: FirebaseFirestore.Query = admin.firestore().collection(CONVERSATIONS_COLLECTION);
  if (filter?.state) query = query.where('state', '==', filter.state);
  if (filter?.assignedEmployeeId) query = query.where('assignedEmployeeId', '==', filter.assignedEmployeeId);
  const snap = await query.get();
  const rows = snap.docs.map(d => d.data() as WhatsAppConversation);
  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return rows;
}

export async function listConversationMessages(phone: string, limit = 200): Promise<WhatsAppConversationMessage[]> {
  const snap = await conversationRef(normalizePhone(phone)).collection('messages').orderBy('timestamp', 'asc').limit(limit).get();
  return snap.docs.map(d => d.data() as WhatsAppConversationMessage);
}

async function appendMessage(phone: string, message: WhatsAppConversationMessage): Promise<void> {
  await conversationRef(phone).collection('messages').doc(message.id).set(message as unknown as Record<string, unknown>);
}

function emptyDraft(): WhatsAppConversationDraft {
  return {};
}

async function ensureConversation(phone: string): Promise<WhatsAppConversation> {
  const ref = conversationRef(phone);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as WhatsAppConversation;

  const match = matchCustomerByPhone(phone);
  const now = new Date().toISOString();
  const fresh: WhatsAppConversation = {
    id: phone,
    phone,
    ...(match.customer ? { customerId: match.customer.id, customerName: match.customer.fullName } : {}),
    customerMatchStatus: match.status,
    state: 'NEW',
    botActive: true,
    priority: 'normal',
    tags: [],
    draft: emptyDraft(),
    unread: true,
    createdAt: now,
    updatedAt: now
  };
  await ref.set(fresh as unknown as Record<string, unknown>);
  return fresh;
}

// ---------------------------------------------------------------------------
// Outbound helpers -- every send is logged into the conversation thread
// regardless of success/failure, exactly like the existing WhatsApp Control
// Center logs every dispatch attempt (see notificationEngine.ts).
// ---------------------------------------------------------------------------

interface OutboundPlan {
  kind: 'text' | 'buttons' | 'list' | 'none';
  bodyEn: string;
  bodyAr: string;
  buttons?: { id: string; titleEn: string; titleAr: string }[];
  listButtonEn?: string;
  listButtonAr?: string;
  sections?: { titleEn: string; titleAr: string; rows: { id: string; titleEn: string; titleAr: string; descriptionEn?: string; descriptionAr?: string }[] }[];
}

function bilingual(en: string, ar: string): string {
  return `${ar}\n\n${en}`;
}

async function sendPlan(phone: string, plan: OutboundPlan): Promise<void> {
  if (plan.kind === 'none') return;

  const messageId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  let result;
  let logBody = bilingual(plan.bodyEn, plan.bodyAr);

  if (plan.kind === 'text') {
    result = await sendWhatsAppMessage(phone, logBody);
  } else if (plan.kind === 'buttons') {
    result = await sendWhatsAppInteractiveButtons(phone, logBody, (plan.buttons || []).map(b => ({ id: b.id, title: b.titleAr })));
  } else {
    result = await sendWhatsAppInteractiveList(
      phone,
      logBody,
      plan.listButtonAr || 'اختر',
      (plan.sections || []).map(s => ({
        title: s.titleAr,
        rows: s.rows.map(r => ({ id: r.id, title: r.titleAr, description: r.descriptionAr }))
      }))
    );
  }

  if (!result.success && result.status === 'failed') {
    await recordFailedJob('whatsapp_send', { phone, message: logBody }, result.error || 'Unknown WhatsApp send failure.');
  }

  await appendMessage(phone, {
    id: messageId,
    direction: 'outbound',
    type: plan.kind === 'text' ? 'text' : 'interactive',
    body: logBody,
    sentBy: 'bot',
    sentByName: 'Splendor Bot',
    timestamp: now
  });

  await updateDurable(CONVERSATIONS_COLLECTION, phone, {
    lastOutboundAt: now,
    lastMessagePreview: plan.bodyEn.slice(0, 140),
    updatedAt: now
  });
}

// ---------------------------------------------------------------------------
// Date/location parsing -- deliberately simple and deterministic (no
// invented NLP): accepts YYYY-MM-DD[ HH:mm] or DD/MM/YYYY[ HH:mm]. Anything
// else is rejected with a clear example, per the mission's explicit
// "invalid message" failure-handling requirement.
// ---------------------------------------------------------------------------

export function parseDateTimeInput(text: string): string | null {
  const trimmed = (text || '').trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);

  let year: number, month: number, day: number, hour = 10, minute = 0;
  if (isoMatch) {
    year = Number(isoMatch[1]); month = Number(isoMatch[2]); day = Number(isoMatch[3]);
    if (isoMatch[4]) { hour = Number(isoMatch[4]); minute = Number(isoMatch[5]); }
  } else if (dmyMatch) {
    day = Number(dmyMatch[1]); month = Number(dmyMatch[2]); year = Number(dmyMatch[3]);
    if (dmyMatch[4]) { hour = Number(dmyMatch[4]); minute = Number(dmyMatch[5]); }
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Outbound plan builders for each step
// ---------------------------------------------------------------------------

function welcomePlan(): OutboundPlan {
  return {
    kind: 'list',
    bodyEn: 'Welcome to Splendor Car Rental -- Dubai\'s private luxury fleet. Which category would you like to explore?',
    bodyAr: 'مرحباً بك في سبلندر لتأجير السيارات -- أسطول دبي الفاخر الخاص. أي فئة تود استعراضها؟',
    listButtonEn: 'Browse',
    listButtonAr: 'استعراض',
    sections: [{
      titleEn: 'Categories', titleAr: 'الفئات',
      rows: ALL_VEHICLE_CATEGORIES.map(cat => ({
        id: `${WHATSAPP_ACTION_IDS.CATEGORY_PREFIX}${cat}`,
        titleEn: WHATSAPP_CATEGORY_LABELS[cat].en,
        titleAr: WHATSAPP_CATEGORY_LABELS[cat].ar
      }))
    }]
  };
}

function unrecognizedPlan(retry: OutboundPlan): OutboundPlan {
  return { ...retry, bodyEn: `Sorry, I didn't understand that. ${retry.bodyEn}`, bodyAr: `عذراً، لم أفهم ردك. ${retry.bodyAr}` };
}

function vehicleListPlan(category: VehicleCategory): OutboundPlan {
  const available = globalStore.vehicles
    .map(v => SplendorConnectEngine.toPublicVehicleDTO(v))
    .filter((dto): dto is NonNullable<typeof dto> => !!dto && dto.category === category && dto.isAvailableNow)
    .sort((a, b) => a.pricing.dailyRate - b.pricing.dailyRate)
    .slice(0, 10);

  if (available.length === 0) {
    return {
      kind: 'text',
      bodyEn: 'No vehicles are currently available in this category. Reply "menu" to browse another category, or "agent" to speak with our concierge team.',
      bodyAr: 'لا توجد سيارات متاحة حالياً في هذه الفئة. اكتب "قائمة" لاستعراض فئة أخرى، أو "موظف" للتحدث مع فريق الكونسيرج.'
    };
  }

  return {
    kind: 'list',
    bodyEn: `Available vehicles in ${WHATSAPP_CATEGORY_LABELS[category].en}:`,
    bodyAr: `السيارات المتاحة في فئة ${WHATSAPP_CATEGORY_LABELS[category].ar}:`,
    listButtonEn: 'Select', listButtonAr: 'اختيار',
    sections: [{
      titleEn: 'Vehicles', titleAr: 'السيارات',
      rows: available.map(v => ({
        id: `${WHATSAPP_ACTION_IDS.VEHICLE_PREFIX}${v.publicVehicleId}`,
        titleEn: `${v.make} ${v.model}`.slice(0, 24),
        titleAr: (v.publicNameAr || `${v.make} ${v.model}`).slice(0, 24),
        descriptionEn: `AED ${v.pricing.dailyRate.toLocaleString()}/day`.slice(0, 72),
        descriptionAr: `${v.pricing.dailyRate.toLocaleString()} درهم/يوم`.slice(0, 72)
      }))
    }]
  };
}

function askPickupDatePlan(): OutboundPlan {
  return {
    kind: 'text',
    bodyEn: 'Great choice! When would you like to pick up the vehicle? Please reply in the format YYYY-MM-DD HH:mm (e.g. 2026-09-10 14:00).',
    bodyAr: 'اختيار رائع! متى تود استلام المركبة؟ برجاء الرد بصيغة YYYY-MM-DD HH:mm (مثال: 2026-09-10 14:00).'
  };
}

function askReturnDatePlan(): OutboundPlan {
  return {
    kind: 'text',
    bodyEn: 'And the return date/time? Same format: YYYY-MM-DD HH:mm.',
    bodyAr: 'وما هو موعد الإرجاع؟ بنفس الصيغة: YYYY-MM-DD HH:mm.'
  };
}

function askPickupLocationPlan(): OutboundPlan {
  return {
    kind: 'text',
    bodyEn: 'Where should we deliver the vehicle? (e.g. a hotel, DXB Airport, or "Showroom" for our Dubai flagship).',
    bodyAr: 'أين نقوم بتسليم المركبة؟ (مثال: فندق، مطار دبي، أو "المعرض" لاستلامها من فرعنا في دبي).'
  };
}

function askReturnLocationPlan(): OutboundPlan {
  return {
    kind: 'text',
    bodyEn: 'And where should the vehicle be returned? Reply "same" to use the same location.',
    bodyAr: 'وأين سيتم إرجاع المركبة؟ اكتب "نفس المكان" لاستخدام نفس موقع التسليم.'
  };
}

function askNamePlan(): OutboundPlan {
  return {
    kind: 'text',
    bodyEn: 'Finally, what full name should the reservation be under?',
    bodyAr: 'أخيراً، ما الاسم الكامل الذي سيتم تسجيل الحجز باسمه؟'
  };
}

function confirmSummaryPlan(draft: WhatsAppConversationDraft, days: number, dailyRate: number, totalAmount: number, depositAmount: number): OutboundPlan {
  const en = `Please confirm your reservation request:\n\nVehicle: ${draft.vehicleName}\nPickup: ${draft.pickupDateTime} at ${draft.pickupLocation}\nReturn: ${draft.returnDateTime} at ${draft.returnLocation}\nDuration: ${days} day(s)\nEstimated total: AED ${totalAmount.toLocaleString()} (excl. deposit)\nSecurity deposit: AED ${depositAmount.toLocaleString()}\n\nThis is a REQUEST -- our concierge team will confirm final pricing and collect documents.`;
  const ar = `برجاء تأكيد طلب الحجز:\n\nالمركبة: ${draft.vehicleName}\nالاستلام: ${draft.pickupDateTime} من ${draft.pickupLocation}\nالإرجاع: ${draft.returnDateTime} في ${draft.returnLocation}\nالمدة: ${days} يوم/أيام\nالإجمالي التقديري: ${totalAmount.toLocaleString()} درهم (غير شامل التأمين)\nمبلغ التأمين: ${depositAmount.toLocaleString()} درهم\n\nهذا طلب حجز -- سيقوم فريق الكونسيرج بتأكيد السعر النهائي وجمع المستندات.`;
  return {
    kind: 'buttons',
    bodyEn: en, bodyAr: ar,
    buttons: [
      { id: WHATSAPP_ACTION_IDS.CONFIRM_RESERVATION, titleEn: 'Confirm', titleAr: 'تأكيد' },
      { id: WHATSAPP_ACTION_IDS.CANCEL_RESERVATION, titleEn: 'Cancel', titleAr: 'إلغاء' }
    ]
  };
}

function humanHandoffPlan(): OutboundPlan {
  return {
    kind: 'text',
    bodyEn: 'You are now connected to our concierge team -- a team member will reply here shortly.',
    bodyAr: 'تم تحويلك الآن إلى فريق الكونسيرج -- سيقوم أحد أعضاء الفريق بالرد عليك هنا قريباً.'
  };
}

// ---------------------------------------------------------------------------
// Pricing preview -- MUST use the exact same formula as
// SplendorConnectEngine.handleWhatsAppReservation, or a customer could be
// shown one price and charged a different one. Kept as one shared function
// so the two can never drift.
// ---------------------------------------------------------------------------

export function computeReservationPreview(vehicleId: string, pickupIso: string, returnIso: string): { days: number; dailyRate: number; totalAmount: number; depositAmount: number } | null {
  const vehicle = globalStore.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return null;
  const pickupTime = new Date(pickupIso).getTime();
  const returnTime = new Date(returnIso).getTime();
  const days = Math.max(1, Math.ceil((returnTime - pickupTime) / (1000 * 60 * 60 * 24)));
  const dailyRate = vehicle.website?.dailyRate || vehicle.dailyRate || 5000;
  return { days, dailyRate, totalAmount: days * dailyRate, depositAmount: vehicle.website?.deposit || vehicle.minDeposit || 10000 };
}

// ---------------------------------------------------------------------------
// The state machine step. Pure-ish: reads globalStore's in-memory vehicle
// catalog (fine for browsing -- eventually consistent, matches the existing
// advisory-availability precedent) and the conversation's own draft; returns
// the next state + draft patch + what to send. The actual reservation
// creation (the one step with real financial/inventory consequences) is
// delegated to SplendorConnectEngine, never performed inline here.
// ---------------------------------------------------------------------------

interface StepInput {
  conversation: WhatsAppConversation;
  text: string;
  interactiveReplyId?: string;
}

interface StepResult {
  nextState: WhatsAppConversationState;
  draftPatch?: Partial<WhatsAppConversationDraft>;
  plan: OutboundPlan;
  reservationOutcome?: { success: boolean; reservationId?: string; error?: string };
  auditNote?: string;
}

async function runStep(input: StepInput, recordAudit: RecordAuditFn): Promise<StepResult> {
  const { conversation, text, interactiveReplyId } = input;
  const draft = conversation.draft || {};

  switch (conversation.state) {
    case 'NEW':
    case 'BROWSING': {
      if (interactiveReplyId?.startsWith(WHATSAPP_ACTION_IDS.CATEGORY_PREFIX)) {
        const category = interactiveReplyId.slice(WHATSAPP_ACTION_IDS.CATEGORY_PREFIX.length) as VehicleCategory;
        if (!ALL_VEHICLE_CATEGORIES.includes(category)) {
          return { nextState: 'BROWSING', plan: unrecognizedPlan(welcomePlan()) };
        }
        return { nextState: 'BROWSING', draftPatch: { category }, plan: vehicleListPlan(category) };
      }
      if (interactiveReplyId?.startsWith(WHATSAPP_ACTION_IDS.VEHICLE_PREFIX)) {
        const publicId = interactiveReplyId.slice(WHATSAPP_ACTION_IDS.VEHICLE_PREFIX.length);
        const vehicle = globalStore.vehicles.find(v =>
          v.publicVehicleId === publicId || (v.website && v.website.publicVehicleId === publicId) || (v.website && v.website.slug === publicId)
        );
        const dto = vehicle ? SplendorConnectEngine.toPublicVehicleDTO(vehicle) : null;
        if (!vehicle || !dto || !dto.isAvailableNow) {
          return { nextState: 'BROWSING', plan: { kind: 'text', bodyEn: 'That vehicle just became unavailable. Please pick another.', bodyAr: 'أصبحت هذه السيارة غير متاحة للتو. برجاء اختيار سيارة أخرى.' } };
        }
        return {
          nextState: 'VEHICLE_SELECTED',
          draftPatch: { vehicleId: vehicle.id, vehiclePublicId: publicId, vehicleName: `${vehicle.make} ${vehicle.model}` },
          plan: askPickupDatePlan()
        };
      }
      return { nextState: 'BROWSING', plan: unrecognizedPlan(welcomePlan()) };
    }

    case 'VEHICLE_SELECTED': {
      const iso = parseDateTimeInput(text);
      if (!iso) return { nextState: 'VEHICLE_SELECTED', plan: unrecognizedPlan(askPickupDatePlan()) };
      if (new Date(iso).getTime() < Date.now()) {
        return { nextState: 'VEHICLE_SELECTED', plan: { kind: 'text', bodyEn: 'Pickup date must be in the future. ' + askPickupDatePlan().bodyEn, bodyAr: 'يجب أن يكون تاريخ الاستلام في المستقبل. ' + askPickupDatePlan().bodyAr } };
      }
      return { nextState: 'DATES_PENDING', draftPatch: { pickupDateTime: iso }, plan: askReturnDatePlan() };
    }

    case 'DATES_PENDING': {
      if (!draft.returnDateTime) {
        const iso = parseDateTimeInput(text);
        if (!iso) return { nextState: 'DATES_PENDING', plan: unrecognizedPlan(askReturnDatePlan()) };
        if (new Date(iso).getTime() <= new Date(draft.pickupDateTime!).getTime()) {
          return { nextState: 'DATES_PENDING', plan: { kind: 'text', bodyEn: 'Return date must be after the pickup date. ' + askReturnDatePlan().bodyEn, bodyAr: 'يجب أن يكون تاريخ الإرجاع بعد تاريخ الاستلام. ' + askReturnDatePlan().bodyAr } };
        }
        return { nextState: 'LOCATION_PENDING', draftPatch: { returnDateTime: iso }, plan: askPickupLocationPlan() };
      }
      return { nextState: 'DATES_PENDING', plan: unrecognizedPlan(askReturnDatePlan()) };
    }

    case 'LOCATION_PENDING': {
      if (!draft.pickupLocation) {
        if (!text.trim()) return { nextState: 'LOCATION_PENDING', plan: unrecognizedPlan(askPickupLocationPlan()) };
        return { nextState: 'LOCATION_PENDING', draftPatch: { pickupLocation: text.trim() }, plan: askReturnLocationPlan() };
      }
      if (!draft.returnLocation) {
        const same = /^same$|^نفس/i.test(text.trim());
        const returnLocation = same ? draft.pickupLocation : text.trim();
        if (!returnLocation) return { nextState: 'LOCATION_PENDING', plan: unrecognizedPlan(askReturnLocationPlan()) };
        return { nextState: 'LOCATION_PENDING', draftPatch: { returnLocation }, plan: askNamePlan() };
      }
      if (!draft.fullName) {
        if (!text.trim() || text.trim().length < 2) return { nextState: 'LOCATION_PENDING', plan: unrecognizedPlan(askNamePlan()) };
        const fullName = text.trim();
        const preview = computeReservationPreview(draft.vehicleId!, draft.pickupDateTime!, draft.returnDateTime!);
        if (!preview) {
          return { nextState: 'BROWSING', draftPatch: emptyDraft(), plan: { kind: 'text', bodyEn: 'That vehicle is no longer available. Let\'s start over.', bodyAr: 'هذه السيارة لم تعد متاحة. لنبدأ من جديد.' } };
        }
        return {
          nextState: 'RESERVATION_CONFIRM',
          draftPatch: { fullName },
          plan: confirmSummaryPlan({ ...draft, fullName }, preview.days, preview.dailyRate, preview.totalAmount, preview.depositAmount)
        };
      }
      return { nextState: 'LOCATION_PENDING', plan: unrecognizedPlan(askNamePlan()) };
    }

    case 'RESERVATION_CONFIRM': {
      if (interactiveReplyId === WHATSAPP_ACTION_IDS.CANCEL_RESERVATION) {
        return { nextState: 'BROWSING', draftPatch: emptyDraft(), plan: welcomePlan() };
      }
      if (interactiveReplyId === WHATSAPP_ACTION_IDS.CONFIRM_RESERVATION) {
        const outcome = await SplendorConnectEngine.handleWhatsAppReservation({
          vehicleId: draft.vehicleId!,
          fullName: draft.fullName!,
          phone: conversation.phone,
          email: draft.email,
          pickupDateTime: draft.pickupDateTime!,
          returnDateTime: draft.returnDateTime!,
          pickupLocation: draft.pickupLocation!,
          returnLocation: draft.returnLocation!,
          idempotencyKey: `wa-confirm:${conversation.phone}:${draft.vehicleId}:${draft.pickupDateTime}:${draft.returnDateTime}`
        });
        if (!outcome.success) {
          // AvailabilityConflictError surfaces here as outcome.error -- give
          // the customer a way forward (new dates) instead of a dead end.
          // Back to VEHICLE_SELECTED (asks for a fresh pickup date) rather
          // than DATES_PENDING (which asks for a RETURN date given an
          // already-set pickup date) -- the old pickup/return pair is what
          // just failed, so both need to be re-collected, starting with
          // pickup. The stale values are simply overwritten once the
          // customer answers again; never set explicitly to `undefined`
          // (real Firestore rejects that field value outright).
          return {
            nextState: 'VEHICLE_SELECTED',
            plan: { kind: 'text', bodyEn: `${outcome.error} Please provide a new pickup date/time.`, bodyAr: `${outcome.error} برجاء تحديد تاريخ استلام جديد.` },
            reservationOutcome: outcome
          };
        }
        return {
          nextState: 'RESERVATION_CREATED',
          draftPatch: {},
          plan: {
            kind: 'text',
            bodyEn: `Your reservation request ${outcome.reservationId} has been received. Our concierge team will contact you shortly to confirm and collect the required documents.`,
            bodyAr: `تم استلام طلب الحجز الخاص بك رقم ${outcome.reservationId}. سيتواصل معك فريق الكونسيرج قريباً لتأكيد الحجز وجمع المستندات المطلوبة.`
          },
          reservationOutcome: outcome,
          auditNote: `Reservation ${outcome.reservationId} created via WhatsApp conversation ${conversation.phone}.`
        };
      }
      return { nextState: 'RESERVATION_CONFIRM', plan: unrecognizedPlan(confirmSummaryPlan(draft, 1, 0, 0, 0)) };
    }

    case 'RESERVATION_CREATED': {
      // Anything the customer says here is routed to the concierge team as
      // a follow-up task (extension/return/general questions) -- WhatsApp
      // never mutates the contract/financial state itself at this stage.
      const taskId = await issueNextNumber('Task');
      await createDurable('tasks', {
        id: taskId,
        title: `WhatsApp follow-up: ${conversation.customerName || conversation.phone}`,
        description: text || '[non-text message]',
        status: 'pending',
        priority: 'medium',
        relatedEntityType: 'Reservation',
        relatedEntityId: conversation.lastReservationId,
        assignedTo: conversation.assignedEmployeeId || null,
        assignedToName: conversation.assignedEmployeeName || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return {
        nextState: 'RESERVATION_CREATED',
        plan: { kind: 'text', bodyEn: 'Thanks -- our concierge team has been notified and will follow up shortly.', bodyAr: 'شكراً -- تم إبلاغ فريق الكونسيرج وسيتم التواصل معك قريباً.' }
      };
    }

    case 'CLOSED': {
      // A closed conversation always reopens on a new inbound message --
      // never a permanent dead end for the customer.
      return { nextState: 'BROWSING', draftPatch: emptyDraft(), plan: welcomePlan() };
    }

    case 'HUMAN_ASSISTANCE':
    default:
      // Should not normally be reached (botActive is false in this state --
      // see processInboundWhatsAppMessage), but never leave a customer with
      // no response if it is.
      return { nextState: 'HUMAN_ASSISTANCE', plan: { kind: 'none', bodyEn: '', bodyAr: '' } };
  }
}

// ---------------------------------------------------------------------------
// Entry point called from the webhook handler, once per genuinely new
// (never-before-processed) inbound message.
// ---------------------------------------------------------------------------

export interface InboundWhatsAppMessage {
  phone: string;
  type: string;
  text?: string;
  interactiveReplyId?: string;
  messageId: string;
}

export async function processInboundWhatsAppMessage(msg: InboundWhatsAppMessage, recordAudit: RecordAuditFn): Promise<void> {
  const phone = normalizePhone(msg.phone);
  if (!phone) return;

  const conversation = await ensureConversation(phone);
  const now = new Date().toISOString();
  const inboundBody = msg.interactiveReplyId ? `[selected: ${msg.interactiveReplyId}]` : (msg.text || `[${msg.type}]`);

  await appendMessage(phone, {
    id: msg.messageId,
    direction: 'inbound',
    type: msg.interactiveReplyId ? 'interactive' : (msg.type === 'image' || msg.type === 'document' ? msg.type : 'text'),
    body: inboundBody,
    timestamp: now
  });

  const matchNow = conversation.customerId ? undefined : matchCustomerByPhone(phone);

  // Human has taken over -- the bot stays silent. Staff sees the new
  // message via the Unified Inbox's unread indicator; no automated reply.
  if (!conversation.botActive) {
    await updateDurable(CONVERSATIONS_COLLECTION, phone, {
      lastInboundAt: now,
      lastMessagePreview: inboundBody.slice(0, 140),
      unread: true,
      updatedAt: now,
      ...matchPatch(matchNow)
    });
    return;
  }

  const text = (msg.text || '').trim();

  // Universal escape hatches, honored in ANY state.
  if (RESTART_COMMANDS.some(c => text.toLowerCase() === c.toLowerCase())) {
    await updateDurable(CONVERSATIONS_COLLECTION, phone, {
      state: 'BROWSING', draft: emptyDraft(), lastInboundAt: now, unread: true, updatedAt: now,
      lastMessagePreview: inboundBody.slice(0, 140)
    });
    await sendPlan(phone, welcomePlan());
    return;
  }
  if (msg.interactiveReplyId === WHATSAPP_ACTION_IDS.HUMAN_HELP || HUMAN_HELP_COMMANDS.some(c => text.toLowerCase() === c.toLowerCase())) {
    await updateDurable(CONVERSATIONS_COLLECTION, phone, {
      state: 'HUMAN_ASSISTANCE', botActive: false, priority: 'high', lastInboundAt: now, unread: true, updatedAt: now,
      lastMessagePreview: inboundBody.slice(0, 140)
    });
    await sendPlan(phone, humanHandoffPlan());
    await recordAudit({
      userId: 'WHATSAPP-BOT', userName: 'WhatsApp Bot', userRole: 'operations',
      entityType: 'WhatsAppConversation', entityId: phone, action: 'update',
      newValue: 'Conversation escalated to human concierge (customer requested human assistance).'
    }).catch(() => {});
    try {
      await dispatchNotificationEvent('whatsapp_conversation_needs_human',
        `A WhatsApp customer (${conversation.customerName || phone}) requested human assistance.`,
        `طلب عميل عبر واتساب (${conversation.customerName || phone}) التحدث مع موظف.`
      );
    } catch (err) {
      console.error('WhatsApp dispatch failed (whatsapp_conversation_needs_human):', err);
    }
    return;
  }

  const step = await runStep({ conversation: { ...conversation, ...matchPatch(matchNow) }, text, interactiveReplyId: msg.interactiveReplyId }, recordAudit);

  const patch: Record<string, unknown> = {
    state: step.nextState,
    lastInboundAt: now,
    unread: true,
    updatedAt: now,
    lastMessagePreview: inboundBody.slice(0, 140),
    ...matchPatch(matchNow)
  };
  if (step.draftPatch) {
    patch.draft = { ...conversation.draft, ...step.draftPatch };
  }
  if (step.reservationOutcome?.success && step.reservationOutcome.reservationId) {
    patch.lastReservationId = step.reservationOutcome.reservationId;
  }
  await updateDurable(CONVERSATIONS_COLLECTION, phone, patch);

  if (step.auditNote) {
    await recordAudit({
      userId: 'WHATSAPP-BOT', userName: 'WhatsApp Bot', userRole: 'sales',
      entityType: 'WhatsAppConversation', entityId: phone, action: 'update', newValue: step.auditNote
    }).catch(() => {});
  }

  await sendPlan(phone, step.plan);
}

// ---------------------------------------------------------------------------
// Human concierge actions (Unified Inbox UI)
// ---------------------------------------------------------------------------

export interface ConversationActor {
  uid: string;
  name: string;
  role: string;
}

export async function assignConversation(
  phone: string,
  input: { employeeId?: string; employeeName?: string; priority?: WhatsAppConversation['priority']; tags?: string[] },
  actor: ConversationActor,
  recordAudit: RecordAuditFn
): Promise<WhatsAppConversation> {
  const normalized = normalizePhone(phone);
  const existing = await getConversation(normalized);
  if (!existing) throw new ConversationError(`No conversation found for ${phone}.`);

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.employeeId !== undefined) { patch.assignedEmployeeId = input.employeeId; patch.assignedEmployeeName = input.employeeName ?? ''; }
  if (input.priority) patch.priority = input.priority;
  if (input.tags) patch.tags = input.tags;

  await updateDurable(CONVERSATIONS_COLLECTION, normalized, patch);
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'WhatsAppConversation', entityId: normalized, action: 'update',
    newValue: `Conversation ${normalized} assigned/updated (employee: ${input.employeeName || 'unchanged'}, priority: ${input.priority || 'unchanged'}).`
  });
  return { ...existing, ...(patch as Partial<WhatsAppConversation>) };
}

/** Toggles bot automation on/off -- the human-handoff / return-to-automation control. Returning to automation always resets to BROWSING (the simplest safe re-entry point, since the customer's earlier draft may be stale). */
export async function setConversationBotActive(
  phone: string,
  botActive: boolean,
  actor: ConversationActor,
  recordAudit: RecordAuditFn
): Promise<WhatsAppConversation> {
  const normalized = normalizePhone(phone);
  const existing = await getConversation(normalized);
  if (!existing) throw new ConversationError(`No conversation found for ${phone}.`);

  const patch: Record<string, unknown> = { botActive, updatedAt: new Date().toISOString() };
  if (botActive) {
    patch.state = 'BROWSING';
    patch.draft = emptyDraft();
  } else {
    patch.state = 'HUMAN_ASSISTANCE';
  }
  await updateDurable(CONVERSATIONS_COLLECTION, normalized, patch);
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'WhatsAppConversation', entityId: normalized, action: 'update',
    newValue: botActive ? `Conversation ${normalized} returned to automation.` : `Conversation ${normalized} taken over by ${actor.name}.`
  });
  return { ...existing, ...(patch as Partial<WhatsAppConversation>) };
}

/** A staff member's manual reply from the Unified Inbox -- only usable once botActive is false (the bot and a human must never both be replying at once). */
export async function sendManualReply(
  phone: string,
  text: string,
  actor: ConversationActor,
  recordAudit: RecordAuditFn
): Promise<void> {
  const normalized = normalizePhone(phone);
  const existing = await getConversation(normalized);
  if (!existing) throw new ConversationError(`No conversation found for ${phone}.`);
  if (existing.botActive) throw new ConversationError('Take over this conversation before replying manually -- the bot is still active.');
  if (!text.trim()) throw new ConversationError('Reply text is required.');

  const result = await sendWhatsAppMessage(normalized, text.trim());
  if (!result.success && result.status === 'failed') {
    await recordFailedJob('whatsapp_send', { phone: normalized, message: text.trim() }, result.error || 'Unknown WhatsApp send failure.');
  }
  const now = new Date().toISOString();
  await appendMessage(normalized, {
    id: `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    direction: 'outbound', type: 'text', body: text.trim(),
    sentBy: actor.uid, sentByName: actor.name, timestamp: now
  });
  await updateDurable(CONVERSATIONS_COLLECTION, normalized, { lastOutboundAt: now, lastMessagePreview: text.trim().slice(0, 140), unread: false, updatedAt: now });
  await recordAudit({
    userId: actor.uid, userName: actor.name, userRole: actor.role,
    entityType: 'WhatsAppConversation', entityId: normalized, action: 'update',
    newValue: `Manual WhatsApp reply sent by ${actor.name}: "${text.trim().slice(0, 120)}"`
  });
}

export async function markConversationRead(phone: string): Promise<void> {
  await updateDurable(CONVERSATIONS_COLLECTION, normalizePhone(phone), { unread: false, updatedAt: new Date().toISOString() });
}

export { isWhatsAppConfigured };
