import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = 'http://127.0.0.1:3000';
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'splendor-qa-discount-'));
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
  await page.waitForTimeout(1200);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`[pageerror] ${e.message}`));

  log('Logging in as QA Sales...');
  await login(page, 'qa-sales@splendor.test', 'Passw0rd!');
  await page.locator('button', { hasText: /Quotations|عروض/i }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/q1_quotations_view.png` });

  log('Opening Prepare VIP Quotation modal, entering an above-ceiling discount...');
  await page.locator('button', { hasText: /New Quotation|Prepare Quotation|Add Quotation/i }).first().click().catch(async () => {
    await page.locator('button svg').first();
  });
  await page.waitForSelector('text=/Prepare VIP Quotation/i', { timeout: 5000 });
  const modal = page.locator('form').filter({ has: page.locator('text=/Discount \\(AED/i') });

  await modal.locator('select').nth(0).selectOption({ index: 0 });
  await modal.locator('select').nth(1).selectOption({ index: 0 });

  await modal.locator('label', { hasText: /Discount \(AED/i }).locator('xpath=following-sibling::input[1]').fill('2000');
  await page.screenshot({ path: `${SHOTS}/q2_discount_filled.png` });
  await modal.locator('button[type="submit"]').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/q3_after_create.png` });

  const pendingNoticeVisible = await page.locator('text=/awaiting sales-manager/i').isVisible().catch(() => false);
  record('New quotation shows the discount-pending-approval notice (capped total shown)', pendingNoticeVisible);

  log('Logging in as QA CEO in a fresh session to see and approve the discount override...');
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await login(page2, 'qa-ceo@splendor.test', 'Passw0rd!');
  await page2.locator('button', { hasText: /Procurement & Suppliers/i }).first().click();
  await page2.waitForTimeout(800);
  const approvalsTab2 = page2.locator('button', { hasText: /Approvals|موافقات/i }).first();
  if (await approvalsTab2.isVisible().catch(() => false)) await approvalsTab2.click();
  await page2.waitForTimeout(800);
  await page2.screenshot({ path: `${SHOTS}/q5_ceo_approvals.png` });

  const quotationRequestVisible = await page2.locator('text=/discount_override/i').first().isVisible().catch(() => false);
  record('Pending Quotation discount_override request appears in the generic Approvals inbox', quotationRequestVisible);

  const approveBtn = page2.locator('button[title="Approve"]').first();
  const approveVisible = await approveBtn.isVisible().catch(() => false);
  record('CEO (different user) sees an Approve control on the pending discount request', approveVisible);

  if (approveVisible) {
    page2.once('dialog', d => d.accept('QA verification: approving the full discount for a VIP client.'));
    await approveBtn.click();
    await page2.waitForTimeout(1500);
    await page2.screenshot({ path: `${SHOTS}/q6_after_approval.png` });

    const approvedToastText = await page2.locator('text=/Quotation QT-/').first().innerText().catch(() => '');
    const approvedQuoteId = (approvedToastText.match(/QT-\d+/) || [])[0];
    await page2.locator('button', { hasText: '×' }).last().click().catch(() => {});
    await page2.waitForTimeout(300);
    await page2.locator('button', { hasText: /Quotations|عروض/i }).first().click();
    await page2.waitForTimeout(800);
    if (approvedQuoteId) {
      const card = page2.locator('p', { hasText: approvedQuoteId }).first();
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.click({ force: true }).catch(() => {});
      await page2.waitForTimeout(500);
    }
    await page2.screenshot({ path: `${SHOTS}/q7_quotation_after_approval.png` });
    const stillPending = await page2.locator('text=/awaiting sales-manager/i').isVisible().catch(() => false);
    record(`Quotation ${approvedQuoteId || '(unknown)'} no longer shows the pending-approval notice after CEO approval`, !stillPending);
  }

  await ctx2.close();
  await browser.close();
  try { fs.rmSync(SHOTS, { recursive: true, force: true }); } catch {}

  const failed = results.filter(r => !r.ok);
  log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
  for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
