# F-14 — Delivery Routes domain (hexagonal extraction)

**Date:** 2026-06-17
**Unit:** F-14 (Delivery Routes domain)
**Type:** Two-PR hexagonal extraction (INTRODUCE → RE-POINT). Touches prod route code → FULL FORGE + ANVIL.
**Planner:** forge-planner (Phase 2 — Order). Gate 1 spec is locked; this is the execution plan.

🗣 In plain English: the delivery-routes feature currently talks straight to the database from inside its web handlers. We are going to slide an owned "translator" layer in between, exactly the way we already did for Orders and Users, so that swapping the database later is a one-file job. Nothing the driver or dispatcher sees on screen changes.

---

## Visual mini-map

```
DOMAIN (core logic)
  └─ RoutesRepository (port) → [Supabase]  (adapter)
     • RoutesService owns: 7pm rollover · Mon–Sun week boundary · atomic header+stops replace
     • wiring/routes.ts: routesService singleton (parachute) + routesServiceForCaller (ready, UNUSED)
🗣 one new socket for Routes; one plug (Supabase) in it — rip out Supabase = swap the one plug
```

---

## 1. Goal

Extract the Delivery Routes feature into the hexagonal shape: an owned domain model (`Route` / `RouteStop`), an owned port (`RoutesRepository`), a Supabase adapter, a service that owns the business logic, and a composition root. Then re-point the 5 in-scope API routes through the service so they stop importing the Supabase SDK directly.

🗣 In plain English: today the 5 web handlers for routes each reach into the database themselves. After F-14 they ask one in-house "routes desk" (the service) to do the work, and only one back-office file (the adapter) knows it is Supabase. The feature behaves identically; only the plumbing changes.

**Hard constraints (locked at Gate 1):**
- PR1 is **introduce-only**: no route edited, no behaviour change, **no migration**, **no new dependency**. Nothing in production calls the new engine yet.
- PR2 is **re-point only**: behaviour **byte-identical**, **no migration**. The JSON each endpoint returns must match field-for-field what it returns today.
- **Out of scope this pass** (do NOT touch — state explicitly): `app/api/routes/optimise/route.ts`, `app/api/routes/compute-road-times/route.ts` (Google Routes v2 + postcodes.io stay service-role + raw fetch — the routing brain is untouched); `app/api/routes/customers/route.ts`, `app/api/routes/customers/[id]/route.ts`, `app/api/routes/users/route.ts` (those belong to the Customers/Users domains); **F-24** (Map provider) and **F-RLS-04c** (Routes RLS policies) are separate later passes.

🗣 In plain English: we are deliberately leaving the route-optimiser and the map untouched. They are their own jobs for another day. Touching them now would balloon the change and blur the test surface.

---

## 2. Domain terms (with plain-English bridge)

- **Port** = `lib/ports/RoutesRepository.ts` — the interface the app owns describing route persistence in business terms. 🗣 The socket shape our routes logic insists on; Supabase has to fit it.
- **Adapter** = `lib/adapters/supabase/RoutesRepository.ts` — the only file that imports `@supabase/*` for Routes; maps DB snake_case ↔ domain camelCase. 🗣 The actual Supabase plug for that socket.
- **Service** = `lib/services/RoutesService.ts` — owns the business decisions (7pm rollover, week boundary, atomic replace). 🗣 The routes desk that knows the rules, not where the filing cabinet lives.
- **Wiring / composition root** = `lib/wiring/routes.ts` — the one business-layer file allowed to import adapters; bolts the Supabase adapter to the service and exports ready-to-use singletons. 🗣 The patch panel that connects the desk to the real filing cabinet.
- **Aggregate `RouteWithStops`** = a `Route` header plus its ordered `RouteStop[]` returned together. 🗣 A route folder with all its delivery-stop pages clipped inside — you fetch and save the whole folder, never a loose page.
- **7pm rollover** = after 19:00 UK time, a driver's "today's route" query rolls forward to tomorrow. 🗣 At 7pm the driver app stops showing today's finished run and starts showing tomorrow's, even if nobody clicked "done".
- **Mon–Sun week boundary** = the admin runs list defaults to the current UK week, Monday to Sunday. 🗣 "This week" means Monday-start, not a rolling 7 days.

---

## 3. Compliance / security flags

- **No PII change, no auth-model change.** Routes carry `assigned_to` / `created_by` user FKs but no new sensitive fields. PR2 keeps the exact same service-role posture the routes use today (service-role key, RLS bypassed). The `authenticated`-role cutover is F-RLS-04c, NOT this pass.
- **RLS is enabled on `routes` / `route_stops` with NO policies yet.** With service-role (the parachute singleton), RLS is bypassed, so reads/writes work exactly as today. Do NOT add policies in F-14. 🗣 In plain English: the tables have a lock fitted but no key cut yet; the master key (service-role) opens them regardless, which is the current behaviour — we keep that and cut the real keys in a later unit.
- **`routesServiceForCaller` is built but UNUSED** this pass (it would route through the `authenticated` role and RLS would block everything because no policies exist). It ships ready with a comment: `// wired here for F-RLS-04c Routes RLS cutover`. 🗣 We pre-install the second socket now so the RLS unit is a one-line flip later, but we do not plug anything into it yet.

