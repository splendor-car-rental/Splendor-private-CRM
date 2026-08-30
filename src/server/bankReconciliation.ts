// Bank Reconciliation matching/classification engine (Collections & Bank
// Reconciliation mission). Extends the existing auto-match heuristic that
// already lived inline in POST /api/bank-batches (customer-name-in-
// description substring search) into a real, testable module that also
// checks amount/date/reference and produces the five reconciler-facing
// classifications the mission requires -- matched, needs_review,
// unrecorded_transfer, amount_mismatch, duplicate_transaction -- each with
// a human-readable reason.
//
// ABSOLUTE RULE (mission, verbatim): "ممنوع إنشاء أو تأكيد أي دفعة تلقائيًا
// بناءً على تحليل كشف البنك فقط" -- never auto-create or auto-confirm a
// payment from bank-statement analysis alone. This module is read-only: it
// only ever COMPUTES a classification/suggestion. Nothing here writes a
// Payment, changes an Invoice balance, or sets BankTransaction.reconciled
// -- that only ever happens in server.ts's POST /api/bank-transactions/:id
// /reconcile, called by a human, one transaction at a time.

import type { BankMatchClassification, BankTransaction, Customer, Invoice, Payment, UnmatchedCrmPaymentReportEntry } from '../types';
import type { ParsedBankStatementRow } from './bankStatementParsers';

export interface ClassifyBankRowInput {
  row: ParsedBankStatementRow;
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  /** Every previously-imported bank transaction (across ALL batches, not just the current one) -- the universe duplicate detection checks against. */
  priorTransactions: BankTransaction[];
}

export interface SuggestedMatch {
  customerId?: string;
  customerName?: string;
  invoiceId?: string;
  contractId?: string;
  confidence: number;
  rationale: string;
  rationaleAr: string;
}

export interface ClassifyBankRowResult {
  classification: BankMatchClassification;
  reasonEn: string;
  reasonAr: string;
  suggestedMatch?: SuggestedMatch;
  duplicateOfTransactionId?: string;
}

const AMOUNT_EPSILON = 0.01;

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < AMOUNT_EPSILON;
}

/** Finds a customer whose full name or company name appears in the bank line's free-text description -- the same substring heuristic the original inline matcher used, factored out so every classification path can reuse it. */
function findCustomerInDescription(description: string, customers: Customer[]): Customer | undefined {
  const desc = (description || '').toUpperCase();
  return customers.find(cust => {
    const nameParts = (cust.fullName || '').toUpperCase().split(' ');
    const nameHit = nameParts.some(p => p.length > 3 && desc.includes(p));
    const companyHit = cust.companyName && desc.includes(cust.companyName.toUpperCase().slice(0, 8));
    return nameHit || !!companyHit;
  });
}

function txnAmount(t: { debit: number; credit: number }): number {
  return t.credit > 0 ? t.credit : t.debit;
}

/**
 * Duplicate detection: a bank line that repeats an earlier import. A
 * non-empty reference matching exactly (same reference, same amount, same
 * date) is treated as conclusive. Without a reference, the same
 * date+amount pair appearing twice is still flagged -- a false positive
 * here only ever routes to human review (nothing is silently dropped), so
 * the safe default is to flag rather than miss a real duplicate.
 */
function findDuplicate(row: ParsedBankStatementRow, priorTransactions: BankTransaction[]): BankTransaction | undefined {
  const amount = row.credit > 0 ? row.credit : row.debit;
  if (amount === 0) return undefined;
  return priorTransactions.find(t => {
    if (t.date !== row.date) return false;
    if (!amountsEqual(txnAmount(t), amount)) return false;
    if (row.reference && t.reference) return row.reference === t.reference;
    return true; // both missing/blank references -- same date+amount is the best signal available
  });
}

/**
 * Classifies one parsed bank statement row against everything already
 * recorded in the CRM. Returns a classification + human-readable reason
 * (Arabic and English) -- never mutates anything, never decides a payment
 * is confirmed. See the module doc for why.
 */
