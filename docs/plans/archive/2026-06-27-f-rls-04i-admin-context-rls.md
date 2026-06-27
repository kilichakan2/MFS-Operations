# F-RLS-04i — Admin-context RLS (Day-15 finale)

**Plan date:** 2026-06-27
**Unit:** F-RLS-04i — Admin-context RLS + guard standardization
**Conductor:** FORGE (Frame spec locked at Gate 1)
**Planner:** forge-planner
**Plan file:** `docs/plans/2026-06-27-f-rls-04i-admin-context-rls.md`

---

## Mini-map

```
DOMAIN (core logic — admin-context routes)
  ├─ CustomersRepository (port) → [Supabase] service-role + NEW …ForCaller
  ├─ ProductsRepository  (port) → [Supabase] service-role + NEW …ForCaller
  ├─ AuditLogRepository  (port) → [Supabase] service-role + NEW …ForCaller
  ├─ VisitsRepository    (port) → [Supabase] …ForCaller EXISTS — reuse
  └─ dbToken → app-minted HS256 → GUC app.current_user_id → live RLS fires
🗣 Each admin route stops using the master key (service-role, ignores locks) and uses a per-person key, so the DB's own GUC locks finally check who is asking.
```

---

## Goal

Flip every remaining admin-context API route off the RLS-bypassing **service-role**
singletons (`customersService`, `productsService`, `auditLog`, `mapDataService`,
`visitsService`) onto per-request `…ForCaller(userId)` factories, so the database's
**already-live** GUC-based RLS policies finally fire on admin traffic. In the same
sweep, standardize **every** in-scope admin route's authorization onto the central
`requireRole(req, ['admin'])` helper (`lib/auth/session.ts`), replacing the
ad-hoc inline `role !== 'admin'` checks and the bare `x-mfs-user-id`-existence
checks.

**🗣 In plain English:** The DB door-locks (RLS policies) already exist and are
switched on, but admin pages walk in with a master key that ignores them. This unit
hands each admin page a key cut for the specific person logged in, so the locks
actually engage. At the same time, every admin door gets the same lock mechanism
(`requireRole`) instead of five slightly different home-made bolts.

This is the **"Full standardize + tighten"** scope locked at Gate 1 — the security
finale of the 16-day sprint.

---

## Domain terms (plain-English bridge)

- **Service-role singleton** (`customersService`, `productsService`, `auditLog`,
  `mapDataService`, the `visitsService` singleton) — a pre-built object that talks to
  the DB with the master key.
  **🗣** A skeleton key that opens every lock. Convenient, but it means the DB's own
  per-user locks never get tested. We keep these around only as the one-line rollback
  switch.
