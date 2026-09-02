# Splendor OS Legacy Decision Map

Status: **Active governance map — no legacy decision is renumbered by this file**  
Evidence baseline: PR #47 documentation inventory and repository state reviewed on 2026-09-02.

## Purpose

This map prevents a new ADR sequence from colliding with existing decision and requirement identifiers. It records what the repository currently says; it does not silently promote old implementation notes into Accepted ADRs.

## Scheme A — `docs/SPLENDOR_MASTER_DECISIONS.md`

The file defines `DECISION-01` through `DECISION-12`. These IDs remain reserved exactly as written.

| Legacy ID | Topic | Evidence state under current governance | Action |
|---|---|---|---|
| DECISION-01 | Original 89-Rule source / reconstruction | Legacy question; acceptance not established | REVIEW |
| DECISION-02 | How customer deposits are actually collected | Legacy question; later deposit implementation does not by itself prove original business-choice acceptance | REVIEW |
| DECISION-03 | Audit hash chaining vs corrected compliance claim | Current repository contains hash-chain implementation/tests, but legacy decision acceptance was not formally recorded | REVIEW / TRACE IMPLEMENTATION |
| DECISION-04 | Salik live integration vs batch import | External integration decision unresolved in legacy record | REVIEW |
| DECISION-05 | Public customer website repository boundary | Legacy architecture question | REVIEW |
| DECISION-06 | KYC/OCR/liveness build-vs-buy/vendor | Procurement/privacy/domain decision unresolved in legacy record | REVIEW |
| DECISION-07 | GPS/telematics provider/hardware | External provider/integration decision; do not infer acceptance from software scaffolding | REVIEW |
| DECISION-08 | RTA/Dubai Police official integration channel | External official-channel dependency | REVIEW |
| DECISION-09 | Banking/payment gateway for authorization holds | Downstream external/provider decision | REVIEW |
| DECISION-10 | Discount-ceiling enforcement | Legacy document records implementation; formal acceptance trace must be reconciled under this governance policy | REVIEW / TRACE IMPLEMENTATION |
| DECISION-11 | Priority order across Blueprint items | Sequencing decision; current PR evolution supersedes parts of the old context but no formal accepted replacement is recorded here | REVIEW |
| DECISION-12 | Retire the `Rule N` convention | Organizational decision not promoted by this map | REVIEW |

### Boundary

No `DECISION-*` identifier may be reused for future ADRs. If an old decision is later converted into a formal ADR, the ADR must link back to the preserved legacy ID instead of renaming it.

## Scheme B — root `DECISIONS-REQUIRED.md`

This file uses local numbers 1–6 rather than repository-wide decision IDs. Preserve the file and numbering until a dedicated cleanup decision is accepted.

| Legacy item | Topic | Repository-recorded state | Governance interpretation |
|---|---|---|---|
| 1 | Google AI Studio scaffold files | Repository records a later owner decision to keep the files unchanged for now | Preserve as a legacy accepted business instruction; future ADR mapping still required if made a durable architecture policy |
| 2 | Received Amount Classification (FIN-002) | Repository explicitly records IMPLEMENTED — VERIFIED — APPROVED | Strongest legacy acceptance evidence; preserve and trace to current implementation/tests before any supersession |
| 3 | RTA integration feasibility | No implementation authorization in the legacy record | Unresolved / external dependency |
| 4 | Balance-offset approval-time revalidation race | Legacy record presents behavioral options | Unresolved unless later repository evidence explicitly closes it |
| 5 | Procurement create-route idempotency gap | Legacy record requests prioritization or accepted deferral | Review against current code before deciding whether it remains open |
| 6 | Procurement workflows without frontend UI | Legacy prioritization question | Review against current PR code before deciding current status |

## Non-ADR identifier schemes

The following identifiers are not decisions and must remain separate:

- `RULE-*` in `docs/SPLENDOR_MASTER_RULES.md` — business/requirements identifiers.
- `REQ-BP*` in `docs/SPLENDOR_MASTER_REQUIREMENTS_MAP.md` — requirement traceability identifiers.
- GitHub PR/issue numbers — delivery and defect tracking identifiers.

## ADR numbering gate

A new repository-wide ADR sequence is **not yet allocated**.

Before the first ADR ID is issued:

1. Review this map with the project/business owner.
2. Confirm any legacy item that already has explicit acceptance evidence.
3. Record implementation traceability for accepted legacy decisions where applicable.
4. Confirm that `DECISION-*`, `RULE-*`, `REQ-BP*`, and PR/issue numbers remain separate namespaces.
5. Then activate the future `ADR-####` sequence defined by `docs/governance/ADR_POLICY.md`.

## Tax boundary

No legacy decision record is sufficient by itself to establish an Accepted UAE tax rule. Any VAT or Corporate Tax decision must enter the new tax-governance lifecycle as Proposed and obtain official-source traceability plus appropriate UAE tax-professional validation before Accepted status.
