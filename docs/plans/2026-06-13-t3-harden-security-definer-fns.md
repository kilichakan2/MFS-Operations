# T3 — Harden the SECURITY DEFINER functions

- **Date:** 2026-06-13
- **Phase:** FORGE (planned at Gate 1, approved by Hakan)
- **Type:** Single database migration — DCL (`REVOKE`/`GRANT`) + `ALTER FUNCTION` only. Schema-level. **No app code, ports, adapters, or `package.json` changes.**
- **Roadmap line:** `docs/plans/2026-06-12-sixteen-day-roadmap.md` §"T3 — harden the SECURITY DEFINER functions" (STATUS: queued → this plan).

> **🗣 In plain English:** Seven helper routines live inside the database. Some of them run with god-mode privileges (they can read and change data the caller normally can't touch), and right now _anyone_ holding the public website key is allowed to call them. This task locks the doors: we take away the right-to-run from the anonymous public for the dangerous ones, keep it only for the exact callers that genuinely need it, and we also nail down a fiddly security setting on four of them that a code scanner keeps flagging. We change zero application code — it's all done with database permission commands in one migration file.

---

## Goal

Close two database-advisor security findings against the seven functions in schema `public`, with **zero behaviour change** to the live application:

1. **`function_search_path_mutable` (×4)** — pin `search_path = public` on the four functions that currently have a mutable search path, matching the convention the other three already use.
2. **`anon_security_definer_function_executable` (×4)** — revoke `EXECUTE` (including the catch-all `PUBLIC` grant) from `anon`/`authenticated` on the four `SECURITY DEFINER` functions, retaining only the grants the app, the database triggers, and the RLS policies actually need.

> **🗣 In plain English:** Two automated security warnings are flagging these routines. Warning one: four routines don't have a setting locked down that stops a certain class of trick attack — we lock it. Warning two: four powerful routines are callable by the anonymous public — we revoke that, leaving only the legitimate callers able to run them.

---

## Domain terms (plain English)

- **`SECURITY DEFINER` function** — a database routine that runs with the _creator's_ (owner's) privileges, not the caller's. **🗣 In plain English:** it runs in god-mode regardless of who calls it — which is exactly why we must be careful about who is allowed to call it.
- **`SECURITY INVOKER` function** — runs with the _caller's_ privileges. The opposite. (We are NOT converting any function's definer/invoker mode in T3.)
- **`search_path`** — the ordered list of schemas Postgres searches when a function references an unqualified table/function name. If "mutable", an attacker who can set their own `search_path` can sometimes trick a god-mode function into running their object instead of the intended one. Pinning it to `public` removes that lever. **🗣 In plain English:** a setting that tells the routine "only look for tables in the official cupboard, never the caller's cupboard." Leaving it unset is the lever an attacker would pull; we glue it shut.
- **`EXECUTE` ACL / `GRANT` / `REVOKE`** — Postgres permissions controlling who may run a function. **🗣 In plain English:** the guest list for "who is allowed to call this routine."
- **`PUBLIC` grant** — a special catch-all meaning "every role, including `anon`". Revoking the _named_ `anon` grant alone is NOT enough — `anon` inherits `EXECUTE` through `PUBLIC` too. Every `REVOKE` here MUST include `PUBLIC`. **🗣 In plain English:** "everyone" is its own entry on the guest list; deleting a named guest doesn't help if "everyone" is still on the list — so we delete "everyone" too.
- **`anon` / `authenticated` / `service_role`** — the three PostgREST database roles. `anon` = a request carrying only the public website key (logged-out / untrusted). `authenticated` = a logged-in user's JWT. `service_role` = the app's own privileged backend key, which bypasses RLS. **🗣 In plain English:** anon = the public, authenticated = a logged-in person, service_role = the app's own trusted back-office key.
- **Trigger function** — a routine Postgres fires automatically before/after a row change. Trigger functions fire **without** the triggering role needing `EXECUTE` on them. **🗣 In plain English:** an automatic routine that runs by itself when a row changes — nobody "calls" it, so removing call-permission doesn't stop it.

---

## Compliance / security flags

- This is a **security-hardening** migration touching the production auth surface (definer functions + RLS-relevant grants). Per the memory note "FORGE+ANVIL for production work," it runs the full FORGE loop + ANVIL. This plan is the Order/Plan phase.
- **`is_admin()` residual warning is a DELIBERATE, documented exception.** After this migration, `authenticated` deliberately retains `EXECUTE` on `is_admin()` because that function is referenced inside RLS policies on 13 tables and F-RLS-03 (Day 4) routes authenticated callers through those policies. The advisor `authenticated_security_definer_function_executable` count therefore lands at **1 (is_admin only)** by design — not zero. This is recorded here and must be echoed in the ANVIL report so the residual `=1` is not mistaken for an incomplete migration.

> **🗣 In plain English:** one warning will _intentionally_ remain after we're done — on the `is_admin` routine — because logged-in users genuinely need to run it for the next security task (Day 4) to work. We're writing that down loudly so nobody later thinks the job was left half-finished.

