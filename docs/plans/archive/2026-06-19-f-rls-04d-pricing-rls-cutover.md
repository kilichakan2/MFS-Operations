# F-RLS-04d — Pricing-context RLS cutover (execution plan)

**Date:** 2026-06-19
**Author:** forge-planner (FORGE Phase 2 — Order)
**Spec status:** locked at Gate 1
**Mirror of:** F-RLS-04c (Routes-context RLS cutover, shipped — migration `20260618120000` + `20260618130000`)

```
DOMAIN (Pricing core logic — lib/services/pricing*, lib/domain)
  └─ PricingRepository (port) → [Supabase] (adapter, unchanged)
       service-role singleton  → STAYS as the rollback parachute
       authenticated per-caller → NEW: pricingServiceForCaller(userId) — RLS fires
🗣 Same plug, two power sources: today's master key stays dark as a fallback; we route real traffic through the keycard so the DB checks the badge.
```

🗣 **In plain English (what this whole job is):** Right now every pricing screen
talks to the database using a master key that ignores all the door locks. We're
switching it to use each logged-in person's own badge instead, so the database
itself enforces "you must be a real signed-in user." The catch: the two pricing
tables have the locks turned ON but **no doors defined yet** — so the moment we
switch to badges, every pricing screen goes blank unless we ship the door
definitions (RLS policies) in the same change. That is the headline must-fix.

---

## 1. Goal

Flip ALL pricing API routes from the service-role (master-key, RLS-bypassing)
Supabase client to the per-request **authenticated** (logged-in-user) client, so
Row-Level Security enforces access at the database. This is a **true
byte-identical mirror** of F-RLS-04c. Zero behaviour change at the wire level.

🗣 **In plain English:** Copy exactly what we already did for the Routes screens,
applied to the Pricing screens. Users should notice nothing — same responses,
same errors, same RBAC. The only difference is *where* the access check happens
(now also at the database, not only in our code).

Locked decisions (from Gate 1):
1. **Scope:** flip ALL pricing routes onto the authenticated role. Service-role
   singleton STAYS as an unused parachute.
2. **Policy predicate:** ANY VALID LOGGED-IN USER (mirror 04c). The "sales see
   only their own deals" RBAC STAYS in the app layer exactly as today. Do NOT
   push owner-scoping into RLS.
3. **F-TD-24 stays DEFERRED** — do not fix the owner-read 403-vs-500 swallow.

🗣 **In plain English:** The database door only checks "are you a real signed-in
user, yes/no." The finer rule ("sales can only touch their own deals") stays in
our application code, untouched — we are deliberately NOT teaching the database
that rule in this change.

---

## 2. Domain terms (plain-English glossary for this plan)

- **RLS (Row-Level Security)** — per-row door locks inside Postgres. 🗣 The
  database decides which rows you may see/change based on who you are, instead of
  trusting the app to ask nicely.
- **Service-role client** — the master-key Supabase connection that bypasses RLS.
  🗣 A key that opens every door regardless of locks. Powerful and dangerous;
  we keep it only as an emergency fallback.
- **Authenticated (per-caller) client** — a Supabase connection carrying one
  user's minted token, reaching Postgres as the `authenticated` role. 🗣 The
  user's own badge; the database checks it against the door rules.
- **GUC `app.current_user_id`** — a per-request Postgres setting holding the
  caller's user id, set by the token bridge (ADR-0007). 🗣 The name on the badge,
  readable by the door-lock rule.
- **`current_user_is_valid()`** — a SECURITY DEFINER helper (shipped in 04c) that
  returns true when the GUC maps to a real `public.users` row. 🗣 A trusted
  bouncer the door rules call: "is this badge a real employee, yes/no" — answered
  without re-triggering the locks (avoids the recursion bug 04c hit).
- **Port (`PricingRepository`)** — the database interface the Pricing domain owns.
  🗣 The socket shape; unchanged here.
- **Adapter (`lib/adapters/supabase/PricingRepository.ts`)** — the Supabase
  implementation of that port. 🗣 The one plug; unchanged here.
- **`pricingServiceForCaller(userId)`** — NEW wiring factory building a Pricing
  service bound to ONE caller's badge. 🗣 "Give me a pricing service that acts as
  *this* person." Mirrors `routesServiceForCaller`.

---

