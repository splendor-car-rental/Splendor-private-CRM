# Splendor Master Decisions

Companion to `docs/SPLENDOR_MASTER_REQUIREMENTS_MAP.md`. Every item below
needs a decision only the user can make — none are decided here, and
nothing was implemented as a result of identifying them. Cross-referenced
by ID from the requirements map.

---

## DECISION-01 — Locate or reconstruct the original 89-Rule document

**Question.** Where is the original 89-Rule roadmap, and what do Rules
77–89 (and most of 1–89) actually say?

**Context.** A repo-wide search (`grep` across every `.ts`/`.tsx`/`.md`
file, `git log --all -p`, and a search for any file ever named with "rule"
across all git history) found **no trace of a standalone 89-Rule document
anywhere in this repository, ever** — not currently present, not deleted
in a prior commit. What survives are 21 individual rule numbers plus one
9-rule range (43–51), each as a short paraphrase inside a Procurement
Phase 1 code comment, several hedged ("rule 12-ish," "general rules 85,
87") — evidence that whoever wrote those comments was approximating from
memory or a prompt fragment, not quoting a document they had open. Rules
77, 78, 79, 80, 82, 83, 84, 86, 88, and 89 have **zero** evidence of any
kind. See `SPLENDOR_MASTER_REQUIREMENTS_MAP.md` §3 for the full table.

**Options.**
1. The user supplies the original document (or the earlier conversation/
   session it came from) directly, so it can be read and reconciled properly.
2. The user confirms the document never existed as a single artifact — it
   was always delivered piecemeal across sessions/messages — in which case
   "Rule 77" should be re-described as "the next thing Ahmed wants built,"
   not resumed as if a specific pre-written rule text exists to consult.
3. Proceed without the original text, treating the 21 recovered fragments
   plus the Blueprint (Source B) as the effective requirements baseline
   going forward, and formally retire the "Rule N" numbering in favor of
   the Blueprint's own item numbering.

**Cloud recommendation.** Option 1 if the document exists anywhere
retrievable (even a chat export); otherwise Option 3, since it least
depends on something that may be unrecoverable, and the Blueprint (fully
recovered) is a stronger, richer requirements source than the fragments
ever were.

**Risk.** Proceeding with Option 3 without at least attempting Option 1
risks silently dropping a real, specific business rule that was never
paraphrased into any code comment.

**Impact.** Blocks: confidently resuming "Rule 77" as originally scoped.
Does not block: continuing Procurement Phase 1's remaining known gaps
(already tracked separately in `DECISIONS-REQUIRED.md`), or beginning
Blueprint-driven planning under Option 3.

**What can proceed.** Legal review of Blueprint claims (§13 of the
requirements map); business-side inquiries to RTA/Salik/banks; the small,
self-contained software items in §18 (3-hour buffer, hash-chaining).

**What is blocked.** Anything specifically framed as "continue from Rule
77" until this decision is made.

---

## DECISION-02 — How are customer deposits actually collected today?

**Question.** Is the security deposit currently taken as a bank
*authorization hold* (per Blueprint REQ-BP06-1), an ordinary charge, or
something else — and if a hold, through what mechanism, since no banking/
payment-gateway API client exists anywhere in this codebase?

**Context.** `depositReleaseDays` (default 21) and a `DepositStatus` enum
(`pending | collected | held | applied | partially_refunded | refunded`)
exist in the data model (`src/types/index.ts:546-556`), suggesting the
*concept* of a held-then-settled deposit is designed for. But
`docs/ENGINEERING_CAPABILITY_AUDIT.md` §17 states plainly: no banking API,
no payment-gateway SDK exists anywhere in the code. `bank_transactions`
appears to be manually reconciled data. This is CONFLICT-02 in the
requirements map.

**Options.**
1. Deposits are collected manually today (a real-world hold arranged by
   phone/POS-terminal outside this software, then just *recorded* in the
   CRM) — in which case the Blueprint's REQ-BP06-1 describes a future
   automation, not current reality, and should be tracked as net-new work.
2. Deposits are collected via a payment integration this investigation
   didn't find evidence of (e.g. embedded in a POS system not represented
   in this repo) — in which case that system needs to be identified before
   any "automatic release" logic (REQ-BP06-2/3) can safely be built here.
