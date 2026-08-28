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