- **`…ForCaller(userId)` factory** — a function that, per request, mints a fresh
  app-signed token for that one user, builds a per-caller authenticated Supabase
  client, and binds the service to it.
  **🗣** Cuts a key for exactly the person making this request. Never reused between
  requests (a reused key would leak one person's identity to another).
- **GUC `app.current_user_id`** — a Postgres per-request session variable the RLS
  policies read.
  **🗣** A sticky note the DB reads on every query that says "this request is user X".
  Empty note = denied (fail-closed). The ADR-0007 bridge writes this note from the
  token.
- **`is_admin()`** — a SECURITY DEFINER Postgres function that reads the GUC, looks
  up that user, returns true iff their role is `admin`.
  **🗣** The DB asking "is the person on the sticky note actually an admin?" — this
  is what lets an admin caller legitimately see every rep's rows.
- **`requireRole(req, ['admin'])`** (`lib/auth/session.ts:70`) — reads the
  tamper-proof `x-mfs-*` headers, throws `UnauthorizedError` (→401) if no identity,
  `ForbiddenError` (→403) if the role isn't allowed, else returns a `Caller`.
  **🗣** One shared bouncer that every admin route hands its ID to, instead of each
  route checking IDs its own slightly-different way.
- **Per-caller adapter constructor** (`createSupabaseCustomersRepository(client)`,
  `createSupabaseProductsRepository(client)`, `createSupabaseAuditLogRepository(client)`,
  `createSupabaseVisitsRepository(client)`) — builds a repository bound to a supplied
  client.
  **🗣** The repository, but plugged into the per-person key instead of the master
  key. All four already exist in the supabase adapter barrel (verified).

---

## Compliance / architecture flags

- **Hexagonal (CLAUDE.md + ADR-0002):** routes import ZERO adapters; only
  `lib/wiring/**` imports adapters. The new `…ForCaller` factories live in wiring,
  mirroring the live `haccpDailyChecksServiceForCaller` / `visitsServiceForCaller` /
  `routesServiceForCaller` pattern. No vendor type (`SupabaseClient`) crosses the
  adapter boundary — it is constructed and consumed entirely inside the wiring file.
- **No new dependency.** Everything used (token minter, `authenticatedClientForCaller`,
  per-caller adapter constructors) already exists. The rip-out test is unaffected.
- **No migration. No PITR gate.** All policies + the `authenticated` table GRANTs
  already exist (see "RLS pre-flight" below). Confirmed: not inventing any policy.

---

## ADR review

- **ADR-0007** (`docs/adr/0007-app-minted-token-and-guc-bridge-for-rls.md`) — the
  authoritative mechanism. This unit is a pure **consumer** of the live bridge
  (migration `20260614210221_db_pre_request_guc_bridge.sql`). **No conflict.**
  **🗣** This unit doesn't build the door-locks or the sticky-note system — those
  shipped already. It just walks the remaining admin routes through that door.
- **ADR-0002** (hexagonal shape/naming) — followed; factories in wiring only.
  **No conflict.**
- **ADR-0004** (RLS-on target posture) — this unit advances that posture; the
  service-role singletons are retained as rollback parachutes, consistent with
  ADR-0004's "demote service-role, don't delete it yet" sequencing. **No conflict.**

**No ADR conflicts found.**

---

## RLS pre-flight (verified against migrations — DO NOT invent policies)

All policies confirmed in `supabase/migrations/20260101000000_baseline.sql`:

| Table | Policy (verified line in baseline) | Effect for an admin caller |
|---|---|---|
| `customers` | `customers_select` USING (GUC IS NOT NULL AND GUC <> '') (L2449); `_insert`/`_update`/`_delete` `is_admin()` (L2446/2452/2443) | any authed user reads; only admin writes |
| `products` | `products_select` same GUC-presence (L2470); `_insert`/`_update` `is_admin()` (L2467/2473); **no `products_delete`** | any authed user reads; only admin writes; no delete path (matches spec) |
| `audit_log` | `audit_log_insert` WITH CHECK (user_id = GUC) (L2422); `audit_log_select` `is_admin()` (L2425) | insert row's user_id must equal caller; only admin reads |
| `visits` | `visits_*` USING (user_id = GUC OR `is_admin()`) (migration `20260622120000` header) | admin sees ALL reps' visits via `is_admin()` |

`authenticated`-role table GRANTs confirmed (`GRANT ALL ON TABLE … TO "authenticated"`
in baseline): `audit_log` (L2543), `customers` (L2583), `products` (L2758),
`visits` (L2788). So the per-caller `authenticated`-role client is not blocked by a
missing GRANT at runtime.

**No genuinely-missing policy found. No new migration. STOP-and-flag condition not
triggered.**

**🗣 In plain English:** I checked the actual lock definitions, not just the spec's
summary. Every lock this unit relies on already exists and is wired so the
`authenticated` role can reach the tables. There is nothing to add to the database.

---

## In-scope route audit (verified file:line — corrections noted)

I read every in-scope file. The spec's line numbers and current state are accurate
except for the items flagged **CORRECTION** below.

| # | Route | Current guard | Current wiring | Action |
|---|---|---|---|---|
| 1 | `app/api/admin/customers/route.ts` GET | inline `role!=='admin'`→403 (L36–39) | `customersService` | wiring + guard |
| 2 | `app/api/admin/customers/[id]/route.ts` PATCH | inline role→403 (L47–50) | `customersService` (+`geocoder`) | wiring + guard |
| 3 | `app/api/admin/products/route.ts` GET | inline role→403 (L35–38) | `productsService` | wiring + guard |
| 4 | `app/api/admin/products/[id]/route.ts` PATCH | inline role→403 (L39–42) | `productsService` | wiring + guard |
| 5 | `app/api/admin/import/confirm/route.ts` POST | bare userId→401 (L56–58) | `customersService`+`productsService`+`auditLog` (+`geocoder`) | wiring (3 ports) + guard |
| 6 | `app/api/admin/import/manual/route.ts` POST | bare userId→401 (L34–36) | `customersService`+`productsService`+`auditLog` | wiring (3 ports) + guard |
| 7 | `app/api/admin/import/route.ts` POST | bare userId→401 (L27–29) | `llmExtractor` ONLY (no DB) | **guard only** |
| 8 | `app/api/admin/at-risk/route.ts` GET | bare userId→401 (L30–32) | **CORRECTION: imports `visitsService` (singleton), L24** | wiring + guard |
| 9 | `app/api/admin/commitments/route.ts` GET | bare userId→401 (L30–32) | **CORRECTION: imports `visitsService` (singleton), L24** | wiring + guard |
| 10 | `app/api/admin/prospects/route.ts` GET | bare userId→401 (L28–30) | **CORRECTION: imports `visitsService` (singleton), L23** | wiring + guard |
| 11 | `app/api/map/data/route.ts` GET | bare userId→401 (L25–27) | `mapDataService` | wiring + guard |
| 12 | `app/api/admin/geocode-all/route.ts` GET | already `requireRole(['admin'])` (L39) | `customersService`+`geocoder` | **wiring only** (no guard change) |
| 13 | `app/api/admin/runs/[id]/route.ts` PATCH+DELETE | inline role→403 (L25, L84) | already `routesServiceForCaller` (L37, L96) | **guard only** |
| 14 | `app/api/admin/visits/route.ts` GET | bare userId→401 (L38–40) | already `visitsServiceForCaller` (L45) | **guard only** |
| 15 | `app/api/admin/runs/route.ts` GET | bare userId→401 (L25) | already `routesServiceForCaller` (L29) | **guard only** |

**OUT OF SCOPE — DO NOT TOUCH:** `app/api/admin/users/*` (already `requireRole` +
`usersServiceForCaller`, F-RLS-04b).

### Corrections / clarifications to the locked spec

- **C1 — at-risk / commitments / prospects (#8/#9/#10):** the spec says these "use
  `visitsService` (service-role)" and need switching to `visitsServiceForCaller`.
  **Confirmed and correct** — they literally `import { visitsService } from
  '@/lib/wiring/visits'`. Methods used (`listAtRisk`, `listCommitments`,
  `listProspects`) live on `VisitsService`, which the `…ForCaller` factory returns,
  so the swap is type-clean. (Flagging because the spec's word "correct" needed
  proving — it is.)
- **C2 — `requireRole` is throw-based; these routes do NOT use the `withErrors`
  HOF.** Every in-scope route uses a hand-rolled `try { … } catch { 500 }`. So
  `requireRole` must be called INSIDE the existing `try`, and the `catch` must
  explicitly map `UnauthorizedError → 401` and `ForbiddenError → 403` **before** the
  generic 500 — exactly the pattern `app/api/admin/geocode-all/route.ts:84–93`
  already uses. Do NOT wrap these in `withErrors`/`withRequestContext` (out of scope,
  and would change unrelated behaviour).
- **C3 — `import/confirm` & `import/manual` audit write must stay best-effort.** Both
  currently do `await auditLog.record({…}).catch(e => console.error(…))` so an audit
  failure never sinks a succeeded import. After cutover the per-caller `auditLog`
  writer still throws `ServiceError` on failure; the `.catch(log)` MUST be preserved
  verbatim. (See R-AUDIT in Risks.)
- **C4 — `import/confirm` fire-and-forget geocode stays service-role-free but
  unchanged.** `geocodeNewCustomers` calls `customersService.setCoords` (a write).
  After cutover this MUST use the **per-caller** customers service so the
  `customers_update` `is_admin()` policy passes — see Step 5 wiring note. The
  `.catch(() => {})` swallow (W1) stays.
- **C5 — `geocoder` is NOT a DB port.** In `import/confirm`, `geocode-all` it is an
  external-API (postcodes.io) adapter carrying no DB identity → it stays as the shared
  `geocoder` singleton, exactly as `haccpReportingServiceForCaller` keeps the shared
  `xlsxSpreadsheetExporter`. Do NOT build a `geocoderForCaller`.
- **C6 — `customers/[id]` and `products/[id]` PATCH `catch` returns
  `{ error: String(err) }` (500).** This is a pre-existing raw-error leak (known
  debt). Standardizing the guard adds the `Unauthorized/Forbidden` mapping ABOVE the
  generic catch; do NOT "fix" the `String(err)` leak in this unit (out of scope,
  no-reformat rule) — but the new `UnauthorizedError/ForbiddenError` branches must be
  added so a thrown guard error becomes 401/403, not `String(err)`→500.

---

## Per-route OLD-vs-NEW guard behaviour table (the binding contract)

`requireRole` bodies (from `lib/auth/session.ts`):
- no identity → `UnauthorizedError("Authentication required.")` → route maps to **401**
- wrong role → `ForbiddenError("Role does not permit this action.")` → route maps to **403**

The route's `catch` chooses the response **body**. To keep operator-facing wording
stable, map to the SAME body strings these routes already emit:
`UnauthorizedError → { error: 'Unauthenticated' } 401` and
`ForbiddenError → { error: 'Admin only' } 403` (matches geocode-all's existing
`'Authentication required'`/`'Admin only'` choice — **DECISION D1 below**).

**DECISION D1 (resolve at implementation):** geocode-all currently maps
`UnauthorizedError → { error: 'Authentication required' }`. For byte-stability with
the OTHER routes' historical `'Unauthenticated'` body, use `{ error: 'Unauthenticated' }`
for the 401 body and `{ error: 'Admin only' }` for the 403 body on the routes being
standardized. This makes the **status codes** the contract and keeps bodies within the
existing vocabulary. (No client reads these bodies on a real admin request — see
"Client body-read audit".)

| # | Route | OLD status+body | NEW status+body | Net change |
|---|---|---|---|---|
| 1 | customers GET | non-admin → 403 `{error:'Admin only'}`; absent-id → (n/a, no id check) → would 500 later | absent-id → **401** `{error:'Unauthenticated'}`; non-admin → 403 `{error:'Admin only'}` | adds explicit 401; 403 body identical |
| 2 | customers/[id] PATCH | non-admin → 403 `{error:'Admin only'}`; absent-id → `String(err)` 500 downstream | absent-id → **401** `{error:'Unauthenticated'}`; non-admin → 403 `{error:'Admin only'}` | adds explicit 401; 403 identical |
| 3 | products GET | non-admin → 403 `{error:'Admin only'}` | absent-id → **401**; non-admin → 403 `{error:'Admin only'}` | adds 401; 403 identical |
| 4 | products/[id] PATCH | non-admin → 403 `{error:'Admin only'}` | absent-id → **401**; non-admin → 403 `{error:'Admin only'}` | adds 401; 403 identical |
| 5 | import/confirm POST | absent-id → 401 `{error:'Unauthenticated'}`; **no role check** | absent-id → 401 `{error:'Unauthenticated'}`; **non-admin → 403** `{error:'Admin only'}` | adds 403; 401 identical |
| 6 | import/manual POST | absent-id → 401 `{error:'Unauthenticated'}`; **no role check** | absent-id → 401 same; **non-admin → 403** `{error:'Admin only'}` | adds 403; 401 identical |
| 7 | import POST | absent-id → 401 `{error:'Unauthenticated'}`; **no role check** | absent-id → 401 same; **non-admin → 403** `{error:'Admin only'}` | adds 403; 401 identical |
| 8 | at-risk GET | absent-id → 401 `{error:'Unauthenticated'}`; **no role check** | absent-id → 401 same; **non-admin → 403** `{error:'Admin only'}` | adds 403; 401 identical |
| 9 | commitments GET | absent-id → 401 same; no role check | absent-id → 401 same; **non-admin → 403** | adds 403; 401 identical |
| 10 | prospects GET | absent-id → 401 same; no role check | absent-id → 401 same; **non-admin → 403** | adds 403; 401 identical |
| 11 | map/data GET | absent-id → 401 `{error:'Unauthenticated'}`; no role check | absent-id → 401 same; **non-admin → 403** `{error:'Admin only'}` | adds 403; 401 identical |
| 12 | geocode-all GET | already `requireRole(['admin'])` → 401 `{error:'Authentication required'}` / 403 `{error:'Admin only'}` | **unchanged** (wiring only) | none |
| 13 | runs/[id] PATCH+DELETE | non-admin → 403 `{error:'Admin only'}`; absent-id → 401 `{error:'Unauthorised'}` | absent-id → **401** `{error:'Unauthenticated'}` (D1); non-admin → 403 `{error:'Admin only'}` | 401 body `'Unauthorised'`→`'Unauthenticated'`; 403 identical |
| 14 | admin/visits GET | absent-id → 401 `{error:'Unauthenticated'}`; no role check | absent-id → 401 same; **non-admin → 403** `{error:'Admin only'}` | adds 403; 401 identical |
| 15 | admin/runs GET | absent-id → 401 `{error:'Unauthorised'}`; no role check | absent-id → **401** `{error:'Unauthenticated'}` (D1); **non-admin → 403** | 401 body changes; adds 403 |

**Net:** every change either (a) adds a 401 or 403 path that did not exist, or (b)
normalizes a 401 body from `'Unauthorised'`→`'Unauthenticated'` (#13, #15). All are
within the Gate-1-accepted behaviour-change envelope. **Middleware already gates every
`/api/admin/*` and `/api/map/*` path to admin**, so no real authenticated admin is
newly locked out — the new 403/401 branches are only reachable by a forged/absent
header, which is precisely the thing we WANT refused (see R-SEC).

### Client body-read audit (clears the "does a client read the body?" gate)

- **Admin SPA** (`app/admin/page.tsx`): on import flows (L760/777/794) and customer
  postcode save (L680) it reads `data.error ?? '<hardcoded fallback>'` **only when
  `!res.ok`**. New body strings still render (or fall back) — **no client breaks**.
  These `!res.ok` paths are unreachable for a real admin (middleware-gated).
- **at-risk / commitments / prospects / visits pages**
  (`app/admin/{at-risk,commitments,prospects,visits}/page.tsx`) and **map**
  (`app/map/page.tsx`): consume `res.json()` row arrays on success; error handling is
  status/`res.ok`-based, not body-text-based.
- **runs** (admin SPA + map): read `res.ok`/status; the 401 body change (#13/#15) is
  not surfaced.

**Conclusion:** no client reads a guard error body as load-bearing text. **No blocker.**

---

## Ordered implementation steps

> Group order: **(A) new wiring factories → (B) per-route wiring cutovers →
> (C) guard standardizations → (D) tests.** TDD: write the failing unit test for each
> new factory + each route guard FIRST (red), then implement (green).

### GROUP A — New wiring factories (mirror `lib/wiring/haccp.ts` ForCaller pattern)

**Step A1 — `lib/wiring/customers.ts`: add `customersServiceForCaller(userId)`.**
Add imports `createSupabaseCustomersRepository`, `authenticatedClientForCaller` (from
`@/lib/adapters/supabase`) and `dbTokenMinter` (from `@/lib/wiring/dbToken`). Keep the
existing `customersService` singleton (rollback parachute). Replace the
"intentionally NO …ForCaller variant here yet — deferred to F-RLS-04i" comment
(L17–19) with the live-as-of-F-RLS-04i note. Body:
```
export async function customersServiceForCaller(callerUserId: string): Promise<CustomersService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createCustomersService({ customers: createSupabaseCustomersRepository(client) });
}
```
**🗣** Adds a "cut a customers key for this person" function next to the existing
master-key one.

**Step A2 — `lib/wiring/products.ts`: add `productsServiceForCaller(userId)`.**
Same shape as A1 with `createSupabaseProductsRepository` / `createProductsService`.
Replace the deferred-comment marker (L17–19).

**Step A3 — `lib/wiring/auditLog.ts`: add `auditLogForCaller(userId)`.**
`auditLog` is a bare repository (not a service). Add:
```
export async function auditLogForCaller(callerUserId: string): Promise<AuditLogRepository> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createSupabaseAuditLogRepository(client);
}
```
Import `createSupabaseAuditLogRepository`, `authenticatedClientForCaller`,
`dbTokenMinter`. Keep `supabaseAuditLogRepository`/`auditLog` singleton. **Mechanism
confirmed:** `createSupabaseAuditLogRepository(client)` already exists
(`lib/adapters/supabase/AuditLogRepository.ts:30`) and accepts a per-caller client —
**no adapter change needed.**
**🗣** The audit-log writer gets a per-person variant so its inserted row carries the
caller's id, which the `audit_log_insert` lock requires.

**Step A4 — `lib/wiring/mapData.ts`: add `mapDataServiceForCaller(userId)`.**
`MapDataService` composes TWO DB ports (customers + visits). Mint ONCE, build BOTH
per-caller repos from the SAME client (no double mint — mirrors
`submitHaccpDailyCheckForCaller`):
```
export async function mapDataServiceForCaller(callerUserId: string): Promise<MapDataService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createMapDataService({
    customers: createSupabaseCustomersRepository(client),
    visits:    createSupabaseVisitsRepository(client),
  });
}
```
Import the two per-caller constructors + `authenticatedClientForCaller` +
`dbTokenMinter`. Keep the `mapDataService` singleton.
**🗣** The map screen needs both customers and visits under the SAME person's key, so
we cut one key and use it for both.

**Step A5 — REUSE existing factories (no new code):**
`visitsServiceForCaller` (`lib/wiring/visits.ts:53`) for at-risk/commitments/prospects;
`routesServiceForCaller` (`lib/wiring/routes.ts:60`) already consumed by runs routes.

### GROUP B — Per-route wiring cutovers

For each route: swap the imported singleton for the `…ForCaller` factory, and
**after** the guard passes, `const svc = await <factory>(caller.userId)`. The
`caller` comes from `requireRole` (Group C) — so in implementation, B and C land
together per file, but listed separately for clarity.

**Step B1 — `app/api/admin/customers/route.ts` GET:** import
`customersServiceForCaller`; `const customersService = await
customersServiceForCaller(caller.userId)` after the guard; rest unchanged
(`.listAll()` + `toListRow`). Keep singleton import removed or retained per lint
(retained is fine — it's the parachute; but unused-import lint may force removal —
**if removed, the parachute lives in the wiring file, not the route**, which is
correct).

**Step B2 — `app/api/admin/customers/[id]/route.ts` PATCH:** import
`customersServiceForCaller`; build per-caller service after guard. `geocoder` stays
(C5). Response shapes (`toRow`, `_geocoded/_approximate/_warning`) unchanged.

**Step B3 — `app/api/admin/products/route.ts` GET:** `productsServiceForCaller`.

**Step B4 — `app/api/admin/products/[id]/route.ts` PATCH:** `productsServiceForCaller`.

**Step B5 — `app/api/admin/import/confirm/route.ts` POST (THE MEATY ONE):**
Build ALL THREE per-caller after the guard:
`const customersService = await customersServiceForCaller(caller.userId)`,
`const productsService = await productsServiceForCaller(caller.userId)`,
`const auditLog = await auditLogForCaller(caller.userId)`. `geocoder` stays (C5).
- The `geocodeNewCustomers` helper calls `customersService.setCoords` (a write) — it
  must close over the **per-caller** `customersService`. Since it's a module-level
  helper today, EITHER (a) pass the per-caller `customersService` in as an argument,
  OR (b) inline its closure. Plan choice: **pass `customersService` as a parameter**
  to `geocodeNewCustomers` (smallest diff that keeps the `is_admin()` `customers_update`
  policy satisfied). The `.catch(() => {})` W1 swallow at the call site stays.
- `auditLog.record(…).catch(log)` best-effort preserved (C3/R-AUDIT).
- The `userId` used in insert payloads' `created_by` and the audit `user_id` MUST be
  `caller.userId` (the header id) — same value, now sourced from `requireRole`.
- Insert `created_by: caller.userId` + audit `user_id: caller.userId` ⇒
  `audit_log_insert` WITH CHECK (user_id = GUC) passes (GUC = caller).

**Step B6 — `app/api/admin/import/manual/route.ts` POST:** same three per-caller
builds (customers, products, auditLog). `insertOne` per-row loop unchanged.
Best-effort audit `.catch` preserved.

**Step B7 — `app/api/admin/at-risk/route.ts` GET:** swap `import { visitsService }`
→ `import { visitsServiceForCaller }`; `const visitsService = await
visitsServiceForCaller(caller.userId)` after guard. `.listAtRisk` + projection
unchanged. (Admin → `is_admin()` true → sees ALL reps — cross-rep preserved; pin in
tests, R-VIS.)

**Step B8 — `app/api/admin/commitments/route.ts` GET:** as B7 with `.listCommitments`.

**Step B9 — `app/api/admin/prospects/route.ts` GET:** as B7 with `.listProspects`.

**Step B10 — `app/api/map/data/route.ts` GET:** swap `mapDataService` →
`mapDataServiceForCaller`; build after guard; `.load({layer, window})` unchanged.

**Step B11 — `app/api/admin/geocode-all/route.ts` GET (WIRING ONLY — guard already
`requireRole`):** swap `customersService` → `customersServiceForCaller`; build after
the EXISTING `requireRole(req,['admin'])` call (capture its return:
`const caller = requireRole(req, ['admin'])`). `geocoder` stays (C5). Sequential
`setCoords` loop + summary shape unchanged.

**Step B12 — runs routes (#13/#15): NO wiring change** (already
`routesServiceForCaller`). Guard-only (Group C).

### GROUP C — Guard standardizations

For each route, replace the inline/bare check with:
```
const caller = requireRole(req, ['admin'])
```
placed as the FIRST statement inside the existing `try`. Add imports `requireRole`
(`@/lib/auth/session`) and `UnauthorizedError, ForbiddenError` (`@/lib/errors`).
In the existing `catch`, add ABOVE the generic 500 (mirror geocode-all L84–93):
```
if (err instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
if (err instanceof ForbiddenError)    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
```
(Body strings per DECISION D1.)

- **C1** customers GET (#1) — remove inline `role!=='admin'` block (L36–39).
- **C2** customers/[id] PATCH (#2) — remove inline block (L47–50); guard error
  branches added ABOVE the `{error:String(err)}` catch (C6).
- **C3** products GET (#3) — remove L35–38.
- **C4** products/[id] PATCH (#4) — remove L39–42; branches above `String(err)` catch.
- **C5** import/confirm (#5) — remove bare-userId block (L56–58); now also 403s
  non-admins.
- **C6** import/manual (#6) — remove L34–36.
- **C7** import (#7) — remove L27–29. **GUARD ONLY, no wiring** (uses `llmExtractor`,
  no DB/RLS).
- **C8/C9/C10** at-risk/commitments/prospects (#8/#9/#10) — remove bare-userId block.
- **C11** map/data (#11) — remove L25–27. Note: handler has no outer `try` around the
  guard today (the `if(!userId)` is BEFORE the `try`). Restructure so `requireRole` +
  its error mapping are inside a `try/catch`, OR map errors inline — keep the existing
  `try` for the DB read and add the guard error mapping. Minimal approach: wrap
  `requireRole` in its own try or hoist the existing try to cover it.
- **C13** runs/[id] PATCH+DELETE (#13) — remove BOTH inline `role!=='admin'` blocks
  (L25, L84) AND the now-redundant `if(!userId) 401 'Unauthorised'` (L35, L94);
  `requireRole` covers both. `routesServiceForCaller(caller.userId)` unchanged.
- **C14** admin/visits (#14) — remove bare-userId (L38–40); `visitsServiceForCaller(caller.userId)`.
- **C15** admin/runs (#15) — remove bare-userId 'Unauthorised' (L25);
  `routesServiceForCaller(caller.userId)`.
- **C-geocode** geocode-all (#12) — already `requireRole`; just capture
  `const caller =` for B11.

**No-reformat rule:** touch only the guard + wiring lines + the one helper-signature
change in import/confirm (B5). Do NOT re-indent surrounding blocks. The existing files
have irregular indentation on the guard blocks (e.g. customers GET L36 is
2-space-indented inside a 4-space body) — when removing those blocks, leave
neighbouring lines untouched; declare any unavoidable re-indent in the PR.

### GROUP D — Tests (see ANVIL matrix). Land all new test files WITH the code on the
feature branch BEFORE the squash-merge.

---

## ANVIL test matrix (depth: EXHAUSTIVE — locked)

```
ANVIL · F-RLS-04i admin-context RLS
  Unit          ○  guard (401/403/200) + byte-shape + ForCaller factory + forged-header
  Integration   ○  per-route round-trips · import admin round-trip · cross-rep visibility
  DB / RLS      ○  NEW pgTAP 016-rls-admin-context (customers/products/audit_log)
  E2E @critical ○  75 specs + exhaustive admin every-button browser sweep
  🗣 every rung green before ship — RLS finale, no silent narrowing allowed
```

### Unit (`tests/unit/api/…`, Vitest — invoke handlers directly, mock wiring)

Mirror `tests/unit/api/haccp-route-guards.route.test.ts`. NEW
`tests/unit/api/admin-context-route-guards.route.test.ts`:
- **U1 (guard matrix)** per route #1–#15: (a) absent `x-mfs-user-id`/role → exact
  401 body; (b) non-admin role header → exact 403 body; (c) admin header → handler
  reaches the mocked service (200/201) AND the `…ForCaller` mock was awaited with the
  **header** userId. For #12 the guard already existed — assert unchanged.
- **U2 (forged-header / R-SEC-1)** — an admin **cookie** paired with a non-admin
  **header** must be REFUSED (the guard reads headers, not cookies). Also: absent
  role header → 401 (no privilege escalation). One representative route per group.
- **U3 (byte-identical response shape)** per route: admin happy-path response keys +
  values are byte-identical to pre-cutover (snapshot the exact projection — e.g.
  customers GET 7-field array; products/[id] PATCH 5-field subset; import returns
  `{inserted,skipped}` 201; map/data `{customers,visits}`; at-risk
  `{rows:[{id,customer,outcome,rep,hoursAgo,reason}]}` etc.). Reuse the F-20/F-21
  shape-pinning style.
- **U4 (ForCaller factory tests)** new `tests/unit/wiring/…` (or extend existing): for
  each of `customersServiceForCaller`, `productsServiceForCaller`, `auditLogForCaller`,
  `mapDataServiceForCaller` — assert it mints a token for the given userId and builds
  a per-caller client (mock `dbTokenMinter.mint` + `authenticatedClientForCaller`,
  assert called with the minted token; assert NOT memoized — two calls = two mints).
  `mapDataServiceForCaller` asserts a SINGLE mint feeding BOTH ports.
- **U5 (import/confirm geocode helper)** — `geocodeNewCustomers` writes via the
  per-caller customers service (assert the per-caller service's `setCoords` is the one
  called); the `.catch(()=>{})` W1 swallow still returns 201 on a thrown geocode.
- **U6 (import audit best-effort, R-AUDIT)** — `auditLog.record` throwing
  `ServiceError` does NOT change the 201 (the `.catch(log)` swallows it).

### Integration (`npm run test:integration` — real local Supabase, booted server
through REAL middleware → header → minted token → GUC → live RLS)

- **I1** per-route admin round-trip with read-back: e.g. customers GET returns seeded
  customers; customers/[id] PATCH toggles active + reads back; products likewise;
  map/data returns geocoded customers+visits; runs/at-risk/commitments/prospects/visits
  return rows.
- **I2 (import admin round-trip — THE meaty one)** POST import/confirm as admin:
  assert customer + product rows are inserted (read back) AND an `audit_log` row
  exists with `user_id = admin caller id` (proves the `authenticated` role wrote it
  with GUC=caller, passing `audit_log_insert` WITH CHECK). Repeat for import/manual.
- **I3 (cross-rep visibility, R-VIS)** seed visits owned by ≥2 different reps; call
  at-risk/commitments/prospects/admin-visits/map as **admin** → assert ALL reps' rows
  are returned (NOT silently narrowed to the admin's own user_id). This is the headline
  regression guard.
- **I4 (negative RLS)** if a non-admin token could reach a write path (it can't via
  middleware, but assert defense-in-depth): a non-admin `authenticated` caller is
  denied the customers/products INSERT/UPDATE (the route 403s before the DB; pin the
  route-level refusal in U1, and the DB-level refusal in pgTAP below).

### DB / RLS (pgTAP — `supabase/tests/`)

**Finding:** there is **NO existing pgTAP suite for `customers`/`products`/`audit_log`**
(the import audit table). `006-rls-audit-log.test.sql` covers a DIFFERENT table
(`order_audit_log`, trigger-based). `014-rls-visits.test.sql` covers visits. So:
- **P1 — ADD `supabase/tests/016-rls-admin-context.test.sql`** (next free number,
  mirror `014-rls-visits` structure; GRANT the tables to `authenticated` in-test like
  006 does at L15–17, then `SET LOCAL ROLE authenticated`):
  - admin GUC: can `SELECT` customers/products (presence policy) and `INSERT`/`UPDATE`
    (is_admin() true).
  - non-admin GUC (e.g. sales): can `SELECT` customers/products (presence policy
    allows any authed) but `INSERT`/`UPDATE` is REJECTED with `42501`.
  - absent/empty GUC: `SELECT` REJECTED (fail-closed — presence policy `<> ''`).
  - `audit_log` INSERT as caller (user_id = GUC) PASSES; INSERT with user_id ≠ GUC
    REJECTED `42501`; `audit_log` SELECT only as admin (is_admin()).
- **P2 — extend `014-rls-visits` OR add to 016:** admin GUC sees visits of ANOTHER
  rep (cross-rep, mirrors I3 at the DB layer); non-admin sees only own.

### E2E `@critical` (`npm run test:e2e:preview -- <preview-url> --unprotected`)

- **E1** full 75-spec `@critical` suite on the prod-build preview, readiness-gated on
  `/api/auth/team`=200 (NOT `/login`).
- **E2 (exhaustive admin browser-tap sweep — locked)** log in as a real admin against
  the preview and walk EVERY admin screen, verifying each loads + acts correctly under
  live per-caller RLS:
  customers (list + toggle active + edit postcode) · products (list + toggle) ·
  dashboard · at-risk · commitments · prospects · admin/visits (with rep/type/outcome
  filters) · import (AI extract → preview → confirm; manual column-map → confirm; check
  an `audit_log` row lands) · map (/map screen renders pins) · runs (list + PATCH
  status + DELETE). Confirm cross-rep data is visible to the admin (not narrowed).
  **🗣** This is the "press every button as a real admin" sweep — the blast radius
  (every admin route's auth + DB path changing) earns it; a silent RLS narrowing would
  show up here as an empty/short list.

---

## Acceptance criteria

1. All 15 in-scope routes use `requireRole(req, ['admin'])` (or already did, #12);
   ZERO inline `role!=='admin'` or bare-`x-mfs-user-id`-existence guards remain in the
   in-scope set.
2. Routes #1–#11 reach the DB exclusively through `…ForCaller(caller.userId)`
   factories; ZERO service-role singleton DB calls remain in those route bodies.
   Routes #13–#15 already per-caller (unchanged). Route #7/#12 wiring per plan.
3. Routes import ZERO adapters; `…ForCaller` factories live only in `lib/wiring/**`
   (`no-adapter-imports` lint green).
4. Every admin happy-path response is BYTE-IDENTICAL to pre-cutover (U3 snapshots).
5. An admin import round-trips: customer/product inserts + an `audit_log` row with
   `user_id = caller` land through the `authenticated` role (I2 + P1).
6. Cross-rep visibility preserved: admin sees ALL reps' visits in
   at-risk/commitments/prospects/visits/map (I3 + P2) — NOT narrowed.
7. Forged/absent-role header is refused with no privilege escalation (U2 + P1
   negative cases).
8. New pgTAP `016-rls-admin-context.test.sql` green; full unit + integration suites
   green; `@critical` 75/75 first-run; exhaustive admin browser sweep clean.
9. Service-role singletons retained in every wiring file (rollback parachutes).
10. No migration added; no `package.json` change; no-reformat rule honoured (declare
    any unavoidable re-indent).

---

## Rip-out test statement

**"If I replace Supabase tomorrow for the admin-context surface, how many files
change?"** One new adapter folder (`lib/adapters/<vendor>/` implementing
`CustomersRepository`, `ProductsRepository`, `AuditLogRepository`, `VisitsRepository`)
+ the wiring lines in `lib/wiring/{customers,products,auditLog,mapData,visits,routes}.ts`.
The 15 routes, the services, and `lib/domain` are untouched. The `…ForCaller`
factories add per-caller construction but introduce NO new vendor surface (they reuse
the existing per-caller adapter constructors + `authenticatedClientForCaller`).
**Rip-out test: PASS.**

**No new dependency.** All machinery (`dbTokenMinter`, `authenticatedClientForCaller`,
the four per-caller adapter constructors) pre-exists and is wrapped behind the wiring
boundary. **Hexagonal verdict: PASS** (no unjustified/unwrapped dep, rip-out PASS).

---

## Risk Assessment

### R-VIS — Silent cross-rep narrowing (business-logic flaw) — **SEVERITY: HIGH — MUST-FIX (mitigated by test)**
The whole point of admin analytics (at-risk/commitments/prospects/visits/map) is that
an admin sees EVERY rep's rows. The visits RLS policy is `USING (user_id = GUC OR
is_admin())`. If `is_admin()` does NOT evaluate true for the admin caller (e.g. the GUC
isn't set, the token claim is wrong, or the admin's users-row role isn't `admin`), the
policy silently narrows to `user_id = GUC` and the admin sees ONLY their own (likely
zero) rows — a **silent data-loss-shaped bug**, not an error.
**Mitigation (must-fix as a test gate):** I3 (integration, multi-rep seed) + P2
(pgTAP cross-rep) MUST prove an admin sees another rep's rows. Acceptance criterion 6.
**🗣** The danger isn't a crash — it's the admin dashboard quietly going empty because
the lock decided they're "just a rep". The cross-rep test is the tripwire; it is
mandatory.

### R-AUDIT — Import audit write now fail-closes (data-integrity / behaviour) — **SEVERITY: MEDIUM — MUST-FIX (preserve best-effort)**
Today the import audit insert bypasses RLS (service-role) and any failure is swallowed
(`.catch(log)`), so a succeeded import always returns 201. After cutover the per-caller
insert runs under RLS (`audit_log_insert` WITH CHECK user_id=GUC). If `created_by`/
`user_id` ever drifts from `caller.userId`, the insert throws — and if the `.catch`
were dropped, a successful import would start returning 500.
**Mitigation:** preserve the `await auditLog.record(…).catch(log)` verbatim (C3); pin
with U6. Use `caller.userId` for BOTH `created_by` and audit `user_id` so the WITH
CHECK passes. I2 proves the row lands.
**🗣** Don't let bookkeeping (the audit row) sink a real import that already worked.
Keep the "log-and-move-on" wrapper.

### R-SEC — Guard standardization must not open or escalate (security) — **SEVERITY: MEDIUM — MUST-FIX (forged-header test)**
The import routes (#5/#6/#7) currently have NO role check (only bare-id existence).
Adding `requireRole(['admin'])` TIGHTENS them — good — but the new error mapping must
not accidentally let a forged header through, and the `requireRole` secondary-role
"ghost admin" filter (session.ts:92–94) must be exercised.
**Mitigation:** U2 forged-header test (admin cookie + non-admin header → refused) +
absent-role → 401; P1 negative pgTAP. Middleware already gates the paths; the route
guard is defense-in-depth.
**🗣** We're adding locks, not removing them — but prove the new lock can't be picked
with a faked header.

### R-IDENTITY — Per-caller client must never be memoized (concurrency / security) — **SEVERITY: MEDIUM**
A memoized per-caller client would leak one admin's identity to the next request's
caller. The factory pattern mints fresh per call; the risk is an implementer
"optimizing" by caching.
**Mitigation:** U4 asserts two calls = two mints (no memoization); the wiring-file
doc comment states NEVER memoize (copy from haccp.ts). Not a must-fix beyond the test
since the template is correct, but flagged HIGH-visibility.
**🗣** Each request gets a freshly-cut key; reusing a key between people would be an
identity leak. The test forbids caching.

### R-GEOCODE-WRITE — import/confirm geocode write must run per-caller (business-logic) — **SEVERITY: MEDIUM**
`geocodeNewCustomers` writes `setCoords` (a `customers_update`, gated by `is_admin()`).
If it keeps closing over the service-role `customersService` it would still work (master
key) — but that leaves a service-role DB call in the route, violating acceptance
criterion 2; if it uses a per-caller service built from a NON-admin caller it would be
denied. Since the route is admin-only, the per-caller admin write passes.
**Mitigation:** pass the per-caller `customersService` into the helper (B5/C4); U5
asserts the per-caller service is the one writing. The W1 `.catch(()=>{})` swallow stays
so a geocode failure never flips the 201.
**🗣** The "fill in map coordinates" background step also has to use the per-person key,
or we'd leave a master-key call hiding in the route.

### R-NOMIGRATION — confirmed no migration / data-migration risk — **SEVERITY: NONE**
All policies + GRANTs pre-exist (RLS pre-flight). No schema change, no data backfill,
no PITR gate. **No material data-migration risk.**

### Concurrency / race conditions — **no material risk** beyond R-IDENTITY (per-request
factory is stateless; no shared mutable state introduced).

### Launch blockers
The MUST-FIX gates are **R-VIS** (cross-rep test green), **R-AUDIT** (best-effort
preserved + audit row lands), and **R-SEC** (forged-header refused). All three are
satisfied by tests enumerated in the ANVIL matrix; none requires new product code
beyond the planned cutover. **No unresolved launch blocker** — the must-fix items are
test-gated, not design-blocked. If I3/P2 (cross-rep) cannot be made green, STOP and
re-examine `is_admin()` GUC propagation before shipping.

---

## Files touched

**Wiring (4 edited, factories added):**
- `lib/wiring/customers.ts` · `lib/wiring/products.ts` · `lib/wiring/auditLog.ts` ·
  `lib/wiring/mapData.ts`

**Routes (13 edited):**
- `app/api/admin/customers/route.ts` · `app/api/admin/customers/[id]/route.ts`
- `app/api/admin/products/route.ts` · `app/api/admin/products/[id]/route.ts`
- `app/api/admin/import/confirm/route.ts` · `app/api/admin/import/manual/route.ts` ·
  `app/api/admin/import/route.ts`
- `app/api/admin/at-risk/route.ts` · `app/api/admin/commitments/route.ts` ·
  `app/api/admin/prospects/route.ts`
- `app/api/map/data/route.ts` · `app/api/admin/geocode-all/route.ts`
- `app/api/admin/runs/[id]/route.ts` · `app/api/admin/runs/route.ts`
- `app/api/admin/visits/route.ts`

**Tests (new/extended):**
- `tests/unit/api/admin-context-route-guards.route.test.ts` (new)
- `tests/unit/wiring/*` ForCaller factory tests (new or extended)
- `tests/unit/api/*` byte-shape tests (extend existing per-route or new)
- integration specs under `tests/integration/**` (per-route + import + cross-rep)
- `supabase/tests/016-rls-admin-context.test.sql` (new pgTAP)
- E2E: existing `@critical` suite + admin browser sweep

**No adapter, domain, port, or migration file is edited.**
