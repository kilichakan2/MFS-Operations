# F-RLS-04c — Routes RLS Cutover (precision plan)

Date: 2026-06-18
Unit: F-RLS-04c (Routes context RLS cutover)
Pattern: direct mirror of shipped F-RLS-04a (Orders, PR #47-era) and F-RLS-04b (Users, PR #47).
Ships as ONE PR.

🗣 In plain English: today the Route-planning screens talk to the database using a
master key that ignores all security rules. This change makes those 5 screens talk to
the database "as the logged-in user", and installs the database security rules they need
so the database itself checks "are you a real logged-in user?" on every read and write —
defence in depth, not just app-level checks.

---

## Mini-map

```
DOMAIN (Routes core logic — lib/services/routes, lib/domain)
  └─ RoutesRepository (port) → [Supabase]  (adapter: lib/adapters/supabase/RoutesRepository.ts)
     ├─ service-role singleton  routesService          (master key — RLS bypassed; STAYS = rollback parachute)
     └─ per-caller factory       routesServiceForCaller (authenticated role — RLS fires; THIS unit switches 5 routes to it)
🗣 same socket, two plugs — flip 5 routes from the master-key plug to the per-user plug; no new socket, no new vendor
```

---

## 1. Objective

Flip the **5 Routes API endpoints** from the service-role Supabase singleton
(`routesService`, master key, RLS bypassed) to the per-request authenticated client
(`routesServiceForCaller(userId)`, Postgres `authenticated` role, RLS enforced), AND add
the **full RLS policy set** the `routes` + `route_stops` tables need — because today those
tables have RLS *enabled with ZERO policies*, so any authenticated query returns nothing.

🗣 In plain English: two coupled moves in one PR. (1) Point the screens at the
"logged-in user" door. (2) Unlock that door with the right rules. If we do only (1), every
Route screen goes blank (no rules = nothing visible). If we do only (2), nothing changes
behaviourally because the screens still use the master-key door. They MUST ship together.

Wire output must stay **byte-identical** — the routes already own auth (`x-mfs-user-id`
header from `middleware.ts`), validation, field defaults, and the domain→snake_case
mapping. We touch none of that. We only swap which service instance the handler body uses.

---

## 2. Domain terms

- **Service-role client** — master key that bypasses all RLS. The current `routesService`
  singleton uses it. 🗣 A skeleton key; opens every door, ignores the locks.
- **Authenticated client** — DB connection scoped to one user via a minted JWT; the
  Postgres `authenticated` role; RLS policies apply. Built per request by
  `routesServiceForCaller(userId)`. 🗣 The user's own keycard; only opens what the rules allow.
- **GUC `app.current_user_id`** — a per-connection setting carrying the caller's user id;
  the RLS policies read it to decide access. 🗣 A name-tag the DB reads off the keycard.
- **RLS policy** — a row-level rule the database enforces on SELECT/INSERT/UPDATE/DELETE.
  🗣 The lock on each door.
- **Expand-contract** — add the new capability (policies) before/with switching callers
  onto it, so there's never a window where a live route hits a missing rule. 🗣 Build the
  new door and unlock it before you send anyone through it.

---

## 3. Compliance / ADR flags

- ADR-0002 (hexagonal shape + naming): **honoured**. `lib/wiring/routes.ts` is the only
  business-layer file importing `@/lib/adapters/*`; `routesServiceForCaller` already exists
  there (built + wired-but-unused since F-14 PR1). Routes receive a port-built
  `RoutesService`; the vendor `SupabaseClient` never crosses the boundary.
- No ADR conflicts found.
- CLAUDE.md migration-filename rule: full 14-digit timestamp required (enforced by
  `tests/unit/migrations/filename-convention.test.ts`). The new migration complies.

🗣 In plain English: this fits the project's Lego rules exactly — the swappable socket
already existed; we're just plugging a different plug into it. No rule is bent.

---

## 4. Exact files to change

### 4a. Route handlers (5 files, 7 handlers) — the cutover

Each handler ALREADY reads `const userId = req.headers.get('x-mfs-user-id')` and 401s if
absent. Per handler: import `routesServiceForCaller` alongside the existing `routesService`
import, then at the TOP of the handler body (after the 401 guard, before any service call)
add a local rebind, mirroring the Orders comment style exactly:

```ts
// F-RLS-04c: run under the per-caller authenticated client (RLS fires).
// Rollback = swap `routesServiceForCaller(userId)` → `routesService`.
const routesService = await routesServiceForCaller(userId)
```

Because the handler then keeps calling `routesService.<method>(...)` unchanged, the local
`const routesService` shadows the module import and the rest of the body is untouched.

| # | File | Handler(s) | Service call(s) shadowed | userId var |
|---|------|-----------|--------------------------|-----------|
| 1 | `app/api/routes/route.ts` | GET (listRoutes), POST (createRoute) | `listRoutes`, `createRoute` | `userId` |
| 2 | `app/api/routes/[id]/route.ts` | GET (getRouteById), PUT (saveRoute) | `getRouteById`, `saveRoute` | `userId` |
| 3 | `app/api/routes/today/route.ts` | GET (getNextRouteForUser) | `getNextRouteForUser` | `sessionUserId` (use this var name in the rebind: `routesServiceForCaller(sessionUserId)`) |
| 4 | `app/api/admin/runs/route.ts` | GET (listWeekRuns) | `listWeekRuns` | `userId` |
| 5 | `app/api/admin/runs/[id]/route.ts` | PATCH (setRouteStatus), DELETE (deleteRoute) | `setRouteStatus`, `deleteRoute` | derive: these handlers read `x-mfs-user-role` only (admin gate). See 4a-note. |

**4a-note (file #5 — admin/runs/[id]):** PATCH and DELETE currently read only
`x-mfs-user-role` (the admin gate) — they do NOT read `x-mfs-user-id`. To build the
per-caller client you need the user id. Add, right after the existing role-gate `if` block,
inside each handler:

```ts
const userId = req.headers.get('x-mfs-user-id')
if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
// F-RLS-04c: run under the per-caller authenticated client (RLS fires).
// Rollback = swap `routesServiceForCaller(userId)` → `routesService`.
const routesService = await routesServiceForCaller(userId)
```

The admin role-gate stays EXACTLY as-is and runs FIRST (a non-admin still gets 403 before
the userId read). Adding the `userId` 401 guard is a behaviour-preserving belt-and-braces:
in production `middleware.ts` always injects `x-mfs-user-id` alongside `x-mfs-user-role`, so
an admin caller always carries both — the new 401 is unreachable for real admin traffic.
This is the documented exception to "wire byte-identical": it adds one guard that cannot
fire in production. Call it out in the PR description.

Per-handler import line change (top of each file): keep `routesService` import, add the
factory — e.g. in files 1,2,3,4,5:
```ts
import { routesService, routesServiceForCaller } from '@/lib/wiring/routes'
```
(File 2, `[id]/route.ts`, currently imports only `routesService`; same edit applies.)

### 4b. Migration (NEW file) — the policy set

`supabase/migrations/<YYYYMMDDHHMMSS>_routes_authenticated_rls_policies.sql`

Pick the 14-digit timestamp at implementation time, AFTER the latest existing migration
(`20260617124846_users_authenticated_write_policies.sql`) so ordering is monotonic.
Suggested: `20260618HHMMSS_routes_authenticated_rls_policies.sql`.

**NOT in scope — do not touch:**
- `app/api/routes/compute-road-times/route.ts` and `app/api/routes/users/route.ts` (stay service-role).
- `lib/services/**`, `lib/domain/**`, `lib/adapters/**`, the `RoutesRepository` port (all already complete).
- `lib/wiring/routes.ts` — `routesServiceForCaller` already exists; NO edit (only its
  doc-comment's "READY BUT UNUSED" status becomes stale; optionally update that comment to
  "consumed by the 5 routes since F-RLS-04c" — cosmetic, allowed, not required).
- Role-gate logic on PATCH/DELETE (admin-only) — unchanged.

---

## 5. Migration spec — the FULL policy set (critical difference vs 04a/04b)

04a/04b only ADDED missing write policies because their tables already had SELECT policies
from baseline. **Routes is different**: `20260613000000_enable_rls_42_tables.sql` ran
`ALTER TABLE routes/route_stops ENABLE ROW LEVEL SECURITY` but added NO policies. RLS-enabled
+ zero-policies = deny everything for non-service-role. So 04c must add the **complete** set
or every authenticated Routes read returns nothing (the headline must-fix).

Table-level `GRANT ALL ON routes/route_stops TO authenticated` ALREADY exists in
`20260101000000_baseline.sql` (lines 2768, 2773) — so no GRANT is needed in this migration
(unlike the Orders pgTAP which had to replicate a missing local grant). The pgTAP test file,
however, runs in a transaction and should still assert/keep grants explicit for clarity.

### Policy set (role model = mirror-exactly: VALID-USER ONLY, no role filter)

Hakan's decision: any caller whose GUC maps to a real `users` row is allowed — NO `role IN
(...)` clause — because the Route handlers only require a *logged-in* user for create/save
(no role-gate at the route layer for routes/[id]/today). This honours the 04a rule "RLS is
never stricter than the service's own gating." The admin-only gate on PATCH/DELETE stays at
the **route layer** (it already 403s non-admins before the DB is touched), so the DB policy
does not need a role filter to enforce it.

🗣 In plain English: the lock just checks "are you a real, logged-in user?" — not your job
title. That matches what the screens already enforce: the Route screens let any signed-in
user create/save; only the admin-runs status/delete buttons are admin-only, and that check
already happens at the app door before the database is ever asked.

Predicate (identical for every policy; UPDATE uses it in BOTH USING and WITH CHECK; INSERT
uses WITH CHECK; SELECT/DELETE use USING):
```sql
EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
)
```

Policies to CREATE (with `DROP POLICY IF EXISTS` lead-in for each, for idempotency):

On `routes`:
| Policy | Command | Clause |
|--------|---------|--------|
| `routes_select` | SELECT | USING (predicate) |
| `routes_insert` | INSERT | WITH CHECK (predicate) |
| `routes_update` | UPDATE | USING (predicate) + WITH CHECK (predicate) |
| `routes_delete` | DELETE | USING (predicate) |

On `route_stops` (NO UPDATE — `saveRoute` replaces stops via delete-then-insert; confirmed
no `route_stops` UPDATE anywhere in the adapter):
| Policy | Command | Clause |
|--------|---------|--------|
| `route_stops_select` | SELECT | USING (predicate) |
| `route_stops_insert` | INSERT | WITH CHECK (predicate) |
| `route_stops_delete` | DELETE | USING (predicate) |

**= 7 policies total** (4 on routes, 3 on route_stops).

### Writes the policies must cover (verified in `lib/adapters/supabase/RoutesRepository.ts`)
- routes INSERT — createRoute (~L327) → `routes_insert`
- routes UPDATE — saveRoute header (~L408), setRouteStatus (~L478) → `routes_update`
- routes DELETE — deleteRoute (~L499), createRoute rollback (~L371) → `routes_delete`
- route_stops INSERT — createRoute (~L364), saveRoute (~L457) → `route_stops_insert`
- route_stops DELETE — saveRoute clear-old-stops (~L428) → `route_stops_delete`
- routes/route_stops SELECT — every GET (list, byId, today, weekRuns embed joins) →
  `routes_select` + `route_stops_select`. The list/byId/today GETs read `route_stops` via
  an embedded join, so the route_stops SELECT policy is REQUIRED for stops to appear.

Note: createRoute's rollback does `routes.delete().eq('id', newId)` — covered by
`routes_delete`. The embedded reads of `customers`/`users` (assignee/creator/customer joins)
go through THOSE tables' own policies, which are out of scope here; they already have SELECT
policies from baseline (Users) / prior RLS work — verify in ANVIL pgTAP that the join rows
appear (if a joined table lacked a SELECT policy the nested object would come back null, a
silent regression — see Risk R5).

### Migration header-comment discipline (copy from 04a/04b)
The header block must state:
- ADDITIVE / non-destructive: `CREATE POLICY` only; no DROP TABLE/TRUNCATE/ALTER TYPE/DROP
  NOT NULL → NO PITR gate fires.
- Grants permission only; deletes no data, drops no column, alters no type.
- Service-role still BYPASSES RLS (no `FORCE`) — so `compute-road-times`, `routes/users`,
  and the cron remain unaffected.
- FULL policy set (not just writes) because routes/route_stops had RLS enabled with ZERO
  policies — without SELECT every authenticated read returns nothing.
- Role model: VALID-USER ONLY, no role filter, and WHY (route handlers don't role-gate
  create/save; admin-only PATCH/DELETE is enforced at the route layer).
- Inherited 22P02-empty-GUC edge: an empty/absent GUC fails closed (the `::uuid` cast on an
  empty string raises 22P02 rather than a clean 42501 deny). It is fail-closed either way and
  UNREACHABLE on these routes (they always carry a valid token → valid uuid GUC). The clean-
  deny fix is the same `is_admin`/cast-guard fix deferred in F-RLS-04b — reference it, do NOT
  fix it here.
- `DROP POLICY IF EXISTS` for each of the 7 policies first (idempotency), then the 7
  `CREATE POLICY`, then a commented ROLLBACK block listing all 7 `DROP POLICY IF EXISTS`.
- Apply to prod via Supabase MCP `apply_migration` ONLY (never `supabase db push`).
  Local = `npm run db:reset`. Prod application deferred to the ship gate (apply to prod
  FIRST, then merge — the 04a/04b ordering).

---

## 6. Expand-contract ordering (both ship in ONE PR)

1. **Add** the migration (7 policies) → unlocks the authenticated doors.
2. **Switch** the 5 routes to `routesServiceForCaller` → callers walk through them.

Local/dev order: `npm run db:reset` (applies the new migration) BEFORE running the
integration suite under the flip. Ship-gate order: prod migration applied FIRST via MCP
`apply_migration`, then PR merged (Vercel deploys the route flip second), then prod smoke.

🗣 In plain English: unlock the door, then send people through it. Never the reverse — a
flipped route hitting a still-locked door = a blank screen for users.

---

## 7. Rollback

Two independent halves (mirror 04b rollback script):
- **Code half:** in each of the 5 files, swap `routesServiceForCaller(<userId>)` →
  `routesService` (delete the local rebind line, or point it at the singleton). One line per
  handler. The service-role singleton is untouched and remains the parachute. (For file #5,
  also remove the added `userId` 401 guard if reverting fully — or leave it; it is inert.)
- **DB half:** `DROP POLICY IF EXISTS` the 7 policies (routes_select/insert/update/delete,
  route_stops_select/insert/delete). Tables return to RLS-enabled-zero-policies (their
  pre-04c state) — safe because nothing is then routing through the authenticated client.

Write the rollback as `docs/anvil/2026-06-18-f-rls-04c-routes-rls-cutover-rollback.sql`
(produced at ANVIL/ship time, mirroring the 04a/04b rollback artefacts).

No PITR needed (additive migration). If prod smoke fails post-deploy: `vercel rollback`
(code) + drop the 7 policies.

---

## 8. Test matrix (for ANVIL Gate 3 — mirror 04a/04b)

| Layer | What | Notes |
|-------|------|-------|
| Unit (Vitest) | Existing route-handler / service unit coverage stays green; routes own thin logic so expect light coverage. Add none unless a gap surfaces. | branch tip must stay green |
| Integration (Vitest) | `tests/integration/routes.test.ts` (exists from F-14 PR2, 5 endpoints) must still pass UNDER the authenticated flip. ADD cases: authenticated GET returns rows (proves the SELECT must-fix), authenticated createRoute/saveRoute/setRouteStatus/deleteRoute succeed for a valid user, and an embedded-join check (assignee/creator/customer + route_stops appear, not null). | runs against real local Supabase wired via `.env.test.local`; needs `npm run db:reset` to apply the new migration first |
| Database (pgTAP) | NEW `supabase/tests/00X-rls-routes.test.sql` mirroring `005-rls-orders`: (a) a valid-user GUC can SELECT/INSERT/UPDATE/DELETE on `routes` and SELECT/INSERT/DELETE on `route_stops`; (b) an empty/absent GUC is denied / fail-closed (no rows; write raises — accept 22P02 OR 42501 per the inherited edge); (c) service-role still BYPASSES (a service-role connection sees all rows ignoring the GUC). Use `_helpers.sql` make_user/make_customer; route_stops needs a parent route fixture. | grants already exist in baseline; keep them explicit in the test for clarity. The harness's overall `Result: FAIL` is a PRE-EXISTING cosmetic artifact (`_helpers.sql` has no plan()) — judge per-file `ok`. |
| E2E @critical | Route Planner save/load + admin runs status/delete critical paths against the deployed Vercel preview. PREVIEW-LED double-run (high-risk tier). | **The anvil-runner has NO network egress — the CONDUCTOR runs the preview smoke**, not the runner. Flag in the cert. Confirm the migration resynced on the preview branch and all 7 policies present on the preview DB before driving specs. |

---

## 9. Hexagonal / architecture check

- **Port used:** `RoutesRepository` (existing, `lib/ports/`). No new port.
- **Adapter:** `lib/adapters/supabase/RoutesRepository.ts` (existing). No new adapter; the
  authenticated `SupabaseClient` is built inside `lib/wiring/routes.ts` (existing factory).
- **New dependencies:** NONE. No `package.json` change.
- **Vendor leak:** none — routes import only `routesService` / `routesServiceForCaller` from
  wiring; no `@supabase/*` import is added to any `app/**` file. Pinned by
  `tests/unit/lint/no-adapter-imports.test.ts`.
- **Rip-out test:** swapping the DB vendor for Routes = one new adapter folder + edits to
  `lib/wiring/routes.ts`. This PR adds neither a port nor an adapter nor a dep. **PASS.**

🗣 In plain English: nothing new gets bolted on — we reuse the socket and plug that already
exist. Swapping databases tomorrow still costs one adapter + one wiring file. Clean.

---

## 10. Risk Assessment

### R1 — Missing SELECT policy = every authenticated Routes read breaks  ·  Severity: CRITICAL  ·  MUST-FIX
`routes`/`route_stops` have RLS enabled with ZERO policies. If the migration adds only WRITE
policies (the 04a/04b muscle-memory), every authenticated GET returns an empty list / null
route and the Route Planner, /today driver view, and admin runs list all go blank in prod.
**Mitigation:** the migration adds the FULL set incl. `routes_select` + `route_stops_select`.
pgTAP must prove a valid-user GUC can SELECT both tables AND that embedded joins return rows.
Integration must assert GET returns populated rows under the flip. **This is the headline
risk — forgetting SELECT silently breaks all reads.**

### R2 — Embedded-join tables lacking a SELECT policy = silent null sub-objects  ·  Severity: HIGH  ·  must-fix (verify, don't assume)
The GET wires embed `assignee`/`creator` (from `users`) and `customer` (from `customers`) and
`route_stops`. If any joined table lacks a SELECT policy under the authenticated role, that
nested object comes back `null` with no error — a silent wire regression. `users` has a
SELECT policy (F-RLS-04b baseline). **Mitigation:** ANVIL pgTAP/integration must confirm the
embedded `assignee`/`creator`/`customer`/`route_stops` objects are populated (not null) under
a valid-user GUC. If `customers` lacks an authenticated SELECT policy, that is a blocker
surfaced here — loop back to add it (in scope for "the policies these tables need").
**UPDATE (see Addendum):** the `users`-join half of R2 turned out to be a REAL regression —
the baseline `users_select` policy is own-row-OR-admin, so a non-admin sees NULL names for
peers. RESOLVED by the addendum's user-directory read policy. The `customers` half remains
to be verified in ANVIL.

### R3 — Concurrency / per-request client memoization leak  ·  Severity: HIGH  ·  must-fix (already mitigated by design)
A memoized authenticated client would leak one caller's identity (GUC) to another.
**Mitigation:** `routesServiceForCaller` mints a fresh token + builds a fresh client every
call (never memoized) — already implemented and documented in `lib/wiring/routes.ts`. No new
code here; the test matrix's concurrent integration calls implicitly exercise isolation. No
action beyond not introducing memoization.

### R4 — admin/runs/[id] adds a userId read where none existed  ·  Severity: MEDIUM  ·  not must-fix
PATCH/DELETE currently read only `x-mfs-user-role`. We add an `x-mfs-user-id` read + 401.
**Mitigation:** the role-gate runs FIRST (non-admin still 403s unchanged); `middleware.ts`
always injects both headers together, so the new 401 is unreachable for real admin traffic.
Documented as the one deliberate wire deviation. Integration should cover an admin PATCH/
DELETE succeeding under the flip.

### R5 — '/today' admin-override read under valid-user-only policy  ·  Severity: LOW  ·  not must-fix
`/today?userId=<other>` lets an admin preview another user's route. Under the valid-user-only
SELECT policy, ANY valid user can SELECT ANY route row, so the override still works (the
route layer, not RLS, is what would gate it — and it currently doesn't restrict the override
to admins at the DB level). Behaviour is unchanged from today. **No action** — noted so it
isn't mistaken for a regression. (If tighter override gating is ever wanted, that's a new
unit, not this one.)

### R6 — Empty/absent GUC raises 22P02 not clean 42501  ·  Severity: LOW  ·  not must-fix (deferred, inherited)
Inherited from 04a/04b: an empty-string GUC's `::uuid` cast raises 22P02. It is fail-closed
either way and UNREACHABLE on these routes (they always carry a valid token). **Mitigation:**
documented in the migration header; the clean-deny fix is the same deferred is-admin/cast-
guard follow-up referenced in 04b. Do not fix here.

### R7 — Data migration / destructiveness  ·  Severity: NONE
`CREATE POLICY` only — no DROP/TRUNCATE/ALTER TYPE/DROP NOT NULL. Non-destructive, no PITR
gate. No data touched.

### R8 — Security  ·  Severity: covered by R1/R2
Net effect TIGHTENS security (reads/writes now RLS-checked vs previously master-key). No new
exposure. Service-role paths (cron, compute-road-times, routes/users) unchanged.

### R9 — Launch blocker: orphaned preview branch cleanup  ·  Severity: LOW (ops hygiene)  ·  must-do at PR close
The Supabase preview branch created for this PR auto-deletes on merge, but confirm via
`npm run db:branches` that no orphaned branch remains after close (ship-checklist item). Not a
code risk; an ops-hygiene close-out.

**Must-fix summary (Gate 2 blockers until resolved by the plan/implementation):** R1 (full
policy set incl. SELECT) and R2 (verify embedded-join tables have authenticated SELECT). R3 is
must-fix-but-already-satisfied by the existing no-memoization design. All are addressed by the
migration spec (§5) and test matrix (§8); none require re-architecture → none loop back to Order.

---

## 11. Acceptance criteria

1. All 5 route files route their service calls through `routesServiceForCaller(<userId>)`;
   no `@supabase/*` import added to any `app/**` file; `no-adapter-imports` lint pin green.
2. New migration creates exactly 7 policies (routes ×4, route_stops ×3), valid-user-only
   predicate, with `DROP POLICY IF EXISTS` idempotency lead-ins and a ROLLBACK comment block;
   filename is a full 14-digit timestamp (filename-convention test green).
3. `npm run db:reset` applies cleanly; integration `routes.test.ts` passes UNDER the flip,
   with new cases proving authenticated reads return populated rows (incl. embedded joins)
   and authenticated create/save/setStatus/delete succeed.
4. pgTAP `00X-rls-routes` proves: valid-user GUC can SELECT/INSERT/UPDATE/DELETE routes +
   SELECT/INSERT/DELETE route_stops; empty/absent GUC fail-closed; service-role bypasses.
5. Wire output byte-identical (except the documented inert admin/runs/[id] 401 guard).
6. Preview smoke (run by the CONDUCTOR — no runner egress): Route Planner save/load + admin
   runs status/delete @critical green on the deployed preview, with the migration resynced
   and all 7 policies confirmed present on the preview DB.
7. Ship: prod migration applied FIRST via MCP `apply_migration`, then merge, then prod smoke
   non-500; preview branch confirmed cleaned up.

---

## Addendum — user-directory read access (loop-back from Guard)

Date appended: 2026-06-18 · Trigger: Guard (code-critic) found, and Hakan confirmed, a
REAL regression in the cutover. This addendum is APPENDED — §1–§11 above are unchanged.

### A0. Mini-map (this addendum)

```
DOMAIN (Routes core — reads embed user names via PostgREST FK joins)
  └─ routes GET → assignee:users / creator:users  (FK-embed of public.users)
     ├─ TODAY: service-role plug → RLS bypassed → all names resolve
     └─ AFTER 04c: authenticated plug → users_select = own-row-OR-admin → non-admin sees NULL names 🔴
🗣 the cutover swaps the plug; the users table's lock only opens for "your own row or admin",
   so a warehouse user looking at someone else's route gets blank names. Fix = a directory
   lock that lets any logged-in user read NAMES/ROLES only — never the password/PIN hashes.
```

### A1. The regression, precisely

The 04c cutover (§4a) flips the 5 Routes routes to the `authenticated`-role client. The GET
wires embed user names via PostgREST FK-embedding in `lib/adapters/supabase/RoutesRepository.ts`:
- `assignee:users!routes_assigned_to_fkey (id, name, role)` (LIST_COLS L67, SINGLE_COLS L82, admin-runs L91)
- `creator:users!routes_created_by_fkey (id, name)` (LIST_COLS L68, SINGLE_COLS L83)

These embeds resolve through the `public.users` table's OWN RLS policy, not the `routes`
policy. The baseline policy is:

```sql
-- supabase/migrations/20260101000000_baseline.sql (the users_select line near 2488)
CREATE POLICY "users_select" ON "public"."users" FOR SELECT
  USING ( ("id" = (current_setting('app.current_user_id', true))::uuid) OR public.is_admin() );
```

`public.is_admin()` is role='admin' only. So under the `authenticated` role, a non-admin
caller (role `office`/`warehouse`) can SELECT only THEIR OWN users row. When they load a
route assigned to/created by someone else, the FK-embed for that other user returns NULL —
the `assignee`/`creator` sub-object comes back null with no error. Today this is masked
because the Routes routes use the service-role key (RLS bypassed → every users row visible).

🗣 In plain English: the name labels on a route are pulled from the staff table, and that
table's lock only lets you see your OWN staff record (unless you're an admin). The moment we
make the Route screens use the per-user keycard instead of the master key, a non-admin
viewing a colleague's route sees blank names where the colleague's name should be. Hakan's
call: keep the names visible — staff names/roles are not secret.

### A2. The hard constraint (why this isn't a one-line policy)

`public.users` carries credential-hash columns `pin_hash` and `password_hash`
(`lib/adapters/supabase/UsersRepository.ts:55-56`, `CREDENTIAL_COLS`). The whole F-13 effort
was "credential-hash quarantine." Baseline runs `GRANT ALL ON TABLE public.users TO
authenticated` AND `TO anon` (baseline.sql near 2778) — so the `authenticated` role already
holds privilege on ALL columns; only RLS limits the ROWS.

Postgres RLS is row-level, NOT column-level. A naive "any logged-in user can SELECT any
users row" policy would, at the DB boundary, make `pin_hash`/`password_hash` of EVERY user
readable by ANY authenticated caller. That must NOT happen.

🗣 In plain English: the staff table's lock controls which ROWS you can see, not which
COLUMNS. If we just unlock all the rows so names show, we'd also be unlocking the password
and PIN hash columns for every staff member to every logged-in user. We have to widen the
rows but keep the two hash columns sealed.

### A3. Options evaluated

| Option | Leaks hashes at DB boundary? | Breaks an existing path? | Invasiveness |
|--------|------------------------------|--------------------------|--------------|
| **1 · Permissive directory SELECT policy + column-privilege lockdown** | **NO** (column GRANT denies hashes to `authenticated`) | **NO** (verified A4 — all credential reads run under service-role, which has separate grants + bypasses RLS) | LOW — one migration; zero app-code change; the existing FK-embed select strings keep working unchanged |
| **2 · SECURITY DEFINER view/RPC `user_directory`** | NO (view projects only id/name/role) | YES, indirectly — see below | HIGH — a view cannot be FK-embedded by PostgREST the way `users!routes_assigned_to_fkey(...)` embeds the real table; re-pointing the joins forces rewriting the adapter select strings, leaving the original byte-identical scope |
| **3 · Accept + scope-defer** | N/A | leaves the regression in prod | none, but NOT chosen — non-admins see blank names |

**Why option 2 fails on feasibility:** the GET reads use PostgREST FK-embedding
(`assignee:users!routes_assigned_to_fkey (id, name, role)`). That syntax embeds the real
`public.users` table by its foreign-key relationship. A SECURITY DEFINER view named
`user_directory` has no FK relationship from `routes` to it, so PostgREST cannot embed it the
same way — you'd have to rewrite every embed in `RoutesRepository.ts` (LIST_COLS, SINGLE_COLS,
and the admin-runs select) to a different shape, then re-map the row parsing. That drops the
adapter out of the "no adapter edit / byte-identical wire" scope the 04c plan rests on (§4
"NOT in scope — do not touch lib/adapters/**"), and adds a new DB object (view/RPC) to
maintain. More surface, more risk, for no security gain over option 1.

**RECOMMENDED: Option 1.** It keeps the FK-embed select strings untouched (zero app-code
change beyond §4a's already-planned cutover), and seals the hashes at the privilege layer —
column GRANTs and RLS compose, so even with a permissive row policy, `SELECT pin_hash` as
`authenticated` is denied for lack of column privilege.

🗣 In plain English: option 1 = widen the rows with a new lock, then physically remove the
two hash columns from the authenticated keycard's permission list. The name labels light up;
the password/PIN columns become un-selectable for any logged-in user, full stop. Option 2
would mean rebuilding how the Route screens fetch names — more work, more to break, same
end result on security. Option 1 wins.

### A4. Credential-read caller verification (this is the proof the REVOKE is safe)

The ONLY two methods that project the hash columns (`CREDENTIAL_COLS`) are
`findCredentialByName` and `listCredentialsByRoles` (`UsersRepository.ts:175,192`). Every
production caller and the Supabase client it runs under:

| Caller (file) | Method | Service used | Underlying client | Role at DB | Affected by REVOKE on `authenticated`? |
|---------------|--------|--------------|-------------------|-----------|----------------------------------------|
| `app/api/auth/login/route.ts:123` | `findCredentialByName` | `usersService` (singleton) | `supabaseService` (service-role key) | **service-role** — bypasses RLS, separate grants | **NO** |
| `app/api/auth/kds-pin/route.ts:47` | `listCredentialsByRoles` | `usersService` (singleton) | `supabaseService` (service-role key) | **service-role** — bypasses RLS, separate grants | **NO** |

`usersService` is wired to `supabaseUsersRepository`, the service-role singleton
(`lib/wiring/users.ts:32-35` → `UsersRepository.ts:306-307` → `supabaseService`). It is
the deliberate engine for the pre-auth routes (login, kds-pin, team, haccp-team, auth-type)
that run before any session/JWT exists (`lib/wiring/users.ts:39-42` comment).

`usersServiceForCaller` (the `authenticated`-role factory, `lib/wiring/users.ts:59`) is used
ONLY by the 4 admin user-management routes (`app/api/admin/users/**`), and those call
`listAllUsers` / `createUser` / `updateUser` / `deleteUser` — **none of which project the
hash columns** (they use `SUMMARY_COLS`, hash-free). Verified: no `usersServiceForCaller`
caller anywhere reads credentials (grep for `usersServiceForCaller` + credential/login/pin =
zero hits).

**Conclusion: NO credential read runs under the `authenticated` role.** Revoking the hash
columns from `authenticated` cannot break login, KDS-pin, or any HACCP auth path. The
service-role's grants are independent of `authenticated`'s; the REVOKE targets only
`authenticated` and leaves the service-role (and the createUser INSERT path on
`SUMMARY_COLS`) fully intact.

🗣 In plain English: the only code that ever reads password/PIN hashes is the login and the
KDS PIN check, and both use the master key, not the per-user keycard. We're only trimming the
keycard's permissions — the master key keeps everything. So login and PIN sign-in cannot
break. Verified by tracing every caller, not assumed.

### A5. Recommended SQL sketch (option 1)

Fold into a SIBLING migration, NOT the existing `20260618120000_routes_authenticated_rls_policies.sql`.
**Decision: sibling file** — rationale: (a) the 04c routes migration is purely about the
`routes`/`route_stops` tables; mixing a `public.users` privilege change into it muddies the
rollback story and the header discipline; (b) a separate file makes the rollback (re-GRANT)
self-contained and the diff legible to code-critic. Name it AFTER the 04c migration so
ordering is monotonic:

`supabase/migrations/20260618HHMMSS_users_directory_read_for_authenticated.sql`
(pick a 14-digit timestamp later than `20260618120000`).

```sql
-- 20260618HHMMSS_users_directory_read_for_authenticated.sql
--
-- F-RLS-04c addendum — user-directory read access (loop-back from Guard).
-- ADDITIVE row policy + a column-privilege RESHAPE (REVOKE then narrowed GRANT).
-- Lets ANY valid-user GUC SELECT id/name/role (+ other NON-HASH cols) of ANY
-- users row, so Route screens resolve assignee/creator names under the
-- authenticated role. The two hash columns (pin_hash, password_hash) are
-- SEALED at the privilege layer — RLS + column GRANTs compose, so the
-- permissive row policy CANNOT expose hashes to the authenticated role.
--
-- NON-DESTRUCTIVE: no DROP TABLE/TRUNCATE/ALTER TYPE/DROP COLUMN/DROP NOT NULL.
-- REVOKE/GRANT change the PRIVILEGE SURFACE only (no data touched) -> no PITR gate.
-- Service-role is UNAFFECTED (its grants are separate; it bypasses RLS). The
-- login + kds-pin credential reads run under service-role (verified), so the
-- REVOKE cannot break them.
-- Rollback = DROP the directory policy + re-GRANT ALL/SELECT on users to
-- authenticated (see ROLLBACK block).

-- 1) Row policy: any valid-user GUC may SELECT any users row. OR's with the
--    existing baseline users_select (own-row OR is_admin) -- PostgreSQL OR's
--    permissive SELECT policies, so this WIDENS reads to "any logged-in user".
DROP POLICY IF EXISTS users_directory_select ON public.users;
CREATE POLICY users_directory_select ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- 2) Column-privilege lockdown: remove blanket SELECT, re-grant only NON-HASH
--    columns. Even with the permissive row policy above, selecting pin_hash /
--    password_hash as `authenticated` is then DENIED for lack of column priv.
--    (Enumerated from baseline CREATE TABLE public.users -- the 8 non-hash cols.)
REVOKE SELECT ON public.users FROM authenticated;
GRANT  SELECT (id, created_at, name, role, active, last_login_at, email, secondary_roles)
  ON public.users TO authenticated;
-- INSERT/UPDATE/DELETE privileges on authenticated are UNCHANGED (baseline
-- GRANT ALL still covers them; the admin write routes need them and their RLS
-- policies (users_insert/update/delete) gate the rows). Only SELECT is reshaped.

-- NOTE on `anon`: baseline also GRANT ALL ON users TO anon. The pre-auth routes
-- (login/kds-pin) do NOT use the anon role -- they use service-role. No anon
-- path reads users under RLS today, so anon's grant is left AS-IS in this
-- migration (touching it is out of scope and risks the pre-auth flows). The
-- hash-seal here is specifically for the `authenticated` role, which is the
-- role the 04c cutover introduces to the Routes reads.

-- ── ROLLBACK (manual; not auto-run) ──────────────────────────────
-- DROP POLICY IF EXISTS users_directory_select ON public.users;
-- REVOKE SELECT (id, created_at, name, role, active, last_login_at, email, secondary_roles)
--   ON public.users FROM authenticated;
-- GRANT SELECT ON public.users TO authenticated;   -- restore blanket SELECT
```

Non-hash columns enumerated from `baseline.sql` CREATE TABLE `public.users` (lines 1271-1283):
`id, created_at, name, role, active, last_login_at, email, secondary_roles`. The TWO excluded
columns are exactly `pin_hash` and `password_hash`. `SUMMARY_COLS` in the adapter
(`UsersRepository.ts:51-52`) selects `id, name, role, active, secondary_roles, email,
last_login_at, created_at` — a SUBSET of the granted columns, so `listAllUsers` /
`findUserById` etc. under the authenticated admin routes keep working unchanged.

🗣 In plain English: step 1 adds a new lock that opens the staff table's rows for any
logged-in user. Step 2 takes away the keycard's blanket read permission and hands back read
permission for only the eight harmless columns — names, roles, email, timestamps — explicitly
omitting the two hash columns. The master key (service-role) is untouched, so login still
reads hashes fine. Rollback just re-hands the blanket permission back.

### A6. Interaction with F-RLS-04b (Users RLS) — verdict

The new `users_directory_select` is a permissive SELECT policy that OR's with the shipped
baseline `users_select` (own-row-OR-admin). PostgreSQL OR's permissive SELECT policies, so
the effective read posture WIDENS from "non-admin sees only own row" to "any logged-in user
sees every user's NON-HASH columns."

- **Acceptable for a staff directory?** YES per Hakan's decision — names/roles are not secret;
  they already appear on routes/orders today (under service-role). The widening is exactly the
  intent.
- **Does it break any shipped 04b test/expectation?** NO. The shipped 04b pgTAP
  (`supabase/tests/007-rls-users.test.sql`) asserts ONLY the WRITE policies
  (INSERT/UPDATE/DELETE: admin allowed, non-admin denied, empty-GUC fail-closed). It does
  NOT assert that a non-admin CANNOT SELECT another user's row — there is no read-isolation
  assertion to break. Verified by reading all 10 plan() assertions in 007.
- **04b integration tests:** the admin user routes call `listAllUsers` (admin-gated at the
  route layer + RLS) — the directory policy doesn't change admin behaviour (admins already
  saw all rows via `is_admin()`), and non-admins never reach those routes (403 at the route
  layer). No 04b integration expectation changes.

**Flag:** if a FUTURE 04b hardening adds a "non-admin cannot read another user's row" pgTAP
assertion, this directory policy would invalidate it. None exists today. Documented so it
isn't a surprise later.

🗣 In plain English: the shipped Users security tests only check who can CREATE/EDIT/DELETE
users — they never test "can a non-admin see another person's row." So widening reads breaks
none of them. The only thing to remember: don't later add a test that assumes non-admins are
blind to other rows, because we've deliberately changed that for the directory.

### A7. Tests to ADD (fold into the 04c test matrix §8)

| Layer | New case | Proves |
|-------|----------|--------|
| Integration (Vitest) | A NON-ADMIN caller (role `office` or `warehouse`) loads a route assigned-to / created-by a DIFFERENT user → the embedded `assignee` and `creator` objects are NON-NULL (names resolve). This is the REGRESSION LOCK the current admin-only route tests miss. | the directory policy fixes the blank-names regression under the authenticated role |
| pgTAP (extend `009-rls-routes` OR a new `010-rls-users-directory.test.sql` — recommend a NEW file so 009 stays purely routes-scoped) | (a) a non-admin valid-user GUC CAN SELECT id/name/role of ANOTHER user's row | directory read works for non-admins |
| pgTAP (same file) | (b) the SAME non-admin caller CANNOT read `pin_hash`/`password_hash` of another user — assert the column-level denial (selecting the hash column as `authenticated` raises `42501 insufficient_privilege` / column not accessible). To exercise this faithfully the test must mirror the prod column GRANT: `REVOKE SELECT ON users FROM authenticated; GRANT SELECT (id, created_at, name, role, active, last_login_at, email, secondary_roles) ON users TO authenticated;` inside the BEGIN/ROLLBACK txn BEFORE `SET LOCAL ROLE authenticated` — because local Supabase otherwise has the blanket grant (see 007 line 27 precedent). | **THE hash-protection proof — hashes stay sealed** |
| pgTAP (same file) | (c) the service-role connection CAN still read `pin_hash`/`password_hash` of any user | the login/kds-pin path stays intact |

Note for the pgTAP author: case (b) is column-privilege, not RLS — so it must run with the
narrowed column grant in place. Without the in-txn REVOKE/GRANT it would pass for the wrong
reason (or fail), giving a false signal. Make the grant reshape explicit in the test, exactly
as 007 makes the table grant explicit.

🗣 In plain English: three new database tests prove the fix is honest — (a) a warehouse user
CAN see another person's name, (b) that same user CANNOT see anyone's password/PIN hash, and
(c) the login machinery (master key) CAN still read hashes. Plus one integration test that
loads a peer's route as a non-admin and checks the names aren't blank — the exact thing that
was broken.

### A8. Risk Assessment (addendum)

#### R10 — Permissive row policy exposing hashes at the DB boundary · Severity: CRITICAL · MUST-FIX (RESOLVED by design)
A row-only policy would expose `pin_hash`/`password_hash` of every user to every authenticated
caller (RLS is row-level, not column-level). **Mitigation:** option 1 pairs the row policy
with a column-privilege REVOKE+narrowed-GRANT, so the hashes are denied at the privilege
layer regardless of the row policy. pgTAP case (b) is the mandatory proof. **Does it leak
hashes? NO** — provided the column GRANT ships WITH the row policy in the SAME migration (do
not ship the policy without the REVOKE/GRANT). Sequencing risk: if an implementer adds the
policy and forgets the column lockdown, hashes leak — hence both live in one migration file
and case (b) gates the merge.

#### R11 — REVOKE breaking a legitimate credential read · Severity: CRITICAL · MUST-FIX (RESOLVED — verified NOT broken)
A REVOKE on `authenticated`'s SELECT could break a path that reads hashes under the
authenticated role. **Verification (A4):** the only hash-reading methods
(`findCredentialByName`, `listCredentialsByRoles`) are called ONLY by login + kds-pin, both
on the service-role singleton (`usersService`), which bypasses RLS and uses separate grants.
No `authenticated`-role caller reads hashes. **The REVOKE does NOT break any credential path.**
If this verification were ever falsified (e.g. a future PR re-points login onto
`usersServiceForCaller`), the REVOKE would break login — so that re-point must re-grant the
hash columns or keep login on service-role. Documented as a tripwire.

#### R12 — Widened Users read posture (04b interaction) · Severity: LOW · not must-fix
The directory policy OR's with `users_select`, widening non-admin reads to all rows
(non-hash). **Mitigation:** Hakan-approved (staff names/roles not secret); no shipped 04b test
asserts read-isolation (A6). Tripwire noted for future 04b hardening.

#### R13 — `anon` role still holds GRANT ALL on users · Severity: LOW · not must-fix (out of scope, unchanged)
Baseline grants `anon` ALL on `users`. This addendum does NOT touch `anon` — the pre-auth
routes use service-role, not anon, so no anon path reads users under RLS today, and changing
anon's grant risks the pre-auth flows. **No action** — flagged so it isn't mistaken for a
regression introduced here; it predates 04c. (If anon hardening is ever wanted, it's a
separate unit.)

#### R14 — Rollback changes the privilege surface (not a data DROP) · Severity: LOW · not must-fix
REVOKE/GRANT alter the privilege surface, not data — non-destructive, no PITR gate. **Rollback
= DROP the directory policy + re-GRANT blanket SELECT on users to authenticated** (in the
ROLLBACK block). Note: rollback restores the blanket grant, which would re-expose hashes to
authenticated — but rollback is only used WITH the code rollback (routes back on service-role),
at which point no authenticated client reads users at all, so the re-exposure is inert.

**Updated must-fix summary (Gate 2):** R10 and R11 are CRITICAL but BOTH RESOLVED in this
plan — R10 by the column-privilege lockdown shipped in the same migration (proven by pgTAP
case b), R11 by the A4 caller verification (all credential reads on service-role). **No
must-fix risk remains unresolved → no loop-back to Order.** The original §10 must-fixes (R1
SELECT policy, R2 embedded-join SELECT — of which the users-join NULL was THIS regression)
stand; this addendum is the resolution of the users-join half of R2.

### A9. Hexagonal verdict (addendum)

- **Port/adapter:** UNCHANGED. No new port, no new adapter. The fix is entirely a DB
  migration (RLS policy + column grant on `public.users`). The FK-embed select strings in
  `lib/adapters/supabase/RoutesRepository.ts` stay byte-identical.
- **New dependencies:** NONE. No `package.json` change.
- **Original byte-identical scope:** PRESERVED. Option 1 requires ZERO app-code change beyond
  the §4a cutover already planned — the adapter select strings are untouched (this is the
  decisive reason option 1 beats option 2, which would have forced an adapter rewrite).
- **Rip-out test:** PASS (unchanged — no port/adapter/dep added).

🗣 In plain English: the fix is pure database plumbing — a new lock and a trimmed permission
list on the staff table. No new code, no new vendor, no socket touched. The Route screens'
fetch code is untouched. Lego rules fully intact.