3. Deposits are not currently collected as an authorization hold at all
   (e.g. a straightforward charge) — a materially different, and possibly
   already-live, business/financial reality that the Blueprint's design
   assumes away.

**Cloud recommendation.** Confirm which of the three is true before
building anything further on top of `depositReleaseDays` — this is a
factual question about current operations, not an engineering choice.

**Risk.** Building an "automatic release" job on the assumption of Option
1's design when Option 3 is actually true could silently release funds
that were never actually held as security.

**Impact.** Blocks: any work on REQ-BP06-2/3/4/5 (auto-settlement,
auto-invoice-shortfall, hold-expiry monitoring). Does not block: anything
else in this document.

**What can proceed.** All other decisions and the small self-contained
items in §18 of the requirements map.

**What is blocked.** Any deposit-automation build.

---

## DECISION-03 — Audit trail: build hash-chaining, or correct the compliance claim?

**Question.** Should `recordAudit()` be extended with cryptographic
hash-chaining (each entry stores a hash of the previous one, so deleting
any entry is detectable), to make the Blueprint's own stated defense
(REQ-BP12-4) technically true — or should the compliance narrative instead
be corrected to describe what actually protects the log today (no
application code path can delete an entry; `firestore.rules` denies client
writes entirely; only direct Admin-SDK/console access could bypass this,
with no automatic detection)?

**Context.** Confirmed by direct code read: `recordAudit()`
(`server.ts:277-283`) is a plain sequential append with no reference to
any prior entry's hash. This is CONFLICT-03 in the requirements map.

**Options.**
1. Implement hash-chaining now — a contained, no-external-dependency,
   well-understood change to one function, and its own regression tests.
2. Defer, and instead correct any customer/investor/compliance-facing
   material to describe the *actual* current protection accurately (no
   delete path in application code; least-privilege Firestore rule) rather
   than claiming tamper-evidence that doesn't yet exist.
3. Both — implement it AND correct any prior overstated claim in the
   meantime, in that order.

**Cloud recommendation.** Option 3 — this is one of the lowest-risk,
highest-integrity-value items on the entire list, and correcting the
interim claim costs nothing.

**Risk.** If this is currently represented to a customer, insurer, or
auditor as already true, that is a compliance exposure independent of
whether it ever gets built.

**Impact.** Blocks: nothing else. Does not block anything.

**What can proceed.** Everything — this is one of the most independently
actionable items identified.

**What is blocked.** Nothing.

---

## DECISION-04 — Is Salik reconciliation meant to become live/real-time, or stay batch import?

**Question.** The Blueprint (REQ-BP04) describes a real-time gate-crossing
comparison engine; the current system (`tollFileParsers.ts`,
`tollImportGuard.ts`) is a file-import-and-parse mechanism. Is a live
Salik API integration actually being pursued, or was "real-time" in the
Blueprint aspirational/descriptive language for what a same-day batch
import already achieves operationally?

**Context.** CONFLICT-04 in the requirements map. No live Salik/RTA-parking
API client exists in the codebase.

**Options.**
1. Pursue a live Salik/RTA API — requires a business-side inquiry into
   whether such an API/partner channel exists at all (unknown from this
   codebase, same category of unknown as RTA fines access).
2. Keep the file-import mechanism as the permanent design, and treat any
   customer-facing "live total" language as "as of the last import," set
   accordingly in UI copy.
3. Increase import frequency (e.g. hourly/daily automated pull if Salik
   offers a downloadable-file API even without a live push feed) as a
   middle ground.

**Cloud recommendation.** Option 3 first (lowest effort, most likely to be
actually available), while a business-side inquiry (Option 1) runs in
parallel — matches the same "engineering can't determine this, needs a
business-side inquiry" pattern already established for RTA in
`DECISIONS-REQUIRED.md` item 3.

**Risk.** Customer-facing "your Salik total" screens implicitly promising
real-time accuracy when the underlying data may be hours-to-days stale.

