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
  await page.waitForTimeout(1200);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`[pageerror] ${e.message}`));

  log('Logging in as QA CEO...');
  await login(page, 'qa-ceo@splendor.test', 'Passw0rd!');
  await page.locator('button', { hasText: /Fleet/i }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/m1_fleet_view.png` });

  log('Opening the vehicle detail modal...');
  await page.locator('text=/Ferrari|SF90/i').first().click();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: /Schedule/i }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/m2_schedule_tab.png` });

  const optimalBadgeVisible = await page.locator('text=/Optimal/i').isVisible().catch(() => false);
  record('New vehicle starts with an Optimal maintenance badge', optimalBadgeVisible);

  log('Starting maintenance...');
  await page.locator('button', { hasText: /Start Maintenance/i }).first().click();
  await page.waitForSelector('text=/becomes unavailable for new bookings/i', { timeout: 5000 });
  await page.locator('textarea').fill('Scheduled 7,000 km oil & filter service');
  await page.screenshot({ path: `${SHOTS}/m3_start_maintenance_modal.png` });
  await page.locator('button[type="submit"]', { hasText: /Start Maintenance/i }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/m4_in_service.png` });

  const inServiceVisible = await page.locator('text=/In Service Now/i').isVisible().catch(() => false);
  record('Vehicle shows "In Service Now" after starting maintenance', inServiceVisible);

  const maintenanceStatusChip = await page.locator('text=/^MAINTENANCE$/i').first().isVisible().catch(() => false);
  record('Vehicle detail header shows its overall status as MAINTENANCE', maintenanceStatusChip);

  log('Logging the completed service (modal is still open on the Schedule tab)...');
  await page.locator('button', { hasText: /Log Completed Service/i }).first().click();
  await page.waitForSelector('text=/Odometer at service/i', { timeout: 5000 });
  await page.locator('textarea').fill('Oil, filter, and brake pads replaced');
  await page.screenshot({ path: `${SHOTS}/m5_log_maintenance_modal.png` });
  await page.locator('button[type="submit"]', { hasText: /Log Completed/i }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/m6_after_log.png` });

  const backToOptimal = await page.locator('text=/Optimal/i').isVisible().catch(() => false);
  record('Vehicle returns to Optimal after logging the completed service', backToOptimal);

  await browser.close();

  const failed = results.filter(r => !r.ok);
  log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
  for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
