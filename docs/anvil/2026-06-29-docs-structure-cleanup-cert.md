# ANVIL Clearance Certificate — docs/file-structure cleanup

Branch: chore/docs-structure-cleanup
Date: 2026-06-29
PR: #97
Change class: documentation reorganization + comment-only edits (no runtime behavior)

## Scope
- 20 `git mv` renames (docs reorg) — content preserved (99–100% similarity).
- 1 new file `docs/README.md` (index); 1 wc29 architecture-watch note; live-doc cross-reference repoints.
- 2 comment-only edits in app files (`app/haccp/training/page.tsx`, `app/api/routes/optimise/route.ts`) —
  documentation-pointer comments repointed; compiled bundle byte-identical (comments stripped at build).
- NO migration, NO schema/RLS, NO auth, NO dependency, NO runtime logic change.

## Test matrix — right-sized (fast lane: docs/comment-only)

| Lane | Result | Evidence |
| --- | --- | --- |
| Type-check (tsc --noEmit) | ✅ exit 0 | Whole project clean after the 2 comment edits |
| Production build (next build) | ✅ green | Full route table built; bundle unaffected |
| Live-doc reference sweep | ✅ clean | No live doc references a moved file's old path; only frozen certs/reviews retain historical paths (correct) |
| CI `smoke` (Playwright @critical, live preview) | ✅ 75/75 (7m24s) | Required check on PR #97, run 28374023975 — real end-to-end app on the preview deploy |
| Unit / Vitest | n/a — not required | No code logic changed (comment-only); no unit surface in diff |
| Integration | n/a — not required | No API/service/data path changed |
| Database (pgTAP / RLS) | n/a — not required | No migration, schema, or policy |
| Edge Functions (Deno) | n/a — not required | No `supabase/functions/` change |
| PITR | n/a — not required | No migration (destructive or otherwise) |

(N/A lanes carry a justification — never `0/0 ✅`.)

## Architecture rung
N/A — no seam crossed. No `lib/domain|ports|adapters|wiring/**` change, no vendor import, no `package.json`
change. The 2 touched app files changed comments only.

## Migration
None. Rollback: `git revert` of the squash commit restores every file to its prior path (renames are
reversible; nothing deleted). PITR confirmed: N/A — no migration.

## Verdict
✅ CLEARED FOR PRODUCTION
Docs-only reorganization + comment-only edits; compiled bundle byte-identical to main. All applicable
lanes green (tsc · build · link-sweep · live CI smoke 75/75). Behavior lanes justified N/A.
