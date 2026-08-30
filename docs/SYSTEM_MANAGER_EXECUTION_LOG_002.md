# SPLENDOR PRIVATE CRM — SYSTEM MANAGER EXECUTION LOG #002

Date: 2026-08-30
Branch: `hardening/production-100`
Base: `claude/vercel-firestore-deploy-jf4kqr`
Base commit: `07c6bb4e1e4763fa22d98fdec5d380c13a49098b`

## 1. Source-of-truth correction

The previously reviewed integration branch was not the latest feature-bearing source.
The `claude/vercel-firestore-deploy-jf4kqr` branch is 38 commits ahead of `main` and contains the intended recent feature work, including:

- Lease-to-Own UI and server engine
- Vehicle Master Profile / enhanced vehicle management
- Vehicle catalog and classification
- Vehicle inspections and maintenance
- Security blocklist
- WhatsApp Inbox/conversation engine
- Collections and bank reconciliation
- Procurement expansion
- Payment gateway architecture
- Audit integrity and operational health

This branch is therefore the correct baseline for the hardening program.

## 2. Lease-to-Own confirmation

Lease-to-Own is present in the feature-bearing source:

- `src/components/views/LeaseToOwnView.tsx`
- `src/server/leaseToOwn.ts`
- `src/server/leaseToOwnPolicy.ts`
- `src/server/leaseToOwnContractDocument.ts`
- `tests/leaseToOwn.test.ts`
- `tests/leaseToOwnPolicy.test.ts`
- `tests/leaseToOwnContractDocument.test.ts`

It is also wired into `src/App.tsx` and `src/config/permissions.ts` under `lease-to-own`.

## 3. Security hardening implemented in this checkpoint

### Firestore

The browser-facing Firestore boundary was changed to:

- provisioned staff may read explicitly-listed CRM collections;
- business writes are server-authoritative through Firebase Admin SDK;
- critical collections explicitly deny client writes;
- audit logs deny client writes;
- Lease-to-Own collections explicitly deny client writes;
- user profile creation/deletion is denied from the browser;
- self-profile updates are limited to `name`, `nameAr`, `phone`, and `avatar`.

No recursive catch-all rule exists.

### CI

CI is pinned to Bun `1.4.0` because the feature-bearing branch contains Bun lockfile v2. Frozen installation remains enabled. JDK 21 remains pinned for the Firestore emulator.

## 4. What was NOT changed

- `main`
- Production Vercel deployment
- Production Firestore data
- Firebase Authentication users
- Firebase secrets
- Vercel environment variables
- Existing vehicle/customer/financial records

## 5. Vehicle data

The requested 11 real vehicles are not hard-coded in the Git repository. Their actual production records are expected to live in Firestore/application data. This checkpoint does not fabricate vehicle identifiers, plates, VINs, costs, financing, or registration data. The next data-verification step must confirm the 11 real records through the authorized application/Firebase environment before any migration or seed action is considered.

## 6. Next engineering gates

1. Add/expand adversarial Firestore rules tests.
2. Close the unauthenticated production test-runner path and add regression coverage.
3. Audit every direct Firestore read/write call against the new rules.
4. Harden plate assignment into a Firestore transaction.
5. Complete upload/KYC authorization hardening.
6. Remove remaining critical process-local business state.
7. Complete dependency audit and remove obsolete vulnerable spreadsheet dependency where safe.
8. Verify real Firebase backup/PITR and staging restore drill.
9. Verify the 11 real fleet records through the authorized runtime, without fabricating data.
10. Run full CI and production build.
11. Produce Audit #002 with evidence-backed scores.

## Decision

This checkpoint establishes the correct feature-complete source and begins the security hardening on an isolated branch. No production merge is authorized by this log.
