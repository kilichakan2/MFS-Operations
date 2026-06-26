# F-20 Admin PR3/3 — Import + Map hexagonal re-point

**Date:** 2026-06-26
**Unit:** F-20 Admin PR3/3 (the last of the three Admin re-point PRs)
**Type:** Behaviour-preserving hexagonal re-point of 3 API routes off the raw
`supabaseService` adapter onto owned ports/services. Pulls F-TD-31
(`AuditLogRepository`) forward as a minimal seam.

## Goal

Move three API routes off the raw Supabase SDK/REST and onto ports the app owns,
so that `app/**` imports services + wiring singletons only — never an adapter.
Two routes (`import/manual`, `import/confirm`) currently `import { supabaseService }`
directly; one (`map/data`) hand-rolls raw PostgREST `fetch` calls with the
service-role key. After this PR all three have **zero** adapter/vendor imports.

**🗣 In plain English:** Three pages of code today reach straight into the
database vendor (Supabase), like an appliance hard-wired to the mains. We're
putting a labelled socket between each of them and the database, so swapping the
database later means changing one plug, not rewiring three appliances. Nothing
the user sees changes — same buttons, same screens, same import counts.

## Visual mini-map

```
DOMAIN (core logic)
  ├─ CustomersRepository (port) → [Supabase]   (adapter)  +insertMany, +listGeocodedForMap
  ├─ ProductsRepository  (port) → [Supabase]   (adapter)  +insertMany, +insertOne
  ├─ VisitsRepository    (port) → [Supabase]   (adapter)  +listForMap
  ├─ Geocoder            (port) → [postcodes.io](adapter)  REUSE geocodeMany (no change)
  └─ AuditLogRepository  (port) → [Supabase]   (adapter)  NEW seam (1 method: record)
🗣 one plug per socket — after this PR the 3 routes hold zero plugs of their own
```

## Locked context (do NOT re-open — Hakan approved at Gate 1)

These are design constraints, restated so the implementer has them in one place.
Full rationale is in the conductor's Gate-1 prompt.

1. **map/data read failure → repo throws `ServiceError` → route returns 500
   `'Server error'`.** Accepted small deviation from byte-identical: today the
   route silently returns empty sections at 200 on a failed `fetch`. Do NOT
   preserve silent-empty. Consistent with every PR1/PR2 read route.
   **🗣** Today a database hiccup on the map quietly shows an empty map; after
   this it shows a proper 500 error like every other admin read. A cleaner,
   honest failure — Hakan signed off on this one tiny change.
2. **Introduce a minimal `AuditLogRepository` now** (pulls F-TD-31 forward). One
   method `record(entry)`. Both import routes write audit through it. Today both
   routes `await` the audit insert before responding → `record` is **await-blocking**.
   **🗣** The "who imported what, when" logbook write currently happens inline
   with the raw vendor. We give it its own small socket so the routes stop
   touching the vendor. We keep the routes waiting for the write (as today) so
   behaviour is identical.
3. **W1 — import/confirm geocoding stays FIRE-AND-FORGET and SWALLOWS
   `GeocoderError`** (logs, never propagates). Opposite of geocode-all (which
   500s on bulk failure). The route already wraps the geocode call in
   `.catch(() => {})`; preserve that. A thrown `GeocoderError` or a `setCoords`
   `ServiceError` inside the geocode path must NEVER turn an already-returned 201
   into an error.
   **🗣** When you confirm an import, the row insert is what matters and it's
   already done + answered "201 created" before geocoding runs. The map-pin
   lookup is a background nicety; if postcodes.io is down, we shrug, log it, and
   the pin shows up next run. We must keep that shrug.
4. **import/manual** — preserve per-row insert + `23505`→skip silently +
   non-23505→`console.error`+skip + blank-name→skip. The repo `insertOne` must
   signal inserted / duplicate / other-error WITHOUT throwing on 23505 (define
   errors out of existence).
5. **import/confirm bulk insert** stays all-or-nothing — a batch error throws →
   route 500 with a GENERIC `'Server error'` (NOT the raw PostgREST
   `error.message` — see Risk R-LEAK below; this IS a deviation, flagged).
   Customers bulk insert returns `{ id, postcode }[]`; products returns `{ id }[]`.
   `skipped = validRows.length - inserted` computed by the route.
6. **The 5s `setTimeout` road-time trigger** is an internal HTTP `fetch` to our
   own `/api/routes/compute-road-times` — NOT a vendor. Leave byte-identical,
   out of scope. (It is not a Supabase call; it does not violate the rule.)
7. **map/data reads**: `listGeocodedForMap()` on CustomersRepository (returns
   `MapCustomer[]`, adapter maps rows) + `listForMap(window)` on VisitsRepository
   (returns `MapVisit[]`, adapter does the TWO queries + mapping + the `lat==null`
   skip). Compose into `{ customers, visits }` via a thin **MapDataService**
   (`lib/services/MapDataService.ts`) — see "Design-it-twice: service vs usecase"
   below for why a service (not a usecase) is the right call here.

## Domain terms (plain-English)

- **Port** (`lib/ports/*`) — the labelled socket the core logic owns.
  **🗣** The shape the database has to fit into; the app dictates it, not the vendor.
- **Adapter** (`lib/adapters/supabase/*`) — the actual Supabase plug.
  **🗣** The only place the Supabase SDK is allowed to be imported.
- **Wiring** (`lib/wiring/*`) — the parts list that bolts an adapter to a service.
  **🗣** The one file allowed to import an adapter; flip a vendor here in one line.
