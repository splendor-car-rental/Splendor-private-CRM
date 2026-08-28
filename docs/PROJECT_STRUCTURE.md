# Project Structure

Produced by the Repository Audit & Architecture Cleanup phase. This is a
map of the application as it actually exists today — no module is listed
here unless it is real, present, and wired in.

## Project map

```
SPLENDOR PRIVATE CRM
│
├── Frontend (src/)
│   ├── App.tsx                  -- view router (role-gated switch)
│   ├── main.tsx                 -- React entry point
│   ├── components/
│   │   ├── auth/                -- login, staff add/edit, change password
│   │   ├── common/               -- Badge, Modal, Toast, ErrorBoundary, shared primitives
│   │   ├── fleet/                -- vehicle detail modal
│   │   ├── layout/                -- Sidebar, Header, global search, notifications drawer
│   │   ├── modals/                -- add contract/customer/vehicle
│   │   └── views/                 -- one file per sidebar screen (see Module Map)
│   ├── context/                  -- AuthContext, CRMContext (all data + mutations), LanguageContext
│   ├── config/                   -- permissions, business rules seed, notification events, tax, procurement
│   ├── firebase/                 -- client SDK config, error handling, Firestore subscription helper
│   ├── lib/                      -- apiFetch, dateFormat, tollCalculations, upload
│   ├── i18n/                     -- EN/AR translations
│   └── types/index.ts             -- every shared TypeScript type in the app
│
├── Backend (server.ts + src/server/)
│   -- server.ts holds every /api/* route; src/server/*.ts holds the
│      business logic each route calls into (see Module Map)
│
├── Database (Firestore, via firebase-admin)
│   -- no ORM/schema file; collections are implicit in src/server/dataStore.ts
│      (the in-memory hydration map) and each module's own createDurable()/
│      updateDurable() calls. See "Database" in the Module Map.
│
├── Authentication (Firebase Auth)
│   -- src/context/AuthContext.tsx (client), server.ts's auth-gate
│      middleware + src/lib/apiFetch.ts (server/token plumbing)
│
├── Permissions (src/config/permissions.ts)
│   -- role → view access, role rank/delegation rules
│
├── Vehicles (Fleet CRM)
│   -- src/components/views/FleetCRMView.tsx, src/components/fleet/,
│      src/server/availability.ts
│
├── Customers (Customer 360)
│   -- src/components/views/Customer360View.tsx
│
├── Contracts
│   -- src/components/views/ContractsOpsView.tsx, src/server/contractOps.ts
│
├── Suppliers & Procurement (Splendor Procurement, Phase 1)
│   -- src/components/views/ProcurementView.tsx, src/server/{suppliers,
│      purchaseOrders,procurementApprovals,supplierQuotes,supplierPayments,
│      balances,customerRefunds,debts,employeeCustody,supplierInvoices,
│      operationalExpenses,vehicleReceiving,tars,lateFees}.ts,
│      src/config/procurement.ts
│
├── Financials
│   -- src/components/views/{FinanceLedgerView,BankReconciliationView,
│      TollsParkingView}.tsx, src/server/{tollFileParsers,tollImportGuard}.ts,
│      src/lib/tollCalculations.ts, src/config/tax.ts
│
├── Documents & Uploads
│   -- src/lib/upload.ts, server.ts's POST /api/upload + GET /api/documents/file,
│      the CRMDocument type -- see docs/DOCUMENT_STORAGE_ARCHITECTURE.md
│
├── TARS
│   -- src/server/tars.ts (part of Procurement, Phase 1 -- TARS has no
│      standalone screen yet, see that phase's closure report)
│
├── Reports & Intelligence
│   -- src/components/views/AIStudioView.tsx, src/server/splendorConnectEngine.ts
│
├── Settings & Governance
│   -- src/components/views/{SettingsAuditView,GovernanceView}.tsx,
│      src/server/{businessRules,approvals,anomalyDetection,deadLetterQueue,
│      operationalHealth}.ts
│
├── Audit Trail
│   -- recordAudit() (defined in server.ts, used by every mutating route),
│      the AuditLog type, surfaced in SettingsAuditView.tsx
│
├── Notifications & WhatsApp
│   -- src/components/views/NotificationWhatsAppCenterView.tsx,
│      src/server/{notificationEngine,whatsapp}.ts
│
└── Assets (public/, src/assets/)
    -- see "Asset structure" below
```

