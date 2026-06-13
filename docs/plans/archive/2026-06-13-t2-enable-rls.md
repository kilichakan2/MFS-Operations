# T2 — Enable Row Level Security (RLS) on the 42 exposed tables

- **Unit:** T2 (sprint Day 2). **Type:** single database migration, schema DDL only.
- **Ships via:** full FORGE + ANVIL (touches production DB).
- **Governing decision:** ADR-0004 (RLS vs service-role security model).
- **Source of truth for the table list:** `docs/rls-audit-2026-06-12.md` §3b.
- **Production project_id:** `uqgecljspgtevoylwkep`.

> **🗣 In plain English:** Right now 42 database tables — including the cash ledger,
> customer pricing, and staff health records — are wide open: anyone holding
> Supabase's public "anon" key can read or change every row by hitting the database's
> auto-generated web API directly, with no app in the way. This change throws the
> deadbolt on all 42 doors at once. It changes no app code, adds no new software, and
> does not touch how the app itself reads or writes data — the app keeps its master
> key (the "service role"). So it locks out strangers without locking out ourselves.
> Zero downtime by design.

---

## 1. Goal

Add **one** Supabase migration that runs `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`
on the 42 public tables that currently have RLS disabled. With RLS on and **no
policies attached**, those tables become deny-all to the `anon` and `authenticated`
Postgres roles, while the `service-role` key (which the entire app uses) continues to
bypass RLS untouched. This closes advisor Finding 2 (`rls_disabled_in_public ×42`)
and drops that ERROR count from 42 to 0.

> **🗣 In plain English:** One file, one job: turn on the lock for 42 tables. We add
> NO rules about "who can see what" in this step — turning the lock on with no rules
> means "nobody outside the app gets in," which is exactly what we want. The detailed
> per-person rules come much later, table-group by table-group.

This is the identical, already-proven-in-production pattern that
`order_idempotency_keys` runs today (`supabase/migrations/20260611_001_order_idempotency_keys.sql`
line 38: `ALTER TABLE order_idempotency_keys ENABLE ROW LEVEL SECURITY` with zero
policies). We are extending that one safe move to 42 more tables.

---

## 2. Hard constraints (locked at FORGE Gate 1 — do not re-litigate)

### 2.1 `ENABLE`, NEVER `FORCE` — the single most important rule

The migration uses `ENABLE ROW LEVEL SECURITY` only. It must **never** use
`FORCE ROW LEVEL SECURITY` on any of the 42 tables.

- `ENABLE` → RLS applies to `anon`/`authenticated`; the table owner and
  **service-role bypass it**. The app (all service-role) is unaffected. Safe, zero-downtime.
- `FORCE` → RLS applies to **everyone, including service-role**. Because these 42
  tables have **no policies**, FORCE would mean deny-all to the app itself. Every
  `/api/cash/*`, `/api/pricing`, `/api/routes`, `/api/haccp/*` query would return
  zero rows or fail. **FORCE takes production DOWN.**

> **🗣 In plain English:** There are two strengths of lock. The right one (ENABLE)
> locks out strangers but still recognises the app's master key. The wrong one (FORCE)
> locks out EVERYONE including the app — and since we have not written any "the app is
> allowed" rules yet, FORCE would make the whole system go blank. We must use ENABLE.
> The word FORCE must not appear anywhere in this migration. This is the #1 risk and
> the verification below explicitly checks for it.

### 2.2 Zero policies in this migration

No `CREATE POLICY` statements. RLS-on with no policy = deny-all to non-service-role.
Per-table read/write policies are **out of scope** and land later per-domain
(F-RLS-04a–i). See §8.

### 2.3 Explicit, count-asserted table list

The migration names all 42 tables explicitly (no dynamic "enable whatever is off"
DO-block over `pg_catalog`), so the diff is auditable line by line. It also includes
a **guard** (a `DO` block) that asserts the live count of RLS-disabled public tables
matches the expected 42 set, and `RAISE EXCEPTION` aborts the migration if drift is
detected since the 2026-06-12 audit (see §4 for the exact guard).

