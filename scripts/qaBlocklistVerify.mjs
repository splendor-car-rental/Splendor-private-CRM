import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const SHOTS = '/tmp/claude-0/-home-user-Splendor-private-CRM/08cde651-1d17-541c-bc56-1938b08a8ff2/scratchpad';
const results = [];

function log(msg) { console.log(`[verify] ${msg}`); }
function record(name, ok, detail) { results.push({ name, ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} -- ${name}${detail ? ': ' + detail : ''}`); }

async function login(page, email, password) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('nav', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function gotoSecurity(page) {
  await page.locator('a, button', { hasText: /Security & Blocklist|الأمان والقائمة/i }).first().click({ timeout: 10000 });
  await page.waitForSelector('text=/Security & Blocklist|الأمن والقائمة المحظورة/', { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`[pageerror] ${e.message}`));

  const uid = `${Date.now()}`.slice(-9);
  const eidValue = `784-1985-${uid}-1`;

  // === Part 1: Operations creates a FULL block ===
  log('Logging in as QA Operations...');
  await login(page, 'qa-ops@splendor.test', 'Passw0rd!');
  await page.screenshot({ path: `${SHOTS}/01_dashboard.png` });

  await gotoSecurity(page);
  await page.screenshot({ path: `${SHOTS}/02_security_empty.png` });

  log('Opening New Block modal...');
  await page.locator('button', { hasText: /New Block|حظر جديد/i }).click();
  await page.waitForSelector('text=/Identifier type|نوع المعرّف/', { timeout: 5000 });

  const modal = page.locator('form').filter({ has: page.locator('text=/Identifier type|نوع المعرّف/') });
  // Identifier type stays Emirates ID (default). Fill value + reason, tier=full (default).
  await modal.locator('input[type="text"], input:not([type])').first().fill(eidValue);
  await modal.locator('textarea').fill('QA verification: known fraud case, full block test.');
  await page.screenshot({ path: `${SHOTS}/03_new_block_filled.png` });
  await modal.locator('button[type="submit"]', { hasText: /Create|إنشاء/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/04_after_create.png` });

  const entryVisible = await page.locator(`text=${eidValue}`).first().isVisible().catch(() => false);
  record('Full block entry appears in list after creation', entryVisible, eidValue);

  // === Part 2: proactive check at customer creation (RULE-B03) ===
  log('Navigating to Customers to attempt registering the blocked identity...');
  await page.locator('button', { hasText: /Customers|العملاء/i }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/05_customers_view.png` });

  const addCustomerBtn = page.locator('button', { hasText: /Register Customer|تسجيل عميل جديد/i }).first();
  const hasAddBtn = await addCustomerBtn.isVisible().catch(() => false);
  record('Add-customer entry point found', hasAddBtn);

  if (hasAddBtn) {
    await addCustomerBtn.click();
    await page.waitForTimeout(500);
    const custModal = page.locator('form').filter({ has: page.locator('text=/Emirates ID.*Passport/i') });
    await page.screenshot({ path: `${SHOTS}/06_new_customer_modal.png` });

    // Fill required fields: name, email, phone, and the Emirates ID/Passport
    // field with the SAME identifier value just fully blocked above.
    await custModal.locator('label', { hasText: /Full Legal Name/i }).locator('xpath=following-sibling::input[1]').fill('QA Blocked Test Customer');
    await custModal.locator('label', { hasText: /Email Address/i }).locator('xpath=following-sibling::input[1]').fill(`qa-blocked-${uid}@example.test`);
    await custModal.locator('label', { hasText: /Phone Number/i }).locator('xpath=following-sibling::input[1]').fill(`+971 50 ${uid}`);
    await custModal.locator('label', { hasText: /Emirates ID.*Passport/i }).locator('xpath=following-sibling::input[1]').fill(eidValue);
    await page.screenshot({ path: `${SHOTS}/07_new_customer_filled.png` });

    const submitBtn = custModal.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/08_after_customer_submit.png` });

    const bodyText = await page.locator('body').innerText();
    const rejected = /block|حظر|denied|rejected/i.test(bodyText) || await page.locator('text=/block|حظر/i').first().isVisible().catch(() => false);
    record('Customer creation blocked / warned for full-blocked identity (RULE-B03)', rejected, bodyText.slice(0, 300));
  }

  // Dismiss the "Customer Creation Failed" alert dialog left open by the
  // rejected submission above, which otherwise intercepts subsequent clicks.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  const okBtn = page.locator('button', { hasText: /^OK$|موافق/i }).first();
  if (await okBtn.isVisible().catch(() => false)) await okBtn.click();
  await page.waitForTimeout(300);

  // === Part 3: request unblock (as Operations, the maker) ===
  log('Navigating back to Security & Blocklist to request an unblock...');
  await page.locator('button', { hasText: /Security & Blocklist|الأمن والقائمة/i }).first().click({ force: true });
  await page.waitForTimeout(800);
  const entryCard = page.locator('p', { hasText: eidValue }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await entryCard.locator('button', { hasText: /Request unblock/i }).click();
  await page.waitForSelector('text=/Reason for requesting removal/i', { timeout: 5000 });
  const unblockModal = page.locator('form').filter({ has: page.locator('text=/Reason for requesting removal/i') });
  await unblockModal.locator('textarea').fill('QA verification: case resolved, requesting removal.');
  await unblockModal.locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/09_unblock_requested.png` });

  const pendingSectionVisible = await page.locator('text=/Pending unblock requests/i').isVisible().catch(() => false);
  record('Pending unblock request appears in inbox', pendingSectionVisible);

  // Operations is the maker AND is not a decider role (only ceo/admin are) --
  // so it must see NO approve/reject controls at all on this pending request,
  // just the informational "pending" state. (The "awaiting a different
  // approver" notice is reserved for a decider role who happens to be the
  // requester -- e.g. an Admin requesting their own unblock -- which this
  // Operations-initiated case does not exercise.)
  const opsSeesApproveButton = await page.locator('button[title="Approve"]').isVisible().catch(() => false);
  record('Maker (non-decider role) has no approve/reject controls on own request', !opsSeesApproveButton);
  await page.screenshot({ path: `${SHOTS}/10_ops_own_request_view.png` });

  // === Part 4: a DIFFERENT authorized user (CEO) approves the unblock ===
  log('Logging in as QA CEO in a fresh session to approve the unblock...');
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await login(page2, 'qa-ceo@splendor.test', 'Passw0rd!');
  await page2.locator('button', { hasText: /Security & Blocklist|الأمن والقائمة/i }).first().click();
  await page2.waitForTimeout(800);
  await page2.screenshot({ path: `${SHOTS}/11_ceo_pending_approvals.png` });

  const approveBtn = page2.locator('button[title="Approve"]').first();
  const approveVisible = await approveBtn.isVisible().catch(() => false);
  record('CEO (different user) sees Approve control on the pending request', approveVisible);

  if (approveVisible) {
    page2.once('dialog', d => d.accept('QA verification: case confirmed resolved, approving removal.'));
    await approveBtn.click();
    await page2.waitForTimeout(1500);
    await page2.screenshot({ path: `${SHOTS}/12_after_approval.png` });
    const removedBadgeVisible = await page2.locator('text=/Removed/i').first().isVisible().catch(() => false);
    record('Entry shows as Removed after CEO approval', removedBadgeVisible);
  }

  await ctx2.close();
  await browser.close();

  const failed = results.filter(r => !r.ok);
  log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
  for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