## 3. Confirmed facts (verified in this planning pass — do not re-verify, act on these)

| Fact | Source verified | Consequence |
|------|-----------------|-------------|
| `price_agreements` + `price_agreement_lines` have **RLS ENABLED, ZERO policies** | spec (live local stack) + the routes/route_stops trap pattern | Migration MUST ship full SELECT+INSERT+UPDATE+DELETE policies for **both** tables or pricing blanks. **Must-fix.** |
| `GRANT ALL ON price_agreements/price_agreement_lines TO authenticated` already exists | `baseline.sql` lines 2747-2754 | **NO new table GRANT needed** (same as routes). |
| `current_user_is_valid()` helper exists, `EXECUTE` granted to `authenticated` | migration `20260618130000` L72-93 | Reuse it directly in pricing policies; no new helper, no new grant. |
| Pricing reads FK-embed `rep:users!price_agreements_agreed_by_fkey(id, name)` | `PricingRepository.ts` L71 | `agreed_by` name resolution depends on the `users_directory_select` policy from 04c — **already shipped**. No new users migration needed. |
| `createSupabasePricingRepository(client)` + `authenticatedClientForCaller` + `dbTokenMinter` all exist and are exported | adapters `index.ts`, `lib/wiring/dbToken.ts` | All seams for `pricingServiceForCaller` already exist; pure assembly. |
| Pricing routes source the caller via `req.headers.get('x-mfs-user-id')` | all 6 route files | Same `userId` source as routes; pass straight to `pricingServiceForCaller(userId)`. |
| `pricingActivationEmail` use-case composes the **service-role** `pricingService` singleton + `supabaseUsersRepository` | `lib/wiring/pricing.ts` L48-52 | **Email path stays service-role** (see §6 decision E1). |
| Latest migration is `20260618130000` | `ls supabase/migrations` | New migration timestamp must be **after** it; use `20260619120000`. |
| Migration filename rule: `^\d{14}_[a-z0-9_]+\.sql$` | `filename-convention.test.ts` L32 | `20260619120000_pricing_authenticated_rls_policies.sql` complies. |

---

## 4. Compliance / ADR flags

- **ADR-0004 (RLS vs service-role security model):** this plan IS the ADR-0004
  trajectory — moving prod pricing traffic onto RLS. No conflict; it advances it.
- **ADR-0007 (app-minted token + GUC bridge for RLS):** the `pricingServiceForCaller`
  factory uses exactly the ADR-0007 mechanism (`dbTokenMinter` → token →
  `authenticatedClientForCaller` → GUC `app.current_user_id`). No conflict.
- **ADR-0002 (hexagonal shape):** all vendor/auth wiring stays inside
  `lib/wiring/pricing.ts`; the vendor `SupabaseClient` is constructed and consumed
  only there; routes receive a ready `PricingService` built from ports. No conflict.
- **No new ADR required** — this is an established pattern (3rd cutover after
  Orders/Users 04a/04b and Routes 04c).

🗣 **In plain English:** Two of our written architecture decisions (the security
model and the badge/token mechanism) *predicted* this exact change. We're
following them, not fighting them. No new decision record needed.

---

## 5. Exact files to change

### 5.1 NEW — `supabase/migrations/20260619120000_pricing_authenticated_rls_policies.sql`
The full 8-policy set (4 per table) for `price_agreements` + `price_agreement_lines`,
using `current_user_is_valid()`. **No GRANT** (baseline already grants). See §7 SQL sketch.

🗣 The door definitions. Without this file, switching to badges blanks every
pricing screen. This is the one piece that must hit prod **before** the code merge.

### 5.2 EDIT — `lib/wiring/pricing.ts`
Add `pricingServiceForCaller(userId)`. Keep `pricingService` (service-role
singleton) AND `pricingActivationEmail` exactly as-is. Mirror `routesServiceForCaller`.

