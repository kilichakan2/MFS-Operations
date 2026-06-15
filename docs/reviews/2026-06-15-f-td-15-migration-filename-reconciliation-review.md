# Code-critic review — F-TD-15 residual (b) (migration-filename reconciliation)

- **Date:** 2026-06-15
- **Branch:** feat/f-td-15-migration-filename-reconciliation (base main @ 855553e)
- **Reviewer:** code-critic subagent (FORGE Guard)
- **Plan:** docs/plans/2026-06-15-f-td-15-migration-filename-reconciliation.md
- **VERDICT: SHIP** — 0 blockers, 0 warnings, 1 🔵 (pre-existing), 1 🟢 (test has teeth)

## Suite results (run by code-critic)
- `tsc --noEmit` → 0 errors
- `next lint` → 0 warnings/errors
- `npx vitest run tests/unit/migrations/` → 4/4
- full unit suite → 1599 passed / 84 files (1595 + 4 new)
- `db:reset` + integration (126): NOT run by reviewer (no Docker/Supabase stack) — implementer ran both locally green; live ANVIL proof to come.

## 🔴 Blockers — NONE
## 🟡 Warnings — NONE

## Verified clean (the dangerous failure modes)
- **Renames are byte-identical — git blob-hash proven** (old blob on main == new blob on branch) for all 4: order_pipeline_schema `2848feb`, fix_session_var `4cad03d`, order_idempotency_keys `ffa8464`, enable_rls_42_tables `317bd38`. `--stat -M` shows all 4 as rename (100%), 0/0 numstat.
- The 3 untouched migrations match main (baseline `8805ae5`, harden_security_definer_fns `899169b`, db_pre_request_guc_bridge `ef36926`).
- **Ordering preserved:** baseline → 530000000 → 601000000 → 611000000 → 613000000(enable_rls) → 613020000(harden_definer) → 614210221. enable_rls still sorts before harden-definer (the dependency holds). No duplicate 14-digit prefixes.
- **References repointed (live):** ADR-0007:48, roadmap:73, OrdersRepository.ts:48 & 192, lib/orders/types.ts:7. CLAUDE.md convention codified. BACKLOG F-TD-15 closed, F-TD-18 logged.
- **No logic touched** (only doc-comments in lib/). package.json/lock untouched — zero new deps.

## 🟢 Test quality
`tests/unit/migrations/filename-convention.test.ts`: reads the live `supabase/migrations/` dir via readdirSync (not a hardcoded list), asserts `/^\d{14}_[a-z0-9_]+\.sql$/` for every file, guards against vacuous pass (`length > 0`), pins negative cases (`20260613_001_…`, `20260530_001_foo.sql` must NOT match) + a positive case, and re-implements the duplicate-prefix collision guard. Confirmed it would have FAILED on main (4 offenders) → genuine red→green.

## 🔵 Architecture note (pre-existing, non-blocking)
`scripts/strip-order-pipeline.py:4` — docstring prose still mentions `20260530_001_order_pipeline_schema.sql`. The script only opens `supabase/migrations/20260101000000_baseline.sql` (line 22, untouched + valid), so this is a stale comment that resolves to nothing — breaks nothing. Optional cleanup; fold into F-TD-18 or any future migration touch.

## Hexagonal / depth
N/A — migration files + one test + docs; no port/adapter surface, no pass-through introduced. Absence of a port is correct, not a finding.

## Loop-back
None — SHIP. Hand to ANVIL for the live `db:reset` + integration proof and the 2nd-push-stays-healthy preview-branch acceptance.
