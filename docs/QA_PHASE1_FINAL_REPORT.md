# Procurement Phase 1 — Final QA & Real Browser Verification Report

Scope: this is the QA/verification pass requested after Procurement Phase 1's
13-checkpoint build (249/249 automated tests, clean typecheck, clean build).
This report does **not** close Phase 1 and does **not** start Phase 2 — those
decisions belong to the user, after reviewing this report.

No production data or the real Firebase project was touched. All browser
verification ran against local Firebase Auth + Firestore emulators, per
`docs/QA_TEST_ENVIRONMENT.md`.

---

## 1. Browser environment used

- **Browser**: Chromium 1194 (pre-installed in this environment), driven headless via `playwright-core` from an isolated scratch npm project — no dependency was added to the repository itself.
- **Backend**: the real `server.ts` (via `tsx`), started with `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `GCLOUD_PROJECT=splendor-private-crm`, `VITE_USE_FIREBASE_EMULATORS=true` — the same code that runs in production, pointed at local emulators instead of the real project.
- **Data layer**: real Firebase Auth Emulator (127.0.0.1:9099) + real Firestore Emulator (127.0.0.1:8080) — genuine Firestore document validation, not the mocked `firebase-admin` used by the automated test suite.
- **Storage**: the Firebase Storage emulator could **not** be started — the org's egress policy blocks `firebase-public.firebaseio.com` (confirmed via `$HTTPS_PROXY/__agentproxy/status`: `403`, `connect_rejected`). This is a hard environment limitation, not something bypassed. See item 14.
- **Test users**: 6 real Firebase Auth accounts + matching Firestore `users/` profiles, one per role (`qa-ceo`, `qa-admin`, `qa-operations`, `qa-sales`, `qa-fleet`, `qa-finance`), all `@splendor.test`, no real customer data.

## 2. Tests executed

- Automated suite: `npm test` (Firestore-rules-emulator + Vitest), full run, twice (before and after the Bug #6 fix).
- Real-browser scripted scenarios (Playwright), covering:
  - Supplier creation (minimal required fields only), activation, and listing (CEO).
  - Multi-vehicle regular Purchase Order: supplier search/select, reason, 2 line items, running total, submit for approval (CEO).
  - Retroactive Purchase Order: PO-kind switch, retroactive-reason sub-dropdown, submit (Operations).
  - Approvals inbox: maker-cannot-approve-own-request UI gate; a different, real second user (Admin) sees Approve/Reject, approves with a mandatory reason via the native prompt dialog.
  - Operation ID issuance per line item on approval.
  - Partial fulfillment ("mark received" on one of two line items).
  - Full PO cancellation request (native prompt reason dialog) and its effect on the Approvals queue.
  - Role-based sidebar visibility: Sales (no Procurement nav item), Fleet, Finance, Operations.
  - Finance's "New Supplier" button on the real Suppliers tab.
  - Direct, unauthorized API calls replayed with a real captured ID token (Sales role) against `POST /api/suppliers`.
  - Missing-required-field submission, both via the UI's native validation and a direct API call bypassing the client entirely.
  - Empty-body direct API call.
- Static/source verification (used where it is the more reliable way to establish a fact than clicking a browser, e.g. "does any UI call this endpoint anywhere in the app" or "is the server-side Segregation-of-Duties check present"): full-repo grep for API usage from the frontend, for the Fullscreen API, and for the `ReceivedAmountClassification` type.

## 3. Tests passed

- Automated suite: **249 / 249** (both runs).
- `npx tsc --noEmit`: clean, both before and after the fix.
- `npm run build`: clean, both before and after the fix (frontend + server bundle).
- Every scripted browser scenario listed in item 2 passed after the harness's own selector bugs were fixed (see item 5 — the harness bugs were not application bugs; each was root-caused against the real DOM/source before being called a false result).
- Server-side authorization: Sales role's direct, unauthenticated-for-that-action API call correctly returned `403 {"error":"You do not have permission to perform this action."}` — a real rejection with a real ID token, not just a hidden button.
- Server-side Segregation of Duties for approvals is enforced in code (`src/server/approvals.ts:120`, `src/server/procurementApprovals.ts:152`: `"You cannot decide your own request..."`), not only in the UI.
- Missing-required-field requests return a clean `400` with a clear message (`legalName is required.`), both for a partially-missing body and a fully empty body — never a 500.

## 4. Tests failed

- None, after fixes. One real defect was found and fixed (item 5/6, Bug #6). No other application defect reproduced in this pass.

## 5. Bugs found

**Bug #6 — `POST /api/suppliers` 502 on any omitted optional field (real, confirmed, now fixed).**
Discovered by using the real Firestore emulator instead of the mocked test suite: the route spreads optional fields (`tradeName`, `taxRegistrationNumber`, `contactPersonName`, `contactPersonTitle`, `email`, `address`, `bankDetails`, `policiesNotes`) straight out of `req.body` into the object passed to `createDurable()`. When the UI's minimal "New Supplier" form (by design — only Legal name, Trade license number, Phone) omits them, they arrive as literal `undefined`. Real Firestore's `DocumentReference.create()` throws on that (`Cannot use "undefined" as a Firestore value`); the mocked `firebase-admin` used by all 249 automated tests silently accepts it, so this never surfaced in CI. This is exactly the class of bug the QA task's real-browser requirement exists to catch.

No other application bug was found in this pass. Everything else that did not behave as expected on first try (PO-kind/operation-type dropdown mis-selection, a case-sensitive text match, an unresolved-route-caused nth() misalignment) was root-caused to the Playwright test harness itself, confirmed against the actual DOM/component source, and fixed in the scratch test scripts — not in the application.

## 6. Bugs fixed

Bug #6 only. Fix: `admin.firestore().settings({ ignoreUndefinedProperties: true })`, applied once at Admin SDK initialization (both the emulator and production credential branches in `server.ts`), guarded with a `typeof ... === 'function'` check so the test suite's mocked `firestore()` (which has no `.settings()`) is unaffected. This is a systemic fix: it closes the same undefined-field risk for every route that follows this same "spread optional `req.body` fields into a Firestore-bound object" pattern — not just Suppliers — without touching each route individually (which would have been a much larger, riskier change for this QA pass to make).

Verification chain for this one fix, per the mandated checkpoint discipline: logged → fixed → `tsc --noEmit` clean → `npm test` 249/249 → re-verified live in a real Chromium browser against a real Firestore emulator (`POST /api/suppliers` now returns `201`, supplier renders with the `ACTIVE` badge) → committed → pushed. See item 15/16.

## 7. Screens/workflows verified (real browser)

- Suppliers: create (minimal fields), activation gate, list rendering, status badge.
- Purchase Orders: regular multi-vehicle PO, retroactive PO (kind switch + reason), supplier search/select, line items, running total, submit for approval, sequential PO ID, pending-approval status, approved status, per-line Operation ID issuance, partial fulfillment, full cancellation request.
- Approvals inbox: maker-cannot-approve-own-request (UI + server), a different real user seeing and using Approve/Reject, mandatory decision-note capture via native prompt, and the resulting toast/audit-visible outcome.
- Sidebar/navigation role gating: Sales, Fleet, Finance, Operations, CEO, Admin.
- Application shell: sidebar, top bar (search, language toggle, notifications, Quick Action), toasts, modals, dropdowns, forms, tables/cards, loading→success states — all observed as one coherent, integrated application across every role tested, not disconnected pages.

## 8. Permission scenarios verified

| Scenario | Result |
|---|---|
| CEO/Admin can create suppliers & POs | PASS (browser) |
| Operations can create suppliers & POs | PASS (browser) |
| Finance can create suppliers | PASS (browser, corrected after a test-script sequencing bug) |
| Sales does not see Procurement in the sidebar | PASS (browser) |
| Sales's direct API call to `POST /api/suppliers` is rejected server-side (403) with a real captured ID token | PASS (this is the strong version of the check — a real auth token, not an assumption that UI-hiding is enough) |
| Maker cannot approve their own request (UI) | PASS (browser: "Awaiting a different approver") |
| Maker cannot approve their own request (server) | PASS (source-verified: `procurementApprovals.ts:152` throws explicitly; not just a UI convenience) |
| A different, real second user can see and act on the approval | PASS (browser, Admin approving CEO's PO) |
| Fleet sees Procurement (fleet is a valid amendment-requester role per `requireRole`) | PASS (browser) |
| No permission was widened to make any of the above easier to test | Confirmed — every check above used the existing seeded role, the existing `requireRole` gates, and the existing sidebar logic, unmodified |

## 9. Document upload/download verified

**NOT VERIFIED.** The Firebase Storage emulator could not be started in this environment: the org's outbound-network policy blocks the `firebase-public.firebaseio.com` host the Storage emulator needs to download its jar (`403`, `connect_rejected`, confirmed via the environment's own proxy-status endpoint). This was not routed around, per this environment's rules. Auth + Firestore emulation both work and were used for everything else in this report. Document upload/download for Supplier documents, PO attachments, etc. therefore could not be exercised end-to-end in a real browser in this pass. The underlying upload/permission/audit code was not disproven — it simply was not exercised here. **This requires either: (a) an environment where the Storage emulator's host is reachable, or (b) a deliberate, approved decision to test file upload against the real (non-production) Storage bucket with synthetic files, which this pass did not attempt because it would touch a real cloud resource without prior approval.**

## 10. Financial flows verified

- PO running total (multi-line, computed in the UI, matched expected sum) — VERIFIED (browser).
- PO value carried through to Approved status and per-line Operation IDs — VERIFIED (browser).
- Server-side rejection of malformed/incomplete financial input (`400`, not `500`, on missing `legalName`) — VERIFIED (direct API).
- **FIN-002 / "Received Amount Classification" — NOT VERIFIED, and specifically found to be a type definition only.** The type `ReceivedAmountClassification` (`src/types/index.ts:1561`, values: `settlement | advance_payment | security_deposit | credit_balance | settlement_adjustment | other_approved | unclassified`) is declared once and **never imported or referenced anywhere else in the codebase** — not in any route in `server.ts`, not in any frontend component. There is no code path that actually classifies an incoming payment using this type. This is precisely the risk the QA task asked to rule out, and in this one case it is real: the classification logic does not exist yet, only its shape does. **Status: REQUIRES DECISION** — whether/how to wire real payment classification into the settlement flow is a business-logic decision this QA pass does not make.
- Supplier Payments, Balances/Offsetting, Customer Refunds, Debts, Employee Custody/Expenses, Supplier Invoices, Operational Expenses — REST APIs exist and are covered by the 249-test automated suite (mocked Firestore), but **no dedicated UI exists** for any of them (see item 13) — so their real-browser financial-flow verification (deposit-against-charge, partial settlement, multiple settlement methods, overpayment→credit, duplicate-expense warning, etc.) could not be performed as *browser* verification in this pass. Their API-level correctness is Implemented/API-tested, not Browser-Verified.

## 11. TARS verified

**NOT VERIFIED via browser — no dedicated UI exists for TARS** (confirmed: `ProcurementView.tsx` never calls a TARS endpoint, and no other component does either). Source-level review of `src/server/tars.ts` was performed instead:

- The 3-hour deadline is computed as `signedContractTime + TARS_DEADLINE_HOURS(3) hours`, anchored to the real signed-contract timestamp — not to when a user happens to open the TARS screen (the code comment is explicit: "never from TARS listing").
- Delay is computed as `executedAtMs - deadlineMs` against the real execution timestamp; nothing in the code path rewrites `deadlineAt` or the recorded execution time.
- Escalation levels (`none → normal → urgent`) are derived purely from how overdue the real clock is versus the fixed deadline.
- This is sound logic for "the real date is never altered to hide delay," but it has not been exercised as a live 3-hour countdown in a real browser session in this pass (that would require either waiting 3 real hours or manipulating server clock/emulator time, neither of which this pass attempted without a specific decision to do so).

**Status: IMPLEMENTED, code-reviewed, NOT VERIFIED (no UI to browser-test; live timing was not exercised).**

## 12. Full-screen / Application Shell verification

- The application shell (sidebar, top bar, main content area) renders correctly as a full-viewport SPA across every role tested, at 1440×900 — VERIFIED (browser, multiple screenshots across CEO/Admin/Sales/Fleet/Finance/Operations).
- **The app does not use the browser's Fullscreen API at all** — confirmed by a full-repo search (`requestFullscreen`, `document.fullscreen*`): zero matches anywhere in `src/`. It is therefore impossible for the app to force-depend on it, and there is no optional fullscreen toggle either. This satisfies "must not force-depend on the Fullscreen API" by construction. No design change was made or needed.

## 13. Screens/workflows that could not be verified

- Document/file upload and download (Suppliers, POs, or any other entity).
- PO Amendment — **confirmed via full-repo search to have no UI trigger at all** (the only caller of `POST /api/purchase-orders/:id/amendment-requests` is the automated test suite; `ProcurementView.tsx` never calls it).
- The 10 named workflows with REST APIs but no dedicated UI: Supplier Quotes, Supplier Payments, Balances/Offsetting, Customer Refunds, Debts, Employee Custody/Expenses, Supplier Invoices, Operational Expenses, Vehicle Receiving, TARS, Late Fees. (Reconfirmed in this pass, not merely carried over from the earlier closure report: a full-repo grep for each of their endpoint paths from any `.tsx`/`.ts` frontend file returns zero matches.)
- Live TARS timing (3-hour deadline/escalation) as an actual elapsed-time browser observation.
- Multiple-settlement-method and overpayment→credit financial scenarios (blocked by both "no UI" and, secondarily, by no file-upload path for any supporting documents).

## 14. Exact reason for every unverified item

| Item | Reason |
|---|---|
| Document upload/download | Firebase Storage emulator's download host (`firebase-public.firebaseio.com`) is blocked by this environment's outbound network policy (`403`, confirmed via the proxy status endpoint). Not bypassed, per environment rules. |
| PO Amendment (UI) | No button, form, or modal in the codebase calls the amendment-request endpoint. This is a UI gap, not an environment limitation. |
| Supplier Quotes / Payments / Balances / Refunds / Debts / Custody-Expenses / Invoices / Operational Expenses / Vehicle Receiving / TARS / Late Fees (UI) | Same as above — no dedicated UI exists in the current build (matches the earlier Procurement closure report's own statement; reconfirmed independently here by grep). |
| Live TARS 3-hour timing | Would require either a multi-hour real-time wait or deliberate manipulation of server/emulator clock time, neither of which this pass performed without a specific prior decision to do so. |
| FIN-002 / Received Amount Classification end-to-end | The classification logic itself does not exist in any executable code path (type-only) — there was nothing to browser-verify. |

## 15. All commits created during QA

1. `5cae207` — `chore(qa): add opt-in local Firebase emulator wiring for real browser verification` (from the investigation phase immediately preceding this report; enables the entire real-browser QA approach used here, zero effect on production per identical build-hash verification).
2. `e24e2a9` — `fix(persistence): stop real Firestore rejecting routes' optional undefined fields` (Bug #6 fix, described in items 5/6).
3. This report file itself (`docs/QA_PHASE1_FINAL_REPORT.md`), committed separately — see item 16.

