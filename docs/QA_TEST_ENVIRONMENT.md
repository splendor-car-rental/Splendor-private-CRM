# QA Test Environment

Added for the Phase 1 Final QA & Browser Verification pass. Documents how
to run this app against **local Firebase emulators** instead of the real
production project, so a real browser session can be verified end-to-end
without ever touching real Auth users, real Firestore data, or real
Storage files.

## How it works

Two small, strictly opt-in branches were added — both fully inert unless
their trigger env var is explicitly set, and both verified (typecheck,
full test suite, production build) to leave default/production behavior
byte-for-byte unchanged:

- **Client** (`src/firebase/config.ts`): when `VITE_USE_FIREBASE_EMULATORS=true`
  is set at build/dev time, the Firebase client SDK connects to
  `127.0.0.1:9099` (Auth) and `127.0.0.1:8080` (Firestore) instead of the
  real production project. Unset (always true in production), this branch
  doesn't run.
- **Server** (`server.ts`'s `initFirebaseAdmin()`): when
  `FIRESTORE_EMULATOR_HOST` is set — the standard signal every Firebase
  Admin SDK already recognizes — `admin.initializeApp()` is called with
  only a demo `projectId`, no real service-account credential needed. Unset
  (always true in production), the existing `FIREBASE_SERVICE_ACCOUNT_KEY`
  path runs exactly as it did before this change.

## Known limitation: Storage is not emulated here

The Firebase **Storage** emulator's rules-runtime component requires a
one-time download from `firebase-public.firebaseio.com`, which this
session's organization egress policy blocks (confirmed: a 403 policy
denial, not a transient failure). Per this environment's own operating
rules, a blocked host is reported, never routed around. Practically: this
QA environment can verify every workflow that reads/writes Firestore or
Auth through a real browser, but **cannot** verify actual file upload/
download (`POST /api/upload`, `GET /api/documents/file`) end-to-end,
since both ultimately touch Firebase Storage. See the Phase 1 QA closure
report for exactly what this affected.

## Running it

**The emulator project ID must be `splendor-private-crm`** — the exact
`projectId` hardcoded into `src/firebase/config.ts`'s `firebaseConfig`. The
Firestore/Auth emulator partitions data by project ID internally, so
starting it under any other demo project ID (e.g. `demo-splendor-audit`,
used in an earlier draft of this doc) silently puts the client and the
seed data in two different, mutually invisible namespaces: login succeeds
but the client's `getDoc(users/{uid})` finds nothing, and every signed-in
user is stuck on the "Access Pending" screen even though `users/{uid}`
plainly exists when queried directly against the emulator's REST API.
This is not a permissions error and prints no console warning, so it's
easy to misdiagnose as a hydration bug rather than a project-ID mismatch
— confirmed the hard way during the Blocklist/Watchlist QA pass.

```bash
# 1. Start Auth + Firestore emulators, project ID MUST match firebaseConfig.projectId
npx firebase emulators:start --project splendor-private-crm --only auth,firestore

# 2. Seed at least one QA user per role (Auth user + matching users/{uid} Firestore doc)
node scripts/qaSeed.mjs

# 3. Start the backend AND frontend together against the emulators (server.ts's
#    dev-mode Vite middleware serves both from one process/port)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=splendor-private-crm \
VITE_USE_FIREBASE_EMULATORS=true \
npx tsx server.ts
```

`scripts/qaSeed.mjs` and `scripts/qaBlocklistVerify.mjs` (a real-Chromium
Playwright script, run via `node scripts/qaBlocklistVerify.mjs` once the
server above is up) are checked-in QA-only tooling — never invoked in
production or in `npm test`. `playwright` is a devDependency for exactly
this purpose.

**Never** set `VITE_USE_FIREBASE_EMULATORS` or `FIRESTORE_EMULATOR_HOST`
in a real deployment (Vercel) environment — doing so would point the
production app at a local emulator with no data in it.
