import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import {
  closeAccountingPeriod,
  configureAccountingAccount,
  createFinanceExpense,
  decideFinanceExpense,
  decideManualJournal,
  getAPAging,
  getARAging,
  getCustomerAccountingStatement,
  getEffectiveChartOfAccounts,
  getFinanceDashboard,
  getFinancialReports,
  getPostingGaps,
  getSupplierStatement,
  getVehicleProfitability,
  linkBankReconciliationToAccounting,
  listFinanceExpenses,
  listFinancialNotes,
  listJournals,
  listPayables,
  listPeriods,
  postDepositToAccounting,
  postInvoiceToAccounting,
  postPaymentToAccounting,
  requestManualJournal,
  reverseJournal,
  type AccountingActor
} from './accounting';
import { recordAtomicAccountingPayment } from './safeAccountingPayment';
import { createAtomicFinancialNote } from './safeFinancialNote';
import { allocateCustomerCreditAtomic } from './safeAccountingAllocation';
import { payAccountsPayableAtomic } from './safePayablePayment';
import { postSupplierInvoiceToAPAtomic } from './safeSupplierInvoicePosting';
import { applyDepositToApprovedChargeAtomic, postApprovedChargeAtomic, refundManualDepositAtomic } from './safeDepositAccounting';
import { getCashFlowReport } from './cashFlow';
import { recordAccountingAudit } from './accountingAudit';
import { dispatchCustomerNotification, dispatchNotificationEvent } from './notificationEngine';
import { ACCOUNTING_CONTROL_ACCOUNTS } from '../config/accounting';
import { accountingPeriodBounds } from '../lib/accounting';
import type { FinanceExpense, JournalLine, SafeCustomerPaymentInput } from '../accounting/types';

const PROTECTED_CONTROL_ACCOUNT_CODES = new Set<string>(Object.values(ACCOUNTING_CONTROL_ACCOUNTS));
const VALID_RECEIPT_METHODS = new Set(['cash', 'bank_transfer', 'card', 'pos_card', 'cheque', 'online_link', 'other']);

function badRequest(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Accounting request failed.';
  const lower = message.toLowerCase();
  const status = lower.includes('not found') ? 404
    : lower.includes('permission') || lower.includes('segregation of duties') ? 403
      : lower.includes('closed') || lower.includes('duplicate') || lower.includes('already') || lower.includes('idempotency-key') ? 409
        : 400;
  return res.status(status).json({ error: message });
}

