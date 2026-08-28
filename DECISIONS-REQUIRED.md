# Decisions Required

Produced by the Repository Audit & Architecture Cleanup phase. Each item
below needs a business or operational decision this audit will not make
on its own behalf. Nothing described here has been acted on.

---

## 1. Google AI Studio scaffold files — keep or remove?

**The problem.** Two files exist purely as artifacts of Google AI Studio,
the platform this project was originally created in or is still connected
to: `metadata.json` (a project manifest — name, description, capabilities)
and `assets/.aistudio/.gitignore` (an empty scaffold folder). Neither is
read by this app's own source code, build pipeline (`vite.config.ts`,
`tsconfig.json`), or deployment configuration (`vercel.json`) — confirmed
by reference search across the whole repository. See `PROPOSED-DELETIONS.md`
for the technical verification.

**Current situation.** They sit at the repository root, unused by the
running application, but their presence or absence may matter to the AI
Studio platform itself (e.g. its dashboard reading `metadata.json` to
display the project's name/description, or expecting the `.aistudio`
folder to exist as a marker) — something only visible from inside that
platform's own account view, not from the repository.

**Options:**
1. **Keep both, as-is.** Zero risk, zero benefit beyond tidiness. Correct
   choice if this project is still opened or managed through AI Studio.
2. **Delete both.** Slightly tidier root directory; safe for this app's
   own build and runtime either way. Correct choice if AI Studio is no
   longer used for this project and its dashboard doesn't need these
   files to keep functioning.
3. **Keep `metadata.json`, delete the empty `assets/.aistudio/` folder.**
   A middle ground if the manifest itself might still matter to the
   platform but the empty scaffold folder clearly never will.

**Impact of each option:** All three are reversible (nothing else in the
repository references either file, so removing them cannot break a build,
a test, or a running feature) and none carries a data or security risk —
this is purely a question of whether an external platform integration is
still wanted, which only the business owner can answer.

**What's needed to close this:** a decision on which option to take.
Once given, deleting the file(s) is a single, isolated, one-line commit.

**Update (governance decision, 2026-08-28):** the user has since stated
that Cloud/GitHub is now the sole development authority for this
repository and that these files must be kept unchanged "for now unless a
separate verified decision is made." That resolves this item to **Option
1 (keep both, as-is)** until a further, separate decision says otherwise.
No file was touched as a result.

---

## 2. Received Amount Classification (FIN-002) — RESOLVED, APPROVED

**The problem.** `src/types/index.ts` declares `ReceivedAmountClassification`
(`settlement | advance_payment | security_deposit | credit_balance |
settlement_adjustment | other_approved | unclassified`), but it is never
imported or referenced anywhere else in the codebase — no route sets it on
a payment, no UI reads or displays it. Found during the Procurement Phase 1
QA pass (see `docs/QA_PHASE1_FINAL_REPORT.md`, §10) while specifically
checking whether this rule is wired into the real Payment workflow, as
asked. It is not; only its shape exists.

**Current situation.** Every real payment/settlement route stores an
amount without any classification of what kind of receipt it represents.
Nothing crashes or behaves incorrectly because of this — the type is
simply inert.

