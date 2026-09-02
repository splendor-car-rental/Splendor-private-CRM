# Splendor OS Architecture Decision Record Policy

Status: **Accepted**  
Effective date: **2026-09-02**

This policy defines how future Architecture Decision Records are governed. It deliberately allocates **no ADR number** because two legacy decision schemes already exist and must be mapped first.

## Allowed ADR states

- Proposed
- Accepted
- Deferred
- Rejected
- Superseded
- Deprecated

## State semantics

### Proposed
A decision candidate under analysis. It may guide experiments but must not be represented as approved policy.

### Accepted
The decision has the required authority and validation for implementation. Acceptance does not imply that implementation is complete; implementation status must be traced separately to code/tests/PR/release.

### Deferred
The decision is intentionally postponed, usually because a dependency, provider, legal answer, business fact, or priority is unresolved.

### Rejected
The proposal was considered and explicitly not selected. The rationale must remain available to prevent repeated re-litigation without new evidence.

### Superseded
A later accepted ADR replaces the decision. The old ADR remains immutable historical evidence and links to its successor.

### Deprecated
The decision remains historical evidence but should no longer guide new work. A replacement may or may not exist.

## Required metadata

Every new ADR must contain:

```text
Decision ID:
Title:
Status:
Decision owner:
Approver:
Effective date:
Domain:
Related specifications:
Related code/tests:
Implementing PR/release:
Supersedes:
Superseded by:
```

## Acceptance rules

1. Implementation alone does not prove acceptance.
2. A chat message or Work output alone does not prove acceptance unless its accepted outcome is recorded in the repository through the project governance process.
3. An Accepted ADR may be implemented by one or more later PRs; implementation state must be explicit.
4. A decision that changes security, accounting, financial settlement, production data integrity, tax behavior, identity/KYC, or legal document behavior requires domain-specific review in addition to ordinary technical review.
5. Tax ADRs start as Proposed and require validation by an appropriate UAE tax professional before becoming Accepted.
6. If a tax interpretation changes prospectively, the prior ADR/rule version remains available so historical tax periods can be reproduced.

## Legacy numbering boundary

The repository currently contains:

- `DECISION-01` through `DECISION-12` in `docs/SPLENDOR_MASTER_DECISIONS.md`.
- Six file-local numbered items in root `DECISIONS-REQUIRED.md`.
- `RULE-*` identifiers in `docs/SPLENDOR_MASTER_RULES.md`.
- `REQ-BP*` identifiers in `docs/SPLENDOR_MASTER_REQUIREMENTS_MAP.md`.

These identifiers are preserved exactly as historical/project references. They are not ADR IDs and must not be renumbered.

A new repository-wide ADR sequence will be allocated only after the Legacy Decision Map has been reviewed. The expected form is `ADR-####-short-title.md`, but this filename convention is not activated until that review is complete.

## Supersession rules

Accepted ADRs are not edited to hide an old decision. A later decision creates a new ADR and marks the prior ADR Superseded. Both sides must cross-link.

Material corrections to metadata or broken references may be amended without changing the historical decision, but the commit history must remain available.

## Implementation gate

A PR that changes behavior governed by an ADR must update, in the same delivery chain where practical:

- the relevant specification,
- decision traceability,
- automated tests,
- release/readiness evidence.

Tax-affecting PRs must additionally identify the tax rule-set version and professional-validation status. A Proposed tax rule must not be represented as filing-ready.