Add to the existing imports (the adapter `index.ts` already exports these):
```ts
import {
  createSupabasePricingRepository,
  supabasePricingRepository,   // keep — singleton uses it
  supabaseUsersRepository,     // keep — email use-case uses it
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { createPricingService, type PricingService } from "@/lib/services";
import { dbTokenMinter } from "@/lib/wiring/dbToken";
```
Append (mirroring `routes.ts` L57-68):
```ts
/** Build a PricingService bound to ONE caller, reaching the DB as the Postgres
 *  `authenticated` role so RLS fires. Per-request — NEVER memoize (a memoized
 *  client would leak one caller's identity to another). Mirrors
 *  routesServiceForCaller. Consumed by the pricing routes since F-RLS-04d. */
export async function pricingServiceForCaller(
  callerUserId: string,
): Promise<PricingService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createPricingService({
    pricing: createSupabasePricingRepository(client),
  });
}
```
ALSO update the file's top doc comment: the line "DO NOT add a
`pricingServiceForCaller`… that belongs with RLS (F-RLS-04d)" (L23-25) now refers
to the present change — rewrite it to describe the factory the way `routes.ts`
L35-55 documents it (service-role parachute + per-caller RLS rationale + never-memoize).

🗣 This is the parts list, not logic. We add a second way to build the pricing
service — one that wears the caller's badge — and keep the old master-key one as
the fallback.

### 5.3 EDIT — the 6 pricing route files (re-point each handler)
Pattern (mirror `routes/[id]/route.ts` L20, L76-77): import
`pricingServiceForCaller`, and inside each handler, AFTER the auth/401 check has
guaranteed a non-null `userId`, shadow the singleton with a per-caller instance:
```ts
import { pricingServiceForCaller } from '@/lib/wiring/pricing'
// ...inside handler, after the `if (!userId || ...) return 401`:
// Rollback = swap `pricingServiceForCaller(userId)` → `pricingService`.
const pricingService = await pricingServiceForCaller(userId)
```
The local `const pricingService` shadows the module import, so every existing
`pricingService.xxx(...)` call below it now runs as the authenticated caller with
ZERO other line edits. (This is exactly how routes did it.)

**Per-file handler inventory (VERIFIED by reading every file — 11 handlers across 6 files):**

| File | Methods | Service calls to re-point |
|------|---------|---------------------------|
| `app/api/pricing/route.ts` | **GET, POST** | `listAgreements`, `createAgreement` |
| `app/api/pricing/[id]/route.ts` | **GET, PATCH, DELETE** | `getAgreementById`, `getAgreementOwner`, `updateAgreement`, `deleteAgreement` (+ `pricingActivationEmail` — see E1) |
| `app/api/pricing/[id]/lines/route.ts` | **POST** | `getAgreementOwner`, `addLine` |
| `app/api/pricing/[id]/lines/replace/route.ts` | **POST** | `getAgreementOwner`, `replaceLines` |
| `app/api/pricing/lines/[lineId]/route.ts` | **PATCH, DELETE** | `getLineOwner` (inside `checkAccess`), `updateLine`, `deleteLine` |

> **Spec correction (record this):** the spec sketch said the agreement detail
> route is `GET+PUT+DELETE` and listed 5 routes / `lines/[lineId]` only. Reading
> the files: the detail route is **PATCH** (not PUT), and there is a **6th file**
> `app/api/pricing/[id]/lines/replace/route.ts` (POST) that the spec's "5 routes"
> count omitted. The cutover covers **all 6 files / 11 handlers**. The
> `lines/[lineId]` PATCH+DELETE call `getLineOwner` inside a module-level
> `checkAccess(lineId, userId, role)` helper — see §8 step 4 for the one wrinkle.

🗣 **In plain English:** In each screen's handler we add one line at the top —
"act as this logged-in person" — and everything below it automatically uses the
badge. The spec undercounted: it's 6 files, and the detail screen uses PATCH not
PUT. The line-edit/delete screen has a small twist (its access check lives in a
helper) noted in the steps.

### 5.4 NEW — `supabase/tests/011-rls-pricing.test.sql`
pgTAP mirror of `009-rls-routes.test.sql` for both pricing tables. See §9.

### 5.5 NEW — `tests/unit/wiring/pricingServiceForCaller.test.ts`
Unit test mirroring `usersServiceForCaller.test.ts`. See §9.

### 5.6 EDIT — `tests/integration/pricing.test.ts`
Extend (do not rewrite) to assert pricing routes still work under the
authenticated cutover, RBAC still app-enforced, `agreed_by` name non-blank for a
non-admin caller. See §9.

### 5.7 NEW — `supabase/migrations/rollback/20260619120000_pricing_authenticated_rls_policies.down.sql` (or inline `-- ROLLBACK` block, matching 04c house style)
DROP the 8 policies. No grant to revert (none added). See §10.

