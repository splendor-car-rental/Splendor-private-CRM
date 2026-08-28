# Proposed Deletions

Produced by the Repository Audit & Architecture Cleanup phase. Nothing in
this file has been deleted — this is a review list, not an action log. A
file is only removed after this list is reviewed and the corresponding
row in `DECISIONS-REQUIRED.md` (where applicable) is answered.

This repository was found to already be clean: no dead components, no
orphaned server modules, no `final`/`copy`/`backup`/`temp`-style files, no
accidental duplicate assets (see `docs/REPOSITORY_INVENTORY.md` for the
full verification). Exactly two files surfaced as deletion candidates,
both from the same origin.

| File | Path | Reason | Reference check | Dependency check | Safe to delete (code) | Replaced by |
|---|---|---|---|---|---|---|
| `metadata.json` | `/metadata.json` | Google AI Studio platform project manifest (name/description/capabilities) — not consumed by this app | `git grep -l "metadata.json"` finds nothing outside git's own index; not read by `package.json`, `vite.config.ts`, `vercel.json`, `server.ts`, or any source file | No import, no fetch, no build-step reference anywhere | **Yes**, from this app's own build/runtime perspective | n/a — nothing reads it, so nothing replaces it |
| `assets/.aistudio/.gitignore` | `/assets/.aistudio/.gitignore` | Empty scaffold folder from the same AI Studio origin (the file's only content is `*`, i.e. "ignore everything placed in this folder") | No reference anywhere in the repository; the folder holds no other tracked file | None | **Yes**, from this app's own build/runtime perspective | n/a |

**Why these are not deleted in this same checkpoint despite passing the
code-dependency check:** both files exist purely because this project
appears to have originally been created or is still connected to through
Google AI Studio's own platform. This audit has no way to see whether
that platform connection is still in active use, and whether that
platform's own dashboard relies on either file's presence to display or
manage this project. Deleting a file with zero *code* dependents can still
have a real *operational* consequence outside the code — which is exactly
the category of decision this phase's own rules require to be raised to
the business owner rather than assumed. See `DECISIONS-REQUIRED.md`.

No other file in the repository met the bar to appear in this list.
