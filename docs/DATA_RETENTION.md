# Data Retention Policy — Framework (Phase 23.9)

## What this is

A **framework**, not a policy. Per the explicit governance decision approved 2026-08-28:

> Framework only for now. Do NOT define final retention periods. Do NOT automatically delete, purge, anonymize, archive, or expire real business data at this stage. Design the architecture so retention policies can be introduced later without architectural rework. Final retention periods will require appropriate legal/regulatory review before activation.

This document, and the five catalog entries it describes, do exactly that and nothing more.

## The five categories

Five `sensitive_rule`-tier entries were added to the Business Rules Engine catalog (`src/config/businessRules.ts`), each seeded with `value: null` — "not yet defined":

| Rule key | Category | Likely eventual regulatory basis (not confirmed) |
|---|---|---|
| `retentionCustomerRecordsDays` | Customer profile records, after the relationship ends | UAE consumer-protection / general commercial record-keeping norms |
| `retentionKycDocumentsDays` | ID/passport/license scans | UAE AML/CDD customer-due-diligence record-keeping requirements |
| `retentionFinancialRecordsDays` | Invoices, payments, contracts | UAE Federal Tax Authority VAT record-keeping requirements |
| `retentionAuditLogsDays` | The governance audit trail itself (Phase 23.3/23.5) | Should be >= the longest of the categories above, not shorter |
| `retentionWhatsappLogsDays` | Operational WhatsApp message log | No specific regime identified; likely shorter than the legal/financial categories |

**No day-count number is set for any of them, and none was invented for this document.** The "likely eventual regulatory basis" column names which real, existing UAE regulatory frameworks will probably govern the eventual number — that is a statement of fact about which law applies, not a guess at what the number itself should be. The actual figure is a legal/compliance determination, not an engineering one.

## Why this reuses the Business Rules Engine instead of a new system

A retention period is exactly the kind of decision Four-Eyes Approval (Phase 23.2) already exists for: it changes how the business handles *every* customer's data going forward, the same weight class as changing a company-wide pricing default. Rather than build a parallel "retention policy" system, these five entries are ordinary `sensitive_rule`-tier business rules:

- **Reading** them: `GET /api/business-rules` (any staff role can see whether a period has been set).
- **Proposing** a value: `PATCH /api/business-rules/:key` (CEO/Admin/Finance/Sales-eligible, same as any sensitive rule) — creates a pending `ApprovalRequest`, never applies immediately.
- **Activating** it: a *different* CEO/Admin must approve via `POST /api/approval-requests/:id/decide`, through the same Settings → Governance & Approvals panel as every other sensitive rule.
- **History**: every proposal and decision is permanently recorded (Who/What/When/Why/Before/After/Decision) via the same immutable approval history as everything else in Phase 23.

This gets "architecture so retention policies can be introduced later without architectural rework" essentially for free — the storage, versioning, approval gate, and audit trail all already exist and are already tested (Phase 23.1–23.3).

## The one thing the approval gate is *not*

Approving a retention-period change through this panel is a **technical** control — it proves a second authorized person signed off on the number. It is **not** the same thing as an actual legal/regulatory review having happened. **CEO/Admin must not approve a retention-period change until real legal/compliance review has confirmed the figure externally** — the `reason` field on the proposal and the `decisionNote` field on the approval are exactly where that external review's reference (memo, counsel's name, date) should be recorded, so the approval history itself becomes evidence that due diligence happened, not just that two people clicked a button.

## What deliberately does NOT exist yet

No code anywhere in this repository reads any `retention*` rule value to delete, purge, anonymize, or archive anything. Setting one of these values — even after a real legal review and a real approval — currently does **nothing** beyond making the number visible and versioned. This is intentional, not an oversight:

- It guarantees this phase cannot accidentally destroy real business data, satisfying "do not automatically delete... at this stage" absolutely rather than by careful-but-fallible code review.
- It cleanly separates two different engineering problems: *deciding and recording* a retention period (done, this phase) versus *safely enforcing* one (a real project on its own — soft-delete vs. hard-delete semantics, what "the relationship ended" means precisely for each entity, coordinating with Firebase Storage for KYC document files, and almost certainly a human review step before any actual deletion, not a silent cron job).

Building that enforcement job is explicit future work, to be scoped only once real periods exist and legal has confirmed exactly what "delete/anonymize/archive" is supposed to mean for each category under UAE law.