- **`ServiceError` / `GeocoderError`** (`lib/errors`, `lib/ports/Geocoder`) — the
  app's own error labels; vendor error shapes never escape past the adapter.
  **🗣** When the database or postcodes.io fails, the rest of the app sees one of
  our labels, never Supabase's raw message.
- **`MapCustomer` / `MapVisit`** (`lib/services/mapScene.ts`) — the flat shapes
  the Map screen plots. The route re-exports them; PRESERVE that re-export line.
  **🗣** The exact row shape the map pins need; defined once, re-exported so no
  import site breaks.

## Compliance / RLS flags

- **NO per-user RLS switch-on.** All new wiring singletons are **service-role**
  (master key, RLS bypassed) — same posture the three routes use today, and the
  one-line rollback parachute. Per-user RLS for admin routes stays deferred to
  F-RLS-04i. **🗣** We keep the master-key today; tightening to per-user
  permissions is a separate, later job — not in this PR.
- **NO guard standardization.** Each route keeps its existing
  `x-mfs-user-id absent → 401` guard byte-identical (these routes use the raw
  header check, NOT `requireRole` — do not "upgrade" them).
- **NO schema migration.** Code-only PR. `audit_log`, `customers`, `products`,
  `visits` tables already exist with every column used here.

## ADR conflicts

**None.** This PR is squarely inside ADR-0002 (hexagonal shape) and ADR-0004
(service-role posture for not-yet-RLS routes). One ADR-0002 nuance to honour, not
a conflict: the new `AuditLogRepository` write is **await-blocking** to match
today's `await supabase.from('audit_log').insert(...)`. The deviations in Locked
items 1 and 5 (500 instead of silent-empty; generic 500 body instead of raw
`error.message`) are explicitly within the PR1/PR2 accepted-deviation envelope
(a 500 body becoming generic `'Server error'` with no raw PostgREST leak is
already the convention).

---

## Files — created and modified

### A. New domain type

**CREATE `lib/domain/AuditLogEntry.ts`** — the owned shape of one audit row.
```ts
export interface AuditLogEntry {
  user_id: string;
  screen: string;
  action: string;
  record_id: string | null;
  summary: string;
}
```
**MODIFY `lib/domain/index.ts`** — add `export type { AuditLogEntry } from "./AuditLogEntry";`

**🗣** The logbook entry's fields, named by the app. Today they're written as a
loose object inline; now they have a contract.

### B. New port — AuditLogRepository

**CREATE `lib/ports/AuditLogRepository.ts`**
```ts
import type { AuditLogEntry } from "@/lib/domain";

export interface AuditLogRepository {
  /** Persist ONE audit row. Await-blocking (callers await before responding,
   *  matching today's inline insert). @throws ServiceError on DB failure. */
  record(entry: AuditLogEntry): Promise<void>;
}
```
**MODIFY `lib/ports/index.ts`** — add `export type { AuditLogRepository } from "./AuditLogRepository";`

**Decision note (await vs fire-and-forget):** `record` is **await-blocking**.
Today both routes `await supabase.from('audit_log').insert(...)` before
returning 201, so a slow/failed audit insert delays/affects the response exactly
as today. Keeping it await preserves that. (NOTE: today an audit insert error is
NOT checked — the routes ignore the `{ error }` result. Throwing a `ServiceError`
from `record` and letting it bubble to the route `catch` → 500 would be a
behaviour CHANGE on the import-succeeded-but-audit-failed edge. See Risk
R-AUDIT below for the resolution: the route must `await audit...catch(log)` to
preserve today's "audit failure never fails the import" behaviour.)

### C. New adapter — Supabase AuditLogRepository

**CREATE `lib/adapters/supabase/AuditLogRepository.ts`** (mirror
`ProductsRepository.ts` adapter shape):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { AuditLogEntry } from "@/lib/domain";
import type { AuditLogRepository } from "@/lib/ports";

export function createSupabaseAuditLogRepository(
  client: SupabaseClient,
): AuditLogRepository {
  return {
    async record(entry: AuditLogEntry): Promise<void> {
      const { error } = await client.from("audit_log").insert({
        user_id:   entry.user_id,
        screen:    entry.screen,
        action:    entry.action,
        record_id: entry.record_id,
        summary:   entry.summary,
      });
      if (error) {
        log.error("AuditLogRepository.record DB error", { error: error.message });
        throw new ServiceError("Audit write failed", { cause: error });
      }
    },
  };
}

export const supabaseAuditLogRepository: AuditLogRepository =
  createSupabaseAuditLogRepository(supabaseService);
```
**MODIFY `lib/adapters/supabase/index.ts`** — add the
`createSupabaseAuditLogRepository` + `supabaseAuditLogRepository` re-export.

### D. New fake adapter — AuditLogRepository

**CREATE `lib/adapters/fake/AuditLogRepository.ts`** (in-memory, records pushed to
an inspectable array so the contract + route tests can assert what was written):
```ts
import type { AuditLogEntry } from "@/lib/domain";
import type { AuditLogRepository } from "@/lib/ports";

export interface FakeAuditLogRepository extends AuditLogRepository {
  /** Test inspection: every entry record() received, in order. */
  readonly entries: readonly AuditLogEntry[];
}

export function createFakeAuditLogRepository(): FakeAuditLogRepository {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async record(entry: AuditLogEntry): Promise<void> {
      entries.push(entry);
    },
  };
}