export function classifyBankRow(input: ClassifyBankRowInput): ClassifyBankRowResult {
  const { row, customers, invoices, payments, priorTransactions } = input;

  const duplicate = findDuplicate(row, priorTransactions);
  if (duplicate) {
    return {
      classification: 'duplicate_transaction',
      reasonEn: `This line repeats bank transaction ${duplicate.id} (${duplicate.date}, same reference/amount) -- likely a duplicate row or a re-uploaded overlapping statement period.`,
      reasonAr: `هذا السطر يكرر المعاملة البنكية ${duplicate.id} (بنفس التاريخ والمرجع/المبلغ) -- على الأرجح صف مكرر أو كشف حساب أُعيد رفعه بفترة متداخلة.`,
      duplicateOfTransactionId: duplicate.id
    };
  }

  // Debits (money leaving the account -- bank fees, outgoing transfers,
  // etc.) are never customer payments, so they are never matched against
  // Payments/Invoices -- just routed to a human for accounting review.
  if (row.credit <= 0) {
    return {
      classification: 'needs_review',
      reasonEn: 'This is a debit (money leaving the account), not a customer payment -- needs accounting review/classification, not payment matching.',
      reasonAr: 'هذه عملية خصم (خروج أموال) وليست دفعة من عميل -- تحتاج مراجعة وتصنيف محاسبي، لا مطابقة دفعات.'
    };
  }

  // 1) Exact reference match against a recorded Payment.
  if (row.reference) {
    const referenceMatches = payments.filter(p => p.referenceNumber && p.referenceNumber === row.reference);
    if (referenceMatches.length === 1) {
      const payment = referenceMatches[0];
      if (amountsEqual(payment.amount, row.credit)) {
        return {
          classification: 'matched',
          reasonEn: `Reference "${row.reference}" and amount ${row.credit} AED exactly match recorded payment ${payment.id}.`,
          reasonAr: `المرجع "${row.reference}" والمبلغ ${row.credit} درهم يطابقان تمامًا الدفعة المسجلة ${payment.id}.`,
          suggestedMatch: {
            customerId: payment.customerId, customerName: payment.customerName, invoiceId: payment.invoiceId,
            contractId: payment.contractId, confidence: 98,
            rationale: `Exact reference + amount match to Payment ${payment.id}.`,
            rationaleAr: `تطابق تام في المرجع والمبلغ مع الدفعة ${payment.id}.`
          }
        };
      }
      return {
        classification: 'amount_mismatch',
        reasonEn: `Reference "${row.reference}" matches recorded payment ${payment.id}, but the bank amount (${row.credit} AED) differs from the recorded amount (${payment.amount} AED).`,
        reasonAr: `المرجع "${row.reference}" يطابق الدفعة المسجلة ${payment.id}، لكن مبلغ البنك (${row.credit} درهم) يختلف عن المبلغ المسجل (${payment.amount} درهم).`,
        suggestedMatch: {
          customerId: payment.customerId, customerName: payment.customerName, invoiceId: payment.invoiceId,
          contractId: payment.contractId, confidence: 60,
          rationale: `Reference matches Payment ${payment.id} but amount differs.`,
          rationaleAr: `المرجع يطابق الدفعة ${payment.id} لكن المبلغ مختلف.`
        }
      };
    }
    if (referenceMatches.length > 1) {
      return {
        classification: 'needs_review',
        reasonEn: `Reference "${row.reference}" matches more than one recorded payment -- needs manual selection.`,
        reasonAr: `المرجع "${row.reference}" يطابق أكثر من دفعة مسجلة -- يحتاج اختيارًا يدويًا.`
      };
    }
  }

  // 2) Customer identified from the description -- try to line the amount up with one of their open invoices or a recorded payment.
  const customer = findCustomerInDescription(row.description, customers);
  if (customer) {
    const openInvoice = invoices.find(i => i.customerId === customer.id && i.balanceDue > 0 && amountsEqual(i.balanceDue, row.credit));
    if (openInvoice) {
      return {
        classification: 'matched',
        reasonEn: `Customer "${customer.fullName}" identified from the description, and the amount (${row.credit} AED) exactly matches their open invoice ${openInvoice.id}.`,
        reasonAr: `تم تحديد العميل "${customer.fullName}" من نص الوصف، والمبلغ (${row.credit} درهم) يطابق تمامًا فاتورته المفتوحة ${openInvoice.id}.`,
        suggestedMatch: {
          customerId: customer.id, customerName: customer.fullName, invoiceId: openInvoice.id, contractId: openInvoice.contractId,
          confidence: 92, rationale: `Customer name matched in description; amount matches invoice ${openInvoice.id} balance exactly.`,
          rationaleAr: `تمت مطابقة اسم العميل من الوصف؛ المبلغ يطابق رصيد الفاتورة ${openInvoice.id} تمامًا.`
        }
      };
    }

    const anyOpenInvoice = invoices.find(i => i.customerId === customer.id && i.balanceDue > 0);
    if (anyOpenInvoice) {
      return {
        classification: 'amount_mismatch',
        reasonEn: `Customer "${customer.fullName}" identified from the description, but the amount (${row.credit} AED) does not match their open invoice ${anyOpenInvoice.id} balance (${anyOpenInvoice.balanceDue} AED).`,
        reasonAr: `تم تحديد العميل "${customer.fullName}" من الوصف، لكن المبلغ (${row.credit} درهم) لا يطابق رصيد فاتورته المفتوحة ${anyOpenInvoice.id} (${anyOpenInvoice.balanceDue} درهم).`,
        suggestedMatch: {
          customerId: customer.id, customerName: customer.fullName, invoiceId: anyOpenInvoice.id, contractId: anyOpenInvoice.contractId,
          confidence: 55, rationale: `Customer matched but amount differs from their open invoice balance.`,
          rationaleAr: `تمت مطابقة العميل لكن المبلغ يختلف عن رصيد فاتورته المفتوحة.`
        }
      };
    }

    return {
      classification: 'needs_review',
      reasonEn: `Customer "${customer.fullName}" identified from the description, but they have no open invoice to match this amount against -- needs manual review.`,
      reasonAr: `تم تحديد العميل "${customer.fullName}" من الوصف، لكن لا توجد لديه فاتورة مفتوحة لمطابقة هذا المبلغ -- يحتاج مراجعة يدوية.`,
      suggestedMatch: {
        customerId: customer.id, customerName: customer.fullName, confidence: 45,
        rationale: 'Customer matched from description; no open invoice to confirm against.',
        rationaleAr: 'تمت مطابقة العميل من الوصف؛ لا توجد فاتورة مفتوحة للتأكيد.'
      }
    };
  }

  // 3) Nothing at all recognized this credit -- real money in, nothing in the CRM explains it.
  return {
    classification: 'unrecorded_transfer',
    reasonEn: `A credit of ${row.credit} AED was received, but no matching customer, invoice, or payment reference could be identified -- an unrecorded transfer.`,
    reasonAr: `تم استلام مبلغ ${row.credit} درهم، لكن تعذر تحديد عميل أو فاتورة أو مرجع دفعة مطابق -- تحويل غير مسجل.`
  };
}

