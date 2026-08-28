# Repository Inventory

Produced by the Repository Audit & Architecture Cleanup phase. This is a
factual snapshot of every tracked file in the repository at the time of the
audit — 129 files total — its purpose, what uses it, and its status.

**Status legend:**
- `ACTIVE` — in active use, referenced by other code or the build/deploy
  pipeline, verified by grep for every entry below.
- `LEGACY` — superseded by a newer mechanism but still present; none found
  in this repository.
- `DUPLICATE` — a second copy of another file's content; only the two
  intentional dual-purpose image copies below fall in a related category
  (see their own notes — they are not accidental duplicates).
- `UNUSED` — not used anywhere; not applied to any file below without a
  passing dependency check first.
- `REQUIRES REVIEW` — technically unreferenced by this app's own build/
  runtime, but not deleted because an external system this session cannot
  see might still depend on it. See `DECISIONS-REQUIRED.md`.

Every file below was checked for references via `git grep`/`grep -r` across
`.ts`, `.tsx`, `.json`, `.html`, `.css`, and this repo's own config files
before being marked `ACTIVE`. No file was marked `UNUSED` or `REQUIRES
REVIEW` without that check.

## Root & configuration

| File | Purpose | Used by | Status |
|---|---|---|---|
| `package.json` | Dependency manifest, scripts, `"type": "module"` | npm/bun, CI, Vercel | ACTIVE |
| `bun.lock` | The repository's actual lockfile — Vercel auto-detects Bun as the package manager from its presence (documented in `.github/workflows/ci.yml`) | Bun, Vercel build | ACTIVE |
| `tsconfig.json` | TypeScript compiler configuration | `tsc`, Vite, editors | ACTIVE |
| `vite.config.ts` | Frontend build/dev-server configuration | `vite build`, `vite dev` | ACTIVE |
| `vercel.json` | Deployment rewrites (`/api/*` → serverless function), cron schedule, security headers | Vercel | ACTIVE |
| `firestore.rules` | Firestore security rules | Firebase deploy, `tests/firestore.rules.test.ts` | ACTIVE |
| `.env.example` | Documents required environment variables (never committed with real secrets) | Developers | ACTIVE |
| `.nvmrc` | Pins the Node major version for local dev, CI, and Vercel to resolve identically | nvm, CI | ACTIVE |
| `.gitignore` | Standard ignore rules | git | ACTIVE |
| `.github/workflows/ci.yml` | CI gate — typecheck, full test suite against a real Firestore emulator, production build | GitHub Actions | ACTIVE |
| `README.md` | Project overview | Developers | ACTIVE |
| `index.html` | Vite SPA entry HTML | `vite build` | ACTIVE |
| `metadata.json` | Google AI Studio platform project manifest (name/description/capabilities) | Not referenced anywhere in this app's source, build, or deploy config — only present in `git`'s own index | **REQUIRES REVIEW** — see `DECISIONS-REQUIRED.md` |
| `assets/.aistudio/.gitignore` | Empty scaffold folder from the same AI Studio origin (contains only `*`, i.e. "ignore everything in here") | Not referenced anywhere | **REQUIRES REVIEW** — see `DECISIONS-REQUIRED.md` |
| `server.ts` | The entire Express backend — every `/api/*` route, all business logic, Firestore access via `firebase-admin` (6,906 lines) | `api/index.ts` (Vercel), `npm run dev`, every test file | ACTIVE |
| `api/index.ts` | Vercel serverless function entry point — re-exports `server.ts`'s Express `app` as the handler `vercel.json` routes `/api/*` to | Vercel runtime | ACTIVE |
| `scripts/drDrill.ts` | Disaster-recovery export/import drill (Phase 23.8) — a standalone script, not part of the running app | Run manually via `tsx`, documented in `docs/DISASTER_RECOVERY.md` | ACTIVE |

## Public assets (`public/`) — served at a stable root URL, never bundled/hashed

| File | Purpose | Status |
|---|---|---|
| `public/splendor-logo.png` | Brand logo, referenced by absolute path `/splendor-logo.png` (fallback `<img>` src in `AuthScreens.tsx`, `SplendorLogo.tsx`, and every `fallbackSrc` prop on `<AuthenticatedImage>`) | ACTIVE |
| `public/proud-of-uae-banner.jpg` | UAE National Day dashboard banner, same absolute-path fallback pattern (`DashboardView.tsx`) | ACTIVE |
| `public/apple-touch-icon.png` | iOS home-screen icon | ACTIVE |
| `public/favicon.ico` | Browser tab icon | ACTIVE |

## Bundled assets (`src/assets/`) — imported by React components, bundled/hashed by Vite

| File | Purpose | Status |
|---|---|---|
| `src/assets/splendor-logo.png` | Same image as `public/splendor-logo.png`, byte-identical (confirmed via checksum) — imported directly in `SplendorLogo.tsx` and `AuthScreens.tsx` so Vite bundles and hashes it for cache-busting. **Not an accidental duplicate**: the `public/` copy exists specifically so a stable, un-hashed URL (`/splendor-logo.png`) is available for the `<img onError>` fallback path, which can't reference a bundled import. Both copies are load-bearing. | ACTIVE (intentional dual copy) |
| `src/assets/proud-of-uae-banner.jpg` | Same relationship as above, for `DashboardView.tsx` | ACTIVE (intentional dual copy) |

## `src/server/` — backend business logic (28 modules)

