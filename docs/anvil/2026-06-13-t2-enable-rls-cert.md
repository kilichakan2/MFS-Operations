# ANVIL Clearance Certificate

Date: 2026-06-13
App: MFS-Operations
Branch: t2-enable-rls-42-tables
PR: #31

Migration under test: `supabase/migrations/20260613_001_enable_rls_42_tables.sql`
Governing decision: ADR-0004 (service-role-everywhere; service-role bypasses RLS, so RLS-enabled + zero-policy = deny-all to anon/authenticated only).
Environment: LOCAL Supabase only (`http://127.0.0.1:54321`). Production NOT touched.

## Test Results (approved matrix V1–V6)

| Check                                   | What it proves                                                         | Measured value                                                                                            | Status |
| --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| V1 — Advisor recheck (dynamic pg_class) | RLS-disabled tables in the 42-set dropped to zero                      | `in_set=42`, `still_disabled=0`, `rls_enabled=42`                                                         | ✅     |
| V2 — No FORCE                           | None of the 42 were FORCE'd (would shut the app out)                   | `forced=0`, `policies=0`                                                                                  | ✅     |
| V3 — Service-role READ                  | Real GET routes still return 200 post-RLS                              | Integration 115/115; e2e:api 2/2 (GET /api/auth/team → 200)                                               | ✅     |
| V4 — Service-role WRITE                 | A real service-role write persists under RLS                           | `road-times.test.ts` INSERT into `customer_road_times` (a T2 table) persisted + read back, inside 115/115 | ✅     |
| V5 — Anon locked out (asymmetry)        | Stranger denied, app allowed, SAME query on a table holding a real row | anon → `[]`; service-role → 1 row (`cash_entries` sentinel)                                               | ✅     |
| V6 — Local-first                        | V1–V5 all green on LOCAL; prod equivalents run at Ship                 | All ran against `127.0.0.1:54321`                                                                         | ✅     |

### V5 evidence (the door is shut to strangers, open to the app)

A committed sentinel row was planted in `cash_entries` (a high-value financial table, one of the 42) via RLS-bypassing SQL, the SAME PostgREST query was issued with each key, then the sentinel was deleted.

Query: `GET /rest/v1/cash_entries?select=id,amount,description&id=eq.a417e57e-0000-0000-0000-00000000ca5e`

- **Anon key (stranger):** `HTTP 200` body `[]`
- **Service-role key (app):** `HTTP 200` body `[{"id":"a417e57e-0000-0000-0000-00000000ca5e","amount":123.45,"description":"T2 ANVIL V5 sentinel — delete me"}]`

Sentinel rows (`cash_entries` + parent `cash_months`) deleted after the test — DB returned to seed state (`remaining=0`).

### Re-confirmation of prior Render/Guard results

- `npm run db:reset` applied clean; both guard NOTICEs fired: "T2 guard passed: exactly 42…" and "T2 post-check passed: all 42 RLS-enabled, none FORCE."
- `npm run test:integration` = 115/115. `npm run test:e2e:api` = 2/2.

## Warnings (non-blocking)

- 🔵 Coverage note: V4's persisted write is on `customer_road_times`; the other 41 tables are proven by the catalog state (RLS-on, zero policies, service-role bypass) rather than a per-table write. Per-domain read/write POLICIES land later (F-RLS-04a..i) — out of scope for T2.
- 🔵 The local Supabase CLI uses the new `sb_publishable_`/`sb_secret_` key format in `supabase status`; the legacy JWT anon/service-role keys (used for the V5 raw REST asymmetry) were sourced from `supabase status -o env`.

## Migration

Type: **Additive** (42× `ENABLE ROW LEVEL SECURITY`, never `FORCE`; no DROP/TRUNCATE/ALTER TYPE/DROP NOT NULL).
Destructive: **No** — PITR **not required**.
Rollback script: `docs/anvil/2026-06-13-t2-enable-rls-rollback.sql` — instant `ALTER … DISABLE ROW LEVEL SECURITY` on the 42, lossless, no PITR needed.

## Merge Sequence (executed by the conductor at Ship — NOT by ANVIL)

1. Apply migration to production FIRST: `supabase db push --project-ref <prod-ref>`
2. Merge PR #31 → Vercel auto-deploys (no app code changed)
3. Smoke: re-run the V1/V2 pg_class measure + V5 anon-vs-service-role asymmetry against production

## Plain-English summary

We switched on the security lock on all 42 exposed tables. Strangers holding the public key now get nothing from them; the app, using its master key, still reads and writes normally — proven with a real financial row. Nothing broke, and switching it off again is a one-line instant reverse if ever needed.

## Production ship record (2026-06-13)

Shipped via FORGE Ship sequence. Migration applied to prod `uqgecljspgtevoylwkep` via Supabase MCP `apply_migration` (`{"success":true}`; both in-migration DO-block guards passed). PR #31 squash-merged to `main` (`90aa565`); branch + Supabase preview branch auto-deleted (no orphans).

Production verification (post-apply):

- **V1 advisor (prod):** `rls_disabled_in_public` ERROR **42 → 0**. Replaced by 42× `rls_enabled_no_policy` at INFO (benign deny-all interim state, as designed). T3 function/extension WARNs unchanged (out of scope).
- **V5 anon-lockout (prod, real data):** anon-key PostgREST read of `cash_entries` (160 rows) → `[]`; `haccp_health_records` (GDPR, 5 rows) → `[]`. Door shut to strangers on live populated tables.
- **App smoke (prod, www.mfsops.com):** `GET /api/kds/orders` → 200; forged unsigned admin cookie → 307 (T1 intact); `/login` → 200. Service-role paths unaffected.
- **Pre-ship preview smoke:** 8/8 @critical on PR #31's RLS-enabled preview branch (probe 4/4).

## Verdict

✅ CLEARED FOR PRODUCTION — shipped & verified live 2026-06-13.