export const fakeAuditLogRepository = createFakeAuditLogRepository();
```
**MODIFY `lib/adapters/fake/index.ts`** — add the re-exports
(`createFakeAuditLogRepository`, `fakeAuditLogRepository`, `type FakeAuditLogRepository`).

### E. New contract test — AuditLogRepository

**CREATE `lib/ports/__contracts__/AuditLogRepository.contract.ts`** (mirror
`ProductsRepository.contract.ts` setup-closure shape). Minimum cases:
- `record` resolves (no throw) on a valid entry.
- a second `record` with the same fields also resolves (audit_log has no unique
  constraint on these fields — duplicates are allowed; confirm against schema).
- (Fake only, via the inspection array) `record` persists every field verbatim.
  Keep this assertion in the Fake-specific test, NOT the shared contract, since
  the Supabase contract can't read back without a select method (we deliberately
  don't add one — `record` is write-only, the deepest possible interface).

**CREATE `tests/unit/adapters/fake/AuditLogRepository.test.ts`** — runs the
contract against `createFakeAuditLogRepository()`, plus the field-verbatim
inspection assertion.

**CREATE `tests/integration/adapters/supabase/AuditLogRepository.test.ts`** —
runs the contract against `createSupabaseAuditLogRepository(getServiceClient())`.
`cleanup`: delete the rows it inserted (filter on a sentinel `summary` value, or
accept that audit_log accumulates test rows — match how other write-side
integration tests clean up; check `_setup.ts` for a cleanup helper first).

### F. New wiring — auditLog

**CREATE `lib/wiring/auditLog.ts`** (mirror `lib/wiring/products.ts`):
```ts
import { supabaseAuditLogRepository } from "@/lib/adapters/supabase";
import type { AuditLogRepository } from "@/lib/ports";

/** Service-role singleton (RLS bypassed) — same posture the import routes use
 *  today. Rip-out: swap audit_log's DB vendor = one new adapter + this line. */
export const auditLog: AuditLogRepository = supabaseAuditLogRepository;
```
NOTE: this is a bare repository singleton (like `geocoder`), NOT a service —
there is no business logic to wrap, `record` is already the whole surface. Do
NOT build an `AuditLogService` pass-through (it would be a shallow module — the
deletion test fails: deleting it just moves the one call back to the route
unchanged).

### G. Extend CustomersRepository (insert + map read)

**MODIFY `lib/ports/CustomersRepository.ts`** — add two methods:
```ts
/** Bulk insert customers (import/confirm, all-or-nothing). Returns the new
 *  rows' id + postcode (the geocoding path needs both). A batch failure
 *  (incl. a duplicate-name 23505 anywhere in the batch) throws ServiceError
 *  — preserves today's all-or-nothing 500. @throws ServiceError on DB failure. */
insertMany(
  rows: readonly { name: string; postcode: string | null; created_by: string }[],
): Promise<readonly { id: string; postcode: string | null }[]>;

/** Insert ONE customer (import/manual, per-row so one bad row never aborts the
 *  batch). Returns a typed result distinguishing inserted / duplicate / error
 *  — NEVER throws on a 23505 (define errors out of existence). @throws
 *  ServiceError ONLY on an unexpected non-insert failure the route should 500 on
 *  — but per Locked item 4 the route swallows even those as skipped, so the
 *  adapter returns { outcome: 'error' } for non-23505 too. See InsertOneResult. */
insertOne(
  row: { name: string; postcode?: string | null; created_by: string }
     | { name: string; code: string | null; category: string | null; box_size: string | null; created_by: string },
): Promise<never>; // SEE BELOW — insertOne lives on a SHARED shape, do not duplicate
```

**Design correction — insertOne is per-TABLE, keep it per-repo.** import/manual
inserts into customers OR products. Customers and products are DIFFERENT tables
→ DIFFERENT repositories (the project's "one table = one repository" rule, locked
in PR2). So:

- **CustomersRepository.insertOne** signature:
  ```ts
  insertOne(row: { name: string; created_by: string }): Promise<InsertOneResult>;
  ```
  (import/manual customers insert is `{ name, active:true, created_by }` — only
  name is mapped from the row; `active:true` is set inside the adapter.)
- **ProductsRepository.insertOne** signature:
  ```ts
  insertOne(row: {
    name: string; code: string | null; category: string | null;
    box_size: string | null; created_by: string;
  }): Promise<InsertOneResult>;
  ```

**Shared result type** — add to `lib/ports/CustomersRepository.ts` (or a small
`lib/ports/InsertOneResult.ts` imported by both ports; pick the latter to avoid a
products→customers port import):

**CREATE `lib/ports/InsertOneResult.ts`**
```ts
/** Outcome of a single-row insert that must not abort a batch (import/manual).
 *  'inserted' → counted as inserted. 'duplicate' (Postgres 23505) → skipped
 *  silently. 'error' (any other DB error) → the adapter has already logged it;
 *  the route counts it skipped (today's console.error + skip). */
export type InsertOneResult =
  | { outcome: "inserted" }
  | { outcome: "duplicate" }
  | { outcome: "error"; message: string };
```
The `message` on `'error'` lets the route reproduce today's
`console.error('[import/manual] ... insert error:', error.message, '| row:', name)`
WITHOUT the vendor error object leaking — the adapter passes the string only.

**Also add the map read to CustomersRepository:**
```ts
/** Geocoded customers for the Map View (map/data). Only rows with non-null
 *  lat AND lng, ordered by name asc, mapped to the flat MapCustomer shape
 *  (external_system_id → code, is_approximate_location → is_approximate).
 *  @throws ServiceError on DB failure. */
