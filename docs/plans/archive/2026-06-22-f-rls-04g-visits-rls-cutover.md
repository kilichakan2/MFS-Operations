# F-RLS-04g — Visits RLS Cutover (execution plan)

**Date:** 2026-06-22
**Pattern:** 7th copy of the shipped RLS-cutover pattern (04a Orders → 04f Complaints).
**Prod Supabase ref:** `uqgecljspgtevoylwkep`
**Spec status:** LOCKED (Frame). This plan turns the locked spec into ordered build steps — it does not re-litigate it.

> 🗣 **In plain English:** Today the Visits screens reach the database using the
> master key (service-role), which ignores all the "who can see what" rules. This
> change makes the Visits read + own-edit screens carry each user's own keycard
> instead, so the database itself enforces "sales/drivers see only their own
> visits, admin sees all, office sees none." The create-visit button keeps the
> master key for now (next copy). Plus one new migration to un-break the visit
> notes (they're currently locked to nobody under a keycard).

---

## Mini-map

```
DOMAIN (Visits core logic)
  └─ VisitsRepository (port) → [Supabase]  (adapter — REUSED, no change)
     wiring: lib/wiring/visits.ts gains visitsServiceForCaller(callerUserId)
     DB:     new visit_notes RLS policies (visits policies already correct, untouched)
🗣 one plug per socket — same Supabase plug, we just hand it the caller's keycard instead of the master key
```

---

## 1. Goal

Move the Visits **READ + own-mutate** routes off the service-role (master-key)
Supabase client onto a per-request **authenticated** client carrying the caller's
minted JWT, so the existing GUC-based row-level-security (RLS) policies fire.
Owner-scoping is enforced **at the database**, not (only) in the route.

> 🗣 **In plain English:** Stop trusting the route code alone to filter rows; make
> the database refuse to hand over rows the caller shouldn't see. Belt and braces.

**Visibility rule (confirmed against prod census: sales owns 280 visits, drivers 50,
office 0, admin 0; visit_notes authored only by sales = 7):**

| Role | Visits / notes they see |
|------|--------------------------|
| `admin` | ALL visits (the only "see-all" role — `public.is_admin()`) |
| `sales` + `drivers` | ONLY their own visits/notes (field visit-loggers) |
| `office` | NOTHING in visits — owns none, no escape hatch; board goes empty **BY DESIGN** |

> 🗣 **In plain English:** Office staff log no visits, so once the database enforces
> ownership their visits board shows nothing. That is the intended, spec-locked
> outcome — not a bug to "fix" later. Flagged as a behaviour-change risk in §9.

---

## 2. Domain terms (plain-English bridge)

- **RLS (row-level security)** — per-row "who can read/write this" rules living in
  the database. 🗣 The bouncer at the door of each table row, checking your keycard.
- **GUC `app.current_user_id`** — a per-request session variable holding the caller's
  user id, set from the JWT by the `db_pre_request` hook. 🗣 The name the bouncer
  reads off your keycard to decide what you may touch.
- **`authenticated` vs the service-role (Postgres roles)** — `authenticated` = RLS is
  evaluated; the service-role = RLS bypassed entirely. 🗣 Keycard vs master key. The
  master key opens every door without checking; we're switching to keycards.
- **`public.is_admin()`** — SECURITY DEFINER STABLE SQL fn; returns true only for
  the GUC user whose `role = 'admin'` (baseline.sql L177-187). 🗣 A trusted helper
  that answers one question: "is the keycard holder an admin?" — admin only.
- **Per-caller factory** — `visitsServiceForCaller(callerUserId)` builds a fresh
  service graph bound to one caller's keycard. 🗣 A fresh, single-user keycard
  minted for each request — never reused, so no identity leaks between callers.
- **The "trap" — `visit_notes` RLS-enabled, ZERO policies** — RLS is ON but no
  policy grants access, so under a keycard the table is **deny-all** (returns
  empty/blank). 🗣 The notes room has a locked door but nobody was issued a key;
  this migration cuts the keys.

---

## 3. Compliance / architecture flags

- **Migration filename** must use a FULL 14-digit timestamp (`YYYYMMDDHHMMSS_…`).
  The short `YYYYMMDD_NNN` form is BANNED and fails
  `tests/unit/migrations/filename-convention.test.ts`. 🗣 Two same-day migrations
  with short names collide and break Supabase preview-branch resync — use the long form.
- **Hexagonal (ADR-0002):** the vendor `SupabaseClient` is built and consumed
  entirely inside `lib/wiring/visits.ts`; routes never see it. No new
  `package.json` entry. Rip-out test stays PASS (§12).
- **PITR not required:** the migration is additive/idempotent (DROP POLICY IF
  EXISTS → CREATE POLICY) and touches NO data, NO table/column. 🗣 Nothing is
  deleted or rewritten, so no point-in-time-restore safety gate fires.

---

## 4. ADR conflicts

**None.** This copy follows ADR-0002 (hexagonal shape), ADR-0004 (RLS posture),
and ADR-0007 (app-minted token + GUC bridge) exactly as the six prior cutovers
did. No ADR is contradicted or amended.

---

## 5. Grounding confirmation (every path verified before writing steps)

| Spec claim | Verified | Note |
|---|---|---|
| `lib/wiring/complaints.ts:53-61` `complaintsServiceForCaller` template | ✅ confirmed | exact single-port factory shape cloned in §7 |
| `lib/wiring/orders.ts:98-108` `ordersServiceForCaller` | ✅ confirmed | same mint→client→repo pattern |
| `lib/adapters/supabase/authenticatedClient.ts:37-47` `authenticatedClientForCaller({token})` | ✅ confirmed | anon-key + Bearer, persistSession:false |
| `dbTokenMinter.mint({userId})` import path | ✅ **`@/lib/wiring/dbToken`** | exported as `dbTokenMinter` (web-crypto adapter under the hood) |
| db-pre-request hook migration | ✅ `20260614210221_db_pre_request_guc_bridge.sql` | sets `app.current_user_id` from JWT `user_id` claim on the `authenticator` role; covers `authenticated` |
| `lib/wiring/visits.ts:28-30` service-role singleton + L10-18 "deferred to F-RLS-04g" note | ✅ confirmed | this PR fulfils it; ADD the factory here |
| `lib/services/VisitsService.ts:102` `createVisitsService(deps)`, deps `{ visits: VisitsRepository }` | ✅ confirmed | single port |
| Supabase visits repo factory taking a client | ✅ `createSupabaseVisitsRepository(client)` at `lib/adapters/supabase/VisitsRepository.ts:194`; exported from `lib/adapters/supabase/index.ts:63` | singleton `supabaseVisitsRepository` (L464) STAYS as parachute |
| The 7 flip routes + 1 deferred | ✅ all confirmed below | all currently `import { visitsService } from '@/lib/wiring/visits'` |
| caller-id source | ✅ **`req.headers.get('x-mfs-user-id')`** → 401 if absent | identical to complaints/orders routes |
| baseline `visits` policies match spec | ✅ baseline.sql L2494/2497/2500/2503 | `(user_id = GUC OR is_admin())` for select/update/delete; insert WITH CHECK `user_id = GUC` — **leave untouched** |
| `visit_notes` RLS enabled, zero policies | ✅ enabled at `20260613000000_enable_rls_42_tables.sql:115`; NO policy in any migration → deny-all | THE TRAP — new migration required |
| `visit_notes` columns | ✅ baseline.sql L1292-1306 | `id, visit_id, user_id (author), body, created_at, updated_at`; FK `visit_id → visits(id) ON DELETE CASCADE`, `user_id → users(id) ON DELETE SET NULL` |
| `is_admin()` admin-only | ✅ baseline.sql L177-187 | `role = 'admin'` only |
| embeds OK (customers, users) | ✅ customers_select (baseline L2449 — GUC not-empty); users_directory_select (`20260618130000`) | both grant authenticated SELECT — no change |
| GRANTs on `visit_notes` to authenticated | ✅ baseline.sql L2783 `GRANT ALL … TO authenticated` | no new GRANT needed |

**Deviations from grounding:** none material. One clarification — there is **no
`test_helper_make_visit`** pgTAP helper (only `test_helper_make_user` /
`test_helper_make_customer` exist in `supabase/tests/_helpers.sql`); the new pgTAP
test inserts `visits` rows inline (column shape in §8.3). This matches how
`013-rls-complaints.test.sql` seeds.

---

## 6. Exact files to change

**New (2):**
1. `supabase/migrations/20260622120000_visit_notes_authenticated_policies.sql` — the migration (§8.1).
2. `tests/unit/wiring/visitsServiceForCaller.test.ts` — wiring unit test (§10.1).
3. `supabase/tests/014-rls-visits.test.sql` — pgTAP RLS test (§10.3).
4. `supabase/migrations/rollback/2026-06-22-f-rls-04g-visits-rls-cutover-rollback.sql` — manual DB rollback (§11).

**Edited (1 wiring + 4 route files = the 7 flipped handlers):**
5. `lib/wiring/visits.ts` — ADD `visitsServiceForCaller` (§7).
6. `app/api/admin/visits/route.ts` — GET (`listAllWithFilters`).
7. `app/api/detail/visit/route.ts` — GET (`findDetailById`).
8. `app/api/screen3/visit/notes/route.ts` — GET / POST / PATCH (3 verbs).
9. `app/api/screen3/visit/route.ts` — PATCH + DELETE (2 verbs).

**NOT touched (deferred):**
- `app/api/screen3/sync/route.ts` — POST create-visit stays on the service-role
  singleton this copy (exactly as Orders' create stayed master-key in 04a). §13(a).
- The route-level owner filters (sales→own, managers→all) — kept AS-IS (belt-and-
  braces). §13(b).

---

## 7. The per-caller factory (clone of `complaintsServiceForCaller`)

Edit `lib/wiring/visits.ts`. Keep the existing `visitsService` singleton (L28-30)
as the rollback parachute. Add the imports and the factory below.

```ts
// add to the imports
import {
  supabaseVisitsRepository,          // keep — service-role parachute singleton
  createSupabaseVisitsRepository,    // NEW — per-caller table repo
  authenticatedClientForCaller,      // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

// ... existing `export const visitsService = createVisitsService({ visits: supabaseVisitsRepository });` STAYS ...

/** Build a VisitsService whose reads/writes run as ONE caller (Postgres
 *  `authenticated` role, so the visits + visit_notes RLS policies fire).
 *  Per-request — NEVER memoize (a memoized client would leak one caller's
 *  identity to another). Single port (visits). Consumed by the 7 flipped
 *  visit handlers since F-RLS-04g. The `visitsService` singleton above STAYS
 *  as the rollback parachute. */
export async function visitsServiceForCaller(
  callerUserId: string,
): Promise<VisitsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createVisitsService({
    visits: createSupabaseVisitsRepository(client), // per-caller (RLS fires)
  });
}
```

Also update the header doc-comment: change the L15-18 "DEFERRED to F-RLS-04g" note
to "ADDED by F-RLS-04g" with the parachute note, mirroring `complaints.ts:10-30`.

> 🗣 **In plain English:** This is a byte-for-byte twin of the complaints factory:
> mint a fresh single-user token, build a client that carries it, hand that client
> to the visits repository. One port, so nothing else to wire. Never cached — each
> request gets its own keycard.

---

## 8. The migration + SQL

### 8.1 Migration file

**Path:** `supabase/migrations/20260622120000_visit_notes_authenticated_policies.sql`

```sql
-- 20260622120000_visit_notes_authenticated_policies.sql
--
-- F-RLS-04g — Visits RLS cutover. The 7th copy of the cutover pattern
-- (04a Orders → 04f Complaints). Adds the MISSING visit_notes policies.
--
-- KEY DECISION — the `visits` table policies are NOT touched. The dormant
-- baseline policies already encode the rule exactly (baseline.sql L2494-2503):
--   visits_select/update/delete: USING (user_id = app.current_user_id OR is_admin())
--   visits_insert:               WITH CHECK (user_id = app.current_user_id)
-- They simply START FIRING once the routes run as the `authenticated` role.
-- DO NOT add/alter/drop any `visits` policy.
--
-- THE TRAP this migration fixes: visit_notes has RLS ENABLED
-- (20260613000000_enable_rls_42_tables.sql:115) with ZERO policies → deny-all to
-- the authenticated role. Without these policies EVERY notes route returns
-- empty/blank once the routes are cut over.
--
-- POLICY SHAPE — visibility is DERIVED FROM THE PARENT VISIT (single source of
-- truth; notes inherit the visit's access rule via an EXISTS subquery):
--   SELECT: parent visit is visible to the caller (own OR admin)
--   INSERT: parent visit is visible AND the note's author is the caller
--   UPDATE: edit only your own note, or admin (app rule "author or manager";
--           manager = admin only here)
--   DELETE: own note or admin — defense-in-depth symmetry (NO delete-note route
--           exists today, so it is not route-exercised; added for parity — see
--           plan §8.2 for the decision).
--
-- ROLE MODEL: the EXISTS predicate references visits.user_id vs the GUC and
-- public.is_admin() — so sales/drivers see only notes on their own visits, admin
-- sees all, office sees none (no visits → no notes). Matches the visits rule.
--
-- GRANTS: baseline.sql L2783 already GRANTs ALL on visit_notes TO authenticated
--   → NO GRANT added here.
--
-- EMBEDS UNAFFECTED: visit detail/admin reads embed `customers` (customers_select
--   baseline L2449) and `users` (users_directory_select 20260618130000); both
--   grant authenticated SELECT → FK names resolve under the badge. Untouched.
--
-- MASTER-KEY role still BYPASSES RLS (tables are ENABLE, not FORCE) → the
--   parachute singleton and the deferred screen3/sync create path are unaffected.
--
-- NON-DESTRUCTIVE: DROP POLICY IF EXISTS + CREATE POLICY only — no DROP TABLE/
--   TRUNCATE/ALTER TYPE/DROP COLUMN/DROP NOT NULL, no data touched → NO PITR gate.
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset. Prod
-- application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a-04f / F-TD-22 ordering).

-- ── idempotent drops of the NEW policy names (re-runnable) ──
DROP POLICY IF EXISTS visit_notes_select ON visit_notes;
DROP POLICY IF EXISTS visit_notes_insert ON visit_notes;
DROP POLICY IF EXISTS visit_notes_update ON visit_notes;
DROP POLICY IF EXISTS visit_notes_delete ON visit_notes;

-- ── SELECT: visible iff the PARENT VISIT is visible to the caller ──
CREATE POLICY visit_notes_select ON visit_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_notes.visit_id
        AND ( v.user_id = current_setting('app.current_user_id', true)::uuid
              OR public.is_admin() )
    )
  );

-- ── INSERT: parent visit visible AND the note's author is the caller ──
CREATE POLICY visit_notes_insert ON visit_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_notes.visit_id
        AND ( v.user_id = current_setting('app.current_user_id', true)::uuid
              OR public.is_admin() )
    )
    AND visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
  );

-- ── UPDATE: edit only your own note, or admin (manager = admin here) ──
CREATE POLICY visit_notes_update ON visit_notes
  FOR UPDATE USING (
    visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
    OR public.is_admin()
  )
  WITH CHECK (
    visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
    OR public.is_admin()
  );

-- ── DELETE: own note or admin — defense-in-depth symmetry (no route today) ──
CREATE POLICY visit_notes_delete ON visit_notes
  FOR DELETE USING (
    visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
    OR public.is_admin()
  );
```

> 🗣 **In plain English:** Four small rules cut for the notes room. Reading a note
> is allowed only if you can see the visit it hangs off (own visit, or you're
> admin). Adding a note requires the same plus that you sign it as yourself.
> Editing/deleting is limited to your own notes, or admin. The visits table needs
> no new rules — its rules were always correct, just dormant until now.

### 8.2 DELETE policy decision (spec asked us to decide)

**Decision: ADD the DELETE policy** (as written above). Reason: defense-in-depth
symmetry — `visit_notes` will then have a complete owner-or-admin policy set, so
if a delete-note route is ever added it is RLS-safe by default rather than silently
deny-all. There is no current `deleteNote` route, so it is harmless today (not
route-exercised). No reason found to omit. (Matches the 04f pattern, which shipped
DELETE policies on `complaint_notes` despite no live delete-note path.)

### 8.3 `visits` baseline policies — confirmed correct, UNTOUCHED

Verified verbatim in `supabase/migrations/20260101000000_baseline.sql`:
- L2500 `visits_select`  — `USING (user_id = GUC OR is_admin())`
- L2503 `visits_update`  — `USING (user_id = GUC OR is_admin())`
- L2494 `visits_delete`  — `USING (user_id = GUC OR is_admin())`
- L2497 `visits_insert`  — `WITH CHECK (user_id = GUC)`

These start firing the moment the routes run as `authenticated`. The migration
does NOT reference them.

---

## 9. Numbered, ordered build steps (TDD-friendly)

> Order: tests-first where practical, then wiring, then routes, then DB test, then
> route integration. Each step names the exact file + symbol.

1. **Write the wiring unit test (red).** Create
   `tests/unit/wiring/visitsServiceForCaller.test.ts` — clone
   `complaintsServiceForCaller.test.ts`, swapping `complaints`→`visits` symbols
   (single port; assert `Object.keys(passedDeps) == ["visits"]`). It fails: factory
   not exported yet. (Test body in §10.1.)

2. **Add the factory (green).** Edit `lib/wiring/visits.ts` per §7. Add the three
   imports + `dbTokenMinter` + `visitsServiceForCaller`. Update the header comment
   (DEFERRED → ADDED). Keep `visitsService` singleton. Unit test goes green.

3. **Write the migration.** Create
   `supabase/migrations/20260622120000_visit_notes_authenticated_policies.sql` per
   §8.1. Run `npm run db:reset` locally — must apply clean (idempotent, re-runnable).

4. **Write the pgTAP RLS test (red→green).** Create
   `supabase/tests/014-rls-visits.test.sql` per §10.3. Run the pgTAP suite locally;
   it proves both the new `visit_notes` policies AND that the dormant `visits`
   policies now fire (own / admin / other-rep / office-empty).

5. **Flip `app/api/admin/visits/route.ts` (GET).** Replace the module-level
   `import { visitsService } from '@/lib/wiring/visits'` with
   `import { visitsServiceForCaller } from '@/lib/wiring/visits'`. Inside `GET`,
   after the existing `userId` 401 guard, add:
   `const visitsService = await visitsServiceForCaller(userId)` before the first
   `visitsService.listAllWithFilters(...)` call. Leave everything else (validation,
   prettify, ServiceError 500 mapping) byte-identical.
   **Admin-only route** (middleware enforces `/api/admin` admin), so `is_admin()`
   in the visits policies → admin sees ALL. ✅ behaviour preserved.

6. **Flip `app/api/detail/visit/route.ts` (GET).** Same swap; inside `GET` after the
   `userId` 401 guard add `const visitsService = await visitsServiceForCaller(userId)`
   before `visitsService.findDetailById(id)`. Embeds (customers/users) resolve under
   the badge — verified §5. 404/500 mapping unchanged.

7. **Flip `app/api/screen3/visit/notes/route.ts` (GET, POST, PATCH).** Swap the
   import. In EACH of the three handlers, after the `userId` 401 guard, add
   `const visitsService = await visitsServiceForCaller(userId)` (one per handler —
   each request is its own caller; never share). The existing route-level
   `verifyVisitOwnership` checks and `isManager` filters STAY (belt-and-braces,
   §13b). Note `verifyVisitOwnership(visitId, userId)` now also runs under RLS — see
   risk R-LOGIC-1 (§14) for the office-manager nuance.

8. **Flip `app/api/screen3/visit/route.ts` (PATCH, DELETE).** Swap the import. In
   BOTH handlers, after the `userId` 401 guard, add
   `const visitsService = await visitsServiceForCaller(userId)` before the
   `visitsService.updatePipelineStatus(...)` / `visitsService.deleteOwnVisit(...)`
   calls. Validation, 404/500 mapping unchanged.

9. **DO NOT touch `app/api/screen3/sync/route.ts`.** Confirm it still imports the
   `visitsService` singleton. Deferred — §13(a).

10. **Write the rollback file** `supabase/migrations/rollback/2026-06-22-f-rls-04g-visits-rls-cutover-rollback.sql` per §11.

11. **Run the full local matrix** (§10) — unit, integration, pgTAP, E2E @critical.

12. **Ship discipline (§10.5):** verify-first on prod (read-only census re-check),
    apply the migration to PROD FIRST via Supabase MCP `apply_migration`, then merge.

> 🗣 **In plain English:** Write the test that proves the keycard wiring, add the
> wiring, write the door-key migration, prove the doors with a database test, then
> walk each of the 7 handlers one line at a time — every handler just swaps one
> import and adds one "get me a keycard for this caller" line. The create button is
> deliberately skipped.

---

## 10. Test matrix (across all layers)

### 10.1 Unit — wiring (`tests/unit/wiring/visitsServiceForCaller.test.ts`)
Clone of `complaintsServiceForCaller.test.ts`. Assertions:
- mints a token via `dbTokenMinter.mint({ userId })`, builds a client via
  `authenticatedClientForCaller({ token })`, binds `createSupabaseVisitsRepository`
  to THAT client, builds the service with `{ visits: <per-caller repo> }`.
- **single port:** `Object.keys(passedDeps)` deep-equals `["visits"]`.
- **NEVER memoizes:** two calls (`user-A`, `user-B`) → 2 mints, 2 client builds, 2
  repo builds; each with the caller's own token (no identity leak, R-CONC-1).
- the master-key `visitsService` singleton is still exported (parachute).

### 10.2 Unit — service
The existing `tests/unit/wiring/visitsService.test.ts` + the VisitsService unit
tests already cover the service logic and are unaffected (the service is unchanged).
Confirm they still pass (regression guard).

### 10.3 pgTAP / RLS (`supabase/tests/014-rls-visits.test.sql`)
Model on `013-rls-complaints.test.sql`. Seed (via the bypass/superuser path, RLS
off): user-A (sales), user-B (sales), an admin user, one customer; one `visits` row
owned by user-A; one `visit_notes` row on that visit authored by user-A. Insert
`visits` inline (no `make_visit` helper):
`INSERT INTO visits (user_id, customer_id, visit_type, outcome) VALUES (<A>, <cust>, 'in_person', 'positive') RETURNING id;`
(adjust enum literals to valid `visit_type`/`outcome` values). Then
`SET LOCAL ROLE authenticated` and assert:

| # | GUC = | Assertion | Proves |
|---|-------|-----------|--------|
| 1 | user-A | `visits` SELECT of A's visit → **non-empty** | own-visit visible |
| 2 | user-A | `visit_notes` SELECT of the note → **non-empty** | own-note visible (parent-visit EXISTS) |
| 3 | user-B | SELECT A's visit → **EMPTY** | other-rep CANNOT see A's visit (owner-only fires) |
| 4 | user-B | SELECT A's note → **EMPTY** | other-rep CANNOT see A's note (inherits parent deny) |
| 5 | admin | SELECT A's visit → **non-empty** | admin sees ALL (`is_admin()`) |
| 6 | admin | SELECT A's note → **non-empty** | admin sees all notes |
| 7 | user-A | INSERT note on A's visit, author=A → **lives_ok** | author can add to own visit |
| 8 | user-B | INSERT note on A's visit, author=B → **throws 42501** | cannot note a visit you can't see |
| 9 | user-A | INSERT note on A's visit, author=B (spoof) → **throws 42501** | author-must-be-caller (WITH CHECK 2nd clause) |
| 10 | user-A | UPDATE A's own note → **lives_ok** | author can edit own note |
| 11 | user-B | UPDATE A's note → **throws 42501** (or 0 rows) | cannot edit another's note |
| 12 | admin | UPDATE A's note → **lives_ok** | admin can edit any note |
| 13 | user-A | DELETE A's own note → **lives_ok** | own-note delete (defense-in-depth policy) |
| 14 | empty GUC | SELECT visit + note → **throws 22P02** (fail-closed-by-throw; the baseline `visits` cast `''::uuid` throws before `OR is_admin()`, and `visit_notes`' EXISTS subquery reuses the same cast). Asserted with `throws_ok(..., '22P02')` as #14a (visits) + #14b (visit_notes) — `plan(16)` unchanged. **Divergence from 04f:** complaints REPLACED its baseline with `current_user_is_valid()` (clean empty); 04g keeps the GUC-cast `visits` policies untouched (guardrail #5), so empty-GUC throws rather than returning empty. Security-equivalent (no rows either way) and unreachable live (routes 401 without a userId). | empty keycard sees nothing (throw = deny) |
| 15 | empty GUC | INSERT note → **throws 42501** | fail-closed write |
| 16 | master-key (RESET ROLE) | SELECT with empty GUC → **non-empty** | service-role bypasses RLS (parachute intact) |

> Note "office-sees-none" is the SAME mechanism as #3 (user-B is a non-owning
> non-admin = exactly office's position); the integration layer asserts the
> office-empty board explicitly (§10.4).

### 10.4 Integration — routes under the authenticated badge
Add to / model on `tests/integration/` (new `visits.test.ts` or extend), booting
the dev server wired to local Supabase. Drive routes via the `x-mfs-user-id` /
`x-mfs-user-role` headers (the live auth surface). Assert:

| Scenario | Route | Expect |
|---|---|---|
| **sales sees own** | GET `/api/detail/visit?id=<own>` | 200 + the visit |
| **sales blocked on other-rep** | GET `/api/detail/visit?id=<other rep's>` | 404 Not found (RLS hides row → service returns null → existing 404) |
| **admin sees all** | GET `/api/admin/visits` | 200 + all reps' rows |
| **office sees empty** (intended) | GET `/api/admin/visits` as office *(or the visits board read path office uses)* | 200 + empty/zero rows — assert EMPTY, documented intended (§9) |
| **cross-rep notes isolation** | GET `/api/screen3/visit/notes?visit_id=<other rep's>` as sales | 404 (route `verifyVisitOwnership` + RLS both deny) |
| **own notes work** | GET/POST/PATCH `/api/screen3/visit/notes` on own visit | 200/201 |
| **own visit PATCH/DELETE** | `/api/screen3/visit` | 200 / `{deleted:true}` |
| **error bodies unchanged** | each | byte-identical 400/404/500 messages preserved (R-LOGIC-2) |

### 10.5 E2E @critical
Confirm the visits screen still works end-to-end:
- a **sales** user logs in, opens the visits screen, sees own visits, opens a visit
  detail, reads/adds a note — all 200.
- an **admin** user opens `/admin/visits`, sees all reps.
Run the existing `@critical` spec set (8/8) — none should regress. There is no
dedicated visits E2E spec today; if the visits screen is not covered by an existing
`@critical` spec, run the relevant UI smoke manually against the preview (the prior
cutovers' preview-smoke discipline) and note coverage in BACKLOG (F-TD-34 local-suite
E2E gap is the existing home for this).

### 10.6 Ship discipline (mirror 04a-04f)
1. Verify-first on prod: re-run the read-only census (sales 280 / drivers 50 /
   office 0 / admin 0; visit_notes 7 by sales) to confirm nothing shifted.
2. Apply the migration to **PROD FIRST** via Supabase MCP `apply_migration`, then
   merge the PR. (Migration is additive/inert until the code lever flips, so prod-
   first is safe.)
3. Post-merge preview smoke + prod smoke (non-500) as in prior copies.

---

## 11. Rollback

**Primary (code lever — instant, no DB change):** in each of the 7 flipped handlers,
revert the local `const visitsService = await visitsServiceForCaller(userId)` line
back to the module-level `import { visitsService } from '@/lib/wiring/visits'`
singleton. That returns all visits traffic to the master-key role, for which RLS is
irrelevant. The `visit_notes` policies then become harmless-but-inert.

**Secondary (DB lever — optional):** apply
`supabase/migrations/rollback/2026-06-22-f-rls-04g-visits-rls-cutover-rollback.sql`:

```sql
-- rollback: 2026-06-22-f-rls-04g-visits-rls-cutover-rollback.sql
--
-- Manual DB rollback for 20260622120000_visit_notes_authenticated_policies.sql.
-- Drops the 4 visit_notes policies the cutover added → visit_notes returns to
-- deny-all under the authenticated role.
--
-- The REAL rollback is the CODE LEVER (revert each handler's
-- visitsServiceForCaller(userId) back to the visitsService singleton) — that puts
-- traffic on the master key, for which RLS is irrelevant. With the code lever
-- pulled these policies are harmless-but-inert, so this DB lever is optional.
--
-- The `visits` baseline policies were NOT created by this cutover and are NOT
-- dropped here (they are dormant under the master key).
--
-- No data rollback / no PITR: DROP POLICY only — additive/idempotent, no data.

DROP POLICY IF EXISTS visit_notes_select ON visit_notes;
DROP POLICY IF EXISTS visit_notes_insert ON visit_notes;
DROP POLICY IF EXISTS visit_notes_update ON visit_notes;
DROP POLICY IF EXISTS visit_notes_delete ON visit_notes;
```

Because the migration is non-destructive (no data touched), **no PITR is required**
for rollback.

> 🗣 **In plain English:** If anything misbehaves, flip the 7 lines back to the master
> key — instant, nothing in the database changes. Dropping the new notes keys is an
> optional tidy-up, not a recovery step. Nothing was deleted, so no restore-from-backup.

---

## 12. Hexagonal verdict (populates Gate 2)

- **Port:** `VisitsRepository` (`lib/ports`) — **REUSED**, unchanged.
- **Adapter:** `SupabaseVisitsRepository` (`createSupabaseVisitsRepository`,
  `lib/adapters/supabase/VisitsRepository.ts`) — **REUSED**, unchanged.
- **New dependencies:** **NONE** (no `package.json` entry). The factory composes
  already-shipped seams: `dbTokenMinter`, `authenticatedClientForCaller`,
  `createSupabaseVisitsRepository`, `createVisitsService`.
- **Rip-out test:** **PASS** — replacing the DB vendor for Visits = one new adapter
  folder + the `lib/wiring/visits.ts` wiring lines. The only production file that
  gains domain wiring is `lib/wiring/visits.ts` (the new factory). Routes receive a
  ready `VisitsService` built from ports; no `SupabaseClient` crosses the boundary.

> 🗣 **In plain English:** Same socket, same plug, zero new vendors. Swapping the
> database later still touches just the one wiring file. Gate 2 hexagonal line: PASS.

---

## 13. BACKLOG follow-ups to record

- **(a) F-RLS create-path cutover (deferred):** `POST /api/screen3/sync` (creates a
  visit + writes `audit_log` + touches `customers` via raw REST) STAYS on the
  service-role client this copy — exactly as Orders' create stayed master-key in
  04a. Future copy flips it (likely alongside the audit-log master-key cleanup,
  F-TD-31 family). 🗣 The create button keeps the master key for now; a later copy
  gives it a keycard too.
- **(b) Thin route-level owner filters (debt):** the route layer still filters by
  owner (`verifyVisitOwnership`, `isManager` branches) even though RLS is now the
  source of truth. Kept as belt-and-braces this copy. Follow-up debt: thin/remove
  the route-level owner filtering now RLS enforces it at the DB. 🗣 Two locks on the
  same door — fine for now, simplify later.

---

## 14. Risk Assessment (mandatory — Gate 2 input)

### Concurrency / race conditions
- **R-CONC-1 — per-caller client memoization leak.** *Severity: HIGH.* If the
  factory ever memoized the client, one caller's keycard could serve another's
  request, leaking cross-user data. **Mitigation:** factory mints fresh per call
  (§7); the wiring unit test (§10.1) asserts no memoization (2 calls → 2 distinct
  tokens). **Must-fix:** YES — but already designed in; the test is the gate.

### Security
- **R-SEC-1 — `visit_notes` deny-all if migration missing/not-applied-to-prod.**
  *Severity: HIGH (availability, not leak).* Routes flipped to the badge with no
  notes policies → every notes read returns blank in prod. **Mitigation:** apply
  migration to PROD FIRST, then merge (§10.6); pgTAP #2/#6/#7 prove the policies.
  **Must-fix:** YES (process gate — the prod-first ordering).
- **R-SEC-2 — INSERT author-spoof.** *Severity: MEDIUM.* A caller could try to write
  a note authored as someone else. **Mitigation:** the INSERT WITH CHECK's 2nd
  clause (`visit_notes.user_id = GUC`) blocks it; pgTAP #9 asserts 42501.
  **Must-fix:** NO (covered by the policy + test).

### Data migration
- **R-DATA-1 — none.** *Severity: NONE.* Migration is additive policy-only, touches
  no rows/columns/types → no PITR, no backfill, no data risk. "No material data-
  migration risk."

### Business-logic flaws
- **R-LOGIC-1 — office/manager notes nuance.** *Severity: MEDIUM.* The notes route's
  `isManager = role === 'admin' || role === 'office'` lets office *skip* the
  route-level `verifyVisitOwnership` check — but under RLS, `office` is NOT
  `is_admin()`, so the DB will still deny office any visit/note rows. Net effect:
  office's notes reads return empty (consistent with the locked office-sees-nothing
  rule, §9). This is the **intended** behaviour change, not a flaw — but it means the
  route's `office`-as-manager branch is now effectively dead for reads. **Mitigation:**
  documented as intended (§9) + folded into §13(b) follow-up debt; integration test
  asserts office-empty (§10.4). **Must-fix:** NO.
- **R-LOGIC-2 — error-body / status drift.** *Severity: MEDIUM.* RLS-hidden rows
  surface as `null`/empty in the service, which the routes already map to existing
  404/empty responses — but a careless edit could change a 404 to a 500 or alter a
  message. **Mitigation:** the swap is ONE added line per handler; integration tests
  assert byte-identical error bodies (§10.4). **Must-fix:** NO.

### Launch blockers
- **R-LAUNCH-1 — office-empty visits board (intended behaviour change).**
  *Severity: MEDIUM, by design.* The office visits board goes empty in prod the
  moment this ships. This is spec-LOCKED intended behaviour (§9), not a defect — but
  it is a visible UX change that must be communicated to Hakan before ship so it
  isn't mistaken for an outage. **Mitigation:** call it out at the ship gate; it is
  the headline finding to surface. **Must-fix:** NO (intended) — but **must be
  communicated**.
- **R-LAUNCH-2 — `SUPABASE_JWT_SECRET` / GUC bridge prerequisites.**
  *Severity: LOW.* The cutover depends on the minted-token secret (set static on
  Vercel since 04a) and the `db_pre_request` hook (shipped `20260614210221`). Both
  confirmed present and exercised by six prior cutovers. **Mitigation:** none needed
  — proven infrastructure. **Must-fix:** NO.

**Risk headline:** two **must-fix** items, BOTH already satisfied by the plan's
design rather than open blockers: **R-CONC-1** (no-memoize — pinned by the wiring
unit test) and **R-SEC-1** (apply migration to PROD FIRST then merge — the ship
ordering). No unresolved must-fix blocker remains; the office-empty change
(R-LAUNCH-1) is intended and must be *communicated*, not fixed.

---

## 15. Acceptance criteria

1. `visitsServiceForCaller(callerUserId)` exists in `lib/wiring/visits.ts`, mints a
   fresh per-caller token, builds an authenticated client, binds the single
   `VisitsRepository` port to it; `visitsService` singleton retained. Wiring unit
   test green (incl. no-memoize).
2. The 7 flipped handlers call `await visitsServiceForCaller(userId)`; `screen3/sync`
   POST untouched (still master-key).
3. Migration `20260622120000_visit_notes_authenticated_policies.sql` applies clean +
   idempotent; adds exactly 4 `visit_notes` policies; touches NO `visits` policy.
4. pgTAP `014-rls-visits.test.sql` green: own-visible, other-rep-hidden, admin-all,
   author-must-be-caller, empty-GUC fail-closed, master-key bypass.
5. Integration: sales-own / admin-all / office-empty / cross-rep-isolation all pass;
   error bodies byte-identical.
6. E2E @critical 8/8 (no regression); visits screen works for sales + admin.
7. Hexagonal: rip-out PASS, no new deps, only `lib/wiring/visits.ts` gains wiring.
8. Rollback file present; office-empty change communicated at ship.
9. BACKLOG records (a) create-path deferral and (b) thin-route-filter debt.
