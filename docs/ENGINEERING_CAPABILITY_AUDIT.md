# Project Engineering Capability Audit & Maximum Cloud Utilization

Audit and discovery only. No new phase, no business decisions executed, no
destructive changes, no file deletions, no production changes, no security
rules changes, no database structure changes. Where something needs a
business decision, it is logged in `DECISIONS-REQUIRED.md`, not decided
here.

---

## 1. Full environment inspection

- **Repository**: `splendor-car-rental/Splendor-private-CRM`, single Vite + Express monorepo (no separate backend repo). Git history is linear, on branch `claude/vercel-firestore-deploy-jf4kqr`, tracking `origin`. `main` is the default/production branch.
- **GitHub integration**: `.github/workflows/ci.yml` runs on every push/PR to any branch — Node pinned via `.nvmrc`, dependencies installed with `bun install --frozen-lockfile` (bun.lock is the real lockfile despite `package.json`'s `npm`-shaped scripts), a real JDK 21 for the Firestore rules-emulator test run, `tsc --noEmit`, the full test suite, the production build, and a sanity check that `dist/server.cjs` and `dist/index.html` are non-empty. Concurrency is set to cancel superseded runs.
- **Build system**: Vite 6 (frontend) + esbuild (bundles `server.ts` to `dist/server.cjs`, CJS, external packages, with sourcemaps). `npm run start` runs the bundled server directly — this is what Vercel's Node runtime executes.
- **Frontend**: React 19, Tailwind 4 (via `@tailwindcss/vite`), `lucide-react` icons, `motion` for animation, `clsx`/`tailwind-merge` for class composition. No router library — navigation is state-driven (`activeView` in `CRMContext`), not URL-addressable.
- **Backend**: a single Express app in `server.ts` (~7,000 lines), with domain logic factored into `src/server/*.ts` modules (suppliers, purchase orders, approvals, balances, debts, TARS, late fees, WhatsApp, anomaly detection, dead-letter queue, business rules, idempotency, and more).
- **Database**: Firestore, single project (`splendor-private-crm`), accessed server-side via `firebase-admin` (the only writer — see §7) and client-side via `firebase` SDK read-only `onSnapshot` listeners.
- **Auth**: Firebase Authentication (email/password). The server verifies every `/api/*` request's ID token itself (`requireAuth`); it does not trust any client-supplied role or UID.
- **Authorization**: a `requireRole(...)` gate on essentially every mutating route, backed by the user's own Firestore `users/{uid}.role` document (server-fetched, not client-supplied). A universal Segregation-of-Duties check (`approvals.ts`, `procurementApprovals.ts`) additionally blocks a requester from deciding their own request, independent of role.
- **APIs**: REST, all under `/api/*`, Express route handlers, `asyncHandler`-wrapped for uniform error handling.
- **File storage**: Firebase Storage is configured (`storageBucket: 'splendor-private-crm.firebasestorage.app'`) but was not reachable for real-browser testing in this sandbox (see the QA report, §9/§14) — its access-control code was not exercised in this pass.
- **Documents**: no centralized document-architecture module; document IDs are stored as string-array fields on owning records (`documentIds`, `agreementDocumentIds` on Suppliers, etc.) pointing at Storage paths.
- **Testing**: Vitest, 15 test files, 249 tests, run inside a real Firestore rules-emulator (`firebase emulators:exec`) with `firebase-admin` mocked per-file with a hand-rolled in-memory store (see the QA report's central finding: this mock is more lenient than real Firestore about `undefined` values).
- **Deployment**: Vercel (`vercel.json`: API rewrite, one cron for `/api/notifications/run-checks` every 6 hours, and a solid security-header set — `X-Content-Type-Options`, `X-Frame-Options: DENY`, HSTS with preload, a locked-down `Permissions-Policy`).
- **Env vars**: documented in `.env.example` — `GEMINI_API_KEY`, `APP_URL`, `FIREBASE_SERVICE_ACCOUNT_KEY` (required; server fails closed without it), and five `WHATSAPP_*` vars (all optional — the app degrades gracefully to `not_configured` rather than pretending to send).
- **Integrations**: Gemini AI (`@google/genai`, used for the "AI Intelligence"/executive-brief features), WhatsApp Cloud API (Meta), and nothing else — no payment gateway, no banking API, no RTA API, no Odoo/accounting-system connector exist anywhere in the code (verified by repo-wide search — see §17).
- **Logging**: `console.log`/`console.warn`/`console.error`, structured by convention (`[auth]`, `[hydrate]`, `[unhandled error] METHOD path: ...`) — no external log aggregation (no Sentry/Datadog/etc. wired in).
- **Monitoring/audit trail**: purpose-built modules from prior phases — `operationalHealth.ts` (health/monitoring), `deadLetterQueue.ts` (failed-job capture), `anomalyDetection.ts`, plus a universal audit-trail write (`recordAudit`) called from essentially every mutating route.
- **Error handling**: a global `asyncHandler` wrapper on every route plus a top-level unhandled-rejection/exception logger (Phase 8 of the original remediation) — nothing crashes the whole process on one bad request; see §8 for a gap this pass found in that same layer.
- **Performance**: no APM, no query-cost dashboard; the single largest frontend bundle chunk is flagged by Vite itself as over 500kB (see §19).
- **Security**: `firestore.rules` (149 lines) plus the server-side authorization already described; `xlsx` was previously patched for a known CVE (Phase 11 of the original remediation).
- **Existing automation/tooling**: `scripts/drDrill.ts` (a scripted Disaster Recovery drill, Phase 23.8), the emulator-based test harness, and the CI workflow above — no other bots, cron scripts, or automation exist beyond what's described here.

## 2. Capability Inventory

| Capability | Available now | How it can help Splendor | Currently used? | Potential use | Risk | Needs approval? |
|---|---|---|---|---|---|---|
| Code generation | Yes | New features, routes, UI screens | Yes (all of Procurement P1) | Any future feature build | Low, if reviewed before merge | No, for code; Yes, for any new business rule it encodes |
| Code modification | Yes | Bug fixes, refactors | Yes (Bug #6 fix, this pass) | Ongoing maintenance | Low if scoped and tested | No |
| Repository analysis | Yes | Find dead code, unused types, architecture gaps | Yes (this audit; FIN-002 dead-code find) | Recurring health checks | None — read-only | No |
| Dependency analysis | Yes | Spot outdated/vulnerable packages | Partially (manual `npm audit`, blocked by lockfile mismatch this run — see §19) | Wire into CI | Low | No |
| Refactoring | Yes | Improve structure without behavior change | Not requested/performed this session | On request, scoped | Medium if not test-backed | Yes, for anything touching business logic |
| Automated testing | Yes | Catch regressions before merge | Yes — 249 tests, gates CI | Expand coverage further | Low | No |
| Test generation | Yes | Write new unit/integration tests | Yes, throughout prior phases | Cover new gaps this audit found (§11) | Low | No |
| API testing | Yes | Exercise real HTTP routes | Yes (supertest in the suite; direct fetch replay in this QA pass) | Add to more routes | Low | No |
| Database testing | Yes, via Firestore emulator | Catch real-Firestore-only bugs (exactly what found Bug #6) | Newly demonstrated this pass | Should become a standard pre-merge step, not a one-off QA exercise | Low | No — recommend adopting, not a business decision |
| Browser/UI verification | Yes, via Playwright + a real Chromium binary | Confirm features actually work end-to-end, not just pass mocked tests | Newly demonstrated this pass (Procurement QA) | Regular regression pass before releases | Low | No |
| Security review | Yes | Find auth/authz/exposure gaps | Yes, repeatedly (original remediation Phases 6/12/13/19, and §5 below) | Recurring | None — read-only unless fixing | Fixes to Critical/High: show first, per this task's own rule |
| Performance analysis | Yes | Spot slow queries, large bundles | Yes (§19) | Prioritize optimization work | None — read-only | No |
| Error detection | Yes | Find bugs via static + dynamic analysis | Yes (Bug #6) | Ongoing | None — read-only | No |
| Static analysis | Yes (`tsc`, grep-based review) | Type safety, dead-code detection | Yes, in CI (`npm run lint`) and this audit | Add a linter (ESLint) — none currently configured | Low | No |
| Build verification | Yes | Confirm the app still builds | Yes, in CI and every checkpoint this session | Keep as-is | None | No |
| Git checkpointing | Yes | Small, reversible, well-described commits | Yes, this entire session's working style | Keep as-is | None | No |
| Git rollback | Yes (`git revert`/reset) | Undo a bad change safely | Not needed this session | Available if ever needed | Medium if done carelessly on shared branches | Yes, before any destructive git op on a shared branch |
| Deployment | Yes (Vercel is already wired) | Ship approved changes | Not performed by this session (explicitly out of scope) | On explicit request only | High if done to production without review | **Yes, always, for production** |
| Environment management | Yes (this sandbox: local emulators, isolated scratch installs) | Safe testing without touching prod | Yes, this entire QA pass | Standard practice going forward | None, when scoped like this pass was | No |
| Documentation | Yes | Explain architecture, decisions, runbooks | Yes (`docs/`, `DECISIONS-REQUIRED.md`) | Keep growing as source of truth | None | No |
| Architecture analysis | Yes | Find structural risks | Yes (§4) | Recurring | None — read-only | No |
| API integration | Yes, for anything with credentials | Wire in a real external service | WhatsApp/Gemini already wired; nothing else is | New integrations (banks, RTA, etc.) | Depends entirely on the specific integration | Yes, always, before any new external integration touches real data |
| Data migration | Yes, but not exercised this session | Move/reshape stored data safely | No | Only with an explicit, reviewed migration plan | High if not backward-compatible or tested | **Yes, always** |
| Firestore analysis | Yes | Understand collections, query patterns | Yes (§7) | Ongoing | None — read-only | No |
| Permission analysis | Yes | Confirm role gates actually work | Yes (this pass and the QA pass) | Recurring, per new feature | None — read-only unless fixing | No |
| Audit-trail verification | Yes | Confirm actions are actually logged | Partially (spot-checked; not exhaustively swept this pass) | A full sweep is a good next audit item | None — read-only | No |
| File/document architecture | Yes, as design review | Propose a scalable structure | Reviewed conceptually (§10); Storage itself untestable here | A real proposal needs Storage access this sandbox didn't have | None to propose; Medium to migrate existing files | **Yes, before moving anything** |
| Backup/recovery validation | Yes | Confirm restore actually works | Yes — `scripts/drDrill.ts` already exists from Phase 23.8 | Run it periodically, not just once | None — it's a drill against non-prod data | No, to run the drill as designed |
| Monitoring | Yes, to build; partial today | Catch failures automatically | Partially — `operationalHealth.ts`/`deadLetterQueue.ts` exist; no external alerting | Wire outbound alerts (email/WhatsApp/Slack) on top of what already exists | Low to add, given the data already exists | No, to read the existing signal; Yes, to add a new outbound alert channel |
| Logging | Yes | Diagnose issues after the fact | Yes, throughout the server | Structured/centralized logging (e.g. one JSON log line per request) would help more than console text | Low | No |
| Integration testing | Yes | Confirm modules work together | Yes, in the 249-test suite | Keep expanding | None | No |
| Regression testing | Yes | Confirm old features still work after a change | Yes, CI gate on every push | Keep as-is | None | No |
| E2E testing | Yes, demonstrated this pass | Confirm real user flows work in a real browser | Newly demonstrated; not yet a standing CI step | Add a scheduled (not per-commit) E2E run against a staging environment | Low | No |
| Accessibility | Yes, to review | Confirm the app is usable by everyone | Not audited this session | A dedicated pass would be valuable | None to review | No |
| Responsive UI testing | Yes | Confirm the app works on tablet/mobile widths | Not exercised this session (only desktop 1440×900) | Worth a dedicated pass | None | No |
| Browser compatibility | Yes, if given other browser binaries | Confirm consistent behavior across engines | Only Chromium available/tested in this sandbox | Would need Firefox/WebKit binaries this environment doesn't have | None | No |
| Code quality analysis | Yes | Consistency, dead code, complexity hotspots | Yes, ongoing informally; no dedicated linter/formatter configured | Add ESLint + Prettier configs | Low | No |
| Dependency/security vulnerability analysis | Yes, tooling exists but wasn't runnable this session | Catch known-CVE packages before they ship | `npm audit` failed here because `bun.lock` (the real lockfile) isn't what `npm audit` reads; `bun audit` or a lockfile-aware scanner would work | Add a dependency-audit step to CI | Low | No |

## 3. Hidden capabilities disclosed regardless of prior ask

Nothing above was withheld for not being explicitly requested before. The two capabilities most worth calling out precisely because they weren't asked for by name until this audit: (a) **real database testing against a Firestore emulator** — this is what caught Bug #6, and would have caught it months ago if it were a standing part of the test suite instead of a one-off QA exercise; and (b) **real browser E2E verification with a pre-installed Chromium binary** — nothing in this repository's own tooling does this today; it only happened because this audit's sibling QA task asked for it directly.

## 4. Architecture Review

**Strengths**: server-authoritative persistence (the client never writes to Firestore directly for core entities — Phase 1 of the original remediation); a genuine, reusable Segregation-of-Duties primitive (`approvals.ts` / `procurementApprovals.ts`) used consistently across both the original Governance Engine and all of Procurement P1; atomic ID issuance (`idGenerator.ts`) preventing ID collisions under concurrency; idempotency keys on critical mutations (Phase 7); a real audit trail on essentially every write.

**Weaknesses / technical debt**:
- No client-side router — navigation state lives in `CRMContext`, so there is no deep-linking, no browser back/forward support, and no way to bookmark a specific screen. This is a real UX limitation, not just a technical one.
- No ESLint/Prettier — style and correctness patterns (like the `undefined`-spreading pattern behind Bug #6) rely entirely on human/AI review catching them, not a tool.
- `server.ts` is a single ~7,000-line file. Domain logic is well-factored into `src/server/*.ts`, but the route-registration layer itself is one large file, which makes it easy for two unrelated routes to drift in how they handle the same kind of input (exactly what happened with the `undefined`-field pattern — some routes might handle it correctly, others might not; this audit fixed the *general* case via `ignoreUndefinedProperties`, not by hunting every route individually).
- The mocked `firebase-admin` test double (repeated once per test file, not shared) is more lenient than real Firestore in at least one dimension (`undefined` values) that already caused a real production-shaped bug to hide behind 100% green tests. Any other divergence between the mock and real Firestore semantics is an unknown risk of the same shape until it's specifically checked.

**Duplicate systems**: none found — Segregation of Duties, audit trail, and ID issuance are each implemented once and reused, not duplicated per module.

**Single points of failure**: the Firestore project itself (expected, for a Firestore-based app); the single Vercel deployment (no documented multi-region or failover setup — reasonable for current scale, worth revisiting at higher scale, see §20).

**Scalability/maintainability concerns**: see §20 and §19.

## 5. Security Audit

Classification: **CRITICAL / HIGH / MEDIUM / LOW / INFO**. Per this task's own rule, nothing rated Critical or High is auto-fixed — it is shown here first.

| Finding | Severity | Detail |
|---|---|---|
| Server-side auth/authz is real, not just UI-hiding | INFO | Confirmed directly in the QA pass: a captured, valid ID token for the Sales role, replayed directly against `POST /api/suppliers`, was rejected with a real `403` — not merely a hidden button. |
| Segregation of Duties enforced server-side | INFO | Confirmed in source (`approvals.ts:120`, `procurementApprovals.ts:152`) — a requester cannot decide their own request even via a direct API call. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` fails closed | INFO | If unset, the server rejects all `/api/*` calls with 503 rather than allowing unauthenticated access through. Correct default. |
| WhatsApp webhook requires HMAC signature verification | INFO | `WHATSAPP_APP_SECRET` is required for any inbound webhook POST to be accepted; unset, the endpoint rejects with 403 rather than trusting unverified public-internet payloads. |
| Security headers present at the edge | INFO | `vercel.json` sets HSTS (with preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a locked-down `Permissions-Policy`, and `Referrer-Policy`. |
| No dependency-vulnerability scan currently wired into CI | MEDIUM | `npm audit` isn't runnable against this repo's actual lockfile (`bun.lock`) without extra setup, and nothing currently runs a `bun`-aware equivalent in CI. Not itself a live vulnerability, but a gap in *catching* one automatically going forward. |
| `ReceivedAmountClassification` is a type with no real enforcement anywhere it's used | MEDIUM (data-integrity-adjacent, not a security hole) | Already covered in the QA report and `DECISIONS-REQUIRED.md` item 2 — flagged here too because an unenforced financial classification is the kind of gap that becomes a real integrity/audit problem later, not because anything is currently exploitable. |
| No document-storage access-control test was possible this session | INFO (limitation, not a finding of a hole) | The Storage emulator's download host is blocked by this sandbox's own network policy; this audit could not confirm or deny Storage security-rule correctness in a real browser. Recommend a dedicated pass once file storage testing is reachable. |
| Firestore security rules are comparatively short (149 lines) for the number of collections the app has | LOW | Worth a dedicated collection-by-collection rules review to confirm every collection the server writes to also has an explicit, correct client-read rule (or explicit deny) — not evidence of an actual hole, since the server is the sole writer for core entities and clients only read via `onSnapshot`. |

No Critical or High findings surfaced in this pass. Nothing here was auto-fixed.

## 6. Financial Integrity Audit

- **Idempotency**: Phase 7 of the original remediation added idempotency keys to critical mutations specifically to guard against duplicate-request/retry double-charging — this exists and is tested.
- **Duplicate detection**: Supplier Invoices (`src/server/supplierInvoices.ts`) has explicit duplicate/correction handling (Procurement P1.11) — but only reachable via API, no UI (see the QA report §13).
- **Rounding/reversals/corrections**: handled per-module (debts, refunds, invoice corrections) rather than through one shared financial-math utility — a place where a single shared "money" helper (rounding, currency formatting, reversal semantics) applied consistently would reduce the chance of two modules rounding differently.
- **The one confirmed real gap**: `ReceivedAmountClassification` (FIN-002) — a real financial-classification concept with zero real enforcement (§5, §10 of the QA report, `DECISIONS-REQUIRED.md` item 2). This is the audit's single most concrete financial-integrity finding — flagged for a decision, not fixed here.
- **Idempotency-protection recommendation**: the pattern already exists (Phase 7) — the actionable recommendation is to confirm every *new* Procurement P1 financial mutation route (supplier payments, refunds, custody/expenses, debts settlement) actually uses the same idempotency-key mechanism, not just the original core-entity routes it was first built for. This was not exhaustively re-verified in this pass and is a good scoped follow-up.

## 7. Database/Firestore Audit

- **Collections**: suppliers, purchase_orders, purchase_order_amendment_requests, supplier_quotes, supplier_payments, customer_refunds, debts, employee custody/expense records, supplier_invoices, operational_expenses, vehicle receiving records, TARS records, late fees, plus the pre-existing core entities (customers, leads, contracts, reservations, deposits, bank_transactions, users, numbering_configs, dead_letter_queue, whatsapp_inbound_events, settings) and more — a broad but not sprawling schema for the feature set.
- **No `firestore.indexes.json`** exists in the repository — any composite index this app's queries need is managed ad hoc (created reactively when Firestore returns a "missing index" error, presumably via the console) rather than version-controlled alongside the code that needs it. This is a real, concrete finding: index requirements are not reproducible from the repo alone.
- **Atomicity**: `idGenerator.ts`'s number issuance and several balance/settlement operations use Firestore transactions correctly (confirmed by this session's own construction of them in earlier phases, and by the one real transaction-lock-timeout seen in this pass — which was a concurrency *stress-test* artifact of 25 simultaneous callers in a resource-constrained sandbox, not a correctness bug in the transaction logic itself).
- **Race conditions**: the SoD/approval and ID-issuance paths were specifically hardened against races in the original remediation (Phases 2–5); this audit did not find a new instance of the same class of bug in Procurement P1's newer code, but did not exhaustively re-derive every write path either — a full concurrency audit of the ~15 newer Procurement routes would be a reasonable, scoped follow-up.
- **Cache consistency**: the client reads via `onSnapshot` (live) rather than one-shot fetches for core entities, which is the right default for consistency; the in-memory `globalStore` server-side cache is only updated *after* a confirmed Firestore write (Phase 1 of the original remediation), avoiding the earlier "UI says success, write never happened" class of bug.

## 8. API Audit

- Every mutating route checked in this pass uses `requireRole(...)` and is wrapped in `asyncHandler` for uniform error handling.
- **Confirmed this pass**: routes return a clean `400` with a specific message on missing required input (`legalName is required.`), not a `500` — for both a partially-missing body and a fully empty one.
- **The one confirmed inconsistency**: before this pass's fix, an *optional* field being omitted (not a validation failure — a legitimate, by-design minimal submission) produced a `502` instead of either succeeding or a clean `400`. That specific inconsistency is now fixed (see the QA report, §5–6), and the fix is systemic (Firestore-SDK-level), so it applies to every route with the same pattern, not only Suppliers.
- **Audit logging**: `recordAudit(...)` is called from every route this pass touched directly; a full sweep confirming *every* mutating route calls it (not spot-checked ones) is a good scoped follow-up, not performed exhaustively here.
- **Response consistency**: routes checked this pass return the created/updated entity directly as JSON on success and `{ error: string }` on failure — consistent within what was checked; a full inventory across all ~100+ routes was not performed in this pass.

## 9. UI/UX Audit

- The application shell (sidebar, top bar with global search/language toggle/notifications/Quick Action, main content area) renders as one coherent, integrated application across every role tested in the QA pass — not disconnected pages.
- Loading → success states, toasts, and modal dialogs were observed working correctly in the QA pass across Suppliers/Purchase Orders/Approvals.
- **Not audited this session**: keyboard navigation, screen-reader/ARIA correctness, and responsive behavior below desktop width (1440×900 was the only viewport tested — no tablet/mobile pass was performed). These are real gaps in *this audit's* coverage, not confirmed defects in the app.
- No design changes are proposed here, per this task's explicit constraint — this section is observational only.

## 10. Document Architecture review

Files are referenced by ID arrays on their owning record (e.g. `Supplier.documentIds`), pointing at Firebase Storage paths, with no separate "documents" collection tracking metadata (uploader, upload time, content type, version) independently of the owning record. This works but doesn't scale cleanly to features like "show me every document uploaded this month across all suppliers" without walking every supplier record. A scalable alternative worth considering (proposal only, nothing moved): a dedicated `documents` collection with `{ id, ownerType, ownerId, storagePath, uploadedBy, uploadedAt, contentType, sizeBytes }`, referenced *from* owning records the same way as today, but independently queryable and independently auditable. This was not implemented or tested this session — Storage itself was unreachable in this sandbox (see §14 of the QA report) — and would need its own approval and migration plan before any existing file is touched.

## 11. Testing Strategy review

**Test Matrix** (what exists vs. what's missing):

| Layer | Exists | Gap |
|---|---|---|
| Unit | Yes (249 tests) | — |
| Integration (supertest against Express) | Yes | — |
| Firestore rules | Yes (real emulator in CI) | — |
| Firestore *document validation* (real SDK strictness, e.g. `undefined` rejection) | **No, until this QA pass** | This is exactly the gap Bug #6 lived in. Recommend folding real-Firestore-emulator route testing into the standing suite, not treating it as a one-off QA exercise. |
| API (direct HTTP, various roles) | Yes, via supertest | Direct-token replay (bypassing the client entirely, as done in this pass for the Sales-role check) is a stronger authorization test than supertest's in-process call and isn't part of the standing suite. |
| Browser/E2E | **No standing coverage** — only exists as this pass's scratch scripts | Worth promoting a curated subset into a real, versioned E2E suite. |
| Permission/regression | Partial — role checks are unit/integration-tested per route; a full N-role × N-route matrix is not exhaustively automated | A generated matrix (role × route × expected status) would catch a missed `requireRole` far faster than manual review. |
| Financial edge cases | Partial — covered per-module in unit tests; cross-module scenarios (e.g. deposit applied against a charge that gets cancelled mid-flight) are not exhaustively covered | Worth a dedicated pass once the relevant UI exists to drive it. |

## 12. Automated Regression design

Proposed pipeline (suggestion only, not built): **Build → Typecheck → Unit → Integration → Firestore-emulator (real-document-validation) → API → Security → Browser/E2E → Production build → Report.** The first five stages already exist today (folded into `npm test` + `npm run build` + CI); the new stages this audit recommends adding are: a real-Firestore-document-validation pass (would have caught Bug #6 before merge), a security/dependency-vulnerability scan, and a curated Browser/E2E suite promoted from this QA pass's scratch scripts. No phase should be marked "Verified" without the appropriate tier of test actually having run — this audit followed that rule itself (see the QA report's explicit NOT VERIFIED items).

## 13. Git Strategy review

Observed pattern this session (not changed, only reviewed): small, single-purpose commits with descriptive messages; feature work on a named branch, merged to `main` at an explicit closure point the user reviews, never merged automatically mid-phase. Suggestions only: (a) a lightweight commit-type prefix convention is already emerging informally (`fix:`, `docs:`, `chore:`) — formalizing it (e.g. Conventional Commits) would make `git log` machine-parseable for changelogs later; (b) tagging each approved closure point (e.g. `procurement-p1-approved`) would make "what was the last approved state" a one-command answer instead of a scroll through history; (c) no rollback strategy is currently documented beyond git's own primitives — worth a one-paragraph runbook, not a new tool.

## 14. Deployment Strategy analysis

Current: Vercel, one environment (production), deployed presumably on push to `main` (Vercel's default; not independently confirmed from inside this sandbox, which has no Vercel API access). No staging environment is visible in this repository's configuration. Proposed path (suggestion only, nothing deployed by this audit): **Dev (this kind of sandboxed, emulator-backed session) → Staging (a second Vercel project/environment pointed at a non-production Firebase project) → Verification (the same QA approach demonstrated in this pass, run against staging) → Approval (human sign-off) → Production.** Health checks: `operationalHealth.ts` already exists server-side; wiring its output to Vercel's own deployment health checks (or a simple `/api/health` endpoint polled post-deploy) would close the loop between "deployed" and "confirmed healthy." No production deployment was performed or proposed to be performed by this audit.

## 15. Backup & Disaster Recovery review

`scripts/drDrill.ts` (Phase 23.8) already exists and defines the DR drill mechanics for this project. This audit did not re-run it (out of scope for an audit-only pass) but confirms it exists and is version-controlled, unlike most of what a DR review usually has to reverse-engineer from tribal knowledge. Recommendation (suggestion only, no policy changed): schedule the existing drill to run periodically (e.g. monthly, as a GitHub Action) rather than only on demand, so RPO/RTO assumptions are continuously re-validated rather than validated once and assumed to still hold.

## 16. Monitoring & Alerts capability review

`operationalHealth.ts`, `deadLetterQueue.ts`, and `anomalyDetection.ts` already capture the *data* needed for monitoring (failed jobs, anomalies, health signals) — Phase 23.6/23.7 of the original remediation. What's missing is an *outbound* channel: today, this data has to be looked at (presumably via whatever UI or direct Firestore query surfaces it) rather than pushed to a human. Given WhatsApp is already integrated and working, the lowest-effort real improvement here is routing a subset of these existing signals (dead-letter-queue entries, anomaly-detection hits, TARS escalations reaching "urgent") through the existing WhatsApp send path as alerts — no new integration, just a new consumer of data and a channel that already exist. This is flagged as a suggestion requiring approval (§24), not built here.

## 17. Integration Architecture review

| Integration | Status |
|---|---|
| WhatsApp Cloud API (Meta) | **AVAILABLE** — fully wired, degrades gracefully without credentials |
| Gemini AI | **AVAILABLE** — fully wired (`GEMINI_API_KEY`) |
| RTA (Roads & Transport Authority) | **UNKNOWN / REQUIRES PARTNER ACCESS** — no integration code exists; see §18 |
| Banks | **NOT AVAILABLE** — no banking API client exists; `bank_transactions` appears to be manually reconciled data, not a live feed |
| Payment gateways | **NOT AVAILABLE** — no gateway SDK/client exists anywhere in the codebase |
| Email | **NOT AVAILABLE** — no email-sending code exists (WhatsApp is the only outbound notification channel) |
| Accounting systems / Odoo / other CRM | **NOT AVAILABLE** — no connector code exists |

## 18. RTA feasibility audit

No implementation was attempted or proposed. Findings: this codebase has no RTA integration of any kind — every "RTA" string in the repository is literal contract-terms text, not an API client (verified by repo-wide search). This audit cannot determine RTA's official integration method, available APIs, required credentials, or which corporate services (fines, licensing, vehicle data, plate transfers) are exposed to a business like Splendor, because that information lives with RTA, not in this codebase or its history. **Recommendation, logged as a decision (`DECISIONS-REQUIRED.md` item 3): a business-side inquiry to RTA is the correct next step, not an engineering one.** This audit explicitly did not consider, and would not recommend, browser automation or scraping as a substitute for an official channel — that carries real legal and reliability risk and was correctly treated as out of scope without an explicit decision and confirmation that it's officially permitted.

## 19. Performance analysis

- **Frontend bundle**: Vite's own build output flags the main JS chunk at ~1.36 MB (gzip ~338 KB) — "larger than 500 kB after minification." No code-splitting (`dynamic import()`) or manual chunking is currently configured. This is the single most concrete, actionable performance finding from this pass: splitting rarely-used views (e.g. AI Intelligence, Bank Reconciliation) into lazy-loaded chunks would reduce the initial load for every user, not just those who use those features.
- **Dependency scanning**: `npm audit` could not run against this repo's real lockfile (`bun.lock`) in this session — not a performance finding itself, but it means known-vulnerable-package detection is not currently automatic; a `bun`-aware equivalent should be added to CI.
- **Queries**: no explicit `firestore.indexes.json` (§7) means index cost/availability isn't visible from the repo — a query that works today against a small dataset could hit a missing-index wall as data grows, with no version-controlled record of what indexes are actually required.
- **No APM/query-cost dashboard** exists — "which query is expensive" is currently a manual Firebase-console question, not something surfaced automatically.

## 20. Scalability assessment

At 100–500 vehicles, the current architecture (Firestore + a single Express/Vercel deployment) is almost certainly fine as-is — this is well within normal Firestore document-count and read/write-throughput ranges, and nothing observed in this audit suggests an immediate ceiling. At 1,000–5,000 vehicles, the first likely friction points are: (a) the missing-index gap (§7/§19) turning into actual query failures rather than a theoretical risk, and (b) the single large frontend bundle (§19) becoming a more noticeable load-time cost as the dataset (and therefore initial data fetch) grows. At 5,000–10,000+, the architecture itself (single-region Firestore, single Vercel deployment) would warrant a dedicated capacity/scale review — not because anything here is wrong, but because that's the point at which "one region, one deployment" architectures generally need deliberate multi-region or read-replica planning, which this audit did not find any existing plan for (a gap, not a defect).

## 21. Data Integrity review

- Duplicate-record protection exists for Supplier Invoices specifically (Procurement P1.11) — a pattern worth confirming is applied consistently to any other entity where a duplicate submission would be a real financial risk (expenses, refunds).
- Concurrent-approval protection exists via the SoD/approval primitive and Firestore transactions in ID issuance.
- No new race condition was found in this pass beyond the resource-constrained transaction-lock-timeout already explained in §7 (a stress-test artifact, not a logic bug).
- The clearest *confirmed* data-integrity gap this pass found is, again, FIN-002 (§6) — not a race condition or duplicate risk, but a classification that should exist and doesn't, which is its own kind of integrity gap (data that should be structured is currently just an unstructured amount).

## 22. Business Rule Protection

Recommended traceability chain (proposal, not built): **Decision ID → Code → Test → UI → Audit Trail**, e.g. `PROC-059 → src/server/purchaseOrders.ts (specific function) → tests/procurement.test.ts (specific test name) → ProcurementView.tsx (specific button/flow, or "no UI" explicitly noted) → recordAudit(...) call site`. This audit did not build tooling to auto-generate this trace, but the QA report and this audit both demonstrate the manual version of it repeatedly (e.g. FIN-002: type exists → zero code uses it → therefore no test could meaningfully cover it → therefore no UI shows it → therefore nothing to audit-trail). The concrete, buildable recommendation is a lint rule or a small script that fails CI if a business-rule ID referenced in `DECISIONS-REQUIRED.md` or a closure report has no matching code comment/test name anywhere in the repo — closing the loop mechanically instead of relying on someone remembering to check.

## 23. Decision Governance

No business decision was invented or executed by this audit. Three items are logged in `DECISIONS-REQUIRED.md`: (1) a resolution note on the pre-existing AI-Studio-scaffold-files question, reflecting the new governance decision that they stay unchanged; (2) whether FIN-002/Received Amount Classification should be implemented or the unused type removed; (3) that RTA integration needs a business-side inquiry before any engineering feasibility work can even begin.

## 24. Cloud Capability Recommendations — Top 20

| # | Priority | Capability | Benefit | Effort | Risk | Needs approval? |
|---|---|---|---|---|---|---|
| 1 | High | Fold real-Firestore-emulator testing into the standing suite | Would have caught Bug #6 before merge; catches the whole class of `undefined`-field bugs | Medium | Low | No |
| 2 | High | Decide FIN-002's fate (implement or delete) | Removes a live financial-integrity gap | Low (delete) / Medium (implement) | None (delete) / Medium (implement — needs the actual rule) | Yes — it's a business-logic decision either way |
| 3 | High | Code-split the frontend bundle | Faster load for every user, no behavior change | Low–Medium | Low | No |
| 4 | High | Add `firestore.indexes.json` to the repo, generated from actual query needs | Makes index requirements reproducible and reviewable, not tribal knowledge | Medium | Low | No |
| 5 | Medium | Add a dependency-vulnerability scan step to CI (`bun`-aware) | Catches known-CVE packages automatically instead of manually | Low | Low | No |
| 6 | Medium | Promote this session's scratch Playwright scripts into a versioned E2E suite | Standing regression coverage for real-browser behavior, not a one-off | Medium | Low | No |
| 7 | Medium | Route existing dead-letter-queue/anomaly-detection/TARS-escalation signals through the already-working WhatsApp channel as alerts | Turns data that already exists into something a human actually sees, with no new integration | Low–Medium | Low | Yes — decide who receives these and what counts as alert-worthy |
| 8 | Medium | Add ESLint (+ a rule against exactly this session's `undefined`-spread pattern) | Catches this specific bug class at write-time, not at Firestore-write-time | Medium | Low | No |
| 9 | Medium | Schedule the existing DR drill (`scripts/drDrill.ts`) to run periodically via GitHub Actions | Continuously re-validates RPO/RTO instead of validating once | Low | Low | No |
| 10 | Medium | Build a role × route permission matrix generator, run in CI | Catches a missed `requireRole` automatically | Medium | Low | No |
| 11 | Medium | Design (not migrate) a dedicated `documents` collection for file metadata | Makes "all documents uploaded this month" a real query instead of a full scan | Low to design | None to design; Medium to migrate | Yes, before migrating anything existing |
| 12 | Medium | Stand up a real staging environment (second Vercel project + non-prod Firebase project) | Lets every future QA pass in this report's style run without ever touching prod | Medium | Low | Yes — infrastructure cost/ownership decision |
| 13 | Low–Medium | Tag approved closure points in git (e.g. `procurement-p1-approved`) | "What was last approved" becomes one command | Low | None | No |
| 14 | Low–Medium | Adopt Conventional-Commits-style prefixes formally | Machine-parseable changelog later | Low | None | No |
| 15 | Low–Medium | A dedicated accessibility (keyboard/ARIA) pass | Broader usability, avoids future compliance risk | Medium | Low | No |
| 16 | Low–Medium | A dedicated responsive/tablet pass (this audit only tested 1440×900) | Confirms the app works for any non-desktop user | Medium | Low | No |
| 17 | Low | A lint/CI rule tying `DECISIONS-REQUIRED.md`/closure-report rule IDs to real code/test references | Mechanical business-rule traceability instead of manual cross-checking | Medium | Low | No |
| 18 | Low | A `/api/health` endpoint wired to Vercel's post-deploy health check | Closes the loop between "deployed" and "confirmed healthy" | Low | Low | No |
| 19 | Low | A shared "money" utility (rounding/formatting/reversal) used by every financial module | Reduces the chance two modules round differently | Medium | Low | No |
| 20 | Low | Business-side inquiry to RTA about an official integration channel | The only way to ever move RTA integration past "unknown" | Low (it's a phone call/email, not engineering work) | None | Yes — but it's a business action, not a technical one |

## 25. Final Report — 20 items

1. **Full Capability Inventory** — §2 above (table).
2. **Architecture findings** — §4: strong SoD/audit/idempotency primitives; no router; no linter; one large `server.ts`; the mock-vs-real-Firestore divergence risk demonstrated by Bug #6.
3. **Security findings** — §5: no Critical/High findings; several INFO-level confirmations of real (not just UI) enforcement; one MEDIUM (no automated dependency-vulnerability scanning); Storage security untestable in this sandbox.
4. **Financial integrity findings** — §6: idempotency exists and is used for core mutations; FIN-002 is a real, confirmed gap (type with zero enforcement); no shared money-math utility.
5. **Database findings** — §7: no version-controlled `firestore.indexes.json`; atomicity/race protections exist for ID issuance and approvals; a stress-test lock-timeout under 25 concurrent callers was environmental, not a logic bug.
6. **API findings** — §8: consistent role gating and clean 400s for validation failures (confirmed this pass); the one real inconsistency (502 on omitted optional fields) is now fixed and systemic.
7. **UI findings** — §9: coherent, integrated shell across every role tested; accessibility and non-desktop viewports were not audited this session.
8. **Testing gaps** — §11: no standing real-Firestore-emulator route tests before this pass; no standing browser/E2E suite; no full role×route permission matrix.
9. **Git recommendations** — §13: formalize commit-type prefixes; tag approved closure points; document a rollback runbook.
10. **Deployment recommendations** — §14: add a staging environment; wire existing health-check data into Vercel's deploy health check.
11. **Backup recommendations** — §15: the DR drill already exists (Phase 23.8) — schedule it to run periodically instead of only on demand.
12. **Monitoring recommendations** — §16: the underlying signals already exist (dead-letter queue, anomaly detection, TARS escalation) — route them through the already-working WhatsApp channel as alerts.
13. **Integration opportunities** — §17: only WhatsApp and Gemini are real integrations today; everything else (banks, payment gateways, accounting, RTA) is genuinely not built.
14. **RTA feasibility** — §18: no integration exists; this is a business-side inquiry to RTA, not an engineering task, and scraping was correctly not considered.
15. **Performance findings** — §19: a ~1.36 MB main JS chunk with no code-splitting is the single most actionable finding; no index-cost visibility; no automated dependency scan.
16. **Scalability findings** — §20: fine as-is through roughly 500–1,000 vehicles; the missing-index gap and bundle size become real friction in the 1,000–5,000 range; multi-region/deployment architecture would need deliberate planning beyond 5,000–10,000.
17. **Data integrity findings** — §21: FIN-002 is the concrete gap; no new race conditions found beyond an environmental stress-test artifact.
18. **Decision list** — §23 / `DECISIONS-REQUIRED.md`: (1) AI Studio scaffold files — resolved to "keep, per governance decision"; (2) FIN-002 implement-or-delete; (3) RTA — business inquiry needed before any engineering work.
19. **Top 20 Cloud capabilities** — §24 (table), ranked by priority/effort/risk.
20. **Recommended roadmap** — in priority order: (a) fold real-Firestore testing into CI and decide FIN-002's fate — both close *confirmed* gaps; (b) code-split the frontend and add `firestore.indexes.json` — both are low-risk, high-leverage technical improvements needing no business decision; (c) wire existing monitoring signals to the existing WhatsApp channel as alerts, once someone decides what's alert-worthy; (d) stand up a real staging environment so every future QA pass can run this same way without a hand-built local emulator setup; (e) everything else in §24 in roughly the priority order shown there.

---

This audit is discovery only. No business decision was executed, no file was deleted, no production system was touched, no security rule or database structure was changed. Three items now sit in `DECISIONS-REQUIRED.md` awaiting the user's decision; everything else above is a suggestion, not an action taken.
