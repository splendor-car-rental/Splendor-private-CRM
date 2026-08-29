// Dispatch + automated monitoring engine for the Notification & WhatsApp
// Control Center. Two entry points used by server.ts:
//
//   dispatchNotificationEvent(eventKey, ...)  -- called inline, right after
//     a real action happens (a contract is created, a payment is recorded,
//     etc.) -- the "manual trigger" half of the spec's dual mechanism.
//
//   runNotificationChecks()  -- a sweep over expiries/deadlines/unmatched
//     items, meant to run on a schedule (see vercel.json's cron entry
//     hitting POST/GET /api/notifications/run-checks) -- the "automated
//     background monitoring" half.
//
// Both funnel through the same recipient-resolution + WhatsApp-send +
// message-log logic, so every event behaves identically regardless of how
// it was triggered.

import { globalStore } from './dataStore';
import { sendWhatsAppMessage, getWhatsAppGroupRecipients } from './whatsapp';
import { getRuleValue } from './businessRules';
import { recordFailedJob, markAllAlerted, getDeadLetterCache, retryFailedJob } from './deadLetterQueue';
import { checkOperationalHealth, recordBackgroundJobRun } from './operationalHealth';

/** True when the Phase 23.4 emergency kill switch for WhatsApp outbound messaging is tripped. */
function whatsappOutboundSuspended(): boolean {
  return getRuleValue('killSwitch.whatsappOutbound', false);
}

function nextLogId(): string {
  return `WA-${String(globalStore.whatsappMessageLog.length + 1).padStart(6, '0')}`;
}

/**
 * Sends one logical notification for `eventKey` to whoever it's currently
 * configured to reach (group + specific staff), and records one
 * WhatsAppMessageLogEntry per recipient. No-ops silently (no log entries at
 * all) if the event is disabled or has zero recipients configured yet --
 * an event with nobody assigned is not an error, just not wired up yet.
 */
export async function dispatchNotificationEvent(eventKey: string, messageEn: string, messageAr: string, reminderId?: string): Promise<void> {
  if (whatsappOutboundSuspended()) {
    console.warn(`[notificationEngine] WhatsApp outbound suspended by emergency kill switch -- skipped event "${eventKey}".`);
    return;
  }
  const config = globalStore.notificationEventConfigs.find(c => c.eventKey === eventKey);
  if (!config || !config.enabled) return;

  const recipients: { phone: string; label: string; type: 'group' | 'staff' }[] = [];

  if (config.broadcastToGroup) {
    getWhatsAppGroupRecipients().forEach(phone => recipients.push({ phone, label: 'General WhatsApp Group', type: 'group' }));
  }
  (config.staffRecipientIds || []).forEach(staffId => {
    const staff = globalStore.users.find(u => u.id === staffId);
    if (staff?.phone) recipients.push({ phone: staff.phone, label: staff.name, type: 'staff' });
  });

  if (recipients.length === 0) return;

  const text = `${messageAr}\n\n${messageEn}`;

  for (const r of recipients) {
    const result = await sendWhatsAppMessage(r.phone, text);
    globalStore.whatsappMessageLog.unshift({
      id: nextLogId(),
      eventKey,
      reminderId,
      recipientType: r.type,
      recipientLabel: r.label,
      recipientPhone: r.phone,
      message: text,
      status: result.status,
      errorMessage: result.error,
      createdAt: new Date().toISOString()
    });
    if (result.status === 'failed') {
      await recordFailedJob('whatsapp_send', { phone: r.phone, message: text, eventKey, recipientLabel: r.label }, result.error || 'Unknown WhatsApp send failure.');
    }
  }

  // Cap the in-memory log so a chatty event can't grow this unboundedly
  // across a long-running process.
  if (globalStore.whatsappMessageLog.length > 500) {
    globalStore.whatsappMessageLog.length = 500;
  }
}

/**
 * Sends a one-off admin-authored reminder (the "manual custom-reminder
 * creator" from the spec), bypassing the per-event enabled/disabled toggle
 * entirely -- a custom reminder is deliberate by definition. Returns the
 * overall status to store on the CustomReminder record itself.
 */
