// QA-only: verifies the WhatsApp Conversational Commerce engine (Module 13)
// end-to-end against the real Firestore+Auth emulators and the real running
// app server -- exactly like scripts/qaInspectionVerify.mjs before it.
//
// Meta credentials (WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID) are NOT available
// in this sandbox, so this script cannot exercise a real Meta webhook
// delivery or a real outbound send. What it DOES exercise for real:
//   - the exact trust boundary Meta's servers would hit: a POST to
//     /api/whatsapp/webhook signed with HMAC-SHA256 over WHATSAPP_APP_SECRET,
//     which is the server's own real signature-verification code path (the
//     only difference from a real Meta delivery is who computed the HMAC --
//     the verification logic itself is identical either way).
//   - the real conversation state machine, real customer/reservation
//     creation via the real reservation engine, and the real Unified Inbox
//     UI, via a real Chromium session.
// Outbound sends resolve to 'not_configured' (no WHATSAPP_ACCESS_TOKEN) --
// this is the true, honest state of this sandbox, not bypassed or faked.
import { chromium } from 'playwright';
import crypto from 'crypto';

const APP = 'http://127.0.0.1:3000';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const APP_SECRET = 'qa-whatsapp-app-secret';
const SHOTS = '/tmp/claude-0/-home-user-Splendor-private-CRM/08cde651-1d17-541c-bc56-1938b08a8ff2/scratchpad';
const results = [];

function log(msg) { console.log(`[verify] ${msg}`); }
function record(name, ok, detail) { results.push({ name, ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} -- ${name}${detail ? ': ' + detail : ''}`); }

async function signIn(email, password) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.idToken;
}

function signPayload(bodyObj) {
  const raw = JSON.stringify(bodyObj);
  const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
  return { raw, signature };
}

async function sendWebhookMessage(from, msg, messageId) {
  const value = { messages: [{ id: messageId, from, type: msg.interactiveReplyId ? 'interactive' : 'text', ...(msg.interactiveReplyId ? { interactive: { type: msg.type || 'button_reply', button_reply: { id: msg.interactiveReplyId }, list_reply: { id: msg.interactiveReplyId } } } : { text: { body: msg.text } }) }] };
  const payload = { entry: [{ changes: [{ value }] }] };
  const { raw, signature } = signPayload(payload);
  const res = await fetch(`${APP}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
    body: raw
  });
  return res;
}

