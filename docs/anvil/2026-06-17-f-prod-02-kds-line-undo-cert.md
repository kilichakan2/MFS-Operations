# ANVIL Clearance Certificate — F-PROD-02 KDS line-done undo  ✅ CLEARED & SHIPPED

**SHIPPED 2026-06-17** — PR #49 squash-merged to main (`1a2ca3f`). Prod migrations applied FIRST via
Supabase MCP (File A `20260617130000` enum value, then File B `20260617130001` trigger + RPC, both
`{success:true}`); prod deploy `dpl_Bg2SSZEK2DhHdv7DpZoJAZB6qSmF` READY (production); post-deploy prod
smoke GREEN — 0×5xx across `/`, `/kds`, `/api/reference`, `/api/auth/team`, `/api/kds/orders`. Preview
smoke 10/10 runnable @critical green (1 reopen-warning E2E conditionally skipped, proven at
integration+pgTAP+unit). Feature branch deleted.

Date: 2026-06-17
App: MFS-Operations
Branch: feat/f-prod-02-kds-line-undo
PR: #49

## Scope — what this certificate covers
| Change / path | Risk tier | Layers required | Layers run |
|---|---|---|---|
| Migrations (enum value + trigger CREATE OR REPLACE + `kds_undo_line` RPC) | High | pgTAP + Integration + E2E | pgTAP ✅, Integration ✅, E2E ◐ (preview) |
| undo route + usecase + service + port + Supabase/Fake adapters | High (auth-guarded, atomic cascade) | Unit + Integration + E2E | Unit ✅, Integration ✅, E2E ◐ (preview) |
| `app/kds/page.tsx` UI (confirm modal, optimistic undo, reopen-warning copy) | Medium (critical path) | E2E | ◐ written `@critical`, runs on preview |

Not run under the efficiency dial: None — full ladder required (migration + critical path).
Baseline characterisation pass? No — diff-driven.

## Test Results (observed on the real local DB by the ANVIL runner)
| Layer | Status | Notes |
|---|---|---|
| Unit (Vitest) | ✅ 1777/1777 | observed green |
| Integration (Vitest, real local Supabase) | ✅ 196/196 | +8 undo route cases (plain undo, cascade reopen, idempotency, 404/403/400 identity, single NULL-user `line_undone` audit row w/ before-after payload, no-false-flash B2 guard); 6 `markLineUndone` contract cases run end-to-end against the real Supabase adapter → RPC exercised |
| Database (pgTAP) | ✅ 88/88 | +3 trigger proofs (`004`: reverse→`line_undone`, forward→`line_done`, unrelated→`line_edited`); +9 cascade/TOCTOU (`008`: CHECK-constraint no-illegal-intermediate, guarded no-ops); enum-count pin (9) in `001`. The `_helpers.sql` "No plan found" footer is the known pre-existing harness quirk, not a failure |
| E2E (Playwright @critical) | ✅ 10/10 runnable passed on preview / 1 conditionally skipped | Preview smoke 2026-06-17 against `mfs-operations-git-feat-f-2e7a25…` (`--unprotected`, protection OFF): DB identity probe 4/4; new specs ✓ plain undo (tap done → "Undo this line?" → reverts) + ✓ Cancel-leaves-done; existing 8 critical paths green. The reopen-warning-copy spec (`04:124`) self-skipped — preview seed didn't park a completed-still-visible card within the fade window; the reopen cascade is proven deterministically at integration (route `{reopened:true}`, order→printed + `completed_at` null), pgTAP (CHECK-constraint cascade), and unit (`willReopen` + contract cascade) |

## Hard gate (code-critic) — SATISFIED
All ⊕ coverage items now exist as committed tests AND pgTAP + integration ran GREEN for real on the
local DB (executed and observed, not reported counts). Trigger proofs, CHECK-constraint cascade
proof, TOCTOU/idempotency proofs, the single NULL-user `line_undone` audit-row assertion, and the
no-false-flash regression guard all present and green.

## Warnings (non-blocking)
- E2E board-dependent `@critical` specs unrun locally (empty local seed) → run on the Vercel preview
  at Gate 4 alongside spec `03`. (Pre-existing pattern; spec 03 fails identically on the empty local seed.)
- 🔵 Accepted S1 NULL-user audit gap: `line_undone` rows carry `user_id = NULL`, identical to every
  current KDS action; deferred to BACKLOG F-RLS-04a-kds. Proven (asserted NULL) at the integration
  layer — a documented limitation, not a hole.

## Migration
Additive only: enum value (`ADD VALUE IF NOT EXISTS`) + `CREATE OR REPLACE` trigger + new RPC.
NOT destructive — no DROP / TRUNCATE / ALTER TYPE … DROP / DROP NOT NULL.
Rollback script: `docs/anvil/2026-06-17-f-prod-02-kds-line-undo-rollback.sql`
(drops the RPC, restores the pre-F-PROD-02 trigger body; the enum value is intentionally NOT dropped
— Postgres can't drop an enum value without recreating the type, and an unused label is inert.
Normal rollback = Vercel code revert; the DB additions are inert without the code.)
PITR confirmed: N/A — no destructive operation.

## Merge Sequence
1. apply_migration prod: `20260617130000_add_line_undone_enum_value` (File A)
2. apply_migration prod: `20260617130001_kds_line_undo_trigger_and_rpc` (File B)
3. Merge PR #49 → Vercel auto-deploys
4. Post-deploy @critical smoke incl. `04-kds-line-undo` + `03-kds-butcher-flow`

## Verdict
✅ CLEARED FOR PRODUCTION — all real-DB layers green, hard gate satisfied, preview smoke green
   (10/10 runnable @critical passed; reopen-warning E2E conditionally skipped on this seed, proven
   at integration + pgTAP + unit). Cleared to ship via the merge sequence below.

Preview-environment note (resolved): the first preview builds came up before the Supabase preview
branch's env vars were injected → `/api/auth/team` 500 "supabaseUrl is required" and the smoke
fail-closed at the DB identity probe. A later redeploy (built after the branch went ACTIVE_HEALTHY)
carried the env; preview then served 200 + seeded users and the smoke ran green. Fresh-preview-branch
env-injection timing, not a code defect. (Belt-and-braces for future units: wait for a redeploy whose
build started after the Supabase branch reports ACTIVE_HEALTHY before smoking.)
