# SPLENDOR OS 3.0 — EXECUTION BLUEPRINT

Version: 1.0
Date: 2026-09-01
Repository: splendor-car-rental/Splendor-private-CRM

## PURPOSE
Durable execution checkpoint for the approved Splendor OS 3.0 Ultimate Master Blueprint. Resume from this document in a new conversation without losing the implementation position.

## NON-NEGOTIABLE RULES
1. Never modify production `main` directly.
2. Use dedicated branches and PRs.
3. Recover approved existing work before rebuilding it.
4. Never delete an approved feature merely because another branch has a different implementation.
5. Preserve Firebase/Firestore/Vercel/CI/CodeQL hardening.
6. Corporate document header/footer content is immutable: never redraw, rewrite, replace, or duplicate company contact data already in the footer.
7. Company name is always Splendor / سبلندر.
8. Approved red corporate stamp is placed at the approved signature/company-approval anchor.
9. Arabic is the primary UI; Arabic mode contains no English UI wording.
10. Search must work in Arabic wherever search exists.
11. Remove «سحابة» from all user-facing interfaces.
12. Dates use day/month/year.
13. International phone country code is on the left in its own box.
14. A feature is not complete until functionally verified.
15. Do not send routine progress messages. Interrupt only for a destructive/irreversible decision, missing permission/credential, an unresolvable business-rule decision, a security/privacy blocker, or mandatory user acceptance.

## CURRENT PRODUCTION BASELINE
`main` after PR #32, including #31 corporate document/stamp work, #32 PWA install banner and simplified customer portal, and existing production security hardening.
Current main checkpoint: `e21d1e8540b935120eb20bbae23bfe678700d2a0`.

## APPROVED RECOVERY LINEAGE
ZIP/AI Studio lineage is represented in Git history by upload/merge-base commit `183d09da62b3fdaeb040767b0141dd0e66f9a796` (#29) and recovery branch `integration/ai-studio-import`, currently observed at `eb75670f9bc5647190e511cffee53ec1b2561ffa`.

Recovery target:
CURRENT MAIN + ALL APPROVED RECOVERABLE WORK + #31 + #32.
This is reconciliation, not replacement.

## PHASE 0 — RECOVERY & STABILIZATION
- Inventory all branches/commits descending from the approved ZIP/AI Studio source.
- Compare every relevant file and feature against current main.
- Identify added, modified, deleted, and missing functionality.
- Restore every approved missing section, including Customers, Purchase Orders/LPO, Suppliers, Documents, Finance, and other recovered modules.
- Preserve newer #31/#32 functionality.
- Fix `Document generation failed` from root cause.
- Verify real runtime document generation.

Exit gate: no approved recoverable module silently omitted; documents generate successfully; typecheck/tests/build/security/preview pass.

## PHASE 1 — CORE RENTAL LIFECYCLE
Customer → Lead → Quote → Booking → Contract → Payment → Handover → Active Rental → Extension → Return → Inspection → Charges → Final Invoice → Deposit Settlement → Closure → Customer History.

## PHASE 2 — CUSTOMER & CORPORATE
Customer 360, timeline, documents/history, VIP hierarchy, customer intelligence, corporate accounts, credit control, secure customer/corporate portal with strict data isolation.

## PHASE 3 — FLEET & OPERATIONS
Vehicle lifecycle, digital passport, digital twin, utilization, profitability, maintenance, accidents, insurance/registration, fines/Salik, digital handover/return, evidence, signatures, operations control room, employee task engine.

## PHASE 4 — FINANCE & PROCUREMENT
Invoices, payments, deposits, refunds, collections, VAT, expenses, reconciliation, suppliers, RFQ/quotes, PO/LPO lifecycle, receiving, settlement, approvals, segregation of duties.

## PHASE 5 — DOCUMENT INTELLIGENCE
Contracts, extensions, quotations, statements, invoices, purchase orders, receipts/reports, automatic serial numbering, immutable approved header/footer, approved red stamp, reliable PDF generation, OCR/KYC when technically and legally ready.

## PHASE 6 — LOCALIZATION & LUXURY UX
Arabic-first UI, complete RTL, zero English UI wording in Arabic mode, Arabic search, day/month/year, country-code-left separate box, remove «سحابة», approved Neon Blue treatment, Splendor identity, mobile-first luxury UX.

## PHASE 7 — DIGITAL EXPERIENCES
PWA, full customer portal, customer app, employee app, CEO app, website booking, WhatsApp/notifications, e-signature.

## PHASE 8 — AUTOMATION
Zero-click workflows, exception management, notifications, approval orchestration, automated tasks, retention/referral workflows.

## PHASE 9 — INTELLIGENCE
Splendor Command, Business Health Score, Splendor Brain, explainable AI, specialized AI agents, CEO advisor, predictive revenue/demand/maintenance/rebooking/cash flow, early warning, opportunity engine, dynamic pricing, acquisition/disposal intelligence, profit-first engine.

## PHASE 10 — ENTERPRISE SCALE
Multi-branch, BI/data warehouse, modular APIs, GPS/telematics/geofencing when available, official RTA/Police/Salik integrations when access is available, digital-key readiness, multi-brand readiness, business continuity/disaster recovery.

## QUALITY GATES FOR EVERY PHASE
Functional verification → typecheck/lint → unit/integration/workflow tests → security/CodeQL → Firestore/API authorization review → production build → Vercel preview/runtime verification → regression → user acceptance where required → PR review before main.

## FINAL ACCEPTANCE
Execute the full 24-step rental lifecycle acceptance test from customer creation through contract closure, profitability/dashboard updates, notifications, and complete audit trail.

## CURRENT RESUME CHECKPOINT
**PHASE 0 — RECOVERY & STABILIZATION.**
Immediate order: reconcile AI Studio/ZIP lineage with current main; restore every approved missing feature; fix document generation; run full regression/security gates; then proceed phase-by-phase.

## COMMUNICATION POLICY
Continue without asking the user to say “start” again. Send no routine progress updates. Notify only for blockers, irreversible/destructive choices, security/privacy issues, missing permissions/credentials, or required user acceptance.