> **🗣 In plain English:** We list every table by name so a reviewer can eyeball
> exactly what gets locked. And we add a safety trip-wire: if the database has changed
> since last week's audit (a table added or removed), the migration refuses to run and
> tells us, rather than quietly locking the wrong set of doors.

### 2.4 Single source of truth — one SQL file, both environments

The migration is **one** `.sql` file under `supabase/migrations/`. The **same file
content** is authoritative for:

- **Local:** `npm run db:reset` applies it to local Supabase.
- **Production:** applied via Supabase MCP `apply_migration` against project
  `uqgecljspgtevoylwkep`, passing the file's contents verbatim — **do not hand-type
  the SQL a second time.**

> **🗣 In plain English:** We write the lock instructions once. The exact same text is
> what runs on the practice database and on the live one. Nobody retypes it — retyping
> is how you get a difference between "what we tested" and "what we shipped."

---

## 3. The migration file

### 3.1 Filename

`supabase/migrations/20260613_001_enable_rls_42_tables.sql`

> **🗣 In plain English:** Filename matches the repo's existing pattern —
> `YYYYMMDD_NNN_short-description.sql`. Confirmed against the four files already in
> `supabase/migrations/` (e.g. `20260611_001_order_idempotency_keys.sql`,
> `20260601_001_fix_session_var_and_audit_security.sql`). `20260613` = today,
> `001` = first migration of the day.

### 3.2 Full SQL (forward migration)

The implementer writes this file **verbatim**. Comment header style matches the
existing migrations (`============` banner + prose explaining the why).

