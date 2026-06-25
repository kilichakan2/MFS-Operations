# F-19 Cluster G / F-RLS-04h — PR10a: HACCP RLS Foundation (introduce-only, INERT)

**Date:** 2026-06-25
**FORGE unit:** F-19 PR10a (the FOUNDATION half of the two-step HACCP RLS cutover; PR10b is a later, separate loop)
**Type:** Additive SQL migration + wiring factories. ZERO production behaviour change.
**Branch (suggested):** `f19-pr10a-cluster-g-rls-foundation`

🗣 In plain English: This is step one of two for putting a security guard on the food-safety
(HACCP) records in the database. Today every HACCP screen reaches the database holding the
master key (service-role) that opens every door. This PR installs the door locks (RLS policies)
on all 30 HACCP tables AND builds the per-staff keycards (the `…ForCaller` factories) — but
plugs in NOTHING. The master key still opens everything because no screen has been switched to
the keycard yet, so the locks are dormant. Nothing a user does changes. Step two (PR10b, later)
hands out the keycards by switching the screens over.

---

## Mini-map

```
DOMAIN (HACCP core logic — lib/services/Haccp*Service + submitHaccpDailyCheck usecase)
  ├─ HaccpDailyChecks  (port) → [Supabase] service-role singleton  +  NEW …ForCaller (inert)
  ├─ HaccpCorrectiveActions (port) → [Supabase] singleton  +  NEW …ForCaller (inert)
  ├─ HaccpAssessments/Training/People/Reviews/AnnualReview/Reporting/Handbook/Suppliers/Lookups
  │     (10 more ports) → [Supabase] singletons  +  NEW …ForCaller variants (inert)
  └─ DbTokenMinter (port) → [web-crypto] + authenticatedClientForCaller [Supabase] (REUSED, untouched)
🗣 every socket keeps its master-key plug AND gains a keycard plug — but no screen holds the keycard yet
```

---

## 1. Goal

Lay the foundation so that — in PR10b — every authenticated HACCP route can be flipped off the
service-role master key onto a per-request authenticated client, letting Postgres Row-Level
Security (RLS) enforce access as defense-in-depth (ADR-0004, ADR-0007). PR10a delivers two
independent, dormant halves and proves them:

1. **One additive SQL migration** adding the uniform RLS policy family to all **30 `haccp_*`
   tables** (they currently have RLS *enabled* but *zero policies* — a deny-all trap that only
   service-role opens).
2. **The `…ForCaller(userId)` per-request authenticated factories** in `lib/wiring/haccp.ts` —
   constructed but with **no caller**.

🗣 In plain English: RLS = the database checking "are you allowed to see/touch this row?" on every
query, instead of trusting the app. ADR-0004/0007 are the written house decisions saying "use the
database's own guard as a second line of defense, driven by a short-lived token that carries the
logged-in user's id". This PR builds that guard and the keycards for HACCP, switches nothing on.

**Hard rule — ZERO behaviour change (the inert-ness argument the cert relies on):**
- (a) Every HACCP route still imports the **service-role singletons** in `lib/wiring/haccp.ts`,
  which are **left untouched**. The Postgres **service_role BYPASSES RLS entirely** (the tables
  are `ENABLE ROW LEVEL SECURITY`, never `FORCE`), so the new policies are **never evaluated** on
  any live request → dormant.
- (b) The new `…ForCaller` factories have **no caller** anywhere in `app/**` (no route edited).
- Therefore: no read returns differently, no write is newly blocked, no screen changes. The only
  observable deltas are new DB objects (policies + one helper fn) and new unused exports in wiring.

🗣 In plain English: two reasons nothing changes — the master key ignores locks, and we never hand
out the new keycards. Both are independently true; either alone would already make this inert.

---

## 2. Domain terms (plain-English glossary for this plan)

- **RLS policy** — a per-table rule the database checks on SELECT/INSERT/UPDATE/DELETE.
  🗣 A door lock; it decides per row whether you may look or touch.
- **service-role / master key** — the all-access DB credential the routes use today; bypasses RLS.
  🗣 The master key that opens every door regardless of the locks.
- **`authenticated` role + per-request client** — an anon-key Supabase client carrying the caller's
  minted JWT; runs as Postgres role `authenticated`, so RLS *is* evaluated.
  🗣 A keycard cut for one specific staff member for one request.
- **GUC `app.current_user_id`** — a per-connection setting holding the caller's user id, set from
  the token by the live `db-pre-request` bridge (F-RLS-03).
  🗣 A sticky note on the connection saying "this request is staff member X"; the locks read it.
- **`…ForCaller(userId)` factory** — a function that mints a token, builds a per-caller client, and
  returns a service bound to it. NEVER memoized (one keycard per request).
  🗣 The keycard-cutting machine: feed it a staff id, get a service that reaches the DB as them.
- **pgTAP** — SQL-level unit tests that run inside a transaction and roll back.
  🗣 A test harness that proves the locks open for the right people and stay shut for the wrong ones.

---

## 3. Compliance / safety flags

