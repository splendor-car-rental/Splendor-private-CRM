# Splendor Master Rule Set (v1)

Supersedes the unrecoverable 89-Rule roadmap as the active planning
baseline, per explicit user direction. Derived from the 47 requirements
extracted from the Master Blueprint in
`docs/SPLENDOR_MASTER_REQUIREMENTS_MAP.md` §5. The historical rule
fragments recovered in that document's §3 (rules 1, 2, 4-7, 9-12, 34,
43-51, 57, 59, 62, 64, 67, 74, 81, 85, 87) remain valid and in force
unchanged — they are Procurement Phase 1 rules, already implemented and
tested, and are not restated here.

Structure: **Modules** group related rules; each **Rule** is one atomic,
testable requirement (never a whole feature). A module maps 1:1 to a
Blueprint axis item. Rules that were already fully implemented before this
mission carry `STATUS: IMPLEMENTED (pre-existing)`; rules implemented in
this mission carry `STATUS: IMPLEMENTED (this session)`; everything else
states its real current status honestly.

---

## MODULE 01 — Digital Contracts & Signature

### RULE-C01 — Server-exclusive contract generation
**REQUIREMENT**: Every contract document is generated server-side only, from committed booking data, never client-assembled.
**RATIONALE**: Prevents a client from fabricating or altering contract terms before they're recorded.
**DEPENDENCIES**: None.
**ACCEPTANCE CRITERIA**: No route accepts a client-supplied full contract body; the server composes it from validated inputs.
**SECURITY**: Prevents client-side tampering with legal terms.
**FINANCIAL**: Prevents a client from altering the stated value/deposit.
**EXTERNAL DEPENDENCIES**: None.
**VERIFICATION METHOD**: Code review of contract-creation route.
**STATUS**: IMPLEMENTED (pre-existing) — `contractOps.ts`, server-authoritative persistence (Phase 1 of the original remediation).

### RULE-C02 — Unique, non-reusable contract identity
**REQUIREMENT**: Every contract gets a system-issued sequential ID, never reused even if the contract is later cancelled.
**STATUS**: IMPLEMENTED (pre-existing) — `idGenerator.ts` atomic sequencing.
**VERIFICATION METHOD**: Existing test coverage (`tests/durablePersistence.test.ts`).

### RULE-C03 — Signing-session authentication evidence
**REQUIREMENT**: Every signature capture records the signer's timestamp, IP/protocol, and (where the device supports it) geographic coordinates, alongside the signature image.
**RATIONALE**: Blueprint REQ-BP01-3; strengthens legal defensibility of the signature.
**DEPENDENCIES**: A signing-session data model (new).
**ACCEPTANCE CRITERIA**: A `SignatureEvent` record exists per signature with `signedAt`, `ipAddress`, `userAgent`, `geoLat`/`geoLng` (nullable if denied/unavailable — never blocking), and a reference to the signer.
**SECURITY**: Geo/IP capture must degrade gracefully (never block a signature if location permission is denied) and must not be exposed to unauthorized roles.
**FINANCIAL**: None directly.
**EXTERNAL DEPENDENCIES**: None (browser Geolocation API is standard, no vendor).
**VERIFICATION METHOD**: Firestore-emulator test confirming the event is recorded with all present fields.
**STATUS**: MISSING — **correction**: an earlier draft of this rule (written before the implementation pass) marked this "IMPLEMENTED (this session)" on the assumption the full Module 01/02/07 scope would be completed in the same pass; that assumption did not hold, and no `SignatureEvent` model, route, or test was actually built or committed this session (verified: zero matches for `SignatureEvent`/`geoLat`/`geoLng` anywhere in the repository). Corrected here rather than left standing as an unverified claim, per this mission's own "never claim VERIFIED without evidence" rule. Not built.