```sql
-- ============================================================
-- T2 — Enable RLS on the 42 exposed public tables
-- ============================================================
--
-- Closes advisor Finding 2 (rls_disabled_in_public x42) from the
-- RLS audit (docs/rls-audit-2026-06-12.md §3b). Each ALTER below
-- turns RLS ON with ZERO policies attached. Per ADR-0004 the app
-- is service-role-everywhere, and service-role BYPASSES RLS — so
-- the app's own queries are unaffected. The effect is deny-all to
-- the anon/authenticated PostgREST roles, which is the entire point:
-- the /rest/v1/<table> endpoints stop serving these tables to anyone
-- holding the public anon key.
--
-- This is the identical, production-proven pattern already running
-- on order_idempotency_keys (20260611_001). Per-table read/write
-- POLICIES are OUT OF SCOPE here and land later per-domain
-- (F-RLS-04a..i).
--
-- HARD CONSTRAINT: ENABLE, never FORCE. FORCE would subject the
-- app's own service-role queries to the (nonexistent) policies and
-- take production down. Do not change ENABLE to FORCE.
--
-- ADDITIVE only — no DROP, no data change, no ALTER TYPE. Zero
-- downtime. PITR not required (state is recoverable by the rollback
-- block in this plan §5; ALTER ... DISABLE is instant).
-- ============================================================

-- ─── Drift guard: abort unless exactly the expected 42 RLS-disabled
--     public tables are present, matching the 2026-06-12 audit set ──
DO $$
DECLARE
  v_expected text[] := ARRAY[
    -- Financial (3)
    'cash_entries','cash_months','cheque_records',
    -- Commercial pricing (3)
    'price_agreements','price_agreement_lines','customer_road_times',
    -- Staff personal / GDPR (3)
    'haccp_health_records','haccp_staff_training','haccp_allergen_training',
    -- Operational / routing / notes (6)
    'routes','route_stops','hub_sentinels','visit_notes','complaint_notes','compliments',
    -- HACCP compliance (27)
    'haccp_suppliers','haccp_corrective_actions','haccp_deliveries',
    'haccp_cold_storage_temps','haccp_documents','haccp_mince_log',
    'haccp_daily_diary','haccp_cleaning_log','haccp_processing_temps',
    'haccp_returns','haccp_calibration_log','haccp_cold_storage_units',
    'haccp_sop_content','haccp_meatprep_log','haccp_allergen_assessment',
    'haccp_allergen_monthly_reviews','haccp_product_specs','haccp_food_defence_plans',
    'haccp_food_fraud_assessments','haccp_recall_config','haccp_annual_reviews',
    'haccp_weekly_review','haccp_monthly_review','haccp_dispatch_log',
    'haccp_time_separation_log','haccp_document_versions','haccp_document_reviews'
  ];
  v_live_disabled  text[];
  v_missing        text[];
  v_unexpected     text[];
BEGIN
  -- Live set of RLS-disabled BASE tables in the public schema.
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO v_live_disabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'           -- ordinary base tables only
    AND c.relrowsecurity = false; -- RLS currently OFF

  -- Tables we expect to enable but that are NOT currently RLS-off
  -- (already enabled, renamed, or dropped since the audit).
  SELECT coalesce(array_agg(e ORDER BY e), ARRAY[]::text[])
    INTO v_missing
  FROM unnest(v_expected) e
  WHERE e <> ALL (v_live_disabled);

  -- RLS-off tables in the DB that are NOT in our expected set
  -- (new tables added since the audit — must be triaged, not silently enabled).
  SELECT coalesce(array_agg(l ORDER BY l), ARRAY[]::text[])
    INTO v_unexpected
  FROM unnest(v_live_disabled) l
  WHERE l <> ALL (v_expected);

  IF array_length(v_expected, 1) <> 42 THEN
    RAISE EXCEPTION 'T2 guard: expected list is % entries, must be 42', array_length(v_expected,1);
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 guard: expected-but-not-RLS-disabled (drift): %', v_missing;
  END IF;

  IF array_length(v_unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 guard: RLS-disabled tables NOT in expected set (new drift): %', v_unexpected;
  END IF;

  RAISE NOTICE 'T2 guard passed: exactly 42 expected RLS-disabled tables present.';
END $$;

-- ─── Enable RLS (ENABLE, never FORCE) — 42 explicit statements ──

-- Financial (3)
ALTER TABLE cash_entries                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_months                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_records                ENABLE ROW LEVEL SECURITY;

-- Commercial pricing (3)
ALTER TABLE price_agreements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_agreement_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_road_times           ENABLE ROW LEVEL SECURITY;

-- Staff personal / GDPR special-category (3)
ALTER TABLE haccp_health_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_staff_training          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_training       ENABLE ROW LEVEL SECURITY;

-- Operational / routing / notes (6)
ALTER TABLE routes                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sentinels                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliments                   ENABLE ROW LEVEL SECURITY;

-- HACCP compliance (27)
ALTER TABLE haccp_suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_corrective_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_deliveries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_temps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_mince_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_daily_diary             ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cleaning_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_processing_temps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_returns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_calibration_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_sop_content             ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_meatprep_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_assessment     ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_monthly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_product_specs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_defence_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_fraud_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_recall_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_annual_reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_weekly_review           ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_monthly_review          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_dispatch_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_time_separation_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_reviews        ENABLE ROW LEVEL SECURITY;

-- ─── Post-state assertion: all 42 are now RLS-enabled, and none of
--     them were accidentally FORCE'd (relforcerowsecurity must stay false) ──
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'cash_entries','cash_months','cheque_records',
    'price_agreements','price_agreement_lines','customer_road_times',
    'haccp_health_records','haccp_staff_training','haccp_allergen_training',
    'routes','route_stops','hub_sentinels','visit_notes','complaint_notes','compliments',
    'haccp_suppliers','haccp_corrective_actions','haccp_deliveries',
    'haccp_cold_storage_temps','haccp_documents','haccp_mince_log',
    'haccp_daily_diary','haccp_cleaning_log','haccp_processing_temps',
    'haccp_returns','haccp_calibration_log','haccp_cold_storage_units',
    'haccp_sop_content','haccp_meatprep_log','haccp_allergen_assessment',
    'haccp_allergen_monthly_reviews','haccp_product_specs','haccp_food_defence_plans',
    'haccp_food_fraud_assessments','haccp_recall_config','haccp_annual_reviews',
    'haccp_weekly_review','haccp_monthly_review','haccp_dispatch_log',
    'haccp_time_separation_log','haccp_document_versions','haccp_document_reviews'
  ];
  v_not_enabled text[];
  v_forced      text[];
BEGIN
  SELECT coalesce(array_agg(e ORDER BY e), ARRAY[]::text[])
    INTO v_not_enabled
  FROM unnest(v_expected) e
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = e AND c.relrowsecurity = true
  );

  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO v_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (v_expected)
    AND c.relforcerowsecurity = true;   -- FORCE guard: must be empty

  IF array_length(v_not_enabled, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 post-check: these expected tables are still RLS-off: %', v_not_enabled;
  END IF;

  IF array_length(v_forced, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 post-check: FORCE RLS detected (must be ENABLE only): %', v_forced;
  END IF;

  RAISE NOTICE 'T2 post-check passed: all 42 RLS-enabled, none FORCE.';
END $$;
```