- **Additive migration only** — `CREATE FUNCTION` (one helper) + `CREATE POLICY` (the family). NO
  `DROP TABLE` / `TRUNCATE` / `ALTER TYPE` / `DROP COLUMN` / `DROP NOT NULL`. → **No PITR gate fires
  at ANVIL Lock.** 🗣 Nothing destructive, so no point-in-time-recovery snapshot is required first.
- **Prod-first application** (the established F-19 / F-RLS-04x pattern): apply the migration to
  PRODUCTION via Supabase MCP `apply_migration` **FIRST**, confirm green, **then** merge the PR.
  Because the policies are dormant under service-role, applying them to prod ahead of merge is safe
  and changes nothing live. 🗣 We install the locks on the real building before merging the code,
  and since no keycard is in use yet, the building behaves identically.
- **HACCP preview flake (F-TD-37)** — LOW risk for PR10a: this PR adds **no new E2E** (it is inert),
  so it does not exercise the flaky preview HACCP browser-taps any more than today. Recovery if a
  preview branch wedges: Supabase MCP `reset_branch`. 🗣 The known wobble in the HACCP preview tests
  isn't poked here because we add no browser tests.

---

## 4. ADR conflicts

**None.** This PR is squarely *implementing* the three governing ADRs, not deviating:
- **ADR-0002** (hexagonal shape & naming): the new factories live in `lib/wiring/haccp.ts`, the one
  business-layer file allowed to import `lib/adapters/**`. No domain/port/service file imports an
  adapter. Compliant. 🗣 The keycard wiring goes exactly where the house rules say vendor wiring lives.
- **ADR-0004** (RLS vs service-role security model): adds the RLS backstop while keeping service-role
  as the named bypass. Compliant. 🗣 Implements the "guard at the DB, master key only on purpose" rule.
- **ADR-0007** (app-minted token + GUC bridge): reuses the F-RLS-03 minter + bridge unchanged.
  Compliant. 🗣 Reuses the existing keycard-printing mechanism; touches none of it.

**One documentation nuance to record (not a conflict, but call it out):** CONTEXT.md §"HACCP
visibility" (lines 88–101) currently phrases the rule as "resolves to a real `users` row" (existence
only). The locked spec requires a real **ACTIVE** user. These differ only for a *deactivated* staff
member. See §6 "Active-column finding" — the plan resolves this by enforcing ACTIVE in the policy and
**updating that one CONTEXT.md sentence** to say "a real **active** `users` row" so doc and DB agree.

---

## 5. Exact files to change