/**
 * "دفعة غير موجودة بالبنك" -- CRM-recorded Payments in the statement's
 * period that no imported bank line's reference/amount+date could account
 * for. Computed once per import, attached to the BankImportBatch -- never
 * fabricated as a BankTransaction (there is no bank line for it to be).
 * Only considers methods that would actually appear on a bank statement
 * (bank_transfer, cheque, pos_card); cash/online/corporate-credit payments
 * are out of scope for bank-statement reconciliation by definition.
 */
export function findUnmatchedCrmPayments(
  statementRows: ParsedBankStatementRow[],
  payments: Payment[],
  periodStart: string,
  periodEnd: string
): UnmatchedCrmPaymentReportEntry[] {
  const BANK_VISIBLE_METHODS: Payment['method'][] = ['bank_transfer', 'cheque', 'pos_card'];
  const inPeriod = payments.filter(p =>
    BANK_VISIBLE_METHODS.includes(p.method) &&
    p.receivedAt >= periodStart &&
    p.receivedAt <= periodEnd
  );

  const entries: UnmatchedCrmPaymentReportEntry[] = [];
  for (const payment of inPeriod) {
    const foundInStatement = statementRows.some(row => {
      if (row.credit <= 0) return false;
      if (payment.referenceNumber && row.reference) return payment.referenceNumber === row.reference;
      return amountsEqual(row.credit, payment.amount);
    });
    if (!foundInStatement) {
      entries.push({
        paymentId: payment.id,
        customerId: payment.customerId,
        customerName: payment.customerName,
        amount: payment.amount,
        method: payment.method,
        referenceNumber: payment.referenceNumber,
        receivedAt: payment.receivedAt,
        reasonEn: `Payment ${payment.id} (${payment.amount} AED, ${payment.method}) was recorded in the CRM for this period but does not appear in the imported bank statement.`,
        reasonAr: `الدفعة ${payment.id} (${payment.amount} درهم، ${payment.method}) مسجلة في النظام لهذه الفترة لكنها لا تظهر في كشف الحساب البنكي المستورد.`
      });
    }
  }
  return entries;
}
