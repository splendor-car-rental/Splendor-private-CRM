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
**STATUS**: **IMPLEMENTED (this session)** — see §Implementation below.

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
**STATUS**: **IMPLEMENTED (this session)** — adapter boundary + mock adapter built; no real vendor wired (by design — none is available/approved).

### RULE-K03 — Configurable eligibility engine: age vs. vehicle class
**REQUIREMENT**: A configurable minimum-age-per-vehicle-class rule (default: 21 standard, 25 for a configurable "restricted" class list) blocks booking confirmation when violated.
**RATIONALE**: Blueprint REQ-BP02-2. Business policy, not verified law — kept configurable via the Business Rules Engine rather than hard-coded, per this mission's explicit legal-caution instruction.
**LEGAL STATUS**: BUSINESS_REQUIREMENT (insurance/risk policy), not asserted as a legal minimum.
**ACCEPTANCE CRITERIA**: Booking confirmation for a restricted-class vehicle is rejected if customer age (from DOB) is below the configured threshold; the threshold and restricted-class list are both editable without a code change.
**SECURITY**: Server-side enforcement only; never trust a client-supplied "eligible" flag.
**FINANCIAL**: Prevents an ineligible rental that could void insurance coverage.
**EXTERNAL DEPENDENCIES**: None.
**VERIFICATION METHOD**: Emulator test with a rule-value change confirming the threshold takes effect immediately (same pattern as this session's CONFIG-002 test).
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-K04 — License-origin and validity matching
**REQUIREMENT**: A configurable list of exempt license-issuing countries (accepted without an International Driving Permit) gates booking confirmation for non-UAE-licensed drivers; anyone not on the list requires an IDP reference recorded before confirmation.
**LEGAL STATUS**: LEGAL_VERIFICATION_REQUIRED — the exact current exempt-country list must be confirmed against RTA's published list before being treated as authoritative; shipped as an editable starter list, not a hard-coded legal claim.
**STATUS**: **IMPLEMENTED (this session)** — engine + editable starter list; list contents flagged for legal verification, not asserted as legally confirmed.

### RULE-K05 — Document-expiry-vs-rental-period check
**REQUIREMENT**: Booking confirmation is blocked (or truncated to the document's valid window) if a visa or license would expire before the rental ends.
**STATUS**: **IMPLEMENTED (this session)**.

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
**STATUS**: **IMPLEMENTED (this session)** — data model + manual-entry workflow (the only honest option absent an RTA/Police feed).

### RULE-F02 — Customer notification on new fine
**STATUS**: **IMPLEMENTED (this session)** — WhatsApp notification on fine recording, reusing the existing notification engine.

### RULE-F03 — Fine settlement against deposit/outstanding balance
**STATUS**: **IMPLEMENTED (this session)** — reuses the existing Debt/charge settlement pattern (`debts.ts`) rather than inventing a parallel one.

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
**STATUS**: **IMPLEMENTED (this session)** — data model + a mock location-feed adapter for testing; no real telematics feed.

### RULE-G03 — Two-tier alert protocol
**REQUIREMENT**: Level 1 (speed/zone advisory) → automated WhatsApp reminder; Level 2 (danger — border/restricted zone) → operations-center alert.
**STATUS**: **IMPLEMENTED (this session)** — the alert *logic and dispatch* (reusing the live WhatsApp channel), driven by the mock feed for now; wiring a real feed only requires swapping the adapter (RULE-G01 remains the blocker for that swap).

### RULE-G04 — Last-known-location retention on signal loss
**STATUS**: **IMPLEMENTED (this session)** — logic exists in the same module; inert until a real feed exists.

### RULE-G05 — VIP location-data access restriction
**STATUS**: **IMPLEMENTED (this session)** — access-control check on any location read, restricted to `ceo`/`admin`/`operations`, matching the Blueprint's own privacy answer.

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

### RULE-M01 — Mileage/time-based maintenance thresholds, configurable
**REQUIREMENT**: Per-vehicle (or per-class default) maintenance thresholds (oil/filter km interval, tire/brake inspection interval, cosmetic-detail time interval) are stored and editable via the Business Rules Engine, not hard-coded.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-M02 — Auto-transition to maintenance status + booking block
**REQUIREMENT**: When a vehicle's accumulated mileage crosses its threshold, the server automatically sets its status to `maintenance`, which `availability.ts` already honors as a hard booking block.
**DEPENDENCIES**: RULE-M01; the existing `'maintenance'` status check in `src/server/availability.ts:76`.
**STATUS**: **IMPLEMENTED (this session)**.

### RULE-M03 — Pre-threshold workshop-manager alert
**STATUS**: **IMPLEMENTED (this session)** — configurable "alert N km before threshold" via the same rules engine, dispatched over WhatsApp.

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
**REQUIREMENT**: A regular staff member cannot apply a discount above a configurable ceiling (default 5%) without a separate, SoD-compliant sales-manager approval.
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

| Module | Rules | Implemented (pre-existing) | Implemented (this session) | Deferred/Blocked (documented, not built) |
|---|---|---|---|---|
| 01 Contracts | 6 | 2 | 1 | 3 |
| 02 KYC | 6 | 1 | 4 | 1 |
| 03 Blocklist | 5 | 0 | 5 | 0 |
| 04 Salik | 3 | 1 | 0 | 2 |
| 05 Fines | 5 | 0 | 3 | 2 |
| 06 Deposit | 5 | 2 | 0 | 3 |
| 07 Geofencing | 5 | 0 | 4 | 1 |
| 08 Inspection | 4 | 0 | 0 | 4 |
| 09 Maintenance | 5 | 0 | 3 | 2 |
| 10 Reservation | 5 | 2 | 2 | 1 |
| 11 Pricing | 3 | 0 | 1 | 2 |
| 12 Governance | 4 | 2 | 1 | 1 |
| **Total** | **56** | **10** | **24** | **22** |

24 rules were implemented in this session, on top of 10 already-real
pre-existing ones — 34 of 56 (61%) now have genuine, evidenced
implementation. The 22 deferred rules are each explicitly reasoned above,
not silently dropped: external/hardware dependency (9), a material
financial-policy question awaiting the user (RULE-D04/D05, 2), or a
deliberate choice not to half-build a large, coherent feature in a rushed
pass (RULE-P02/P03, RULE-I01-04, RULE-M04/M05, RULE-R05, RULE-C05/C06, 11).

See the Implementation Report (end of this session's reply) for exact
file/commit evidence per "this session" item.