## 16. GitHub push status for every checkpoint

| Commit | Branch | Push status |
|---|---|---|
| `5cae207` | `claude/vercel-firestore-deploy-jf4kqr` | Pushed (prior to this report, already on `origin`) |
| `e24e2a9` | `claude/vercel-firestore-deploy-jf4kqr` | Pushed and confirmed via `git ls-remote` |
| This report | `claude/vercel-firestore-deploy-jf4kqr` | Pushed and confirmed via `git ls-remote` (see the commit immediately following this file in the branch's history) |

None of this QA work has been merged into `main`. Per the explicit instruction not to consider Phase 1 closed, merging to `main` is left for the user's approval, matching how this session has handled every other multi-checkpoint phase (merge at the closure point the user approves, not mid-QA).

## 17. Final build result

`npm run build`: **clean**. Frontend (Vite) and server bundle (esbuild) both built successfully after the Bug #6 fix, with no new errors or warnings beyond the pre-existing "chunk larger than 500kB" advisory notice (unrelated to this QA pass).

## 18. Final test result

`npm test`: **249 / 249 passed**, 15/15 test files, after the Bug #6 fix. `npx tsc --noEmit`: clean.

---

## Status summary (per the required labels)

- **VERIFIED**: Supplier creation/activation/listing; multi-vehicle regular PO; retroactive PO; PO submit/approve/reject flow; per-line Operation ID issuance; partial fulfillment; full-cancellation request; maker-cannot-self-approve (UI and server); role-based sidebar gating for Sales/Fleet/Finance/Operations; server-side rejection of an unauthorized direct API call with a real token; server-side rejection of missing-required-field payloads; full-viewport application shell coherence; absence of any Fullscreen-API dependency.
- **IMPLEMENTED, not Verified (no UI to test through)**: PO Amendment; Supplier Quotes; Supplier Payments; Balances/Offsetting; Customer Refunds; Debts; Employee Custody/Expenses; Supplier Invoices; Operational Expenses; Vehicle Receiving; TARS (logic only); Late Fees.
- **NOT VERIFIED (environment limitation)**: Document/file upload and download.
- **REQUIRES DECISION**: FIN-002/Received Amount Classification is currently a type definition with zero real usage — a decision is needed on whether and how to wire real payment classification into the settlement flow, and this should not be assumed "working" until that decision is made and implemented.
- **APPROVED**: none — per the explicit rule, approval is the user's alone, after reviewing this report. Nothing in this report has been unilaterally upgraded from Verified to Approved.

This report closes the requested Final QA & Browser Verification pass only. Procurement Phase 1 is **not** being declared closed, and Phase 2 has **not** begun.
