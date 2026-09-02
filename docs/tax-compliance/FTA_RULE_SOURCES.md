# UAE Tax Official-Source Register

Status: **Proposed / Evidence Collection Required**  
Professional validator: **Not yet assigned / not yet validated**  
Effective date: **Not applicable — source register template**

## Purpose

This file is the canonical repository register for official external sources used to design Splendor OS tax rules.

No tax rule may cite “FTA compliance”, “Corporate Tax compliance”, or equivalent wording merely from general knowledge, UI copy, an old implementation, or an unsourced document. The exact official source and applicable effective period must be recorded here first.

## Source acceptance hierarchy

Prefer primary official sources, including as applicable:

1. UAE legislation and official legislative publications.
2. UAE Federal Tax Authority official legislation, decisions, guides, public clarifications, forms and published instructions.
3. UAE Ministry of Finance official Corporate Tax legislation, decisions, guidance and announcements.
4. Other competent UAE authority material only where directly relevant.

Secondary articles, vendor blogs, accounting-firm summaries, search snippets and AI-generated text may be useful discovery aids but are not authoritative tax-rule sources.

## Required fields for every source

| Field | Requirement |
|---|---|
| Source ID | Stable repository-local identifier; no ADR numbering |
| Tax domain | VAT / Corporate Tax / shared / other |
| Official authority | Publishing authority |
| Exact title | Official document/page title |
| Publication / decision / guide identifier | Record when available |
| Official URL | Direct official source location |
| Publication date | If stated |
| Effective date | If stated/applicable |
| Applicable tax periods | Derived only when supported |
| Version / revision | If stated |
| Topic | What rule/question the source informs |
| Source snapshot / retrieval date | For reproducibility |
| Supersedes / superseded by | If official source states it |
| Interpretation required | Yes/No |
| Professional validation status | Pending / Validated / Rejected / Superseded |
| Notes | Gaps, ambiguity, cross-references |

## Register

No official tax source has yet been accepted into this register under the new governance process.

| Source ID | Tax domain | Official authority | Exact title | Identifier | Official URL | Publication date | Effective date | Version | Topic | Retrieved | Interpretation required | Professional validation | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| _Pending research_ |  |  |  |  |  |  |  |  |  |  |  | Pending |  |

## Minimum VAT research scope

The research phase must identify current official sources for at least:

- VAT registration/entity status assumptions relevant to Splendor
- standard/zero/exempt/out-of-scope classification framework
- tax point / date-of-supply rules relevant to rentals and related charges
- full tax-invoice requirements
- simplified tax-invoice requirements and permitted use conditions
- tax credit/debit note requirements
- input-tax recoverability and blocked/restricted cases relevant to the company
- reverse-charge/import treatment where applicable
- adjustments and correction mechanisms
- VAT return form/box structure and filing workflow
- tax-period deadlines and amendment/disclosure mechanisms
- record/evidence retention requirements

This list is a research checklist, not a statement that every item applies to Splendor.

## Minimum Corporate Tax research scope

The research phase must identify current official sources for at least:

- taxable-person/entity framework relevant to Splendor
- tax-period and return-filing framework
- starting accounting profit/loss and tax-adjustment framework
- deductible/non-deductible expenditure categories relevant to operations
- depreciation/capital-asset treatment where applicable
- vehicle acquisition/disposal and financing considerations requiring professional interpretation
- interest/financing limitations where applicable
- related-party/connected-person requirements where applicable
- tax-loss rules where applicable
- reliefs/elections/exemptions only if factually relevant
- records/evidence and filing/payment obligations

Again, inclusion in the research checklist does not establish applicability.

## Professional-review questions

Questions that cannot be answered unambiguously from the official source pack must be recorded separately and remain blocking for any affected Accepted tax rule.

No ambiguity may be silently resolved in code.