| File | Purpose |
|---|---|
| `persistence.ts` | Durable Firestore write primitives (`createDurable`, `updateDurable`, `deleteDurable`, `runDurableTransaction`, `runDurableBatch`) every other server module builds on |
| `idGenerator.ts` | Atomic, transactional sequential ID issuance for every entity type in the app |
| `dataStore.ts` | The in-memory `DataStore` class hydrated from Firestore at boot — the single source of truth `server.ts`'s routes read from |
| `asyncHandler.ts` | Wraps an async Express route so a rejected promise reaches the error handler instead of hanging the request |
| `idempotency.ts` | Durable `Idempotency-Key` support for duplicate-sensitive mutations |
| `availability.ts` | Transactional vehicle-availability check gating reservation/contract creation |
| `contractOps.ts` | Contract handover/return/extension financial integrity |
| `businessRules.ts` | Governance & Approval Engine (Phase 23) — tiered business-rule storage, versioning, `recordAudit` |
| `approvals.ts` | Four-Eyes / Segregation-of-Duties approval engine for Business Rule changes (Phase 23.2) |
| `anomalyDetection.ts` | Pattern-level anomaly detection over the audit log (Phase 23.6) — extended in Procurement Phase 1 to cover the new entity types, never rebuilt |
| `deadLetterQueue.ts` | Failed-job tracking/retry for notification sends (Phase 23.7) |
| `operationalHealth.ts` | System health checks (Phase 23.7) |
| `notificationEngine.ts` | Notification & WhatsApp Control Center dispatch + monitoring |
| `whatsapp.ts` | WhatsApp Cloud API (Meta) integration |
| `tollFileParsers.ts` | Pure parsers for Salik/Darb toll statement files |
| `tollImportGuard.ts` | Pre-parse hardening for toll statement import |
| `splendorConnectEngine.ts` | AI/Gemini integration engine (AI Studio surface) |
| `procurementApprovals.ts` | Generic Segregation-of-Duties approval engine reused by every Procurement Phase 1 workflow |
| `suppliers.ts`, `purchaseOrders.ts`, `supplierQuotes.ts`, `supplierPayments.ts`, `balances.ts`, `customerRefunds.ts`, `debts.ts`, `employeeCustody.ts`, `supplierInvoices.ts`, `operationalExpenses.ts`, `vehicleReceiving.ts`, `tars.ts`, `lateFees.ts` | Splendor Procurement, Phase 1 — see the phase's own closure report for full detail |

Every file in this directory is imported by `server.ts` (directly or transitively) or by another module in the same directory. None found orphaned.

## `src/components/` — 25 files across `auth/`, `common/`, `fleet/`, `layout/`, `modals/`, `views/`

All 25 component files are imported by at least one other `.tsx` file (verified individually) — `views/*.tsx` are wired into `App.tsx`'s view switch, `modals/*` and `auth/*` are opened from the views/screens that use them, `common/*` are shared primitives (`Badge`, `Modal`, `Toast`, …) imported throughout, and `fleet/VehicleDetailMasterModal.tsx` is opened from `FleetCRMView.tsx`. None found orphaned.

## `src/config/`, `src/context/`, `src/firebase/`, `src/lib/`, `src/i18n/`

| File | Purpose |
|---|---|
| `config/permissions.ts` | Role → view access map, role rank/delegation rules |
| `config/businessRules.ts` | Default Business Rules Engine seed data + permission tiers |
| `config/notificationEvents.ts` | Fixed catalog of notification event types |
| `config/tax.ts` | UAE 5% VAT configuration |
| `config/procurement.ts` | Procurement Phase 1 fixed/starter lists and the two real numeric constants (late-fee timing, TARS deadline) |
| `context/AuthContext.tsx`, `context/CRMContext.tsx`, `context/LanguageContext.tsx` | App-wide React state (auth session, all CRM data + mutations, EN/AR language) |
| `firebase/config.ts`, `firebase/errorHandling.ts`, `firebase/firestoreService.ts` | Client Firebase SDK setup, error normalization, collection subscription helper |
| `lib/apiFetch.ts` | `fetch` wrapper attaching the Firebase ID token to every `/api/*` call |
| `lib/dateFormat.ts` | Centralized DD/MM/YYYY date formatting |
| `lib/tollCalculations.ts` | Salik/Darb toll pricing math |
| `lib/upload.ts` | Client-side file upload helper (base64 → `/api/upload`) |
| `i18n/translations.ts` | EN/AR translation dictionary |

All ACTIVE, all referenced — verified individually.

## `src/types/index.ts` and top-level `src/` files

`src/types/index.ts` (1,821 lines) is the single shared type-definition file for the entire app, imported everywhere. `src/App.tsx` (view router), `src/main.tsx` (React entry point), `src/index.css` (global styles), `src/vite-env.d.ts` (Vite's ambient type declarations) — all ACTIVE, all standard for this stack.

## `tests/` (15 files)

One test file per major subsystem (authorization, core workflows, data retention, dead-letter queue, document access, durable persistence, Firestore rules, governance engine, mass assignment, procurement, toll file parsers, toll import security, VAT calculations, WhatsApp webhook, anomaly detection). All run in CI. 249 tests total, all passing as of this audit.

## `docs/`

`DATA_RETENTION.md` and `DISASTER_RECOVERY.md` (Phase 23.9/23.8) — the established precedent this audit's new documentation follows.