export async function dispatchCustomReminder(reminderId: string, title: string, message: string, broadcastToGroup: boolean, staffRecipientIds: string[]): Promise<'sent' | 'partially_sent' | 'failed' | 'not_configured'> {
  if (whatsappOutboundSuspended()) {
    console.warn(`[notificationEngine] WhatsApp outbound suspended by emergency kill switch -- skipped custom reminder "${reminderId}".`);
    return 'failed';
  }
  const recipients: { phone: string; label: string; type: 'group' | 'staff' }[] = [];
  if (broadcastToGroup) {
    getWhatsAppGroupRecipients().forEach(phone => recipients.push({ phone, label: 'General WhatsApp Group', type: 'group' }));
  }
  staffRecipientIds.forEach(staffId => {
    const staff = globalStore.users.find(u => u.id === staffId);
    if (staff?.phone) recipients.push({ phone: staff.phone, label: staff.name, type: 'staff' });
  });

  if (recipients.length === 0) return 'failed';

  const text = `📢 ${title}\n\n${message}`;
  let sentCount = 0;
  let notConfiguredCount = 0;

  for (const r of recipients) {
    const result = await sendWhatsAppMessage(r.phone, text);
    if (result.status === 'sent') sentCount++;
    if (result.status === 'not_configured') notConfiguredCount++;
    globalStore.whatsappMessageLog.unshift({
      id: nextLogId(),
      reminderId,
      recipientType: r.type,
      recipientLabel: r.label,
      recipientPhone: r.phone,
      message: text,
      status: result.status,
      errorMessage: result.error,
      createdAt: new Date().toISOString()
    });
    if (result.status === 'failed') {
      await recordFailedJob('whatsapp_send', { phone: r.phone, message: text, reminderId, recipientLabel: r.label }, result.error || 'Unknown WhatsApp send failure.');
    }
  }

  if (notConfiguredCount === recipients.length) return 'not_configured';
  if (sentCount === recipients.length) return 'sent';
  if (sentCount > 0) return 'partially_sent';
  return 'failed';
}

/**
 * Sends a WhatsApp message directly to a customer (Salik/fine charge
 * notices, payment receipts, payment due/overdue reminders, contract
 * expiring/extended notices). Gated on the per-event
 * CustomerNotificationConfig toggle; a customer with no phone on file is
 * still logged (status 'failed') so it's visible in the Control Center
 * activity log rather than silently dropped.
 *
 * `language`, when supplied, sends ONLY that language's text -- no
 * bilingual concatenation -- for callers (Lease-to-Own) that must send a
 * message fully in one language with zero mixing. Every existing call site
 * omits it and keeps the original bilingual (Arabic-then-English) message
 * exactly as before -- fully backward compatible.
 */
export async function dispatchCustomerNotification(eventKey: string, customerId: string, customerName: string, customerPhone: string | undefined, messageEn: string, messageAr: string, language?: 'ar' | 'en'): Promise<void> {
  if (whatsappOutboundSuspended()) {
    console.warn(`[notificationEngine] WhatsApp outbound suspended by emergency kill switch -- skipped customer event "${eventKey}" for ${customerId}.`);
    return;
  }
  const config = globalStore.customerNotificationConfigs.find(c => c.eventKey === eventKey);
  if (!config || !config.enabled) return;

  const text = language === 'ar'
    ? `مرحباً ${customerName}،\n\n${messageAr}\n\n— سبلندر لتأجير السيارات`
    : language === 'en'
      ? `Dear ${customerName},\n\n${messageEn}\n\n— Splendor Car Rental`
      : `مرحباً ${customerName}،\n\n${messageAr}\n\n${messageEn}\n\n— Splendor Car Rental`;

  const result = customerPhone
    ? await sendWhatsAppMessage(customerPhone, text)
    : { success: false, status: 'failed' as const, error: 'No phone number on file for this customer.' };

  globalStore.whatsappMessageLog.unshift({
    id: nextLogId(),
    eventKey,
    recipientType: 'customer',
    recipientLabel: customerName,
    recipientPhone: customerPhone,
    message: text,
    status: result.status,
    errorMessage: result.error,
    createdAt: new Date().toISOString()
  });

  // Only a real send attempt that failed is retryable -- "no phone on
  // file" has nothing a retry could fix, so it stays a log line, not a
  // dead-letter entry someone would retry into an identical failure.
  if (result.status === 'failed' && customerPhone) {
    await recordFailedJob('whatsapp_send', { phone: customerPhone, message: text, eventKey, recipientLabel: customerName }, result.error || 'Unknown WhatsApp send failure.');
  }

  if (globalStore.whatsappMessageLog.length > 500) {
    globalStore.whatsappMessageLog.length = 500;
  }
}