---

## 6. Decisions to lock during Render (call these out)

**E1 — Email path stays service-role (LOCKED recommendation).**
The PATCH activate path calls `pricingActivationEmail.resolveActivationEmail(id)`,
a use-case composed in `lib/wiring/pricing.ts` from the **service-role**
`pricingService` singleton + **service-role** `supabaseUsersRepository`. Leave it
on service-role:
- It is a server-side send of an admin/sales/office *directory* read +
  full-agreement read; not a user-facing screen.
- Keeping it service-role avoids any RLS-blank risk on the recipient query and is
  the exact posture 04c kept for its non-cutover paths
  (`routes/compute-road-times`, `routes/users`, cron).
- It is byte-identical to today (the use-case is untouched).
- The route's *primary* `pricingService` (now per-caller) handles the
  user-facing `updateAgreement`; only the side-effect email read uses the
  service-role use-case. No code change to the email path at all.

🗣 **In plain English:** When a deal is activated we email the sales team. That
email's "who do I send to" lookup runs on the server as a back-office job, so we
leave it on the master key — same as today, and same as the back-office bits we
left alone in the Routes cutover. Touching it would risk the email going blank
for no benefit.

**E2 — Predicate style: use `current_user_is_valid()` (LOCKED, per spec).**
04c's *routes* policies used inline `EXISTS(SELECT 1 FROM users …)` (safe there
because `routes` doesn't subquery itself). The spec mandates reusing the
`current_user_is_valid()` helper for pricing — it is the standardized,
recursion-proof form and reads cleanly. Pricing tables don't self-reference, so
either works, but we follow the spec and the newer idiom.

🗣 We use the trusted-bouncer helper, not a hand-written check. Cleaner, and it's
the pattern we standardized on after the recursion bug.

---

## 7. Migration SQL sketch (`20260619120000_pricing_authenticated_rls_policies.sql`)

```sql
-- 20260619120000_pricing_authenticated_rls_policies.sql
--
-- F-RLS-04d — Pricing-context RLS cutover. Byte-identical-intent mirror of
-- 20260618120000 (routes), adapted to price_agreements + price_agreement_lines.
--
-- WHY THE FULL SET: enable_rls_42_tables.sql ENABLED RLS on both pricing tables
--   but added NO policies → RLS-enabled + zero-policies = DENY EVERYTHING for
--   non-service-role. Once the pricing routes run as `authenticated`, every read
--   returns nothing unless SELECT policies ship → pricing screens blank. SELECT
--   is the headline must-fix. INSERT/UPDATE/DELETE ship too so create/edit/delete
--   work under the badge.
--
-- ROLE MODEL — VALID-USER ONLY (no role filter): mirrors 04c. The "sales own
--   only" RBAC stays in the route layer (getAgreementOwner / getLineOwner checks)
--   exactly as today — RLS is never stricter than the service's own gating.
--
-- PREDICATE: public.current_user_is_valid() (SECURITY DEFINER, shipped in
--   20260618130000) — the standardized recursion-proof valid-user check. EXECUTE
--   already granted to `authenticated` there; no new grant.
--
-- GRANTS: baseline.sql L2747-2754 already GRANT ALL on both tables TO
--   authenticated → NO GRANT added here.
--
-- SERVICE-ROLE still BYPASSES RLS (no FORCE) → the activation-email use-case and
--   any service-role path are unaffected.
--
-- NON-DESTRUCTIVE: CREATE POLICY only — no DROP TABLE/TRUNCATE/ALTER TYPE/
--   DROP COLUMN/DROP NOT NULL → no PITR gate fires.
--
-- One policy per command per table → no over-grant possible (Postgres OR's
--   permissive policies; here each command has exactly one).
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset.
-- Prod application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a/04b/04c/F-TD-22 ordering).

DROP POLICY IF EXISTS price_agreements_select       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_insert       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_update       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_delete       ON price_agreements;
DROP POLICY IF EXISTS price_agreement_lines_select  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_insert  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_update  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_delete  ON price_agreement_lines;

-- ── price_agreements ────────────────────────────────────────
CREATE POLICY price_agreements_select ON price_agreements
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY price_agreements_insert ON price_agreements
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreements_update ON price_agreements
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreements_delete ON price_agreements
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── price_agreement_lines (FULL set incl. UPDATE — updateLine PATCHes a row
--    in place, unlike route_stops which is delete-then-insert) ──
CREATE POLICY price_agreement_lines_select ON price_agreement_lines
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY price_agreement_lines_insert ON price_agreement_lines
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreement_lines_update ON price_agreement_lines
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreement_lines_delete ON price_agreement_lines
  FOR DELETE USING ( public.current_user_is_valid() );

-- ROLLBACK (manual): DROP the 8 policies above (see §10 / rollback .sql).
```