No other top-level module exists in this codebase today. (Leads, Quotations,
Reservations, Tasks are real screens too — `LeadsPipelineView.tsx`,
`QuotationsView.tsx`, `ReservationsView.tsx`, `TasksFollowupsView.tsx` —
each backed by routes in `server.ts` and state in `CRMContext.tsx`, grouped
under Customers/Contracts above rather than repeated as separate top-level
entries since they share the same rental-lifecycle data model.)

## Module map — key files, purpose, relationships

| Module | Location | Key files | Depends on |
|---|---|---|---|
| View routing | `src/App.tsx` | — | `CRMContext` (`activeView`), `config/permissions.ts` (`canAccessView`) |
| Global state | `src/context/CRMContext.tsx` | — | `firebase/firestoreService.ts` for live subscriptions, `apiFetch` for mutations |
| Backend routes | `server.ts` | — | every `src/server/*.ts` module, `src/server/dataStore.ts` |
| Durable writes | `src/server/persistence.ts` | `createDurable`, `updateDurable`, `runDurableTransaction` | `firebase-admin` |
| Sequential IDs | `src/server/idGenerator.ts` | `issueNextNumber` | `firebase-admin` transactions |
| Governance/Approvals | `src/server/{businessRules,approvals}.ts` | tiered rule storage, Four-Eyes approval | `persistence.ts`, `recordAudit` |
| Procurement approvals | `src/server/procurementApprovals.ts` | generic SoD engine, reused by 15 workflows | `persistence.ts`, `idGenerator.ts` |
| Document access | `server.ts` (`POST /api/upload`, `GET /api/documents/file`) | path-prefix allowlist, auth-gated proxy | Firebase Storage |

## Important dependencies (do not break these silently)

- **Every mutating route must call `recordAudit(...)`.** This is the
  entire audit trail; there is no separate logging layer.
- **Every financial/procurement request→approval workflow must go through
  `createProcurementApproval` / `decideProcurementApproval`
  (`src/server/procurementApprovals.ts`)**, not a bespoke approval check —
  this is what guarantees the requester can never approve their own
  request across all ~15 workflows that use it.
- **`src/server/dataStore.ts`'s `FIRESTORE_COLLECTION_BY_FIELD` map in
  `server.ts` must have an entry for every collection a route reads from
  `globalStore`** — this is what hydrates in-memory state from Firestore on
  a cold start; forgetting an entry silently makes a collection look empty
  after a deploy.
- **`src/server/idGenerator.ts`'s `NUMBERING_DEFAULTS` must have an entry
  for every entity that gets a sequential ID** — this is the only place
  ID prefixes/digit-widths/start values are defined.
- **`src/lib/apiFetch.ts` must be used for every `/api/*` call from the
  frontend**, never a bare `fetch(...)` — it's what attaches the Firebase
  ID token every route (except `/api/health`) requires.

## Safe change rules

1. Never bypass `recordAudit`, `apiFetch`, or `procurementApprovals.ts`'s
   Segregation-of-Duties check to "save a step" — each is a cross-cutting
   guarantee, not a convenience wrapper.
2. Never give a new entity its own bespoke ID scheme — register it in
   `idGenerator.ts`'s `NUMBERING_DEFAULTS` instead.
3. Never write a Firestore collection that isn't also registered in
   `server.ts`'s `FIRESTORE_COLLECTION_BY_FIELD` boot-time hydration map.
4. Never store a financial correction as an edit or delete of the original
   record — every financial module in this app (deposits, debts, refunds,
   late fees) uses a reversing/corrective movement instead, keeping the
   original intact.
5. Never place a new file outside the module structure above without a
   documented reason — see `docs/NAMING_CONVENTIONS.md` for where new
   files of each kind belong.
6. Never add a Storage upload path without also adding it to `server.ts`'s
   `ALLOWED_DOCUMENT_PATH_PREFIXES` allowlist and gating its read through
   the authenticated `/api/documents/file` proxy — see
   `docs/DOCUMENT_STORAGE_ARCHITECTURE.md`.
