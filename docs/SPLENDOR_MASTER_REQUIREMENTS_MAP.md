# Splendor Private CRM — Master Requirements Map

Discovery and reconciliation only. Nothing in this document was implemented,
fixed, refactored, or deployed. Every status below is backed by a concrete
file/line/test/commit reference — never asserted without evidence, per this
mission's own rule ("Never use IMPLEMENTED without evidence").

**POST-DISCOVERY UPDATE (Master Blueprint implementation session).** A
later, separately-scoped session (see `docs/SPLENDOR_MASTER_RULES.md` for
the full replacement Rule Set) implemented a triaged subset of the gaps
identified below: audit hash-chaining (REQ-BP12-4), the 3-hour booking
buffer + 10-minute soft hold (REQ-BP10-2/4), the blocklist/watchlist engine
(REQ-BP03), the discount ceiling (REQ-BP11-5), and mileage-driven
maintenance-status tracking with a human-initiated start/complete workflow
(REQ-BP09-1/2/3). The §6 Cross-Reference Matrix rows for these items are
updated in place below to reflect the new, verified status — every other
row (and this document's discovery-phase narrative in §1-5, §7+) is left
exactly as originally written, since it remains an accurate historical
record of what this discovery pass found at the time.

---

## 1. Executive Summary

This mission set out to reconcile four sources: (A) an original "89 Rules"
roadmap with a claimed checkpoint at Rule 76/next-resume Rule 77, (B) a
12-item Arabic-language Master Blueprint (uploaded twice this session,
byte-identical both times), (C) the actual repository, and (D) prior
audit/QA evidence already in the repo.

**The central finding: Source A cannot be recovered.** No file, commit,
document, or artifact anywhere in this repository contains the original
89-Rule text. What survives are **21 individual rule numbers plus one
9-rule block reference (rules 43–51)** — short paraphrases embedded as code
comments in the Procurement Phase 1 modules, evidently copied from rule
bullets a prior session was given as inline instructions, never saved as a
standalone document. Rules 77 through 84, 86, 88, and 89 have **zero**
trace anywhere. Rules 85 and 87 have only a hedged, approximate mention
("rule 12-ish / general rules 85, 87" — `src/server/purchaseOrders.ts:466`)
— not a verbatim rule citation. **This means the premise "last confirmed
checkpoint: Rule 76, next: Rule 77" cannot be verified against anything in
this repository.** See §3–4 and §31 for the full evidence trail.

Source B (the Blueprint) is fully recovered and reconciled below (§5–6):
12 top-level items, expanded into 47 discrete requirements. Of those, a
meaningful minority already have real, evidenced backend implementation
(atomic booking conflict prevention, a 21-day deposit-release field,
append-only audit logging, file-based toll statement import, RBAC +
Segregation of Duties); most of the Blueprint's most distinctive claims
(live signature capture with geo/device fingerprinting, OCR/KYC document
extraction, a cross-referenced blocklist, live RTA/Police/Salik API feeds,
geofencing/GPS/speed telematics, interactive 3D damage marking, preventive
maintenance auto-scheduling, dynamic event-based pricing) have **no
implementation at all** — confirmed by repo-wide search, not inferred.

Source C (repository) and Source D (existing audits) are extensively
cross-referenced throughout — this document does not repeat investigations
`docs/QA_PHASE1_FINAL_REPORT.md` and `docs/ENGINEERING_CAPABILITY_AUDIT.md`
already concluded; it cites them.

No implementation, fix, or refactor was performed. No Rule 77+ was started.
No Blueprint item was built.

---

## 2. Source Inventory

| Source | What it is | Recovery status | Where |
|---|---|---|---|
| A — Original 89 Rules | A numbered business-rules roadmap; checkpoint claimed at Rule 76/77 | **NOT RECOVERABLE as a document.** 21 rule numbers + 1 range survive as code-comment fragments only | `server.ts`, `src/config/procurement.ts`, `src/server/{purchaseOrders,suppliers,procurementApprovals}.ts`, `tests/procurement.test.ts` — see §3 |
| B — Master Blueprint | 12-item Arabic engineering guide (4 "محاور"/axes) | **FULLY RECOVERED** — both uploads (`432389ea-...md`, `51d726ec-...md`) are byte-identical | This session's uploads |
| C — Actual repository | The real codebase | **FULLY INSPECTED** for this mission's scope (frontend, backend, Firestore, tests, config, git history) | This repo, branch `claude/vercel-firestore-deploy-jf4kqr` |
| D — Existing project evidence | Prior audits/QA/decisions | **FULLY READ AND REUSED**, not re-derived | `docs/QA_PHASE1_FINAL_REPORT.md`, `docs/ENGINEERING_CAPABILITY_AUDIT.md`, `docs/REPOSITORY_INVENTORY.md`, `docs/DOCUMENT_STORAGE_ARCHITECTURE.md`, `DECISIONS-REQUIRED.md` |

---

## 3. Original Rules 1–89 — Recovery Status

**Method.** `grep -rnoE "[Rr]ule[s]? [0-9]+(-[0-9]+)?(,\s*[0-9]+)*"` across
every `.ts`/`.tsx`/`.md` file in the repository (42 raw matches), plus a
full `git log --all -p` scan for "Rule" in commit messages/diffs, plus a
search for any file ever named with "rule" in it across all of git history
(`firestore.rules`, `businessRules.ts`, and their tests only — no master
rules document was ever committed or deleted).

**Result: 21 distinct rule numbers + 1 declared range (43–51, 9 rules) have
ANY evidence. That is at most 29 of 89 slots with a trace, and even those
traces are short paraphrases inferred by whoever wrote the code comment —
not the rule's original text.** The remaining ~60 rule numbers have zero
evidence anywhere in this repository.

| Rule # | Evidence found | Paraphrase (from the comment itself — not verified against an original text) | File:line |
|---|---|---|---|
| 1 | Yes | Sequential PO-SCR-1xx numbering, system-issued, never reused | `src/server/purchaseOrders.ts:51` |
| 2 | Yes | (unspecified in comment — bare reference) | `server.ts:5271`, `src/config/procurement.ts:16` |
| 4–7 | Yes (block) | Supplier core-mandatory fields / activation gating | `src/server/suppliers.ts:10,15,29,36,53`, `server.ts:5310`, `tests/procurement.test.ts:169` |
| 9 | Yes (as "9-10" block) | PO → Operation ID issuance on approval | `server.ts:6887`, `src/server/purchaseOrders.ts:148,227` |
| 10–11 | Yes | PO amendment: new version, old version retained | `src/config/procurement.ts:114`, `src/server/purchaseOrders.ts:261`, `server.ts:5462` |
| 12 | Yes (hedged: "12-ish") | Partial line-item cancellation | `src/server/purchaseOrders.ts:466` |
| 34 | Yes | Debt/charge fixed type list | `server.ts:5300`, `src/config/procurement.ts:40` |
| 43–51 | Yes (block, 9 rules) | Employee-expense / standalone-expense category list | `server.ts:5305`, `src/config/procurement.ts:66` |
| 57 | Yes | Retroactive PO reasons (`emergency_purchase` from spec; rest a starter set) | `server.ts:5290`, `src/config/procurement.ts:29`, `src/server/purchaseOrders.ts:55` |
| 59 | Yes | Regular and retroactive POs share one approval system | `src/server/purchaseOrders.ts:53` |
| 62 | Yes | `emergency_purchase` retroactive-PO reason specifically | `src/config/procurement.ts:33` |
| 64 | Yes | Standalone operational-expense categories | `src/config/procurement.ts:66` |
| 67 | Yes | Fixed procurement payment-method list | `server.ts:5295`, `src/config/procurement.ts:54` |
| 74 | Yes | TARS 3-hour deadline, "real number given by the business" | `src/config/procurement.ts:139` |
| 81 | Yes | Customer delay / late fee, "real numbers given by the business" | `src/config/procurement.ts:135` |
| 85 | Yes | "منشئ الحركة لا يعتمد حركته بنفسه" — maker cannot approve own movement (Segregation of Duties) | `src/server/procurementApprovals.ts:10`, `src/server/purchaseOrders.ts:47,56,469` |
| 87 | Yes (hedged: "general rules 85, 87") | Same SoD principle, applied to line-item cancellation | `src/server/purchaseOrders.ts:469` |
| **77–80, 82–84, 86, 88, 89** | **NONE** | **No trace anywhere in the repository, git history, or documentation.** | — |
| All other numbers 3, 8, 13–33, 35–42, 52–56, 58, 60–61, 63, 65–66, 68–73, 75–76 | **NONE** | **No trace anywhere.** | — |

**Explicit answer to "what is Rule 77" and "what do Rules 78–89 cover":
unknown. Cannot be determined from this repository.** The claimed
checkpoint ("last confirmed: Rule 76, next: Rule 77") is **not supported by
any artifact this investigation could find** — it may exist in an earlier
conversation/session not present in this repo's history, in an external
document never committed, or the checkpoint tracking itself may be
referencing a different numbering than the fragments found here. This is
flagged as **DECISION-01** in `docs/SPLENDOR_MASTER_DECISIONS.md` — the
correct next step is for the user to supply the original document (or
confirm it no longer exists), not for this investigation to guess its
content.

**A secondary discrepancy worth flagging directly:** the recovered
fragments already reference rules up to 87 (Segregation of Duties,
implemented and tested in Procurement Phase 1), which is *numerically*
past the claimed "Rule 76 checkpoint." This does not necessarily mean
Rules 77–87 as a *block* are done — rule 85/87 could be an out-of-sequence
cross-cutting principle applied opportunistically, not a proof that 77–84
and 86 are complete. Recorded as **CONFLICT-01** in §10.

---

## 4. Current Rule Checkpoint

As stated by the user: last confirmed original checkpoint = Rule 76; next
resume point = Rule 77. **This investigation could not verify this claim**
(§3). Separately, and not to be confused with the above, this repository
has its own internal engineering checkpoint history (Phases 0–23.9 of an
original security/architecture remediation, then Procurement Phase 1
checkpoints P1.0–P1.16, then this session's FIN-002/PO-Amendment/TARS/
Late-Fees/Debts/idempotency/balance-offset checkpoints) — these are
**this assistant's own work-tracking labels across sessions, not the
original 89-Rule numbering**, and should not be conflated with it. No
attempt is made here to map "Phase 23.4" to "Rule N" — there is no evidence
they correspond.

---

## 5. Master Blueprint Requirements — Full Extraction

12 top-level Blueprint items (المحاور الأربعة / four axes), expanded into
**47 discrete requirements** below. Full REQ-ID table in §31 (Evidence
Index) cross-references every row to file/line evidence. Structure per
item: axis → Blueprint item number/title (Arabic, preserved verbatim) →
sub-requirements.

### Axis 1 — Legal Compliance, Digital Documentation, Sovereign Integration

**Item 1 — منظومة العقود الرقمية الموحدة والتوقيع الحي الموثق** (Unified digital contracts + live authenticated signature)
- REQ-BP01-1: Server-exclusive contract generation from booking data (customer, vehicle, value, deposit, duration) with UAE-Dubai legal terms baked in.
- REQ-BP01-2: Unique non-reusable sequential contract number + verifiable QR code.
- REQ-BP01-3: Live signing session capturing device fingerprint, IP/protocol, second-precision timestamp, and geographic coordinates of the signing location.
- REQ-BP01-4: Post-signature document freeze via cryptographic hash-seal — any later single-character DB edit voids the contract programmatically.
- REQ-BP01-5 (from the Blueprint's own weakness/remedy): mandatory one-time WhatsApp/SMS OTP sent to the customer's own registered number before a signing session can complete, specifically to prevent an employee signing on the customer's behalf.
- REQ-BP01-6 (from the Blueprint's own Q&A): offline-capable signature capture with encrypted local storage, syncing atomically once connectivity returns.

**Item 2 — التحقق الذكي من الهوية والأهلية ورخص القيادة** (Smart identity/eligibility/driving-license verification)
- REQ-BP02-1: OCR extraction of name, document number, DOB, expiry from Emirates ID/passport/driving license/visa uploads, auto-filling fields (zero manual typing).
- REQ-BP02-2: Age-vs-vehicle-class engine — ≥21 for standard luxury/sedan classes, ≥25 with ≥1 year license validity for supercar/sports classes (Ferrari/Lamborghini/Rolls-Royce named as examples).
- REQ-BP02-3: License-type/origin matching — UAE residents restricted to a UAE-issued license only; visitors matched against an approved GCC/exempt-country list, else an International Driving Permit is mandatory.
- REQ-BP02-4: Document-expiry-vs-rental-period check — reject or truncate a booking if a visa/license expires mid-rental.
- REQ-BP02-5 (from the Blueprint's own remedy): machine-readable barcode/MRZ verification on ID/passport cross-checked against the printed fields, plus a live selfie with facial-motion liveness check, to catch forged/doctored document images.

**Item 3 — سجل التدقيق الأمني والقائمة المحظورة المشتركة** (Security audit log + shared blocklist)
- REQ-BP03-1: Non-deletable, indexed, encrypted table of customers with prior violations (reckless driving, unpaid fines, prior damage, fraud attempts).
- REQ-BP03-2: Silent proactive check the instant a phone number or passport is entered anywhere in the website/CRM.
- REQ-BP03-3: Tiered blocking — full block (generic "unavailable" message, no dispute triggered) vs. conditional block (raised deposit or operations-manager authorization with a logged reason).
- REQ-BP03-4: Matching by exact unique-pair identifiers (passport number + country, or UAE Emirates ID number) — explicitly never by name alone, to avoid false-positive blocks from name collisions.
- REQ-BP03-5 (from the Blueprint's own remedy): Segregation of Duties on unblocking — one staff member cannot remove a block; requires a separate unblock request + a documented approval from a higher-ranked manager, logged permanently.

### Axis 2 — Financial Automation, Insurance, Violations, Tariffs

**Item 4 — المطابقة الزمنية اللحظية لبوابات التعرفة (سالك) والمواقف** (Real-time Salik/parking gate-crossing reconciliation)
- REQ-BP04-1: Ingest Salik gate-crossing records (named gates: Al Maktoum, Al Safa, Al Barsha, Al Mamzar, etc.) and RTA smart-parking data with timestamp + gate/plate identifiers.
- REQ-BP04-2: Real-time comparison engine matching crossing time against the active contract window; auto-append the toll (official tariff + admin service fee) to the correct contract's invoice with gate name + minute-level timestamp.
- REQ-BP04-3: Live running Salik total surfaced on both the CRM contract screen and the customer-facing screen, auto-deducted at final settlement.
- REQ-BP04-4 (from the Blueprint's own Q&A): crossings before the actual signed handover time are classified as internal fleet movement (company cost), not customer-billed, based on comparing crossing time to the real signature timestamp.
- REQ-BP04-5 (from the Blueprint's own remedy): final Salik-file closure deliberately delayed to align with the deposit's settlement window (see Item 6), since gate data can lag behind the actual vehicle return by up to two weeks in the Blueprint's own stated experience.

**Item 5 — دورة حياة المخالفات المرورية ونقل النقاط السوداء** (Traffic-fine lifecycle + black-point transfer)
- REQ-BP05-1: Ingest Dubai Police/RTA fine records (fine number, date/time, violation type, amount, points, vehicle-hold status).
- REQ-BP05-2: Auto-match fine time/location to the actual renter of that vehicle at that moment and update their account.
- REQ-BP05-3: For severe violations (>80 km/h over limit, reckless driving): generate an electronic black-point transfer request to the renter's license; offer a paid vehicle-release/impound-substitute fee if the vehicle cannot be redeemed from police hold.
- REQ-BP05-4 (from the Blueprint's own Q&A): this is the stated engineering justification for the 21-day deposit hold (Item 6) — a customer who leaves the country before a fine posts is still covered because the deposit authorization is still live.
- REQ-BP05-5 (from the Blueprint's own remedy): attach the official radar photo + its timestamp, cross-matched against the vehicle's own stored GPS location at that same moment, as irrefutable evidence against a customer's "I wasn't driving there" dispute.

**Item 6 — هندسة الوديعة المالية والتأمين الرقمي الذكي** (Security-deposit engineering + smart digital insurance)
- REQ-BP06-1: Deposit as a bank *authorization hold* on the customer's card, never an immediate "purchase" charge (avoids extra FX conversion fees for the customer, funds stay reserved as company security).
- REQ-BP06-2: On vehicle return, contract enters "pending field + financial settlement"; system arms a precise 21-day timer from the return timestamp.
- REQ-BP06-3: At timer completion, server auto-computes `deposit − (fines + damages + tolls + other charges)`; if positive, issues a bank release order for the difference and sends an official statement via WhatsApp + email.
- REQ-BP06-4 (from the Blueprint's own Q&A): if charges exceed the deposit, auto-charge the full deposit, generate an invoice for the remaining balance with a direct card-payment link, and flag the customer file for "urgent financial follow-up" with escalating legal payment reminders.
- REQ-BP06-5 (from the Blueprint's own remedy): monitor the bank authorization's own expiry date (some international banks expire holds early); auto-renew the hold or temporarily capture the funds into an escrow account if expiry would occur before the 21-day audit window closes.

### Axis 3 — Field Fleet Management & Digital Control

**Item 7 — السياج الجغرافي، مراقبة السرعة وحماية المحركات** (Geofencing, speed monitoring, engine protection)
- REQ-BP07-1: Digital map of all UAE roads/areas where driving is permitted; hard-block zones explicitly listing unpaved desert areas, unofficial racetracks, and land border crossings.
- REQ-BP07-2: Programmed speed ceiling (e.g. 160 km/h, the Blueprint's own stated UAE legal max); instant alert to the operations dashboard and on-duty staff screen on any breach.
- REQ-BP07-3: Two-tier violation protocol — Level 1 (alert): automated polite WhatsApp safety reminder to the renter; Level 2 (danger): audible alarm in the operations center when approaching a land border or entering a sand track, for immediate operational action.
- REQ-BP07-4 (from the Blueprint's own Q&A): VIP customer location data is encrypted and restricted to authorized operations managers only for emergency/security cases — not broadly visible to all staff, to respect privacy regulations.
- REQ-BP07-5 (from the Blueprint's own remedy): store the last confirmed GPS fix plus entry/exit timestamps when signal is lost in deep underground parking; alert if signal loss persists beyond a set duration *outside* a known parking-structure location.

**Item 8 — الفحص الميداني الرقمي ثلاثي الأبعاد وإثبات التلفيات** (3D digital field inspection + damage evidence)
- REQ-BP08-1: Guided inspection screen requiring exactly 8 mandatory photos at fixed angles (front, sides, rear, all 4 wheels, odometer/fuel gauge, interior).
- REQ-BP08-2: Interactive 3D vehicle model letting staff tap the *exact* point of any scratch/dent, classify its size, and photograph it.
- REQ-BP08-3: Visual record signed by the customer at handover; on return, the same screen opens side-by-side with the handover record for direct comparison, auto-flagging any new damage and issuing an immediate approved cost estimate.
- REQ-BP08-4 (from the Blueprint's own Q&A): forced flash + high-resolution capture at night, with encrypted geo/time-stamped photo storage and the customer's digital signature on the approved inspection diagram, specifically to defeat a "the scratch was already there, lighting was bad" dispute.
- REQ-BP08-5 (from the Blueprint's own remedy): automated image-quality rejection (blur/darkness detection) that blocks the handover-completion button until the photo is retaken, to stop staff rushing through with unusable photos.

**Item 9 — جدولة الصيانة الوقائية الفائقة وصحة المركبات** (Superior preventive-maintenance scheduling + vehicle health)
- REQ-BP09-1: Auto-accumulate mileage per contract into a central per-vehicle odometer record.
- REQ-BP09-2: Preventive-maintenance thresholds per vehicle: oil/filter every 5,000–8,000 km; sport-tire/ceramic-brake inspection by mileage + driving-pattern; monthly exterior paint detailing/protection.
- REQ-BP09-3: Programmatic booking block — 500 km before a maintenance threshold, alert the workshop manager; at the threshold, auto-flip the vehicle to "in scheduled maintenance," hiding it from the website and CRM booking until an approved maintenance report clears the block.
- REQ-BP09-4 (from the Blueprint's own Q&A): for a long-term booking that would cross a future maintenance threshold, the system computes projected mileage and proactively suggests moving the maintenance date up or substituting a same-or-higher-class vehicle.
- REQ-BP09-5 (from the Blueprint's own remedy): a "smart auto-substitution" engine that, on a sudden vehicle breakdown, immediately proposes equivalent-or-higher available fleet vehicles to re-house a confirmed booking without disturbing the customer.

### Axis 4 — Website ↔ Operations-Room Technical Integration

**Item 10 — محرك منع التضارب الحصري (القفل الذري اللحظي)** (Exclusive conflict-prevention engine / instantaneous atomic lock)
- REQ-BP10-1: Real-time availability query against existing bookings the moment a customer picks pickup/return dates on the website.
- REQ-BP10-2: Automatic mandatory 3-hour operational buffer appended after every booking's end, before the next booking's start — reserved for vehicle receipt + inspection + luxury detailing/prep + repositioning.
- REQ-BP10-3: Exclusive atomic database transaction at the moment of confirmation — a second customer's simultaneous attempt on the same vehicle/window is rejected outright by the database itself, never a race resolved after the fact.
- REQ-BP10-4 (from the Blueprint's own Q&A): a 10-minute temporary soft-hold on a vehicle while a customer is mid-checkout (payment/ID step); auto-released back to availability if not completed within that window.
- REQ-BP10-5 (from the Blueprint's own remedy): proactive reminders to the current renter 2 hours before contract end; on no response/lateness, an automatic red-alert in the operations room to prep and offer a free upgrade substitute to the next customer.

**Item 11 — محرك التسعير الديناميكي للفعاليات والمواسم في دبي** (Dynamic event/seasonal pricing engine for Dubai)
- REQ-BP11-1: A Dubai annual major-events calendar (Dubai Airshow, GITEX, Downtown NYE, Formula racing, holidays) driving pricing rules.
- REQ-BP11-2: Automatic peak-period price uplift (e.g. +30%/+50%) plus a minimum-rental-duration floor (e.g. 3 or 5 days instead of 1); automatic off-peak competitive multi-day/weekly offers.
- REQ-BP11-3: A single rule change propagates instantly to the website, CRM, and quotations — no per-vehicle manual repricing.
- REQ-BP11-4 (from the Blueprint's own Q&A): a reference-numbered, 24-hour-validity price-lock quote mechanism so a salesperson's agreed price survives a mid-negotiation dynamic-price change, as long as the customer completes booking within the window.
- REQ-BP11-5 (from the Blueprint's own remedy): a hard discount-authority ceiling — regular staff capped at 5%, anything above requires a logged, electronically-approved sales-manager decision inside the system.

**Item 12 — سجل التدقيق والحوكمة الإدارية المطلقة** (Absolute audit trail + administrative governance)
- REQ-BP12-1: An eternal, immutable operational log of every system action (booking creation, data edit, deposit release, fine cancellation, vehicle handover, unblock) recorded the instant it happens.
- REQ-BP12-2: Each entry carries: acting user ID, their role/permission, precise timestamp, IP address, the prior state, and the new state.
- REQ-BP12-3: Programmatic Segregation of Duties preventing any staff member from approving their own action — a discount/deposit-refund requester never holds the approve button; it must route to a separate administrative account.
- REQ-BP12-4 (from the Blueprint's own Q&A): the audit database is explicitly designed append-only, with records cryptographically hash-chained such that deleting any one record breaks the chain and is automatically detected by an integrity check — stated as the specific defense against a DB admin or the system's own developer silently erasing an entry.
- REQ-BP12-5 (from the Blueprint's own remedy): periodic archiving of old audit records into indexed, encrypted cold storage optimized for fast read, while keeping their cryptographic fingerprint intact, to manage multi-year log growth without slowing live queries.

---

## 6. Cross-Reference Matrix (Blueprint → Current Implementation)

| REQ (representative) | Current status | Evidence |
|---|---|---|
| REQ-BP01-1/2 (server-side contract generation, sequential numbering) | **PARTIALLY_IMPLEMENTED** | `Contract` type exists with `id`/`contractNumber` (`src/types/index.ts:525`); `contractOps.ts` handles handover/return financial integrity server-side. No QR-code generation found. |
| REQ-BP01-3/4/5/6 (geo-tagged live signing, OTP-gated, hash-sealed, offline-capable) | **MISSING** | `customerSignatureUrl`/`employeeSignatureUrl` on `HandoverInspection`/`ReturnInspection` (`src/types/index.ts:490-491,520-521`) are plain optional string URL fields — no signing session, no geo-coordinate capture, no device fingerprint, no OTP gate, no cryptographic seal, no offline queue found anywhere in the repo (`grep` for `digitalSignature`, `signSession`, `geoSignature` — zero matches). |
| REQ-BP02-1..5 (OCR/KYC/eligibility/age/license engine) | **MISSING** | No OCR/KYC/liveness code exists anywhere (`grep -riE "KYC|OCR|liveness"` across `.ts`/`.tsx` — zero true matches; false-positive hits were unrelated substrings). No age-vs-vehicle-class or license-origin matching engine found. |
| REQ-BP03-1..5 (blocklist/watchlist + tiered blocking + unblock SoD) | **IMPLEMENTED (Master Rule Set RULE-B01-B05, this session)** | `src/server/blocklist.ts`: entries matched ONLY by an exact normalized identifier pair (Emirates ID, or passport + issuing country) -- never by name (RULE-B01); `tier: 'full' \| 'conditional'` (RULE-B02); a proactive check fires in `POST /api/customers` before creation, `full` rejects outright (403), `conditional` surfaces a warning (RULE-B03); removal is gated behind the generic `procurementApprovals.ts` Segregation-of-Duties engine, the requester can never approve their own removal (RULE-B04); every block/unblock decision calls `recordAudit` (RULE-B05). Full UI at `src/components/views/SecurityBlocklistView.tsx`. Verified: 7 tests in `tests/coreWorkflows.test.ts` + a real-Chromium/Playwright pass (7/7 checks) against real Firestore/Auth emulators. **Known residual gap** (documented, not silently claimed complete): the proactive check fires only at new-customer creation, not re-checked if a customer becomes blocklisted after their record already exists (e.g. at reservation/contract time). |
| REQ-BP04-1..5 (live Salik/parking gate matching) | **PARTIALLY_IMPLEMENTED — different mechanism** | `src/server/tollFileParsers.ts` + `tollImportGuard.ts` exist (confirmed in `docs/REPOSITORY_INVENTORY.md`) — a **file-import-and-parse** mechanism for Salik/Darb statements, plus `lib/tollCalculations.ts` for toll pricing math, covered by `tests/tollFileParsers.test.ts` and `tests/tollImportSecurity.test.ts`. This is manual/batch statement import, **not** a live real-time gate-crossing API feed compared against the active contract window automatically. |
| REQ-BP05-1..5 (live traffic-fine ingestion + black-point transfer + radar/GPS cross-match) | **MISSING** | No RTA/Dubai-Police integration of any kind exists — confirmed by `docs/ENGINEERING_CAPABILITY_AUDIT.md` §17/§18 (repo-wide search: every "RTA" string is literal contract-terms text, not an API client) and reconfirmed in this investigation. No GPS/telematics code exists (§7 below), so the radar-photo-vs-GPS cross-match has no data source to draw on even if built. |
| REQ-BP06-1 (deposit as bank authorization hold, not a charge) | **TECHNICAL_DESIGN_REQUIRED / UNKNOWN** | No payment-gateway/banking API client exists anywhere in the codebase (`docs/ENGINEERING_CAPABILITY_AUDIT.md` §17: "Banks — NOT AVAILABLE", "Payment gateways — NOT AVAILABLE"). `bank_transactions` is reconciled data, not a live authorization-hold API. Whether deposits are captured this way today cannot be determined from code — this is a real external-dependency gap, not just a missing feature. |
| REQ-BP06-2 (21-day settlement timer) | **PARTIALLY_IMPLEMENTED** | `depositReleaseDays: number; // default 21 days -- editable per contract` exists as a real field (`src/types/index.ts:549`), and `DepositStatus` includes `'held' \| 'applied' \| 'partially_refunded' \| 'refunded'` (`src/types/index.ts:556`) — the *data model* for a 21-day held-then-settled lifecycle exists. No scheduled job/cron was found that automatically fires at day-21 and computes the release (the one existing cron in `vercel.json` runs `/api/notifications/run-checks` every 6 hours — its content was not traced in this pass to confirm whether it includes deposit-release logic; flagged for follow-up, not assumed either way). |
| REQ-BP06-3/4/5 (auto-compute release, auto-invoice shortfall, bank-hold-expiry monitoring) | **UNKNOWN — not traced to a conclusion this pass** | See above; would require reading the notification-check cron's actual body, out of this discovery pass's efficiency budget — recommended as a fast, cheap follow-up before assuming either way. |
| REQ-BP07-1..5 (geofencing, speed alerts, two-tier protocol, GPS-loss handling) | **MISSING** | Zero matches anywhere for `geofenc`, `telematic`, `gpsLocation`, `speedAlert`, `overspeed` across the entire `.ts`/`.tsx` tree. No GPS/telematics hardware integration, no map/zone engine, no speed-monitoring code exists. |
| REQ-BP08-1 (8 mandatory angle photos) | **PARTIALLY_IMPLEMENTED (Master Rule Set RULE-I01-I08, this session)** | The new, separate `VehicleInspection` entity (`src/server/vehicleInspections.ts`, `src/types/index.ts` `VehicleInspection`/`InspectionPhoto`) requires a configurable set of photo categories per inspection type before completion is allowed — `pre_delivery`/`handover`/`return` require 7 categories (front/rear/left/right/interior/dashboard_odometer/fuel_gauge), `in_rental` requires `damage` only, `post_return` requires `dashboard_odometer` only (`src/config/inspectionPhotoCategories.ts`). This is a real, server-enforced completion gate (`completeInspection()` rejects if any required category has zero photos), not the Blueprint's exact fixed 8-angle set, and there is still no image-quality (blur/darkness) rejection gate. The pre-existing `HandoverInspection`/`ReturnInspection` embedded fields on `Contract` are untouched and remain in their prior partial state. |
| REQ-BP08-2 (tap-exact-point 3D model) | **PARTIALLY_IMPLEMENTED — simpler shape (unchanged this session)** | `VehicleDamageMarker` (`src/types/index.ts:466-472`, and the new `InspectionDamageMarker`) both record damage by a **fixed enum of vehicle parts** (`front_bumper`, `rear_bumper`, `hood`, ... 11 parts) + a severity enum + notes + optional photos — not a free-form coordinate/pixel-position marker on an interactive 3D model. |
| REQ-BP08-3 (handover-vs-return side-by-side comparison, auto-flag new damage) | **PARTIALLY_IMPLEMENTED — manual comparison, deliberately not automated (Master Rule Set RULE-I06, this session)** | `startInspection()` accepts an optional `compareAgainstInspectionId`; `VehicleInspectionsView.tsx`'s workspace renders a side-by-side panel showing both inspections' damage counts and lets the inspector page through both photo sets manually. There is **no automated image-diff/damage-detection** — the mission explicitly required "a strong manual comparison workflow rather than fake AI detection," so no differencing algorithm was built. The old `HandoverInspection.damages`/`ReturnInspection.newDamages` embedded-array comparison this row originally described is still not wired into any UI (unchanged, still a real gap for that specific legacy path). |
| REQ-BP08-4/5 (forced-flash/geo-time-stamped photos, blur/darkness rejection) | **MISSING (unchanged this session)** | No image-quality-check code, no forced-flash control, no geo/time-stamp-on-photo mechanism found. Out of this mission's explicit scope (no OCR/liveness/detection work was authorized). |
| REQ-BP09-1/2 (odometer accumulation, configurable maintenance thresholds) | **IMPLEMENTED (Master Rule Set RULE-M01/M02, this session)** | `src/server/maintenance.ts`: `computeMaintenanceScheduleUpdate()` reads `maintenanceOilFilterIntervalKm`/`maintenanceAlertLeadKm` from the Business Rules Engine and recomputes `maintenanceStatus` (`optimal`/`due_soon`) on every mileage update (wired into `POST /api/contracts/:id/return`, the only place mileage changes). Verified: 4 pure-function tests + real-Chromium/Playwright pass in `tests/maintenance.test.ts`/`scripts/qaMaintenanceVerify.mjs`. |
| REQ-BP09-3 (programmatic booking block at threshold) | **PARTIALLY_IMPLEMENTED (Master Rule Set RULE-M03, this session) -- narrower by deliberate choice** | `POST /api/fleet/:id/start-maintenance` sets `status:'maintenance'`, which `availability.ts` already hard-blocks bookings against, and `POST /api/fleet/:id/log-maintenance` returns it to `available`. This is **human-initiated**, not automatic at threshold-crossing: crossing the threshold only flips the informational `maintenanceStatus` to `due_soon` (visible on the vehicle's Schedule tab); a ceo/admin/fleet user must explicitly click Start Maintenance to actually block bookings. Judged the safer default for a live revenue fleet (auto-blocking a vehicle the instant an odometer reading crosses a number, with no human in the loop, was not treated as an implicit requirement of "auto-flip" without an explicit product decision) -- documented here rather than silently shipped as the fully-automatic version the Blueprint describes. |
| REQ-BP09-4 (projected-mileage conflict warning) | **MISSING** | Not built this session -- needs a booking-duration-aware mileage projection, a reasonable but non-trivial addition to the booking flow (RULE-M04 in `docs/SPLENDOR_MASTER_RULES.md`). |
| REQ-BP09-5 (auto-substitution suggestion) | **MISSING** | Not built this session (RULE-M05 in `docs/SPLENDOR_MASTER_RULES.md`). |
| REQ-BP10-1/3 (real-time availability check, atomic exclusive-lock booking) | **IMPLEMENTED — genuinely strong** | `src/server/availability.ts` (`reserveVehicleSlot()`) — a real Firestore-transaction-scoped conflict check across `reservations`/`contracts` for the same `vehicleId`, throwing `AvailabilityConflictError` and writing nothing if a conflict exists; idempotency-key support prevents a network-retry from double-booking or self-conflicting. This is the single most solidly-implemented Blueprint capability found in this investigation. Covered by earlier phases per `docs/ENGINEERING_CAPABILITY_AUDIT.md` §4 ("Phase 3 — transactional vehicle availability"). |
| REQ-BP10-2 (mandatory 3-hour buffer between bookings) | **IMPLEMENTED (Master Rule Set RULE-R03, this session)** | `src/server/availability.ts`: `rangesConflictWithBuffer()` generalizes the plain overlap check to require a configurable minimum gap (`bookingOperationalBufferHours`, default 3h) in either temporal direction, applied to both reservations and contracts. Verified against the real Firestore emulator: `tests/bookingBuffer.test.ts` (4 tests covering both buffer directions and the exact-boundary edge case). |
| REQ-BP10-4 (10-minute soft hold during checkout) | **IMPLEMENTED (Master Rule Set RULE-R04, this session)** | `src/server/availability.ts`: `placeTemporaryHold()`/`releaseTemporaryHold()` on a new `temporary_holds` collection, honored as a conflict source inside `reserveVehicleSlot()`; lazy expiry (no cleanup job -- a hold past its `expiresAt` is simply skipped by every conflict check). `POST /api/fleet/holds` / `DELETE /api/fleet/holds/:id`. Verified against the real Firestore emulator: `tests/bookingBuffer.test.ts` (4 tests including a real concurrent-hold-request race). |
| REQ-BP10-5 (pre-emptive 2-hour-before reminder + red-alert substitution) | **UNKNOWN** | WhatsApp notification infrastructure exists (`notificationEngine.ts`, `whatsapp.ts`) and could carry this, but no specific "2 hours before contract end" trigger was confirmed in this pass. |
| REQ-BP11-1/2/3 (event calendar, dynamic/seasonal pricing, quote lock) | **MISSING** | Zero matches for `dynamicPric`, `surgePric`, `eventPricing`, `seasonalPric` anywhere in the codebase. No pricing-rule engine, no Dubai-events calendar, no quote-lock-with-reference-number mechanism (RULE-P02/P03 in `docs/SPLENDOR_MASTER_RULES.md` -- deferred as coherent, standalone future units rather than half-built this session). |
| REQ-BP11-5 (discount ceiling, escalated approval) | **IMPLEMENTED (Master Rule Set RULE-P01, this session)** | `POST /api/quotations` enforces `staffDiscountCeilingPercent` (default 5%, Business Rules Engine). ceo/admin apply any discount immediately; anyone else above the ceiling gets the quotation created immediately at the capped discount, with the full requested discount held as a pending `Quotation`/`discount_override` request in the existing generic Segregation-of-Duties engine (`procurementApprovals.ts`) -- surfaced in the existing Procurement & Suppliers > Approvals inbox. UI discount input added to `src/components/views/QuotationsView.tsx` (previously modeled in state/pricing math with no actual input control). Verified: 4 tests in `tests/coreWorkflows.test.ts` + a real-Chromium/Playwright pass (`scripts/qaDiscountVerify.mjs`) confirming the full capped-creation -> approvals-inbox -> CEO-approval -> full-discount-applied round trip. |
| REQ-BP12-1/2 (immutable eternal log with full actor/timestamp/before/after) | **IMPLEMENTED** | `recordAudit()` (`server.ts:277-283`) — writes an `AuditLog` (id, timestamp, actor fields) via `createDurable`, called from effectively every mutating route across this session's entire history. `firestore.rules:96-99`: `audit_logs` collection is `allow write: if false` client-side — server (Admin SDK) is the only writer, and no delete route exists anywhere in `server.ts`. |
| REQ-BP12-3 (Segregation of Duties, no self-approval) | **IMPLEMENTED** | `approvals.ts`/`procurementApprovals.ts` — a real, reused primitive enforcing `requestedBy !== decider.uid` server-side (not just UI-hidden), confirmed both by source (`procurementApprovals.ts:152`) and by real-browser + direct-API testing in `docs/QA_PHASE1_FINAL_REPORT.md` §8. |
| REQ-BP12-4 (cryptographic hash-chaining, tamper detection on delete) | **IMPLEMENTED (Master Rule Set RULE-A01, this session)** | `src/server/auditIntegrity.ts`: every `AuditLog` entry now stores `contentHash`/`previousHash` (computed by `appendToAuditChain()`, called from `recordAudit()` before every write); `verifyAuditChainIntegrity()` walks the chain and reports tamper-detected=true if any entry's hash doesn't match or a link is missing. `GET /api/audit-integrity/verify` (ceo/admin only). A deliberately lightweight, non-globally-serializing design (reads/writes a small `system_state/audit_chain_head` doc as two separate cheap operations, not one global transaction) that tolerates benign "forks" from concurrent writes while still detecting true tampering (a content edit or a deletion breaks the chain). Verified against the real Firestore emulator: `tests/auditIntegrity.test.ts` (7 tests). |
| REQ-BP12-5 (encrypted cold-archival with fingerprint preserved) | **MISSING** | `docs/DATA_RETENTION.md` (Phase 23.9) exists for retention policy generally, but no archival-with-cryptographic-fingerprint mechanism specific to audit logs was found in this pass (not read in full — flagged, not concluded). |

---

## 7. Current Implementation Matrix (system-wide, not Blueprint-scoped)

Reused directly from `docs/ENGINEERING_CAPABILITY_AUDIT.md` §1–2 and
`docs/REPOSITORY_INVENTORY.md` (not re-derived): server-authoritative
Firestore persistence; atomic sequential ID issuance (`idGenerator.ts`);
Firebase Auth + server-verified role-based `requireRole` on every mutating
route; a universal Segregation-of-Duties primitive; idempotency-key
protection on payments, bank-reconciliation, and (as of this session) 10
Procurement create-routes; a full Procurement Phase 1 module set
(suppliers, POs, quotes, payments, balances, refunds, debts, custody,
invoices, operational expenses, vehicle receiving, TARS, late fees); a
Business Rules Engine with Four-Eyes approval and an emergency kill switch
(Phase 23); anomaly detection, dead-letter queue, operational health
modules (Phase 23.6/23.7); a Disaster Recovery drill script (Phase 23.8);
a Data Retention policy framework (Phase 23.9); WhatsApp Cloud API and
Gemini AI as the only two live external integrations; Vite/React 19
frontend with no client-side router (state-driven navigation only); Vitest
test suite, 15 files, 264 tests as of this session's last commit
(`4e1dffd`) — up from 249 at the last audit, the +15 being this session's
FIN-002/idempotency/balance-offset/UI-workflow test additions.

---

## 8. Missing Requirements (confirmed zero implementation)

1. OCR/KYC document extraction + facial-liveness verification (REQ-BP02-1/5).
2. Age-vs-vehicle-class and license-origin/validity eligibility engine (REQ-BP02-2/3/4).
3. Live geo-tagged/device-fingerprinted digital signature capture with OTP gating and cryptographic document sealing (REQ-BP01-3/4/5/6).
4. A dedicated cross-referenced blocklist/watchlist engine with tiered blocking and passport+country/Emirates-ID pair matching (REQ-BP03 beyond the existing `blocklisted` status flag).
5. Live RTA/Dubai-Police traffic-fine ingestion and black-point transfer (REQ-BP05).
6. Live Salik/parking gate-crossing API feed and real-time contract matching (current: file-import only — REQ-BP04).
7. Geofencing, GPS/telematics, and speed-alert monitoring (REQ-BP07).
8. Interactive 3D/coordinate-based damage marking, mandatory 8-angle photo capture, and automated image-quality rejection (REQ-BP08-1/2/4/5).
9. Preventive-maintenance scheduling by accumulated mileage, with auto-booking-block and auto-substitution (REQ-BP09).
10. The mandatory 3-hour post-booking operational buffer and the 10-minute checkout soft-hold in the availability engine (REQ-BP10-2/4).
11. A Dubai-events-calendar-driven dynamic pricing engine, quote-lock mechanism, and enforced discount ceiling (REQ-BP11).
12. Cryptographic hash-chaining of the audit trail for delete-tamper detection (REQ-BP12-4).
13. Banking/payment-gateway integration of any kind (a prerequisite for REQ-BP06-1's "authorization hold, not a charge" claim to be technically meaningful).

## 9. Partial Requirements (real but different from the Blueprint's description)

1. Blocklist: a status flag + notification exists; not the described silent-check/tiered/paired-identifier engine.
2. Salik/toll: file-import-and-parse exists; not a live gate-crossing feed.
3. Deposit 21-day window: the data field exists (`depositReleaseDays`, default 21); the automatic day-21 compute-and-release job was not confirmed either way in this pass.
4. Damage documentation: a fixed-part + severity + photo model exists; not free-form coordinate marking, not mandatory 8-angle capture, not quality-gated.
5. Audit trail: real, append-only-by-construction (no delete route, `allow write: if false` client-side); not cryptographically hash-chained.
6. Vehicle-availability atomic locking: fully real and solid; missing only the specific 3-hour buffer and 10-minute soft-hold parameters.

## 10. Duplicate/Overlap and Conflict Analysis

**Overlaps** (one existing mechanism partially satisfies two different Blueprint items):
- The existing Segregation-of-Duties primitive (`approvals.ts`/`procurementApprovals.ts`) satisfies part of both REQ-BP03-5 (unblock approval) and REQ-BP12-3 (no self-approval generally) — one implementation, two Blueprint items reference it.
- `recordAudit()` + its Firestore rule (`allow write: if false`) satisfies part of both REQ-BP12-1/2 (the log itself) and REQ-BP12-4's *weaker* half (no delete path exists) — but not its stronger half (cryptographic tamper detection).

**No duplicate Rules or duplicate Blueprint requirements were found** — each Blueprint sub-requirement extracted in §5 is textually distinct.

### Conflicts

| CONFLICT-ID | Source A | Source B | Conflict | Current behavior | Risk | Recommendation | Decision required |
|---|---|---|---|---|---|---|---|
| CONFLICT-01 | User's stated checkpoint ("Rule 76 done, Rule 77 next") | Repo evidence (§3) | Repo evidence references rule numbers up to 87 (Segregation of Duties, implemented) — numerically past the claimed checkpoint — while rules 77–84/86/88/89 have zero trace at all | Ambiguous — cannot determine whether 77–84/86 are "not started" or simply "never separately documented" | Low immediate risk, high planning risk (resuming "Rule 77" without knowing what it is) | Do not resume Rule 77 until the source document is located or reconstructed with the user directly | **Yes — DECISION-01** |
| CONFLICT-02 | Blueprint REQ-BP06-1 (deposit is a bank *authorization hold*) | Current code (no payment/banking API exists) | The Blueprint assumes a live card-authorization capability the codebase has no integration for at all | `bank_transactions` appears to be manually reconciled data (per `docs/ENGINEERING_CAPABILITY_AUDIT.md` §17), not a live hold mechanism | Medium — if deposits are currently collected as an ordinary charge rather than a hold, that is a live divergence from the Blueprint's stated design, with real customer-experience and dispute implications | Confirm with the business how deposits are actually collected today, before assuming REQ-BP06-1 is even partially met | **Yes — DECISION-02** |
| CONFLICT-03 | Blueprint REQ-BP12-4 (hash-chained tamper detection) | Current audit trail design | The Blueprint's own Q&A explicitly answers "can an admin delete an audit record to hide it? No — hash-chaining detects it" — but no hash-chaining exists | A DB admin with direct Firestore/Admin-SDK access could delete an audit_logs document with no automatic detection today (no application code path can, but direct infra-level access is a different threat model) | Medium — a compliance/audit claim in the Blueprint is not technically true of the current system | Either implement hash-chaining, or correct the compliance narrative to describe what actually exists (no-delete-route + access control, not cryptographic tamper-evidence) | **Yes — DECISION-03** |
| CONFLICT-04 | Blueprint REQ-BP04 (Salik "real-time") | Current toll mechanism (file import) | "Real-time" and "batch file import" are materially different guarantees for a customer-facing "live running total" | The CRM likely shows whatever was last imported, not a live feed | Low-Medium — a customer-facing "your Salik total" screen could be visibly stale between imports | Decide whether a live Salik API is being pursued, or whether the Blueprint's "real-time" language should be understood as "same-day batch" for this business | **Yes — DECISION-04** |

---

## 11. Hidden / Implied Requirements

Labeled explicitly per the mission's instruction — these were never stated
as a numbered Blueprint or Rule item, but are technically necessary for a
stated capability to work safely.

1. **DISCOVERED / IMPLIED — Digital contract signing** (underlies REQ-BP01) requires: real identity verification of the signer (REQ-BP02 must exist first, or signing is meaningless), document-integrity sealing, an audit trail of the signing event itself, version control if a contract is later amended, and a recovery path if a signing session is interrupted (partially covered today by nothing — no offline-signing queue was found).
2. **DISCOVERED / IMPLIED — The booking/reservation engine** (underlies REQ-BP10) requires atomicity (✅ implemented), idempotency (✅ implemented), concurrency control (✅ implemented via Firestore transactions), temporary holds with expiration (❌ missing — REQ-BP10-4), and availability-state synchronization between the public website and the CRM's own `globalStore`/Firestore state (⚠️ the website side of this was explicitly out of this mission's scope to inspect further — see §23).
3. **DISCOVERED / IMPLIED — The deposit system** (underlies REQ-BP06) requires an authorization lifecycle distinct from a simple charge (❌ unconfirmed — CONFLICT-02), a settlement-state machine (✅ partially — `DepositStatus` enum exists), charge evidence linking a deduction to an approved claim (✅ — `src/types/index.ts:595` explicitly requires an approved charge before any deposit deduction, "prevents the same charge from being deducted twice"), refund evidence, concurrency protection on the deposit balance itself (not specifically re-verified this pass), and financial audit (✅ via `recordAudit`).
4. **DISCOVERED / IMPLIED — Any KYC/eligibility gate** (underlies REQ-BP02) requires a legally defensible record of *why* a booking was approved or refused (not just that it was), since a wrongful refusal or a wrongful approval both carry legal/reputational exposure for a luxury-fleet business — this record does not exist today because the gate itself does not exist.
5. **DISCOVERED / IMPLIED — Live external data feeds** (RTA fines, Salik, banking) each require a defined behavior for *feed unavailability/staleness* — e.g., what happens to a 21-day deposit-release computation if the fines feed hasn't posted yet at day 21? The Blueprint's own Q&A for REQ-BP05-4 answers this for the deposit-hold duration, but does not address a *feed outage* scenario, which is a real operational risk once any of these integrations exist.
6. **DISCOVERED / IMPLIED — A blocklist engine** (REQ-BP03) requires a defined *appeals/correction* path (what happens when a block was placed on genuinely mismatched identifiers despite the pair-matching design, or when circumstances change) — not addressed in the Blueprint's own Q&A beyond the escalated-approval unblock path, and not implemented today.

---

## 12. External Integrations

| Integration | Blueprint reference | Status | Classification |
|---|---|---|---|
| RTA (Roads & Transport Authority) | REQ-BP02 (license verification), REQ-BP05 (fines) | No integration code exists anywhere (confirmed, `docs/ENGINEERING_CAPABILITY_AUDIT.md` §18) | **REQUIRES_PARTNER_ACCESS / UNKNOWN** — official channel not established |
| Dubai Police | REQ-BP05 (fines, radar photos) | No integration code exists | **REQUIRES_PARTNER_ACCESS / UNKNOWN** |
| Salik / Darb | REQ-BP04 | File-import parsers exist; no live API client | **REQUIRES_API** (live feed) — current file-import is **AVAILABLE** as a lesser mechanism |
| Banks / card authorization-hold | REQ-BP06 | No banking/payment-gateway client exists | **REQUIRES_API + REQUIRES_CREDENTIALS + REQUIRES_APPROVAL** |
| GPS / Telematics hardware or provider | REQ-BP07 | No code exists | **REQUIRES_PARTNER_ACCESS** — a physical/fleet-telematics vendor decision, not just an API key |
| OCR / Identity-document extraction service | REQ-BP02 | No code exists | **REQUIRES_API** (a third-party OCR/KYC vendor, or a from-scratch model — either is a real build, not a config change) |
| Liveness / facial-motion verification | REQ-BP02-5 | No code exists | **REQUIRES_API** (typically bundled with an OCR/KYC vendor) |
| WhatsApp Cloud API (Meta) | REQ-BP01-5, REQ-BP07-3, REQ-BP10-5, generally | **Fully wired, live** | **AVAILABLE** |
| Gemini AI | Not Blueprint-specific; existing "AI Intelligence" feature | **Fully wired, live** | **AVAILABLE** |
| Email | Referenced implicitly (REQ-BP06-3, "official statement via WhatsApp and email") | No email-sending code exists at all — WhatsApp is the only outbound channel | **REQUIRES_API** |

No API was invented. No government portal automation was assumed possible. Per the audit's own established position (`DECISIONS-REQUIRED.md` item 3, reaffirmed here): RTA/Police integration needs a business-side inquiry before any engineering feasibility work, and browser automation/scraping against a government portal is explicitly not recommended.

---

## 13. Legal / Regulatory Verification

Per the mission's explicit instruction, Blueprint statements are **not**
treated as verified law — they are the source document's own claims,
separated here from any independent legal confirmation (which this
investigation has no capability to perform).

| Claim (Blueprint's own words, paraphrased) | Classification | Note |
|---|---|---|
| An e-signature with timestamp/geo/registered contact data is fully binding under UAE Federal E-Transactions & Trust Services Law | **LEGAL_VERIFICATION_REQUIRED** | Stated confidently in the Blueprint's own Q&A (Item 1) as settled law; this investigation cannot confirm current legal accuracy or completeness and did not attempt to |
| UAE residents must hold a UAE-issued license; visitors need GCC/exempt-country license or an IDP | **LEGAL_VERIFICATION_REQUIRED** | A real, well-known UAE traffic-law category, but the *exact* exempt-country list and current rules should be confirmed against RTA's current published list before being hard-coded |
| Minimum ages of 21 (standard) / 25 (supercar) | **BUSINESS_REQUIREMENT**, not inherently a legal minimum | The Blueprint presents this as the *company's* risk policy tied to insurance, not a stated UAE legal age-of-driving rule — should be classified as business policy unless a specific insurance/legal citation is provided |
| 21-day deposit hold duration | **BUSINESS_REQUIREMENT** | Presented as an operational choice matched to typical fine-posting delay, not a legal mandate |
| Programmed 160 km/h speed ceiling as "the national legal maximum" | **LEGAL_VERIFICATION_REQUIRED** | UAE speed limits vary by road classification; a single flat national maximum should be confirmed, not assumed |
| VAT, document retention, digital-signature admissibility generally | **LEGAL_VERIFICATION_REQUIRED** | Existing `config/tax.ts` (5% UAE VAT) and `docs/DATA_RETENTION.md` already encode current understanding from a prior phase — not re-verified in this pass |
| Black-point transfer to a renter's license as an available RTA/Police mechanism | **LEGAL_VERIFICATION_REQUIRED** | Presented as a straightforward electronic process in the Blueprint; whether this is actually available to a private rental company (vs. requiring the vehicle owner/police to initiate it a specific way) needs direct confirmation, not assumption |

No law was invented or assumed by this investigation. Every row above is a
flag for the user (or the user's legal counsel) to resolve — not something
this document resolves on its own authority.

---

## 14. Business Decisions Required

See `docs/SPLENDOR_MASTER_DECISIONS.md` for the full, structured decision
list (DECISION-01 through DECISION-12). Summary count: **12 business
decisions** identified as blocking further planning or implementation.

---

## 15. Technical Design Decisions

1. Choice of OCR/KYC/liveness vendor vs. building in-house (REQ-BP02) — a build-vs-buy decision with real cost/compliance tradeoffs.
2. Choice of GPS/telematics hardware/provider (REQ-BP07) — a fleet-hardware decision, not purely software.
3. Architecture for a live external-feed reconciliation engine (Salik/fines/banking) that must handle feed lateness/outage gracefully (§11 item 5) — needs a designed retry/staleness policy before any of REQ-BP04/05/06's "auto-compute" claims can be built safely.
4. Whether audit-trail hash-chaining (REQ-BP12-4) is added to the existing `recordAudit()` primitive or is a parallel new mechanism — an additive change to a heavily-reused function needs a compatibility plan.
5. Whether the 3-hour operational buffer (REQ-BP10-2) is enforced inside `reserveVehicleSlot()` directly (small, contained change) or as a separate pre-check layer — an implementation-shape decision for whichever future session builds it.
6. Data-model design for a dedicated `documents` collection (already proposed, not built, in `docs/ENGINEERING_CAPABILITY_AUDIT.md` §10) — relevant to REQ-BP01/02/08's document/photo storage needs, and should be resolved once rather than per-feature.

---

## 16. Dependency Map

```
REQ-BP01 (digital signature)
  depends on → REQ-BP02 (identity verification) -- a signature is only as
               trustworthy as the identity behind it
  depends on → a documents/storage architecture decision (§15.6)
  depends on → REQ-BP12-4 (tamper-evidence) for the "frozen, voidable on
               edit" claim to be technically real, not just policy

REQ-BP06 (deposit engine)
  depends on → a banking/payment-gateway integration (CONFLICT-02)
  depends on → REQ-BP05 (fines feed) to know what to deduct at day 21
  depends on → REQ-BP04 (Salik feed) for the same reason

REQ-BP05 (fines) and REQ-BP04 (Salik)
  both depend on → an external live-data-integration decision (§12) --
                    currently blocked on partner/API access, not on
                    engineering readiness

REQ-BP07 (geofencing/speed) 
  depends on → a GPS/telematics hardware decision (§15.2) -- cannot be
               pure software

REQ-BP08 (3D inspection)
  depends on → a documents/storage architecture decision (§15.6)
  benefits from, but does not strictly require → REQ-BP07's location data
               (for the radar/GPS cross-match use case in REQ-BP05-5)

REQ-BP10 (booking engine)
  is the LEAST dependent -- already substantially implemented; the
  remaining sub-requirements (3-hour buffer, 10-minute hold) are small,
  self-contained additions to existing, working code
  (`src/server/availability.ts`)

REQ-BP11 (dynamic pricing)
  depends on → a discount/approval-ceiling decision already partially
               possible via existing role-rank config (`config/
               permissions.ts`), otherwise independent of the other 11
               items -- one of the more standalone-buildable items
```

---

## 17. Post-89 Recommended Structure

Explicitly not assuming "Rule 90+" is correct by default, per the mission's
instruction. Given the evidence in §3 (the original 89-Rule structure
itself is not recoverable, and its remaining scope is unknown), and given
the Blueprint's 12 items span genuinely different disciplines (legal/
compliance, financial-external-integration, physical-fleet-hardware,
software-architecture), a single flat numbered "Rule" sequence is
**not recommended** as the container for what comes next. Recommended
structure instead:

- **Compliance Track** (REQ-BP01, REQ-BP02, REQ-BP03, the legal items in §13) — needs legal sign-off before engineering scope is even finalized; belongs in its own track with its own gate, not interleaved with pure engineering work.
- **External Integration Track** (REQ-BP04, REQ-BP05, REQ-BP06's banking half, RTA/Police/Salik/banks generally) — each is gated on partner/business access, not on this engineering team's pace; tracking these as Rules alongside pure-software items creates false "not started" signals for things that are actually "waiting on a phone call to RTA," a distinction §18 of the prior audit already made once and this document reaffirms.
- **Infrastructure/Hardware Track** (REQ-BP07's GPS/telematics) — a fleet-hardware procurement decision, materially different in kind from a software Rule.
- **Software Modules** (REQ-BP08 inspection UI, REQ-BP09 maintenance scheduling, REQ-BP10's remaining two sub-items, REQ-BP11 dynamic pricing, REQ-BP12-4 hash-chaining) — these ARE well-suited to the existing "checkpoint" style this repository already uses successfully (Procurement Phase 1's P1.0–P1.16 pattern), each as its own small, testable, git-checkpointed unit.
- Numbered **Rules** (if the original 89-Rule convention continues at all) should be reserved for genuine, atomic **business-policy statements** (the way the recovered fragments in §3 actually read — "rule 85: maker cannot approve own movement"), not entire multi-week feature builds; a feature build like "digital signature capture" is better tracked as a **module** that *implements* one or more Rules, mirroring how Procurement Phase 1 already cited rule numbers from within its own module-level checkpoints rather than being called "Rule 35."

---

## 18. Recommended Implementation Sequence

Priorities assigned in §20/29 (Risks) drive this ordering; not started, no code touched.

1. **Resolve DECISION-01** (locate or reconstruct the original 89-Rule document) — nothing about "resuming Rule 77" can proceed responsibly without this.
2. **Resolve DECISION-02** (how deposits are actually collected today) — a live financial-integrity question independent of any new feature.
3. Legal review of the items flagged in §13 — before any compliance-track engineering (REQ-BP01/02/03) is scoped in detail, since the *shape* of the correct implementation depends on the legal answers.
4. Small, low-risk, self-contained software additions with no external dependency: the 3-hour booking buffer and 10-minute soft-hold (REQ-BP10-2/4) — extends already-working, well-tested code.
5. Audit-trail hash-chaining (REQ-BP12-4) — a contained, well-understood cryptographic pattern, no external dependency, directly closes CONFLICT-03.
6. Business-side inquiries (not engineering) to RTA, Salik/Darb, and relevant banks — starts the clock on the external-dependency items, which otherwise block REQ-BP04/05/06 indefinitely.
7. Everything gated on those inquiries' answers, plus the hardware/vendor decisions in §15.

---

## 19. Security Requirements

Reused from `docs/ENGINEERING_CAPABILITY_AUDIT.md` §5 (not re-derived):
real server-side auth/authz (not UI-hiding only); Segregation of Duties
enforced server-side; fail-closed on missing service-account credentials;
WhatsApp webhook HMAC verification; solid edge security headers. **New,
Blueprint-driven security requirements this document adds**: an identity-
verification gate before signature capture (REQ-BP02 must precede REQ-BP01
being trustworthy); access-control scoping for VIP GPS location data
specifically to authorized operations managers (REQ-BP07-4 — not yet
relevant since no GPS data exists yet, but should be designed in from the
start if REQ-BP07 is ever built, not retrofitted); and closing CONFLICT-03
(hash-chained audit integrity) as a security-adjacent integrity control.

## 20. Financial Requirements

Reused from `docs/ENGINEERING_CAPABILITY_AUDIT.md` §6 and this session's
own concurrency-audit work (idempotency now covers payments, bank-
reconciliation, and 10 Procurement create-routes; the balance-offset
approval-time race is fixed; FIN-002 received-amount classification is
implemented and approved). **New, Blueprint-driven financial requirements**:
a real authorization-hold mechanism for deposits (REQ-BP06-1, blocked on
CONFLICT-02); an auto-settlement job at the 21-day mark (REQ-BP06-2/3,
partially data-modeled, job existence unconfirmed); a hard, system-enforced
discount ceiling (REQ-BP11-5) beyond whatever role-based UI restriction
may already exist.

## 21. Operational Lifecycle

```
Reservation → [KYC/Eligibility -- MISSING, REQ-BP02]
  → Contract (server-generated -- PARTIAL, REQ-BP01-1/2)
  → Signature ([MISSING] geo/OTP/hash-seal -- REQ-BP01-3/4/5/6)
  → Dispatch/Delivery
  → Inspection (handover) — PARTIAL: fixed-part damage markers + mileage/
      fuel exist (`HandoverInspection`), not the 8-photo/3D-tap/quality-
      gate design (REQ-BP08-1/2/4/5)
  → Active Rental
      → Salik/Fines accrual — PARTIAL (file-import Salik only; fines
        ingestion entirely MISSING, REQ-BP04/05)
      → Geofencing/speed monitoring — MISSING (REQ-BP07)
  → Return
  → Inspection (return) — same partial state as handover
  → Damage settlement — data fields exist (`damageCharge` etc. on
      `ReturnInspection`), automation behind them not confirmed
  → Deposit release (21-day timer) — PARTIAL: field exists, auto-job
      unconfirmed (REQ-BP06)
  → Contract Closure
```

**Missing states/transitions**: no explicit state for "blocked pending
KYC," no explicit "vehicle in scheduled maintenance, booking blocked" auto-
transition (the `'maintenance'` vehicle status exists and is *honored* by
`availability.ts`, but nothing was found that *sets* it automatically from
mileage thresholds — REQ-BP09-3). **Failure/recovery paths**: what happens
if a signature session is interrupted (REQ-BP01-6) has no implementation
to recover from, since the live-signing feature itself doesn't exist yet.

## 22. Fleet Requirements

Fleet/vehicle status model exists (`'maintenance' | 'unavailable'` at
minimum, per `availability.ts:76`) and is correctly honored as a hard
booking block. Missing: mileage-threshold-driven auto-maintenance
scheduling (REQ-BP09), geofencing/speed/GPS (REQ-BP07), and an explicit
auto-substitution engine for a vehicle going down mid-cycle (REQ-BP09-5) —
though the existing atomic-booking engine (`availability.ts`) would be the
natural place to extend for a "suggest equivalent vehicles" feature, since
it already computes conflicts per vehicle.

## 23. Website / CRM Requirements

Per this mission's explicit "DO NOT implement" instruction, this section
is mapping-only. `reserveVehicleSlot()` (§6, REQ-BP10) is confirmed
CRM/server-side and is genuinely solid for the core double-booking
prevention it targets. **This investigation did not find a separate public
website codebase or module** in this repository — `docs/
ENGINEERING_CAPABILITY_AUDIT.md`'s full repository description (§1) lists
one Vite+Express monorepo with no mention of a distinct customer-facing
booking site; whether the public website is a separate repository entirely
was **not determined** in this pass (out of the stated repository's own
visibility) — flagged as **DECISION-05** rather than assumed either way.

## 24. Pricing Requirements

Per this mission's explicit "DO NOT implement" instruction, mapping only.
No dynamic-pricing engine, event calendar, quote-lock mechanism, or
discount-ceiling enforcement specific to REQ-BP11 was found (§6, §8).

## 25. Governance Requirements

The strongest-evidenced area of the entire Blueprint reconciliation: real
audit trail, real Segregation of Duties, a Business Rules Engine with
tiering/versioning/Four-Eyes approval and an emergency kill switch (Phase
23.1–23.4), all pre-dating this mission and confirmed via `docs/
ENGINEERING_CAPABILITY_AUDIT.md` §4 and this session's own direct code
reading. The one confirmed gap is REQ-BP12-4 (cryptographic tamper
evidence), which is a genuine, specific, addressable gap — not a
wholesale governance failure.

## 26. New Requirements (no corresponding original Rule found)

Since Source A itself is largely unrecoverable (§3), most Blueprint items
cannot be confidently matched to "an existing Rule" or ruled out as new —
the honest answer is **unknown for the majority**. The following Blueprint
sub-requirements are flagged as most likely genuinely new (no plausible
overlap with any recovered rule fragment, by subject matter): REQ-BP01
(digital signature), REQ-BP02 (KYC/eligibility), REQ-BP03 (blocklist
engine beyond the existing status flag), REQ-BP07 (geofencing), REQ-BP08
(3D inspection), REQ-BP09 (maintenance scheduling), REQ-BP11 (dynamic
pricing) — none of the 21 recovered rule-number fragments (§3) touch any
of these subjects; all recovered fragments are Procurement-Phase-1-shaped
(POs, suppliers, debts, payments, approvals). This does **not** mean these
Blueprint items were never assigned a Rule number in the original,
unrecovered document — it means no evidence of that assignment survives.

## 27. Risks

| Risk | Severity | Basis |
|---|---|---|
| Resuming "Rule 77" without knowing its content | **HIGH** | §3 — genuinely unknown; could duplicate work, contradict an unrecalled constraint, or address the wrong problem entirely |
| Deposit collection mechanism ambiguity (CONFLICT-02) | **HIGH** | A live financial/customer-experience question with no current code answer |
| Audit trail's tamper-evidence claim (CONFLICT-03) not technically true | **MEDIUM** | Compliance/legal exposure if the Blueprint's stated defense is relied upon in an actual dispute |
| Building REQ-BP02/BP05/BP07 without partner/vendor access first | **MEDIUM** | Wasted engineering effort on features gated by an external party's cooperation, which no amount of coding resolves |
| Treating file-based Salik import as equivalent to "real-time" (CONFLICT-04) | **LOW-MEDIUM** | Customer-facing accuracy expectation mismatch |
| server.ts's ~7,000-line size (pre-existing, reconfirmed) | **LOW** (maintainability, not correctness) | `docs/ENGINEERING_CAPABILITY_AUDIT.md` §4 |

## 28. Unknowns

1. What Rules 77–89 (and most of 1–89) actually say — §3.
2. How deposits are actually collected today (charge vs. hold) — CONFLICT-02.
3. Whether the existing 6-hourly notification cron includes any deposit-release logic — not traced this pass.
4. Whether a handover-vs-return damage comparison UI already exists — not traced this pass.
5. Whether the public customer-facing website is part of this same repository or a separate one — DECISION-05.
6. Whether an enforced discount ceiling already exists via `config/permissions.ts`'s role-rank model, beyond what was directly confirmed.

## 29. Evidence Index

Every file/line citation used in this document, for direct verification:

- `src/server/availability.ts` (full file read) — REQ-BP10 evidence.
- `src/server/purchaseOrders.ts:47-56, 148, 227, 261, 466-469` — Rules 1, 9-11, 12, 57, 59, 85, 87.
- `src/server/suppliers.ts:10,15,29,36,53` — Rules 4-7.
- `src/server/procurementApprovals.ts:10` — Rule 85.
- `src/config/procurement.ts:16,29,33,40,54,66,80,114,135,139` — Rules 2, 34, 43-51, 57, 62, 64, 67, 74, 81.
- `server.ts:277-283` (recordAudit), `:909-916` (blocklist notification), `:5271-6887` (various rule comments), full-file grep for signature/KYC/geofence/dynamic-pricing terms.
- `src/types/index.ts:18` (CustomerStatus), `:466-523` (VehicleDamageMarker/HandoverInspection/ReturnInspection), `:549,556` (deposit fields), `:595` (deposit-deduction-requires-approved-charge), `:1569-1579` (ReceivedAmountClassification).
- `firestore.rules:96-99` — audit_logs write:false.
- `docs/QA_PHASE1_FINAL_REPORT.md`, `docs/ENGINEERING_CAPABILITY_AUDIT.md`, `docs/REPOSITORY_INVENTORY.md`, `docs/DOCUMENT_STORAGE_ARCHITECTURE.md`, `DECISIONS-REQUIRED.md` — full read, cited throughout.
- `git log --all`, `git log --all --diff-filter=A/D --name-only` — Rule-document non-existence confirmation.
- Both uploaded Blueprint files (`432389ea-...md`, `51d726ec-...md`) — confirmed byte-identical, full text extracted into §5.

---

**Stop condition honored**: no code, test, config, or Firebase resource was
modified. No Rule 77 was started. No Blueprint item was implemented. This
document and `docs/SPLENDOR_MASTER_DECISIONS.md` are the only files
created by this mission.