listGeocodedForMap(): Promise<readonly MapCustomer[]>;
```
Add `import type { MapCustomer } from "@/lib/services/mapScene";` to the port.
**🗣 boundary note:** `MapCustomer` lives in `lib/services/mapScene.ts`, not
`lib/domain`. A PORT importing from `lib/services` is unusual — but mapScene's
`MapCustomer`/`MapVisit` are pure presentation types with no vendor/framework
import, and relocating them to `lib/domain` would break the route's PRESERVED
re-export line (`export type { MapCustomer, MapVisit } from '@/lib/services/mapScene'`)
and the 3 existing import sites. **Decision: keep the types where they are; the
port imports them as a type-only import.** This is the lowest-churn choice and
keeps the locked re-export intact. (Alternative considered: move the types to
`lib/domain` and re-export from mapScene + the route. Rejected — more files
touched, more risk, the locked invariant says preserve the re-export line.)

**MODIFY `lib/adapters/supabase/CustomersRepository.ts`** — implement
`insertMany`, `insertOne`, `listGeocodedForMap`:
- `insertMany`: `.from('customers').insert(payload).select('id, postcode')`;
  on error throw `ServiceError` (preserves all-or-nothing 500). Map rows →
  `{ id, postcode }`.
- `insertOne`: `.from('customers').insert({ name: row.name, active: true, created_by: row.created_by })`;
  inspect `error?.code === '23505'` → return `{ outcome: 'duplicate' }`; other
  error → log + return `{ outcome: 'error', message: error.message }`; success →
  `{ outcome: 'inserted' }`. **Never throws on a DB insert error** (matches today).
- `listGeocodedForMap`: the SELECT from map/data line 43
  (`id,name,postcode,external_system_id,active,lat,lng,is_approximate_location`,
  `lat=not.is.null&lng=not.is.null&order=name.asc`) translated to the SDK
  (`.select(...).not('lat','is',null).not('lng','is',null).order('name',{ascending:true})`).
  Map rows → `MapCustomer` field-for-field exactly as the route does today
  (lines 53-62). On error throw `ServiceError` (Locked item 1 — route → 500).

**MODIFY `lib/adapters/fake/CustomersRepository.ts`** — implement the three new
methods over the in-memory store (insertMany pushes + returns id/postcode;
insertOne checks a name-uniqueness set for the duplicate path; listGeocodedForMap
filters store rows with lat/lng set and maps to MapCustomer).

### H. Extend ProductsRepository (insert)

**MODIFY `lib/ports/ProductsRepository.ts`** — add:
```ts
/** Bulk insert products (import/confirm, all-or-nothing). Returns the new rows'
 *  ids (the route only needs the count, but id keeps parity with customers).
 *  @throws ServiceError on DB failure (preserves today's 500). */
insertMany(
  rows: readonly { name: string; category: string | null; code: string | null;
                   box_size: string | null; created_by: string }[],
): Promise<readonly { id: string }[]>;

/** Insert ONE product (import/manual per-row). Typed result, never throws on
 *  23505 — same contract as CustomersRepository.insertOne. */
insertOne(row: {
  name: string; code: string | null; category: string | null;
  box_size: string | null; created_by: string;
}): Promise<InsertOneResult>;
```
Add `import type { InsertOneResult } from "@/lib/ports/InsertOneResult";`

**MODIFY `lib/adapters/supabase/ProductsRepository.ts`** — implement both,
mirroring the customers adapter. `insertMany`:
`.from('products').insert(payload).select('id')`, throw on error. `insertOne`:
`.from('products').insert({ name, code, category, box_size, active:true, created_by })`,
23505→duplicate / other→error / ok→inserted.
NOTE the sentinel logic (the `'none'`→null collapse at confirm route lines
184-187) is the ROUTE's row-cleaning, applied BEFORE the repo call — keep it in
the route, the repo receives already-cleaned `category/code/box_size`.

**MODIFY `lib/adapters/fake/ProductsRepository.ts`** — implement both over the
in-memory store.

### I. Extend VisitsRepository (map read)

**MODIFY `lib/ports/VisitsRepository.ts`** — add:
```ts
/** Visits for the Map View (map/data). Returns BOTH existing-customer visits
 *  (joining customers.lat/lng) AND prospect visits (prospect_lat/lng), mapped
 *  to the flat MapVisit shape, newest first, each side capped at 500. Rows
 *  whose resolved lat/lng is null are skipped (customer side). Optional date
 *  window filters created_at. @throws ServiceError on DB failure. */
listForMap(window: { from: string | null; to: string | null }): Promise<readonly MapVisit[]>;
```
Add `import type { MapVisit } from "@/lib/services/mapScene";` (same type-only
boundary note as CustomersRepository above).

**MODIFY `lib/adapters/supabase/VisitsRepository.ts`** — implement `listForMap`:
- Query 1 (existing-customer visits): the SELECT at map/data line 77, via the
  SDK with the same embedded selects (`users!visits_user_id_fkey(name)`,
  `customers!visits_customer_id_fkey(name,lat,lng)`), `customer_id=not.is.null`,
  the date filters, `order created_at desc`, `limit 500`. Map → MapVisit,
  SKIPPING rows where `customers.lat`/`lng` is null (route lines 87-89).
- Query 2 (prospect visits): the SELECT at map/data line 107, `customer_id=is.null`,
  `prospect_lat=not.is.null`, same date filter / order / limit. Map → MapVisit
  (route lines 117-130).
- Combine both arrays in the SAME order the route appends them
  (customer-visits first, then prospect-visits) — order matters for byte-identity
  of the `visits` array.
- On EITHER query error throw `ServiceError` (Locked item 1).

**MODIFY `lib/adapters/fake/VisitsRepository.ts`** — implement `listForMap` over
the in-memory seed (return the seeded map visits; the fake can keep this simple —
the heavy join logic is Supabase-specific and proven by the integration test).

### J. New service — MapDataService

**CREATE `lib/services/MapDataService.ts`** (thin pass-through, factory only,
ports only — mirror ProductsService):
```ts
import type { MapCustomer, MapVisit } from "@/lib/services/mapScene";
import type { CustomersRepository, VisitsRepository } from "@/lib/ports";

