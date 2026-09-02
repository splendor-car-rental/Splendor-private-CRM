# Tax Compliance Access Control

Status: **Proposed**  
Decision owner: Splendor OS Project / Business Owner  
Security review: **Pending implementation review**  
Professional validator: **Not applicable to permission mechanics; tax workflow implications still require professional review**  
Effective date: **Not applicable — architecture proposal only**

## Principle

Tax Compliance is a separate controlled domain. Ordinary Finance access must not automatically grant authority to prepare, review, approve, lock, amend, or mark tax filings as filed.

## Proposed capabilities

Permissions should be capability-based rather than inferred only from broad staff role names.

- `tax.view`
- `tax.prepare`
- `tax.adjust.propose`
- `tax.review`
- `tax.approve`
- `tax.period.lock`
- `tax.amend.propose`
- `tax.amend.approve`
- `tax.filing.record`
- `tax.evidence.view`
- `tax.evidence.manage`
- `tax.rules.view`
- `tax.rules.manage_proposed`
- `tax.rules.accept`
- `tax.audit.view`

Names are Proposed and may change before implementation; the separation of authority is the invariant.

## Four-Eyes controls

The future service layer must enforce all of the following server-side:

1. The preparer cannot review/approve the same return as the independent reviewer/approver.
2. A user who proposes a material tax adjustment cannot be the sole approver of that adjustment.
3. A user who prepares an amendment cannot solely approve the amendment.
4. UI hiding is not authorization; every transition is server-authoritative.
5. Approval/lock operations require re-validation of the current period state inside the authoritative transaction, not trust in a previously loaded browser snapshot.

## Proposed workflow authority

| Transition | Minimum capability | Independence constraint |
|---|---|---|
| Create working period | `tax.prepare` | — |
| Prepare / classify | `tax.prepare` | — |
| Propose adjustment | `tax.adjust.propose` | proposer cannot be sole approver |
| Submit for review | `tax.prepare` | — |
| Independent review | `tax.review` | reviewer must differ from preparer where required by workflow |
| Approve | `tax.approve` | approver must satisfy Four-Eyes separation |
| Lock period | `tax.period.lock` | only after all blocking gates pass |
| Record filing metadata | `tax.filing.record` | only for an Approved/Locked filing package |
| Propose amendment | `tax.amend.propose` | linked to prior filing |
| Approve amendment | `tax.amend.approve` | approver independent from proposer |
| Accept tax rule | `tax.rules.accept` | professional-validation gate must also pass |

## Professional-validation boundary

Permission to accept a tax rule in software does not replace professional validation. An Accepted tax rule must carry the professional-validation evidence required by repository governance.

The application must not allow an internal user to manufacture a professional-validation record merely by holding an application role.

## Audit requirements

Every sensitive tax action must record at least:

- actor identity
- server-resolved actor role/capabilities
- action
- tax period / return / adjustment / rule identifier
- previous state
- resulting state
- timestamp
- correlation/idempotency identifier where applicable
- approval/review relationship
- reason/comment when required

Audit events must not contain secrets and must not be client-overwritable.

## Deny-by-default

Unknown or missing tax capability => deny.

Failure to load authoritative staff/capability data => deny the sensitive action rather than falling back to a permissive role.

## No current runtime claim

This document does not assert that these capabilities or workflows are already implemented. Runtime implementation begins only after source, data-model, and workflow specifications are reviewed and covered by automated tests.