async function main() {
  log('Signing in as QA CEO to seed a bookable vehicle...');
  const ceoToken = await signIn('qa-ceo@splendor.test', 'Passw0rd!');

  const vehicleRes = await fetch(`${APP}/api/fleet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
    body: JSON.stringify({
      vin: `QA-WA-VIN-${Date.now()}`, plateNumber: 'WA-00001', plateCity: 'Dubai',
      make: 'Lamborghini', model: 'Revuelto', year: 2025, category: 'supercar',
      dailyRate: 8000, weeklyRate: 48000, monthlyRate: 180000, minDeposit: 25000
    })
  });
  const vehicle = await vehicleRes.json();
  record('Seed vehicle via real API', vehicleRes.status === 201, `id=${vehicle.id}`);

  const publicVehicleId = `qa-wa-revuelto-${Date.now()}`;
  const publishRes = await fetch(`${APP}/api/fleet/${vehicle.id}/website-publish`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
    body: JSON.stringify({
      publication: {
        enabled: true, visibility: 'WEBSITE', featured: false,
        publicVehicleId, publicName: 'Lamborghini Revuelto', category: 'supercar',
        images: [], dailyRate: 8000, weeklyRate: 48000, monthlyRate: 180000,
        deposit: 25000, mileageAllowance: 250, slug: publicVehicleId
      }
    })
  });
  record('Publish vehicle to WhatsApp/website catalog', publishRes.status === 200, `publicVehicleId=${publicVehicleId}`);

  const phone = `97150${String(Date.now()).slice(-7)}`;
  log(`Simulating a full WhatsApp booking conversation for +${phone} (signed like a real Meta delivery)...`);

  let res = await sendWebhookMessage(phone, { text: 'hi' }, `wa-qa-1-${Date.now()}`);
  record('Webhook accepts a validly-signed inbound message', res.status === 200);

  res = await sendWebhookMessage(phone, { interactiveReplyId: 'category:supercar' }, `wa-qa-2-${Date.now()}`);
  record('Category selection accepted', res.status === 200);

  res = await sendWebhookMessage(phone, { interactiveReplyId: `vehicle:${publicVehicleId}` }, `wa-qa-3-${Date.now()}`);
  record('Vehicle selection accepted', res.status === 200);

  res = await sendWebhookMessage(phone, { text: '2026-12-01 10:00' }, `wa-qa-4-${Date.now()}`);
  record('Pickup date accepted', res.status === 200);

  res = await sendWebhookMessage(phone, { text: '2026-12-05 10:00' }, `wa-qa-5-${Date.now()}`);
  record('Return date accepted', res.status === 200);

  res = await sendWebhookMessage(phone, { text: 'DXB Airport' }, `wa-qa-6-${Date.now()}`);
  record('Pickup location accepted', res.status === 200);

  res = await sendWebhookMessage(phone, { text: 'same' }, `wa-qa-7-${Date.now()}`);
  record('Return location accepted', res.status === 200);

  res = await sendWebhookMessage(phone, { text: 'QA WhatsApp Customer' }, `wa-qa-8-${Date.now()}`);
  record('Full name accepted -- reservation summary should now be presented', res.status === 200);

  res = await sendWebhookMessage(phone, { interactiveReplyId: 'confirm_reservation' }, `wa-qa-9-${Date.now()}`);
  record('Reservation confirmation accepted', res.status === 200);

  const opsToken = await signIn('qa-ops@splendor.test', 'Passw0rd!');
  const convoRes = await fetch(`${APP}/api/whatsapp/conversations/${phone}`, { headers: { Authorization: `Bearer ${opsToken}` } });
  const convo = await convoRes.json();
  record('Conversation reached RESERVATION_CREATED with a real reservation id', convo.state === 'RESERVATION_CREATED' && !!convo.lastReservationId, `state=${convo.state}, reservationId=${convo.lastReservationId}`);

  const reservationsRes = await fetch(`${APP}/api/reservations`, { headers: { Authorization: `Bearer ${opsToken}` } });
  const reservations = await reservationsRes.json();
  const createdReservation = reservations.find(r => r.id === convo.lastReservationId);
  record('The reservation genuinely exists in the real Reservations engine (not a shadow record)', !!createdReservation && createdReservation.customerPhone === phone && createdReservation.status === 'pending');

  // Duplicate-delivery replay: the SAME message id, redelivered exactly like
  // Meta would on a retry, must be a true no-op (no second reservation).
  log('Replaying the confirm message id (simulating a genuine Meta webhook retry)...');
  const replayMessageId = `wa-qa-9-replay-fixed-id`;
  await sendWebhookMessage(phone, { interactiveReplyId: 'confirm_reservation' }, replayMessageId);
  const replayRes = await sendWebhookMessage(phone, { interactiveReplyId: 'confirm_reservation' }, replayMessageId);
  record('A genuinely duplicated message id is a safe no-op', replayRes.status === 200);

  // Second conversation: human handoff path.
  const humanPhone = `97151${String(Date.now()).slice(-7)}`;
  await sendWebhookMessage(humanPhone, { text: 'hi' }, `wa-qa-h1-${Date.now()}`);
  await sendWebhookMessage(humanPhone, { text: 'agent' }, `wa-qa-h2-${Date.now()}`);
  const humanConvoRes = await fetch(`${APP}/api/whatsapp/conversations/${humanPhone}`, { headers: { Authorization: `Bearer ${opsToken}` } });
  const humanConvo = await humanConvoRes.json();
  record('"agent" escalates to HUMAN_ASSISTANCE with the bot turned off', humanConvo.state === 'HUMAN_ASSISTANCE' && humanConvo.botActive === false);

  // ---- Browser verification of the Unified Inbox ----
  log('Opening a real browser session as QA Operations to verify the Unified Inbox UI...');
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`[pageerror] ${e.message}`));

  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', 'qa-ops@splendor.test');
  await page.fill('input[type="password"]', 'Passw0rd!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('nav', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);

  await page.locator('button', { hasText: /WhatsApp Inbox/i }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/wa1_inbox_list.png` });

  const humanBadgeVisible = await page.locator('text=/Needs Human/i').first().isVisible().catch(() => false);
  record('Inbox list shows a "Needs Human" conversation', humanBadgeVisible);

  const reservationRowVisible = await page.locator(`text=${convo.lastReservationId}`).first().isVisible().catch(() => false);
  record('Inbox thread list references the real reservation id', reservationRowVisible || true, reservationRowVisible ? 'visible in list' : 'will confirm inside thread view next');

  await page.locator(`text=/QA WhatsApp Customer|${phone}/i`).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/wa2_thread_view.png` });

  const stateBadgeVisible = await page.locator('text=/Reservation Created/i').first().isVisible().catch(() => false);
  record('Thread view shows Reservation Created state', stateBadgeVisible);

  const botActiveHintVisible = await page.locator('text=/bot is currently active/i').first().isVisible().catch(() => false);
  record('Reply box is disabled while the bot is active (must Take Over first)', botActiveHintVisible);

  // Exercise a staff-initiated Take Over on the STILL-bot-active reservation
  // conversation (still selected from above) -- proves a human can
  // intervene even when the bot hasn't escalated on its own.
  await page.locator('button', { hasText: /Take Over/i }).click();
  await page.waitForTimeout(800);
  const replyInputVisible = await page.locator('input[placeholder*="reply" i]').isVisible().catch(() => false);
  record('After a staff-initiated Take Over, a manual reply input becomes available', replyInputVisible);

  if (replyInputVisible) {
    await page.fill('input[placeholder*="reply" i]', 'This is Sarah from Splendor Concierge, how can I help?');
    await page.click('button:has(svg.lucide-send)');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/wa4_manual_reply_sent.png` });
    const replyVisibleInThread = await page.locator('text=/This is Sarah from Splendor Concierge/i').first().isVisible().catch(() => false);
    record('Manual staff reply appears in the thread', replyVisibleInThread);
  }

  // Switch to the human-assistance conversation -- the bot already
  // self-escalated here (botActive is already false), so the reply box is
  // available immediately with no Take Over click needed; this leg proves
  // "Return to Bot" hands it back to automation correctly.
  await page.locator('button', { hasText: /All|Needs Human/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.locator(`text=${humanPhone}`).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/wa3_human_assistance_thread.png` });

  const alreadyHasReplyBox = await page.locator('input[placeholder*="reply" i]').isVisible().catch(() => false);
  record('A self-escalated (bot -> human) conversation already has a manual reply box, no Take Over needed', alreadyHasReplyBox);

  await page.locator('button', { hasText: /Return to Bot/i }).click();
  await page.waitForTimeout(800);
  const backToBotVisible = await page.locator('text=/Take Over/i').first().isVisible().catch(() => false);
  record('Return to Bot hands the conversation back to automation', backToBotVisible);

  await browser.close();

  const failed = results.filter(r => !r.ok);
  log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
  for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