export interface MapDataServiceDeps {
  readonly customers: CustomersRepository;
  readonly visits: VisitsRepository;
}

export interface MapDataService {
  /** Compose the Map View payload: geocoded customers + visits in the date
   *  window. `layer` selects which sections to populate (the route's
   *  all|customers|visits switch). Empty arrays for un-selected sections. */
  load(opts: {
    layer: string;
    window: { from: string | null; to: string | null };
  }): Promise<{ customers: readonly MapCustomer[]; visits: readonly MapVisit[] }>;
}

export function createMapDataService(deps: MapDataServiceDeps): MapDataService {
  const { customers, visits } = deps;
  return {
    async load({ layer, window }) {
      const wantCustomers = layer === "all" || layer === "customers";
      const wantVisits    = layer === "all" || layer === "visits";
      return {
        customers: wantCustomers ? await customers.listGeocodedForMap() : [],
        visits:    wantVisits    ? await visits.listForMap(window)      : [],
      };
    },
  };
}
```
**MODIFY `lib/services/index.ts`** — add the
`createMapDataService` + `type MapDataService` re-export.

**Design-it-twice: service vs usecase.** The map composition touches TWO ports
(Customers + Visits). CLAUDE.md says a `lib/services/` file depends on ports
(fine — services may depend on multiple ports; the rule it must NOT break is
"services do not import OTHER services" and "no adapter imports"). It says
`lib/usecases/` is for composing multiple SERVICES or for a single business
operation that orchestrates. Here we compose two PORTS with a trivial
layer-switch and no cross-service call, no transaction, no business decision.
**Chosen: a service** (`MapDataService`) — it parallels ProductsService /
CustomersService (the PR1/PR2 precedent the conductor told us to mirror), depends
only on ports, and the layer switch is presentation-shaped, not a business
operation worth a usecase. A usecase would be ceremony with no payoff (deletion
test: a usecase wrapper here just moves the two-line compose, doesn't concentrate
anything). If a reviewer insists on `lib/usecases/mapData.ts`, the body is
identical — but the service placement is the better fit and the lower-churn one.

### K. New wiring — mapData

**CREATE `lib/wiring/mapData.ts`** (mirror products wiring; service-role
singletons for both ports):
```ts
import { createMapDataService, type MapDataService } from "@/lib/services";
import { supabaseCustomersRepository, supabaseVisitsRepository } from "@/lib/adapters/supabase";

export const mapDataService: MapDataService = createMapDataService({
  customers: supabaseCustomersRepository,
  visits:    supabaseVisitsRepository,
});
```

### L. Extend the Customers/Products/Visits wiring for the import routes

The two import routes need: customers/products insert + the geocoder + the
customers setCoords (for the geocode write-back) + the audit log. These already
have wiring singletons we reuse:
- `customersService` (`lib/wiring/customers.ts`) — gains `insertMany`, `insertOne`,
  via the extended `CustomersService` (see M).
- `productsService` (`lib/wiring/products.ts`) — gains `insertMany`, `insertOne`.
- `geocoder` (`lib/wiring/geocoder.ts`) — UNCHANGED, reused.
- `auditLog` (`lib/wiring/auditLog.ts`) — NEW (F above).
No new wiring files for imports beyond `auditLog.ts`.

### M. Extend CustomersService + ProductsService (expose the new repo methods)

**MODIFY `lib/services/CustomersService.ts`** — add to the interface + factory:
```ts
insertMany(rows: readonly { name: string; postcode: string | null; created_by: string }[]):
  Promise<readonly { id: string; postcode: string | null }[]>;
