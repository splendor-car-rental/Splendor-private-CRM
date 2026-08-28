# Naming Conventions

Produced by the Repository Audit & Architecture Cleanup phase. This
documents the conventions the codebase **already follows consistently** —
verified across all 129 tracked files during this audit, not a new scheme
being imposed. No file in the repository needed renaming to match it.

## Files & folders

| Kind | Convention | Example |
|---|---|---|
| React component file | `PascalCase.tsx`, matching the exported component name exactly | `FleetCRMView.tsx` exports `FleetCRMView` |
| Backend module | `camelCase.ts`, named after the domain it owns | `purchaseOrders.ts`, `employeeCustody.ts` |
| Config file | `camelCase.ts`, named after what it configures | `permissions.ts`, `procurement.ts` |
| Test file | `<subjectCamelCase>.test.ts`, one file per subsystem, never per individual function | `procurement.test.ts`, `anomalyDetection.test.ts` |
| Documentation | `SCREAMING_SNAKE_CASE.md` at the repository root (for phase-defining docs like this one) or inside `docs/` (for reference material) | `docs/DATA_RETENTION.md`, `PROPOSED-DELETIONS.md` |
| Folder | lowercase, plural for a collection of similar things (`components/`, `modals/`, `views/`), singular for a single concept's home (`firebase/`, `i18n/`) | — |
| Asset | lowercase, hyphen-separated, descriptive of the actual content — never a generic camera/export name | `splendor-logo.png`, `proud-of-uae-banner.jpg` |

## Components & functions

- A component's file name, its export name, and the sidebar/view id it
  renders under are kept in sync deliberately (`ProcurementView.tsx` →
  `ProcurementView` → `case 'procurement':` in `App.tsx`) — breaking this
  triple is the single easiest way to make a screen unreachable.
- A backend action follows a `<verb><Noun>` pattern that says what it does,
  not how: `createPurchaseOrder`, `requestDebtCancellation`,
  `computeLateFee`. A function that only *requests* a change (pending
  approval) is always named `request...`, never the same name as the one
  that actually applies it once approved.
- An approval handler is named `approve_<action>` as a string key
  (registered via `registerApprovalHandler(entityType, action, handler)`),
  matching the `action` field stored on the approval request record itself
  — so grepping for `approve_full_cancellation` finds both the request
  side and the handler side.

## Database (Firestore)

- **Collection names**: `snake_case`, plural — `purchase_orders`,
  `employee_custodies`, `customer_disputed_amounts`.
- **Document IDs**: a short, human-legible business prefix plus a
  sequential number, issued only through `src/server/idGenerator.ts` —
  never a random UUID and never client-generated. Examples: `CUS-000001`,
  `VEH-0001`, `PO-SCR-100`, `DBT-000001`. The prefix reads as the entity
  type at a glance in logs, URLs, and support conversations.
- **Fields**: `camelCase`, matching the TypeScript interface in
  `src/types/index.ts` exactly — Firestore documents are always written
  and read through a typed interface, never as loose untyped objects.

## Routes

- Every backend route is `/api/<kebab-case-plural-noun>` for a collection
  (`/api/purchase-orders`) and `/api/<...>/:id/<verb>` for an action on one
  record (`/api/purchase-orders/:id/cancel`) — never a verb in the
  collection path itself (`/api/cancelPurchaseOrder` does not occur
  anywhere in this codebase).

## What this audit did **not** rename

Every file, folder, component, and database field already follows the
table above — confirmed while building `docs/REPOSITORY_INVENTORY.md`. No
Framework-required file (`vite-env.d.ts`, `index.html`, `main.tsx`, config
files with fixed names their tool expects) was touched, and no existing,
working name was changed "for tidiness" without a reason.
