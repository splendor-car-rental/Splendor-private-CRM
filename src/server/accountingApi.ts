import type { Request, Response } from 'express';
import {
  allocateExistingCustomerPayment,
  closeAccountingPeriod,
  configureAccountingAccount,
  createFinanceExpense,
  createFinancialNote,
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
  payAccountsPayable,
  postApprovedSupplierInvoiceToAP,
  postDepositToAccounting,
  postInvoiceToAccounting,
  postPaymentToAccounting,
  recordSafeCustomerPayment,
  requestManualJournal,
  reverseJournal,
  type AccountingActor
} from './accounting';
import { recordAccountingAudit } from './accountingAudit';
import type { FinanceExpense, JournalLine, SafeCustomerPaymentInput } from '../accounting/types';

function badRequest(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Accounting request failed.';
  const lower = message.toLowerCase();
  const status = lower.includes('not found') ? 404
    : lower.includes('permission') || lower.includes('segregation of duties') ? 403
      : lower.includes('closed') || lower.includes('duplicate') || lower.includes('already') ? 409
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
        // /journals/manual/:requestId/decision -- requestId is segment[2].
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
        return res.json(await payAccountsPayable(id, {
          amount: Number(req.body?.amount),
          settlementAccountCode: String(req.body?.settlementAccountCode || ''),
          reference: req.body?.reference,
          paymentDate: req.body?.paymentDate
        }, actor, recordAccountingAudit));
      }
    }

    if (resource === 'supplier-invoices' && req.method === 'POST' && id && action === 'post') {
      return res.json(await postApprovedSupplierInvoiceToAP(id, {
        amountBeforeVat: Number(req.body?.amountBeforeVat),
        vatAmount: Number(req.body?.vatAmount),
        dueDate: String(req.body?.dueDate || ''),
        expenseAccountCode: String(req.body?.expenseAccountCode || '')
      }, actor, recordAccountingAudit));
    }

    if (resource === 'ar-aging' && req.method === 'GET') {
      return res.json(await getARAging(String(req.query.asOf || new Date().toISOString().slice(0, 10))));
    }
    if (resource === 'ap-aging' && req.method === 'GET') {
      return res.json(await getAPAging(String(req.query.asOf || new Date().toISOString().slice(0, 10))));
    }
    if (resource === 'reports' && req.method === 'GET') {
      return res.json(await getFinancialReports({
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        asOf: req.query.asOf ? String(req.query.asOf) : undefined
      }));
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
      return res.json(await allocateExistingCustomerPayment(id, Array.isArray(req.body?.allocations) ? req.body.allocations : [], actor, recordAccountingAudit));
    }
    if (resource === 'deposits' && req.method === 'POST' && id && action === 'post') {
      return res.json(await postDepositToAccounting(id, String(req.body?.settlementAccountCode || ''), actor, recordAccountingAudit));
    }

    if (resource === 'credit-notes' && req.method === 'POST') {
      return res.status(201).json(await createFinancialNote('credit_note', {
        invoiceId: String(req.body?.invoiceId || ''),
        issueDate: String(req.body?.issueDate || new Date().toISOString()),
        reason: String(req.body?.reason || ''),
        amountBeforeVat: Number(req.body?.amountBeforeVat),
        vatAmount: Number(req.body?.vatAmount),
        revenueAccountCode: String(req.body?.revenueAccountCode || '4000')
      }, actor, recordAccountingAudit));
    }
    if (resource === 'debit-notes' && req.method === 'POST') {
      return res.status(201).json(await createFinancialNote('debit_note', {
        invoiceId: String(req.body?.invoiceId || ''),
        issueDate: String(req.body?.issueDate || new Date().toISOString()),
        reason: String(req.body?.reason || ''),
        amountBeforeVat: Number(req.body?.amountBeforeVat),
        vatAmount: Number(req.body?.vatAmount),
        revenueAccountCode: String(req.body?.revenueAccountCode || '4000')
      }, actor, recordAccountingAudit));
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
    const input: SafeCustomerPaymentInput = {
      customerId: String(body.customerId || ''),
      customerName: body.customerName,
      amount: Number(body.amount),
      method: String(body.method || 'bank_transfer'),
      referenceNumber: body.referenceNumber,
      notes: body.notes,
      contractId: body.contractId,
      reservationId: body.reservationId,
      invoiceId: body.invoiceId,
      allocations: Array.isArray(body.allocations) ? body.allocations : undefined,
      settlementAccountCode: body.settlementAccountCode,
      proofDocumentId: body.proofDocumentId
    };
    return res.status(201).json(await recordSafeCustomerPayment(input, actor, recordAccountingAudit));
  } catch (error) {
    return badRequest(res, error);
  }
}