> **🗣 In plain English:** The file does three things in order: (1) a trip-wire that
> refuses to run if the database does not match last week's audit, (2) 42 plain
> one-line lock commands, one per table, and (3) a final self-check that confirms all
> 42 are locked AND that none were accidentally set to the dangerous FORCE strength.
> If anything is off, the whole thing aborts and changes nothing.

---

## 4. Drift guard — what it catches

- **Expected-list length ≠ 42** → abort. Catches an editing slip in the array.
- **A table we expect is no longer RLS-off** → abort with the names. Catches a table
  someone already enabled, renamed, or dropped since 2026-06-12.
- **An RLS-off table exists that we did NOT list** → abort with the names. Catches a
  brand-new table added since the audit — it must be triaged by a human (added to the
  list deliberately or excluded with a reason), never silently swept in.

> **🗣 In plain English:** The trip-wire is two-sided. It complains both if a door we
> meant to lock has vanished, and if a new door appeared that nobody told us about. A
> human decides what to do — the migration never guesses.

---

## 5. Rollback SQL (separate snippet — do NOT include in the forward file)

If T2 needs to be reverted, run the inverse. `DISABLE` is instant and additive-safe.
There is no data to restore — RLS state is the only thing that changed.

```sql
-- T2 ROLLBACK — disable RLS on the same 42 tables (ENABLE -> off).
-- Run as service-role / table owner. Instant; no data change.
ALTER TABLE cash_entries                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_months                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_records                DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_agreements              DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_agreement_lines         DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_road_times           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_health_records          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_staff_training          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_training       DISABLE ROW LEVEL SECURITY;
ALTER TABLE routes                        DISABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sentinels                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_notes               DISABLE ROW LEVEL SECURITY;
ALTER TABLE compliments                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_suppliers               DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_corrective_actions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_deliveries              DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_temps      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_documents               DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_mince_log               DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_daily_diary             DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cleaning_log            DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_processing_temps        DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_returns                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_calibration_log         DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_units      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_sop_content             DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_meatprep_log            DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_assessment     DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_monthly_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_product_specs           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_defence_plans      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_fraud_assessments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_recall_config           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_annual_reviews          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_weekly_review           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_monthly_review          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_dispatch_log            DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_time_separation_log     DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_versions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_reviews        DISABLE ROW LEVEL SECURITY;
```

> **🗣 In plain English:** If we ever need to undo this, we run the same 42 commands
> with "off" instead of "on." It's instant and loses no data — we only ever toggled a
> setting, never moved a single row.

---

## 6. Apply sequence (step by step)

**Step 1 — Write the file.** Create `supabase/migrations/20260613_001_enable_rls_42_tables.sql`
with the exact §3.2 content. Nothing else changes — no app code, no other file.

