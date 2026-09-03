# SPLENDOR OS 3.0 — EXECUTION BLUEPRINT

Version: 2.0 (supersedes 1.0)
Date: 2026-09-03
Repository: splendor-car-rental/Splendor-private-CRM
Authored jointly by Ahmed and Claude, after independently verifying live GitHub/CI state against three prior planning documents (v1.0 of this file, a separate ChatGPT stabilization handoff, and Claude's own session history).

## PURPOSE
Durable execution checkpoint for Splendor OS 3.0. Resume from this document in a new conversation without losing the implementation position. This version corrects v1.0's Phase 0 plan after its literal execution produced an unmergeable 205-commit branch (see "Why Version 2.0" below) — the vision in Phases 1-10 is unchanged, only the recovery method and current checkpoint are corrected.

## WHY VERSION 2.0
v1.0's Phase 0 instructed a full reconciliation of the `integration/ai-studio-import` lineage into `main` in one pass. Executed literally, this produced PR #47 (`feat/contextual-documents-customer-intake`): 205+ commits, ~160 changed files, impossible to review or safely merge. Ahmed correctly rejected merging it. **PR #47 is permanently closed and archived — never merge it, wholesale or by mass cherry-pick.** Verified findings developed inside it (see "Recoverable Forensic Sources" below) remain useful as reference, reimplemented individually, never transplanted by SHA.

The corrected method (already proven across six batches — see Checkpoint below): reconcile **one feature/invariant/file at a time** — inspect the old implementation, understand the real invariant, reimplement it cleanly on the current trusted baseline, add a real test, gate on CI+CodeQL, commit in isolation — never a mass merge.

## NON-NEGOTIABLE RULES (unchanged, reaffirmed)
1. Never modify production `main` directly; never force-push; never rewrite `main` history.
2. Work through dedicated branches and PRs. One active integration branch during stabilization (see Single Path below); return to small-branch/small-PR-per-change once stabilization is accepted.
3. Never delete an approved feature merely because another branch implemented it differently — reconcile, don't discard.
4. Recover existing approved/verified work before rebuilding it from scratch.
5. Preserve Firebase/Firestore/Vercel/CI/CodeQL hardening already proven — never weaken a passing security control to make a test pass.
6. Corporate document header/footer content is immutable — never redrawn, rewritten, replaced, or duplicated.
7. Company name is always Splendor / سبلندر — no spelling variation.
8. Approved red corporate stamp at the approved signature/company-approval anchor only.
9. Arabic is the primary UI; Arabic mode contains no English UI wording.
10. Search must work in Arabic wherever search exists.
11. Remove «سحابة» from all user-facing interfaces.
12. Dates use day/month/year; a date-only value must never shift a day from timezone conversion.
13. International phone country code sits on the left in its own box.
14. A feature is not complete until it is functionally verified — code existing, or CI being green, is not proof of correctness. Mark every requirement PASS / FAIL / UNVERIFIED, never assumed.
15. Never invent a VAT/tax rate, deadline, threshold, classification, or filing rule. UAE official-source evidence + independent professional validation required; the system stays `NOT_READY_FOR_FILING` until the user explicitly authorizes otherwise under verified governance.
16. **Wide operational authority, never unsupervised judgment on money/legal/destructive actions.** The system may execute broadly and autonomously across routine operations, but every financial commitment, contract execution, tax action, and destructive operation routes through the existing Business Rules Engine + Four-Eyes Approval + Segregation-of-Duties system (already built — Modules covering Approvals/SoD, Immutable Approval History, Emergency Kill Switch). Extend this same gate to every new operational surface; never bypass it for the sake of "autonomous" execution.
17. Interrupt the user only for: a destructive/irreversible decision, a missing credential/permission, a business rule that cannot be inferred from an approved source, a security/privacy blocker, or a genuinely unautomatable acceptance decision. Otherwise proceed and report real, verified progress — not routine narration.

## VERIFIED CURRENT STATE (live-checked 2026-09-03, re-verify before relying on this if time has passed)

**`main`** — the only branch Vercel production and the GitHub default point to. HEAD: `3afb30ed6feacf26b840ed47052d45178bbe7786` (after PR #51). Contains: Splendor OS 3.0 promotion (#38), premium UI/document standardization (#40), production UI/Arabic/approved-forms fixes (#42), Finance Accounting Control Center (#44) + its post-merge hardening (#45), Fleet Firestore-visibility fix (#43), purchase-order source-of-truth fix (#48), destructive-operation security fix (#51). Does **not** contain Lease-to-Own, Payment Gateway, Vehicle Master Profile/Catalog, or Bank Reconciliation.

**`stabilization/clean-recovery-20260903`** (PR #56, open, draft) — the **single active integration path**. Built fresh from `main`@`3afb30e` specifically to avoid inheriting PR #47's unverified commits. Six batches landed so far, each individually gated (CI+CodeQL green at the time): non-destructive fleet archive, Issue #35 contract-extension transaction fix (all Firestore reads before writes), Issue #36 first correction (no LTV/rental-count increment at contract creation), draft-only contract creation, KYC evidence-integrity hardening (no synthetic DOB/fallback secret), serverless auth-boundary hardening, Firestore RBAC least-privilege rules. Latest commit `402ee9e` (this session) fixed the one remaining CI blocker (a test-assertion/rules-formatting mismatch, not a real security gap) — full local verification: **tsc clean, 535/535 tests, production build clean.** Re-check the live GitHub Actions run on this exact SHA before treating it as green.

**`claude/vercel-firestore-deploy-jf4kqr`** (this session's branch, 38 commits) — Lease-to-Own (application → ownership-transfer lifecycle, real headless-Chromium PDF contract generation), Payment Gateway (PaymentIntent/webhook/idempotency/refund/deposit hold-release), Vehicle Master Profile & Verified Catalog, **Collections & Bank Reconciliation** (manageable payment methods, CSV/Excel statement import, matching/duplicate-detection engine, never-auto-confirm rule). All tested (456 tests passing on this branch alone) and typechecked/built clean. Diverged from an older `main` point; never reconciled with `main`'s later evolution. Independently reviewed and endorsed as "the correct baseline" by a prior hardening pass (`docs/SYSTEM_MANAGER_EXECUTION_LOG_002.md`, since itself closed as stale — see below) before that reviewer lost track of it.

**PR #47** (`feat/contextual-documents-customer-intake`) — CLOSED, archived, "do not merge." Real forensic value inside it: fleet-archive semantics (already recovered in batch 1 above), the contract-extension read/write-ordering fix (already recovered in batch 2), and a completed Tax red-team audit (see Tax Governance below) — the tax code itself was not recovered and should not be, pending the P2 phase's clean reimplementation.

**PR #2 / `hardening/production-100`** — CLOSED, archived, same reason as #47 (97 commits, diverged from an old `main` point before `main`'s later evolution — not a rejection of its content, which built directly on top of this session's branch and added real value: atomic plate assignment, a Fleet Command KPI engine, further Firestore lockdown). Treat as a secondary forensic source alongside #47, same discipline: recover feature-by-feature, never merge wholesale.

**Everything else** (50+ other branches: `fleet-command-metrics` v1-v8, `whatsapp-webhook` fix attempts v1-v7, `finance-accounting-control-center` variants, `recovery/splendor-os-3-execution` v1-v4, etc.) — abandoned iteration history from the same recovery effort. No unique value has been identified in them beyond what already landed on `main` or is captured above; do not resurrect one without first checking whether its content already exists on `main` or in the sources above.

## THE SINGLE PATH FORWARD

```
main (trusted, production)
   └── stabilization/clean-recovery-20260903  [ONLY active integration branch, PR #56]
          ├── P0 batches already landed (fleet archive, contract extension,
          │    draft-only creation, KYC integrity, auth boundary, RBAC) ✅
          ├── P0 remaining (Issue #36 full lifecycle, atomicity audit)
          ├── P1: this session's Missions recovered as individual gated batches
          │    (LTO → Payment Gateway → Vehicle Master Profile → Bank Reconciliation)
          ├── P2: Tax governance fixes (VAT math, evidence revision, posting-gap
          │    engine, professional validator registry) — filing stays disabled
          ├── P3: Legacy UX acceptance (scroll, dates, document conformity, Arabic)
          └── P4: repository closure (issues #35/#36/#41/#54/#55, final acceptance
               matrix) → merge PR #56 into main → THEN resume Phases 1-10 below
```

Only after PR #56 merges does `main` become, once again, the single line everyone (human or AI) branches from — and the post-stabilization policy (small branch → small focused PR → review → tests → merge → close) resumes for all future work, including finishing Phases 1-10.

## P0 — SECURITY & DATA INTEGRITY (in progress, see Verified Current State)
Remaining before P0 exits:
- Issue #36 full contract lifecycle: `draft → review → approved → signed → active → settlement_pending → completed`, with handover incrementing `totalRentals` exactly once (idempotency-key + transaction), physical return never itself closing the contract or recognizing LTV, and final financial closure being the only event that does.
- Financial/operational atomicity audit: `assignPlateAtomically`, bank reconciliation duplicate/competing-target checks, deposit lifecycle (create/apply/refund/release), debt offsetting, supplier payouts — each transactional, idempotent, auditable.
- Repository-wide `process.env.*`/cold-start audit across every serverless entrypoint (not just the primary boundary) — no import-time crash on missing optional config, no fallback production secrets.
- Canonical `profile.status === 'active'` (never `status || 'active'`) enforced everywhere, client and server.

Exit gate: zero known Critical/High defect, tsc clean, full test suite green (including Firestore emulator + concurrency tests), CodeQL clean, production build clean.

## P1 — RECOVER THIS SESSION'S FEATURES (individually gated batches, in this order)
1. **Lease-to-Own**: application lifecycle, financial-offer calculation, PDF contract generation (the version already reconciled includes both this session's documentation and the escapeHtml XSS fix independently developed on the `main` line — keep both).
2. **Payment Gateway**: adapter boundary, PaymentIntent creation/webhooks/idempotency/refunds, security-deposit hold/release via gateway authorization.
3. **Vehicle Master Profile & Verified Catalog**: manufacturer/model catalog, classification dropdowns, Four-Eyes publish gate.
4. **Collections & Bank Reconciliation**: manageable payment methods, CSV/Excel statement import (PDF-ready extension point), the matching/duplicate-detection engine, the never-auto-confirm rule, manual approval flow.

Each batch: reimplement on the clean-recovery branch's current HEAD (not a copy of the old commit), carry its existing tests over (they already exist and pass — verify they still pass against the reimplementation), run the full P0 exit gate before starting the next batch. Cross-check `hardening/production-100`'s atomic-plate-assignment and Fleet Command KPI work for anything worth folding in at the same time.

## P2 — TAX / VAT GOVERNANCE (explicit requirement: complete this, never fabricate it)
Findings from the PR #47 red-team audit that must be fixed, cleanly reimplemented (not copied):
- **VAT math bug**: `amount * 0.05` was applied to VAT-inclusive (gross) totals in places expecting VAT-on-net. Replace the ambiguous helper with two explicit functions: `calculateVatOnNet(net, rule)` and `extractVatFromGross(gross, rule)` — never one ambiguous `vatPortion()`. A tax document must fail closed (never default to `?? 5`) if the authoritative VAT rate metadata is missing.
- **Stale evidence**: Tax Period review/validation/close must all verify the same Accounting Evidence Revision; an accounting mutation after review must invalidate or block the tax state that relied on it.
- **Split-brain posting gaps**: one authoritative Posting Gap engine, used identically by Finance and Tax — not two divergent implementations.
- **Forgeable professional validation**: a real Professional Validator Registry, evidence-backed, hash/immutable, with preparer ≠ reviewer ≠ external professional strictly enforced.
- **Permanent restrictions** (never relaxed without the user's explicit, separate authorization): no Filing API, no Submit Return/Filing, no `Filed`/`READY_FOR_FILING` status, `Closed` never means `Filed`, no Tax `DELETE`, four-eyes/actor separation on every mutating Tax operation.
- Separately, `docs/tax-compliance/` (if recovered) is research-only: UAE FTA/Ministry of Finance/official legislation sources only, never an accounting-firm blog, never a repository mutation, never an invented conclusion.

## P3 — LEGACY UX ACCEPTANCE
- Sidebar and login scroll: independent scroll ownership, verified on short/mobile viewports with real browser testing, not just code inspection.
- Every date render/parse path (`toLocaleDateString`, `Intl.DateTimeFormat`, `split('T')[0]`, `<input type="date">`, PDF/document dates) audited for DD/MM/YYYY presentation and UTC-shift-safe date-only parsing.
- Document conformity audit (Issue #41): every document generator, not just one template — approved letterhead/stamp, correct A4 rendering, no clipping, RTL correctness.
- Arabic-only-in-Arabic-mode audit and «سحابة» removal, repository-wide.

## P4 — REPOSITORY CLOSURE
Reconcile the six governance issues (#35 contract extension, #36 lifecycle, #39 tracking-only, #41 document conformity, #54 tax red-team gate, #55 legacy UX) against real acceptance evidence — never close one because code merely exists or CI is merely green. Build the final Release Acceptance Matrix (Requirement | Expected Behavior | Code Path | Status PASS/FAIL/UNVERIFIED | Tests | Accepted SHA). Only then merge PR #56 into `main`, deploy that exact merged SHA (never a stray preview SHA), and verify production health/runtime for real.

## PHASE 1 — CORE RENTAL LIFECYCLE
Customer → Lead → Quote → Booking → Contract → Payment → Handover → Active Rental → Extension → Return → Inspection → Charges → Final Invoice → Deposit Settlement → Closure → Customer History.

## PHASE 2 — CUSTOMER & CORPORATE
Customer 360, timeline, documents/history, VIP hierarchy, customer intelligence, corporate accounts, credit control, secure customer/corporate portal with strict data isolation.

## PHASE 3 — FLEET & OPERATIONS
Vehicle lifecycle, digital passport, digital twin, utilization, profitability, maintenance, accidents, insurance/registration, fines/Salik, digital handover/return, evidence, signatures, operations control room, employee task engine.

## PHASE 4 — FINANCE & PROCUREMENT
Invoices, payments, deposits, refunds, collections, VAT, expenses, reconciliation, suppliers, RFQ/quotes, PO/LPO lifecycle, receiving, settlement, approvals, segregation of duties. (Note: Payment Gateway and Bank Reconciliation from P1 above are this phase's foundation, not a separate track.)

## PHASE 5 — DOCUMENT INTELLIGENCE
Contracts, extensions, quotations, statements, invoices, purchase orders, receipts/reports, automatic serial numbering, immutable approved header/footer, approved red stamp, reliable PDF generation, OCR/KYC when technically and legally ready.

## PHASE 6 — LOCALIZATION & LUXURY UX
Arabic-first UI, complete RTL, zero English UI wording in Arabic mode, Arabic search, day/month/year, country-code-left separate box, remove «سحابة», approved Neon Blue treatment, Splendor identity, mobile-first luxury UX.

## PHASE 7 — DIGITAL EXPERIENCES
PWA, full customer portal, customer app, employee app, CEO app, website booking, WhatsApp/notifications, e-signature.

## PHASE 8 — AUTOMATION
Zero-click workflows, exception management, notifications, approval orchestration, automated tasks, retention/referral workflows. (Governed by Rule 16 above — automation widens what the system does, never who approves money/legal/destructive actions.)

## PHASE 9 — INTELLIGENCE
Splendor Command, Business Health Score, Splendor Brain, explainable AI, specialized AI agents, CEO advisor, predictive revenue/demand/maintenance/rebooking/cash flow, early warning, opportunity engine, dynamic pricing, acquisition/disposal intelligence, profit-first engine.

## PHASE 10 — ENTERPRISE SCALE
Multi-branch, BI/data warehouse, modular APIs, GPS/telematics/geofencing when available, official RTA/Police/Salik integrations when access is available, digital-key readiness, multi-brand readiness, business continuity/disaster recovery.

## QUALITY GATES FOR EVERY PHASE/BATCH
Functional verification → typecheck/lint → unit/integration/workflow tests → security/CodeQL → Firestore/API authorization review → production build → Vercel preview/runtime verification → regression against everything previously accepted → user acceptance where a workflow is visibly different → PR review before merge.

## FINAL ACCEPTANCE (unchanged target, reached after P0-P4)
Execute the full 24-step rental lifecycle acceptance test from customer creation through contract closure, profitability/dashboard updates, notifications, and complete audit trail.

## CURRENT RESUME CHECKPOINT
**P0, finishing.** Immediate next action: Issue #36's full contract lifecycle (draft→signed→active→settlement_pending→completed), on `stabilization/clean-recovery-20260903`, as its own isolated, tested, gated commit. Live-verify GitHub state (PR #56 CI/CodeQL on the latest pushed SHA, open issue list) before continuing if resuming after a gap.

## COMMUNICATION POLICY
Continue without asking the user to say "start" again for routine batch-to-batch progress. Do send a real, substantive report at the end of each P0-P4 phase (not each individual batch) summarizing what was verified PASS/FAIL/UNVERIFIED. Interrupt immediately for anything Rule 17 above names.
