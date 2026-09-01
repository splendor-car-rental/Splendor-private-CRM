# Splendor OS 3.0 — Finance & Accounting Architecture

## Scope

This workstream adds a server-authoritative accounting layer beside the existing operational finance functions. It does **not** seed, reset, backfill, delete, or rewrite production records. Existing customer invoices, payments, deposits, supplier invoices, purchase orders, bank transactions, vehicles, and contracts remain the operational source records they were before this change.

## Before

The CRM already had durable operational finance capabilities:

- customer invoices and 5% VAT calculation;
- customer payment recording and receipt numbering;
- security-deposit custody, approved-charge deductions, and refunds;
- bank-statement import and reconciliation;
- company bank accounts;
- procurement, supplier invoices, supplier-payment approvals, employee custody/expenses, and operational expenses;
- immutable/tamper-evident audit logging;
- approved corporate PDF/document generation.

The missing boundary was a true accounting ledger. Operational changes directly updated balances/statuses, but there was no Chart of Accounts, balanced journal, accounting period, Trial Balance, P&L, Balance Sheet, VAT ledger, AR/AP aging, or controlled historical-posting gap report.

## After

The accounting path is:

`Operational source → explicit accounting posting → balanced JournalEntry → account balances → financial reports`

Every accounting journal:

1. has at least two lines;
2. rejects negative debit/credit amounts;
3. rejects a line that is debit and credit simultaneously;
4. requires total debit to equal total credit to the cent;
5. validates every account against the effective Chart of Accounts;
6. is idempotent for a given source/action using a deterministic journal identifier;
7. refuses to post into a closed period;
8. is audit logged;
9. is never hard-deleted or edited to reverse its economic effect — a reversal is a new inverse journal.

## Collections

The new accounting layer uses additive Firestore collections only:

| Collection | Purpose |
|---|---|
| `accounting_accounts` | Configurable overlays/custom additions to the controlled default Chart of Accounts |
| `accounting_journals` | Posted immutable-effect double-entry journals and reversal links |
| `accounting_periods` | Accounting period close state |
| `accounting_expenses` | Finance expense workflow and posting status |
| `accounting_payables` | AP entries created from explicitly posted approved supplier invoices |
| `accounting_payable_payments` | Supplier/AP settlement records |
| `accounting_financial_notes` | Credit/debit notes linked to original customer invoices |
| `accounting_manual_journal_requests` | Four-eyes manual-journal requests |

No existing collection is renamed or migrated.

## Effective Chart of Accounts

`src/config/accounting.ts` provides a controlled default UAE-car-rental-oriented chart. It is a **code fallback, not a data seed**. `accounting_accounts` overlays those definitions at runtime, and custom accounts can be added without changing historical journals.

System control accounts protect their accounting class, normal side, and control-account behavior from UI/API reclassification because changing those properties later would reinterpret history.

Core control accounts include:

- Cash, Bank, Card/Payment Gateway Clearing;
- Accounts Receivable;
- VAT Input;
- Accounts Payable;
- Customer Security Deposits Held;
- VAT Output/Payable;
- Customer Credits / Unallocated Receipts;
- Fleet Vehicle assets and vehicle finance;
- rental/LTO/extra-charge/recharge/damage revenue;
- detailed vehicle/office operating expense accounts.

## Expenses

A finance expense records:

- date, vendor, category, account;
- amount before VAT, VAT, total;
- payment method and paid/unpaid state;
- cash/bank settlement account when paid;
- reference;
- optional vehicle, contract, supplier, branch dimensions;
- notes and attachment-document identifiers;
- creator, approver/rejector, posting status and journal identifier.

The creator cannot approve their own expense. Approval posts the journal. Rejection leaves no accounting posting.

The system validates `net + VAT = total`; it does not infer VAT from a gross amount.

## Accounts Payable

Approved procurement supplier invoices are not silently converted to accounting liabilities. A finance user must explicitly provide:

- amount before VAT;
- VAT amount;
- due date;
- expense account.

Those values must add exactly to the already-approved supplier invoice total. This avoids inventing VAT or payment terms that were never captured by the procurement workflow.

Posting creates:

- Dr Expense;
- Dr VAT Input (when explicitly supplied);
- Cr Accounts Payable.