---

## 4. ADR-0002 conflicts / risks surfaced

**No hard conflict. Two design rules to actively satisfy (not violate):**

1. **The depth rule (ADR-0002, "The depth rule").** Port methods must be *business operations*, not 1:1 vendor calls. A naive `RoutesRepository` would be a shallow mirror of `.from('routes').select(...)`. **Mitigation:** each method hides a non-trivial decision — the stop-ordering join + position sort, the atomic header+delete+insert replace, the `stop_count` aggregation, the rollover date filter. The two reads that are "just a filtered select" (`getRouteById`, `listRoutes`) earn depth by hiding the **two-table embedded join + per-route position sort + vendor→domain mapping**, exactly as `OrdersRepository.findOrderById` does. This is the established precedent in the codebase; code-critic accepted it for Orders. 🗣 In plain English: a port method has to *do something worth hiding*. Ours each hide a join, a sort, an aggregation, or a multi-step write — none is a bare passthrough.
2. **Vendor types never cross the boundary (ADR-0002 line 27).** The adapter maps every snake_case column to a camelCase domain field and maps Postgres error codes to app-owned errors **inside the adapter**. 🗣 The database's spelling and error numbers stop at the adapter door.

**No `lib/domain/**` or `lib/ports/**` → `lib/adapters/**` import.** Service depends on the port only. Wiring is the only adapter-importer. Enforced by `.eslintrc.json` + pinned by `tests/unit/lint/no-adapter-imports.test.ts`.

---

## 5. Resolved design decisions (the questions Gate 1 handed the planner)

### 5.1 Aggregate shape — Decision: `RouteWithStops` (combined), plus a lightweight `RouteSummary` for the list
- **`Route`** = header fields only (camelCase domain type).
- **`RouteStop`** = one stop (camelCase).
- **`RouteWithStops`** = `Route` + `readonly RouteStop[]` (already position-sorted by the adapter). Returned by `getRouteById` and `getNextRouteForUser` and each element of `listRoutes` — because every one of those endpoints today returns the route header **with its embedded `route_stops` array**. Keeping them combined keeps GET/[id] hydration and the PUT replace clean (you hand the whole folder in, you get the whole folder back).
- **`RouteSummary`** = the admin/runs lightweight row: header fields **minus** the stops array, **plus** `stopCount: number` and a trimmed `assignee`. This is a *distinct* shape because admin/runs deliberately drops the full stops array and adds an aggregated count — modelling it as `RouteWithStops` would force the adapter to ship every stop just to count them.

🗣 In plain English: two read shapes by design — the full folder (header + every stop) for the screens that draw the map, and a thin index card (header + how-many-stops) for the weekly runs table. Same split logic the Users domain used (UserSummary vs UserCredential).

Decision rationale (design-it-twice): the alternative — one `RouteWithStops` everywhere and let admin/runs count `.stops.length` in the service — was rejected because it makes the adapter over-fetch every stop row for the weekly list (could be hundreds of rows across a week) purely to throw them away. A dedicated `listRouteSummaries` lets the adapter ask Postgres for an embedded `route_stops(id)` count only.

### 5.2 Where the 7pm rollover + week boundary live — Decision: the SERVICE (confirmed)
- The 7pm-rollover math **already lives in a unit-tested util**: `lib/utils/ukDateAndHour.ts` (`getUKDateAndHour`, `getEffectiveMinDate`). The week-boundary math currently lives inline in `app/api/admin/runs/route.ts` (`getUKWeekBounds`).
- **Plan:** the `RoutesService` owns these as business decisions. `getNextRouteForUser` computes `effectiveMinDate` via the existing util and passes a **plain date string** to the repository. `listWeekRuns` computes Mon–Sun bounds (move `getUKWeekBounds` logic into the service — or into `lib/utils/ukDateAndHour.ts` as `getUKWeekBounds()` to sit beside its sibling and stay unit-testable) and passes plain `from`/`to` strings to the repository.
- The **repository never computes a date** — it receives `effectiveMinDate` / `from` / `to` as inputs and applies them as filters. 🗣 In plain English: deciding *what counts as "today" or "this week"* is a business rule and lives in the service; the adapter just runs the filter it's handed. This keeps the rollover/week logic unit-testable with a Fake repo and no clock-in-the-database.
- **Recommendation (flag, not blocker):** lift `getUKWeekBounds` out of the route into `lib/utils/ukDateAndHour.ts` so both UK-time helpers sit together and both get unit tests. If reviewers prefer to keep it inside the service file, that is also acceptable — either way it must NOT stay inline in the route after PR2.

