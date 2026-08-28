# Decisions Required

Produced by the Repository Audit & Architecture Cleanup phase. Each item
below needs a business or operational decision this audit will not make
on its own behalf. Nothing described here has been acted on.

---

## 1. Google AI Studio scaffold files — keep or remove?

**The problem.** Two files exist purely as artifacts of Google AI Studio,
the platform this project was originally created in or is still connected
to: `metadata.json` (a project manifest — name, description, capabilities)
and `assets/.aistudio/.gitignore` (an empty scaffold folder). Neither is
read by this app's own source code, build pipeline (`vite.config.ts`,
`tsconfig.json`), or deployment configuration (`vercel.json`) — confirmed
by reference search across the whole repository. See `PROPOSED-DELETIONS.md`
for the technical verification.

**Current situation.** They sit at the repository root, unused by the
running application, but their presence or absence may matter to the AI
Studio platform itself (e.g. its dashboard reading `metadata.json` to
display the project's name/description, or expecting the `.aistudio`
folder to exist as a marker) — something only visible from inside that
platform's own account view, not from the repository.

**Options:**
1. **Keep both, as-is.** Zero risk, zero benefit beyond tidiness. Correct
   choice if this project is still opened or managed through AI Studio.
2. **Delete both.** Slightly tidier root directory; safe for this app's
   own build and runtime either way. Correct choice if AI Studio is no
   longer used for this project and its dashboard doesn't need these
   files to keep functioning.
3. **Keep `metadata.json`, delete the empty `assets/.aistudio/` folder.**
   A middle ground if the manifest itself might still matter to the
   platform but the empty scaffold folder clearly never will.

**Impact of each option:** All three are reversible (nothing else in the
repository references either file, so removing them cannot break a build,
a test, or a running feature) and none carries a data or security risk —
this is purely a question of whether an external platform integration is
still wanted, which only the business owner can answer.

**What's needed to close this:** a decision on which option to take.
Once given, deleting the file(s) is a single, isolated, one-line commit.

**Update (governance decision, 2026-08-28):** the user has since stated
that Cloud/GitHub is now the sole development authority for this
repository and that these files must be kept unchanged "for now unless a
separate verified decision is made." That resolves this item to **Option
1 (keep both, as-is)** until a further, separate decision says otherwise.
No file was touched as a result.

---

## 2. Received Amount Classification (FIN-002) — implement or drop the type?

**The problem.** `src/types/index.ts` declares `ReceivedAmountClassification`
(`settlement | advance_payment | security_deposit | credit_balance |
settlement_adjustment | other_approved | unclassified`), but it is never
imported or referenced anywhere else in the codebase — no route sets it on
a payment, no UI reads or displays it. Found during the Procurement Phase 1
QA pass (see `docs/QA_PHASE1_FINAL_REPORT.md`, §10) while specifically
checking whether this rule is wired into the real Payment workflow, as
asked. It is not; only its shape exists.

**Current situation.** Every real payment/settlement route stores an
amount without any classification of what kind of receipt it represents.
Nothing crashes or behaves incorrectly because of this — the type is
simply inert.

**Options:**
1. **Implement it.** Decide, per payment/settlement route, how the
   classification is derived (explicit user selection at entry vs.
   inferred from context — e.g. "this settles Charge #X" vs "this has no
   linked charge yet") and store it on the persisted record, then surface
   it in whatever UI eventually exists for that workflow.
2. **Drop the type.** If this classification isn't actually needed yet,
   remove the unused type rather than leave a shape that looks load-bearing
   but is not.

**Impact of each option:** Option 1 is new business logic and needs an
explicit rule for how classification is derived — this audit will not
invent that rule. Option 2 is a one-line, zero-risk deletion of dead code.
Neither is a data or security risk either way.

**What's needed to close this:** a decision on whether Received Amount
Classification is still wanted, and if so, the actual classification rule
per settlement route.

---

## 3. RTA integration — feasibility only, no implementation

**The problem.** The codebase has zero integration code for Dubai's Roads
& Transport Authority (RTA) — every occurrence of the string "RTA" in the
repository is literal contract-terms text (e.g. `'UAE RTA Master Terms'`
in `server.ts`), not an API client. There is no evidence of an available
official RTA API, required credentials, or partner-access agreement
anywhere in this repository or its configuration.

**Current situation.** Any RTA-related task today (vehicle registration
lookups, fine checks, licensing, plate transfers) is handled manually,
outside this system.

**Options:**
1. **Pursue an official integration.** This requires the business to first
   establish what official channel RTA actually offers (a public API,
   a corporate/enterprise portal, a partner program) — engineering cannot
   determine this from the codebase; it needs a business-side inquiry to
   RTA directly.
2. **Do nothing for now.** Zero cost, zero risk; the manual process
   continues.

**What this audit explicitly did not do:** propose or use browser
automation/scraping against RTA's systems as a substitute for an official
API. That would be a real legal and reliability risk and was correctly
out of scope without explicit approval and confirmation that it's
officially permitted.

**What's needed to close this:** a decision on whether to pursue an
official RTA channel at all, made after a business-side inquiry to RTA —
not something this audit can resolve alone.