function pathSegments(req: Request): string[] {
  return req.path.replace(/^\/api\/accounting\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

function assertFinanceActor(actor: AccountingActor) {
  if (!['ceo', 'admin', 'finance'].includes(actor.role)) throw new Error('You do not have permission to access accounting operations.');
}

function assertExecutiveActor(actor: AccountingActor) {
  if (!['ceo', 'admin'].includes(actor.role)) throw new Error('You do not have permission to perform this executive accounting action.');
}

function idempotencyKeyFromRequest(req: Request): string | undefined {
  const value = req.headers['idempotency-key'];
  return Array.isArray(value) ? value[0] : value;
}

function resolveReceiptSettlementAccount(method: string, requestedAccount?: string): string {
  const requested = String(requestedAccount || '').trim();
  if (requested) return requested;
  if (method === 'cash') return ACCOUNTING_CONTROL_ACCOUNTS.cash;
  if (method === 'bank_transfer') return ACCOUNTING_CONTROL_ACCOUNTS.bank;
  if (['card', 'pos_card', 'cheque', 'online_link'].includes(method)) return ACCOUNTING_CONTROL_ACCOUNTS.cardClearing;
  throw new Error('This payment method requires an explicit cash/bank/clearing settlement account.');
}

/**
 * Accounting API dispatcher used from api/index.ts. Every request reaches
 * this function only after Firebase authentication and a Firestore-backed
 * staff-role lookup; mutations remain server-authoritative.
 */
export async function handleAccountingRequest(req: Request, res: Response, actor: AccountingActor) {
  try {
    assertFinanceActor(actor);
    const segments = pathSegments(req);
    const [resource, id, action] = segments;

    if ((resource === undefined || resource === 'dashboard') && req.method === 'GET') {
      return res.json(await getFinanceDashboard());
    }

    if (resource === 'chart-of-accounts') {
      if (req.method === 'GET' && !id) return res.json(await getEffectiveChartOfAccounts());
      if ((req.method === 'PUT' || req.method === 'PATCH') && id) {
        if (PROTECTED_CONTROL_ACCOUNT_CODES.has(id) && req.body?.active === false) {
          throw new Error(`System control account ${id} cannot be disabled because active financial postings depend on it.`);
        }
        return res.json(await configureAccountingAccount(id, req.body || {}, actor, recordAccountingAudit));
      }
    }

    if (resource === 'journals') {
      if (req.method === 'GET' && !id) return res.json(await listJournals(Number(req.query.limit) || 1000));
      if (req.method === 'POST' && id === 'manual' && !action) {
        const body = req.body || {};
        return res.status(201).json(await requestManualJournal({
          date: body.date,
          reference: body.reference,
          memo: body.memo,
          lines: (body.lines || []) as JournalLine[]
        }, actor, recordAccountingAudit));
      }
      if (req.method === 'POST' && id === 'manual' && action) {
        const requestId = action;
        if (segments[3] !== 'decision') return res.status(404).json({ error: 'Accounting route not found.' });
        const decision = req.body?.decision;
        if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Decision must be approve or reject.' });
        return res.json(await decideManualJournal(requestId, decision, String(req.body?.reason || ''), actor, recordAccountingAudit));
      }
      if (req.method === 'POST' && id && action === 'reverse') {
        assertExecutiveActor(actor);
        return res.json(await reverseJournal(id, String(req.body?.reason || ''), String(req.body?.date || new Date().toISOString()), actor, recordAccountingAudit));
      }
    }

    if (resource === 'periods') {
      if (req.method === 'GET' && !id) return res.json(await listPeriods());
      if (req.method === 'POST' && id && action === 'close') {
        assertExecutiveActor(actor);
        const bounds = accountingPeriodBounds(id);
        const blockingGaps = (await getPostingGaps()).filter(gap => {
          const date = gap.date?.slice(0, 10);
          return Boolean(date && date >= bounds.startDate && date <= bounds.endDate);
        });
        if (blockingGaps.length > 0) {
          throw new Error(`Accounting period ${id} cannot close while ${blockingGaps.length} financial source transaction(s) in the period remain unposted.`);
        }
        return res.json(await closeAccountingPeriod(id, String(req.body?.reason || ''), actor, recordAccountingAudit));
      }
    }

    if (resource === 'expenses') {
      if (req.method === 'GET' && !id) return res.json(await listFinanceExpenses());
      if (req.method === 'POST' && !id) {
        const body = req.body || {};
        const expenseInput: Omit<FinanceExpense, 'id' | 'approvalStatus' | 'postingStatus' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt' | 'journalId'> = {
          date: body.date,
          vendor: body.vendor,
          category: body.category,
          expenseAccountCode: body.expenseAccountCode,
          amountBeforeVat: Number(body.amountBeforeVat),
          vatAmount: Number(body.vatAmount),
          totalAmount: Number(body.totalAmount),
          paymentMethod: body.paymentMethod,
          settlementAccountCode: body.settlementAccountCode,
          paymentStatus: body.paymentStatus === 'paid' ? 'paid' : 'unpaid',
          reference: body.reference,
          vehicleId: body.vehicleId,
          contractId: body.contractId,
          supplierId: body.supplierId,
          branchId: body.branchId,
          notes: body.notes,
          attachmentDocumentIds: Array.isArray(body.attachmentDocumentIds) ? body.attachmentDocumentIds : []
        };
        return res.status(201).json(await createFinanceExpense(expenseInput, actor, recordAccountingAudit));
      }
      if (req.method === 'POST' && id && action === 'decision') {
        const decision = req.body?.decision;
        if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Decision must be approve or reject.' });
        return res.json(await decideFinanceExpense(id, decision, String(req.body?.reason || ''), actor, recordAccountingAudit));
      }
    }

    if (resource === 'payables') {
      if (req.method === 'GET' && !id) return res.json(await listPayables());
      if (req.method === 'POST' && id && action === 'pay') {
        const result = await payAccountsPayableAtomic(id, {
          amount: Number(req.body?.amount),
          settlementAccountCode: String(req.body?.settlementAccountCode || ''),
          reference: req.body?.reference,
          paymentDate: req.body?.paymentDate
        }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
        return res.status(result.replayed ? 200 : 201).json({ payable: result.payable, payment: result.payment, journal: result.journal });
      }
    }

    if (resource === 'supplier-invoices' && req.method === 'POST' && id && action === 'post') {
      const result = await postSupplierInvoiceToAPAtomic(id, {
        amountBeforeVat: Number(req.body?.amountBeforeVat),
        vatAmount: Number(req.body?.vatAmount),
        dueDate: String(req.body?.dueDate || ''),
        expenseAccountCode: String(req.body?.expenseAccountCode || '')
      }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json({ payable: result.payable, journal: result.journal });
    }

    if (resource === 'charges' && req.method === 'POST' && id && action === 'post') {
      const result = await postApprovedChargeAtomic(id, actor, recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json({ charge: result.charge, journal: result.journal });
    }

    if (resource === 'ar-aging' && req.method === 'GET') {
      return res.json(await getARAging(String(req.query.asOf || new Date().toISOString().slice(0, 10))));
    }
    if (resource === 'ap-aging' && req.method === 'GET') {
      return res.json(await getAPAging(String(req.query.asOf || new Date().toISOString().slice(0, 10))));
    }
    if (resource === 'reports' && req.method === 'GET') {
      const input = {
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        asOf: req.query.asOf ? String(req.query.asOf) : undefined
      };
      const [reports, cashFlow] = await Promise.all([
        getFinancialReports(input),
        getCashFlowReport({ startDate: input.startDate, endDate: input.endDate })
      ]);
      return res.json({ ...reports, cashFlow });
    }
    if (resource === 'vehicle-profitability' && req.method === 'GET') return res.json(await getVehicleProfitability());
    if (resource === 'posting-gaps' && req.method === 'GET') return res.json(await getPostingGaps());

    if (resource === 'invoices' && req.method === 'POST' && id && action === 'post') {
      return res.json(await postInvoiceToAccounting(id, String(req.body?.revenueAccountCode || '4000'), actor, recordAccountingAudit));
    }
    if (resource === 'payments' && req.method === 'POST' && id && action === 'post') {
      return res.json(await postPaymentToAccounting(id, String(req.body?.settlementAccountCode || ''), actor, recordAccountingAudit));
    }
    if (resource === 'payments' && req.method === 'POST' && id && action === 'allocate') {
      const result = await allocateCustomerCreditAtomic(
        id,
        Array.isArray(req.body?.allocations) ? req.body.allocations : [],
        actor,
        idempotencyKeyFromRequest(req),
        recordAccountingAudit
      );
      return res.status(result.replayed ? 200 : 201).json({ payment: result.payment, journal: result.journal });
    }
    if (resource === 'deposits' && req.method === 'POST' && id && action === 'post') {
      return res.json(await postDepositToAccounting(id, String(req.body?.settlementAccountCode || ''), actor, recordAccountingAudit));
    }
    if (resource === 'deposits' && req.method === 'POST' && id && action === 'apply') {
      const result = await applyDepositToApprovedChargeAtomic(id, {
        amount: Number(req.body?.amount ?? req.body?.applyAmount),
        chargeId: String(req.body?.chargeId || ''),
        reason: req.body?.reason
      }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json({ deposit: result.deposit, charge: result.charge, journal: result.journal });
    }
    if (resource === 'deposits' && req.method === 'POST' && id && action === 'refund') {
      const result = await refundManualDepositAtomic(id, {
        amount: Number(req.body?.amount ?? req.body?.refundAmount),
        settlementAccountCode: req.body?.settlementAccountCode,
        reason: req.body?.reason,
        refundDate: req.body?.refundDate
      }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json({ deposit: result.deposit, journal: result.journal });
    }

    if (resource === 'credit-notes' && req.method === 'POST') {
      const result = await createAtomicFinancialNote('credit_note', {
        invoiceId: String(req.body?.invoiceId || ''),
        issueDate: String(req.body?.issueDate || new Date().toISOString()),
        reason: String(req.body?.reason || ''),
        amountBeforeVat: Number(req.body?.amountBeforeVat),
        vatAmount: Number(req.body?.vatAmount),
        revenueAccountCode: String(req.body?.revenueAccountCode || '4000')
      }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json(result.note);
    }
    if (resource === 'debit-notes' && req.method === 'POST') {
      const result = await createAtomicFinancialNote('debit_note', {
        invoiceId: String(req.body?.invoiceId || ''),
        issueDate: String(req.body?.issueDate || new Date().toISOString()),
        reason: String(req.body?.reason || ''),
        amountBeforeVat: Number(req.body?.amountBeforeVat),
        vatAmount: Number(req.body?.vatAmount),
        revenueAccountCode: String(req.body?.revenueAccountCode || '4000')
      }, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
      return res.status(result.replayed ? 200 : 201).json(result.note);
    }
    if (resource === 'financial-notes' && req.method === 'GET') {
      return res.json(await listFinancialNotes(req.query.invoiceId ? String(req.query.invoiceId) : undefined));
    }

    if (resource === 'bank-transactions' && req.method === 'POST' && id && action === 'link-journal') {
      await linkBankReconciliationToAccounting(id, String(req.body?.journalId || ''), actor, recordAccountingAudit);
      return res.json({ success: true });
    }

    if (resource === 'suppliers' && id && action === 'statement' && req.method === 'GET') return res.json(await getSupplierStatement(id));
    if (resource === 'customers' && id && action === 'statement' && req.method === 'GET') return res.json(await getCustomerAccountingStatement(id));

    return res.status(404).json({ error: 'Accounting route not found.' });
  } catch (error) {
    return badRequest(res, error);
  }
}

/**
 * Safe replacement for the legacy customer-payment POST path. It supports
 * multi-invoice allocations, prevents over-allocation, and keeps excess
 * funds as explicit customer credit instead of silently overpaying a single
 * invoice. Existing callers that only send `invoiceId` remain compatible.
 */
export async function handleSafeCustomerPaymentRequest(req: Request, res: Response, actor: AccountingActor) {
  try {
    assertFinanceActor(actor);
    const body = req.body || {};
    const method = String(body.method || 'bank_transfer');
    if (method === 'corporate_credit') {
      throw new Error('Corporate credit is not a received payment. Keep the invoice outstanding on the corporate account instead of recording artificial cash receipt.');
    }
    if (!VALID_RECEIPT_METHODS.has(method)) throw new Error(`Unsupported payment method: ${method}.`);
    const settlementAccountCode = resolveReceiptSettlementAccount(method, body.settlementAccountCode);
    const input: SafeCustomerPaymentInput = {
      customerId: String(body.customerId || ''),
      customerName: body.customerName,
      amount: Number(body.amount),
      method,
      referenceNumber: body.referenceNumber,
      notes: body.notes,
      contractId: body.contractId,
      reservationId: body.reservationId,
      invoiceId: body.invoiceId,
      allocations: Array.isArray(body.allocations) ? body.allocations : undefined,
      settlementAccountCode,
      proofDocumentId: body.proofDocumentId
    };
    const outcome = await recordAtomicAccountingPayment(input, actor, idempotencyKeyFromRequest(req), recordAccountingAudit);
    const result = outcome.result;

    // Notifications are side effects, not part of the financial commit. An
    // idempotent replay must not send a second receipt/WhatsApp message.
    if (!outcome.replayed) {
      try {
        const customerSnap = await admin.firestore().collection('customers').doc(input.customerId).get();
        const customer = customerSnap.exists ? customerSnap.data() as any : null;
        const customerName = input.customerName || customer?.fullName || input.customerId;
        await dispatchNotificationEvent(
          'payment_received',
          `Payment of ${result.amount.toLocaleString()} AED received from ${customerName} (${method}). Receipt ${result.receiptNumber}.`,
          `تم استلام دفعة بقيمة ${result.amount.toLocaleString()} درهم من ${customerName}. إيصال ${result.receiptNumber}.`
        );
        await dispatchCustomerNotification(
          'customer_payment_receipt',
          input.customerId,
          customerName,
          customer?.phone,
          `Payment received — ${result.amount.toLocaleString()} AED. Receipt No. ${result.receiptNumber}. Thank you.`,
          `تم استلام دفعتكم بقيمة ${result.amount.toLocaleString()} درهم. رقم الإيصال ${result.receiptNumber}. شكراً لكم.`
        );
      } catch (notificationError) {
        console.error('[accounting] payment notification dispatch failed after durable receipt:', notificationError);
      }
    }

    return res.status(outcome.replayed ? 200 : 201).json(result);
  } catch (error) {
    return badRequest(res, error);
  }
}
