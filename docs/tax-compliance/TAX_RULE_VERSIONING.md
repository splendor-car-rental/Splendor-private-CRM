# Tax Rule Versioning and Historical Reproducibility

Status: **Proposed**  
Professional validator: **Not yet assigned / not yet validated**  
Effective date: **Not applicable — architecture proposal only**

## Objective

Splendor OS must be able to reproduce why a tax result was produced for a historic tax period without silently applying a later legal interpretation or rule version.

## Rule-set identity

Each future executable tax rule set must have a stable version identifier. The final naming convention will be approved after the official-source pack and tax architecture are reviewed.

A tax rule-set version must record:

- version identifier
- status
- tax domain
- effective-from date
- effective-to date when known
- applicable tax periods
- official source IDs from `FTA_RULE_SOURCES.md`
- interpretation notes
- professional validator and validation date
- implementation commit / PR / release
- automated test references
- superseded rule-set version, if any

## Immutability of closed history and future filing records

For the current runtime, once a tax period is professionally validated or closed:

- its rule-set version is pinned;
- its source IDs are pinned;
- its prepared/reviewed/approved evidence is preserved;
- later rule/source changes invalidate downstream readiness instead of silently changing historic evidence;
- `Closed` never means `Filed`, and no filing/submission API currently exists.

If filing records or amendments are designed in a future approved stage, they must be immutable linked records rather than rewrites of closed period evidence.

## Prospective changes

A changed interpretation or official rule is implemented as a new rule-set version with its own effective period. If an official change is retroactive, the affected-period treatment must be explicitly reviewed and approved; software must not infer retroactivity from publication date alone.

## Draft versus Accepted rules

Proposed rules may be modeled and tested in non-filing workflows, but they must not cause a tax period to show as filing-ready.

Accepted tax rules require:

- official-source traceability;
- applicable effective dates;
- documented interpretation where required;
- appropriate UAE tax-professional validation;
- automated verification;
- release traceability.

## Data model invariants for future implementation

The eventual implementation should make the following impossible through ordinary application flows:

1. A closed period or future filed record with no pinned rule-set version.
2. An Accepted tax rule with no official source reference.
3. An Accepted tax rule with no professional validator.
4. Silent mutation of a locked period's calculated filing evidence.
5. Reuse of a later rule version to overwrite previously validated/closed calculations.
6. A future tax amendment with no link to the filing/period it corrects.

These are architecture invariants, not yet claims that the runtime implements them.