// ---------------------------------------------------------------------------
// Automated background monitoring sweep
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** In-memory cooldown so a still-true condition (e.g. a document still expiring soon) doesn't re-alert on every sweep -- resets on a cold start, which just means at most one extra alert after a redeploy. */
function shouldAlert(cooldownKey: string, cooldownHours: number): boolean {
  const last = globalStore.notificationCooldowns[cooldownKey];
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) > cooldownHours * 60 * 60 * 1000;
}
function markAlerted(cooldownKey: string): void {
  globalStore.notificationCooldowns[cooldownKey] = new Date().toISOString();
}

export interface NotificationCheckSummary {
  ranAt: string;
  alertsFired: number;
  details: string[];
}

/**
 * Runs every automated check the spec calls for: document expiries
 * (customer ID/license, vehicle Mulkiya/insurance), contract deadlines
 * (overdue returns), security deposits due for refund, invoices overdue,
 * unhandled toll items, and bank reconciliation discrepancies. Each
 * category is summarized into ONE dispatched message (not one per row) so
 * a fleet with many expiring documents doesn't flood WhatsApp -- the
 * message itself lists every affected record.
 */
export async function runNotificationChecks(): Promise<NotificationCheckSummary> {
  if (getRuleValue('killSwitch.backgroundJobs', false)) {
    return { ranAt: new Date().toISOString(), alertsFired: 0, details: ['Background/scheduled jobs suspended by emergency kill switch -- sweep skipped.'] };
  }

  const details: string[] = [];
  let alertsFired = 0;
  const now = Date.now();
  const expiryLookaheadDays = getRuleValue('notificationExpiryLookaheadDays', 30);
  const standardCooldownHours = getRuleValue('notificationCooldownHours', 24);
  const overdueCooldownHours = getRuleValue('notificationOverdueCooldownHours', 12);
  const contractEndingReminderDays = getRuleValue('notificationContractEndingReminderDays', 2);
  const depositDueSoonDays = getRuleValue('notificationDepositDueSoonDays', 3);
  const paymentDueSoonDays = getRuleValue('notificationPaymentDueSoonDays', 3);
  const unmatchedTollStalenessHours = getRuleValue('notificationUnmatchedTollStalenessHours', 24);
  const soon = now + expiryLookaheadDays * DAY_MS;

  const fireIfNew = async (eventKey: string, cooldownKey: string, cooldownHours: number, msgEn: string, msgAr: string) => {
    if (!shouldAlert(cooldownKey, cooldownHours)) return;
    await dispatchNotificationEvent(eventKey, msgEn, msgAr);
    markAlerted(cooldownKey);
    alertsFired++;
    details.push(`${eventKey}: ${msgEn}`);
  };

  // Vehicle registration (Mulkiya) & insurance expiring within 30 days
  const expiringRegistration = globalStore.vehicles.filter(v => {
    const t = new Date(v.registrationExpiry).getTime();
    return !isNaN(t) && t <= soon && t >= now - DAY_MS;
  });
  if (expiringRegistration.length > 0) {
    const list = expiringRegistration.map(v => `${v.make} ${v.model} (${v.plateNumber}) -- ${v.registrationExpiry}`).join('; ');
    await fireIfNew('vehicle_registration_expiring', 'vehicle_registration_expiring:batch', standardCooldownHours,
      `Vehicle registration (Mulkiya) expiring within 30 days: ${list}`,
      `تنبيه: انتهاء ملكية مركبات خلال 30 يوم: ${list}`);
  }

  const expiringInsurance = globalStore.vehicles.filter(v => {
    const t = new Date(v.insuranceExpiry).getTime();
    return !isNaN(t) && t <= soon && t >= now - DAY_MS;
  });
  if (expiringInsurance.length > 0) {
    const list = expiringInsurance.map(v => `${v.make} ${v.model} (${v.plateNumber}) -- ${v.insuranceExpiry}`).join('; ');
    await fireIfNew('vehicle_insurance_expiring', 'vehicle_insurance_expiring:batch', standardCooldownHours,
      `Vehicle insurance expiring within 30 days: ${list}`,
      `تنبيه: انتهاء تأمين مركبات خلال 30 يوم: ${list}`);
  }

  // Customer ID / driving license expiring within 30 days
  const expiringDocs = globalStore.customers.filter(c => {
    const idT = new Date(c.idExpiryDate).getTime();
    const licT = new Date(c.licenseExpiryDate).getTime();
    return (!isNaN(idT) && idT <= soon && idT >= now - DAY_MS) || (!isNaN(licT) && licT <= soon && licT >= now - DAY_MS);
  });
  if (expiringDocs.length > 0) {
    const list = expiringDocs.map(c => c.fullName).join('; ');
    await fireIfNew('customer_document_expiring', 'customer_document_expiring:batch', standardCooldownHours,
      `Customer ID/License documents expiring within 30 days: ${list}`,
      `تنبيه: انتهاء هوية أو رخصة عملاء خلال 30 يوم: ${list}`);
  }

  // Active contracts past their return date
  const overdueContracts = globalStore.contracts.filter(c => c.status === 'active' && new Date(c.endDateTime).getTime() < now);
  if (overdueContracts.length > 0) {
    const list = overdueContracts.map(c => `${c.id} (${c.customerName})`).join('; ');
    await fireIfNew('contract_overdue', 'contract_overdue:batch', overdueCooldownHours,
      `Contracts overdue for return: ${list}`,
      `تنبيه: عقود متأخرة عن موعد التسليم: ${list}`);
  }

  // Active contracts ending within 2 days -- customer-facing "your rental is
  // ending soon" reminder, one message per contract (not batched like the
  // internal staff alert above, since each goes to a different customer).
  const expiringSoonContracts = globalStore.contracts.filter(c => {
    if (c.status !== 'active') return false;
    const end = new Date(c.endDateTime).getTime();
    return end >= now && end <= now + contractEndingReminderDays * DAY_MS;
  });
  for (const c of expiringSoonContracts) {
    const key = `customer_contract_expiring:${c.id}`;
    if (!shouldAlert(key, standardCooldownHours)) continue;
    const customer = globalStore.customers.find(cu => cu.id === c.customerId);
    await dispatchCustomerNotification('customer_contract_expiring', c.customerId, c.customerName, customer?.phone,
      `Your rental contract ${c.id} is ending on ${c.endDateTime.slice(0, 10)}. Please contact us to extend or arrange the vehicle return.`,
      `عقد إيجارك رقم ${c.id} ينتهي بتاريخ ${c.endDateTime.slice(0, 10)}. برجاء التواصل معنا للتمديد أو ترتيب تسليم المركبة.`);
    markAlerted(key);
    alertsFired++;
    details.push(`customer_contract_expiring: ${c.id}`);
  }

  // Security deposits due for refund within 3 days
  const depositsDue = globalStore.deposits.filter(d => {
    if (d.status !== 'held' && d.status !== 'collected') return false;
    const t = new Date(d.holdReleaseDueDate).getTime();
    return !isNaN(t) && t <= now + depositDueSoonDays * DAY_MS;
  });
  if (depositsDue.length > 0) {
    const list = depositsDue.map(d => `${d.customerName} (${d.balance} AED)`).join('; ');
    await fireIfNew('deposit_refund_due', 'deposit_refund_due:batch', standardCooldownHours,
      `Security deposits due for refund within 3 days: ${list}`,
      `تنبيه: تأمينات مستحقة الاسترجاع خلال 3 أيام: ${list}`);
  }

  // Overdue invoices (internal staff alert, batched)
  const overdueInvoices = globalStore.invoices.filter(i => i.balanceDue > 0 && new Date(i.dueDate).getTime() < now);
  if (overdueInvoices.length > 0) {
    const list = overdueInvoices.map(i => `${i.id} (${i.customerName}, ${i.balanceDue} AED)`).join('; ');
    await fireIfNew('invoice_overdue', 'invoice_overdue:batch', standardCooldownHours,
      `Overdue invoices: ${list}`,
      `تنبيه: فواتير متأخرة السداد: ${list}`);
  }

  // Customer-facing payment reminders: due-soon (not yet overdue) and
  // arrears (already overdue), one message per customer per invoice.
  for (const inv of globalStore.invoices) {
    if (inv.balanceDue <= 0) continue;
    const due = new Date(inv.dueDate).getTime();
    if (isNaN(due)) continue;
    const customer = globalStore.customers.find(c => c.id === inv.customerId);

    if (due < now) {
      const key = `customer_payment_overdue:${inv.id}`;
      if (shouldAlert(key, standardCooldownHours)) {
        await dispatchCustomerNotification('customer_payment_overdue', inv.customerId, inv.customerName, customer?.phone,
          `Invoice ${inv.id} is overdue -- outstanding balance ${inv.balanceDue.toLocaleString()} AED. Please settle at your earliest convenience.`,
          `فاتورة ${inv.id} متأخرة السداد -- الرصيد المستحق ${inv.balanceDue.toLocaleString()} درهم. برجاء السداد في أقرب وقت.`);
        markAlerted(key);
        alertsFired++;
        details.push(`customer_payment_overdue: ${inv.id}`);
      }
    } else if (due <= now + paymentDueSoonDays * DAY_MS) {
      const key = `customer_payment_due:${inv.id}`;
      if (shouldAlert(key, standardCooldownHours)) {
        await dispatchCustomerNotification('customer_payment_due', inv.customerId, inv.customerName, customer?.phone,
          `Invoice ${inv.id} is due on ${inv.dueDate.slice(0, 10)} -- balance ${inv.balanceDue.toLocaleString()} AED.`,
          `فاتورة ${inv.id} مستحقة بتاريخ ${inv.dueDate.slice(0, 10)} -- الرصيد ${inv.balanceDue.toLocaleString()} درهم.`);
        markAlerted(key);
        alertsFired++;
        details.push(`customer_payment_due: ${inv.id}`);
      }
    }
  }

  // Toll/parking rows still unmatched more than notificationUnmatchedTollStalenessHours after creation
  const unmatchedTolls = globalStore.tollTransactions.filter(t => {
    if (t.contractId || t.customerId) return false;
    return (now - new Date(t.createdAt).getTime()) > unmatchedTollStalenessHours * 60 * 60 * 1000;
  });
  if (unmatchedTolls.length > 0) {
    await fireIfNew('toll_unmatched_transaction', 'toll_unmatched_transaction:batch', standardCooldownHours,
      `${unmatchedTolls.length} toll/parking transaction(s) still unmatched to a contract after ${unmatchedTollStalenessHours}h -- please review and assign.`,
      `تنبيه: ${unmatchedTolls.length} معاملة رسوم/مواقف بدون مطابقة عقد منذ أكثر من ${unmatchedTollStalenessHours} ساعة -- برجاء المراجعة.`);
  }

  // Bank transactions still unreconciled
  const staleUnreconciled = globalStore.bankTransactions.filter(t => !t.reconciled);
  if (staleUnreconciled.length > 0) {
    await fireIfNew('bank_discrepancy_found', 'bank_discrepancy_found:batch', standardCooldownHours,
      `${staleUnreconciled.length} bank transaction(s) still unreconciled -- please review for discrepancies.`,
      `تنبيه: ${staleUnreconciled.length} معاملة بنكية غير مطابقة -- برجاء المراجعة.`);
  }

  // Dead-letter queue: automatic retry on the same 6h cadence as the rest
  // of this sweep. Capped at 5 attempts per job so a genuinely broken
  // WhatsApp integration doesn't get hammered forever -- past that, a
  // human has to look at it (POST /api/dead-letter-queue/:id/resolve).
  for (const job of getDeadLetterCache()) {
    if (job.status === 'resolved' || job.attempts >= 5) continue;
    try {
      await retryFailedJob(job.id);
    } catch (err) {
      console.error(`[notificationEngine] Dead-letter retry failed for ${job.id}:`, err);
    }
  }

  // Operational health: reads whatever the PREVIOUS sweep persisted (see
  // recordBackgroundJobRun below), so "have I gone stale" is judged against
  // the last time this actually ran, not this run itself.
  const health = await checkOperationalHealth();
  if (health.overallStatus !== 'healthy') {
    const summary = JSON.stringify(health.checks);
    await fireIfNew('system_health_alert', 'system_health_alert:batch', standardCooldownHours,
      `Operational health check reported "${health.overallStatus}": ${summary}`,
      `فحص الصحة التشغيلية أبلغ عن حالة "${health.overallStatus}": ${summary}`);
    if (health.checks.deadLetterQueue.unresolvedCount > 0) {
      await markAllAlerted();
    }
  }

  const result = { ranAt: new Date().toISOString(), alertsFired, details };
  await recordBackgroundJobRun({ lastRunAt: result.ranAt, alertsFired: result.alertsFired, details: result.details });
  return result;
}