insertOne(row: { name: string; created_by: string }): Promise<InsertOneResult>;
```
(pass-through to `customers.insertMany` / `customers.insertOne`). NOTE: do NOT
add `listGeocodedForMap` to CustomersService — the map route goes through
MapDataService, not CustomersService. Keep the service surfaces minimal.

**MODIFY `lib/services/ProductsService.ts`** — add `insertMany` + `insertOne`
pass-throughs.

---

## Per-route before → after

### `app/api/admin/import/manual/route.ts`

**Before:** `import { supabaseService }`; per-row `supabase.from('customers'|'products').insert(...)`
with inline 23505 handling; raw `supabase.from('audit_log').insert(...)`.

**After:**
- Imports: `{ customersService } from '@/lib/wiring/customers'`,
  `{ productsService } from '@/lib/wiring/products'`,
  `{ auditLog } from '@/lib/wiring/auditLog'`. NO adapter/vendor import.
- Guard byte-identical (`x-mfs-user-id` absent → 401; the 400 body checks; the
  `cell()` helper stays in the route — it's row parsing, not persistence).
- Loop: per row, compute `name`; blank→skip. Then:
  ```ts
  const result = type === 'customers'
    ? await customersService.insertOne({ name, created_by: userId })
    : await productsService.insertOne({ name, code, category, box_size, created_by: userId });
  if (result.outcome === 'inserted')      inserted++;
  else if (result.outcome === 'duplicate') skipped++;   // silent
  else { console.error('[import/manual] ... insert error:', result.message, '| row:', name); skipped++; }
  ```
  (the products branch still builds `code/category/box_size` via `cell()` in the
  route, exactly as today, and passes them to insertOne.)
- Audit: `await auditLog.record({ user_id: userId, screen: 'screen5', action: 'imported', record_id: null, summary: <UNCHANGED string> }).catch(e => console.error(...))`.
  **The `.catch` preserves today's "audit failure never fails the import"** (today
  the `{ error }` is ignored). See Risk R-AUDIT.
- Response `{ inserted, skipped }` status 201 — byte-identical.

### `app/api/admin/import/confirm/route.ts`

**Before:** `import { supabaseService }`; inline `geocodeNewCustomers` with two
postcodes.io fetches + `supabase.from('customers').update(...)`; bulk
`supabase.from('customers'|'products').insert(...).select(...)`; raw audit insert.

**After:**
- Imports: `{ customersService }`, `{ productsService }`,
  `{ geocoder } from '@/lib/wiring/geocoder'`, `{ auditLog }`. NO adapter import.
- The whole inline `geocodeNewCustomers` + `extractOutcode` helper is DELETED.
  Replaced by a fire-and-forget helper that calls `geocoder.geocodeMany()` once
  and loops `customersService.setCoords()`:
  ```ts
  async function geocodeNewCustomers(rows: { id: string; postcode: string }[]) {
    const withPostcode = rows.filter(r => r.postcode?.trim());
    if (withPostcode.length === 0) return;
    const now = new Date().toISOString();
    const geoMap = await geocoder.geocodeMany(withPostcode.map(r => r.postcode.trim()));
    for (const r of withPostcode) {
      const coords = geoMap.get(r.postcode.trim().toUpperCase());   // same normalised key
      if (!coords) continue;
      await customersService.setCoords(r.id, {
        lat: coords.lat, lng: coords.lng,
        geocoded_at: now, is_approximate_location: coords.approximate,
      });
    }
  }
  ```
  The `is_approximate` flag = `coords.approximate` (the adapter sets it true on an
  outcode-only match — the exact/outcode split is now INSIDE the geocoder
  adapter, gone from the route). **Call site keeps the `.catch(() => {})`**
  (Locked item 3 / W1) so a thrown `GeocoderError` OR a `setCoords` `ServiceError`
  inside this background path can NEVER turn the already-returned 201 into a 500.
- Bulk insert: customers →
  `const created = await customersService.insertMany(payload); inserted = created.length; skipped = validRows.length - inserted;`
  then build `toGeocode` from `created` (id + non-null postcode) and call the
  fire-and-forget helper + the UNCHANGED 5s `setTimeout` road-time fetch loop
  (iterating `created` instead of `data`). Products →
  `const created = await productsService.insertMany(payload); inserted = created.length; skipped = validRows.length - inserted;`
  **Deviation (Locked item 5):** today an insert error returns 500 with the raw
  `error.message`. After the re-point the adapter throws `ServiceError`, bubbles
  to the route `catch`, → 500 `'Server error'` (no raw PostgREST leak). FLAGGED,
  within the accepted-deviation envelope.
- Audit: `await auditLog.record({...UNCHANGED string...}).catch(e => console.error(...))`.
- Response `{ inserted, skipped }` 201 — byte-identical on the success path.

### `app/api/map/data/route.ts`

**Before:** raw `SUPA_URL`/`SUPA_KEY` + hand-rolled `fetch` to PostgREST for
customers + two visit queries; on `!res.ok` silently leaves the section empty;
returns `{ customers, visits }` at 200 always.

**After:**
- DELETE `SUPA_URL`, `SUPA_KEY`, `h`, and all three raw `fetch` blocks.
- Import `{ mapDataService } from '@/lib/wiring/mapData'`. NO vendor import.
- PRESERVE the re-export line:
  `export type { MapCustomer, MapVisit } from '@/lib/services/mapScene';` and the
  type-only import beneath it.
- Guard byte-identical (`x-mfs-user-id` absent → 401).
- Handler:
  ```ts
  const layer = searchParams.get('layer') ?? 'all';
  const from  = searchParams.get('from')  ?? null;
  const to    = searchParams.get('to')    ?? null;
  const { customers, visits } = await mapDataService.load({ layer, window: { from, to } });
  return NextResponse.json({ customers, visits });
  ```
- The `try/catch` stays; a thrown `ServiceError` → 500 `'Server error'`
  (Locked item 1 — the accepted deviation from today's silent-empty-at-200).

---

## TDD test plan (write tests first where practical)

### Unit — contract tests (real + fake for every touched port)
1. **AuditLogRepository contract** (NEW) — `lib/ports/__contracts__/AuditLogRepository.contract.ts`
   run by both `tests/unit/adapters/fake/AuditLogRepository.test.ts` (Fake) and
   `tests/integration/adapters/supabase/AuditLogRepository.test.ts` (Supabase).
2. **CustomersRepository contract** — extend
   `lib/ports/__contracts__/CustomersRepository.contract.ts` with cases for
   `insertMany` (returns id+postcode for each), `insertOne` (inserted / duplicate
   / blank handled by route not repo), `listGeocodedForMap` (only lat/lng-set
   rows, name asc, MapCustomer shape, code = external_system_id). Both Fake +
   Supabase integration tests inherit them.
3. **ProductsRepository contract** — extend with `insertMany` + `insertOne` cases.
4. **VisitsRepository contract** — extend with `listForMap` cases (customer +
   prospect rows mapped; lat-null customer row skipped; date window filters).
   NOTE the join-heavy customer-visit case is best proven in the Supabase
   integration run (the Fake can return a simple seeded list).

### Unit — route tests (mock the wiring singletons, mirror import.route.test.ts)
5. **`tests/unit/api/import-manual.route.test.ts`** (NEW) — mock
   `@/lib/wiring/customers`, `@/lib/wiring/products`, `@/lib/wiring/auditLog`.
   Assert: 401 when no `x-mfs-user-id`; 400 on bad body/type/empty rows;
   per-row dispatch to the right service.insertOne; `inserted`/`skipped` counts
   reproduce — `inserted` outcome counts inserted, `duplicate` counts skipped
   silently (no console.error), `error` counts skipped + console.error fires with
   `result.message`; blank name skipped without a repo call; audit `record`
   called once with the EXACT summary string; an audit `record` rejection does
   NOT change the 201 (R-AUDIT); response shape via `Object.keys(body).sort()`
   === `['inserted','skipped']`, status 201.
6. **`tests/unit/api/import-confirm.route.test.ts`** (NEW) — mock the same wiring
   + `@/lib/wiring/geocoder`. Assert: guards; bulk insert path returns
   `inserted`/`skipped`; `insertMany` throw → 500 `'Server error'`; the
   fire-and-forget geocode path — a `geocodeMany` that throws `GeocoderError`
   does NOT change the already-returned 201 (W1); a `setCoords` rejection inside
   the geocode loop likewise does not; `geocodeMany` is called with the trimmed
   postcodes and `setCoords` is keyed by `trim().toUpperCase()`; audit summary
   string unchanged; 5s setTimeout road-time fetch is fired (use fake timers to
   assert the internal fetch call is scheduled — keep it byte-identical).
   Response shape `['inserted','skipped']`, 201.
7. **`tests/unit/api/map-data.route.test.ts`** (NEW) — mock
   `@/lib/wiring/mapData`. Assert: 401 when no `x-mfs-user-id`; layer switch
   (`all`/`customers`/`visits`) passes through to `mapDataService.load`; a
   `ServiceError` thrown by `load` → 500 `'Server error'` (the deviation);
   success → `{ customers, visits }` 200 with `Object.keys(body).sort()` ===
   `['customers','visits']`; the `MapCustomer`/`MapVisit` re-export still resolves
   (a type-level import in the test file).

### Integration (local Supabase)
8. The three extended Supabase contract tests (run under `npm run test:integration`).
9. Existing `tests/integration/routes.test.ts` (or the map/import integration
   suite if one exists) — confirm the live routes still return the same shapes
   against seeded data. Add a map/data live assertion if not present.

### Lint pin
10. `tests/unit/lint/no-adapter-imports.test.ts` must stay GREEN — and should now
    confirm the three routes import NO `@/lib/adapters/*`. (It scans `app/**`;
    after the re-point the violations these three routes would have produced are
    gone. No new allow-list entries — the new adapter is in `lib/adapters/supabase/`
    which is already where the SDK is allowed.)

### Test matrix sketch
| Layer | What | Where |
|---|---|---|
| Unit · contract | Audit (new), Customers/Products/Visits (extended) | `tests/unit/adapters/fake/*` + `lib/ports/__contracts__/*` |
| Unit · route | manual / confirm / map-data guards + dispatch + deviations | `tests/unit/api/*.route.test.ts` |
| Integration · adapter | Audit/Customers/Products/Visits against local Supabase | `tests/integration/adapters/supabase/*` |
| Integration · route | live shapes for the 3 routes | `tests/integration/routes.test.ts` |
| Lint | no adapter imports in `app/**` | `tests/unit/lint/no-adapter-imports.test.ts` |
| ANVIL · @critical preview smoke | shared 75-spec suite on the Vercel preview | `npm run test:e2e:preview -- <url> --unprotected` |

**No exhaustive browser sweep.** This is a no-UI, no-RLS, behaviour-preserving
re-point — the upgraded every-button matrix is for UI changes / multi-route
auth-RLS cutovers. The shared `@critical` preview smoke still runs at ANVIL (pass
`--unprotected` — Vercel protection is off, F-INFRA-02; BACKLOG F-INFRA-06 means
the flag is mandatory or the smoke false-greens). Poll
`/api/auth/team` for 200 before running.
**🗣** We don't tap every screen because nothing visual or permission-related
changed; we still run the standard smoke suite the whole team shares, to catch a
broken wire end-to-end.

---

## Acceptance criteria

1. The 3 routes import NO `@/lib/adapters/*` and NO vendor SDK/`SUPA_*` env. Grep
   proves it; the lint pin stays green.
2. `import/manual` response, counts, console.error behaviour, blank/duplicate
   handling, audit summary string, status 201 — byte-identical.
3. `import/confirm` success path response/counts/audit/201 + the fire-and-forget
   geocode write-back + the 5s road-time trigger — byte-identical; a geocode/
   setCoords failure cannot turn a 201 into an error (W1).
4. `map/data` returns `{ customers, visits }` 200 with byte-identical field
   mapping on the happy path; a read failure now returns 500 `'Server error'`
   (the one accepted deviation); the `MapCustomer`/`MapVisit` re-export line is
   preserved and the 3 import sites still resolve.
5. Both adapters (real + fake) pass the shared contract for every touched port,
   including the new AuditLogRepository.
6. `npm run lint && npm run typecheck && npm run test:unit` green;
   `npm run test:integration` green on local Supabase; `@critical` preview smoke
   green at ANVIL.

---

## Rollback note (code-only, NO schema migration)

This PR adds/edits code only — no migration, no data change. Rollback = revert the
PR commit. Per-route parachute: each new wiring singleton is **service-role**
(the same master key the routes use today), so there is no auth/RLS cutover to
unwind. If a single route misbehaves post-merge, the minimal hotfix is to revert
that one route file to its `supabaseService` form — the ports/adapters/services
added here are additive and harmless if briefly unused. No `db:reset`, no branch
migration, no orphaned Supabase branch concerns beyond the standard ship checklist.

---

## Hexagonal rip-out test — EXPLICIT

**Statement:** After this PR, "if I rip out Supabase tomorrow and replace it,"
the Import + Map surfaces change = **one new adapter folder
(`lib/adapters/<vendor>/{CustomersRepository,ProductsRepository,VisitsRepository,AuditLogRepository}`)
+ the wiring lines in `lib/wiring/{customers,products,visits,auditLog,mapData}.ts`.**
The three routes, the services, the ports, the domain types, and the
`MapCustomer`/`MapVisit` shapes are UNTOUCHED. Geocoding (postcodes.io) is a
separate rip-out already proven by PR1 (`lib/wiring/geocoder.ts`).

**Rip-out test result: PASS.** Every vendor touch is confined to
`lib/adapters/supabase/*`, wired in `lib/wiring/*`. No route holds a vendor plug.

**New dependencies:** NONE. No new `package.json` entry. Every new file is owned
TypeScript over the already-present `@supabase/supabase-js` (used only inside
`lib/adapters/supabase/`). The new `AuditLogRepository` adapter is the only new
place the SDK is touched, and it sits in the allowed folder.

---

## Risk Assessment

### Concurrency / race conditions
- **R-FIREFORGET (medium, mitigated, not must-fix):** the confirm route's
  geocode + 5s road-time `setTimeout` run AFTER the 201 returns — exactly as
  today. In a serverless runtime, background work after the response can be
  killed before completion. This is PRE-EXISTING behaviour (not introduced
  here); we preserve it byte-identical. Mitigation: keep the `.catch(()=>{})`
  swallow so a killed/failed background task never surfaces as an error; do NOT
  "improve" it into an awaited path (that would change the response timing and
  re-open W1). Must-fix: NO.
  **🗣** The map-pin lookup happens after we've already said "done." If the
  server shuts the lights off early, a pin might be missing till next run — same
  as today, and harmless.

### Security
- **R-LEAK (low, resolved by design):** today `import/confirm` returns the raw
  PostgREST `error.message` in a 500 body (a small info leak). The re-point
  REMOVES it — the adapter throws `ServiceError`, the route returns generic
  `'Server error'`. Net security IMPROVEMENT. Must-fix: NO (it's a fix, flagged
  as a deviation for the byte-identity ledger).
- **No RLS change, no new auth surface, service-role posture unchanged** — same
  master key, same guards. No new must-fix.

### Data migration
- **None.** No schema change, no backfill, no column add. The `audit_log`,
  `customers`, `products`, `visits` tables and every column used already exist.
  No material risk in this category.

### Business-logic flaws
- **R-COUNT (medium, must verify in tests, not must-fix if tests added):** the
  `inserted`/`skipped` counts in BOTH import routes must reproduce today's
  numbers exactly. The risk is the `insertOne` typed-result mapping: a
  miscategorised 23505 (counted inserted) or a swallowed real error (counted
  inserted) would silently corrupt the count and the audit summary. Mitigation:
  the contract test asserts duplicate→`{outcome:'duplicate'}` and the route test
  asserts each outcome maps to the right counter + the right console.error.
  Must-fix: NO, PROVIDED the route + contract tests in items 5/6 of the test plan
  are written. (If a reviewer wants belt-and-braces, add an integration test that
  imports a batch containing one duplicate and asserts inserted/skipped.)
  **🗣** The "X imported, Y skipped" numbers must match today to the digit, or
  the admin's audit trail lies. The tests pin every case.
- **R-AUDIT (medium, must-fix on the route code, low effort):** today both routes
  `await supabase.from('audit_log').insert(...)` and IGNORE the `{ error }`
  result — an audit-write failure NEVER fails the import. If the new
  `auditLog.record()` throws `ServiceError` and we let it bubble to the route
  `catch`, an import that ALREADY succeeded would return 500 — a behaviour
  CHANGE. **Resolution (must be in the route code):** call
  `await auditLog.record({...}).catch(e => console.error(...))` so the audit
  write stays best-effort, preserving today's behaviour. The route tests (items
  5/6) MUST assert a rejected `record` does not change the 201. Must-fix flag:
  **YES on the route implementation detail** — but it is fully specified here, so
  it is a coding instruction, not an unresolved plan gap. Gate-2 verdict: NOT a
  blocker (the plan resolves it); the implementer must follow the `.catch` recipe.
  **🗣** If the logbook write fails, today the import still counts as done. We
  must keep that — so we tell the route to log a failed logbook write and move
  on, never to fail the whole import over it.

### Launch blockers
- **None.** Code-only, no migration, no env change, no flag. The ANVIL `@critical`
  preview smoke must be run with `--unprotected` (F-INFRA-06) — an ops gotcha,
  not a plan blocker. Poll `/api/auth/team` for 200 before the smoke.

### Risk headline
**No must-fix PLAN blocker.** One must-fix IMPLEMENTATION detail (R-AUDIT: the
audit write must be `.catch`-guarded so an audit failure never fails an import) —
fully specified in this plan, so it does not loop back to Order; it is a coding
instruction the implementer follows. R-COUNT is contained by the named tests.
The two accepted deviations (map/data 500-on-failure; confirm generic-500 body)
are inside the PR1/PR2 deviation envelope and Hakan-approved.