---

## ADR conflicts

**None.** ADR-0004 (RLS vs service-role security model) _anticipates_ exactly this:

- It names F-RLS-03 as "Introduce the per-request authenticated Supabase client" and the broader plan routes authenticated callers through RLS policies — those policies invoke `is_admin()`, which is why this plan retains `authenticated` `EXECUTE` on `is_admin()`. Preserving that grant is **consistent with**, not in conflict with, ADR-0004.
- ADR-0004's target keeps `service_role` available behind `requireServiceRole()`; this plan retains `service_role` `EXECUTE` on the two app-called RPCs (`replace_agreement_lines`, and `haccp_search`'s search-path pin), which matches.
- ADR-0002 (hexagonal shape) is untouched: this is pure Postgres DCL/DDL, no app-layer files change, so the rip-out test is unaffected (see rip-out note below).

> **🗣 In plain English:** This plan does not contradict any past architecture decision. In fact, our written security plan (ADR-0004) already expects this exact step and explains why we keep the `is_admin` permission for logged-in users.

---

## Live ground truth (authoritative — the migration FILES are STALE)

Queried from prod `uqgecljspgtevoylwkep` this session. The committed migration files (`20260530_001_…`, `20260601_001_…`, `20260101000000_baseline.sql`) do **NOT** reflect current live grants/search_path and must NOT be trusted for current state. The drift guards in this migration (below) re-read live `pg_proc`/`proacl` at apply time, so a stale file cannot cause a silent wrong-state apply.

| #   | function                    | signature       | DEFINER?     | search_path pinned? | current live EXECUTE ACL                  |
| --- | --------------------------- | --------------- | ------------ | ------------------- | ----------------------------------------- |
| 1   | `replace_agreement_lines`   | `(uuid, jsonb)` | **YES**      | NO (mutable)        | PUBLIC, anon, authenticated, service_role |
| 2   | `is_admin`                  | `()`            | **YES**      | yes (=public)       | PUBLIC, anon, authenticated, service_role |
| 3   | `orders_audit_trigger`      | `()`            | **YES**      | yes (=public)       | PUBLIC, anon, authenticated, service_role |
| 4   | `order_lines_audit_trigger` | `()`            | **YES**      | yes (=public)       | PUBLIC, anon, authenticated, service_role |
| 5   | `generate_order_reference`  | `()`            | no (INVOKER) | NO (mutable)        | PUBLIC, anon, authenticated, service_role |
| 6   | `haccp_search`              | `(text)`        | no (INVOKER) | NO (mutable)        | PUBLIC, anon, authenticated, service_role |
| 7   | `set_updated_at`            | `()`            | no (INVOKER) | NO (mutable)        | PUBLIC, anon, authenticated, service_role |

**Caller facts (verified by codebase sweep this session):**

- `replace_agreement_lines` — called at `app/api/pricing/[id]/lines/replace/route.ts:81` via `supabase.rpc('replace_agreement_lines', …)` on the **service-role** client (`supabaseService` from `lib/supabase.ts`). Mutates pricing. **MUST keep `service_role` EXECUTE.**
- `is_admin` — NOT called from app code. Referenced inside RLS policy definitions on 13 tables (audit*log, complaints, customers, discrepancies, products, users, visits) in `supabase/migrations/20260101000000_baseline.sql`. A policy calling it requires the \_querying* role to have `EXECUTE`. F-RLS-03 (Day 4) routes authenticated callers through those policies. It is `SECURITY DEFINER` because it reads role data the caller can't see directly — it **CANNOT** be switched to INVOKER. **MUST keep `authenticated` + `service_role` EXECUTE; revoke PUBLIC + anon.**
- `orders_audit_trigger`, `order_lines_audit_trigger` — trigger-only (attached via `CREATE TRIGGER` in `20260530_001_order_pipeline_schema.sql`, redefined in `20260601_001_fix_session_var_and_audit_security.sql`). Trigger functions fire **WITHOUT** the triggering role needing `EXECUTE`, so revoking caller `EXECUTE` does not break them.
- `generate_order_reference` — used as the `DEFAULT` value of the `orders.reference` column (`20260530_001_…`). INVOKER → search-path pin only; no grant change in scope (still gets the pin in Pass A).
- `haccp_search` — called at `app/api/haccp/search/route.ts:26` via service-role `supabase.rpc('haccp_search', …)`. INVOKER → search-path pin only.
- `set_updated_at` — `updated_at` BEFORE-UPDATE trigger (e.g. on `price_agreements`). INVOKER → search-path pin only.

---

## Exact file to change

**One new file:** `supabase/migrations/20260613020000_harden_security_definer_fns.sql`

