# Release Acceptance Matrix — Splendor OS 3.0 Stabilization (PR #56)

Built per P4 of `docs/SPLENDOR_OS_3_EXECUTION_BLUEPRINT.md`. Every row cites
real evidence (a commit, a test, or an explicit, named limitation) — never
"code exists" or "CI is green" alone, per Rule 14. Evaluated against
`stabilization/clean-recovery-20260903` at commit `66aecd7` (2026-09-03).

Status legend: **PASS** (verified with evidence) · **FAIL** (verified
broken) · **UNVERIFIED** (not independently proven either way, with the
specific reason given) · **DEFERRED** (explicitly out of scope by the
user's own decision this session, not an oversight).

## Issue #35 — Contract extension transaction read-before-write

| Requirement | Status | Evidence |
|---|---|---|
| All Firestore reads in `POST /api/contracts/:id/extend` happen before any write | **PASS** | `src/server/contractExtensionRecovery.ts`'s `executeContractExtensionTransaction()` reads the contract then the vehicle before either `tx.set()`. `server.ts`'s own duplicate handlers (which had the bug: `tx.set(contractRef)` before `tx.get(vehicleRef)`) were removed and replaced with delegation to the same function — commit `0225586`. |
| Real Vercel production route already used the safe implementation | **PASS** | `vercel.json` rewrites `/api/contracts/:contractId/extend` to `api/contract-extension-safe.ts`, which has always called `executeContractExtensionTransaction()`. The bug closed by `0225586` was reachable only via local dev and tests that call `server.ts` directly (every test in `tests/coreWorkflows.test.ts`), not via the deployed Vercel app. |
| Regression test proves the invariant, not just the happy path | **PASS** | `tests/contractExtensionRecovery.test.ts` (strict mock, throws on read-after-write) + `tests/coreWorkflows.test.ts`'s shared transaction mock was made to enforce the same rule (commit `0225586`); reverting the `server.ts` fix against that mock reproduces the original failure (verified interactively this session, not just asserted). |
| Extension calculation/addendum behavior preserved | **PASS** | `tests/coreWorkflows.test.ts`'s extend tests assert the exact `extraDays`/`grandTotal` arithmetic unchanged. |

**Issue #35: PASS**, evidence-backed, ready to close.

## Issue #36 — Rental lifecycle metrics and financial closure semantics

| Requirement | Status | Evidence |
|---|---|---|
| One authoritative `totalRentals` event, not two | **PASS** | `createContractDurable()` (`src/server/contractOps.ts`) never touches `totalRentals`/`lifetimeValue`. Only `POST /api/contracts/:id/handover` increments `totalRentals` (`server.ts`), and only once (rejects a second handover with 409). |
| Both contract-entry paths (direct, reservation-derived) consistent | **PASS** | Neither path increments at creation; both converge on the same handover event. `tests/coreWorkflows.test.ts`'s `POST /api/reservations/:id/create-contract` test asserts `totalRentals`/`lifetimeValue` unchanged after reservation-to-contract creation. |
| Physical return separated from financial closure | **PASS** | `POST /api/contracts/:id/return` moves `active → settlement_pending` only, never recognizes `lifetimeValue`/vehicle `totalRevenue`; `POST /api/contracts/:id/close` (`settlement_pending → completed`) is the sole recognition event, exactly once (rejects double-close with 409). `tests/coreWorkflows.test.ts` covers both idempotency guards. |
| Charges/invoice/deposit/balance remain single-ledger | **PASS** | Additional-charge creation is part of the same `return` transaction (`tx.create` inside the same `runDurableTransaction`), not a separate uncoordinated write. |

**Issue #36: PASS**, evidence-backed, ready to close.

## Issue #39 — Stabilization & Closure Gate (tracking issue)

Tracking-only; its checklist mirrors #35/#36/#41/#54/#55 below. Status is
the aggregate of those issues. Not independently actionable beyond
updating its checklist once the others are dispositioned by the owner.

## Issue #41 — Document conformity (approved letterhead and stamp)

| Requirement | Status | Evidence |
|---|---|---|
| Server-side PDF generators use the real approved letterhead | **PASS** | `src/server/assets/ltoLetterheadAsset.ts` rewritten with the real extracted header/footer (was a 1x1 placeholder). Used by `leaseToOwnContractDocument.ts` and `corporateDocumentEngine.ts` — commit `008cf99`. |
| PDF header/footer margins sized correctly for the real asset (no clipping) | **PASS** | Recomputed from the real image's pixel dimensions in both generators — commit `008cf99`. Verified by rendering a real LTO contract and a real tax invoice through Puppeteer and inspecting the output PDF pages directly. |
| Client-side (browser print/export) path also uses the real asset | **PASS** | `OfficialLetterheadLayout.tsx` previously hand-drew an approximate recreation; replaced with the real header/footer served as static files (`public/splendor-letterhead-header.jpg`, `-footer.png`) — commit `532d29a`. Verified by rendering the actual layout structure through headless Chromium. |
| The approved letterhead cannot be overridden by a user | **PASS** | The prior "custom_bg" mode (user-uploaded image replacing the letterhead, persisted in `localStorage`) removed entirely — commit `532d29a`. |
| Approved stamp placed at the signature/approval anchor everywhere required | **PASS** | Already correct in server-side PDFs (`corporateDocumentStamp.ts`'s `applyCorporateStamp()`). Was missing (text-only placeholder) in all four browser print/export modals; added via `CorporateStampMark.tsx` — commit `66aecd7`. |
| A4/RTL/no-clipping tested | **PASS (visual, one-off)** | Verified via real rendered screenshots/PDF pages this session for one representative document per path (LTO contract, tax invoice, and a synthetic stamp preview). Not a permanent automated check — see next row. |
| Automated regression preventing a future placeholder/redraw regression | **FAIL / gap** | No such test exists. This repository has no React component test harness (`@testing-library/react` is not a dependency) to assert `OfficialLetterheadLayout` renders the real asset, and no PDF-visual-regression test for the server-side generators. A future edit could silently reintroduce a placeholder or a hand-drawn recreation and nothing in CI would catch it. **This is the one concrete, unresolved gap left by this issue's own stated exit criterion** ("إنتاج حالات اختبار تمنع مستقبلاً إعادة رسم أو تغيير الأصل المعتمد"). |
| Multi-page document conformity | **UNVERIFIED** | Not tested — every sample rendered this session fit on one A4 page. A long LTO contract with many installments, or a long account statement, was not verified for correct header/footer repetition across pages. |

**Issue #41: PASS on every rendering path audited this session, with two named, real gaps** (no regression test against a future placeholder regression; multi-page behavior unverified). Recommend: close as substantially resolved, or keep open specifically for those two items — owner's call.

## Issue #54 — Tax Compliance Red-Team Remediation Gate

This issue tracks the adversarial red-team review of the **much larger**
tax engine built inside PR #47 (blocking-exception concurrency proofs,
reconciliation-snapshot freshness invalidation, a Professional Validator
Registry, source/rule version pinning). That PR was closed without merge
as superseded forensic evidence, and per this session's explicit,
recorded decision with the user (asked directly: build the full
red-team-remediated system, or a smaller safe version now — user chose
**"نبني نسخة أساسية آمنة الآن"**, the smaller version), none of that larger
engine was recovered onto this branch. What exists instead is
`src/server/taxPeriods.ts`, a deliberately minimal draft → under_review →
reviewed workflow.

| Requirement (from #54's checklist) | Status | Evidence |
|---|---|---|
| VAT math correct (net vs. gross) | **PASS** | `calculateVatOnNet`/`extractVatFromGross` split, one confirmed real bug fixed (reservation-to-contract conversion) — commit `161f81e`. |
| Stale evidence invalidates downstream readiness | **PASS (minimal form)** | `taxPeriods.ts`'s `evidenceRevision` (SHA256 of posted journals in the period) detects a late posting after review and forces re-preparation — `tests/taxPeriods.test.ts`'s staleness test. |
| One authoritative Posting Gap engine | **PASS** | `taxPeriods.ts` calls the existing `getExtendedPostingGaps()` (`extendedPostingGaps.ts`), the same engine Finance already used — no second implementation introduced. |
| Four-Eyes / actor separation on tax mutations | **PASS (minimal form)** | `review_tax_period` registered on the existing generic Procurement Approval engine; self-approval rejected with 409 — `tests/taxPeriods.test.ts`. |
| No Filing API, no Submit Return, no `READY_FOR_FILING`/`Filed` status, no Tax DELETE | **PASS** | Confirmed by direct search: no such route, status value, or delete path exists anywhere in `src/server` or `server.ts`. |
| `blockingExceptionCount` cannot diverge from real open blockers (concurrency-proof) | **DEFERRED** | No blocking-exception engine exists on this branch at all — by the user's explicit choice this session to build the minimal version instead. Not a defect in what was built; it is a feature that was not built. |
| Reconciliation-run freshness (concurrent reconciliation runs, inconsistent snapshots) | **DEFERRED** | No reconciliation-snapshot engine exists on this branch — same reason. |
| Professional Validator Registry, preparer ≠ reviewer ≠ external professional | **DEFERRED** | Explicitly deferred this session: asked whether to build it next, user said move to the next phase instead. `taxPeriods.ts`'s `reviewedBy !== preparedBy` check is the only separation enforced; there is no external-professional role or registry. |
| Source/rule version pinning, superseded-version preservation | **DEFERRED** | Not built. `config/tax.ts`'s `UAE_VAT_RATE` is a single hardcoded current-rate constant with no version history. |

**Issue #54 is not closeable as originally scoped.** The permanent
restrictions (no filing capability) are genuinely satisfied and verified.
The narrower P2 scope this session actually built (VAT math, evidence
staleness, posting gaps, Four-Eyes) is genuinely done and tested. The
larger red-team engineering checklist describes a system that does not
exist on this branch by deliberate, already-recorded user choice, not by
omission. **Recommend**: either (a) close #54 with a comment narrowing its
scope to what this recovery cycle actually committed to, opening a new
issue for the deferred Professional Validator Registry / reconciliation
engine work if the user wants it built later, or (b) keep #54 open
exactly as-is and treat the deferred items as its remaining content. This
is a scope decision, not an engineering one — owner's call.

## Issue #55 — Legacy Requirements & UX Acceptance Recovery

| Requirement | Status | Evidence |
|---|---|---|
| Sidebar scrolls independently, doesn't trap page scroll | **UNVERIFIED (code-reviewed only)** | `Sidebar.tsx` uses `h-screen` fixed/sticky with an internal `flex-1 overflow-y-auto` nav region — structurally correct pattern. Not independently verified in a real browser: this session's sandboxed environment blocks the Firebase Auth emulator's one-time binary download (`connect_rejected` to `firebase-public.firebaseio.com`, confirmed and documented in `docs/QA_TEST_ENVIRONMENT.md`), so the login-gated app cannot be driven end-to-end here. |
| Login/auth screens usable on short/mobile viewports | **UNVERIFIED (code-reviewed only)** | `AuthScreens.tsx` uses `min-h-screen ... flex items-center justify-center` — correct pattern, same browser-verification limitation as above. |
| No horizontal overflow / black edge | **UNVERIFIED** | Not tested in a real browser this session, same limitation. |
| Modals scroll internally, controls stay reachable | **UNVERIFIED** | Not audited this session. |
| Tables usable on mobile without clipping | **UNVERIFIED** | Not audited this session. |
| RTL/Arabic layout doesn't collapse tabs/controls | **UNVERIFIED** | Not audited this session. |
| Date display format (DD/MM/YYYY) consistent, no timezone shift | **PASS** | Real, confirmed, previously-shipped bug found and fixed: `src/lib/dateFormat.ts`'s date-only strings were parsed as UTC midnight then read with local getters, shifting a day backward for any timezone west of UTC. Fixed via direct digit extraction, proven by `tests/dateFormat.test.ts` running under a forced `America/Los_Angeles` timezone (the failing direction) — commit `fd0c011`. |
| PDF/document dates match source records | **PASS (for the cases checked)** | LTO installment due dates verified to use full ISO timestamps, not date-only strings, so they don't hit the same bug class. Not exhaustively audited across every document generator. |
| «سحابة» (fabricated "cloud") branding removed | **PASS** | 6 fabricated "Splendor Cloud"/"سحابة سبلندر" references replaced with honest descriptions of real Firestore sync — commit `6f2acc4`. |

**Issue #55 is genuinely partial.** The date-format and cloud-branding
items are real, fixed, and tested. The scroll/viewport/modal/table/RTL
items remain code-reviewed only, not behaviorally proven, due to a named
environment limitation (Auth emulator blocked in this sandboxed session)
rather than being skipped. **Recommend**: verify the unverified rows on a
machine with normal outbound internet access (a developer laptop, CI
runner, or non-sandboxed Claude Code session) before treating #55 as
closeable — this is exactly the kind of runtime/behavioral requirement
Rule 14 says code existing does not satisfy.

## Overall recommendation

Not all six gates have full evidence on this exact HEAD. Per Issue #39's
own non-negotiable rule ("Do not merge #56 into main until every
applicable blocking gate above has evidence... Owner explicitly
authorizes merge"), **PR #56 should not be merged yet.** What is
genuinely ready:

- #35, #36: **PASS**, closeable now.
- #41: **PASS** with two named residual gaps (no anti-regression test, multi-page unverified) — owner's call whether those block closing.
- #54: requires an owner scope decision (narrow the issue vs. keep the deferred items open) before it can be dispositioned either way.
- #55: requires real-browser verification outside this sandboxed session before its scroll/viewport/modal/table/RTL rows can move past UNVERIFIED.
