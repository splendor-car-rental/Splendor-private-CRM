# Splendor OS Documentation Index

Status: **Active**  
Governance policy: [`docs/governance/DOCUMENT_GOVERNANCE_POLICY.md`](./governance/DOCUMENT_GOVERNANCE_POLICY.md)

## Source-of-truth rule

The GitHub repository is the single permanent source of truth for Splendor OS. Off-repository research and conversation are inputs only until their accepted result is recorded here.

This index does **not** silently reclassify, move, rename, archive, merge, or delete legacy documents. The repository contains historical snapshots and conflicting documents that are under controlled review.

## Governance

- [Document Governance Policy](./governance/DOCUMENT_GOVERNANCE_POLICY.md) — **Accepted**
- [ADR Policy](./governance/ADR_POLICY.md) — **Accepted**, but no ADR IDs allocated yet
- [Legacy Decision Map](./governance/LEGACY_DECISION_MAP.md) — active mapping boundary; preserves existing identifiers

## Current high-authority repository sources

Different sources answer different questions:

### Intended approved behavior
Accepted ADRs/specifications, once present and valid for the relevant release/effective period.

### Current implemented behavior
Executable code, automated tests, CI configuration, deployment configuration, `vercel.json`, `firestore.rules`, runtime configuration, and immutable build inputs.

### Current explanatory guidance
Documents marked Active after reconciliation with accepted decisions and executable behavior.

### Non-binding evidence
Draft, Proposed, Superseded, Deprecated, and historical audit/report documents.

If intended and implemented behavior disagree, treat that as a controlled discrepancy requiring resolution rather than silently choosing one source.

## Existing documentation requiring governance review

The following documents existed before the governance policy and keep their paths and contents until reviewed:

- `docs/SPLENDOR_MASTER_RULES.md`
- `docs/SPLENDOR_MASTER_DECISIONS.md`
- `docs/SPLENDOR_MASTER_REQUIREMENTS_MAP.md`
- `DECISIONS-REQUIRED.md`
- `PROPOSED-DELETIONS.md`
- `docs/FINANCE_ACCOUNTING_ARCHITECTURE.md`
- `docs/DATA_RETENTION.md`
- `docs/DISASTER_RECOVERY.md`
- `docs/DOCUMENT_STORAGE_ARCHITECTURE.md`
- `docs/PRINT_DOCUMENT_STANDARD.md`
- `docs/QA_TEST_ENVIRONMENT.md`
- historical audits, inventories, execution blueprints, and reports under `docs/`

No file in this list is moved or archived merely because it appears stale. Authority, references, and successor relationships must be confirmed first.

## Approved document masters

`docs/approved-forms/` contains committed PDF source art used by production document workflows. These files are governed as immutable source artifacts and must not be renamed, replaced, or visually changed without explicit document-governance review, regression verification, and any required legal/tax validation.

Tax-invoice masters require UAE tax-professional validation before they can be treated as professionally filing-compliant evidence.

## Tax Compliance

The repository is **not currently classified as VAT-return or Corporate-Tax filing-ready**.

Tax Compliance work must be built under the governance policy and will eventually have a dedicated `docs/tax-compliance/` area. Until then:

- no tax ADR is Accepted without appropriate UAE tax-professional validation;
- tax rules require official-source traceability and effective dates;
- historical tax periods must remain reproducible under their applicable rule-set version;
- tax tooling must fail closed on unresolved material exceptions or missing required evidence.

No Corporate Tax specification or return model is currently designated canonical.

## Legacy decision namespaces

Do not allocate or reuse identifiers before reading the [Legacy Decision Map](./governance/LEGACY_DECISION_MAP.md).

Reserved legacy namespaces include:

- `DECISION-*`
- root file-local numbered decisions
- `RULE-*`
- `REQ-BP*`
- GitHub PR and issue numbers

Future ADR numbering is intentionally not activated yet.

## Release evidence

Release/readiness statements must identify the exact commit SHA they describe. PR descriptions and historical reports are not durable truth when their referenced head no longer matches the actual branch head.

## Next governance sequence

1. Confirm current PR/release evidence.
2. Review legacy decision acceptance and traceability.
3. Resolve Priority-0 technical/document conflicts without moving historical files.
4. Activate the repository-wide ADR sequence only after legacy-map review.
5. Establish the Tax Compliance official-source register and Proposed architecture.
6. Obtain professional tax validation before accepting tax rules.
7. Only then propose archive/move/merge cleanup in a dedicated reviewed change.
