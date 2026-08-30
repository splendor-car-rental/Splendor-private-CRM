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

**Rebuilt as a standalone workflow this phase** (`src/server/vehicleInspections.ts`,
`src/components/views/VehicleInspectionsView.tsx`), deliberately additive
alongside -- not replacing -- the older embedded `Contract.handover`/
`returnDetails` checklist (`RULE-C0x` above; still used by ContractsOpsView's
own Handover/Return buttons). Covers `pre_delivery` / `handover` /
`in_rental` / `return` / `post_return`, all through one workspace.

### RULE-I01 — Mandatory photo count per inspection
**REQUIREMENT**: An inspection cannot be marked complete until every photo category required for its type has at least one photo.
**RATIONALE**: Blueprint's mandatory-photo-evidence requirement, generalized to per-type configurable categories (front/rear/left/right/interior/dashboard-odometer/fuel-gauge/damage/other) rather than a single fixed "8 photos" count, since a spot-check and a full handover don't need the same evidence.
**DEPENDENCIES**: `src/config/inspectionPhotoCategories.ts` (`REQUIRED_PHOTO_CATEGORIES_BY_TYPE`), snapshotted onto each inspection at creation.
**ACCEPTANCE CRITERIA**: `completeInspection()` rejects with the specific missing categories named; a photo's category, uploader, timestamp, and per-category sequence number are all recorded server-side, never trusted from the client beyond the category itself.
**SECURITY**: Every photo's `uploadedBy`/`uploadedByName` comes from the server-verified caller (`getRequesterActor`), never the request body.
**STORAGE VERIFICATION**: **BLOCKED / UNVERIFIED** -- the actual photo-bytes upload (`POST /api/upload`, folder `vehicle-inspections/`) could not be exercised end-to-end in this sandbox: no Storage emulator is wired here (only Auth+Firestore), and real Firebase Storage is network-restricted, confirmed via a real browser session hitting the real route and failing with "Bucket name not specified" (the emulator-mode admin init has no `storageBucket` configured) -- the same class of blocker as the pre-existing, separately documented Storage-verification gap (`docs/QA_TEST_ENVIRONMENT.md`). Not bypassed, not faked. Everything downstream of a successful upload (photo metadata registration, the completion gate counting categories, immutability after completion) IS verified, by calling `POST /api/inspections/:id/photos` directly with the exact payload shape a real upload would produce.
**STATUS**: **IMPLEMENTED (this session)** -- photo-requirement logic and metadata pipeline fully built and verified; the Storage byte-transfer half is architecturally correct but unverified in this environment (see above).

### RULE-I02 — Handover-vs-return damage comparison
**REQUIREMENT**: A later inspection (typically `return`) can reference an earlier one (`handover`) so their photo sets and damage lists can be compared.
**RATIONALE**: Blueprint's damage-comparison requirement. Deliberately a **manual, human-reviewed comparison**, not automated image-diffing -- this mission's own instruction is explicit that a fake AI-detection step must never replace a human decision here.
**ACCEPTANCE CRITERIA**: `VehicleInspection.compareAgainstInspectionId` links the two records; the UI renders both side by side (damage counts, photo categories) for a human to visually compare and then classify each damage marker as `pre_existing`/`new`/`uncertain` themselves.
**STATUS**: **IMPLEMENTED (this session)** -- as a manual side-by-side view, not automated detection, per this mission's explicit "no fake AI" instruction.

### RULE-I03 — Image-quality rejection (blur/darkness)
**STATUS**: MISSING -- requires either a client-side heuristic or a vendor; not built this session (this mission's scope control explicitly excludes inventing detection capability that doesn't exist).

### RULE-I04 — Evidence integrity (tamper-evident photo record)
**STATUS**: MISSING -- no cryptographic hash is computed over photo bytes or attached to the photo metadata record. Not claimed. A completed inspection's photo/damage arrays ARE protected from further mutation (RULE-I07 below), which is a real but different guarantee (no further edits, not "this photo file itself is provably unaltered since capture").

### RULE-I05 — Damage liability review, never an automatic charge
**REQUIREMENT**: Recording `new` or `uncertain` damage opens a `pending_review` liability flag; only an explicit reviewer decision (`customer_liable`/`not_customer_liable`, with a mandatory note) resolves it, and completion is blocked while any review is still pending. Recording damage NEVER creates a financial charge by itself.
**RATIONALE**: This mission's explicit financial-safety requirement -- "MUST NOT automatically deduct money from a customer merely because damage is recorded."
**ACCEPTANCE CRITERIA**: `InspectionDamageMarker.liabilityStatus` starts at `not_applicable` for `pre_existing` damage (no review needed) and `pending_review` for `new`/`uncertain`; reviewing pre-existing damage is rejected. Any actual customer charge for confirmed-liable damage still requires a separate, manual step through the existing, unmodified Debt/Charge module -- this feature never calls it automatically.
**FINANCIAL**: This is the core financial-safety guarantee of the whole module.
**SECURITY**: The review decision's actor is server-verified; a `reviewNotes` note is mandatory.
**VERIFICATION METHOD**: `tests/vehicleInspections.test.ts` (real emulator) + `tests/coreWorkflows.test.ts` (mocked HTTP, role authorization) + a real-browser pass confirming the "pending review" badge, the blocked Complete button, and no charge object ever appearing on the damage record.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-I06 — Customer acknowledgement gate
**REQUIREMENT**: `handover` and `return` inspections cannot complete without a recorded customer acknowledgement; `pre_delivery`/`in_rental`/`post_return` (no customer present) don't require one.
**RATIONALE**: Blueprint's customer-acknowledgement requirement. Deliberately NOT a new digital-signature/OTP system (out of this mission's explicit scope control) -- recorded as a staff-witnessed confirmation (`acknowledgedByName`, `witnessedBy`/`witnessedByName`, timestamp), the same trust model the app's pre-existing `customerSignatureUrl` plain-URL fields already implied without ever building real signature capture.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-I07 — Post-completion immutability
**REQUIREMENT**: Once an inspection is `completed`, no further mutation (photo, damage, detail edit, acknowledgement) succeeds for anyone, including ceo/admin.
**RATIONALE**: This mission's explicit "do not allow ... silently alter completed inspection evidence" requirement.
**ACCEPTANCE CRITERIA**: Every mutating function in `vehicleInspections.ts` calls a shared `requireDraft()` guard first.
**STATUS**: **IMPLEMENTED (this session)** -- verified by both the real-emulator and mocked-HTTP test suites attempting every mutation type against a completed record.

### RULE-I08 — Idempotent creation and completion
**REQUIREMENT**: Starting or completing an inspection is safe against double-submission, browser refresh, and network retry.
**ACCEPTANCE CRITERIA**: Both `startInspection()` and `completeInspection()` use the existing `runIdempotentCreate` primitive (Idempotency-Key header); a real concurrent double-submission race produces exactly one record.
**STATUS**: **IMPLEMENTED (this session)**.

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

## MODULE 13 — WhatsApp Conversational Commerce

Before this session: a real, signature-verified inbound webhook
(`POST /api/whatsapp/webhook`) durably logged every message/status event
(`whatsapp_inbound_events`), and a real plain-text outbound sender
(`src/server/whatsapp.ts`) was wired into ~15 business-event notifications
and an admin Notification/WhatsApp Control Center. Neither side did
anything WITH an inbound message beyond storing it — the webhook's own
code comment called turning it into a real conversation "a separate,
larger feature to build once this durable log is in place." This module
is that feature: a persisted conversation state machine
(`src/server/whatsappConversation.ts`, collection `whatsapp_conversations`
+ a `messages` subcollection per phone), deliberately additive alongside
the existing raw event log and outbound notification system, not a
replacement for either. WhatsApp remains a communication layer only: the
one CRM-mutating action this module can trigger (creating a reservation)
goes through the SAME `reserveVehicleSlot()` transaction every other
booking path already uses, via a new `SplendorConnectEngine.
handleWhatsAppReservation()` sibling of the existing website gateway
method — a second front door into the one reservation engine, never a
second engine.