**Step 2 — Local apply.** Ensure local Supabase is up (`npm run db:up`), then
`npm run db:reset` to re-run all migrations + seed against local. The migration's
own guard (§4) and post-check (§3.2 second DO block) must both print their NOTICE and
the reset must succeed.

> **🗣 In plain English:** First we run it on the practice database on the developer's
> own machine and watch it pass its own self-checks. Nothing touches the live system yet.

**Step 3 — Local verification (the §7 matrix, local first).** Run the advisor recheck

- service-role smoke against local (details in §7). All must pass before prod.

**Step 4 — Production apply via MCP.** Apply the **exact same file content** to prod
through Supabase MCP `apply_migration` (project `uqgecljspgtevoylwkep`, name
`20260613_001_enable_rls_42_tables`). Do not retype the SQL — pass the file's bytes.
If the live prod state has drifted, the §4 guard `RAISE EXCEPTION`s and the migration
aborts cleanly with the drifting table names — **this is the desired behaviour**;
triage the drift, do not bypass the guard.

**Step 5 — Production verification (§7 matrix against prod).** Advisor recheck + a
real service-role smoke through a live API route.

> **🗣 In plain English:** Once it's proven locally, the identical file goes to the
> live database. If the live database has changed since the audit, it safely refuses
> and tells us what's different. After it lands, we re-run the checks on the live
> system to confirm the danger count is zero and the app still works.

---

## 7. ANVIL verification matrix (specify now, ANVIL executes)

| #   | Check                                              | How                                                                                                                                                                                              | Pass bar                                                                                                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1  | Advisor `rls_disabled_in_public` count             | Supabase `get_advisors(security)` (prod via MCP), and/or query `pg_class` for `relkind='r' AND relrowsecurity=false` in `public`. **Measured dynamically — do NOT hardcode "42" in a test.**     | Count of RLS-disabled public tables that were in the T2 set drops from 42 to **0**. (advisor `rls_disabled_in_public` ERROR cleared for all 42.) |
| V2  | No FORCE anywhere                                  | Query `pg_class.relforcerowsecurity = true` for the 42 tables (the §3.2 post-check already does this in-migration).                                                                              | **Zero** tables FORCE'd.                                                                                                                         |
| V3  | Service-role READ still works                      | Hit a real read route on each affected domain — e.g. `GET /api/cash/*`, `GET /api/pricing`, `GET /api/routes`, a `GET /api/haccp/*`. Local: `npm run test:e2e:api` / `npm run test:integration`. | HTTP **200** with expected rows — proves service-role bypass is intact.                                                                          |
| V4  | Service-role WRITE still works                     | A write through a real API route on an affected table (e.g. a `/api/cash/*` or `/api/haccp/*` create/update path).                                                                               | HTTP **200/2xx**, row persisted — proves the app is unaffected by the deny-all.                                                                  |
| V5  | Anon is actually locked out (optional, high-value) | Direct PostgREST `GET /rest/v1/cash_entries` with the **anon** key only.                                                                                                                         | **Empty / 401-style deny** — proves the door is now shut to strangers.                                                                           |
| V6  | Local-first ordering                               | All of V1–V5 pass on **local** before any prod apply.                                                                                                                                            | Local green is a gate for prod apply.                                                                                                            |

> **🗣 In plain English:** ANVIL will check four things: the danger count is now zero;
> none of the locks were set to the dangerous FORCE strength; the app can still read
> AND write all the affected data (so customers/staff notice nothing); and — ideally —
> that a stranger with the public key now gets nothing. And it does all of that on the
> practice database first.

**Note on dynamic measurement:** V1 must compute the live RLS-off count from
`pg_catalog`/advisor at run time, never assert a literal `42`. A hardcoded 42 rots the
moment a 43rd table is added and would mask future exposure.

---

## 8. Out of scope (explicit)