AP payments support partial settlement and refuse overpayment. Settlement posts Dr AP / Cr selected cash-bank account.

## Accounts Receivable and Customer Payments

The production `/api/payments` boundary is routed through a safe writer that supports:

- a single legacy `invoiceId` for backwards compatibility;
- explicit multi-invoice allocations;
- partial allocations;
- concurrency-safe invoice re-checking inside the Firestore transaction;
- rejection of invoice over-allocation;
- unallocated customer credit instead of silently overpaying an invoice;
- customer outstanding balance reduction only for the amount actually allocated.

A payment can be assigned to a cash/bank/card clearing account for accounting posting. Unallocated receipts post to the Customer Credits liability, not revenue.

## Credit and Debit Notes

A posted/issued invoice is not rewritten to change its economic value. Post-issuance reductions/increases use an independent credit/debit note linked to the invoice and its own journal.

Customer-statement/AR reporting applies those notes as adjustments while preserving the original invoice record.

## VAT

The accounting VAT view is journal-derived:

- Output VAT from customer revenue documents;
- Input VAT from explicitly classified expenses/supplier invoices;
- VAT payable = Output VAT − Input VAT.

No unverified tax treatment, recoverability rule, or supplier VAT value is invented. The existing project 5% calculation remains intact for its current invoice flows; new AP/expense posting requires explicit VAT amounts.

## Security Deposits

A manually collected security deposit is an accounting liability:

- Dr Cash/Bank;
- Cr Customer Security Deposits Held.

An uncaptured gateway authorization hold is **not** treated as cash received and is rejected from receipt posting.

Operational deposit deductions still require an approved, unused charge under the existing workflow. The accounting layer deliberately does not guess whether an older historical deduction should offset AR, a revenue account, or another settlement account; historical gaps are surfaced for controlled review instead of automatic backfill.

## Bank Reconciliation

Reconciliation and accounting are distinct controls. A reconciled bank transaction can be explicitly linked to a real accounting journal. The link stores the journal identifier and accounting posting status on the bank transaction and is audit logged.

This prevents a reconciliation boolean from being treated as if it were itself an accounting posting.

## Period Closing

CEO/Admin can close a `YYYY-MM` period with a mandatory reason. Closing is blocked when the period contains approved-but-unposted finance expenses or pending manual-journal requests.

Once closed:

- new journal postings into that period fail;
- no direct reopen operation is exposed;
- corrections must use a reversal/adjustment in an open period.

A future reopen policy requires an explicit governance/business decision and is therefore intentionally not invented here.

## Reports

The accounting engine derives:

- Trial Balance;
- Profit & Loss;
- Balance Sheet;
- VAT summary;
- Cash/Bank Book;
- AR aging;
- AP aging;
- Customer statement;
- Supplier statement;
- Vehicle profitability;
- Executive finance dashboard;
- posting-gap inventory.

Vehicle profitability uses journal-line vehicle dimensions. It does not fabricate vehicle acquisition cost or utilization days; ROI/day metrics are omitted when the source values are unavailable.

## Historical migration strategy

There is **no automatic production backfill**.

`GET /api/accounting/posting-gaps` inventories existing operational records lacking an accounting journal, including issued invoices, payments, manual deposits, approved supplier invoices, and reconciled bank transactions.

A historical source can then be posted only after its missing accounting metadata (account, VAT breakdown, due date, settlement account, etc.) is explicitly known. This keeps the migration backward-compatible and prevents the system from generating false historical accounting entries.

## Security boundary

- Accounting APIs require a valid Firebase ID token.
- Role is read server-side from `users/{uid}`; role/actor values in request bodies are ignored.
- Accounting operations are limited to CEO/Admin/Finance.
- Period close and journal reversal are limited to CEO/Admin.
- Expense and manual-journal approval enforce requester ≠ approver.
- Accounting audit entries use the existing tamper-evident `audit_logs` hash chain.
- No accounting endpoint provides hard delete for posted journals, financial notes, expenses or AP settlements.

## Approved corporate documents

The existing `/api/corporate-documents` engine remains authoritative for approved PDF output and already supports tax invoices, simplified tax invoices, receipts, credit notes, debit notes, account statements and other approved document kinds. This workstream does not redraw or alter the approved header/footer and does not modify Lease-to-Own source art.