### RULE-W01 — Webhook trust boundary + per-message processing idempotency
**REQUIREMENT**: Every inbound delivery must be signature-verified before anything happens; a genuine Meta retry of the same message id must never re-run conversation processing (which could otherwise double-create a reservation or double-send a reply).
**RATIONALE**: The signature check (`X-Hub-Signature-256` HMAC) already existed and is unchanged. This session added a `processedAt` flag on the SAME raw event document, checked before invoking the conversation engine and set only after it completes successfully — separate from "is the raw event stored," so a crash mid-processing is safely retried by Meta's own webhook retry instead of being silently dropped because the raw record already existed.
**ACCEPTANCE CRITERIA**: A duplicated message id is a true no-op for conversation processing (verified both against the real Firestore emulator's underlying idempotency-key mechanism used by the reservation step, and at the webhook layer by asserting no second message is logged in `whatsapp_conversations/{phone}/messages` on a redelivery).
**SECURITY**: Added a generous per-IP rate limiter (300/min) directly on the webhook route, ahead of signature verification, as defense-in-depth against CPU exhaustion from a flood of unsigned/mis-signed requests -- the real trust boundary remains the signature check, this only bounds wasted work under abuse.
**VERIFICATION METHOD**: `tests/whatsappWebhook.test.ts` (real signature verification, `processedAt` gating, real duplicate-delivery no-op — mocked Firestore admin); `scripts/qaWhatsAppVerify.mjs` (a real HMAC-signed POST, exactly Meta's own trust mechanism, replayed with the same message id against the real running server).
**STATUS**: **IMPLEMENTED (this session)** — enhancing the pre-existing signature-verification base.

### RULE-W02 — Persisted conversation state machine
**REQUIREMENT**: Each customer phone number has one real, durable conversation record moving through a defined set of states (NEW → BROWSING → VEHICLE_SELECTED → DATES_PENDING → LOCATION_PENDING → RESERVATION_CONFIRM → RESERVATION_CREATED, with HUMAN_ASSISTANCE and CLOSED reachable at any point), never inferred ad hoc from message history.
**RATIONALE**: The Blueprint's conversation-state-machine requirement, trimmed to the states this session's conversational-commerce scope actually needs (browsing → booking → post-booking follow-up) rather than inventing states for stages this pass didn't build (contract/signature/handover/return/settlement remain served by the pre-existing outbound notification events, unchanged).
**ACCEPTANCE CRITERIA**: An unrecognized input re-prompts instead of crashing or silently advancing; "menu"/"restart" resets to BROWSING from any state; a CLOSED conversation reopens to BROWSING on the next inbound message instead of a dead end; a customer can always reach a human (see RULE-W06) regardless of current state.
**VERIFICATION METHOD**: `tests/whatsappConversation.test.ts` (real Firestore emulator) — 17 tests covering every transition, an unparsable-date rejection, and the universal escape hatches.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-W03 — Customer matching, never guessed
**REQUIREMENT**: An inbound phone number is matched to an existing `Customer` by exact phone match; zero matches is a genuinely new contact (a `Customer` record is created only once a booking is actually confirmed, mirroring how the pre-existing website booking gateway already works); more than one match (phone uniqueness is not otherwise enforced in this CRM) is flagged `ambiguous_review`, never silently resolved to either candidate.
**RATIONALE**: This mission's explicit "never guess identity" requirement.
**SECURITY/PII**: Phone numbers and match state are only ever exposed through the authenticated Unified Inbox (RULE-W06), the same access model as every other Customer field.
**VERIFICATION METHOD**: `tests/whatsappConversation.test.ts`'s `matchCustomerByPhone` suite (unmatched / matched / ambiguous_review).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-W04 — Reservation creation reuses the one real reservation engine
**REQUIREMENT**: A WhatsApp-confirmed booking creates a real `Reservation` through the exact same conflict-checking, buffer-hour-aware, cross-instance-safe `reserveVehicleSlot()` transaction every other booking path (staff CRM, public website) already uses — never a parallel booking mechanism, never a direct write that bypasses availability checking.
**RATIONALE**: This mission's explicit "WhatsApp is an interface, not a second reservation engine" mandate.
**ACCEPTANCE CRITERIA**: `SplendorConnectEngine.handleWhatsAppReservation()` mirrors `handlePublicReservation()`'s structure (phone-based customer dedup instead of email, since a WhatsApp customer has no email to key on) but calls the identical `reserveVehicleSlot()`; a vehicle that becomes unavailable between browsing and confirming surfaces `AvailabilityConflictError` as a friendly re-prompt, never a crash; the created `Reservation.status` is always `'pending'` (concierge review), never auto-confirmed.
**FINANCIAL**: The reservation carries a server-computed price (the exact same days/dailyRate/totalAmount/deposit formula the customer was shown in the confirmation summary — one shared `computeReservationPreview()` function, so the two can never drift) — WhatsApp never invents or lets the customer set a price.
**SECURITY**: Idempotency key derived from (phone, vehicleId, pickup, return) — a genuine double-tap of "Confirm" (two distinct messages) creates exactly one reservation.
**KNOWN, PRE-EXISTING, DOCUMENTED GAP**: `handleWhatsAppReservation()`'s customer-dedup-by-phone check (find-or-create) is not itself wrapped in the reservation's own transaction — this is the SAME pattern already present in the pre-existing `handlePublicReservation()`, not a new class of bug introduced here. In the narrow window of two truly simultaneous confirms for a brand-new phone number, two `Customer` records could both be created before either commits, even though the reservation itself is still created exactly once (protected by its own idempotency key). Discovered, not fixed — an app-wide customer-dedup hardening pass is outside this WhatsApp-focused mission's scope per its own instructions.
**VERIFICATION METHOD**: `tests/whatsappConversation.test.ts` (real emulator: happy path, financial-safety assertion, real concurrent double-tap creating exactly one reservation) + `scripts/qaWhatsAppVerify.mjs` (real browser + real server: confirms the created reservation is independently visible via `GET /api/reservations`, not a shadow record).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-W05 — Interactive messaging within Meta's real limits
**REQUIREMENT**: Vehicle category/catalog browsing uses Meta's `interactive.list` message type; the reservation confirm/cancel step uses Meta's `interactive.button` type; a pre-approved Message Template sender is available for any future outside-the-24-hour-session use. Every payload respects Meta's own documented hard limits (max 3 buttons, max 10 list rows total, title/description length caps) — validated before the call, refused locally with a clear error rather than sent to Meta and rejected.
**RATIONALE**: The mission's explicit "use what Meta genuinely supports, document real limits, never claim unverified features."
**VERIFICATION METHOD**: `tests/whatsappSend.test.ts` — MOCK VERIFIED: `global.fetch` is mocked and every payload's exact JSON shape is asserted against Meta's documented Cloud API schema for that message type, plus the limit-violation refusals. **LIVE META VERIFICATION: BLOCKED / UNVERIFIED** — no real WhatsApp Business Account or credentials (`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`) are configured in this environment (confirmed: `.env` only ever had placeholder values — see the final report's External Dependencies section), so no payload has actually been accepted by Meta's real Graph API. The payload shapes match Meta's public documentation, but that is not the same as a confirmed live send.
**STATUS**: **IMPLEMENTED (this session)** — payload construction MOCK VERIFIED; live delivery UNVERIFIED/BLOCKED (credentials).

### RULE-W06 — Human Concierge handoff + Unified Inbox
**REQUIREMENT**: A customer can always reach a human ("agent"/"موظف"/a Human Help action, honored from any state), which turns the bot off (`botActive:false`) for that conversation and notifies staff; a staff member can also proactively take over a still-bot-active conversation; staff see one Unified Inbox (list + thread + customer/reservation context + assign/priority/tags + manual reply + Return-to-Automation) inside the existing CRM, never a separate chat application.
**RATIONALE**: The mission's explicit Human Concierge + "no separate chat app" requirements.
**ACCEPTANCE CRITERIA**: While `botActive:false`, a further inbound message is logged into the thread but produces NO automated reply (verified: message count check before/after); "Return to Bot" resets to BROWSING (the simplest safe re-entry point, since the customer's earlier draft may be stale) and staff can reply manually only while the bot is inactive (attempting a manual reply while the bot is still active is refused with a 409, not silently allowed to race the bot).
**SECURITY**: All five new `/api/whatsapp/conversations*` routes require an authenticated session with `ceo`/`admin`/`operations`/`sales` role (matching who can already reach reservations/customers) — never reachable by a customer or by Meta.
**AUDIT**: Escalation-to-human, staff takeover/return, assignment/priority changes, and manual replies each call the existing `recordAudit()` (hash-chained ledger) — no second audit mechanism.
**VERIFICATION METHOD**: `tests/whatsappConversation.test.ts` (silence-while-human-owns-it, takeover/return state transitions) + `tests/coreWorkflows.test.ts` (route-level RBAC for all 5 routes, mocked HTTP) + `scripts/qaWhatsAppVerify.mjs` (real browser: Inbox list shows Needs Human/priority/state badges, thread renders the real bilingual message history, staff-initiated Take Over enables a reply box, a manual reply appears in the thread, Return to Bot hands it back).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-W07 — Financial safety: WhatsApp never mutates money
**REQUIREMENT**: No code path in this module can create a charge, alter a balance, or auto-confirm a booking. A WhatsApp-originated reservation is always `status:'pending'` / `depositStatus:'pending'` — a request for concierge review, structurally identical to a pending website reservation.
**RATIONALE**: This mission's explicit, repeated financial-safety mandate.
**ACCEPTANCE CRITERIA**: `tests/whatsappConversation.test.ts` asserts the created reservation's `status`/`depositStatus` are both `'pending'` after a full successful booking flow — never `'confirmed'`/`'collected'`.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-W08 — Post-booking follow-up requests (extension/return/questions)
**REQUIREMENT**: Once a reservation exists, any further customer message is routed to the concierge team as a follow-up `Task` (linked to the reservation) rather than silently ignored or, worse, WhatsApp attempting to interpret and execute a contract/financial change itself.
**RATIONALE**: The mission's explicit "WhatsApp sends/displays/routes, never executes" instruction for extension/return/settlement-adjacent requests.
**STATUS**: **IMPLEMENTED (this session)** — as a routing/notification mechanism only; the actual extension/return/settlement mutation still requires the existing, unmodified staff-driven Contract workflow.

### RULE-W09 — Inbound document/media handling
**STATUS**: **MISSING / NOT BUILT this session** — a real implementation would need to download media from Meta's Graph API using the access token and register it through the existing secure document pipeline (the same `vehicle-inspections`-style folder-allowlist pattern from Module 08, not the weaker generic `/api/documents` catalog). Given real Storage is confirmed network-blocked in this sandbox (see the final report's Storage Verification section) and this environment has no real Meta credentials to fetch media from in the first place, building this now would produce code with zero possible verification either way. Documented as a real, scoped, buildable gap rather than attempted half-built and unverifiable.

### RULE-W10 — Proactive/marketing messaging (abandoned reservation, VIP campaigns, seasonal offers)
**STATUS**: **MISSING / REQUIRES_PARTNER_ACCESS** — proactive outside-the-24-hour-session messaging requires Meta-approved Message Templates (the send function exists, RULE-W05, but no template has been submitted/approved) and a real opt-in tracking mechanism, neither of which exists in this codebase. Not built, per the mission's own explicit instruction not to assume proactive sending is unrestricted and not to fabricate opt-in infrastructure that isn't there.

---

## MODULE 14 — Lease-to-Own (Splendor Private Mobility Operating System)

The full contract-to-ownership lifecycle (APPLICATION → ELIGIBILITY →
VEHICLE SELECTION → FINANCIAL OFFER → APPROVAL → AGREEMENT → HANDOVER →
PAYMENT SCHEDULE → COLLECTIONS → SETTLEMENT → OWNERSHIP TRANSFER →
COMPLETION), built entirely as an ADDITIVE extension of existing engines
per this mission's explicit instruction: `src/server/leaseToOwn.ts` (the
orchestration layer) and `src/server/leaseToOwnPolicy.ts` (pure financial/
eligibility calculations) create no parallel Customer, KYC, Vehicle,
Reservation, Contract, Payment, Approval, Audit, or WhatsApp system. An LTO
agreement IS a `Contract` (`contractType:'lease_to_own'` + a `lto` details
object); an LTO vehicle state is an informational `Vehicle.ltoStatus` field,
never a second conflict-checking mechanism (`reserveVehicleSlot()`'s
existing active-contract-date-range check, given the agreement's real
start/end dates spanning the full term, is what actually blocks other
bookings). Financial policy is grounded in Splendor's own real, approved
LTO contract template (supplied during this build as a content-only PDF —
its branding/layout deliberately never used, only its clauses): Clause 3's
"two consecutive missed months" default threshold, Clause 6's flat (no
percentage) early-settlement mechanics, Clause 8's handover-before-
liability-transfer rule.

### RULE-LTO01 — Application lifecycle
**REQUIREMENT**: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → CANCELLED, linked to Customer/Vehicle/requested term/down payment/notes, with a decision requiring the same Four-Eyes/SoD approvals engine as every other governance decision.
**RATIONALE**: Section 1 of the mission brief; reuses `createApprovalRequest`/`decideApprovalRequest` (Phase 23.2) verbatim via a new `'lto_application'` `ApprovalRequestType`, rather than building a second decision engine.
**ACCEPTANCE CRITERIA**: A draft cannot be decided (must be submitted first); a decided application cannot be re-decided; cancellation releases any temporary vehicle hold.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` — "Application lifecycle" suite (real Firestore emulator).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO02 — Eligibility Engine (KYC guard, blocklist, age)
**REQUIREMENT**: Block submission if KYC is incomplete/expired, the customer is blocklisted, or the customer is under the configured minimum age — using the EXISTING Customer KYC fields and the existing `checkBlocklist()`, never a second identity system.
**RATIONALE**: Section 2 of the mission brief. No dedicated `kycStatus` field exists anywhere in this CRM (confirmed by inventory); "incomplete" is derived from the existing ID/license fields actually being present and unexpired — never guessed.
**ACCEPTANCE CRITERIA**: Missing date of birth is treated as "age cannot be verified" (blocking), never assumed eligible.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` — "checkLtoEligibility" suite (KYC incomplete, expired ID/license, blocklisted, underage, missing DOB).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO03 — Vehicle reservation via the existing reservation engine
**REQUIREMENT**: The selected vehicle must not enter a conflicting reservation; add vehicle lifecycle labels for LTO states without breaking the existing Vehicle Lifecycle.
**RATIONALE**: Section 3. `Vehicle.ltoStatus` (`lto_reserved`/`lto_active`/`lto_default`/`lto_settlement`/`lto_recovery`/`ownership_transfer_pending`/`owned`) is purely informational; the agreement's Contract carries a real `startDateTime`/`endDateTime` spanning the full term, so `reserveVehicleSlot()`'s pre-existing overlap check is the actual, only conflict gate — zero new conflict-checking code.
**ACCEPTANCE CRITERIA**: Approving a second application for a vehicle already under an active LTO agreement fails at submission/approval with a scheduling-conflict error, not a silent double-booking.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` — "Vehicle conflict" suite.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO04 — Configurable Financial Offer, no invented numbers
**REQUIREMENT**: Vehicle Price, Down Payment, Term, Monthly Installment (principal + markup portions), Final/Balloon Payment, Processing Fee, VAT, Total/Paid/Outstanding — server-computed, policy-configurable, never a client-supplied number.
**RATIONALE**: Section 4. The monthly markup rate, processing fee, and ownership-transfer fee had no real value anywhere in this codebase or the source contract — seeded as `sensitive_rule`/`value:null` in `src/config/businessRules.ts`, following this app's own Phase 23.9 precedent (data-retention rules). `computeLtoFinancialOffer()`/`computeSettlementAmount()` throw `LtoPolicyNotConfiguredError` until a CEO/Admin sets real values via the existing Business Rules Engine — the calculation is fully built, but the actual number is a human, once-only business decision, never guessed.
**FINANCIAL**: VAT uses the SAME shared `UAE_VAT_RATE` helper (`src/config/tax.ts`) every other financial route already uses — never a second VAT calculation.
**VERIFICATION METHOD**: `tests/leaseToOwnPolicy.test.ts` (pure unit tests: refuses to compute unconfigured, correct amortization math, balloon-payment handling, rejection of invalid inputs).
**STATUS**: **IMPLEMENTED (this session)** — calculation engine built and tested; the three real monetary values (`ltoMonthlyMarkupRatePercent`, `ltoProcessingFeeAed`, `ltoOwnershipTransferFeeAed`) are a **BUSINESS DECISION required before the first real offer can be computed** (see Section 22 / final report).

### RULE-LTO05 — Server-side payment schedule
**REQUIREMENT**: Per-installment Due Date, Amount, Paid, Remaining, Status (UPCOMING/DUE/PARTIALLY_PAID/PAID/LATE/OVERDUE/SETTLED), generated once at agreement creation and never recomputed by the client.
**RATIONALE**: Section 5. `computeInstallmentStatus()` is a pure, deterministic function of the stored installment + "now", callable both on read and by the collections sweep, so status is always live without a background job having to have run first.
**VERIFICATION METHOD**: `tests/leaseToOwnPolicy.test.ts` — `computeInstallmentStatus` suite (every state transition, including "a partial payment past grace is still late, not partially_paid").
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO06 — Payment integrity: server-authoritative, idempotent, concurrency-safe, audited
**REQUIREMENT**: Every financial mutation (payment recording, settlement completion) runs inside a real Firestore transaction/idempotent-create, recomputes balances from the stored documents (never trusts client-sent running totals), and calls the existing hash-chained audit trail.
**RATIONALE**: Section 6, this app's own Phase 1/7/23.5 precedents. `recordLtoInstallmentPayment()` uses `runDurableTransaction` + `runIdempotentCreate`; a duplicate Idempotency-Key replays the original result instead of double-crediting.
**SECURITY**: No sensitive financial decision depends on client input — amount is validated against the installment's own stored `remainingAmount` inside the transaction, not the request body's claim.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` — "Payment recording" suite: duplicate payment, two concurrent identical submissions (`Promise.all`) never double-crediting, over-payment rejection, double-payment-on-already-paid rejection.
**STATUS**: **IMPLEMENTED (this session)**. Two genuine, pre-existing Firestore "undefined value" bugs were found and fixed by this testing: `src/server/approvals.ts`'s optional `fieldPath` (affected every `createApprovalRequest` caller that omits it, not just LTO), and a partial installment payment's `paidAt`.

### RULE-LTO07 — Collections, never automatic legal action
**REQUIREMENT**: UPCOMING→REMINDER→DUE→GRACE→LATE→COLLECTIONS→DEFAULT, using the existing WhatsApp/notification/audit pipelines; no automatic legal action or vehicle repossession without a human decision.
**RATIONALE**: Section 7's explicit constraint. `runLtoCollectionsSweep()` only dispatches reminders (reusing `dispatchCustomerNotification`, at most once/day per installment via `lastReminderAt`) and is hooked into the SAME cron trigger `runNotificationChecks()` already uses (`GET/POST /api/notifications/run-checks`) — not a second scheduler. `markLtoDefault()` only flags eligibility; termination/recovery are always separate, explicit, human-decided steps (RULE-LTO09).
**VERIFICATION METHOD**: Code review + `tests/leaseToOwn.test.ts`'s Default suite (flagging requires the real configured consecutive-miss threshold, never auto-terminates).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO08 — Early Settlement (Clause 6: no invented percentage)
**REQUIREMENT**: "Request Early Settlement" computing Outstanding Balance + configurable Adjustments + Final Settlement Amount, decided through the same Four-Eyes engine (`'lto_settlement'` approval type).
**RATIONALE**: Section 8's explicit "don't invent a legal/accounting formula." The real, approved contract's Clause 6 specifies NO percentage penalty or discount — the customer pays the outstanding balance in full, plus a flat ownership-transfer processing fee (`ltoOwnershipTransferFeeAed`, another `sensitive_rule`/`value:null` pending a CEO/Admin decision). An earlier draft of this build had incorrectly modeled a percentage-based early-settlement fee before the real contract was read — corrected before any code shipped.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` + `tests/leaseToOwnPolicy.test.ts` — settlement amount is exactly outstanding + flat fee + adjustments; approving bulk-settles every remaining installment; rejecting returns the agreement to active.
**STATUS**: **IMPLEMENTED (this session)** — mechanics built and tested; the flat transfer-fee AMOUNT is a **BUSINESS DECISION** (see RULE-LTO04).

### RULE-LTO09 — Default / Termination, human-decided, never automatic
**REQUIREMENT**: DEFAULT → TERMINATION_REQUESTED → TERMINATED → RECOVERY states, with RBAC/SoD (`'lto_termination'` approval type) and financial reconciliation; recovery is a separate, explicit, staff-confirmed step, never triggered by the termination decision itself.
**RATIONALE**: Section 9 + the mission's repeated "no automatic legal action or vehicle repossession" instruction, and Clause 3's real "two consecutive missed months" threshold (sourced from the actual contract, not invented) as the default-eligibility gate.
**ACCEPTANCE CRITERIA**: Approving termination only marks the agreement/vehicle so staff know to proceed with the (human, off-system) recovery process; `markLtoVehicleRecovered()` is a distinct call, only reachable after `terminated`, that returns the vehicle to the normal rental pool.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` — "Termination, recovery, ownership transfer, completion" suite, explicitly asserting the vehicle is still `rented`/not yet recovered immediately after a termination request.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO10 — Ownership Transfer (RTA is an EXTERNAL dependency)
**REQUIREMENT**: LEASE_COMPLETED → SETTLEMENT_CONFIRMED → OWNERSHIP_TRANSFER_PENDING → OWNERSHIP_TRANSFERRED → COMPLETED; ownership is only considered transferred once documented in-system by a human.
**RATIONALE**: Section 10's explicit instruction not to invent an RTA integration. `requestLtoOwnershipTransfer()`/`confirmLtoOwnershipTransfer()` never call any government API (none exists); the system only records that staff have confirmed the real-world transfer happened, optionally with a document-path reference into the EXISTING document pipeline.
**STATUS**: **IMPLEMENTED (this session)** for the in-system recording; the actual RTA/plate transfer itself is a permanent, correctly-documented **EXTERNAL DEPENDENCY**, not a gap in this build.

### RULE-LTO11 — Contract, Document, and Audit integration (no parallel systems)
**REQUIREMENT**: LTO uses the existing Contract engine (additive `contractType`/`lto` fields only), links documents to the existing Document system, and routes every sensitive operation through the existing hash-chained audit trail.
**RATIONALE**: Sections 11, 16, 17's explicit "extend, never duplicate" mandate — verified by inventory: zero new entity collections were created for anything that already had one.
**STATUS**: **IMPLEMENTED**. Document generation (`src/server/leaseToOwnContractDocument.ts`, `POST /api/lto/contracts/:id/generate-contract`) merges (a) Splendor's fixed, approved letterhead -- supplied as a reference PDF, cropped once into its header band and footer band and embedded exactly as-is (never redrawn/recolored/regenerated; see `src/server/assets/ltoLetterheadAsset.ts`), repeating on every page via Puppeteer's native `headerTemplate`/`footerTemplate`, never reused as page content -- with (b) this codebase's own paraphrase of Splendor's real, approved LTO contract template (also supplied as a reference PDF, content-only; every clause's legal meaning matches the source 1:1, wording is the system's own) and (c) live merge fields from the real Contract/Customer/Installment records. Rendering uses a real headless Chromium (`puppeteer-core` + `@sparticuz/chromium`, the standard Vercel/Lambda-serverless-compatible build) rather than a pure-Node PDF library: an earlier `pdf-lib` + manual Arabic-reshaping/bidi attempt produced real, reproducible glyph-overlap bugs in this bilingual legal document, confirmed against a real-Chromium ground-truth render before being discarded -- an unacceptable risk for a document customers sign. The generated PDF is filed through the EXISTING Document pipeline (Firebase Storage + a real `CRMDocument`, category `'contract'`, linked to the Contract) -- no parallel storage system -- and every generation is audited. **VERIFICATION METHOD**: `tests/leaseToOwnContractDocument.test.ts` -- pure-template merge-field assertions, a REAL end-to-end Chromium render (magic-byte/page-count/merge-data checks via `pdf-parse`), and the guard-clause error paths; separately confirmed visually by rendering to PNG and reviewing the Arabic shaping/RTL and letterhead fidelity by eye during development. Not automated: the actual Firebase Storage upload step (this environment has no working Storage emulator, the same pre-existing limitation as every other document-upload code path in this codebase).

### RULE-LTO12 — Customer 360 / Vehicle Details / Dashboard integration
**REQUIREMENT**: Customer 360 shows Active Agreement/Vehicle/Monthly Payment/Paid/Outstanding/Term; Vehicle Details shows LTO Status/Customer/Agreement/Dates/Payment Status/Ownership Status and the vehicle must not read as ordinarily available while LTO-active; a Dashboard KPI widget surfaces Applications/Active/Outstanding/Near-Completion/Defaults.
**RATIONALE**: Sections 12-14. Reuses the exact tab-navigation pattern already established in `Customer360View.tsx`/`VehicleDetailMasterModal.tsx` and the existing `StatsCard` component on `DashboardView.tsx` — no new UI framework.
**ACCEPTANCE CRITERIA**: A vehicle under an active LTO agreement has `Vehicle.status:'rented'` (set by the same agreement-creation step that reserves it), so it already never appears in "available" listings elsewhere in the app — the LTO tab additionally makes this explicit to staff with a banner.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO13 — Arabic UI, no mixed-language WhatsApp messages
**REQUIREMENT**: LTO UI is Arabic+RTL/English+LTR via the existing translation approach; LTO WhatsApp notifications (application received/approved/rejected, payment reminder/due/late, statement, settlement, ownership transfer) are fully monolingual per message — never mixed.
**RATIONALE**: Sections 15, 19. `dispatchCustomerNotification()` gained an optional `language?: 'ar'|'en'` parameter (defaulting to the pre-existing bilingual behavior for every OTHER caller, unchanged) — when LTO passes a language explicitly, only that language's text is sent, with its own signature line, never concatenated with the other.
**VERIFICATION METHOD**: Code review of `notificationEngine.ts`'s three-way ternary; `LeaseToOwnView.tsx`'s full bilingual UI text audit (every user-facing string has both an `isAr` and an English branch).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-LTO14 — Testing coverage
**REQUIREMENT**: Real tests for Application, Eligibility, Approval, KYC Guard, Vehicle Conflict, Payment Schedule, Payment, Late Payment, Settlement, Default, Termination, Ownership Transfer, RBAC, SoD, Idempotency, Concurrency, Audit.
**VERIFICATION METHOD**: `tests/leaseToOwn.test.ts` (42 tests, real Firestore emulator) + `tests/leaseToOwnPolicy.test.ts` (19 pure unit tests) = 61 new tests, on top of the full pre-existing 358-test suite (400 total, all passing). Browser/Playwright UI verification was **NOT performed** — this environment has no configured Firebase service-account credentials, so the app cannot authenticate in a real browser session here; verified instead via typecheck + production build + code review.
**STATUS**: **IMPLEMENTED (this session)** for automated tests; **BLOCKED** for browser QA (environment credential limitation, not a code gap).

## MODULE 15 — Vehicle Master Profile & Verified Vehicle Catalog

Upgrades the existing Add/Edit Vehicle screens and the existing
"Publish to Website" control into a Vehicle Master Profile, per the
mission's core principle: **"Extend, Never Duplicate" (طوّر الموجود ولا
تستبدله)**. Zero existing fields were removed, renamed, or reinterpreted;
zero parallel Vehicle entity/storage/API was created. Every new field on
`Vehicle` is additive-optional; the existing `fuelType` union was widened
(not replaced) to add `diesel`/`hydrogen` alongside its three pre-existing
values, verified safe via an exhaustive usage search before the change.

### RULE-VMP01 — No parallel Vehicle entity, storage, or API
**REQUIREMENT**: All new data reuses the existing `Vehicle` type, the existing `POST /api/fleet` / `PUT /api/fleet/:id` routes, and the existing Firestore `vehicles` collection.
**RATIONALE**: The generic `PUT /api/fleet/:id` merge route and the `VEHICLE_SERVER_OWNED_FIELDS` denylist (Phase 12 mass-assignment hardening) already pass through any new field name unmodified — confirmed by inventory before writing a single line of new route code. No new Vehicle-shaped collection exists anywhere in this change.
**VERIFICATION METHOD**: `tests/vehicleMasterProfile.test.ts` — Add flow and Edit-flow-zero-data-loss tests exercise the unmodified generic routes with the new fields.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP02 — Master Manufacturer/Model Catalog, cascading, never cross-leaking
**REQUIREMENT**: Manufacturer is a centralized catalog (`src/config/vehicleCatalog.ts` seed + `src/server/vehicleCatalog.ts` hydration), not free text; Model dropdowns are strictly filtered to the selected manufacturer's own models.
**RATIONALE**: Mirrors the exact static-defaults-plus-Firestore-approved-additions hydration pattern already established by `businessRules.ts`'s `hydrateBusinessRules()` — no new architecture invented. Seed data covers 16 real, curated manufacturers (Ferrari, Lamborghini, Rolls-Royce, Bentley, Aston Martin, McLaren, Bugatti, Porsche, Mercedes-Benz, BMW, Audi, Land Rover, Cadillac, Nissan, Maserati, GMC) with ~2-4 real models each — a genuine, non-exhaustive starting set, not a worldwide claim.
**ACCEPTANCE CRITERIA**: `GET /api/vehicle-catalog/models?manufacturerId=X` never returns a model belonging to a different manufacturer.
**VERIFICATION METHOD**: `tests/vehicleMasterProfile.test.ts` — asserts a Ferrari query never returns Lamborghini's "Revuelto" and vice versa.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP03 — Catalog updates: Discovery → Verification → Review → Approval → Master Catalog, never blind
**REQUIREMENT**: A staff-submitted "model not found, request to add" (or a future automated discovery hit) only ever creates a PENDING record; it is never written to the readable catalog until a DIFFERENT authorized person approves it.
**RATIONALE**: Reuses the existing Four-Eyes/Segregation-of-Duties approval engine (`src/server/approvals.ts`, `createApprovalRequest`/`decideApprovalRequest`) with one new `ApprovalRequestType` value (`'vehicle_catalog_update'`) — the exact same SoD check (decider can never be the requester) every other approval type in this system already enforces, not a second approval mechanism. `discoverySource: 'internet_discovery'` is schema-ready for a future automated discovery job, but every hit still lands as PENDING — the internet is discovery-only, never a publish authorization, per the mission's explicit rule.
**VERIFICATION METHOD**: `tests/vehicleMasterProfile.test.ts` — proves a proposal stays pending and invisible to `GET /api/vehicle-catalog/models`, that the requester cannot self-approve, that a different CEO's approval makes it visible, and that a rejection never enters the catalog.
**STATUS**: **IMPLEMENTED (this session)** for the manual propose/review/approve flow. **DEFERRED**: an actual automated internet-discovery job (crawling manufacturer sites) was not built — this environment has no safe, reliable structured-data-fetching capability for that, and inventing scraped "discoveries" would itself violate the mission's anti-fabrication rule. The ingestion point (`discoverySource: 'internet_discovery'`, still gated through the identical approval flow) is real and ready for a future job to call.

### RULE-VMP04 — Centralized classification dropdowns
**REQUIREMENT**: Body Style (26 types), Vehicle Class Tier (9), SUV Classification (7, shown only when relevant), Performance Classification (5), Rental Segment (12), Usage Type (9), Drivetrain (4), Powertrain/Fuel (6), Roof Type (7) — one bilingual source of truth, never a second copy per screen.
**RATIONALE**: `src/config/vehicleClassification.ts` — a single `ClassificationOption<T>` pattern with `*_BY_VALUE` lookup maps, imported identically by the Add Vehicle modal and the Edit (VehicleDetailMasterModal) screen. `isSuvBodyStyle()` gates the SUV-specific dropdown so it never appears for a sedan/coupe.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP05 — Technical Specifications as an independent tab
**REQUIREMENT**: Engine, horsepower, transmission, drivetrain, powertrain/fuel, doors, seats, roof type editable as their own tab, additive to the pre-existing engine/horsepower/transmission/fuelType fields.
**RATIONALE**: Added to both the Add Vehicle modal (`Technical Specs` tab) and `VehicleDetailMasterModal` (`technical` tab) — existing fields (engine/horsepower/transmission/fuelType) keep their pre-existing meaning and required-ness; the new fields (drivetrain/doors/seats/roofType) are additive-optional.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP06 — Verified Publish Gate: never publish unconfirmed data
**REQUIREMENT**: "نشر على الموقع" is blocked unless confirmed basic data, technical data, required photos, and commercial data are all present; blocked publish returns the exact list of what is missing ("غير جاهز للنشر — بيانات ناقصة / تحتاج تحقق"); editing an already-published vehicle's core data re-verifies before it stays published.
**RATIONALE**: `src/server/vehiclePublishGate.ts`'s `evaluateVehiclePublishReadiness()` is a single pure function reused THREE times: (1) server-side in `PUT /api/fleet/:id/website-publish` before accepting `enabled:true`; (2) server-side in the generic `PUT /api/fleet/:id` route, which now auto-unpublishes (with a system-authored audit entry and timeline event) if a subsequent edit leaves a published vehicle's required data incomplete; (3) client-side in `VehicleDetailMasterModal`'s website tab for real-time staff feedback, imported directly since the module has zero Node-only dependencies. One function, three call sites — never three separate implementations that could drift apart. The route was also hardened to use the caller's real, token-verified identity (`getRequesterActor`) instead of a client-supplied `actorId`/`actorName`, closing a spoofable-audit-trail gap found during this work.
**ACCEPTANCE CRITERIA**: Complete+confirmed vehicle → publish succeeds; incomplete data → 400 with itemized reasons; unconfirmed data → blocked the same way; editing a published vehicle's exterior color to blank auto-unpublishes it.
**VERIFICATION METHOD**: `tests/vehicleMasterProfile.test.ts` — all four scenarios exercised at the HTTP layer against the real route.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP07 — Public API never fabricates data or leaks internal fields
**REQUIREMENT**: The public vehicle DTO never invents a features list, a mileage-allowance fallback, or any other unconfirmed spec, and never exposes purchase price, financing party, or profitability score.
**RATIONALE**: Found and fixed a real pre-existing bug in `SplendorConnectEngine.toPublicVehicleDTO()`: it previously defaulted `features`/`featuresAr` to a hardcoded marketing placeholder list ("Bespoke Interior", "Premium Sound System", "Chauffeured Delivery Available") whenever a vehicle had none configured, and defaulted `mileageAllowanceKm` to a fabricated `250` whenever the real value was falsy — both direct violations of this mission's anti-fabrication rule, now returning the real (possibly empty/zero) confirmed value instead. Internal financial fields were already structurally excluded from the DTO's field list before this session; that property is now covered by an explicit regression test rather than an unverified assumption.
**VERIFICATION METHOD**: `tests/vehicleMasterProfile.test.ts` — asserts an empty features array (not the old placeholder text) and asserts `purchasePrice`/`financingParty`/`profitabilityScore`/`vin`/`plateNumber` are all `undefined` on the returned DTO even when present on the source vehicle.
**STATUS**: **IMPLEMENTED (this session)** — bug found and fixed, not merely audited.

### RULE-VMP08 — UI consolidation: one Add/Edit Vehicle flow, not two
**REQUIREMENT**: A single tabbed (Basic Info / Classification / Technical Specs / Rental & Pricing) Add Vehicle flow used from every entry point.
**RATIONALE**: `FleetCRMView.tsx` previously carried its own separate, simpler inline "Add Vehicle" form (Make/Model/Year/Plate/DailyRate/Deposit only) alongside the fuller `AddVehicleModal.tsx` already used from `Header.tsx` — a pre-existing "extend, never duplicate" violation found during exploration. `AddVehicleModal.tsx` was upgraded in place into the full tabbed Master Profile flow (cascading Manufacturer→Model dropdowns sourced from the new catalog API, a "Model not found? Request to add new model" affordance, and the new classification/technical tabs), and `FleetCRMView.tsx`'s duplicate inline form was deleted in favor of reusing the same component.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP09 — Testing coverage
**REQUIREMENT**: Real tests for the Add flow, the Edit flow (zero data loss on reopen), Catalog propose/approve/reject (including blocking unconfirmed data from entering the catalog), and the Publish Gate (success/blocked/re-verification/no-internal-leak).
**VERIFICATION METHOD**: `tests/vehicleMasterProfile.test.ts` — 11 new tests, all against the real Express app via `supertest` with a mocked Firestore (the same isolation pattern as `tests/massAssignment.test.ts`), on top of the full pre-existing 406-test suite (417 total, zero regressions, verified via `npm test` against the real Firestore emulator).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-VMP10 — Automated internet catalog discovery
**REQUIREMENT (deferred)**: A background job that discovers new manufacturers/models/generations from the internet and feeds them into the review queue.
**RATIONALE FOR DEFERRAL**: This environment has no safe, reliable structured-data-fetching capability suited to unattended catalog discovery, and fabricating a "discovery" result would itself violate this mission's absolute anti-fabrication rule — the same honest-deferral reasoning already applied to RULE-W09/W10 in Module 13. The ingestion point that such a job would call (`proposeCatalogUpdate()` with `discoverySource:'internet_discovery'`) is real, built, and gated through the identical Four-Eyes review used for staff-submitted proposals; nothing about this deferral weakens the "never auto-publish" guarantee.
**STATUS**: **NOT BUILT — honestly deferred**, not a hidden gap.

## MODULE 16 — Payment Gateway (Production-Grade Payment & Settlement Layer)

Extends the existing Invoice/Payment/Deposit/LtoInstallment lifecycle with
a unified Payment Gateway layer -- no parallel financial ledger. The core
discipline throughout: a PaymentIntent's status, and the real financial
effect it triggers, only ever change in response to a signature-verified
gateway webhook event, never a client-reported "it worked."

### RULE-PG01 — Gateway adapter boundary, no secrets in code
**REQUIREMENT**: A single adapter interface (`PaymentGatewayAdapter`) is the only place a real gateway's SDK is ever called from; the active provider is chosen purely by the `PAYMENT_GATEWAY_PROVIDER` environment variable; no card data or gateway secret is ever hardcoded.
**RATIONALE**: `src/server/paymentGatewayAdapter.ts` defines the adapter interface plus a real, fully-functioning `sandbox` implementation (the safe default) and named stubs for `stripe`/`checkout_com`/`telr`/`network_international` that throw a specific, actionable `GatewayNotConfiguredError` naming exactly which env secret and SDK integration a real deployment needs -- never a fabricated network call pretending to succeed against nothing. Wiring in a real provider later is a scoped, one-file change plus the relevant `*_SECRET_KEY`/`*_WEBHOOK_SECRET` environment variables; zero code elsewhere in this layer changes.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG02 — PaymentIntent, never a client-trusted amount
**REQUIREMENT**: A PaymentIntent's amount is always derived from the real linked entity's own outstanding balance (`Invoice.balanceDue`, `LtoInstallment.remainingAmount`) for `invoice_payment`/`lto_installment` purposes -- never accepted from the request body. Only `security_deposit` (which has no pre-existing entity) takes an explicit amount.
**RATIONALE**: `resolveIntentLinkage()` in `src/server/paymentIntents.ts` re-reads the real Firestore record server-side on every intent creation; a test proves a tampered `amount` in the request body is silently ignored in favor of the real invoice balance.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — "never accepts a client-supplied amount for an invoice_payment intent".
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG03 — Idempotency
**REQUIREMENT**: A retried "create PaymentIntent" with the same Idempotency-Key never opens a second gateway charge attempt; reusing the key for a genuinely different request is refused, not silently replayed with the wrong result.
**RATIONALE**: Reuses the exact same durable Idempotency-Key mechanism (`runIdempotentCreate`, `src/server/idempotency.ts`) every other critical mutation in this codebase (contract creation, payment recording, LTO applications) already relies on — no second idempotency mechanism invented for this layer.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — replay returns the same intent id; a reused key with a different body gets 409.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG04 — Webhooks: signature-verified, deduplicated, the only source of truth for success
**REQUIREMENT**: `POST /api/payment-gateway/webhook` verifies a constant-time HMAC signature before touching any data; a redelivered event (by `${provider}:${providerEventId}`) is a durable no-op, never a double-applied effect; a PaymentIntent's status only ever advances here.
**RATIONALE**: Mirrors the exact pattern already proven in this codebase for `POST /api/whatsapp/webhook` (raw-body capture via `express.json()`'s `verify` option, `crypto.timingSafeEqual` constant-time compare, exempted from `requireAuth` in the `/api` middleware with its trust boundary enforced entirely inside the handler) -- not a new security pattern. `handleGatewayWebhook()` logs every delivery to `payment_gateway_events` keyed by the event id before applying any effect, so a second delivery of the same event is detected and skipped.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — a forged/missing signature gets 403; a correctly-signed event applies its effect exactly once even when redelivered (verified by asserting exactly one Payment record exists after two identical deliveries).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG05 — Confirmed effect reuses the existing Payment/Deposit/LtoInstallment functions, never a parallel one
**REQUIREMENT**: A gateway-confirmed `invoice_payment`/`lto_installment`/`security_deposit` calls into the exact same functions the manual (cash/bank transfer) finance-entry routes already use.
**RATIONALE**: `POST /api/payments`'s and `POST /api/deposits`'/`POST /api/deposits/:id/refund`'s transaction bodies were extracted (behavior-preserving -- the full pre-existing suite passed unchanged before and after) into `src/server/payments.ts` (`createConfirmedPayment`, `applyConfirmedPaymentRefund`) and `src/server/deposits.ts` (`createSecurityDeposit`, `refundOrReleaseDeposit`). The webhook handler and the manual routes now both call these same functions -- an online (gateway) payment and a manually recorded one become the literal same `Payment`/`Deposit` record, never two parallel systems. `lto_installment` confirmation reuses `recordLtoInstallmentPayment()` (already-existing LTO code) unchanged, passing the PaymentIntent's own id as the idempotency key so a redelivered webhook can never double-credit an installment.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — the resulting `Payment` record carries `gatewayPaymentIntentId` and `method:'online_link'`, is indistinguishable in shape from a manually-recorded one, and never contains a card number/CVV field; full pre-existing suite unaffected (417→426 tests, zero regressions).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG06 — Failure and retry
**REQUIREMENT**: A failed PaymentIntent never touches the underlying Invoice/Deposit/Installment; a fresh PaymentIntent can be opened as a genuine retry once the failure is addressed.
**RATIONALE**: `applyWebhookEvent()`'s `payment_intent.failed` branch only updates the PaymentIntent's own status/failureReason -- it never calls any of the confirmed-effect functions. Since `resolveIntentLinkage()` re-derives the amount from the real entity on every new intent, the invoice's un-reduced `balanceDue` naturally supports a full-amount retry with no manual cleanup.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — "a failed intent never touches the invoice, and a fresh retry intent can still be created".
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG07 — Refunds, webhook-confirmed
**REQUIREMENT**: Refunding a PaymentIntent only ever creates a `pending`/`processing` `PaymentRefund` record and asks the gateway to act; the underlying Invoice/Payment/Deposit is reversed only once a `refund.succeeded` webhook confirms it. Only a `succeeded` PaymentIntent can be refunded, and a reason is mandatory.
**RATIONALE**: `refundPaymentIntent()` never touches Invoice/Payment/Deposit state itself -- only `applyWebhookEvent()`'s `refund.succeeded` branch does, via `applyConfirmedRefundEffect()`, which dispatches to `applyConfirmedPaymentRefund()` (invoice_payment) or `refundOrReleaseDeposit()` (security_deposit) -- the same reversal logic a manual finance-entry refund uses. `PaymentRefund` is deliberately a distinct record from Procurement's `CustomerRefundRequest` (a different domain: reversing a specific prior gateway charge vs. paying out an accumulated credit balance) -- not a duplicate of it.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — the invoice/payment is provably untouched between the refund request and the confirming webhook, and correctly reversed after; missing reason and non-succeeded-intent refund attempts are both rejected with 400.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG08 — Security Deposit Hold/Release via gateway authorization
**REQUIREMENT**: A `security_deposit` PaymentIntent's confirmed authorization becomes a real `Deposit` record (`holdType:'gateway_authorization'`) -- funds reserved, not yet taken. Releasing it voids the authorization at the gateway; the Deposit itself only moves to `refunded` once that void is itself webhook-confirmed.
**RATIONALE**: Extends the existing `Deposit` type/lifecycle with two additive fields (`holdType`, `gatewayPaymentIntentId`) rather than a second deposit concept. `releaseSecurityDepositHold()` calls the adapter's `cancelIntent()` but does not itself change any Deposit/PaymentIntent status -- only the subsequent `payment_intent.canceled` webhook does, calling `refundOrReleaseDeposit()` for a full-balance release. A capture-from-hold path (taking the money after a valid damage claim) was deliberately left reusing the EXISTING, untouched `POST /api/deposits/:id/apply` route rather than being rebuilt here -- the mission asked specifically for Hold/Release, and `/apply` already does exactly what a capture needs (an approved-charge-gated deduction) with zero changes required.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` — the Deposit is `held` immediately after the hold is confirmed, stays `held` through the release *request* alone, and only becomes `refunded` (with the customer's `securityDepositsHeld` correctly reduced) once the cancellation webhook lands.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG09 — No raw card data, ever
**REQUIREMENT**: No card number, CVV, or expiry is ever modeled, transmitted through, or stored by this backend.
**RATIONALE**: `PaymentIntent`/`PaymentRefund`/`PaymentGatewayEvent` only ever carry amounts, currencies, and the gateway's own opaque reference ids (`providerIntentId`, `providerRefundId`, `clientSecret`) -- structurally, there is no field anywhere in this layer's types that could hold a PAN/CVV. Real card entry happens entirely inside the gateway's own hosted UI/SDK on the frontend (Stripe Elements, Checkout.com Frames, etc., once a real provider is wired in) -- this backend never receives it, matching standard PCI-DSS SAQ-A scope-reduction practice.
**VERIFICATION METHOD**: `tests/paymentGateway.test.ts` asserts the resulting Payment record has no `cardNumber`/`cvv` keys; structurally confirmed by the type definitions in `src/types/index.ts` having no such fields to begin with.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-PG10 — Real gateway integration (Stripe/Checkout.com/Telr/etc.)
**REQUIREMENT (deferred)**: An actual, live-money-moving integration with a specific real payment gateway.
**RATIONALE FOR DEFERRAL**: This requires real, provider-issued production credentials (`STRIPE_SECRET_KEY`, `CHECKOUT_COM_SECRET_KEY`, etc.) and a business decision on which gateway Splendor contracts with -- neither exists in this environment, and fabricating a "working" integration without them would be worse than not having one (a false sense of production-readiness). `getActiveGatewayAdapter()`'s stubs for each named provider throw a specific, actionable error naming exactly what's missing; switching `PAYMENT_GATEWAY_PROVIDER` away from `sandbox` in production is a deliberate, visible action that fails loudly rather than silently doing nothing. A frontend checkout UI embedding the chosen gateway's own hosted card-entry SDK was likewise not built, since each real gateway has its own distinct SDK and building one against no real provider would be premature, fabricated UI.
**STATUS**: **NOT BUILT — honestly deferred, requires production credentials.**

## MODULE 17 — Collections & Bank Reconciliation

Extends the existing Financial Engine (Payment/Invoice/Document/Audit) with
a manageable manual-collection layer and a bank-statement matching engine
-- no parallel financial ledger, no parallel document store. The core
discipline throughout: bank-statement analysis only ever COMPUTES a
classification and a suggestion; a Payment is only ever created or
confirmed by an explicit human action.

### RULE-BR01 — Manageable payment methods catalog
**REQUIREMENT**: Manual payment recording must draw from an admin-editable list of payment methods (cash, POS card, bank transfer, cheque, etc.), not a hardcoded one.
**RATIONALE**: `src/config/payments.ts`'s `DEFAULT_CUSTOMER_PAYMENT_METHODS`/`CustomerPaymentMethodDef` follows the exact same manageable-list pattern already proven by Procurement's `PROCUREMENT_PAYMENT_METHOD_DEFS` and the existing custom-fields catalog -- `globalStore.paymentMethods`, seeded from the defaults, editable via `GET/POST /api/payment-methods` and `PATCH /api/payment-methods/:key` (ceo/admin only), hydrated from and persisted to its own `payment_methods` Firestore collection with the same "preserve system defaults if empty" cold-start rule already used for `customFields`/`numberingConfigs`.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-BR02 — Manual payment recording enrichment
**REQUIREMENT**: Every manually recorded payment links to a customer, a contract/reservation/invoice, a reference number, a proof of payment, the recording employee, and a verification status.
**RATIONALE**: `Payment` gained additive fields only -- `reservationId` (a payment can predate any contract, e.g. a booking deposit), `proofDocumentId` (an id into the existing `CRMDocument`/Storage system, never a raw file blob on the Payment record), and `verificationStatus`/`verifiedBy`/`verifiedByName`/`verifiedAt`/`verificationNote`. `createConfirmedPayment()` now sets every new payment's `verificationStatus` to `pending_review` unconditionally -- attaching a proof file at recording time is not the same as a finance reviewer having actually checked it -- and `POST /api/payments/:id/verify` (finance/ceo/admin) is the one place that status ever changes, mirroring the existing FIN-002 reclassify-with-audit pattern. `POST /api/upload` gained two more folders (`payment-proofs`, `bank-statements`), both routed through the exact same authenticated `GET /api/documents/file` proxy every other upload folder already uses -- no new storage mechanism.
**VERIFICATION METHOD**: `tests/bankReconciliation.test.ts` and the existing `Payment`/`CreateConfirmedPaymentInput` type surface.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-BR03 — Bank statement import: CSV/Excel first, PDF-ready by construction
**REQUIREMENT**: Accept CSV/Excel statements now; the import layer must allow PDF to be added later without rebuilding the reconciliation engine.
**RATIONALE**: `src/server/bankImportGuard.ts` classifies an upload by its own magic bytes (never the client-supplied filename) into `'excel' | 'csv' | 'pdf'`, mirroring `tollImportGuard.ts` exactly; a `'pdf'` upload is recognized and explicitly rejected today with a "not supported yet" message rather than silently mis-parsed. `src/server/bankStatementParsers.ts` isolates ALL column-detection/normalization logic into one shared `parseGridToBankRows(grid: string[][])` function that both `parseBankStatementExcel()` and `parseBankStatementCsv()` funnel into -- a future PDF text-extraction parser only has to produce the same plain grid (or the same `ParsedBankStatementRow[]` shape) and hand it to this one function; nothing in `bankReconciliation.ts` or the `POST /api/bank-batches` route changes.
**VERIFICATION METHOD**: `tests/bankReconciliation.test.ts` -- CSV and Excel parsing (header-keyword detection, dr/cr-indicator columns, accounting-negative parentheses, missing-column warnings, unparseable-date skipping).
**STATUS**: **IMPLEMENTED (this session)**; PDF parsing itself is RULE-BR09 below, honestly deferred.

### RULE-BR04 — Matching/classification engine with a stated reason
**REQUIREMENT**: Compare each bank statement line against CRM-recorded payments (amount, date, reference, customer, contract) and classify it as matched / needs review / unrecorded transfer / amount mismatch / duplicate transaction / payment not found in the bank -- each with a stated reason.
**RATIONALE**: `src/server/bankReconciliation.ts`'s `classifyBankRow()` is a pure, read-only function (no Firestore, no globalStore mutation) producing exactly the five `BankMatchClassification` values plus a bilingual `reasonEn`/`reasonAr` for every row -- duplicate check first, then exact-reference match, then customer-identified-in-description match against open invoice balances, falling back to `unrecorded_transfer`. The sixth outcome, "دفعة غير موجودة بالبنك" (a CRM payment the statement never accounts for), is reported per-batch by `findUnmatchedCrmPayments()` on the `BankImportBatch` rather than fabricated as a nonexistent bank line. These are purely additive fields (`matchClassification`/`matchReason`/`matchReasonAr`/`duplicateOfTransactionId` on `BankTransaction`) alongside, never replacing, the pre-existing FIN-002 `receivedAmountClassification` money-type classification.
**VERIFICATION METHOD**: `tests/bankReconciliation.test.ts` -- one test per classification outcome (exact match, reference-match-wrong-amount, ambiguous-reference, customer-match, customer-match-wrong-amount, customer-no-open-invoice, unrecorded transfer, debit-routed-to-review) plus `findUnmatchedCrmPayments` coverage.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-BR05 — Absolute rule: never auto-create or auto-confirm a payment from bank-statement analysis alone
**REQUIREMENT (verbatim, mission brief)**: "ممنوع إنشاء أو تأكيد أي دفعة تلقائيًا بناءً على تحليل كشف البنك فقط. العمليات غير المطابقة تذهب للمراجعة والاعتماد." (Forbidden to automatically create or confirm any payment based on bank statement analysis alone; unmatched operations go to review and approval.)
**RATIONALE**: Every `BankTransaction` created by `POST /api/bank-batches` -- confirmed or not, whatever its classification -- is written with `reconciled:false`; only a human's explicit, per-transaction `POST /api/bank-transactions/:id/reconcile` call ever sets it `true` or posts an invoice/customer-balance change. Building this rule's own test coverage surfaced a real, live violation of it: `CRMContext.tsx`'s `runAutoReconciliation()` looped over every high-confidence suggested match and called the reconcile endpoint on each one with zero human review -- a leftover from before this mission's absolute rule existed. It was rewritten to a non-mutating "N transaction(s) are ready for your review" summary; it no longer calls the reconcile endpoint under any condition.
**VERIFICATION METHOD**: `tests/bankReconciliation.test.ts` -- "confirmed import persists transactions but NEVER a Payment" (asserts `globalStore.payments.length` is unchanged by import regardless of classification) and "never auto-confirmed by the import itself" (`txn.reconciled === false` immediately after a confirmed import, even for a `matched` row).
**STATUS**: **IMPLEMENTED (this session)** -- including a fix to a pre-existing violation.

### RULE-BR06 — Duplicate detection requires an explicit override to confirm
**REQUIREMENT**: A transaction detected as probably duplicating an earlier one must not be reconcilable with a single click like any other row.
**RATIONALE**: `findDuplicate()` (inside `classifyBankRow()`) checks both cross-batch (against `globalStore.bankTransactions`) and within-batch (against the rows already processed earlier in the same import) duplicates -- same date + amount, and same reference when both sides have one. `POST /api/bank-transactions/:id/reconcile` refuses (409) to reconcile a transaction whose `matchClassification === 'duplicate_transaction'` unless the request carries a non-empty `duplicateOverrideReason`, which is then recorded verbatim in the audit trail as a deliberate override, not silently dropped.
**VERIFICATION METHOD**: `tests/bankReconciliation.test.ts` -- a within-batch duplicate (two identical rows in one file) and a cross-batch duplicate (the same statement imported twice) are both detected; reconciling either without a reason returns 409, and with one succeeds and is audited.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-BR07 — Manual approval reuses the existing reconcile/FIN-002 flow, never a parallel one
**REQUIREMENT**: Approving a matched or reviewed transaction must post through the same financial-effect path every other reconciliation already uses.
**RATIONALE**: No new "approve a bank transaction" endpoint was built -- the pre-existing `POST /api/bank-transactions/:id/reconcile` (FIN-002's mandatory-classification, idempotent, real-Firestore-transaction route) is reused unchanged in its financial-effect logic; this mission only added the duplicate-override gate in front of it (RULE-BR06).
**VERIFICATION METHOD**: `tests/bankReconciliation.test.ts` -- "a plain (non-duplicate) manual reconcile posts the invoice balance -- the only path that ever does".
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-BR08 — Document/Storage and Audit reuse, never a parallel system
**REQUIREMENT**: Proof-of-payment files and uploaded bank statements must use the existing Document/Storage and Audit Trail systems.
**RATIONALE**: `payment-proofs/` and `bank-statements/` are two more folders on the same `POST /api/upload` -> `GET /api/documents/file` authenticated-proxy pipeline every other upload (avatars, customer documents, vehicle inspections) already uses -- no signed URL, no new bucket, no new access-control mechanism. Every route this module added (`/api/payment-methods`, `/api/payments/:id/verify`, the bank-batch import, the duplicate-override reconcile) calls the existing `recordAudit()` -- no separate collections-specific audit log.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-BR09 — PDF bank statement parsing
**REQUIREMENT (deferred)**: Accept PDF bank statement exports, not just CSV/Excel.
**RATIONALE FOR DEFERRAL**: The mission explicitly asked for CSV/Excel first with the import layer merely designed so PDF could be added later (see RULE-BR03) -- building PDF text-extraction now, without a real sample of the range of bank-issued PDF statement layouts this app will actually receive, risks exactly the kind of fabricated-but-untested parsing this codebase's standing anti-fabrication discipline exists to prevent. `detectBankImportFileKind()` already recognizes a PDF upload by its real magic bytes and returns a clear "not supported yet" error today, rather than silently mis-parsing or crashing.
**STATUS**: **NOT BUILT — honestly deferred, extension point ready (see RULE-BR03).**

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
| 08 Inspection | 8 | 0 | 6 | 2 |
| 09 Maintenance | 5 | 0 | 3 | 2 |
| 10 Reservation | 5 | 2 | 2 | 1 |
| 11 Pricing | 3 | 0 | 1 | 2 |
| 12 Governance | 4 | 2 | 1 | 1 |
| 13 WhatsApp | 10 | 0 | 8 | 2 |
| 14 Lease-to-Own | 14 | 0 | 14 | 0 |
| 15 Vehicle Master Profile | 10 | 0 | 9 | 1 |
| 16 Payment Gateway | 10 | 0 | 9 | 1 |
| 17 Collections & Bank Reconciliation | 9 | 0 | 8 | 1 |
| **Total** | **113** | **10** | **66** | **37** |

26 rules were genuinely implemented, tested, and committed across this
session (RULE-A01, R03, R04, B01-B05, P01, M01-M03, I01-I02, I05-I08,
W01-W08), on top of 10 already-real pre-existing ones — 36 of 70 (51%) now
have genuine, evidenced implementation. Module 08 grew from 4 to 8 rules
this phase: I01/I02 (photo requirements, manual comparison) already
existed as placeholders and are now genuinely built; I05-I08 (damage
liability review, customer acknowledgement, post-completion immutability,
idempotent creation/completion) are new rules this phase's Vehicle
Inspection mission surfaced and immediately implemented, per this
mission's standing authorization to create new rules as needed rather
than force everything into the original four inspection placeholders.
Module 13 (WhatsApp) is entirely new this session, replacing the
originally-drafted Module 01's WhatsApp-OTP sub-requirement's placeholder
framing with the actual, much larger conversational-commerce mission this
phase covered — W01-W08 (webhook idempotency hardening, the conversation
state machine, customer matching, reservation-engine reuse, interactive
messaging, the Human Concierge Unified Inbox, financial safety,
post-booking follow-up routing) are real and verified; W09 (inbound
document/media handling) and W10 (proactive/marketing messaging) are
honestly deferred (external Storage/Meta-partner dependencies), not
half-built. The 34 deferred/not-built rules are each explicitly reasoned
above, not silently dropped: external/hardware dependency, a material
financial-policy question awaiting the user (RULE-D04/D05), a deliberate
choice not to half-build a large, coherent feature in a rushed pass
(RULE-P02/P03, RULE-R05, RULE-I03/I04, RULE-W09/W10) — plus the
Module 01/02/05/07 rows corrected by an earlier audit, which remain
genuinely unbuilt and are catalogued as real, sizeable future work rather
than fabricated.

Module 14 (Lease-to-Own) is entirely new across two phases: LTO01-LTO14
(the complete application-to-ownership-transfer lifecycle, including
LTO11's contract-document generation) are real, tested (67 tests total --
61 against the real Firestore emulator/pure unit tests plus 6 for document
generation, one of which is a REAL end-to-end headless-Chromium PDF
render -- on top of the full pre-existing 358-test suite -- 406 total,
zero regressions), and additive to every existing engine (Contract,
Vehicle, Approvals/SoD, Payments, Vehicle Inspection, WhatsApp, Audit,
Document/Storage) per the mission's explicit "extend, never duplicate"
mandate. Two rules carry an honest caveat inside an otherwise-IMPLEMENTED
status rather than a blanket claim: LTO04/LTO08's three real monetary
values (monthly markup rate, processing fee, ownership-transfer fee) are
seeded unconfigured (sensitive_rule/value:null) and require a one-time
CEO/Admin decision via the existing Business Rules Engine before the
first real offer or settlement can be computed; LTO14's automated test
coverage is complete, but browser/Playwright UI verification of the
staff-facing screens could not be performed in this environment (no
Firebase service-account credentials configured here to authenticate a
real session) -- the document-generation pipeline's own Chromium rendering
IS exercised for real, since it needs no Firebase credentials. LTO11's
document generation, initially deferred as PARTIAL, was completed in a
follow-up session once the two reference PDFs (source contract, company
letterhead) were re-supplied: a real `pdf-lib`-based approach was tried
first and discarded after it produced reproducible Arabic glyph-overlap
bugs (verified against a real-Chromium ground truth) -- an unacceptable
risk for a document customers sign -- in favor of real headless Chromium
(`puppeteer-core` + `@sparticuz/chromium`), a deliberate architecture
change surfaced to and approved by the user before being built. The one
genuinely unautomated piece is the Firebase Storage upload step inside
`generateLtoContractDocument()`, for the same pre-existing reason every
other document-upload code path in this codebase is untested here: no
working Storage emulator in this environment.

Module 15 (Vehicle Master Profile & Verified Vehicle Catalog) upgrades the
existing Add/Edit Vehicle screens and the existing website-publish control
without deleting, renaming, or reinterpreting a single existing field --
VMP01-VMP09 (no parallel Vehicle storage, the cascading Manufacturer/Model
catalog, the Four-Eyes-gated propose/approve flow, the nine centralized
classification dropdowns, the Technical Specs tab, the Verified Publish
Gate reused at three call sites, the anti-fabrication fix to the public
DTO, the Add-Vehicle UI consolidation, and the new test suite) are real,
tested (11 new tests against the real Express app + mocked Firestore, on
top of the full pre-existing 406-test suite -- 417 total, zero
regressions), and additive to every existing engine (Vehicle, Approvals/
SoD, Business Rules hydration pattern, Public DTO/Website) per the same
"extend, never duplicate" mandate as every other module. This phase also
found and fixed two real pre-existing bugs while building the mission's
own required checks, not as separate work: `toPublicVehicleDTO()`'s
fabricated default features list and mileage-allowance fallback (a direct
violation of this module's own anti-fabrication rule, now fixed), and the
website-publish route's use of a client-supplied, spoofable actor identity
in its audit trail (now the real, token-verified requester). One rule is
honestly deferred: VMP10's automated internet catalog-discovery job was
not built, since fabricating a "discovery" result in an environment with no
safe structured-data-fetching capability would itself violate the
mission's absolute anti-fabrication rule -- the ingestion point such a job
would call is real and already gated through the identical Four-Eyes
review used for staff proposals.

Module 16 (Payment Gateway) extends the existing Invoice/Payment/Deposit/
LtoInstallment lifecycle with a unified checkout layer -- PG01-PG09 (the
gateway adapter boundary, never-trust-the-client PaymentIntent amounts,
Idempotency-Key-protected creation, signature-verified and deduplicated
webhooks, the confirmed-effect functions extracted from and shared with
the pre-existing manual finance-entry routes, failure/retry, webhook-
confirmed refunds, gateway-authorization-backed Security Deposit Hold/
Release, and the structural absence of any raw card data) are real,
tested (9 new tests against the real Express app + mocked Firestore, on
top of the full pre-existing 417-test suite -- 426 total, zero
regressions, re-verified against the real Firestore emulator via
`npm test`), and additive to every existing engine (Invoice, Payment,
Deposit, LTO, Idempotency, Audit Trail) per the same "extend, never
duplicate" mandate as every other module. Building this module's own
required test coverage surfaced two real bugs in code written earlier in
this same pass, both fixed before this module was considered complete: an
inverted invoice-status calculation in the refund-reversal path (a fully
refunded invoice was computing `'partially_paid'` instead of `'unpaid'`
because `balanceDue` was checked before `paidAmount`), and a
webhook-terminal-state guard that treated a security deposit's `succeeded`
authorization as final and silently dropped its legitimate subsequent
`canceled` (release) event. One rule is honestly deferred: PG10's actual
live-money-moving integration with a specific real gateway (Stripe/
Checkout.com/Telr/etc.) was not built, since it requires real,
provider-issued production credentials and a business decision on which
gateway Splendor contracts with -- neither exists in this environment, and
each named provider's stub throws a specific, actionable error naming
exactly what production deployment still needs.

Module 17 (Collections & Bank Reconciliation) extends the existing
Financial Engine with a manageable manual-collection layer and a bank-
statement matching engine -- BR01-BR08 (the manageable payment-methods
catalog, manual-payment enrichment with proof/verification status, CSV/
Excel import with a PDF-ready extension point, the five-classification
matching engine plus the "payment not found in the bank" report, the
absolute never-auto-confirm rule, duplicate-detection-requires-override,
reuse of the existing FIN-002 reconcile route, and Document/Storage+Audit
reuse) are real, tested (30 new tests -- pure unit coverage for the
classification engine and the CSV/Excel parsers, plus route-level
supertest coverage against the real Express app + mocked Firestore for
import preview/confirm, duplicate override, and the manual approval flow --
on top of the full pre-existing 426-test suite -- 456 total, zero
regressions, re-verified against the real Firestore emulator via
`npm test`), and additive to every existing engine (Payment, Invoice,
Document/Storage, Audit Trail, FIN-002 reconciliation) per the same
"extend, never duplicate" mandate as every other module. Building this
module's own required test coverage (BR05) surfaced a real, live violation
of this module's own absolute rule in code that predated this mission:
`CRMContext.tsx`'s `runAutoReconciliation()` was silently auto-confirming
every high-confidence suggested match with zero human review, one bank
transaction at a time, in a loop -- fixed by rewriting it into a
non-mutating review-summary function that never calls the reconcile
endpoint. One rule is honestly deferred: BR09's PDF bank statement parsing
was not built, since the mission explicitly asked for CSV/Excel first and
the import layer is already structured (see BR03) so PDF support is a
future addition to the parser layer alone, with zero changes to the
reconciliation engine or its routes.
