# Disaster Recovery — RPO/RTO (Phase 23.8)

## Targets (approved 2026-08-28)

- **RPO ≤ 24 hours** — worst case, no more than a day of data is ever lost.
- **RTO ≤ 4 hours** — worst case, the app is back up within four hours of an incident being declared.

These are explicitly **initial minimum targets, not permanent upper limits** — tighten them once the business has operated against them for a while.

## What this document is, and isn't

This is an honest status report, not a compliance certificate. Read the "Verified vs. not verified" section before trusting any number below.

## Architecture as it actually exists today

- **Database**: Google Cloud Firestore, project `splendor-private-crm` (see `src/firebase/config.ts`). All business data — customers, vehicles, contracts, invoices, payments, deposits, audit logs, business rules — lives here. `firebase-admin` (server-side) is the only writer; the client SDK only subscribes for real-time reads.
- **Compute**: Vercel serverless functions (`api/index.ts` → `server.ts`). Stateless — a Vercel outage or redeploy loses nothing, because nothing durable lives outside Firestore.
- **File storage**: Firebase Storage (avatars, customer KYC documents), same project.
- **No application-level backup code exists in this repository.** Firestore backup/recovery (scheduled exports or Point-in-Time Recovery) is a **GCP project-level configuration**, not something `server.ts` or any file in this repo turns on. If it isn't already enabled on the real `splendor-private-crm` project, RPO today is effectively "whatever Firestore's own default retention gives you" — which is not the same as "24 hours, verified."

## Verified vs. not verified

**This coding session has no `gcloud`/Firebase CLI authentication, no GCP IAM access, and no credentials for the real `splendor-private-crm` project or any staging project.** That is a hard boundary, not an oversight — confirmed by checking for `gcloud`/`firebase` CLI auth and any project credentials in this environment before writing this document, and finding none. Concretely:

| Question | Status |
|---|---|
| Does the real production Firestore project have scheduled backups or PITR enabled? | **NOT VERIFIED** — no access to check. Someone with IAM access on `splendor-private-crm` must confirm this (see below). |
| Can a real backup be restored into a real staging project within 4 hours? | **NOT VERIFIED** — no staging project or credentials available to test this. |
| Does this app's *data model* survive an export → cold-start → import cycle with zero data loss? | **VERIFIED** — see `npm run dr:drill` and the real run below. |
| Is there an automated retry/dead-letter path for failed background WhatsApp sends? | **VERIFIED** — Phase 23.7, unrelated to Firestore backup but part of overall resilience. |

**Bottom line: RPO ≤ 24h and RTO ≤ 4h are the approved targets, not a demonstrated fact.** Whoever has IAM access to the `splendor-private-crm` GCP project needs to do the two things below before either number can honestly be called "met."

## Action required (outside this repository, by someone with GCP IAM access)

1. **Enable scheduled Firestore backups** (this is what actually determines RPO):
   ```bash
   gcloud firestore backups schedules create \
     --database='(default)' \
     --recurrence=daily \
     --retention=7d \
     --project=splendor-private-crm
   ```
   Daily backups give an RPO of ≤24h by construction. If a tighter RPO is ever needed, Firestore also supports Point-in-Time Recovery (continuous, ~last 7 days) — a different, additive feature, enabled via `gcloud firestore databases update --enable-point-in-time-recovery`.

2. **Run one real restore drill against an isolated staging project** (never production) to establish a real RTO number:
   ```bash
   # List available backups
   gcloud firestore backups list --project=splendor-private-crm

   # Restore into a SEPARATE staging project — never back into production
   gcloud firestore databases restore \
     --source-backup=<backup-name-from-above> \
     --destination-database='(default)' \
     --project=splendor-crm-staging
   ```
   Time the whole exercise end-to-end (declare-incident → get access → restore → verify → cut traffic over) with a clock running, the same way an actual incident would be timed. That number, not this document's local drill, is the real RTO.

## What IS safely testable from this repository — the local drill

`npm run dr:drill` (`scripts/drDrill.ts`) spins up two throwaway, local-only Firestore emulator instances (never a real project, never real data) and proves the **mechanism** works:

1. Starts a fresh emulator, seeds synthetic documents across every core collection (customers, vehicles, contracts, business rules, audit logs).
2. Exports the data (the "backup" step).
3. Kills the emulator entirely (simulated outage).
4. Cold-starts a brand-new emulator instance, importing the export (the "restore" step).
5. Reads every seeded document back and verifies it matches exactly.
6. Reports timing for every step, and exits non-zero if anything doesn't match.

This is the one thing this session *can* honestly verify: that the application's own data shapes survive an export/import cycle without silent loss or corruption. It says nothing about real GCP backup schedules or real-world incident response time — see the table above.

### A real run's output (2026-08-28, this repository, this exact code)

```
=== Disaster Recovery Drill (Phase 23.8) ===
Project: dr-drill-1787906751504 (throwaway, local-only) | Firestore emulator port: 8098
This never touches real production data or a real GCP project.

[dr-drill] [1/6] Starting a fresh, isolated Firestore emulator...
[dr-drill] [2/6] Seeding synthetic data across every core collection...
[dr-drill]       Seeded 6 documents across 5 collections.
[dr-drill] [3/6] Exporting the emulator's data (this is the "backup" step)...
[dr-drill] [4/6] Simulating an outage: stopping the emulator entirely...
[dr-drill] [5/6] Cold-starting a NEW emulator instance and importing the export (the "restore" step)...
[dr-drill] [6/6] Verifying every seeded document survived the round-trip intact...

=== Results ===
Emulator start:                75 ms
Seed 6 documents:              1072 ms
Export ("backup"):             152 ms
Teardown (simulated outage):   1502 ms
Cold start + import ("restore"): 8 ms
Verification read-back:        135 ms
--> Mechanism-level restore time: 1510 ms (1.5s)
    NOTE: this is ONLY the data-restore mechanism on a trivial dataset.
    It is NOT the real production RTO -- see docs/DISASTER_RECOVERY.md.

✅ All 6 documents survived the export/import cycle with no data loss.
```

Caveat on the "cold start + import" number specifically: readiness is measured as "the emulator's HTTP port responds," which can be a few milliseconds ahead of the import fully applying for a very small dataset. The verification step passing (step 6) is the real proof the import completed correctly — the 8ms figure is an approximate lower bound, not a calibrated benchmark, and will not hold at production data volumes.

Run it any time with:
```bash
npm run dr:drill
```

## Recommended runbook once real GCP-level backups exist

1. **Detect** — a Firestore outage or corruption is noticed (via `GET /api/health/detailed`'s Firestore probe — Phase 23.7 — or a direct GCP alert).
2. **Declare** — CEO/Admin confirms this is a real incident, not a transient blip.
3. **Identify the restore point** — `gcloud firestore backups list`, pick the most recent good backup (worst case, up to 24h old per the RPO target).
4. **Restore into a clean staging project first** — never directly into production. Verify the restored data looks sane (spot-check recent contracts/payments).
5. **Cut over** — repoint the production Firebase config (`src/firebase/config.ts` / environment variables) to the restored database, or restore in-place into production once the staging verification passes.
6. **Verify** — run `npm test`'s Firestore-dependent suites against the restored database, spot-check the Governance & Approvals audit trail for the last known-good state, confirm `GET /api/health/detailed` reports healthy.
7. **Resume** — lift any Emergency Kill Switches (Phase 23.4) that were flipped on during the incident, post-mortem afterward.

Every step from 3 onward should be timed; total time from step 2 to step 7 is the real RTO measurement.