> **Key divergence from the routes migration (deliberate, verified):**
> `route_stops` had **no UPDATE policy** because `saveRoute` replaces stops via
> delete-then-insert. `price_agreement_lines` **DOES** need an UPDATE policy:
> `lines/[lineId]` PATCH calls `pricingService.updateLine` → an in-place UPDATE on
> a single line row. The `replace` route uses the `replace_agreement_lines` RPC
> (delete+insert), so it needs INSERT+DELETE; the line PATCH needs UPDATE. Hence
> the FULL 4-policy set on the lines table. **Missing the lines UPDATE policy =
> line edits silently fail under the badge — second must-fix detail.**

🗣 **In plain English:** Eight door rules total, four per table: see / create /
edit / delete. Each says only "must be a real signed-in user." One subtle trap
the Routes copy doesn't have: the *line edit* screen changes a line in place, so
the lines table needs an "edit" rule too — Routes didn't, because it rebuilt
stops from scratch. Forgetting that rule would make line edits quietly fail.

---

## 8. Step ordering (TDD-first where it pays)

1. **Write the migration** (`20260619120000_…`) — §7. `npm run db:reset` locally
   to apply. 🗣 Ship the doors first so nothing else blanks while developing.
2. **Write the pgTAP test** `011-rls-pricing.test.sql` (§9). Run it red→green
   against the new migration. 🗣 Prove the doors lock and open correctly before
   any app code trusts them.
3. **Write the wiring unit test** `pricingServiceForCaller.test.ts` (RED), then
   add `pricingServiceForCaller` to `lib/wiring/pricing.ts` (§5.2) → GREEN.
   🗣 Prove the badge-wearing service is built per-caller and never memoized
   *before* wiring it into routes.
4. **Re-point the 6 route files** (§5.3) one at a time, running
   `tests/integration/pricing.test.ts` after each:
   - `app/api/pricing/route.ts` (GET, POST)
   - `app/api/pricing/[id]/route.ts` (GET, PATCH, DELETE) — leave the
     `pricingActivationEmail` call untouched (E1).
   - `app/api/pricing/[id]/lines/route.ts` (POST)
   - `app/api/pricing/[id]/lines/replace/route.ts` (POST)
   - `app/api/pricing/lines/[lineId]/route.ts` (PATCH, DELETE) — **wrinkle:** the
     owner check lives in module-level `checkAccess(lineId, userId, role)` which
     calls the imported singleton `pricingService.getLineOwner`. The simplest
     byte-identical re-point: pass a per-caller service into `checkAccess`, i.e.
     `checkAccess(svc, lineId, userId, role)` where `svc = await
     pricingServiceForCaller(userId)`, and reuse the SAME `svc` for the
     subsequent `updateLine`/`deleteLine`. Build the per-caller service ONCE per
     handler (after the 401 check) and thread it through. Do NOT call
     `pricingServiceForCaller` twice in one request. 🗣 The line screen checks
     ownership in a little helper; hand that helper the badge-service instead of
     the master-key one, and reuse the same badge-service for the actual edit.
5. **Update the `lib/wiring/pricing.ts` doc comment** (§5.2) to reflect the now-built factory.
6. **Extend the integration test** (§5.6) — RBAC + agreed_by-name + cutover assertions.
7. **Write the rollback .sql** (§10).
8. **Full local gate:** `npm run db:reset` → pgTAP green (`011`), unit green,
   `npm run test:integration` green, then the E2E pricing flow (§9 E2E) on the
   preview at ship.

🗣 **In plain English:** Build the database doors first and prove them; then build
the badge-service and prove it; then switch each screen over one at a time,
re-running the pricing tests after each so a break is obvious immediately.

---