> **🗣 In plain English:** We add exactly one new file — a database migration script. It uses a FULL 14-digit timestamp (`20260613020000`) rather than the repo's older `YYYYMMDD_NNN` style, because the Supabase CLI reads a migration's version from the digits before the first underscore — so `20260613_001` (T2, shipped today) and a `20260613_002` would BOTH register as version `20260613` and collide. A full timestamp is unique and sorts cleanly after T2. (The `YYYYMMDD_NNN` collision is logged to BACKLOG; T2's already-shipped name is grandfathered as the sole `20260613`.) Nothing else in the codebase is edited.

This is the single source of truth, applied to **local** (`npm run db:reset`) and then to **prod** (Supabase MCP `apply_migration`). No other file is created or edited by the implementer. (This plan doc itself is the only other artefact, and it is written by the planner, not the implementer.)

---

## Per-function target end-state (the contract ANVIL verifies)

| function                              | DEFINER? | search_path after       | EXECUTE granted to (after)                                     | revoked from                | why each retained grant is retained                                                                                                                                                                                                                  |
| ------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replace_agreement_lines(uuid,jsonb)` | YES      | `public` (newly pinned) | **service_role**                                               | PUBLIC, anon, authenticated | App calls it on the service-role client to mutate pricing (`…/replace/route.ts:81`). Removing service_role breaks pricing replace.                                                                                                                   |
| `is_admin()`                          | YES      | `public` (already)      | **authenticated, service_role**                                | PUBLIC, anon                | RLS policies on 13 tables call it; F-RLS-03 needs authenticated callers to run those policies. service_role kept for admin/RLS-bypass paths. anon never needs it.                                                                                    |
| `orders_audit_trigger()`              | YES      | `public` (already)      | _(none required; service_role grant is don't-care — see note)_ | PUBLIC, anon, authenticated | Trigger fires without caller EXECUTE; no role needs the grant. We revoke PUBLIC/anon/authenticated. service_role grant is optional to keep or drop — **do not** let dropping it be confused with breaking the trigger; either way the trigger fires. |
| `order_lines_audit_trigger()`         | YES      | `public` (already)      | _(same as orders_audit_trigger)_                               | PUBLIC, anon, authenticated | Same reasoning as `orders_audit_trigger`.                                                                                                                                                                                                            |
| `generate_order_reference()`          | no       | `public` (newly pinned) | _(grants unchanged — INVOKER, out of grant scope)_             | —                           | INVOKER; used as a column DEFAULT. Pass A pins search_path only; grants left as-is.                                                                                                                                                                  |
| `haccp_search(text)`                  | no       | `public` (newly pinned) | _(grants unchanged — INVOKER, out of grant scope)_             | —                           | INVOKER; app calls it on service_role client. Pass A pins search_path only.                                                                                                                                                                          |
| `set_updated_at()`                    | no       | `public` (newly pinned) | _(grants unchanged — INVOKER, out of grant scope)_             | —                           | INVOKER trigger; Pass A pins search_path only.                                                                                                                                                                                                       |

**Decision on the two audit-trigger `service_role` grants:** the spec marks it "don't-care." **This plan recommends REVOKING `service_role` too** on both audit-trigger functions (revoke from PUBLIC, anon, authenticated, **and** service_role), leaving zero direct callers — because nothing ever calls them directly (they only fire as triggers), so the smallest blast radius is zero grants. The verification DO-block (Pass C) asserts the audit-trigger functions have an EMPTY effective caller ACL afterward and that an `orders` INSERT still writes an audit row (proving the trigger fires regardless). If ANVIL prefers to keep service_role for symmetry, that is acceptable and non-breaking — but the assertion below is written for the zero-grant end state; ANVIL must adjust the assertion if that choice changes.

> **🗣 In plain English:** For the two automatic audit routines, nobody ever calls them by hand — they only run on their own when an order changes. So we strip the call-permission down to nobody. We then prove an order still saves AND still writes an audit-trail entry, which proves the automatic routine still fires even with no call-permission left.

---

## Forward migration SQL (full)

The implementer writes the file below verbatim (header style matches `20260611_001` / `20260613_001`). **Exact signatures everywhere** so overloaded functions can never be ambiguously targeted.

```sql
-- ============================================================
-- T3 — Harden the SECURITY DEFINER functions
-- ============================================================
--
-- Closes two advisor findings against schema public, ZERO app
-- behaviour change:
--   (A) function_search_path_mutable x4  -> pin search_path=public
--       on the 4 mutable functions (matches the existing convention
--       the other 3 already use; PostgREST already runs effectively
--       with search_path=public so this is a no-op at runtime).
--   (B) anon_security_definer_function_executable x4 -> revoke
--       EXECUTE (incl. the PUBLIC catch-all) from anon/authenticated
--       on the 4 SECURITY DEFINER functions, keeping ONLY the grants
--       the app / triggers / RLS policies actually need.
--
-- DELIBERATE residual: is_admin() keeps EXECUTE for `authenticated`
-- (RLS policies on 13 tables call it; F-RLS-03 needs it). So the
-- advisor authenticated_security_definer_function_executable count
-- ends at 1 (is_admin only) BY DESIGN, not by omission.
--
-- ADDITIVE / non-destructive: no DROP, no body change, no data
-- change. Zero downtime. PITR NOT required (rollback = re-GRANT,
-- see plan §Rollback).
--
-- Exact signatures used in every statement (overloaded-safe).
-- Live grants verified against prod uqgecljspgtevoylwkep this
-- session; the older migration FILES are stale — the guards below
-- re-read pg_proc/proacl at apply time, so stale files cannot cause
-- a silent wrong-state apply.
-- ============================================================

-- ─── Pre-state drift guard: abort unless the 7 expected functions
--     exist with the expected definer mode. Fail-closed. ──
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT coalesce(array_agg(want ORDER BY want), ARRAY[]::text[])
    INTO v_missing
  FROM (VALUES
    ('replace_agreement_lines(p_agreement_id uuid, p_lines jsonb)'),
    ('is_admin()'),
    ('orders_audit_trigger()'),
    ('order_lines_audit_trigger()'),
    ('generate_order_reference()'),
    ('haccp_search(query text)'),
    ('set_updated_at()')
  ) AS w(want)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = w.want
  );

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T3 guard: expected functions missing/renamed (drift): %', v_missing;
  END IF;

  -- Definer-mode guard: the 4 we treat as SECURITY DEFINER must be so.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND (p.proname||'('||pg_get_function_identity_arguments(p.oid)||')') IN
          ('replace_agreement_lines(p_agreement_id uuid, p_lines jsonb)','is_admin()',
           'orders_audit_trigger()','order_lines_audit_trigger()')
      AND p.prosecdef = false
  ) THEN
    RAISE EXCEPTION 'T3 guard: a function expected to be SECURITY DEFINER is INVOKER (drift)';
  END IF;
  -- NOTE: generate_order_reference is deliberately NOT in the definer-mode list above.
  -- It is INVOKER in prod but DEFINER in the migration files (out-of-band prod drift);
  -- Pass A normalizes it to INVOKER in every environment, so its mode is not pre-asserted.

  RAISE NOTICE 'T3 pre-guard passed: 7 functions present, 4 definer-mode confirmed.';