### RULE-C04 — OTP-gated customer signing
**REQUIREMENT**: A customer signature session cannot complete without a one-time code delivered to the customer's own registered contact (WhatsApp/SMS), entered by the customer themselves.
**RATIONALE**: Blueprint's own stated remedy against an employee signing on the customer's behalf.
**DEPENDENCIES**: WhatsApp integration (already live) as the delivery channel.
**ACCEPTANCE CRITERIA**: A signing session cannot be marked complete server-side without a verified OTP matched to that session.
**SECURITY**: OTP must be short-lived, single-use, rate-limited.
**FINANCIAL**: None directly.
**EXTERNAL DEPENDENCIES**: WhatsApp Cloud API (AVAILABLE).
**VERIFICATION METHOD**: Integration test simulating OTP issue/verify/expiry.
**STATUS**: TECHNICAL_DESIGN_REQUIRED — architecture defined this session (§Implementation), full OTP delivery wiring deferred (see Remaining Work).

### RULE-C05 — Post-signature document freeze
**REQUIREMENT**: Once fully signed, a contract's legally material fields become immutable; any later correction requires a new, separately auditable amendment record, never an in-place edit.
**RATIONALE**: Blueprint REQ-BP01-4.
**ACCEPTANCE CRITERIA**: A signed contract's core fields (value, dates, parties, vehicle) cannot be updated by any route without going through an explicit amendment record.
**SECURITY**: Prevents silent post-signature tampering.
**FINANCIAL**: Prevents value manipulation after signing.
**EXTERNAL DEPENDENCIES**: None.
**VERIFICATION METHOD**: Test asserting a direct field update is rejected once `signedAt` is set.
**STATUS**: PARTIAL — contract lifecycle exists; a dedicated post-signature immutability guard was not found and is not built this session (flagged, not implemented, to avoid touching the core Contract update path without a full regression pass — see Remaining Work).

### RULE-C06 — Offline-capable signature capture
**STATUS**: MISSING, not built this session — requires a client-side offline-sync architecture decision (service worker / local queue) that is a meaningfully sized effort of its own. Documented in Remaining Work.

---

## MODULE 02 — Customer Identity / KYC

### RULE-K01 — Document capture and storage boundary
**REQUIREMENT**: Identity documents (Emirates ID, passport, visa, driving license) are captured and stored through the existing authenticated document-upload/proxy pipeline, never a new one.
**STATUS**: IMPLEMENTED (pre-existing) — `POST /api/upload` + `GET /api/documents/file` (`docs/DOCUMENT_STORAGE_ARCHITECTURE.md`).

### RULE-K02 — OCR extraction architecture boundary
**REQUIREMENT**: A pluggable OCR adapter interface exists so a real OCR/KYC vendor can be wired in later without changing calling code; a mock adapter satisfies the interface for testing.
**DEPENDENCIES**: RULE-K01.
**EXTERNAL DEPENDENCIES**: An OCR/KYC vendor (REQUIRES_API, DECISION-06 in `SPLENDOR_MASTER_DECISIONS.md`).
**VERIFICATION METHOD**: Unit test against the mock adapter.
**STATUS**: MISSING — **correction**: an earlier draft of this rule claimed an adapter boundary + mock adapter were built; no such code exists (verified: no `src/server` file or export matching OCR/KYC-adapter naming, zero matches for an adapter interface anywhere in the repository). See the correction note on RULE-C03 above for why this is being fixed now rather than left standing. Not built.