## 9. Test matrix (mirror 04c's ANVIL ladder)

```
ANVIL · F-RLS-04d pricing RLS cutover
  Unit         ○ pricingServiceForCaller (mint/build/never-memoize/parachute)
  Integration  ○ pricing routes under authenticated · RBAC app-enforced · agreed_by non-blank
  DB / RLS     ○ pgTAP 011-rls-pricing (CRUD + fail-closed + service bypass, both tables)
  E2E          ○ create→list→detail→add line→edit line→activate, authenticated (preview smoke)
  🗣 every rung green before the cert prints
```

**pgTAP `011-rls-pricing.test.sql`** (mirror `009`, ~14 assertions):
- Fixtures via service-role: 1 valid user, 1 customer, 1 seed agreement + 1 seed line.
- `SET LOCAL ROLE authenticated`; set `app.current_user_id` to the valid user.
- VALID USER: `isnt_empty` SELECT agreements; `lives_ok` INSERT/UPDATE/DELETE
  agreements; `isnt_empty` SELECT lines; `lives_ok` INSERT/**UPDATE**/DELETE
  lines. (UPDATE on lines is the divergence from routes — assert it explicitly.)
- EMPTY GUC fail-closed: accept `22P02` (the `nullif(...,'')::uuid` cast deny) on
  SELECT and INSERT — same inherited edge as 09; `current_user_is_valid()`
  returns false on absent GUC, raises 22P02 on empty-string GUC.
- SERVICE-ROLE bypass: `RESET ROLE`; empty GUC; `isnt_empty` proves service-role
  reads regardless.
🗣 Proves the database doors deny strangers, admit real users, and that the master
key still opens everything (our parachute).

**Unit `pricingServiceForCaller.test.ts`** (mirror `usersServiceForCaller.test.ts`):
- Mock `dbTokenMinter`, `authenticatedClientForCaller`,
  `createSupabasePricingRepository`, `createPricingService`.
- Assert: one mint with `{ userId }`, one client build from that token, repo bound
  to that client, service built from that repo.
- Assert NEVER memoizes: two calls → two mints/clients/repos, distinct tokens.
- Assert the `pricingService` service-role singleton is still exported (parachute).
🗣 Proves each request gets its OWN badge-service — no identity leak between users.

**Integration (extend `tests/integration/pricing.test.ts`):**
- A non-admin (sales) caller can list/create/view/add-line/edit-line under the
  authenticated cutover (no blank screens — proves the SELECT policies work end-to-end).
- The sales-own-only RBAC still 403s a sales user touching another user's agreement
  (proves RBAC stayed in the app layer, not RLS).
- `agreed_by` display name is non-blank for a non-admin caller (proves the
  `users_directory_select` policy from 04c covers the pricing FK-embed).
🗣 End-to-end proof: real users see their screens, the "own deals only" rule still
bites, and the rep's name still shows.

**E2E (`@critical` preview smoke at ship):** create agreement → appears in list →
open detail → add line → edit line → activate (fires email), all as an
authenticated user against the PR's Supabase preview branch.
🗣 A real click-through on a real preview proves the whole flow before prod.

---

## 10. Rollback approach

Two independent, instant levers (mirror 04c):

1. **Code lever (no deploy of SQL):** revert each route's local
   `const pricingService = await pricingServiceForCaller(userId)` back to the
   imported singleton (one line per handler). Documented inline as
   `// Rollback = swap pricingServiceForCaller(userId) → pricingService.`
   🗣 Flip the screens back to the master key — they work immediately, RLS becomes
   irrelevant again.
2. **DB lever:** `supabase/migrations/rollback/20260619120000_…down.sql` drops the
   8 policies (no grant to revert). Because the *code* is what made traffic run as
   `authenticated`, the policies are harmless-but-inert once the code lever is
   pulled; dropping them is only needed if you want the tables back to bare
   RLS-enabled-no-policy. 🗣 The doors can be removed too, but pulling the code
   lever alone already restores service.

```sql
-- rollback: 20260619120000_pricing_authenticated_rls_policies.down.sql
DROP POLICY IF EXISTS price_agreements_select       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_insert       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_update       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_delete       ON price_agreements;
DROP POLICY IF EXISTS price_agreement_lines_select  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_insert  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_update  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_delete  ON price_agreement_lines;
```