These are deliberately **not** in T2. Do not add them.

- **Per-table read/write policies** (`CREATE POLICY`). They land per-domain in
  **F-RLS-04a–i**. T2 is enable-only; deny-all is the intended interim state.
- **F-RLS-03 — the per-request authenticated client** (`AuthenticatedDbAdapter`,
  anon-key + user-JWT). T2 changes no app client; the app stays 100% service-role.
- **T3 — SECURITY DEFINER hardening / RPC EXECUTE revokes** (Finding 3:
  `replace_agreement_lines`, `is_admin`, the two audit triggers, `function_search_path_mutable`).
  Separate unit.
- **The unsigned-cookie privilege-escalation fix** (Finding 1) — already shipped as
  T1 (commit 88af11d); independent of RLS regardless.
- **Moving `pg_net` out of `public`**, and the `order_idempotency_keys`
  `rls_enabled_no_policy` INFO (intentional, no action).

> **🗣 In plain English:** This step only turns the locks ON. It does NOT write the
> "who's allowed in" rulebooks, does NOT change how the app connects, and does NOT fix
> the separate issues about risky database functions. Those are their own jobs, later.

---

## 9. Rip-out / hexagonal note

**No application files change. Zero.** T2 is pure schema DDL in one Supabase migration.
It adds no ports, no adapters, no services, no `package.json` entries, no `lib/wiring/`
edits. The hexagonal dependency rules are not engaged. The migration content is
standard, vendor-portable Postgres (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` +
`pg_catalog` queries) — it would run on any Postgres, not just Supabase. The file
lives in the Supabase adapter's territory (`supabase/migrations/`), which is the
correct home for DB schema per CLAUDE.md.

> **🗣 In plain English:** This change is invisible to the app's code structure. The
> "if we swapped the database vendor tomorrow, how many files change?" test is
> unaffected — the lock instructions are plain database language any Postgres
> understands, sitting in the one folder where database changes belong.

---

## 10. Risk assessment

> **🗣 In plain English:** The honest list of what could go wrong, how bad, and how
> we stop it. The first one is the big one.

### R1 — FORCE instead of ENABLE — **CRITICAL — MUST-FIX (Gate 2 blocker)**

- **Category:** Launch blocker / business-logic flaw.
- **What:** If the migration uses `FORCE ROW LEVEL SECURITY` instead of `ENABLE`, the
  app's own service-role queries become subject to the (nonexistent) policies →
  deny-all to the app → **production outage** across cash, pricing, routes, and HACCP.
- **Severity:** Critical (full outage of affected domains).
- **Mitigation (baked into this plan):** (a) the word FORCE appears nowhere in the
  forward SQL; (b) the in-migration post-check (§3.2) `RAISE EXCEPTION`s if any of the
  42 tables has `relforcerowsecurity = true`; (c) ANVIL V2 re-asserts zero FORCE;
  (d) local-first apply means an accidental FORCE surfaces on local, never prod first.
- **Must-fix flag:** YES. The plan resolves it by construction; the implementer must
  not deviate.

### R2 — Table-list drift since the 2026-06-12 audit — **MEDIUM — guarded**

- **Category:** Data/schema correctness.
- **What:** A table added/renamed/dropped/already-enabled since the audit means the
  hardcoded 42-list locks the wrong set (misses a newly-exposed table, or errors on a
  vanished one).
- **Severity:** Medium (could leave a table exposed, or abort the migration).
- **Mitigation:** the two-sided §4 drift guard aborts with names on any mismatch;
  ANVIL V1 measures the residual RLS-off count **dynamically** so any miss is caught.
  **Live MCP cross-check is deferred to the implementer/ANVIL** (see §11) — the guard
  makes that deferral safe because apply-time drift fails closed.
- **Must-fix flag:** No (guarded; fails safe).

### R3 — A table reached by a non-service-role (anon/authenticated) path — **LOW — confirmed absent**

- **Category:** Business-logic flaw (deny-all breaking a legitimate caller).
- **What:** If any of the 42 tables were read/written by an anon-key or authenticated
  client anywhere, deny-all would break that path.
- **Severity:** Would be High if present — but **confirmed absent.** Code sweep:
  `lib/supabase.ts` is the **only** `createClient` site and is **service-role only**;
  the audit (§2) found no browser-side Supabase client and no remaining inline-key
  fetch paths. Every one of the 42 tables is reached exclusively via service-role API
  routes. The app does not even ship the anon key to the browser today.
- **Mitigation:** ANVIL V3/V4 (real read + write smokes per affected domain) prove the
  service-role paths still return 200 after enable.
- **Must-fix flag:** No.

### R4 — Concurrency / locking during apply — **LOW**

- **Category:** Concurrency / race condition.
- **What:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` takes a brief
  `ACCESS EXCLUSIVE` lock per table. On these tiny tables (max ~5,738 rows on
  `customer_road_times`; most under 100) the lock is sub-millisecond metadata-only —
  no row rewrite.
- **Severity:** Low (negligible blocking; no data rewrite).
- **Mitigation:** Apply off-peak if desired; the operation is metadata-only and
  effectively instant. No batching needed at this scale.
- **Must-fix flag:** No.

### R5 — Security: does T2 _introduce_ any new exposure? — **NONE**

- **Category:** Security.
- **What:** Enabling RLS with no policy can only **remove** access (deny-all to
  anon/authenticated); it cannot grant new access. Service-role bypass is unchanged.
- **Severity:** None — strictly reduces attack surface (closes Finding 2).
- **Must-fix flag:** No.

### R6 — Data migration / loss — **NONE**

- **Category:** Data migration.
- **What:** No rows touched, no columns/types changed. Purely a per-table boolean
  flag flip. PITR not required; rollback (§5) is instant.
- **Must-fix flag:** No.

**Risk headline:** One must-fix — **R1 (FORCE-not-ENABLE), CRITICAL** — and the plan
neutralises it three ways (no FORCE in the SQL, an in-migration FORCE assertion, and
an ANVIL FORCE recheck). R2 (drift) is guarded and fails closed. R3 (non-service-role
path) is confirmed absent by code sweep. Everything else is none/low.

---

## 11. Live MCP cross-check status

The planner could **not** reach the Supabase MCP `list_tables`/`get_advisors` tools in
this subagent context (the tools were not available to invoke). Per the spec's
fallback, **the audit doc `docs/rls-audit-2026-06-12.md` §3b is authoritative** and the
extracted set was confirmed to total exactly **42** by counting the names
(3 financial + 3 pricing + 3 staff-personal + 6 operational + 27 HACCP-compliance).
`order_idempotency_keys` is correctly **excluded** (already RLS-on-no-policy).

**Deferred to the implementer / ANVIL:** run `get_advisors(security)` + `list_tables`
against prod `uqgecljspgtevoylwkep` immediately before apply and confirm the live
RLS-disabled set equals these 42. The §4 in-migration guard makes this deferral safe —
any drift fails the apply closed rather than silently locking the wrong set.

---

## 12. Acceptance criteria

1. One new file `supabase/migrations/20260613_001_enable_rls_42_tables.sql`, no other
   file changed.
2. SQL uses `ENABLE` only; the string `FORCE` appears nowhere; in-migration FORCE
   post-check present.
3. All 42 tables named explicitly; drift guard + post-check `DO` blocks present.
4. `npm run db:reset` succeeds locally; both `DO` blocks emit their pass NOTICE.
5. Advisor `rls_disabled_in_public` ERROR count for the T2 set = **0** (measured
   dynamically) on local, then prod.
6. Service-role read AND write smokes return 200/2xx on every affected domain, local
   then prod.
7. Rollback snippet (§5) recorded in this plan.
8. Same file content applied to prod via MCP `apply_migration` — SQL not hand-retyped.
