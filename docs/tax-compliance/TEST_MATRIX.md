# Tax Compliance Verification Matrix

Status: **Proposed**  
Professional validator: **Not yet assigned / not yet validated**  
Effective date: **Not applicable — test architecture proposal only**

## Verification principle

Tax tests must prove both calculation correctness for validated rules and the inability to bypass filing controls. A passing calculator test alone is insufficient.

No test in this matrix authorizes a tax interpretation. Legal/tax expected values must come from validated rule specifications and official-source traceability.

## Required test layers

### 1. Rule-unit tests

For each accepted tax rule:

- effective-date boundary
- applicable/non-applicable transaction types
- positive, zero, negative/credit-note and rounding boundaries where relevant
- missing/invalid evidence behavior
- superseded-version behavior
- deterministic result under the pinned rule-set version

### 2. Accounting-to-tax reconciliation tests

Future tests must verify that tax working papers reconcile to authoritative posted accounting evidence rather than UI totals or mutable flags.

Candidate invariants:

- only posted journals affect finalized tax working papers;
- draft/unverified monetary records cannot manufacture filing evidence;
- reversal/credit/debit entries are reflected exactly once;
- period filters use authoritative tax/accounting dates as specified;
- reconciliation differences block readiness rather than being silently rounded away beyond accepted tolerances.

### 3. Access-control tests

- ordinary Finance role does not automatically receive tax approval authority;
- unauthenticated access denied;
- missing capability denied;
- prepare/review/approve separation enforced server-side;
- preparer cannot approve own return when Four-Eyes applies;
- adjustment proposer cannot be sole approver;
- period-lock and filing-record transitions are server-authoritative;
- professional-validation metadata cannot be created merely through ordinary application permissions.

### 4. State-machine tests

Current governed lifecycle:

`Draft -> Open -> Under Review -> Ready for Professional Review -> Professionally Validated -> Closed`

Tests must reject illegal skips and backwards mutation of professionally validated/closed records. `Closed` must never be represented as `Filed`; no filing/submission route or `READY_FOR_FILING` state exists in the current runtime. Any future amendment or filing-history design requires a separately reviewed specification and must preserve prior evidence.

### 5. Fail-closed readiness tests

A filing-readiness result must remain blocked when any applicable blocking condition exists, including as later specified:

- unresolved posting gaps
- unclassified tax items
- material reconciliation difference
- missing mandatory evidence
- unresolved blocking exception
- invalid tax-document classification
- missing professional validation for an affected accepted rule
- incomplete independent review/approval
- missing pinned tax rule-set version

### 6. Historical reproducibility tests

- old period remains bound to original rule-set version;
- later rule version does not silently change historic calculation evidence;
- superseded source/rule references remain traceable;
- amendment points to the exact prior filing/period and preserves original evidence.

### 7. Tax-document tests

Before tax documents are represented as professionally validated:

- required fields must be sourced from authoritative records;
- full vs simplified invoice templates must have separate validated use conditions and visual layouts where required;
- rendered PDF field placement must be reviewed against the exact committed master;
- no customer/transaction-specific example master may be accidentally used as a blank production template;
- immutable issued-document archive and authenticated access remain enforced.

### 8. Security and integrity tests

- tax evidence is not client-overwritable;
- approvals and locks are idempotent and concurrency-safe;
- audit trail records each material transition;
- no secret or credential is stored in filing evidence;
- attempts to alter a locked filing are rejected or routed into the controlled amendment workflow.

## Release gate

A Tax Compliance feature is not release-ready merely because TypeScript/build/CI passes. Relevant validated rule tests, reconciliation tests, security tests, workflow tests, professional-validation evidence, and release traceability must all be satisfied for the scope being released.

## Current implementation status

The matrix remains Proposed. A limited governance runtime now exists, but this document does not assert filing readiness or professional validation of any UAE tax treatment.