**Options:**
1. **Implement it.** Decide, per payment/settlement route, how the
   classification is derived (explicit user selection at entry vs.
   inferred from context — e.g. "this settles Charge #X" vs "this has no
   linked charge yet") and store it on the persisted record, then surface
   it in whatever UI eventually exists for that workflow.
2. **Drop the type.** If this classification isn't actually needed yet,
   remove the unused type rather than leave a shape that looks load-bearing
   but is not.

**Impact of each option:** Option 1 is new business logic and needs an
explicit rule for how classification is derived — this audit will not
invent that rule. Option 2 is a one-line, zero-risk deletion of dead code.
Neither is a data or security risk either way.

**What's needed to close this:** a decision on whether Received Amount
Classification is still wanted, and if so, the actual classification rule
per settlement route.

**Update (2026-08-28): implemented per explicit approval.** The user
stated this classification is "an approved business decision" and asked
for it to be made real. `POST /api/bank-transactions/:id/reconcile` now
requires an explicit `classification` (one of the 7 values; `unclassified`
is a deliberate choice, never a silent default), and a new
`POST /api/bank-transactions/:id/reclassify` route allows changing it later
with a mandatory reason, recorded in an auditable `classificationHistory`
array on the transaction — reclassification never touches the transaction's
credit/debit/paidAmount/balanceDue. Both routes are idempotency-key
protected and require an authenticated actor (no more trusting a client-
supplied actor id). `BankReconciliationView.tsx` now requires an explicit
classification choice before confirming a match (no pre-selected default)
and exposes a reclassify flow. Verified via automated tests (added to
`tests/coreWorkflows.test.ts`) and real-browser verification against a
Firestore/Auth emulator. This item was IMPLEMENTED and VERIFIED as of that
checkpoint.

**Update (2026-08-28): APPROVED.** The user has explicitly confirmed FIN-002
as implemented and verified, and directed that it be treated as approved.
Status: **IMPLEMENTED — VERIFIED — APPROVED.** No further action on this
item; it is closed.

---

## 3. RTA integration — feasibility only, no implementation

**The problem.** The codebase has zero integration code for Dubai's Roads
& Transport Authority (RTA) — every occurrence of the string "RTA" in the
repository is literal contract-terms text (e.g. `'UAE RTA Master Terms'`
in `server.ts`), not an API client. There is no evidence of an available
official RTA API, required credentials, or partner-access agreement
anywhere in this repository or its configuration.

**Current situation.** Any RTA-related task today (vehicle registration
lookups, fine checks, licensing, plate transfers) is handled manually,
outside this system.

**Options:**
1. **Pursue an official integration.** This requires the business to first
   establish what official channel RTA actually offers (a public API,
   a corporate/enterprise portal, a partner program) — engineering cannot
   determine this from the codebase; it needs a business-side inquiry to
   RTA directly.
2. **Do nothing for now.** Zero cost, zero risk; the manual process
   continues.

**What this audit explicitly did not do:** propose or use browser
automation/scraping against RTA's systems as a substitute for an official
API. That would be a real legal and reliability risk and was correctly
out of scope without explicit approval and confirmation that it's
officially permitted.

**What's needed to close this:** a decision on whether to pursue an
official RTA channel at all, made after a business-side inquiry to RTA —
not something this audit can resolve alone.

---

## 4. Balance-offset approval-time re-validation race (found, not fixed)

**The problem.** `src/server/balances.ts`'s `computePartyBalance()` is
fully event-sourced — it recomputes a party's live net balance from scratch
by summing opening balances and every *approved* offset each time it's
called, clamping at zero (`Math.max(0, net - offset.offsetAmount)`). Two
offset requests can both be validated at request time against the same
unoffset balance (each individually valid), then both approved. Because
each `OffsetRequest` document is independent and the clamp prevents a
negative balance, no data is corrupted and no document overwrites another
— but the two offsets together can exceed what the party actually owed,
silently over-crediting one side against a balance that no longer existed
by the time the second approval landed.

**Why this was not fixed in this session.** Unlike the lost-update races
fixed elsewhere in this audit (debts.ts, customerRefunds.ts,
employeeCustody.ts, supplierPayments.ts — all a same-document
read-then-overwrite, closed with a Firestore transaction), this is a
different failure mode: a validation race across multiple independent
documents and a live aggregate query. Closing it safely requires deciding
*behavior*, not just adding a transaction: should the second approval be
auto-rejected, auto-reduced to whatever balance remains, or require the
approver to see a live-recomputed balance before deciding? That is a
business/UX judgment call, not a mechanical fix, and picking wrong risks
either under-crediting a legitimate offset or building a false sense of
protection.

**Impact today.** Low-probability (needs two pending offset requests
against the same party, both approved within the same short window) and
bounded (never goes negative), but real. No known occurrence in production
data — this was found by code reading, not from an incident.

**Options:**
1. **Re-validate the live balance inside the approval transaction** and
   reject the second approval outright if it would now exceed the
   remaining balance, forcing the approver to re-request at the correct
   amount.
2. **Auto-clamp the second approval** to whatever balance actually remains
   at decision time, recording the clamped amount plainly on the record.
3. **Accept the current bounded risk** and document it, given its low
   probability and that it can never produce an actual negative balance.

**What's needed to close this:** a decision on which of the three
behaviors is correct, since options 1 and 2 both change what an approver
sees/is allowed to do compared to today.

---

## 5. Systemic idempotency gap across Procurement Phase 1 create-routes

**The problem.** `runIdempotent()` (`src/server/idempotency.ts`) is the
established idempotency-key pattern already used for `/api/payments` and
(as of this session) the bank-reconciliation and reclassify routes. A
repo-wide survey during this session's concurrency audit found it is used
in **zero** of the Procurement Phase 1 create-routes (purchase orders,
supplier payments, customer refunds, debts, employee custody/expenses,
supplier invoices, operational expenses, vehicle receiving, supplier
quotes). This is a different risk from the lost-update races fixed in this
session: a network retry or an impatient double-click on a *create* call
(e.g. "record this settlement," "submit this expense") can create two
separate records for what was meant to be one action, rather than one
write silently overwriting another.

**Why this was not fixed in this session.** Retrofitting idempotency keys
across ~9 modules' create-routes (client header generation, server-side
wrapping, and a test per route) is a large, mechanical but non-trivial
change that touches every Procurement create endpoint — judged as
Phase-2-sized rather than a "safe, obviously-in-scope" localized fix
alongside the lost-update fixes this session prioritized instead.

**Impact today.** Genuine duplicate-submission risk exists on every
Procurement create-route, but requires an actual retry or double-submit to
trigger — no known production occurrence.

**What's needed to close this:** either explicit prioritization to do the
retrofit as its own tracked piece of work, or an accepted-risk decision
that this is deferred until a specific route shows a real duplicate.

---

## 6. Eight Procurement Phase 1 workflows have zero frontend UI

**The problem.** Of the ~15 Procurement Phase 1 backend workflows
(`src/server/*.ts`), only Suppliers, Purchase Orders (+ amendment), the
universal Approvals inbox, TARS, Late Fees, and (as of this session) Debts
have any UI in `ProcurementView.tsx`. Supplier Quotes, Supplier Payments,
Balances/Offsetting, Customer Refunds, Employee Custody/Expenses, Supplier
Invoices, Operational Expenses, and Vehicle Receiving are backend-complete
(each with its own HTTP test coverage in `tests/procurement.test.ts`) but
have zero context-layer wiring and zero screen — confirmed by a
repository-wide search finding no reference to any of their API paths
outside `server.ts` itself.

**Why this was not built in this session.** Each of the workflows already
built to full depth this session (PO Amendment, TARS, Late Fees, Debts)
required substantial per-feature UI work — new modals, an approval-context
resolver, real-browser verification — on the order of what building all
eight remaining ones properly would multiply eight-fold. Building all
eight in the time remaining would have meant shipping shallow,
under-verified screens, which the mission's own instructions explicitly
warned against ("use engineering judgment... rather than shipping 8
shallow/disconnected screens").

**What's needed to close this:** a decision on priority order for the
remaining eight (which ones the business actually needs operators to use
day-to-day vs. which can stay API-only for now), then each one built to
the same depth (context wiring, modals, approval-context resolution, real
browser verification) as PO Amendment/TARS/Late Fees/Debts.
