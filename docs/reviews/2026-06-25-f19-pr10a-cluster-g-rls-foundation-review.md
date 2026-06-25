# Code-critic review — F-19 PR10a (Cluster G / F-RLS-04h HACCP RLS foundation)

- **PR:** #78 — branch `feat/f19-pr10a-cluster-g-rls-foundation`
- **Date:** 2026-06-25
- **Phase:** FORGE Guard (code-critic subagent)
- **Plan:** `docs/plans/2026-06-25-f19-pr10a-cluster-g-rls-foundation.md`

## VERDICT: CLEAR — no blockers. Hand to ANVIL.

The "install the locks, don't turn them on yet" half of the HACCP RLS cutover. Every claim — zero
production change, all 30 tables covered, locks grant active staff and deny everyone else — verified
against the actual files. Full unit suite green (2351/2351), types clean, policy SQL is a faithful
copy of four shipped/proven cutovers with one deliberate, tested upgrade (deny deactivated staff).
Live-fire proof (pgTAP on real Postgres) belongs to ANVIL.

## Static checks
- **Unit:** `npx vitest run` → 2351 passed / 147 files.
- **Touched-test focus:** 68/68 across `haccpServiceForCaller.test.ts`, `haccpService.test.ts`,
  `haccpAssessments.test.ts`, `no-adapter-imports.test.ts`, `filename-convention.test.ts`.
- **Typecheck:** `tsc --noEmit` → clean.
- **pgTAP `015-rls-haccp.test.sql`:** deferred to ANVIL (needs live Postgres); audited statically.
- **Lint:** `no-adapter-imports` pin green in-suite; full ESLint deferred to ANVIL (non-blocking).

## 🔴 Blockers
None.

## 🟡 Warnings (should-fix)
None material. One cosmetic observation (NOT a warning):
- `supabase/tests/015-rls-haccp.test.sql:123,135,148,164,181` — the "active user can DELETE"
  assertions delete the just-inserted row, not a pre-existing seed row, so they prove DELETE
  *executes* under RLS, not that a pre-existing row is deletable. Acceptable: same predicate as the
  independently-proven INSERT.

## 🔵 Architecture notes (follow-up, not blocking)
None new. Pre-existing F-TD-38 (HACCP domain keeps raw snake_case / `as-unknown-as` casts) is
untouched by this diff and stays as logged debt.

## 🟢 Test-quality (positive)
- `tests/unit/wiring/haccpServiceForCaller.test.ts:175-190` — never-memoize test: two calls → two
  mints → two clients, caller A vs B get distinct tokens. Pins the identity-leak failure mode
  (R-CONC-1); would fail loudly if memoization were added.
- `…haccpServiceForCaller.test.ts:153-173` — `submitHaccpDailyCheckForCaller` pins `mint` called
  exactly once, inner corrective-actions service built off the same client (catches double-mint).
- `tests/unit/wiring/haccpService.test.ts:245-291` — flipped guard pins the EXACT 24-export set
  (12 singletons + 12 ForCaller); stronger than the old "no ForCaller exists" check.

## Focus-area findings (the seven high-risk asks)
1. **Policy SQL correctness — VERIFIED.** `current_user_is_active()` (`…rls_policies.sql:74-86`) is a
   byte-for-byte mirror of proven `current_user_is_valid()` (`20260618130000:72-83`) + `AND u.active
   = true`. Same `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, same `OWNER TO
   postgres`, same empty-safe `nullif(current_setting('app.current_user_id', true), '')::uuid` cast
   (empty/absent GUC → NULL → EXISTS FALSE, never throws 22P02), same EXECUTE lockdown (REVOKE
   PUBLIC + anon, GRANT authenticated). Per-table clause shape correct: SELECT/DELETE → USING,
   INSERT → WITH CHECK, UPDATE → BOTH. Counts: 30 SELECT / 30 INSERT / 30 UPDATE / 30 DELETE. No
   `auth.uid()`/`auth.jwt()`/`role IN (...)` leak (only in comments). Did NOT alter the shared helper.
2. **Completeness — VERIFIED, all 30 tables.** Policied-table set == baseline CREATE TABLE set ==
   `20260613000000` RLS-enable set (all 30, byte-identical). No deny-all trap awaiting PR10b.
   Enumerated explicitly (no loop) so future omissions show in the diff.
3. **Additive-only — VERIFIED.** Only `CREATE OR REPLACE FUNCTION` + `DROP POLICY IF EXISTS`
   (idempotency) + `CREATE POLICY` + `REVOKE/GRANT EXECUTE`. No DROP TABLE/TRUNCATE/ALTER TYPE/DROP
   COLUMN/DROP NOT NULL/DELETE in migration or rollback. No PITR gate.
4. **Inert-ness — VERIFIED.** `git diff --name-only` shows zero `app/api/haccp/**` files. No
   singleton removed (only docstring/comment `-` lines). Factories have no caller. Service-role
   bypasses RLS (tables ENABLE, not FORCE) → 120 policies never evaluated on a live request.
5. **Factory correctness — VERIFIED.** Each `…ForCaller` mints per-request (no cache).
   `haccpReportingServiceForCaller` (`:271-280`) keeps xlsx exporter SHARED, only DB port per-caller.
   `submitHaccpDailyCheckForCaller` (`:319-330`) mints one client, inner CA service off same client.
6. **Hexagonal — VERIFIED.** Factories in `lib/wiring/haccp.ts` (sanctioned adapter-importer); vendor
   only via `@/lib/adapters/supabase`; no new dep; `no-adapter-imports` green; rip-out intact.
7. **Test quality — VERIFIED.** pgTAP `plan(55)` == 55 assertions (20 active-CRUD + 10 empty-GUC + 10
   non-existent + 10 inactive + 5 master-key); discriminates 42501 (RLS) from 22P02 (cast) on writes
   → fail-closed, not fail-error. Inactive-user block (`:271-307`) is the new guarantee, explicitly tested.

## Depth verdicts (new/touched modules)
- `lib/wiring/haccp.ts` (12 `…ForCaller`) → **DEEP** — token-mint + client build + per-caller adapter
  binding behind a one-arg `(callerUserId)` interface; not pass-through, not speculative (PR10b is the
  named consumer).
- `…20260625120000_…sql` (`current_user_is_active()`) → **DEEP** — one boolean fn that 120 policies
  key off. No PASS-THROUGH / SPECULATIVE SEAM introduced.

## Artifacts audited
- `supabase/migrations/20260625120000_haccp_authenticated_rls_policies.sql`
- `supabase/migrations/rollback/2026-06-25-f-rls-04h-haccp-rls-foundation-rollback.sql`
- `supabase/tests/015-rls-haccp.test.sql`
- `lib/wiring/haccp.ts`
- `tests/unit/wiring/haccpServiceForCaller.test.ts`, `…/haccpService.test.ts`, `…/haccpAssessments.test.ts`
- `CONTEXT.md`
- Cross-checked: `20260101000000_baseline.sql`, `20260613000000_enable_rls_42_tables.sql`,
  `20260618130000_users_directory_read_for_authenticated.sql`, `lib/wiring/visits.ts`
