# Splendor Private CRM

A private, production CRM and fleet-operations platform for **Splendor Car Rental LLC** (Dubai) — an ultra-luxury automotive rental business. Covers the full customer lifecycle: leads → quotations → reservations → contracts (handover/return/extension) → invoicing, payments, deposits, and bank reconciliation, plus fleet/plate-history management, Salik/Darb toll billing, a WhatsApp Business notification center, and bilingual (Arabic/English) staff tooling.

## Architecture

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS. Bilingual (EN/AR) with RTL support.
- **Backend**: a single Express app (`server.ts`) that is the sole authoritative writer for every business entity — see `src/server/persistence.ts`, `idGenerator.ts`, `availability.ts`, `contractOps.ts`, and `idempotency.ts` for the durability/atomicity/idempotency primitives every mutation route builds on.
- **Database**: Firebase Firestore (via `firebase-admin` server-side, `firebase` client SDK for real-time read subscriptions only — the client never writes business data directly).
- **Auth**: Firebase Authentication; every `/api/*` route (except the health check, public website endpoints, and the WhatsApp webhook) requires a valid Firebase ID token.
- **Deployment**: Vercel. `api/index.ts` re-exports the Express app as a Vercel serverless function; `vercel.json` rewrites all `/api/*` traffic to it and runs the scheduled notification sweep via Vercel Cron.
- **AI**: Google Gemini (`@google/genai`), called server-side only.
- **WhatsApp**: Meta Cloud API, with a signature-verified (`X-Hub-Signature-256`), idempotent, durably-logged webhook — see `src/server/whatsapp.ts` and the webhook routes in `server.ts`.

## Run locally

**Prerequisites:** Node 22 (see `.nvmrc`) and Bun 1.4.0. **Bun is the repository's sole package manager and `bun.lock` is the canonical lockfile.**

```bash
bun install
bun run dev
```

The Vite dev server and the Express API run as one process in development; `bun run dev` serves both.

Copy `.env.example` to `.env` (or configure the same variables in your hosting provider) and fill in at least `FIREBASE_SERVICE_ACCOUNT_KEY` — without it, every `/api/*` request is rejected. `GEMINI_API_KEY` and the `WHATSAPP_*` variables are optional; each integration degrades gracefully (fallback AI responses / `not_configured` WhatsApp sends) when its variables are unset.

## Testing

```bash
bun test
bun run lint
bun run build
```

The test command runs the full suite against a real local Firestore emulator. CI runs typecheck, the full test suite, and the production build on every push and pull request. The suite covers durability/atomicity, RBAC, idempotency, the WhatsApp webhook, Salik/Darb parsing and malicious-file rejection, mass-assignment/ID-redirection prevention, VAT arithmetic, and core business workflows.

## Repository layout

```
server.ts                 Express app: every /api/* route
api/index.ts              Vercel serverless entry point (re-exports server.ts)
src/server/               Durability/atomicity/idempotency primitives + business logic
src/components/           React UI (views, modals, layout, shared components)
src/context/              CRMContext (API calls + local state), AuthContext, LanguageContext
src/config/               Shared constants (roles/permissions, VAT rate, notification events)
src/types/                Shared TypeScript types
tests/                    Vitest suite
firestore.rules           Firestore security rules (client-SDK read paths only)
```

Production verification checkpoint.
