# Splendor OS Tax Compliance

Status: **Proposed**  
Decision owner: Splendor OS Project / Business Owner  
Professional validator: **Not yet assigned / not yet validated**  
Effective date: **Not applicable — architecture proposal only**

## Current readiness

Splendor OS is **not yet classified as VAT-return or Corporate-Tax filing-ready**.

This directory is the controlled repository workspace for future UAE tax-compliance specifications. Nothing in this directory becomes an Accepted tax rule solely because it is documented, coded, tested, or displayed in the application.

Tax decisions must follow `docs/governance/DOCUMENT_GOVERNANCE_POLICY.md` and `docs/governance/ADR_POLICY.md`.

## Intended product boundary

Tax Compliance will be a distinct application domain rather than an informal finance report. The intended capabilities are:

- VAT Compliance workspace
- Corporate Tax workspace
- Tax Periods
- Tax Reconciliation
- Exceptions and Blocking Issues
- Tax Adjustments
- Evidence Packs
- Tax Rule Sets and effective-period versioning
- Filing History and Amendments
- Tax Audit Trail

These are product/architecture targets, not statements that the functions currently exist.

## Required workflow

The intended control workflow is:

`Draft -> Prepared -> Independent Review -> Approved -> Locked -> Filed`

Four-Eyes control is mandatory: the preparer must not be able to approve the same tax return or tax-period close.

Permissions must be independent from ordinary Finance permissions. Having access to operational finance must not automatically grant Tax Prepare, Tax Review, Tax Approve, Tax Lock, or Tax Filing permissions.

## Fail-closed principle

A tax period must not be represented as filing-ready while material blocking conditions remain unresolved. Candidate readiness gates include:

- posting gaps
- unclassified tax transactions
- unreconciled financial items relevant to the tax period
- missing required tax evidence
- invalid or incomplete tax-document classifications
- reconciliation differences
- unresolved tax adjustments
- unresolved blocking exceptions
- incomplete independent review/approval

The exact legal/accounting meaning and materiality of these gates will be specified only after the official-source register and professional validation are complete.

## No hidden legal assumptions

Until validated:

- configured VAT calculations are calculations, not a professional compliance opinion;
- tax-invoice templates are approved source art, not proof that every legal field/use condition has been professionally validated;
- accounting VAT summaries are not VAT returns;
- Corporate Tax UI wording or accounting data does not constitute a Corporate Tax calculation engine;
- no historic tax period may be silently recalculated using a later rule-set version.

## Repository artifacts planned under this directory

- `FTA_RULE_SOURCES.md` — official-source register and provenance
- `TAX_RULE_VERSIONING.md` — effective-period/version governance
- `VAT_BLUEPRINT.md` — Proposed only until professional validation
- `CORPORATE_TAX_BLUEPRINT.md` — Proposed only until professional validation
- `TAX_PERIOD_CLOSE.md`
- `EVIDENCE_PACK_SPEC.md`
- `ACCESS_CONTROL.md`
- `TEST_MATRIX.md`

No ADR number is allocated by creating this workspace.

## Next evidence gate

Before detailed VAT or Corporate Tax rules are designed, collect and review a current official-source pack from UAE Federal Tax Authority and Ministry of Finance sources, preserving publication/effective dates and identifying questions requiring professional interpretation.