**Ship ordering (mirror 04a/04b/04c):** apply the migration to **PROD FIRST** via
Supabase MCP `apply_migration`, confirm pricing still reads on prod under
service-role (policies are inert until code flips), THEN merge the code PR. This
guarantees the doors exist before any prod traffic wears a badge.

🗣 **In plain English:** Put the doors in the production database BEFORE the code
that starts using badges ships. Doors-first means there's never a moment where a
real user has a badge but the door has no rule — which is the blank-screen
failure.

---

## 11. Risk Assessment (MANDATORY — Gate 2 input)

### 11.1 Concurrency / race conditions
- **R-CONC-1 — per-request client identity leak via memoization.** Severity:
  **High** if mishandled. If `pricingServiceForCaller` memoized the client/service,
  caller A's badge could serve caller B's request. **Mitigation:** factory mints a
  fresh token + builds a fresh client every call (never memoize); the unit test
  asserts two calls → two distinct tokens. **Must-fix:** YES (enforced by test;
  the pattern is proven in routes/users so risk is procedural, not novel).
  🗣 The danger is reusing one person's badge for the next person; we forbid
  caching and prove it with a test.
- No other concurrency surface: the cutover changes *who* the DB call runs as, not
  ordering/transactions. `replaceLines` atomicity is unchanged (same RPC).

### 11.2 Security
- **R-SEC-1 — RLS-enabled-zero-policy blank (the headline).** Severity:
  **Critical.** Flipping to authenticated with no SELECT policy = every pricing
  read returns nothing → total pricing outage for real users. **Mitigation:** the
  migration ships the full SELECT+INSERT+UPDATE+DELETE set for **both** tables;
  pgTAP `011` proves it; ship ordering applies the migration to prod FIRST.
  **Must-fix:** YES.
  🗣 Turn on locks without doors and everyone is locked out. The doors ship in the
  same change and go to prod first.
- **R-SEC-2 — predicate too loose (any logged-in user reads all agreements at DB
  level).** Severity: **Low / accepted.** The valid-user-only predicate is the
  LOCKED decision (mirror 04c); the finer "sales own only" gate stays in the app.
  This is byte-identical to today's effective behaviour (service-role saw all;
  app gated). **Mitigation:** none needed — by design; F-TD-24 / owner-scoping is
  explicitly deferred. **Must-fix:** NO.
  🗣 The DB door only checks "real employee," not "your deal." That's the same as
  today and a deliberate choice; the finer rule stays in our code.
- **R-SEC-3 — credential/hash exposure via the users FK-embed.** Severity: **None
  (already mitigated).** The `agreed_by` embed reads `users(id, name)` only, and
  04c's column-privilege lockdown already seals `pin_hash`/`password_hash` from the
  `authenticated` role. **Must-fix:** NO.
  🗣 The rep's name shows, but password hashes were already walled off in the
  Routes change.

### 11.3 Data migration
- **R-DATA-1 — destructive migration / PITR.** Severity: **None.** The migration
  is CREATE POLICY only — no DROP/TRUNCATE/ALTER TYPE/DROP COLUMN. No data touched
  → no PITR gate. **Must-fix:** NO.
  🗣 We only add door rules; no data is moved or deleted, so no backup gate fires.

### 11.4 Business-logic flaws
- **R-BIZ-1 — missing UPDATE policy on `price_agreement_lines`.** Severity:
  **High.** Copying the routes migration too literally (route_stops had no UPDATE
  policy) would omit the lines UPDATE policy, silently breaking `updateLine`
  (line PATCH). **Mitigation:** §7 ships the FULL 4-policy set on the lines table;
  pgTAP `011` explicitly asserts a `lives_ok` UPDATE on lines. **Must-fix:** YES.
  🗣 The Routes copy didn't need an "edit" door on its stops; Pricing does for line
  edits. Forgetting it makes line edits quietly fail; we ship it and test it.
- **R-BIZ-2 — email recipient read blanks under the badge.** Severity: **Medium**
  if the email path were flipped; **None** as planned. **Mitigation:** decision E1
  keeps `pricingActivationEmail` on the service-role use-case (untouched), so the
  recipient directory read is never subject to RLS. **Must-fix:** NO (avoided by
  design).
  🗣 The activation email's recipient lookup stays on the master key, so it can't
  go blank.
