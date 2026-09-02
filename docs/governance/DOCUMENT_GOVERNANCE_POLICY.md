# Splendor OS Document Governance Policy

Status: **Accepted**  
Effective date: **2026-09-02**  
Decision owner: **Splendor OS Project / Business Owner**  
Approver: **Splendor OS Project Owner**

## 1. Source of truth

The GitHub repository is the single permanent source of truth for Splendor OS.

ChatGPT/Codex sessions, ChatGPT Work outputs, meeting notes, emails, external research, consultant drafts, and other off-repository material are research inputs only until their accepted outcome is recorded in the repository as a version-controlled specification, decision record, rule set, test, implementation, or release artifact.

No conversation or Work artifact overrides an accepted repository decision by itself.

## 2. Governing lifecycle

Every material change follows this lifecycle:

Research -> Analysis -> Decision -> Repository Specification / ADR -> Implementation -> Automated Verification -> Technical Review -> Domain Validation where required -> Release Gate -> Merge

For UAE tax matters, `Domain Validation` means validation by an appropriate UAE tax professional before a tax decision can become Accepted.

## 3. Document states

Governed decision/specification documents must use one of these states where applicable:

- Proposed
- Accepted
- Deferred
- Rejected
- Superseded
- Deprecated

Historical evidence and audit snapshots may additionally be identified as historical evidence, but historical evidence is not normative authority.

## 4. Authority and conflict handling

Repository sources serve different purposes and must not be silently conflated:

1. **Accepted ADR / accepted specification** defines intended approved behavior.
2. **Executable code, configuration, tests, CI, deployment configuration and security rules** prove current implemented behavior.
3. **Active technical documentation and runbooks** explain the current system and must be reconciled to accepted decisions and executable behavior.
4. **Proposed / draft documents** are non-binding.
5. **Superseded / deprecated / historical documents** are evidence only and must not drive new implementation.

If accepted intent and executable behavior disagree, the discrepancy is a defect or unresolved migration, not permission to silently choose one side. The conflict must be recorded and resolved through the governing lifecycle.

## 5. Required metadata for future ADRs

Every new ADR must include at least:

- Decision ID
- Title
- Status
- Decision owner
- Approver
- Effective date
- Context / problem
- Decision
- Alternatives considered
- Consequences / risks
- Related specifications
- Related code/tests
- Implementing PR / release
- Supersedes / superseded by, when applicable

No new ADR number may be allocated until the legacy decision schemes are reviewed and the ADR numbering policy is accepted.

## 6. Tax governance

Tax rules are high-risk controlled decisions.

A tax rule must record:

- official source
- source version or publication identifier when available
- effective date / applicable tax periods
- interpretation and assumptions
- calculation or validation rule
- test coverage
- professional validator
- validation date
- implementing release

All new tax ADRs begin as **Proposed**. They cannot become **Accepted** solely because code exists or tests pass. Appropriate UAE tax-professional validation is mandatory.

A rule change after a tax period is locked must be versioned prospectively. Historical tax periods must remain reproducible with the rule set applicable to those periods; prior filing history must not be silently rewritten.

## 7. Change-control rules

- No behavior-changing tax code may be merged without updating its repository specification, decision traceability, and automated tests.
- No document may be moved, renamed, archived, merged, deprecated, or deleted merely because a later file appears newer. Authority and references must be reviewed first.
- Legacy decision identifiers must be preserved.
- Executable governance files such as `vercel.json`, `firestore.rules`, workflow files and runtime configuration remain adjacent to the systems that consume them; documentation links to them rather than relocating them.
- Production data safety controls are never weakened as part of documentation cleanup.

## 8. Release traceability

Release/readiness claims must identify the exact commit SHA they describe. A stale PR description, chat checkpoint, or historical report is not current release evidence.

## 9. Tax filing safety principle

Tax tooling must be fail-closed: unresolved material exceptions, missing required evidence, invalid classifications, unreconciled balances, or failed approval gates must prevent a period from being represented as filing-ready.

Software verification proves that implemented rules behave as specified; it does not replace professional tax validation or statutory filing responsibility.