### 5.3 The atomic PUT (header update → delete stops → insert stops) — Decision: ONE repository method (mirror `OrdersRepository.updateOrder`)
- **Precedent:** `OrdersRepository.updateOrder(id, patch, lineReplacement?)` is ONE method that hides the two-table "delete all order_lines then insert new ones" replace (ADR-0002 design-it-twice note in `lib/ports/OrdersRepository.ts:248-255` — option (A) "one method with optional lineReplacement", chosen because the two operations are one user action and splitting forces the caller to handle partial success).
- **F-14 mirrors this exactly:** `replaceRoute(id, header, stops)` is ONE repository method that does: update `routes` header → delete `route_stops` where `route_id = id` → insert the new stops. The current route's **delete-then-insert ordering and partial-failure semantics** (header always saved; on stop-delete or stop-insert failure the route is left correctable, with the existing error messages) are preserved **inside the adapter**.
- The `UNIQUE(route_id, position)` constraint is honoured because the delete fully clears the old stops before the insert — same as today.
- **Service** exposes `saveRoute(id, input)`; it does no DB orchestration itself — it validates/maps and calls `repo.replaceRoute`. The multi-step write is hidden in the adapter (depth rule satisfied; matches Orders). 🗣 In plain English: editing a route is one click for the dispatcher, so it's one method for us — the adapter clears the old stops and writes the new ones in the right order behind the curtain, exactly like editing an order's lines already does.

### 5.4 `stop_count` aggregation on admin/runs — Decision: adapter computes it, returns it on `RouteSummary`
- Today the route selects embedded `route_stops (id)` then does `.length` in JS. **Plan:** the adapter's `listRouteSummaries(from, to)` selects `route_stops(id)` embedded, computes `stopCount = rows.length` **inside the adapter**, and returns `RouteSummary` objects carrying `stopCount`. The vendor's embedded-array shape never crosses the port. 🗣 In plain English: the "how many stops" number is worked out in the back office (adapter) and handed over as a plain number on the index card; the caller never sees Supabase's nested-array shape.

### 5.5 POST create — Decision: `createRoute(header, stops)` repository method with rollback (mirror `createOrder`)
- Today: insert `routes` → insert `route_stops` → on stop failure, delete the route row (rollback). **Plan:** `createRoute` is ONE repository method hiding the two-step insert + rollback, mirroring `OrdersRepository.createOrder`'s "orders row first, then lines, rollback on line failure" (`lib/adapters/supabase/OrdersRepository.ts:386-490`). Status is set to `'active'` on create (matching today's literal). 🗣 In plain English: saving a brand-new route is one method that writes the header, then the stops, and undoes the header if the stops fail — the same safety dance order-creation already does.