| # | File | Change | New/edit |
|---|------|--------|----------|
| 1 | `supabase/migrations/20260625120000_haccp_authenticated_rls_policies.sql` | The additive policy family + active-aware helper fn | NEW |
| 2 | `supabase/migrations/rollback/20260625120000_haccp_authenticated_rls_policies.down.sql` | Rollback DROPs (if the repo keeps a `rollback/` dir; otherwise inline the rollback block as a comment at the foot of file #1, matching the cash precedent) | NEW (or inline) |
| 3 | `lib/wiring/haccp.ts` | Add 11 service `…ForCaller` factories + `submitHaccpDailyCheckForCaller`; KEEP all 12 existing singletons; update the header comment | edit |
| 4 | `supabase/tests/015-rls-haccp.test.sql` | pgTAP proving the policy family (grant active / deny anon / deny empty-GUC / deny inactive / master-key bypass) | NEW |
| 5 | `tests/unit/wiring/haccpServiceForCaller.test.ts` | Per-request / never-memoize pins for the new factories (mirrors `complaintsServiceForCaller.test.ts`) | NEW |
| 6 | `tests/unit/wiring/haccpService.test.ts` | UPDATE the two pins that currently FORBID `…ForCaller` and assert an exact singleton-only export set (see §8 step 6 — this is mandatory, the existing test WILL fail otherwise) | edit |
| 7 | `CONTEXT.md` (lines 98–100) | One word: "a real `users` row" → "a real **active** `users` row" | edit |

🗣 In plain English: one new migration (the locks + a helper), one rollback note, the wiring file gets
the keycard machines, two test files (one new SQL proof, one new wiring proof), one existing wiring
test must be loosened because it currently asserts "no keycards exist" — which PR10a deliberately
makes false — and one CONTEXT sentence tightened to match.

**Verify before writing the migration:** confirm no migration with a timestamp ≥ `20260625120000`
already exists (latest today is `20260622120000`). `20260625120000` is after it and uses the required
full 14-digit `YYYYMMDDHHMMSS_name.sql` form (the short `YYYYMMDD_NNN` form is banned and breaks
preview-branch resync — `tests/unit/migrations/filename-convention.test.ts`).

---

## 6. The active-column finding (RESOLVED — no open question)

The spec told me to verify the users active-flag column before specifying the policy.

**Finding:** `public.users` has column **`active boolean DEFAULT true NOT NULL`**
(`supabase/migrations/20260101000000_baseline.sql:417`). There IS an active column. (`is_admin()`
at baseline:177 and `current_user_is_valid()` at `20260618130000:72` both read `public.users` via a
SECURITY DEFINER helper to dodge RLS recursion.)

**Consequence — do NOT reuse `current_user_is_valid()` as-is.** That existing helper checks only that
the row *EXISTS*; it does NOT check `active`. Cash/pricing/complaints reuse it and are
existence-only. The locked HACCP spec requires **ACTIVE**. So:

- **Decision:** introduce a NEW recursion-proof helper **`public.current_user_is_active()`** that
  mirrors `current_user_is_valid()`'s definer pattern but adds `AND u.active = true`. Do NOT alter
  `current_user_is_valid()` (other domains depend on its existence-only contract — changing it is
  out of scope and would silently re-gate cash/pricing/complaints/users-directory).

🗣 In plain English: the database does know whether a staff member is switched on (`active`). There's
already a tidy helper that checks "is this a real user?" but it doesn't check "are they still
switched on?", and other parts of the app rely on it staying that way. So we add a sibling helper
"is this a real, switched-on user?" and use that one for HACCP — leaving the old one alone.

```sql
CREATE OR REPLACE FUNCTION public.current_user_is_active()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.active = true
    )
  $$;
ALTER FUNCTION public.current_user_is_active() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;
```

🗣 `SECURITY DEFINER` = the helper reads the users table as its owner (the master key), so a lock on
the users table doesn't trigger a lock that triggers itself forever (recursion). `nullif(…, '')`
turns an empty sticky-note into NULL so an absent user cleanly fails (no crash). EXECUTE granted only
to the keycard role.

---

## 7. The migration — policy shape (SETTLED)

### 7.1 Decisions

- **Predicate:** `public.current_user_is_active()` (the new helper). NOT `auth.uid()`/`auth.jwt()` —
  this codebase is GUC-based (F-RLS-03), not Supabase-Auth. 🗣 Use our own sticky-note mechanism,
  not Supabase's built-in login, because that's what the rest of the app uses.
- **Command split: separate `FOR SELECT / INSERT / UPDATE / DELETE` per table (4 policies × 30 =
  120 policies), NOT one `FOR ALL`.** Reasoning: this is the in-repo idiom every shipped cutover uses
  (orders, routes, pricing, cash, complaints, visit_notes) — reviewers and pgTAP read it the same way
  each time; `FOR ALL` would be a lone exception. The predicate is identical across all four commands
  here (any active staff may read+write), so it is not *more* permissive — just consistent and
  command-granular for future tightening. UPDATE carries BOTH `USING` and `WITH CHECK`. INSERT carries
  `WITH CHECK`; SELECT/DELETE carry `USING`. 🗣 Four small locks per table instead of one combined
  lock — same effect, but matches how every other room in the building is locked, so it's easy to read
  and easy to change one command later without disturbing the others.
- **Enumerate all 30 tables explicitly, NOT generated via a DO/loop.** Explicit `CREATE POLICY` lines
  are clearer for review and rollback and make a missing table visible in the diff. (A stray
  un-policied table would become a deny-all trap the moment its route flips in PR10b — completeness is
  why we enumerate.) 🗣 Write out all 120 lines plainly rather than a clever loop — a reviewer can see
  every table is covered, and we can delete one lock without untangling a script.
- **Idempotent:** each policy preceded by `DROP POLICY IF EXISTS … ON <table>;` so `db:reset` and
  preview re-syncs are re-runnable (mirrors cash/visit_notes). 🗣 Safe to run twice.
- **Grants:** verify each `haccp_*` table already `GRANT`s the needed privileges to `authenticated`
  in baseline (orders/cash precedents show baseline already grants). If any HACCP table is MISSING a
  grant to `authenticated`, ADD the grant in this migration (a policy without the table privilege
  still denies). **Verification step — do not assume.** 🗣 The lock only matters if the keycard role
  is even allowed near the door; confirm the door is reachable, add the entry permission if not.

### 7.2 Table list (all 30, VERIFIED against baseline `CREATE TABLE` lines 451–1117)

haccp_allergen_assessment, haccp_allergen_monthly_reviews, haccp_allergen_training,
haccp_annual_reviews, haccp_calibration_log, haccp_cleaning_log, haccp_cold_storage_temps,
haccp_cold_storage_units, haccp_corrective_actions, haccp_daily_diary, haccp_deliveries,
haccp_dispatch_log, haccp_document_reviews, haccp_document_versions, haccp_documents,
haccp_food_defence_plans, haccp_food_fraud_assessments, haccp_health_records, haccp_meatprep_log,
haccp_mince_log, haccp_monthly_review, haccp_processing_temps, haccp_product_specs,
haccp_recall_config, haccp_returns, haccp_sop_content, haccp_staff_training, haccp_suppliers,
haccp_time_separation_log, haccp_weekly_review.

All 30 confirmed (a) created in baseline and (b) `ENABLE ROW LEVEL SECURITY` in
`20260613000000_enable_rls_42_tables.sql` (grep: exactly 30 distinct `haccp_*` tables enabled there).
🗣 Cross-checked twice — the list of 30 in the spec is exactly the set that exists and has RLS on.

### 7.3 Policy naming convention

`<table>_select`, `<table>_insert`, `<table>_update`, `<table>_delete` — e.g.
`haccp_deliveries_select`. Matches cash (`cash_months_select`) and the rest. 🗣 Each lock is named
`<table>_<action>` so it's obvious what it guards.

### 7.4 Per-table block (template — repeat for each of the 30)

```sql
DROP POLICY IF EXISTS haccp_deliveries_select ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_insert ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_update ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_delete ON haccp_deliveries;

CREATE POLICY haccp_deliveries_select ON haccp_deliveries
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_deliveries_insert ON haccp_deliveries
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_deliveries_update ON haccp_deliveries
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_deliveries_delete ON haccp_deliveries
  FOR DELETE USING ( public.current_user_is_active() );
```

### 7.5 Rollback SQL

```sql
-- Drop the 120 policies (4 per table × 30), then the helper.
-- DROP POLICY IF EXISTS haccp_<table>_select ON haccp_<table>;  (×30)
-- DROP POLICY IF EXISTS haccp_<table>_insert ON haccp_<table>;  (×30)
-- DROP POLICY IF EXISTS haccp_<table>_update ON haccp_<table>;  (×30)
-- DROP POLICY IF EXISTS haccp_<table>_delete ON haccp_<table>;  (×30)
-- DROP FUNCTION IF EXISTS public.current_user_is_active();
```
Tables stay `ENABLE ROW LEVEL SECURITY` (predates this PR) — rollback returns to the pre-PR10a
deny-all-to-authenticated posture, which is harmless because service-role (the live path) bypasses
RLS. 🗣 To undo: remove the 120 locks and the helper. The tables go back to "locked to keycards, open
to the master key" — exactly today's state, and today's screens use the master key, so nothing breaks.

---

## 8. Build order (TDD where it applies; atomic-commit-sized steps)

> Commit boundaries are marked. Tests written before/with the thing they pin (TDD) where the thing is
> testable in isolation; the migration is proven by pgTAP that runs against the applied schema.

**Step 1 — Migration file (the locks + helper).** Write
`supabase/migrations/20260625120000_haccp_authenticated_rls_policies.sql`: the
`current_user_is_active()` helper + grants, then the 120 explicit policies (with idempotent drops),
then any missing `authenticated` table grants found in §7.1 verification, then the rollback block as a
trailing comment. Run `npm run db:reset` locally to confirm it applies clean.
🗣 Install the locks and the helper on the local database first; prove it loads without error.
*Commit: "F-19 PR10a — additive HACCP RLS policy family (30 tables) + current_user_is_active helper".*

**Step 2 — pgTAP proof `supabase/tests/015-rls-haccp.test.sql`** (see §9 for the matrix). Run it
against the local DB; all assertions green. 🗣 Prove the locks open for an active staff member, stay
shut for anon / empty-id / deactivated, and that the master key still walks through.
*Commit: "F-19 PR10a — pgTAP 015 proves HACCP RLS policy family (grant active / deny anon·empty·inactive / master-key bypass)".*

**Step 3 — Update the existing wiring guard test `tests/unit/wiring/haccpService.test.ts`.** The
current test (lines 244–269) asserts (a) `exportNames.some(/ForCaller/) === false` and (b) an EXACT
export set of the 12 singletons only. PR10a deliberately makes both false. Edit:
- Change the "service-role singletons ONLY — no …ForCaller" test to assert the 12 singletons are
  STILL exported (the parachutes survive) AND that the expected `…ForCaller` factories now ALSO exist
  — i.e. flip it from "forbids ForCaller" to "requires both the singletons and the new ForCaller set".
- Update the exact-export `Set` to include the 12 new export names (11 service ForCaller + 1 usecase
  ForCaller) alongside the 12 singletons (24 total).

🗣 In plain English: there's an existing test that says "the HACCP wiring must have NO keycard
machines." PR10a's whole job is to add them, so that test would fail by design. We rewrite it to say
"keep all 12 master-key plugs AND now also have the 12 keycard machines." This must ship in the same
PR or the suite goes red.
*Commit folds into Step 4's commit (the test and the code it pins ship together).*

**Step 4 — Add the `…ForCaller` factories to `lib/wiring/haccp.ts`** (see §10 for the full list and
the multi-port composition). Mirror `visitsServiceForCaller` / `ordersServiceForCaller`: each factory
mints a token, builds a per-caller authenticated client, and binds the relevant adapter(s) to it.
KEEP all 12 singletons. Update the file header comment (currently says "NO …ForCaller … deferred to
F-RLS-04h" — that deferral is now being fulfilled; rewrite to "F-RLS-04h PR10a: ForCaller factories
added, INERT — no caller until PR10b"). 🗣 Add the keycard machines next to the existing master-key
plugs; leave every master-key plug in place as the rollback parachute.
*Commit: "F-19 PR10a — add INERT per-caller HACCP …ForCaller factories to wiring (no caller yet) + update guard test".*

**Step 5 — New wiring unit test `tests/unit/wiring/haccpServiceForCaller.test.ts`** (TDD: write
alongside Step 4, mirror `complaintsServiceForCaller.test.ts`). Pin, for a representative subset and
for the multi-port `submitHaccpDailyCheckForCaller`: mint-once-per-call, fresh client per call,
adapter bound to that client, never-memoized (two callers → two mints → two clients, no identity
leak). 🗣 Prove each keycard machine cuts a fresh keycard every single request and never re-uses one.
*Commit folds into Step 4 (code + its proof together).*

**Step 6 — CONTEXT.md one-word tightening** (lines 98–100): "resolves to a real `users` row" →
"resolves to a real **active** `users` row". 🗣 Make the written rule match what the lock actually
enforces (active staff only).
*Commit: "docs(CONTEXT): HACCP RLS predicate is active-user, not merely existing".*

**Step 7 — Full local gate:** `npm run test` (unit incl. the no-adapter-imports lint pin and the
migration-filename pin), `npm run db:reset` + pgTAP, `npm run test:integration` (smoke that nothing
regressed — should be byte-identical since no route changed). 🗣 Run the whole test suite to confirm
the build is green and genuinely inert.

**Step 8 — Prod-first apply at Ship:** apply the migration to PROD via Supabase MCP `apply_migration`,
confirm green, THEN merge. 🗣 Lock the real building before merging; safe because no keycard is in use.

---

## 9. pgTAP test matrix (ANVIL DB/RLS rung) — `supabase/tests/015-rls-haccp.test.sql`

Mirror `012-rls-cash.test.sql`'s structure (BEGIN … plan(N) … `\ir _helpers.sql` … fixtures …
`SET LOCAL ROLE authenticated` … assertions … `RESET ROLE` … `finish()` … ROLLBACK).

**Sampling decision: a REPRESENTATIVE SAMPLE of tables, not all 30.** Reasoning: the policy
predicate is *identical and helper-driven* across all 30 tables (the only per-table variation is the
column list, which the policy does not reference). Proving the **helper + the four-command pattern**
on a representative spread proves the family; testing all 30 would be 30× the fixtures (each table has
a different NOT-NULL/FK shape) for no additional logical coverage. **Sample (5 tables):**
- `haccp_deliveries` (has a corrective-action linkage path; the headline daily-check write target),
- `haccp_suppliers` (the admin-gated CRUD surface; proves write under the badge),
- `haccp_sop_content` (the handbook/search read surface),
- `haccp_corrective_actions` (the cross-cutting CA table),
- `haccp_documents` (a docs surface).

🗣 In plain English: all 30 locks are stamped from the same template, so we prove the template on 5
varied doors instead of fixturing all 30 — same confidence, a fraction of the setup. The completeness
guarantee that *all 30* are locked comes from the explicit-enumeration migration + the schema-integrity
test, not from 30 pgTAP runs.

**Assertions per sampled table (and the cross-cutting ones):**
1. **GRANT — active user:** with `SET LOCAL ROLE authenticated` and `app.current_user_id` = an ACTIVE
   user → `isnt_empty` SELECT; `lives_ok` INSERT; `lives_ok` UPDATE (in-place); `lives_ok` DELETE.
2. **DENY — empty GUC (fail-closed clean):** `app.current_user_id = ''` → `is_empty` SELECT (clean
   zero rows, no throw — the helper short-circuits via `nullif`); INSERT → `throws_ok '42501'` (clean
   RLS violation, NOT a 22P02 cast error). 🗣 No sticky-note id = sees nothing, can write nothing,
   and it fails cleanly rather than crashing.
3. **DENY — non-existent user:** `app.current_user_id` = a random UUID with no users row → `is_empty`
   SELECT, INSERT `throws_ok '42501'`. 🗣 A made-up id is treated as "not a real staff member".
4. **DENY — INACTIVE user (the genuinely new assertion vs cash):** create a user with `active = false`
   (insert directly, since `test_helper_make_user` always sets `active = true`), set the GUC to it →
   `is_empty` SELECT, INSERT `throws_ok '42501'`. This is the one behaviour that distinguishes
   `current_user_is_active()` from the existing `current_user_is_valid()`. 🗣 A deactivated staff
   member's keycard is rejected — the headline new guarantee.
5. **MASTER-KEY bypass:** `RESET ROLE` (back to superuser/owner), empty GUC → `isnt_empty` SELECT.
   Proves the live path (service-role) is unaffected → the inert-ness guarantee at the DB layer.
   🗣 The master key still opens the door regardless of the locks — which is why nothing changes today.

**Fixture note:** `test_helper_make_user(name, role)` always inserts `active = true` (helper line 20),
so the INACTIVE fixture must be a direct `INSERT INTO users (... active) VALUES (... false)` inside the
test's `DO` block. Plan for it explicitly. 🗣 The shared helper only makes switched-on users, so we
hand-make one switched-off user for the inactive test.

---

## 10. The `…ForCaller` factories to add (full list + composition)

Add to `lib/wiring/haccp.ts`, after the singletons, importing the per-caller adapter factories
(`createSupabaseHaccp*Repository`), `authenticatedClientForCaller`, and `dbTokenMinter` (mirroring
orders/visits). The 11 service factories are **single-DB-port** (one repo each) EXCEPT reporting,
which has a second NON-DB port; the use-case factory is **multi-port** (composes a per-caller CA
service). Each factory: `mint → authenticatedClientForCaller → bind adapter(s) → create…Service`.
**NEVER memoize.**

| # | Factory to add | Builds (per-caller) | Notes |
|---|----------------|---------------------|-------|
| 1 | `haccpDailyChecksServiceForCaller(userId)` | `createHaccpDailyChecksService({ dailyChecks: createSupabaseHaccpDailyChecksRepository(client) })` | single port |
| 2 | `haccpCorrectiveActionsServiceForCaller(userId)` | `createHaccpCorrectiveActionsService({ correctiveActions: createSupabaseHaccpCorrectiveActionsRepository(client) })` | single port |
| 3 | `haccpAssessmentsServiceForCaller(userId)` | `createHaccpAssessmentsService({ assessments: createSupabaseHaccpAssessmentsRepository(client) })` | single port |
| 4 | `haccpTrainingServiceForCaller(userId)` | `createHaccpTrainingService({ training: createSupabaseHaccpTrainingRepository(client) })` | single port |
| 5 | `haccpPeopleServiceForCaller(userId)` | `createHaccpPeopleService({ people: createSupabaseHaccpPeopleRepository(client) })` | single port. **KEEP** the `haccpPeopleService` SERVICE-ROLE singleton — the public visitor kiosk (no logged-in user) stays on it in PR10b. |
| 6 | `haccpReviewsServiceForCaller(userId)` | `createHaccpReviewsService({ reviews: createSupabaseHaccpReviewsRepository(client) })` | single port |
| 7 | `haccpAnnualReviewServiceForCaller(userId)` | `createHaccpAnnualReviewService({ annualReview: createSupabaseHaccpAnnualReviewRepository(client) })` | single port |
| 8 | `haccpReportingServiceForCaller(userId)` | `createHaccpReportingService({ reporting: createSupabaseHaccpReportingRepository(client), spreadsheet: xlsxSpreadsheetExporter })` | **TWO ports**: the DB `reporting` port is per-caller; the `spreadsheet` (xlsx) port is NOT a DB port → reuse the shared `xlsxSpreadsheetExporter` singleton (same pattern as Orders keeping non-DB deps). 🗣 The Excel exporter has no identity, so it stays shared; only the database reads get a keycard. |
| 9 | `haccpHandbookServiceForCaller(userId)` | `createHaccpHandbookService({ handbook: createSupabaseHaccpHandbookRepository(client) })` | single port |
| 10 | `haccpSuppliersServiceForCaller(userId)` | `createHaccpSuppliersService({ suppliers: createSupabaseHaccpSuppliersRepository(client) })` | single port |
| 11 | `haccpLookupsServiceForCaller(userId)` | `createHaccpLookupsService({ lookups: createSupabaseHaccpLookupsRepository(client) })` | single port |
| 12 | `submitHaccpDailyCheckForCaller(userId)` | `createSubmitHaccpDailyCheck({ correctiveActions: <a per-caller CA service built from the SAME client> })` | **multi-port via composition.** Mint+build the client ONCE, build a per-caller `HaccpCorrectiveActionsService` from it, pass THAT into the use-case (do NOT call `haccpCorrectiveActionsServiceForCaller` separately — that would mint a second token; build one client and reuse it, mirroring `pickingListUsecaseForCaller`). 🗣 The CA-filing use-case needs the corrective-actions service to also run under the same keycard, so cut one keycard and wire both off it. |

🗣 In plain English: twelve keycard machines — one per HACCP service, plus one for the corrective-action
filing step. Eleven are simple (one database connection each). Reporting also uses an Excel exporter
that doesn't need a keycard, so that stays shared. The twelfth (the daily-check filer) needs its inner
corrective-action service on the same keycard, so we build one keycard and feed both.

**Adapter factory signatures confirmed** (each exports `createSupabaseHaccp*Repository(client)`):
DailyChecks:165, CorrectiveActions:47, Assessments:102, Training:47, People:42, Reviews:50,
AnnualReview:57, Reporting:42, Handbook:40, Suppliers:54, Lookups:26. The current
`lib/adapters/supabase/index.ts` re-exports the service-role singletons; PR10a must also re-export the
`create…` factories + `authenticatedClientForCaller` (orders/visits already re-export theirs — verify
which HACCP `create…` factories are already exported from the barrel and add any missing). 🗣 Confirm
the wiring file can import each keycard-capable adapter builder; add any that aren't yet re-exported.

---

## 11. Hexagonal / rip-out check (Gate 2 verdict)

- **Port(s) used/added:** NO new port. Reuses the 11 existing HACCP ports + the `DbTokenMinter` port.
  🗣 No new socket shapes — we reuse the existing HACCP sockets and the keycard-minting socket.
- **Adapter(s):** NO new adapter. Reuses the existing Supabase `Haccp*Repository` adapters (their
  `create…(client)` factories), the `web-crypto` `DbTokenMinter`, and `authenticatedClientForCaller`.
  🗣 No new vendor plug — we reuse the Supabase plugs we already have, just feeding them a keycard
  client instead of the master-key client.
- **New dependencies (`package.json`):** **NONE.** 🗣 No new libraries.
- **Wrapped vendor SDK:** N/A (no new vendor). The only `@supabase/*` use stays inside
  `lib/adapters/supabase/**` and `lib/wiring/haccp.ts` (the one wiring file allowed to import
  adapters). The `no-adapter-imports` lint pin (`tests/unit/lint/no-adapter-imports.test.ts`, 49/49)
  STAYS GREEN — wiring is the permitted importer. 🗣 The vendor SDK stays in its allowed rooms.
- **Rip-out test:** Replace the DB vendor for HACCP = write one new adapter per port under
  `lib/adapters/<vendor>/` + change the wiring lines in `lib/wiring/haccp.ts`. The services, ports,
  domain types, and routes are untouched. **Result: PASS.** 🗣 Swapping the database vendor for HACCP
  still touches only the adapters + the one wiring file — nothing leaked.

**VERDICT: PASS — no new port, no new adapter, no new dependency, rip-out unchanged at one-adapter-set
+ one-wiring-file. No Gate 2 hexagonal blocker.**

---

## 12. Acceptance criteria

1. Migration `20260625120000_haccp_authenticated_rls_policies.sql` applies clean on `db:reset` and to
   prod; it is additive only (no destructive verb) → no PITR gate.
2. All 30 `haccp_*` tables carry the four `_select/_insert/_update/_delete` policies, all keyed on
   `public.current_user_is_active()`; the helper is created, owner = postgres, EXECUTE granted to
   `authenticated` only.
3. pgTAP `015-rls-haccp.test.sql` is green: active user GRANTED; anon / empty-GUC / non-existent /
   **inactive** user DENIED (clean, no 22P02); master-key BYPASSES.
4. `lib/wiring/haccp.ts` exports all 12 original singletons (unchanged) AND the 12 new `…ForCaller`
   factories; no route imports any `…ForCaller`.
5. `tests/unit/wiring/haccpServiceForCaller.test.ts` proves mint-once / fresh-client / never-memoize
   for the new factories incl. the multi-port use-case factory; the updated
   `haccpService.test.ts` is green.
6. `no-adapter-imports` lint pin and the migration-filename pin stay green; full `npm run test`,
   pgTAP, and integration suites pass.
7. **Inert-ness:** the integration suite results are byte-identical to pre-PR (no route behaviour
   changed) — the cert states this explicitly.

🗣 In plain English: the locks exist on all 30 doors and only open for switched-on staff; the keycard
machines exist but are unused; the test suite proves all of it and proves nothing a user does changed.

---

## 13. What PR10b will do (OUT OF SCOPE here — context only)

PR10b (a separate, later FORGE loop) flips every **authenticated** HACCP route off the service-role
singleton onto the matching `…ForCaller` factory, sourcing the caller id from the **`x-mfs-user-id`**
header that `middleware.ts:151` already sets on every authenticated request (HACCP routes don't call
`requireRole`/`getSession` for a userId the way Orders does, so the header is the userId source).
The ONE exception: **`/api/haccp/visitor`** (the public kiosk — no logged-in user, no
`x-mfs-user-id`) STAYS on the service-role `haccpPeopleService` singleton (which is why PR10a keeps
that singleton). At that point the dormant policies become live (the keycard clients run as
`authenticated`, so RLS evaluates). PR10b is where the real behaviour change + full ANVIL browser-tap
matrix lives.

🗣 In plain English: step two hands out the keycards — it switches each HACCP screen to use the
per-staff keycard instead of the master key, reading "who is this?" from the header the login
middleware already stamps on every request. The public visitor kiosk has no logged-in person, so it
keeps the master key. Only then do the locks actually start doing work.

---

## 14. Risk Assessment (MANDATORY)

> Severity scale: LOW / MEDIUM / HIGH. "Must-fix" = a Gate 2 blocker until resolved.

### 14.1 Concurrency / race conditions
- **R-CONC-1 — memoized per-caller client leaks identity. Severity: MEDIUM. Must-fix: the test, not a
  code fix.** If any `…ForCaller` factory memoized its client, one staff member's keycard could serve
  another's request. **Mitigation:** the factories mint+build per call (never memoize), enforced by
  the new `haccpServiceForCaller.test.ts` (two callers → two mints, mirrors the orders/complaints
  pin). For PR10a specifically the factories have NO caller, so the leak is unreachable in prod — but
  the never-memoize pin must ship now so PR10b inherits a proven-safe foundation. 🗣 The keycard
  machine must cut a fresh keycard every time; a test enforces it. Harmless until PR10b uses it, but
  we lock the guarantee in now.

### 14.2 Security
- **R-SEC-1 — policy predicate too LOOSE (the genuinely new thing). Severity: HIGH. Must-fix.** A
  wrong predicate (e.g. forgetting `WITH CHECK` on UPDATE, or using existence-only instead of active)
  would, once PR10b flips routes, let the wrong principal read/write HACCP. **Mitigation:** mirror the
  shipped cash idiom exactly; use the new `current_user_is_active()` (active-aware) helper; pgTAP
  asserts grant-active + deny-anon/empty/nonexistent/**inactive** + master-key-bypass across a
  representative sample; UPDATE carries both USING and WITH CHECK. **Dormant in PR10a** (service-role
  bypass), so a defect here cannot harm prod until PR10b — but it is the headline correctness target
  and pgTAP must be green before this PR ships. 🗣 The one new moving part is the lock's rule;
  we copy the proven cash rule, add the active check, and prove it five ways before shipping.
- **R-SEC-2 — `current_user_is_active()` recursion / privilege. Severity: LOW. Must-fix: no.** A
  helper that reads `users` from inside a `users` policy could recurse (42P17), and an over-granted
  EXECUTE would widen the surface. **Mitigation:** `SECURITY DEFINER` + owner postgres (reads users as
  owner, bypasses RLS → no recursion); EXECUTE revoked from PUBLIC/anon, granted only to
  `authenticated` — copies the proven `current_user_is_valid()` shape. 🗣 The helper reads users as
  the owner so it can't trigger its own lock forever, and only the keycard role may run it.

### 14.3 Data migration
- **R-DATA-1 — destructive verb sneaks in / PITR gate. Severity: LOW. Must-fix: no.** **Mitigation:**
  the migration is `CREATE FUNCTION` + `CREATE POLICY` + (maybe) `GRANT` only — no
  DROP/TRUNCATE/ALTER TYPE/DROP NOT NULL. Reviewer confirms; the ANVIL Lock PITR gate should NOT fire.
  🗣 We only add things, never remove or reshape data, so no recovery snapshot is needed.
- **R-DATA-2 — missing `authenticated` table grant. Severity: LOW. Must-fix: no.** If a `haccp_*`
  table lacks a SELECT/INSERT/UPDATE/DELETE grant to `authenticated`, the lock denies even an active
  user (privilege failure beneath the policy) — surfacing only in PR10b. **Mitigation:** §7.1
  verification step checks every table's grant and the migration adds any missing grant; pgTAP's
  grant-active assertions would catch a sampled gap. 🗣 A lock only matters if the keycard role can
  reach the door; we confirm the door is reachable for all 30 and add the entry permission if missing.

### 14.4 Business-logic flaws
- **R-BIZ-1 — incomplete table coverage leaves a deny-all trap. Severity: MEDIUM. Must-fix.** If any
  of the 30 tables is omitted from the migration, its route silently breaks the moment it flips in
  PR10b (RLS-enabled + zero-policies = deny-all to authenticated). **Mitigation:** explicit
  enumeration of all 30 (no loop), cross-checked against the verified baseline list AND the
  RLS-enable migration (both give 30); a reviewer diffs the 30 table names. 🗣 Miss one door and that
  screen goes blank later; we list all 30 by name and double-check the list.
- **R-BIZ-2 — active-only rule diverges from CONTEXT.md. Severity: LOW. Must-fix: no.** **Mitigation:**
  Step 6 tightens CONTEXT.md to say "active" so doc and DB agree. 🗣 We update the written rule to
  match the lock.

### 14.5 Launch blockers
- **R-LAUNCH-1 — existing wiring guard test fails by design. Severity: MEDIUM. Must-fix.** The current
  `haccpService.test.ts` asserts NO `…ForCaller` exports and an exact 12-export set; PR10a makes both
  false → red suite if not updated. **Mitigation:** Step 3 updates that test in the SAME PR. 🗣 An old
  test says "no keycard machines allowed"; we add them on purpose, so that test must be rewritten in
  this PR or the build goes red.
- **R-LAUNCH-2 — migration timestamp collision / short-form. Severity: LOW. Must-fix: no.**
  **Mitigation:** use full 14-digit `20260625120000…` (after the latest `20260622120000`); the
  filename-convention pin enforces it. 🗣 Right timestamp format, after the last one — a test enforces it.
- **R-LAUNCH-3 — HACCP preview flake (F-TD-37). Severity: LOW. Must-fix: no.** PR10a adds no E2E
  (inert), so it does not aggravate the flake; recovery = Supabase MCP `reset_branch`. 🗣 The known
  preview wobble isn't poked here; if a preview branch wedges, reset it.

### Risk headline
**Must-fix risks: R-SEC-1 (policy correctness — the one new thing), R-BIZ-1 (all-30 coverage),
R-CONC-1 (never-memoize pin), R-LAUNCH-1 (update the guard test).** All four are RESOLVED WITHIN this
plan (copy the proven cash idiom + active helper + pgTAP; explicit 30-table enumeration; the
never-memoize wiring test; the guard-test rewrite in the same PR). **None is unresolved → no open Gate
2 blocker, provided the implementer follows §7–§10 and ships the test updates in §8.** The hexagonal
verdict is PASS.

🗣 In plain English: the four things that could bite are all things this plan already tells the
implementer exactly how to handle. The genuinely new risk is the lock's rule itself, and we de-risk
it by copying a rule that's already shipped four times and proving it with database tests — while it
stays dormant in production this whole PR.
