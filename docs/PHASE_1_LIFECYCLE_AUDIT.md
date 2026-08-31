# Splendor OS 3.0 — Phase 1 Rental Lifecycle Audit

Date: 2026-09-01
Branch: `splendor-os-3-phase1-lifecycle-audit`

## Scope

Customer → Lead → Quote → Booking → Contract → Payment → Handover → Active Rental → Extension → Return → Inspection → Charges → Final Invoice → Deposit Settlement → Closure → Customer History.

## Existing Coverage Confirmed

- Quotation creation calculates VAT server-side and supports manager approval for discounts above the configured ceiling.
- Quotation → Reservation uses the transactional vehicle availability gate.
- Reservation creation uses `reserveVehicleSlot()` for cross-instance conflict protection.
- Reservation → Contract has an idempotency guard through `reservation.contractId` and creates the contract plus reservation update transactionally.
- Direct Contract creation recalculates pricing from the vehicle record, checks availability, persists contract/vehicle/customer/audit atomically, and supports idempotency.
- Contract Handover requires an allowed operational role, moves the contract to `active`, records handover evidence, and updates the vehicle transactionally.
- Contract Return requires `active`, records return evidence, releases the vehicle, updates maintenance mileage, records additional charges, and audits the return.
- Contract Extension exists as a formal addendum flow and recalculates the contract totals server-side.
- Payment, Deposit, Invoice, Charge, inspection, and financial reconciliation models already exist as shared ledger entities rather than parallel financial systems.

## Findings Requiring Hardening

### F1 — Extension transaction read/write ordering

`POST /api/contracts/:id/extend` reads the vehicle after writing the contract inside the same Firestore transaction. Real Firestore requires transaction reads to occur before writes. This is tracked in Issue #35.

### F2 — `Customer.totalRentals` entry-path inconsistency

Direct contract creation increments `totalRentals`, while handover increments it again. Reservation → Contract does not increment it. The metric therefore depends on the entry path and can double-count direct contracts. This is tracked in Issue #36.

### F3 — Financial closure semantics

Return currently moves a contract to `completed` while additional charges are recorded. The master lifecycle continues conceptually through final invoicing, deposit settlement, and closure. Existing financial entities should be reconciled into one authoritative closure state/flow without inventing accounting rules. This is tracked in Issue #36.

## Design System — Electric Sapphire

The approved luxury accent is **Electric Sapphire `#00AEEF`**. It is deliberately restrained: thin borders, active/selected states, focus indicators, small status/progress cues, and subtle local glow only. Black and neutral tones remain dominant. It must not become a broad page, navigation, or card background.

Central reusable tokens live in `src/index.css`:

- `--splendor-sapphire`
- `--splendor-sapphire-soft`
- `--splendor-sapphire-border`
- `--splendor-sapphire-glow`
- `--splendor-sapphire-focus`

This prevents arbitrary blues from appearing across future screens and keeps the premium visual language calibrated.

## Safety Constraints

- No production `main` changes.
- No deletion of approved functionality.
- No new business thresholds invented.
- Existing Business Rules, RBAC, SoD, idempotency, Firestore transaction, audit, and payment/deposit protections remain authoritative.

## Phase 1 Exit Criteria

1. Fix F1 with a regression test that enforces real transaction read-before-write semantics.
2. Normalize `totalRentals` so both contract-entry paths are consistent and idempotent.
3. Normalize return → invoice → deposit settlement → closure using the existing financial model.
4. Add/extend lifecycle acceptance tests for happy paths and failure paths.
5. Typecheck, full test suite, Firestore security tests, CodeQL, production build, and Vercel preview verification all pass.