**Impact.** Blocks: nothing else.

**What can proceed.** Everything else.

**What is blocked.** A genuinely "real-time" implementation, until an
actual live feed is confirmed to exist.

---

## DECISION-05 — Is the public customer-facing website part of this repository?

**Question.** REQ-BP10/REQ-BP11 both describe a public website experience
(booking flow with a 10-minute checkout hold, dynamic pricing shown to a
shopper). This repository's own architecture description
(`docs/ENGINEERING_CAPABILITY_AUDIT.md` §1) describes one Vite+Express
monorepo with no distinct public-facing booking site called out. Is the
public website (if one exists) a separate codebase/repository entirely?

**Context.** This investigation did not have visibility beyond this one
repository, and did not search for or assume the existence of another
repository, per its own scope discipline.

**Options.**
1. Confirm a separate public-website repository exists — in which case
   REQ-BP10/11's website-facing sub-requirements need that repository
   added to any future investigation's scope, since they cannot be
   assessed from this repository alone.
2. Confirm the CRM itself *is* the only customer-facing surface (e.g. a
   sales agent always mediates bookings) — in which case REQ-BP10-4 (a
   public checkout hold) and parts of REQ-BP11 may not apply as described.

**Cloud recommendation.** No recommendation — this is a factual question
about the business's own architecture that only the user can answer
quickly.

**Risk.** None from asking; the risk is planning REQ-BP10/11 work against
the wrong repository if this isn't clarified first.

**Impact.** Blocks: a complete assessment of REQ-BP10-4 and REQ-BP11.

**What can proceed.** Everything else, including the CRM-side booking-
conflict work already well-implemented in `availability.ts`.

**What is blocked.** A complete website-side requirements assessment.

---

## DECISION-06 — KYC/OCR/liveness: build vs. buy, and which vendor

**Question.** REQ-BP02 requires OCR document extraction and facial-
liveness verification with zero existing code to build on. Should this be
built from scratch or bought from a KYC vendor, and if bought, which one
(cost, UAE-market support, data-residency implications)?

**Options.** (1) Build in-house (slow, expensive, highest control). (2) A
KYC/OCR SaaS vendor with UAE ID/passport support (faster, recurring cost,
data leaves the company's own infrastructure unless the vendor offers
on-prem/regional hosting). (3) A hybrid — off-the-shelf OCR, in-house
matching/eligibility-rule logic.

**Cloud recommendation.** No recommendation — this is materially a
procurement/cost/compliance decision, not primarily an engineering one;
engineering can evaluate specific vendor proposals once the business
identifies candidates.

**Risk.** Handling Emirates ID/passport images and facial biometrics
carries real data-protection obligations regardless of vendor choice.

**Impact.** Blocks: REQ-BP02 entirely, and by extension the trustworthiness
of REQ-BP01 (signature) and any KYC-gated booking flow.

**What can proceed.** Everything not dependent on identity verification.

**What is blocked.** REQ-BP02 and anything depending on it.

---

## DECISION-07 — GPS/telematics hardware and provider

**Question.** REQ-BP07 (geofencing/speed monitoring) requires a physical
GPS/telematics solution in each vehicle — a fleet-hardware decision, not
purely software. Which vendor/hardware, and what is the install/retrofit
plan across the existing fleet?

**Cloud recommendation.** No recommendation — hardware sourcing and fleet
logistics are outside this investigation's visibility entirely.

**Risk.** None from deferring; the risk is treating this as a software
estimate when it is fundamentally a hardware procurement one.

**Impact.** Blocks: all of REQ-BP07, and the GPS-cross-match half of
REQ-BP05-5.

**What can proceed.** Everything else.

**What is blocked.** REQ-BP07 entirely.

---

## DECISION-08 — RTA/Dubai Police official integration channel

**Question.** Carried forward unchanged from `DECISIONS-REQUIRED.md` item
3 (not re-litigated here) — does an official RTA/Police API, corporate
portal, or partner program exist for fines/black-points/license
verification, and is Splendor eligible for it?

