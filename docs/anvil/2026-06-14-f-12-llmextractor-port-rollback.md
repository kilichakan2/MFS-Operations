# Rollback note — F-12 LLMExtractor port

Date: 2026-06-14
Branch: f-12-llmextractor-port
PR: #37

## Migration

**None.** This PR contains NO database migration, NO schema change, NO SQL.
It is a pure code relocation (moved the Anthropic AI call out of the import
route into an `LLMExtractor` port + `lib/adapters/anthropic/` adapter + a Fake
adapter + `lib/wiring/llm.ts`).

🗣 In plain English: nothing about the database changed, so there is nothing in
the data to undo. The only thing that ships is rearranged code.

## How to roll back

Code-only rollback. If this needs reverting after merge:

1. `git revert` the merge commit for PR #37 (or `vercel rollback` to the prior
   production deployment).
2. Vercel re-deploys the previous code automatically.

No data recovery step is required. PITR is **N/A** — the change is
non-destructive and touches no data.

🗣 In plain English: undo = put the old code back, one revert. There is no
"restore the database" step because the database was never touched.