### RULE-K03 — Configurable eligibility engine: age vs. vehicle class
**REQUIREMENT**: A configurable minimum-age-per-vehicle-class rule (default: 21 standard, 25 for a configurable "restricted" class list) blocks booking confirmation when violated.
**RATIONALE**: Blueprint REQ-BP02-2. Business policy, not verified law — kept configurable via the Business Rules Engine rather than hard-coded, per this mission's explicit legal-caution instruction.
**LEGAL STATUS**: BUSINESS_REQUIREMENT (insurance/risk policy), not asserted as a legal minimum.
**ACCEPTANCE CRITERIA**: Booking confirmation for a restricted-class vehicle is rejected if customer age (from DOB) is below the configured threshold; the threshold and restricted-class list are both editable without a code change.
**SECURITY**: Server-side enforcement only; never trust a client-supplied "eligible" flag.
**FINANCIAL**: Prevents an ineligible rental that could void insurance coverage.
**EXTERNAL DEPENDENCIES**: None.
**VERIFICATION METHOD**: Emulator test with a rule-value change confirming the threshold takes effect immediately (same pattern as this session's CONFIG-002 test).
**STATUS**: MISSING — no age/vehicle-class eligibility rule or check exists anywhere in `server.ts`/`businessRules.ts` (verified: zero matches for age-eligibility/restricted-class logic). Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-K04 — License-origin and validity matching
**REQUIREMENT**: A configurable list of exempt license-issuing countries (accepted without an International Driving Permit) gates booking confirmation for non-UAE-licensed drivers; anyone not on the list requires an IDP reference recorded before confirmation.
**LEGAL STATUS**: LEGAL_VERIFICATION_REQUIRED — the exact current exempt-country list must be confirmed against RTA's published list before being treated as authoritative; shipped as an editable starter list, not a hard-coded legal claim.
**STATUS**: MISSING — no exempt-country list or IDP-matching engine exists (the only `licenseCountry` occurrences in the repo are unrelated pre-existing seed-data string fields, not an eligibility engine). Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-K05 — Document-expiry-vs-rental-period check
**REQUIREMENT**: Booking confirmation is blocked (or truncated to the document's valid window) if a visa or license would expire before the rental ends.
**STATUS**: MISSING — no such check exists anywhere in the booking/reservation/contract creation routes. Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-K06 — Liveness/facial verification
**STATUS**: MISSING — requires a vendor (DECISION-06). Not built.

---

## MODULE 03 — Security / Blocklist

### RULE-B01 — Cross-referenced blocklist keyed by unique identifier pairs
**REQUIREMENT**: A customer blocklist entry is matched by (passport number + issuing country) or Emirates ID number — never by name alone.
**RATIONALE**: Blueprint REQ-BP03-4, explicitly to prevent false-positive blocks from name collisions.
**ACCEPTANCE CRITERIA**: The blocklist lookup function never accepts a name-only query as sufficient to declare a match.
**SECURITY**: Prevents wrongful blocking; prevents a blocked person evading detection via a name variant.
**FINANCIAL**: Protects the fleet from repeat-risk customers.
**EXTERNAL DEPENDENCIES**: None.
**VERIFICATION METHOD**: Emulator test proving a name-only match is rejected and an identifier-pair match succeeds.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-B02 — Tiered blocking: full vs. conditional
**REQUIREMENT**: A block entry has a tier — `full` (booking rejected outright with a generic unavailability message) or `conditional` (booking allowed only with a raised deposit and/or an operations-manager authorization, reason logged).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-B03 — Silent proactive check at entry point
**REQUIREMENT**: The moment a phone number, passport number, or Emirates ID is entered anywhere a new customer/booking is being created, the blocklist is checked automatically, before the user proceeds.
**STATUS**: **IMPLEMENTED (this session)** — server-side check wired into customer creation; the specific "as the user types" real-time UX polish is a frontend enhancement noted for a future pass, not required for the rule's safety property (the block is enforced server-side regardless of UI timing).

### RULE-B04 — Segregation of Duties on unblocking
**REQUIREMENT**: The staff member who did not create a block may request its removal; a different, higher-ranked approver must authorize it, with a mandatory reason, using the same universal Segregation-of-Duties primitive already in the codebase.
**STATUS**: **IMPLEMENTED (this session)** — reuses `procurementApprovals.ts`'s generic Segregation-of-Duties engine (`registerApprovalHandler('BlocklistEntry', 'unblock', ...)`, enforcing `requestedBy !== decider.uid`). Despite its "procurement" module name, that engine is the actual entity-agnostic SoD primitive already reused this session for Debt/CustomerRefund/EmployeeCustody/OffsetRequest approvals; `approvals.ts` is a narrower engine scoped specifically to Business-Rule-value-change Four-Eyes approvals and does not fit a BlocklistEntry action. Surfaced to staff as its own inbox on the Security & Blocklist screen rather than requiring them to find it under Procurement & Suppliers.

### RULE-B05 — Full audit trail on every block/unblock decision
**STATUS**: **IMPLEMENTED (this session)** — every block, unblock request, and unblock decision calls `recordAudit`.

---

## MODULE 04 — Salik / Parking

### RULE-S01 — Toll-transaction-to-contract association
**STATUS**: IMPLEMENTED (pre-existing) — `tollFileParsers.ts`, `tollImportGuard.ts`, `lib/tollCalculations.ts`.

### RULE-S02 — Pre-signature crossings classified as internal fleet cost
**REQUIREMENT**: A toll crossing timestamped before the contract's actual signed handover time is classified as an internal operational cost, never billed to the customer.
**STATUS**: PARTIAL — the toll-import mechanism associates crossings to contracts by vehicle/date; this session did not confirm whether the specific pre-signature-timestamp exclusion is already implemented in the existing parser (not traced this pass — flagged for a fast, cheap follow-up, not re-built blind).

### RULE-S03 — Live/real-time gate-crossing feed
**STATUS**: EXTERNAL_DEPENDENCY / BLOCKED — DECISION-04. Current mechanism remains file-import; no live Salik API exists to integrate against.

---

## MODULE 05 — Traffic Fines

### RULE-F01 — Fine record data model + contract association
**REQUIREMENT**: A fine record (fine number, timestamp, violation type, amount, points, hold status) links to the contract/customer who held the vehicle at the violation's timestamp.
**STATUS**: MISSING — **correction**: an earlier draft of this rule (and RULE-F02/F03 below) was marked "IMPLEMENTED (this session)" on the assumption this module would be completed in the same pass as RULE-A01/R03/R04/B01-B05/P01/M01-M03; it was not. No fine-record type, route, or manual-entry workflow exists anywhere in the repository (verified: zero matches for a `TrafficFine`-shaped type or `/api/fines` route). Corrected here rather than left standing as an unverified claim. Not built.

### RULE-F02 — Customer notification on new fine
**STATUS**: MISSING — depends on RULE-F01, which does not exist. Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-F03 — Fine settlement against deposit/outstanding balance
**STATUS**: MISSING — depends on RULE-F01, which does not exist. Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-F04 — Live RTA/Police fine ingestion + black-point transfer
**STATUS**: EXTERNAL_DEPENDENCY / BLOCKED — DECISION-08. No official channel confirmed. Not built, not faked.

### RULE-F05 — Radar-photo-vs-GPS cross-match evidence
**STATUS**: BLOCKED — depends on RULE-G01 (GPS/telematics, itself hardware-blocked, DECISION-07) and RULE-F04. Not built.

---

## MODULE 06 — Deposit / Financial Settlement

### RULE-D01 — Deposit lifecycle state machine
**STATUS**: IMPLEMENTED (pre-existing) — `DepositStatus` enum, `depositReleaseDays` field (`src/types/index.ts:546-556`).

### RULE-D02 — Deduction requires an approved, evidenced charge
**STATUS**: IMPLEMENTED (pre-existing) — `src/types/index.ts:595`, "prevents the same charge from being deducted twice."

### RULE-D03 — Bank authorization hold (not an immediate charge)
**STATUS**: EXTERNAL_DEPENDENCY / BLOCKED — DECISION-02/09. No payment-gateway/banking API exists. **Not fabricated.**

### RULE-D04 — Automatic day-21 settlement computation
**REQUIREMENT**: At `depositReleaseDays` after return, the server computes `deposit − (fines + damages + tolls + other charges)` and marks the deposit `refunded`/`partially_refunded`/`applied` accordingly, idempotently and concurrency-safely.
**RATIONALE**: Blueprint REQ-BP06-2/3. The *computation and status transition* can be built safely without a live bank API (which only the actual money-movement half, RULE-D03, needs) — this is the honest, buildable half.
**ACCEPTANCE CRITERIA**: Running the settlement job twice for the same deposit produces one effect, not two (idempotency-key protected); concurrent settlement + a new charge posting mid-computation cannot produce an inconsistent balance (transaction-scoped).
**FINANCIAL**: High — this is a real money-affecting computation.
**EXTERNAL DEPENDENCIES**: None for the computation; RULE-D03 for the actual fund release.
**VERIFICATION METHOD**: Concurrency test (two settlement triggers racing) + idempotency test, against the real Firestore emulator.
**STATUS**: TECHNICAL_DESIGN_REQUIRED — depends on resolving DECISION-02 first (if deposits aren't actually held as authorizations today, an "auto-release" computation could be actively wrong). **Not built this session**, to avoid building automation on top of an unconfirmed financial reality — this is the one P0-priority item deliberately deferred pending a business answer, per this mission's own boundary rule ("do not silently decide a material financial policy").

### RULE-D05 — Outstanding-balance follow-up on shortfall
**STATUS**: Same dependency as RULE-D04 — not built this session.

---

## MODULE 07 — Geofencing / Driving Monitoring

### RULE-G01 — GPS/telematics data source
**STATUS**: BLOCKED — hardware/vendor decision, DECISION-07. Not built.

### RULE-G02 — Zone/geofence definition architecture
**REQUIREMENT**: A data model for named permitted/restricted zones exists, independent of whether a live GPS feed is wired in, so zone rules can be authored and tested against a mock location feed now.
**STATUS**: MISSING — **correction**: an earlier draft of this rule (and RULE-G03/G04/G05 below) was marked "IMPLEMENTED (this session)" on the same mistaken assumption noted on RULE-F01 above. No geofence/zone data model, mock location-feed adapter, or any geofencing-related code exists anywhere in the repository (verified: zero matches for geofence/telematics/GPS-location/speed-alert terms). Corrected here rather than left standing as an unverified claim. Not built.

### RULE-G03 — Two-tier alert protocol
**STATUS**: MISSING — depends on RULE-G01/G02, neither of which exists. Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-G04 — Last-known-location retention on signal loss
**STATUS**: MISSING — depends on RULE-G01/G02, neither of which exists. Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

### RULE-G05 — VIP location-data access restriction
**STATUS**: MISSING — depends on RULE-G01/G02, neither of which exists. Corrected from an earlier draft's false "IMPLEMENTED" claim; not built.

---

## MODULE 08 — Digital Inspection

### RULE-I01 — Mandatory photo count per inspection
**REQUIREMENT**: A handover/return inspection cannot be marked complete with fewer than a configurable minimum number of photos (default 8).
**STATUS**: PARTIAL — `HandoverInspection`/`ReturnInspection` already carry a `damages: VehicleDamageMarker[]` array with optional per-marker photos, but no minimum-photo-count gate was found and none was added this session (would require touching the existing, working handover/return UI flow — deferred to avoid a rushed change to a live customer-facing workflow without a full UI regression pass; see Remaining Work).

### RULE-I02 — Handover-vs-return damage comparison
**STATUS**: UNKNOWN (§28 of the requirements map) — not traced or built this session.

### RULE-I03 — Image-quality rejection (blur/darkness)
**STATUS**: MISSING — requires either a client-side heuristic or a vendor; not built.

### RULE-I04 — Evidence integrity (tamper-evident photo record)
**STATUS**: MISSING — not built; would naturally extend RULE-A01 (hash-chaining) once that pattern exists.

---

## MODULE 09 — Maintenance

### RULE-M01 — Mileage-based maintenance interval, configurable
**REQUIREMENT**: A per-fleet maintenance interval (oil/filter km interval) and an alert lead distance are stored and editable via the Business Rules Engine (`maintenanceOilFilterIntervalKm` default 7,000 km, `maintenanceAlertLeadKm` default 500 km), not hard-coded.
**ACCEPTANCE CRITERIA**: `src/server/maintenance.ts`'s `computeMaintenanceScheduleUpdate()` reads both via `getRuleValue`.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-M02 — Mileage-driven maintenanceStatus recompute (optimal / due_soon)
**REQUIREMENT**: A vehicle's `maintenanceStatus` auto-recomputes to `due_soon` once its mileage enters the alert lead window before the next-due threshold -- purely from the mileage updates that already happen at contract return, no separate polling job.
**DEPENDENCIES**: RULE-M01; wired into `POST /api/contracts/:id/return` (the only place vehicle mileage genuinely changes).
**ACCEPTANCE CRITERIA**: Never overwrites `in_service` -- that state is a human signal (RULE-M03), not mileage-driven.
**CORRECTION (post-implementation)**: an earlier draft of this rule described an automatic hard `status:'maintenance'` booking-block triggered purely by crossing the threshold. What is actually built is narrower and deliberately so: crossing the threshold only flips the informational `maintenanceStatus` to `due_soon` (visible on the vehicle's Schedule tab); the vehicle stays bookable until a human explicitly calls Start Maintenance (RULE-M03) -- auto-blocking a vehicle's revenue the instant an odometer reading crosses a configurable number, with no human in the loop, was judged too aggressive a default for a live rental fleet without an explicit product decision, so this session chose the safer, reversible behavior (alert, not auto-block) and is documenting the gap rather than silently shipping the more aggressive one.
**STATUS**: **IMPLEMENTED (this session)** -- as the alert-only design described above, not the auto-block design an earlier draft of this rule assumed.

### RULE-M03 — Workshop start/completion workflow (human-initiated)
**REQUIREMENT**: A ceo/admin/fleet user can explicitly take a vehicle into maintenance (`POST /api/fleet/:id/start-maintenance`) -- which sets `maintenanceStatus:'in_service'` and `status:'maintenance'`, the latter already honored by `availability.ts`'s existing hard booking-block check -- and later log the completed service (`POST /api/fleet/:id/log-maintenance`), which rolls the next-due mileage forward from the service odometer reading and returns the vehicle to `available`.
**DEPENDENCIES**: RULE-M01/M02; the existing `'maintenance'` status check in `src/server/availability.ts`; the generic Firestore-transaction pattern (`runDurableTransaction`) for a safe read-then-write on the vehicle doc.
**ACCEPTANCE CRITERIA**: Refuses to start maintenance on a vehicle that is `rented`/`reserved`; refuses a service-completion mileage lower than the last recorded service mileage; appends a `VehicleTimelineEvent` (`MAINTENANCE_STARTED`/`MAINTENANCE_LOGGED`) and an audit-log entry for each transition.
**SECURITY**: Both routes are `requireRole('ceo','admin','fleet')`.
**FINANCIAL**: None directly -- this is an operational-availability workflow, not a financial mutation.
**VERIFICATION METHOD**: `tests/maintenance.test.ts` (real Firestore emulator, 9 tests: the pure mileage-recompute function's 4 cases, plus 5 transactional start/log-completion cases) plus a real-Chromium/Playwright pass (`scripts/qaMaintenanceVerify.mjs`) confirming the full UI round-trip: a new vehicle starts Optimal, Start Maintenance flips it to "In Service Now" and the vehicle's overall status badge to MAINTENANCE, and Log Completed Service returns it to Optimal.
**NOTE**: no WhatsApp alert dispatch was built for `due_soon` this session (an earlier draft of the old RULE-M03 claimed this) -- the `due_soon` status is currently visible only on the vehicle's own Schedule tab; a proactive notification is a reasonable, cheap follow-up (the existing WhatsApp notification engine already used for RULE-F02/other alerts) but was not built to keep this session's scope to what was actually verified.

### RULE-M04 — Projected-mileage conflict warning for long bookings
**STATUS**: TECHNICAL_DESIGN_REQUIRED — not built this session (needs a booking-duration-aware mileage projection, a reasonable but non-trivial addition to the booking flow; deferred, not fabricated).

### RULE-M05 — Auto-substitution suggestion on emergency vehicle-down
**STATUS**: MISSING — not built this session.

---

## MODULE 10 — Reservation Engine

### RULE-R01 — Atomic double-booking prevention
**STATUS**: IMPLEMENTED (pre-existing) — `src/server/availability.ts`, `reserveVehicleSlot()`.

### RULE-R02 — Idempotent booking retries
**STATUS**: IMPLEMENTED (pre-existing) — same function, `runIdempotent` integration.

### RULE-R03 — Mandatory post-booking operational buffer
**REQUIREMENT**: A configurable buffer (default 3 hours) after a booking's end is treated as unavailable before the next booking may start, for handover/inspection/detailing/repositioning.
**RATIONALE**: Blueprint REQ-BP10-2. Confirmed missing in the pre-existing implementation (§6 of the requirements map — zero buffer padding found).
**ACCEPTANCE CRITERIA**: Two bookings for the same vehicle with less than the configured buffer between them are rejected as conflicting, even though their date ranges don't literally overlap.
**FINANCIAL**: Prevents an operationally impossible back-to-back handover that could cause a real customer-facing failure to deliver.
**EXTERNAL DEPENDENCIES**: None.
**VERIFICATION METHOD**: Emulator test with two back-to-back bookings inside the buffer window, asserting rejection; a booking respecting the buffer succeeds.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-R04 — Temporary soft hold with expiration
**REQUIREMENT**: A configurable short-lived hold (default 10 minutes) can be placed on a vehicle/window during an in-progress checkout, automatically releasing if not confirmed within the window, without requiring a manual cleanup step.
**STATUS**: **IMPLEMENTED (this session)** — server-side mechanism; the specific public-website checkout flow that would call it is out of this repository's confirmed scope (DECISION-05), so this is the CRM-side primitive, ready for a website integration once DECISION-05 is answered.

### RULE-R05 — Late-return escalation
**STATUS**: TECHNICAL_DESIGN_REQUIRED — not built this session (the 2-hour-before reminder + red-alert substitution is a real, valuable, but distinct piece of work from the buffer/hold primitives; deferred, not fabricated).

---

## MODULE 11 — Dynamic Pricing

### RULE-P01 — Discount ceiling with escalated approval
**REQUIREMENT**: A regular staff member cannot apply a discount above a configurable ceiling (default 5%, `staffDiscountCeilingPercent` in the Business Rules Engine) without a separate, SoD-compliant sales-manager approval.
**RATIONALE**: Blueprint item 11 (REQ-BP11-5): "الموظف العادي لا يملك صلاحية الخصم بأكثر من 5%" ("a regular employee has no authority to discount more than 5%").
**DEPENDENCIES**: Business Rules Engine (`staffDiscountCeilingPercent`); the generic Segregation-of-Duties engine (`procurementApprovals.ts`).
**ACCEPTANCE CRITERIA**: `POST /api/quotations` computes the requested discount's percentage of the pre-discount subtotal. ceo/admin (the sales-manager rank itself) apply any discount immediately, no ceiling check. Any other role requesting above the ceiling has the quotation created immediately at the CAPPED (ceiling) discount -- the customer-facing total is never inflated waiting on a decision -- while the full requested discount is held as a pending `Quotation`/`discount_override` request in the same generic approvals inbox already used for Debt/CustomerRefund/EmployeeCustody/BlocklistEntry. Only ceo/admin can decide it (`requireRole('ceo','admin')` on `/api/procurement/approvals/:id/decide`), and the SoD engine itself still blocks the requester from deciding their own request. On approval, a transactional handler re-derives discountAmount/discountPercentage/vatAmount/grandTotal from the quotation's own stored baseTotal/extraServicesTotal (never trusting a client-supplied recomputation) and clears the pending flag.
**SECURITY**: The ceiling check reads the requester's role from their verified Firestore profile (`getRequesterActor`), never from client-supplied data; a caller whose role can't be resolved is treated as non-manager (the safer default) rather than skipped.
**FINANCIAL**: Never applies more than the requester is authorized for without a separate approval; the capped-then-escalated design means no financial exposure sits "pending" at the wrong (too generous) total in the meantime.
**VERIFICATION METHOD**: `tests/coreWorkflows.test.ts` (mocked-Firestore, 4 tests: at-ceiling immediate application, above-ceiling capping + pending request, self-approval blocked, ceo/admin bypass) plus a real-Chromium/Playwright pass against the real Firestore/Auth emulators (`scripts/qaDiscountVerify.mjs`) confirming the pending-approval notice, the generic Procurement & Suppliers > Approvals inbox surfacing the request, and a different user (CEO) approving it end-to-end with the quotation's totals updating live.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-P02 — Event/seasonal pricing calendar
**STATUS**: MISSING — not built this session; a genuinely large, standalone engine (calendar authoring UI, per-vehicle-class rule application, minimum-duration floors) better suited to its own dedicated future session than a rushed addition here.

### RULE-P03 — Quote-lock with reference number and validity window
**STATUS**: MISSING — same reasoning as RULE-P02; deferred as a coherent unit rather than half-built.

---

## MODULE 12 — Governance

### RULE-A01 — Audit-trail hash-chaining
**REQUIREMENT**: Each audit-log entry stores a cryptographic hash covering its own content plus the previous entry's hash (per logical chain), so deleting or altering any entry breaks the chain in a way an integrity check detects automatically.
**RATIONALE**: Closes CONFLICT-03 — the Blueprint's own stated compliance defense was not technically true before this session.
**ACCEPTANCE CRITERIA**: A verification function walks the chain and returns tamper-detected=true if any entry's hash doesn't match, or a link is missing.
**SECURITY**: Directly strengthens the audit trail's tamper-evidence.
**FINANCIAL**: Protects financial-audit integrity specifically.
**EXTERNAL DEPENDENCIES**: None (Node's built-in `crypto`).
**VERIFICATION METHOD**: Test that (a) a normal chain verifies clean, (b) directly mutating one entry's stored data in Firestore is detected by the verifier.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-A02 — Segregation of Duties (general)
**STATUS**: IMPLEMENTED (pre-existing) — `approvals.ts`/`procurementApprovals.ts`.

### RULE-A03 — Immutable, non-deletable audit storage
**STATUS**: IMPLEMENTED (pre-existing) — `firestore.rules:96-99`, no delete route exists.

### RULE-A04 — Encrypted cold-archival with fingerprint preserved
**STATUS**: MISSING — `docs/DATA_RETENTION.md` covers retention generally; audit-specific cryptographic archival was not built this session.

---

## Summary Table

**Correction note (post-implementation audit).** An earlier draft of this
table, written before the implementation pass began, counted 24 rules as
"this session" across Modules 01/02/03/05/07/09/10/11/12 on the assumption
that the full scope drafted for all of those modules would be completed in
one pass. It was not: only Modules 03 (Blocklist), 09 (Maintenance), 10
(RULE-R03/R04), 11 (RULE-P01), and 12 (RULE-A01) were actually built,
tested against the real Firestore/Auth emulators, and committed. The
Module 01 (Contracts/Signature), 02 (KYC), 05 (Fines), and 07 (Geofencing)
rows below were corrected from false "IMPLEMENTED (this session)" claims
back to their true state (largely MISSING) after this audit found zero
corresponding code, tests, or commits for any of them — see the
correction notes on RULE-C03, K02-K05, F01-F03, and G02-G05 above. This
table reflects the corrected, verified counts.

| Module | Rules | Implemented (pre-existing) | Implemented (this session) | Deferred/Blocked (documented, not built) |
|---|---|---|---|---|
| 01 Contracts | 6 | 2 | 0 | 4 |
| 02 KYC | 6 | 1 | 0 | 5 |
| 03 Blocklist | 5 | 0 | 5 | 0 |
| 04 Salik | 3 | 1 | 0 | 2 |
| 05 Fines | 5 | 0 | 0 | 5 |
| 06 Deposit | 5 | 2 | 0 | 3 |
| 07 Geofencing | 5 | 0 | 0 | 5 |
| 08 Inspection | 4 | 0 | 0 | 4 |
| 09 Maintenance | 5 | 0 | 3 | 2 |
| 10 Reservation | 5 | 2 | 2 | 1 |
| 11 Pricing | 3 | 0 | 1 | 2 |
| 12 Governance | 4 | 2 | 1 | 1 |
| **Total** | **56** | **10** | **12** | **34** |

12 rules were genuinely implemented, tested, and committed across this
session (RULE-A01, R03, R04, B01-B05, P01, M01-M03), on top of 10
already-real pre-existing ones — 22 of 56 (39%) now have genuine,
evidenced implementation. The 34 deferred/not-built rules are each
explicitly reasoned above, not silently dropped: external/hardware
dependency, a material financial-policy question awaiting the user
(RULE-D04/D05), or a deliberate choice not to half-build a large, coherent
feature in a rushed pass (RULE-P02/P03, RULE-R05) — plus the Module
01/02/05/07 rows corrected by this audit, which remain genuinely
unbuilt and are catalogued as real, sizeable future work rather than
fabricated.