**Cloud recommendation.** A business-side inquiry directly to RTA/Police —
not an engineering task. Browser automation/scraping is explicitly not
recommended (legal and reliability risk).

**Impact.** Blocks: REQ-BP02-3 (license-origin verification against an
official source), REQ-BP05 entirely (fines/black-points).

**What can proceed.** Everything not dependent on this integration.

**What is blocked.** REQ-BP05, and the official-verification half of REQ-BP02.

---

## DECISION-09 — Banking/payment-gateway partner for deposit authorization holds

**Question.** If DECISION-02 confirms a genuine authorization-hold design
is wanted (not just recorded manually), which bank/payment gateway
supports the described flow (hold now, capture the difference at day 21,
monitor hold-expiry), and what are the integration/compliance
requirements (PCI scope, etc.)?

**Cloud recommendation.** Resolve DECISION-02 first; this decision is
downstream of it.

**Impact.** Blocks: REQ-BP06-1/3/4/5.

**What can proceed.** Everything not dependent on a live banking
integration.

**What is blocked.** The automated half of the deposit engine.

---

## DECISION-10 — Discount-ceiling enforcement mechanism

**Question.** REQ-BP11-5 describes a hard 5% discount ceiling for regular
staff, with anything above requiring a logged, electronic sales-manager
approval. Does an equivalent already exist via `config/permissions.ts`'s
role-rank model, and if not, should this be built as its own
approval-gated rule inside the existing Business Rules Engine (the same
pattern already used for other tiered permissions in this codebase)?

**Cloud recommendation.** If genuinely new, this fits the existing
Business Rules Engine pattern (Phase 23.1) very naturally — low risk, no
new primitive needed, and directly requested is only whether to build it,
not how.

**Risk.** Low — this is a contained, well-precedented pattern in this
codebase.

**Impact.** Blocks: nothing else.

**What can proceed.** Everything.

**What is blocked.** Nothing — this can be picked up any time once decided.

---

## DECISION-11 — Priority order across the 12 Blueprint items

**Question.** Given the Blueprint spans compliance/legal, external
integrations, hardware, and pure software (§17 of the requirements map),
in what order does the business actually want these pursued? Engineering
effort alone should not decide this — customer risk, legal exposure, and
revenue impact should.

**Cloud recommendation.** The sequence proposed in §18 of the requirements
map (resolve DECISION-01/02 first; legal review next; then the small
self-contained software wins; then the external-dependency inquiries
running in parallel with everything else) — offered as a starting point,
not a final answer, since only the business can weigh legal/financial/
customer priorities against each other.

**Impact.** Blocks: an efficient use of future engineering sessions if
left undecided — work could proceed in a technically-correct but
business-priority-mismatched order.

**What can proceed.** The technical work is not dependent on this decision
existing on paper — but doing it without a stated priority risks solving
the wrong problem first.

**What is blocked.** Nothing technically; sequencing quality is at risk.

---

## DECISION-12 — Whether to retire the "Rule N" convention going forward

**Question.** Given DECISION-01's likely outcome (the original document
may not be recoverable), should all future work be tracked against the
Blueprint's own item numbering (REQ-BP01–REQ-BP12, as extracted in this
document) instead of continuing an "89 Rules, Rule 90+" numbering whose
own foundation is now known to be incomplete?

**Cloud recommendation.** Yes, once DECISION-01 is resolved one way or the
other — continuing a numbering scheme with a documented, unrecoverable
60-rule gap (§3 of the requirements map) creates a false sense of
completeness ("we're on Rule 90, so 1–89 must be settled") that this
investigation's own findings directly contradict.

**Risk.** Low to change; the risk is in *not* changing it and having a
future session inherit the same unverifiable "Rule 77" framing this one
had to flag.

**Impact.** Organizational/tracking only — no code impact either way.

**What can proceed.** This can be decided independently of every other
item in this document.

**What is blocked.** Nothing.

---

**Do not delete or renumber any Rule.** Per the mission's explicit
instruction, no original Rule text was modified, merged, or removed — this
document only records what needs the user's decision, exactly as found.