END $$;

-- ============================================================
-- PASS A — pin search_path = public on the 4 mutable functions
-- (no body change; clears function_search_path_mutable x4)
-- ============================================================
ALTER FUNCTION public.generate_order_reference()                 SET search_path = public;
ALTER FUNCTION public.haccp_search(text)                          SET search_path = public;
ALTER FUNCTION public.replace_agreement_lines(uuid, jsonb)        SET search_path = public;
ALTER FUNCTION public.set_updated_at()                            SET search_path = public;

-- Drift reconciliation: generate_order_reference is INVOKER in prod but DEFINER in
-- the migration files (prod was altered out-of-band). Normalize every environment to
-- prod's validated, least-privilege INVOKER state. No-op on prod; converts local/preview
-- DEFINER->INVOKER. Safe: the function only runs as the orders.reference column DEFAULT
-- during INSERTs, which the app performs as service_role (full access). Prod has run it as
-- INVOKER successfully. This makes the advisor outcome identical across all environments
-- and removes a phantom anon-definer finding on local/preview. (Broader prod<>migrations
-- drift logged to BACKLOG.)
ALTER FUNCTION public.generate_order_reference() SECURITY INVOKER;

-- ============================================================
-- PASS B — revoke EXECUTE (incl. PUBLIC) on the 4 SECURITY
-- DEFINER functions, keeping exactly what is needed.
-- ============================================================

-- replace_agreement_lines: KEEP service_role (app rpc mutates pricing).
REVOKE EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) FROM authenticated;
-- (service_role retained — not revoked)

-- is_admin: KEEP authenticated + service_role (RLS policies / F-RLS-03).
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
-- (authenticated + service_role retained — not revoked)

-- orders_audit_trigger: trigger-only, no direct caller needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM service_role;

-- order_lines_audit_trigger: trigger-only, no direct caller needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM service_role;

-- ============================================================
-- PASS C — post-state verification. Re-read pg_proc.proconfig
-- (search_path) and the effective EXECUTE ACL, RAISE if the
-- end-state is not EXACTLY as intended. Fail-closed.
-- ============================================================
DO $$
DECLARE
  v_bad text[] := ARRAY[]::text[];

  -- helper: does role have EXECUTE on a function oid?
  --   has_function_privilege(role, oid, 'EXECUTE') accounts for the
  --   PUBLIC catch-all automatically, so it is the correct effective check.
  o_replace oid;
  o_isadmin oid;
  o_otrig   oid;
  o_oltrig  oid;
  o_genref  oid;
  o_haccp   oid;
  o_setupd  oid;