### 5.6 NO migration, NO new dependency — CONFIRMED
- Tables `routes` / `route_stops` already exist with the columns listed in the spec. F-14 changes **zero** schema. No policy added (that's F-RLS-04c).
- No new npm package: the adapter uses the existing `@supabase/supabase-js` already in `package.json`; the service uses the existing `lib/utils/ukDateAndHour.ts` and `lib/errors`. 🗣 In plain English: no database change and no new third-party library — purely re-shaping code we already have. **If the implementer discovers any reason a migration or dep is needed, STOP and escalate to the conductor — do not add one silently.**

---

## 6. Exact files to change

### PR1 — INTRODUCE (new files only; no route edited)
| File | Action | Layer |
|---|---|---|
| `lib/domain/Route.ts` | **new** — `Route`, `RouteStop`, `RouteWithStops`, `RouteSummary`, `CreateRouteInput`, `SaveRouteInput`, 3 enums | domain |
| `lib/domain/index.ts` | **edit** — re-export the new types | domain barrel |
| `lib/ports/RoutesRepository.ts` | **new** — the port interface (§7) | port |
| `lib/ports/index.ts` | **edit** — re-export `RoutesRepository` + option types | ports barrel |
| `lib/ports/__contracts__/RoutesRepository.contract.ts` | **new** — shared contract suite both adapters pass | port contract |
| `lib/adapters/supabase/RoutesRepository.ts` | **new** — `createSupabaseRoutesRepository(client)` + `supabaseRoutesRepository` singleton | adapter |
| `lib/adapters/supabase/index.ts` | **edit** — export factory + singleton | adapter barrel |
| `lib/adapters/fake/RoutesRepository.ts` | **new** — in-memory twin, passes the contract | fake adapter |
| `lib/adapters/fake/index.ts` | **edit** — export factory + singleton | fake barrel |
| `lib/services/RoutesService.ts` | **new** — `createRoutesService({ routes })` factory; owns rollover + week-boundary + save orchestration | service |
| `lib/services/index.ts` | **edit** — export factory + `RoutesService` type | services barrel |
| `lib/wiring/routes.ts` | **new** — `routesService` singleton + `routesServiceForCaller` (ready, UNUSED) | wiring |
| `lib/utils/ukDateAndHour.ts` | **edit (recommended, §5.2)** — add `getUKWeekBounds()` | util |

### PR2 — RE-POINT (edit the 5 in-scope routes; behaviour byte-identical)
| File | Action |
|---|---|
| `app/api/routes/route.ts` | **edit** — POST→`routesService.createRoute`; GET→`routesService.listRoutes`; drop `@supabase/*` import |
| `app/api/routes/[id]/route.ts` | **edit** — GET→`getRouteById`; PUT→`saveRoute`; drop `@supabase/*` import |
| `app/api/routes/today/route.ts` | **edit** — GET→`getNextRouteForUser`; drop `@supabase/*` import (keep importing the UK-time util OR let the service own it) |
| `app/api/admin/runs/route.ts` | **edit** — GET→`listWeekRuns`; drop `@supabase/*` import |
| `app/api/admin/runs/[id]/route.ts` | **edit** — PATCH→`setRouteStatus`; DELETE→`deleteRoute`; drop `@supabase/*` import |

**Do NOT edit (state explicitly):** any UI file (`app/routes/page.tsx`, `app/runs/page.tsx`, `components/RouteMap.tsx`, `components/MapView.tsx`, `components/MapTabContent.tsx`, `components/RunsContent.tsx`), `app/api/routes/optimise/route.ts`, `app/api/routes/compute-road-times/route.ts`, `app/api/routes/customers/**`, `app/api/routes/users/route.ts`. No migration files.

---

## 7. The `RoutesRepository` port signature (full)

Every method maps 1:1 to a PR2 endpoint operation (none is speculative; if one ends up with no consumer, delete it — same discipline as `UsersRepository`).

```ts
// lib/ports/RoutesRepository.ts

export interface ListRoutesFilter {
  /** When set, only routes with this planned_date (YYYY-MM-DD). */
  readonly plannedDate?: string;
  /** When set, only routes assigned to this user id. */
  readonly assignedTo?: string;
  /** When true, ignore plannedDate entirely (the ?all=true case). */
  readonly all: boolean;
}

export interface RoutesRepository {
  // ─── Reads ──────────────────────────────────────────────────

  /** List full routes (header + ordered stops + assignee/creator/customer
   *  joins) for the filter. Stops are returned position-sorted ascending.
   *  Hides the two-table embedded join + per-route sort + vendor mapping.
   *  → app/api/routes GET.  @throws ServiceError on DB failure. */
  listRoutes(filter: ListRoutesFilter): Promise<readonly RouteWithStops[]>;

  /** Fetch one full route (header + ordered stops + joins) by id.
   *  Null on miss (define errors out of existence — route maps null→404).
   *  → app/api/routes/[id] GET.  @throws ServiceError on DB failure. */
  getRouteById(id: string): Promise<RouteWithStops | null>;

  /** The chronologically NEXT active/draft route for a user, on or after
   *  `minDate`, ordered planned_date asc then departure_time asc, limit 1.
   *  Null on none. `minDate` is computed by the SERVICE (7pm rollover) —
   *  the repo only filters. → app/api/routes/today GET.
   *  @throws ServiceError on DB failure. */
  getNextRouteForUser(
    userId: string,
    minDate: string,
  ): Promise<RouteWithStops | null>;

  /** Lightweight route rows for [from,to] (inclusive), ordered
   *  planned_date asc then departure_time asc, each carrying an
   *  adapter-computed stopCount and trimmed assignee. The bounds are
   *  computed by the SERVICE. → app/api/admin/runs GET.
   *  @throws ServiceError on DB failure. */
  listRouteSummaries(
    from: string,
    to: string,
  ): Promise<readonly RouteSummary[]>;

  // ─── Writes ─────────────────────────────────────────────────

  /** Create a route header + its stops in one call. Inserts the routes
   *  row, then the route_stops; on stop-insert failure rolls back the
   *  route row (mirrors createOrder). Returns the created header summary
   *  (id + the fields the POST response echoes). → app/api/routes POST.
   *  @throws ServiceError on DB failure. */
  createRoute(input: CreateRoutePersist): Promise<CreatedRoute>;

  /** Replace a route entirely: update the header → delete all existing
   *  route_stops for the id → insert the new stops. ONE method (mirrors
   *  updateOrder's lineReplacement). Preserves delete-then-insert order
   *  so UNIQUE(route_id,position) never collides. Partial-failure
   *  semantics: header is saved first; a stop-delete or stop-insert
   *  failure throws ServiceError with the same human message shape the
   *  route returns today. → app/api/routes/[id] PUT.
   *  @throws ServiceError on DB failure. */
  replaceRoute(id: string, input: SaveRoutePersist): Promise<void>;

  /** Update only a route's status (draft|active|completed). Returns the
   *  trimmed row the PATCH response echoes (id,name,planned_date,status),
   *  or null if no row matched id. → app/api/admin/runs/[id] PATCH.
   *  @throws ServiceError on DB failure. */
  setRouteStatus(
    id: string,
    status: RouteStatus,
  ): Promise<RouteStatusRow | null>;

  /** Permanently delete a route by id (route_stops cascade). Idempotent
   *  — deleting a missing id is not an error. → app/api/admin/runs/[id]
   *  DELETE.  @throws ServiceError on DB failure. */
  deleteRoute(id: string): Promise<void>;
}
```

**`RoutesService` interface** mirrors these 1:1, but `getNextRouteForUser(userId, atTime?)` takes the **time** (computing `minDate` internally via `getEffectiveMinDate`) and `listWeekRuns(from?, to?)` defaults the bounds via `getUKWeekBounds()`. The service methods that are pure passthroughs (`listRoutes`, `getRouteById`, `createRoute`, `saveRoute`, `setRouteStatus`, `deleteRoute`) delegate straight to the port; the two date-aware methods own the date math.

🗣 In plain English: the port speaks in plain dates ("on or after this date", "between these two dates") so the database adapter never has to know what time it is. The service is the only place that knows "after 7pm = tomorrow" and "this week = Mon–Sun".

---

## 8. Domain type definitions (`lib/domain/Route.ts`)

```ts
export type RouteStatus = "draft" | "active" | "completed";
export type RouteEndPoint = "mfs" | "ozmen_john_street";
export type StopPriority = "none" | "urgent" | "priority";

/** A delivery route header (camelCase domain shape). */
export interface Route {
  readonly id: string;
  readonly name: string | null;
  readonly plannedDate: string;            // YYYY-MM-DD
  readonly assignedTo: string | null;      // user id
  readonly createdBy: string | null;       // user id
  readonly departureTime: string;          // HH:MM(:SS)
  readonly endPoint: RouteEndPoint;
  readonly status: RouteStatus;
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly googleMapsUrl: string | null;
  readonly createdAt: string;              // ISO-8601
  /** Embedded join — present on full reads (listRoutes/getRouteById/today). */
  readonly assignee: RoutePerson | null;
  readonly creator: RoutePerson | null;    // creator join only present where today selects it
}

/** A trimmed person reference from a users join. */
export interface RoutePerson {
  readonly id: string;
  readonly name: string;
  readonly role?: string;                  // assignee carries role; creator does not
}

/** A customer reference embedded on a stop. */
export interface StopCustomer {
  readonly id: string;
  readonly name: string;
  readonly postcode: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** One stop on a route (camelCase domain shape). */
export interface RouteStop {
  readonly id: string;
  readonly position: number;               // 1-based
  readonly priority: StopPriority;
  readonly lockedPosition: boolean;
  readonly priorityNote: string | null;
  readonly estimatedArrival: string | null;
  readonly driveTimeFromPrevMin: number | null;
  readonly distanceFromPrevKm: number | null;
  readonly visited: boolean;
  readonly customer: StopCustomer | null;
}

/** A route header WITH its ordered stops — the full read aggregate. */
export interface RouteWithStops extends Route {
  readonly stops: readonly RouteStop[];
}

/** The lightweight admin-runs row: header-ish fields + a count, no stops. */
export interface RouteSummary {
  readonly id: string;
  readonly name: string | null;
  readonly plannedDate: string;
  readonly departureTime: string;
  readonly status: RouteStatus;
  readonly endPoint: RouteEndPoint;
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly assignee: RoutePerson | null;
  readonly stopCount: number;
}

/** Service-facing create input (what a POST body becomes). */
export interface CreateRouteInput {
  readonly name: string | null;
  readonly plannedDate: string;
  readonly assignedTo: string;
  readonly createdBy: string;              // from x-mfs-user-id
  readonly departureTime: string;
  readonly endPoint: RouteEndPoint;
  readonly stops: readonly StopInput[];
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly googleMapsUrl: string | null;
}

/** Service-facing save/replace input (what a PUT body becomes). */
export interface SaveRouteInput {
  readonly name: string | null;
  readonly plannedDate: string;
  readonly assignedTo: string;
  readonly departureTime: string;
  readonly endPoint: RouteEndPoint;
  readonly stops: readonly StopInput[];
  readonly totalDistanceKm: number | null;
  readonly totalDurationMin: number | null;
  readonly googleMapsUrl: string | null;
}

/** One stop as supplied on create/save. */
export interface StopInput {
  readonly customerId: string;
  readonly position: number;
  readonly priority: StopPriority;
  readonly lockedPosition: boolean;
  readonly priorityNote: string | null;
  readonly estimatedArrival: string | null;
  readonly driveTimeFromPrevMin: number | null;
  readonly distanceFromPrevKm: number | null;
}
```

**Persist types** (`CreateRoutePersist`, `SaveRoutePersist`) are the adapter-facing twins (same fields; named so the adapter signature is unambiguous, mirroring `CreateUserPersist`). `CreatedRoute` = `{ id; name; plannedDate; assignedTo; status; createdAt }` (the exact fields today's POST selects back). `RouteStatusRow` = `{ id; name; plannedDate; status }` (the exact fields today's PATCH selects back). These small response shapes live in `lib/domain/Route.ts`.

🗣 In plain English: the domain types are the app's own clean vocabulary for routes and stops — all camelCase, no database spelling. The little "CreatedRoute" / "RouteStatusRow" shapes exist only so the adapter returns *exactly* the handful of fields each write endpoint echoes back today, keeping the wire output identical.

---

## 9. Exact endpoint response shapes to preserve (PR2 — byte-identical)

The adapter returns **domain camelCase**; each route maps it **BACK to the snake_case JSON the UI reads today** (R-MF-2 pattern from F-13 PR2). The mapping is a per-route concern in the route file. Below is each current wire shape and the domain→wire mapping.

### 9.1 `GET /api/routes` → `{ routes: [...] }`
Each route object (snake_case, stops embedded + position-sorted):
```
{ id, name, planned_date, departure_time, end_point, status,
  total_distance_km, total_duration_min, google_maps_url, created_at,
  assigned_to,
  assignee: { id, name, role } | null,
  creator:  { id, name } | null,
  route_stops: [ { id, position, priority, locked_position, priority_note,
                   estimated_arrival, drive_time_from_prev_min,
                   distance_from_prev_km, visited,
                   customer: { id, name, postcode, lat, lng } } ] }
```
**Mapping:** `RouteWithStops` → map every camelCase field back to snake_case; `assignee`/`creator` join shapes preserved; each stop's `customer` preserved; `route_stops` stays the sorted array. Note: today's route also selects `assigned_to` as a bare column AND the `assignee` join — preserve **both** keys.

### 9.2 `GET /api/routes/[id]` → `{ route: {...} }`
Same per-route shape as 9.1 **except** today's select **omits `created_at` and `creator`** and **omits `visited`** on stops? — VERIFY against `app/api/routes/[id]/route.ts:31-41`: it selects the same stop columns **including** the customer join but **without** the top-level `created_at`/`creator` and the stop list **does** include `visited`. **Implementer: open the file and copy its `select(...)` field list verbatim** — preserve exactly the keys it returns today, no more, no less. Missing route → `{ error: 'Route not found' }` 404 (service returns null → route maps to 404).

### 9.3 `GET /api/routes/today` → `{ route: {...} | null }`
Same full per-route shape as 9.1 (header + position-sorted stops + assignee + customer joins; includes `visited`; **no** `creator`, **no** `created_at` — VERIFY at `app/api/routes/today/route.ts:44-54` and copy verbatim). `null` when none. The 7pm rollover decision moves into the service; the wire shape is unchanged.

### 9.4 `GET /api/admin/runs` → `{ runs: [...], from, to }`
Each run row (snake_case, NO stops array, count added):
```
{ id, name, planned_date, departure_time, status, end_point,
  total_distance_km, total_duration_min,
  assignee: { id, name } | null,
  stop_count: <number> }
```
Plus top-level `from` and `to` (the resolved bounds). **Mapping:** `RouteSummary` → snake_case; `assignee` is the trimmed `{ id, name }` (no role here — VERIFY: the select is `assignee:users!routes_assigned_to_fkey (id, name)`); `stopCount` → `stop_count`.

### 9.5 Write endpoints
- **`POST /api/routes`** → `{ route: { id, name, planned_date, assigned_to, status, created_at }, stopCount }`, status **201**. Validation 400s preserved (`plannedDate`/`assignedTo`/`stops` required), 401 on missing `x-mfs-user-id`. Map `CreatedRoute` → the snake_case `route` object; `stopCount` = `input.stops.length`.
- **`PUT /api/routes/[id]`** → `{ id, updated: true }`, status 200. Validation 400s preserved; 401 preserved. The partial-failure 500 messages ("Header saved but could not clear old stops: …", "Route header saved but stops could not be written: …. Please re-save to restore stops.") must be reproduced — **either** keep them in the route's catch of the service error, **or** carry them through the `ServiceError` message. **Recommendation:** preserve the exact strings; assert them in an integration test.
- **`PATCH /api/admin/runs/[id]`** → the bare row `{ id, name, planned_date, status }` (NOT wrapped), status 200. 403 if `x-mfs-user-role !== 'admin'`. 400 on invalid status. Map `RouteStatusRow` → snake_case.
- **`DELETE /api/admin/runs/[id]`** → empty body, status **204**. 403 non-admin.

🗣 In plain English: the screens already know how to read today's JSON. PR2's job is to make the new engine hand back the *exact same JSON keys, casing, status codes, and even error sentences*. The cleanest way to guarantee "byte-identical" is to literally copy each route's current `select(...)` field list and response object, then prove equality with a captured-fixture test.

> **Implementer note (load-bearing):** before editing each route in PR2, re-read its current `select(...)` and final `NextResponse.json(...)` and treat them as the contract. The spec's column lists are a guide; the file is the source of truth for which keys each endpoint returns.

---

## 10. Build order (TDD-friendly, per PR, per file)

### PR1 — INTRODUCE

1. **`lib/domain/Route.ts`** (+ barrel). No test of its own (types). 🗣 Write the vocabulary first.
2. **`lib/ports/RoutesRepository.ts`** (+ barrel). Interface only.
3. **`lib/ports/__contracts__/RoutesRepository.contract.ts`** — the shared behaviour suite (a function taking a repo factory). Assertions:
   - `createRoute` returns the created header; the stops are persisted and read back position-sorted by `getRouteById`.
   - `createRoute` rolls back the header if a stop insert fails (e.g. duplicate position → simulate in Fake; real adapter via the UNIQUE constraint).
   - `replaceRoute` clears old stops and writes new ones; `getRouteById` reflects only the new set, position-sorted; re-using a position across the replace does NOT collide (old gone first).
   - `getRouteById` null on miss.
   - `getNextRouteForUser` returns the soonest active/draft on/after `minDate`, tie-broken by departure_time; null on none; ignores other users; ignores `completed`.
   - `listRoutes` honours `plannedDate` / `assignedTo` / `all` filters; stops position-sorted.
   - `listRouteSummaries` returns rows in [from,to] with correct `stopCount`, ordered planned_date then departure_time; excludes out-of-range dates.
   - `setRouteStatus` updates + returns trimmed row; null on missing id.
   - `deleteRoute` idempotent; cascades stops (real adapter).
4. **`lib/adapters/fake/RoutesRepository.ts`** (+ barrel). Implement to pass the contract suite. 🗣 The in-memory twin is the fast unit-test substrate.
5. **Run the contract suite against the Fake** — green before touching Supabase.
6. **`lib/adapters/supabase/RoutesRepository.ts`** (+ barrel). Implement; map snake_case↔camelCase; map PG errors to app errors inside the adapter. Contract suite also runs against the real adapter under `npm run test:integration` (real Postgres).
7. **`lib/services/RoutesService.ts`** (+ barrel). Unit tests with the Fake:
   - `getNextRouteForUser(userId, atTime)`: at 18:59 UK → minDate = today; at 19:00 → minDate = tomorrow (assert the `minDate` passed to a spy repo). **This is the headline business-logic test.**
   - `listWeekRuns()` with no args → Mon–Sun of the current UK week (assert bounds; use a fixed clock).
   - passthrough methods delegate unchanged.
8. **`lib/utils/ukDateAndHour.ts`** — add `getUKWeekBounds()` (+ unit test) if lifting from the route (recommended).
9. **`lib/wiring/routes.ts`** — `routesService` singleton + `routesServiceForCaller` (UNUSED, commented for F-RLS-04c). Add to `tests/unit/lint/no-adapter-imports.test.ts` coverage if that test enumerates wiring files.
10. **Lint pin:** confirm `no-adapter-imports` still green (service/domain/ports import no adapters).

**PR1 acceptance:** all new unit + contract tests green; `npm run lint` + `tsc --noEmit` exit 0; NO route file changed; NO migration; NO new dep; `routesService` has no production importer yet.

### PR2 — RE-POINT

For **each** of the 5 routes, in this order (lowest blast radius first):
1. `app/api/admin/runs/[id]/route.ts` (PATCH/DELETE — simplest).
2. `app/api/admin/runs/route.ts` (GET list + bounds).
3. `app/api/routes/today/route.ts` (GET + rollover).
4. `app/api/routes/[id]/route.ts` (GET + PUT replace).
5. `app/api/routes/route.ts` (POST create + GET list).

Per route: capture the current response JSON as a fixture (integration), re-point to `routesService`, map domain→snake_case, drop the `@supabase/*` import, re-run and assert byte-identical. Preserve all status codes, validation 400s, auth 401/403, and the PUT partial-failure messages.

**PR2 acceptance:** the 5 routes import no `@supabase/*`; integration suite green against real Postgres (response shapes match captured fixtures field-for-field); E2E `@critical` unaffected; `npm run lint` + `tsc --noEmit` exit 0; NO migration.

---

## 11. Test matrix hint for ANVIL

- **Unit (Fake adapter + service):** RoutesService business logic — **7pm rollover boundary (18:59 vs 19:00)**, **Mon–Sun week bounds**, passthrough delegation. Plus `getUKWeekBounds()` util tests. 🗣 The brain-work, tested with no database.
- **Integration (real Postgres, `npm run test:integration`):** the shared contract suite against `createSupabaseRoutesRepository` (atomic create+rollback, atomic replace honouring UNIQUE(route_id,position), filters, summaries+stopCount, cascade delete) **and** the 5 re-pointed routes asserting captured response fixtures field-for-field (incl. `stop_count`, the `assignee`/`creator` join shapes, the PUT partial-failure messages, 201/204 codes).
- **DB / pgTAP:** **UNAFFECTED this pass** — no policy change, no schema change (F-RLS-04c owns policies). State this in the cert.
- **E2E `@critical`:** **UNAFFECTED** — wire shapes preserved; no UI change. Run to confirm no regression.

🗣 In plain English: prove the rules with fast no-DB tests, prove the database adapter and the unchanged JSON against a real Postgres, and confirm the existing browser smokes still pass. No security/policy tests because we changed no policies.

---

## 12. Rip-out test (CLAUDE.md acceptance criterion)

**"If I replace Supabase for Routes tomorrow, how many files change?"** → **one new adapter** (`lib/adapters/<vendor>/RoutesRepository.ts`) **+ one wiring line** (swap the import in `lib/wiring/routes.ts`). The domain, port, service, and all 5 routes are untouched. **PASS.** 🗣 One plug, one socket — pulling Supabase out is a single back-office swap, nothing in the screens or the routes logic moves.

---

## 13. BACKLOG item to add before ship

Add to `docs/plans/BACKLOG.md` (ARCH-FU- entry) before PR1 ships:

> **ARCH-FU — Geocoder port (postcodes.io) + RouteOptimizer port (Google Routes v2)** — the `optimise` and `compute-road-times` endpoints still call external services via raw `fetch` outside any port. Extract them as their own unit: a `Geocoder` port (postcodes.io adapter) and a `RouteOptimizer` port (Google Routes v2 adapter), wired in `lib/wiring/routes.ts`. Owner-unit: unscheduled. Deferred: 2026-06-17 (F-14 — out of scope, routing brain untouched this pass).

🗣 In plain English: the route-optimiser and postcode lookup still phone third parties directly. We are noting that as the next socket to build so it isn't forgotten — but not building it now.

---

## 14. Acceptance criteria (Gate-level)

- [ ] PR1: domain/port/contract/adapters(supabase+fake)/service/wiring shipped; contract suite green on BOTH adapters; service unit tests cover rollover + week boundary; lint + tsc exit 0; no route edited; no migration; no new dep; no production importer of `routesService`.
- [ ] PR2: 5 routes re-pointed; zero `@supabase/*` imports in those files; all response shapes byte-identical to captured fixtures (incl. `stop_count`, joins, PUT messages, 201/204); integration + E2E `@critical` green; lint + tsc exit 0; no migration.
- [ ] Rip-out test PASS (one adapter + one wiring line).
- [ ] BACKLOG ARCH-FU entry for Geocoder/RouteOptimizer added.
- [ ] `routesServiceForCaller` present but UNUSED, commented for F-RLS-04c.

---

## 15. Risk Assessment (mandatory)

### Concurrency / race conditions
- **R1 — PUT replace is not transactional (header update + delete + insert are 3 separate calls).** Severity: **Medium**. This is **pre-existing behaviour** — today's route does exactly the same 3 sequential calls with the same partial-failure window. F-14 must **preserve** it, not fix it (fixing = behaviour change, out of scope for a byte-identical re-point). Mitigation: replicate the current ordering and error messages exactly inside `replaceRoute`; do NOT wrap in a transaction this pass. **Must-fix: NO** (preserving known behaviour is the correct move; flag wrapping-in-a-DB-function as a future BACKLOG candidate, not F-14).
- **R2 — `routesServiceForCaller` accidentally wired into a route.** Severity: **High if it happened** (every Routes call would hit `authenticated` role with no RLS policies → blanket failures). Mitigation: the factory ships UNUSED with an explicit comment; no PR2 route imports it; reviewer checks the 5 routes import only `routesService`. **Must-fix: NO** (it's a "don't do X" guard, easily verified in review/lint).

### Security
- **R3 — service-role posture preserved (RLS bypassed).** Severity: **Low (no change)**. F-14 keeps the exact security posture the routes use today; the RLS cutover is F-RLS-04c. No new exposure. Mitigation: use the `routesService` service-role singleton in PR2, never the per-caller factory. **Must-fix: NO.**
- **R4 — admin-only guard on PATCH/DELETE must survive the re-point.** Severity: **Medium**. The `x-mfs-user-role !== 'admin'` 403 lives in the route, not the service (auth is route-shaped per the codebase convention). Mitigation: keep the guard in the route file; assert 403 in integration. **Must-fix: NO** (just don't drop it).

### Data migration
- **No migration, no schema change, no backfill.** Severity: **None**. Confirmed in §5.6. Mitigation: if the implementer finds a reason one is needed, STOP and escalate. **Must-fix: NO.**

### Business-logic flaws
- **R5 — 7pm rollover / week-boundary regression.** Severity: **Medium**. Moving the date logic into the service risks an off-by-one (e.g. 19:00 inclusive vs exclusive, or Sunday vs Monday week start). Mitigation: reuse the **already unit-tested** `getEffectiveMinDate`/`getUKDateAndHour`; add explicit boundary unit tests (18:59 vs 19:00; week Mon–Sun) with a fixed clock. **Must-fix: NO** (covered by tests; not a launch blocker, but the headline test to get right).
- **R6 — `stop_count` / join-shape drift breaks the runs table or map.** Severity: **Medium**. If the domain→wire mapping drops `creator`, mis-cases a key, or changes the `assignee` shape, the UI silently renders blanks. Mitigation: capture each endpoint's current JSON as a fixture and assert field-for-field; copy each route's `select(...)` verbatim. **Must-fix: NO** (caught by the byte-identical integration assertions).

### Launch blockers
- **None identified.** The change is additive (PR1) then a behaviour-preserving re-point (PR2). No data destruction, no auth change, no schema change. The only way to break production is dropping a field, an auth guard, or a status code — all pinned by the integration fixtures.

### Risk headline
**No must-fix risks. No Gate-2 blockers.** The highest-attention items are R5 (rollover/week-boundary correctness — pin with boundary unit tests) and R6 (byte-identical wire shapes — pin with captured-fixture integration tests). Both are mitigated by tests, not by design changes.