- **R-BIZ-3 — double per-caller build in `lines/[lineId]`.** Severity: **Low.**
  Building `pricingServiceForCaller` once in `checkAccess` and again for the
  mutation would mint two tokens per request (wasteful, not incorrect).
  **Mitigation:** §8 step 4 — build once per handler and thread the same `svc`
  into `checkAccess`. **Must-fix:** NO (correctness-neutral; do it cleanly).
  🗣 Don't mint two badges for one request; make one and pass it around.

### 11.5 Launch blockers
- **R-LAUNCH-1 — migration not applied to prod before code merge.** Severity:
  **Critical.** If code ships first, real users get badges before doors exist →
  R-SEC-1 in prod. **Mitigation:** ship ordering (§10) — apply migration to prod
  FIRST, verify, then merge. **Must-fix:** YES (process gate at ship).
  🗣 Doors before badges, in production. Wrong order = outage.
- **R-LAUNCH-2 — migration filename collision.** Severity: Low. **Mitigation:**
  `20260619120000` is after the latest (`20260618130000`) and matches the 14-digit
  rule. **Must-fix:** NO.

### Risk headline
**Four must-fix items**, all standard for this 3rd-cutover pattern and all closed
by the plan as written: R-SEC-1 (ship the full policy set — headline),
R-BIZ-1 (lines UPDATE policy — the trap the routes copy hides), R-CONC-1
(never-memoize, test-enforced), and R-LAUNCH-1 (prod-migration-first ship order).
None is unresolved — the plan resolves each — so they are must-fix *requirements
the plan already satisfies*, not open blockers. **No open Gate-2 blocker.**

---

## 12. Acceptance criteria

1. Migration `20260619120000_pricing_authenticated_rls_policies.sql` exists,
   ships 8 policies (4 per table) using `current_user_is_valid()`, no GRANT, no
   destructive statement.
2. `lib/wiring/pricing.ts` exports `pricingServiceForCaller(userId)` (per-caller,
   never memoized) AND still exports `pricingService` + `pricingActivationEmail`.
3. All 6 pricing route files (11 handlers) build a per-caller service after the
   401 check and run their DB calls as `authenticated`; the
   `pricingActivationEmail` call stays on the service-role use-case.
4. pgTAP `011-rls-pricing.test.sql` green: CRUD (incl. lines UPDATE) for a valid
   user, fail-closed for empty/absent GUC, service-role bypass.
5. `pricingServiceForCaller.test.ts` green: mint/build/never-memoize/parachute.
6. `tests/integration/pricing.test.ts` green incl. new cutover/RBAC/agreed_by-name
   assertions.
7. E2E pricing flow green on preview under an authenticated user.
8. No `@supabase/*` import added outside `lib/adapters/supabase/`; no adapter
   import outside `lib/wiring/` (ESLint `no-adapter-imports` pinned test passes).
9. Wire responses byte-identical to pre-cutover for every handler (F-TD-24
   behaviours preserved, not fixed).

---

## 13. Hexagonal verdict (Gate 2 input — computed)

- **Port used:** `PricingRepository` (`lib/ports`) — **unchanged**. No new port.
- **Adapter:** `lib/adapters/supabase/PricingRepository.ts` via
  `createSupabasePricingRepository(client)` — **unchanged** (already exists; the
  cutover just hands it an authenticated client instead of the service-role one).
- **New dependencies:** **NONE.** No `package.json` change. All seams
  (`dbTokenMinter`, `authenticatedClientForCaller`, `createSupabasePricingRepository`,
  `createPricingService`) already exist.
- **Vendor isolation:** the `SupabaseClient` is constructed and consumed entirely
  inside `lib/wiring/pricing.ts`; routes receive a ready `PricingService` built
  from ports. No vendor type leaks past the adapter/wiring boundary.
- **Rip-out test:** "replace the DB vendor for Pricing tomorrow" = one new adapter
  folder + edits to `lib/wiring/pricing.ts` only. Routes, services, domain,
  use-case untouched. **PASS.**

🗣 **In plain English:** We're not adding any new vendor, library, socket, or plug.
We're feeding the existing pricing plug a different power source (the badge instead
of the master key), and all that wiring lives in the one allowed wiring file. If
we swapped databases tomorrow, still just one adapter + one wiring file. Clean
hexagonal — PASS.