BEGIN
  SELECT p.oid INTO o_replace FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='replace_agreement_lines'
      AND pg_get_function_identity_arguments(p.oid)='p_agreement_id uuid, p_lines jsonb';
  SELECT p.oid INTO o_isadmin FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_admin' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_otrig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='orders_audit_trigger' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_oltrig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='order_lines_audit_trigger' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_genref FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='generate_order_reference' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_haccp FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='haccp_search' AND pg_get_function_identity_arguments(p.oid)='query text';
  SELECT p.oid INTO o_setupd FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_updated_at' AND pg_get_function_identity_arguments(p.oid)='';

  -- ── search_path pinned to public on all 4 (proconfig contains search_path=public) ──
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_genref) THEN
    v_bad := v_bad || 'generate_order_reference: search_path NOT pinned to public'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_haccp) THEN
    v_bad := v_bad || 'haccp_search: search_path NOT pinned to public'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_replace) THEN
    v_bad := v_bad || 'replace_agreement_lines: search_path NOT pinned to public'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_setupd) THEN
    v_bad := v_bad || 'set_updated_at: search_path NOT pinned to public'; END IF;
  -- and the 3 already-pinned definer fns stay pinned
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_isadmin) THEN
    v_bad := v_bad || 'is_admin: search_path NOT public (regression)'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_otrig) THEN
    v_bad := v_bad || 'orders_audit_trigger: search_path NOT public (regression)'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_oltrig) THEN
    v_bad := v_bad || 'order_lines_audit_trigger: search_path NOT public (regression)'; END IF;

  -- ── generate_order_reference normalized to SECURITY INVOKER in every env (drift fix) ──
  IF (SELECT prosecdef FROM pg_proc WHERE oid=o_genref) THEN
    v_bad := v_bad || 'generate_order_reference: still SECURITY DEFINER (normalize to INVOKER failed)'; END IF;

  -- ── replace_agreement_lines: service_role YES; anon/authenticated/public NO ──
  IF NOT has_function_privilege('service_role', o_replace, 'EXECUTE') THEN
    v_bad := v_bad || 'replace_agreement_lines: service_role LOST execute (app would break)'; END IF;
  IF has_function_privilege('anon', o_replace, 'EXECUTE') THEN
    v_bad := v_bad || 'replace_agreement_lines: anon STILL has execute'; END IF;
  IF has_function_privilege('authenticated', o_replace, 'EXECUTE') THEN
    v_bad := v_bad || 'replace_agreement_lines: authenticated STILL has execute'; END IF;

  -- ── is_admin: authenticated YES, service_role YES; anon NO ──
  IF NOT has_function_privilege('authenticated', o_isadmin, 'EXECUTE') THEN
    v_bad := v_bad || 'is_admin: authenticated LOST execute (F-RLS-03 / RLS policies would break)'; END IF;
  IF NOT has_function_privilege('service_role', o_isadmin, 'EXECUTE') THEN
    v_bad := v_bad || 'is_admin: service_role LOST execute'; END IF;
  IF has_function_privilege('anon', o_isadmin, 'EXECUTE') THEN
    v_bad := v_bad || 'is_admin: anon STILL has execute'; END IF;

  -- ── both audit triggers: NO caller execute for anon/authenticated/service_role ──
  IF has_function_privilege('anon', o_otrig, 'EXECUTE')          THEN v_bad := v_bad || 'orders_audit_trigger: anon STILL has execute'; END IF;
  IF has_function_privilege('authenticated', o_otrig, 'EXECUTE') THEN v_bad := v_bad || 'orders_audit_trigger: authenticated STILL has execute'; END IF;
  IF has_function_privilege('service_role', o_otrig, 'EXECUTE')  THEN v_bad := v_bad || 'orders_audit_trigger: service_role STILL has execute'; END IF;
  IF has_function_privilege('anon', o_oltrig, 'EXECUTE')          THEN v_bad := v_bad || 'order_lines_audit_trigger: anon STILL has execute'; END IF;
  IF has_function_privilege('authenticated', o_oltrig, 'EXECUTE') THEN v_bad := v_bad || 'order_lines_audit_trigger: authenticated STILL has execute'; END IF;
  IF has_function_privilege('service_role', o_oltrig, 'EXECUTE')  THEN v_bad := v_bad || 'order_lines_audit_trigger: service_role STILL has execute'; END IF;

  IF array_length(v_bad, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T3 post-check FAILED: %', v_bad;
  END IF;

  RAISE NOTICE 'T3 post-check passed: search_path pinned x4, definer grants exactly as intended, is_admin authenticated retained by design.';
END $$;
```

> **🗣 In plain English:** The script does three things and then checks its own work. First it refuses to run unless all seven routines are present and the four powerful ones really are in god-mode (so a stale file can't make it touch the wrong thing). Then it locks the search-path setting on four routines and revokes call-permission on the four powerful ones — keeping only the exact callers each one needs. Finally it re-reads the live permissions and throws a loud error if anything is even slightly off — so a half-done or wrong apply aborts instead of silently shipping.

> **Implementer note on `set_updated_at` ambiguity:** if `set_updated_at()` is overloaded or has a non-empty identity-args signature in any environment, the post-check `SELECT … oid` for it will return NULL and the `proconfig` assertion will error. The live ground truth shows `()` (no args). If a drift environment differs, the implementer must surface it, not silence it.

---

## Rollback snippet (separate; PITR NOT required)

Re-grant `EXECUTE` to the revoked roles, restoring the pre-migration "PUBLIC + anon + authenticated + service_role" state. The search-path pins are non-breaking and may be LEFT in place on rollback; both options shown.

```sql
-- ── Rollback T3: restore pre-migration EXECUTE grants ──
GRANT EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin()                            TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orders_audit_trigger()                TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_lines_audit_trigger()           TO PUBLIC, anon, authenticated, service_role;

-- ── OPTIONAL: also revert the search_path pins (only if a FULL revert is wanted;
--    leaving them pinned is non-breaking and is the recommended default). ──
-- ALTER FUNCTION public.generate_order_reference()          RESET search_path;
-- ALTER FUNCTION public.haccp_search(text)                  RESET search_path;
-- ALTER FUNCTION public.replace_agreement_lines(uuid,jsonb) RESET search_path;
-- ALTER FUNCTION public.set_updated_at()                    RESET search_path;
```

> **🗣 In plain English:** If anything goes wrong, undo is instant: we hand the call-permission back to everyone it used to belong to. No data is ever touched by this migration, so there is nothing to restore from backup — that's why the heavy "point-in-time restore" safety net isn't needed. The search-path locks are harmless, so we'd normally leave them on even during a rollback; the commented lines show how to fully revert them if ever wanted.

---

## Step-by-step apply sequence (local → verify → prod)

1. **Write the file.** Implementer creates `supabase/migrations/20260613020000_harden_security_definer_fns.sql` with the forward SQL above, verbatim.
   - **🗣 In plain English:** Save the migration script into the project.
2. **Local apply.** `npm run db:reset` (re-runs all migrations + seed on local Supabase). Confirm the run completes and the three `RAISE NOTICE` lines (pre-guard, none here in Pass B, post-check) appear — the post-check `RAISE NOTICE` is the green light.
   - **🗣 In plain English:** Run it on the throwaway local copy of the database first. Watch for the "post-check passed" message — that's the all-clear.
3. **Local advisor recheck.** Run Supabase `get_advisors` (security lint) against local / or inspect grants directly. Expect: `function_search_path_mutable` 4→0; `anon_security_definer_function_executable` 4→0; `authenticated_security_definer_function_executable` 4→1 (is_admin only).
   - **🗣 In plain English:** Re-run the security scanner on the local copy and confirm the warnings dropped exactly as planned (one intentionally stays, on `is_admin`).
4. **Local app smoke** (see ANVIL matrix) — at minimum: pricing-replace path, haccp_search, an orders INSERT (audit row written), a price_agreements UPDATE (updated_at bumped).
   - **🗣 In plain English:** Poke the live app features that touch these routines and confirm they still work on the local copy.
5. **Prod apply via MCP.** Apply the SAME file through Supabase MCP `apply_migration` to prod `uqgecljspgtevoylwkep`. The in-file drift guards re-validate live state and fail-close if prod has drifted from the ground truth.
   - **🗣 In plain English:** Apply the identical script to the real production database. If production has somehow changed since we measured it, the built-in guards abort instead of doing damage.
6. **Prod advisor recheck.** `get_advisors` on prod → same expected deltas as step 3.
   - **🗣 In plain English:** Re-run the security scanner on production and confirm the same result.
7. **Prod app smoke** — repeat the four-feature smoke against prod (or rely on Gate-4 preview smoke per project convention). Confirm `is_admin` callable by authenticated and NOT by anon.
   - **🗣 In plain English:** Confirm the real app's affected features still work in production, and double-check the logged-in-only routine is reachable by logged-in users but not by the anonymous public.

---

## ANVIL verification matrix

| #   | check                                                | tool / method                                                                            | expected                                                                                                           |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| V1  | `function_search_path_mutable`                       | `get_advisors` (security)                                                                | 4 → **0**                                                                                                          |
| V2  | `anon_security_definer_function_executable`          | `get_advisors` (security)                                                                | 4 → **0**                                                                                                          |
| V3  | `authenticated_security_definer_function_executable` | `get_advisors` (security)                                                                | 4 → **1** (is_admin only — DELIBERATE, documented)                                                                 |
| V4  | in-file post-check DO-block                          | migration apply log                                                                      | `RAISE NOTICE 'T3 post-check passed…'` present; no `EXCEPTION`                                                     |
| V5  | pricing replace still works                          | `POST app/api/pricing/[id]/lines/replace` (service-role rpc → `replace_agreement_lines`) | 200, lines replaced                                                                                                |
| V6  | haccp_search still works                             | `GET app/api/haccp/search?q=…` (service-role rpc → `haccp_search`)                       | 200, results returned                                                                                              |
| V7  | orders INSERT fires DEFAULT + both audit triggers    | insert an order                                                                          | order created with a `reference` (generate_order_reference DEFAULT) AND an audit row written (both triggers fired) |
| V8  | price_agreements UPDATE bumps updated_at             | update a price_agreements row                                                            | `updated_at` advances (set_updated_at trigger)                                                                     |
| V9  | is_admin reachable by authenticated, not anon        | `has_function_privilege('authenticated', …)` = true; `('anon', …)` = false               | as stated (so F-RLS-03 won't break; anon locked out)                                                               |

> **🗣 In plain English:** ANVIL's checklist: confirm the security warnings moved exactly to the expected numbers (including the one we keep on purpose), confirm the migration's own self-check passed, and confirm the four real app behaviours still work — placing an order still auto-generates its reference and writes an audit-trail line, editing pricing still works, the HACCP search still works, and updating a price still bumps its timestamp. Plus: logged-in users can still run the admin-check routine, the anonymous public cannot.

---

## TDD / test plan

This is a DCL/DDL migration with no application-code change, so the "tests" are (a) the in-file fail-closed assertions and (b) the ANVIL smoke matrix — there is no new unit/port test to write.

- **Self-asserting migration (red→green built in):** the Pass C DO-block IS the test. If end-state grants/search_path are wrong, the migration `RAISE EXCEPTION`s and the apply fails — the migration cannot "pass" in a wrong state. This is the same fail-closed pattern T2 used.
- **No new vitest/Playwright spec is required by scope.** The existing integration/e2e order-pipeline and pricing smokes (V5–V8) already exercise every retained path; ANVIL runs them as regression. If ANVIL judges a thin integration assertion useful (e.g. asserting anon cannot rpc `replace_agreement_lines`), that is an additive, optional test and must not change the migration.
- **Pre-apply expectation (the "red"):** before the migration, anon _can_ (via PUBLIC) call `replace_agreement_lines` / `is_admin`; after (the "green"), it cannot. V9 + V2 capture this transition.

> **🗣 In plain English:** This change is database-permissions only, so there's no new app code to write tests for. Instead, the migration tests itself — it checks its own result and refuses to finish if anything is wrong. Our existing automated app tests (placing orders, editing pricing, searching HACCP) act as the safety regression net.

---

## Acceptance criteria

1. File `supabase/migrations/20260613020000_harden_security_definer_fns.sql` exists, applied identically to local and prod.
2. Advisor deltas: V1 (4→0), V2 (4→0), V3 (4→1 is_admin by design).
3. In-file post-check passes on both local and prod (no `EXCEPTION`).
4. All four app smokes green (V5–V8): pricing replace, haccp_search, orders INSERT (+audit row), price_agreements UPDATE (+updated_at).
5. `is_admin()` callable by authenticated, NOT by anon (V9).
6. No app-code / port / adapter / `package.json` change — rip-out cost unchanged (see note).
7. ANVIL report explicitly records the deliberate `authenticated_security_definer_function_executable = 1 (is_admin)` residual.

---

## Out of scope (explicit)

- **No SECURITY DEFINER → INVOKER conversions — ONE approved exception (Hakan, 2026-06-13):** `generate_order_reference()` is normalized to `SECURITY INVOKER` to reconcile a prod-vs-migration-files drift (prod is already INVOKER; the files build it as DEFINER). This is a reconciliation toward prod's validated state, not a new conversion. `is_admin()` specifically CANNOT be converted (it must read role data the caller can't see) and is NOT touched. No other definer-mode change.
- **No function body changes.** Pass A is `ALTER FUNCTION … SET search_path` only; no `CREATE OR REPLACE`.
- **No RLS policy work.** Per-table read/write policies land per-domain in F-RLS-04a..i; F-RLS-03 (the authenticated client) is Day 4. T3 only _preserves_ the `is_admin` grant those depend on.
- **No grant changes to the 3 INVOKER functions' EXECUTE ACLs** (`generate_order_reference`, `haccp_search`, `set_updated_at`) — they receive the search_path pin only.
- **No app code, ports, adapters, wiring, or dependencies.** No `lib/**`, `app/**`, `components/**`, or `package.json` edits.
- **No DROP / data change / `ALTER TYPE`.** Non-destructive; PITR not required.

> **🗣 In plain English:** We are NOT rewriting any routine's internals, NOT flipping any routine from god-mode to caller-mode, NOT adding the per-table access rules (those come later in the sprint), and NOT touching any application code. This is strictly a permissions-and-one-setting migration.

---

## Risk Assessment

> **🗣 In plain English:** What could go wrong, how bad, and how we've already defended against it. The single biggest risk is revoking a permission that something quietly needs — so most of the work below is proving, per routine, exactly who still needs to call it.

### Top risk — accidentally revoking a grant the app / triggers / policies need (per-function enumeration)

| function                                                                    | retained grant                       | what breaks if wrongly revoked                                                                                                                                | why it is safe here                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `replace_agreement_lines(uuid,jsonb)`                                       | **service_role**                     | Pricing replace (`…/replace/route.ts:81`) returns an EXECUTE-denied error — pricing edits fail in prod.                                                       | We revoke only PUBLIC/anon/authenticated; service_role is explicitly NOT in the REVOKE list, and post-check V5 + the DO-block assert service_role retains EXECUTE.       |
| `is_admin()`                                                                | **authenticated + service_role**     | RLS policies on 13 tables fail to evaluate for logged-in users → F-RLS-03 (Day 4) breaks; potential authenticated query denials.                              | We revoke only PUBLIC + anon; authenticated/service_role explicitly retained; DO-block + V9 assert authenticated still has EXECUTE. ADR-0004 documents this as required. |
| `orders_audit_trigger()` / `order_lines_audit_trigger()`                    | none (triggers fire without EXECUTE) | If trigger functions DID need caller EXECUTE, an orders INSERT would fail. They do NOT — trigger firing is independent of the triggering role's function ACL. | Verified Postgres semantics + V7 (orders INSERT still writes an audit row) proves the trigger still fires with zero grants.                                              |
| INVOKER trio (`generate_order_reference`, `haccp_search`, `set_updated_at`) | grants untouched                     | N/A — no grant change.                                                                                                                                        | Out of grant scope; only search_path pinned.                                                                                                                             |

- **Severity:** High (a wrong revoke is a prod outage on pricing or on logged-in queries).
- **Mitigation:** exact-signature REVOKEs; per-function retained-grant table above; in-file fail-closed post-check that aborts the apply on any wrong end-state; local-first then prod; ANVIL smoke V5–V9.
- **Must-fix:** the mitigations are baked into the SQL; no open must-fix blocker remains _provided the implementer writes the file verbatim_. The post-check is the enforcement.

### Concurrency / race conditions

- `ALTER FUNCTION` / `REVOKE` take brief locks on the function objects. No long transactions, no table rewrites. A concurrent call landing mid-revoke either completes under the old ACL or is denied under the new one — no corruption, no torn state.
- **Severity:** Low. **Mitigation:** statements are instantaneous metadata changes; run off-peak if convenient but not required. **Must-fix:** no.

### Security

- This migration _reduces_ attack surface (removes anon's ability to call two god-mode functions and pins search_path on four). The one residual (`is_admin` for authenticated) is deliberate and documented.
- A theoretical risk: pinning `search_path=public` could change behaviour if a function relied on resolving a name in a non-public schema. Verified false — all four already run effectively with search_path=public under PostgREST, and the convention is shared with the three already-pinned functions; bodies are unchanged.
- **Severity:** Low (net-positive). **Mitigation:** no body change; advisor recheck; smoke matrix. **Must-fix:** no.

### Data migration

- **None.** No `DROP`, no data write, no schema-shape change. Fully reversible by re-GRANT. PITR not required.
- **Severity:** None. **Must-fix:** no.

### Business-logic flaws

- The only business-logic-adjacent risk is the audit-trigger grant decision. If `service_role` were (incorrectly) required for the audit triggers to fire, revoking it would silently stop audit rows being written — a compliance gap. This is NOT the case (triggers fire regardless of ACL), and V7 asserts an audit row is actually written post-migration, catching any surprise.
- **Severity:** Medium if unverified; reduced to Low by V7's positive assertion. **Mitigation:** V7 checks the audit row is written, not just that the INSERT succeeds. **Must-fix:** no (covered by V7) — but ANVIL must run V7 as a positive assertion, not skip it.

### Launch / Gate blockers

- **No must-fix blockers** that the plan leaves unresolved. The single High risk (wrong revoke) is fully mitigated in-file by the fail-closed post-check and by the ANVIL smoke matrix. The deliberate `is_admin` residual is documented so it is not mistaken for an incomplete migration at Gate.
- The one hard requirement on the implementer: **write the SQL verbatim** (exact signatures, exact retained grants). Deviating from the retained-grant table reintroduces the High risk.

**Risk headline:** No unresolved must-fix risks. Highest residual risk is "wrong revoke breaks pricing or logged-in queries," fully mitigated by exact-signature statements + an in-file fail-closed self-check + the ANVIL smoke matrix. Gate 2 is clear to proceed.

---

## Rip-out / hexagonal note

No application files change — no `lib/domain`, `lib/ports`, `lib/services`, `lib/adapters`, `lib/wiring`, `app/**`, `components/**`, or `package.json`. This is standard Postgres DCL/DDL applied through the existing migration channel. The rip-out test ("replace the DB tomorrow → one adapter + one config line") is **unaffected**: these grants/search_path settings live in the database, behind the Supabase adapter boundary, and no business-layer code references them. Swapping the DB vendor would carry these as schema artefacts, not as app coupling.

> **🗣 In plain English:** This change lives entirely inside the database, behind the wall that separates the app from its database vendor. No app code knows or cares about these permissions, so our "how hard is it to swap the database" test is completely unaffected.
