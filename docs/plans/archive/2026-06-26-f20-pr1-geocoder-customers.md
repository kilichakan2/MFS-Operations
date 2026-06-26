# F-20 Admin — PR1 of 3 — Geocoder seam + Customers re-point

**Date:** 2026-06-26
**Unit:** F-20 Admin, PR1 (of 3). Routes touched this PR: `customers` (GET),
`customers/[id]` (PATCH), `geocode-all` (GET).
**Type:** Behaviour-preserving hexagonal re-point + ONE new owned socket (`Geocoder`).
**FORGE phase entering:** Order (this plan) → Render.

🗣 In plain English: we are rewiring three admin pages so they stop talking to the
database and the postcode-lookup website directly. Instead they go through proper
"sockets" the app owns. Behaviour stays identical (same answers, same screens),
except one route's password-in-the-URL guard is upgraded to a real admin check.

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ CustomersRepository (port) → [Supabase]    (adapter, extend existing)
  ├─ Geocoder            (port) → [postcodes.io] (adapter, NEW)
  └─ guard: requireRole(req,['admin'])  (reuse existing helper)
🗣 two sockets feed three routes; swap postcodes.io or the DB = change one plug each
```

---

## Goal

Re-point three admin routes onto owned ports so no `app/**` file imports a vendor
SDK or makes a raw vendor `fetch`. Preserve every response shape byte-identical and
every existing auth guard byte-identical — with the ONE deliberate exception that
`geocode-all`'s `?secret=geocode2024` guard is replaced by `requireRole(req,['admin'])`
(a security-positive change, in scope for PR1).

🗣 In plain English: make the three pages obey the company's "Lego" architecture
rule without changing what users see — except the geocode tool gets a real lock
instead of a shared password written in the web address.

---

## Domain terms (plain English)

- **Port** (`lib/ports/`) — a socket shape the app owns. 🗣 The hole in the wall;
  vendors must fit it.
- **Adapter** (`lib/adapters/<vendor>/`) — the plug for one vendor. 🗣 The only place
  postcodes.io or Supabase is ever touched.
- **Service** (`lib/services/`) — business logic over ports, exports factories only.
  🗣 The clerk who knows the rules but not which filing cabinet brand is used.
- **Wiring** (`lib/wiring/`) — composition root; the only business-layer file allowed
  to import adapters. 🗣 The parts list that screws the plug into the socket.
- **Geocoder** — new port: "turn a UK postcode into coordinates." 🗣 A socket that
  answers "where is S70 1KW on a map?"
- **Outcode** — the first half of a UK postcode (`S70 1KW` → `S70`). 🗣 The rough
  area when the exact address can't be found; flagged `approximate`.
- **`requireRole(req, roles)`** (`lib/auth/session.ts`) — existing guard helper.
  🗣 The bouncer that reads the identity headers middleware stamped on the request
  and throws 401/403; we reuse it, don't reinvent it.

---

## Compliance / standing-rules flags

- **No migration in PR1.** No schema change — the `customers` columns
  (`lat`, `lng`, `geocoded_at`, `is_approximate_location`, `created_at`, `active`,
  `postcode`, `name`, `id`) already exist (read+written by the current routes).
  🗣 Nothing changes in the database structure, so no timestamped `.sql` file.
- **No per-user RLS, no auth-guard standardization** beyond the one geocode-all
  guard swap. Service-role singleton stays as the rollback parachute (mirrors the
  F-RLS-04b cutover posture).
- **No new `package.json` dependency.** The postcodes adapter uses raw `fetch` only.
  🗣 No new vendor library to justify.
- **No reformatting** beyond changed lines. The two routes have unusual indentation
  inside the `try` block (e.g. `customers/route.ts:13-16`); leave untouched lines as-is.

---

## ADR conflicts

None. This PR *implements* ADR-0002 (hexagonal shape) where it was previously
breached (raw `supabaseService` + raw `fetch` inside `app/**`). The
`CustomersRepository` port JSDoc at `lib/ports/CustomersRepository.ts:5-16`
*explicitly anticipates* this PR: "F-20 Admin will own the full Customers CRUD when
the admin domain gets rewritten." This plan honours that forward path.

🗣 In plain English: no decision document is being contradicted — one of them
literally predicted this PR and told us to do exactly this.

---

## Critical findings from the codebase scan (verified, line-checked)

1. **A `CustomersRepository` port already exists but is deliberately minimal** —
   one method `findCustomerById(id)`, 4-field `Customer` domain type
   (`id, name, postcode, active`). It is Orders-scoped and **insufficient** for
   PR1, which needs: list-all, update-active, update-postcode-with-geocode-fields,
   bulk-read-ungeocoded, bulk-write-coords. We **EXTEND** the existing port + domain
   type + both adapters + the contract test — we do not create a parallel one.
   🗣 The socket exists but is too small; we widen it rather than drilling a second hole.

2. **The `Customer` domain type lacks geocoding fields.** Current shape
   (`lib/domain/Customer.ts:48-53`) has no `lat/lng/geocoded_at/is_approximate_location/created_at`.
   The admin routes return/write all of these. We add an **admin-view shape** —
   see "Domain decision" below — without breaking the Orders-view callers.

3. **No `CustomersService` and no `lib/wiring/customers.ts` exist yet.** Both are NEW.

4. **`geocode-all` does NOT use `supabaseService`** — it hand-rolls Supabase REST
   `fetch` with raw headers (`lines 16-22, 44-47, 83-86, 112-115`). Its DB access
   must move onto the Customers repository/service, eliminating the raw REST calls.

5. **`geocode-all`'s guard is `?secret=geocode2024` (lines 34-37)** with no identity
   headers required. Swapping to `requireRole(req,['admin'])` depends on middleware
   stamping `x-mfs-user-*` on `/api/admin/geocode-all`. **See Risk R1** — this is the
   one behaviour change and the one operational risk in PR1.

6. **Route-level guard test precedent exists:** `tests/unit/api/admin-users.route.test.ts`
   mocks the wiring singleton and calls the handler directly. Mirror it exactly.

---

## Domain decision — Customer admin-view shape (DECISION, stated)

**Decision:** Add a new domain type `CustomerAdminView` in `lib/domain/Customer.ts`
(same file, exported alongside the existing `Customer`), with the full admin field
set the three routes read/write:

```ts
export interface CustomerAdminView {
  readonly id: string;
  readonly name: string;
  readonly postcode: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly active: boolean;
  readonly created_at: string;            // ISO string, as the route returns it
  // geocoding-write fields (not all returned, but owned by the admin shape)
  readonly geocoded_at?: string | null;
  readonly is_approximate_location?: boolean;
}
```

**Justification:** the existing `Customer` (4 fields) is the *Orders-view* and its
JSDoc forbids bloating it (APOSD "general-purpose by accident"). The admin routes
need a richer view. Keeping them as two named domain types preserves both contracts.
The list/update routes return a **6-field** projection
(`id, name, postcode, lat, lng, active, created_at`) — that exact snake_case shape
must be returned byte-identical, so the route maps the domain view back to the
response object explicitly (same `toAppUser` projection pattern as
`app/api/admin/users/route.ts:30-42`).

🗣 In plain English: the orders pages see a slim customer card; the admin pages need
the full card (coordinates, dates). We keep both labelled cards instead of forcing
one bloated card on everyone. The exact words the screen reads are reproduced by hand
so nothing on screen shifts.

---

## Geocoder port contract (TypeScript signature — the new socket)

New file `lib/ports/Geocoder.ts` (pure TS, no vendor import):

```ts
import type { GeocodeResult } from "@/lib/domain";

export interface Geocoder {
  /**
   * Resolve a single UK postcode to coordinates.
   * Tries the exact postcode first; on miss, retries the OUTCODE (first half),
   * returning approximate:true. Returns null only when both miss.
   * Never throws on a not-found — null is the "not found" answer (APOSD §11).
   * @throws GeocoderError only on a transport/vendor failure (network, 5xx).
   */
  geocode(postcode: string): Promise<GeocodeResult | null>;

  /**
   * Bulk variant for the backfill + import paths. Resolves many postcodes in
   * one or two vendor round-trips (exact bulk, then outcode bulk for misses).
   * Returns a result PER input postcode, keyed by the original (trimmed,
   * upper-cased) postcode; value is null when both exact and outcode miss.
   */
  geocodeMany(postcodes: readonly string[]): Promise<Map<string, GeocodeResult | null>>;
}
```

New domain type in `lib/domain/Customer.ts` (or a new `lib/domain/Geocode.ts`,
exported from the barrel):

```ts
export interface GeocodeResult {
  readonly lat: number;
  readonly lng: number;
  readonly approximate: boolean;   // true = matched on outcode only
}

// thrown by the adapter only on transport failure, never on not-found
export class GeocoderError extends Error { /* name = "GeocoderError" */ }
```

🗣 In plain English: the socket answers two questions — "where is this one postcode?"
and "where are these 50 postcodes?" — and hands back plain coordinates plus an
"is-this-only-approximate?" flag. postcodes.io's raw JSON never escapes the plug.

---

## Fallback-location decision — IN THE ADAPTER (DECISION, stated + justified)

**Decision: the exact→outcode fallback lives INSIDE the postcodes adapter.**

The port contract is "give me a postcode, get a result possibly flagged
`approximate`." The caller never knows or cares that a second outcode round-trip
happened. Putting the fallback in a thin service over a simpler "raw lookup" port
would:
- leak the two-step retry semantics into business logic that doesn't want them,
- create a second port + service for zero business decision (there is no
  business rule here — it's a vendor-coping mechanism),
- duplicate the bulk two-pass logic (`geocode-all` already does exact-then-outcode
  in two passes — that is adapter-level vendor coping, not domain logic).

The `approximate` flag IS part of the owned contract — the domain cares about it
(it's persisted as `is_approximate_location`), so it lives on `GeocodeResult`. But
*how* approximate is computed (outcode retry) is a vendor detail → adapter.

🗣 In plain English: "try the full postcode, then the rough area" is plumbing, not a
business rule, so it belongs inside the postcodes plug — not in the clerk's rulebook.
The only thing the business cares about ("was this only roughly located?") is kept as
a clean flag on the answer.

---

## Exact files to change / create

### NEW files
| Path | Responsibility |
|---|---|
| `lib/ports/Geocoder.ts` | The `Geocoder` port + `GeocoderError`. Pure TS. |
| `lib/domain/Geocode.ts` *(or extend Customer.ts)* | `GeocodeResult` type. Pure TS. |
| `lib/adapters/postcodes/Geocoder.ts` | postcodes.io adapter. ONLY file with the postcodes.io `fetch`. Implements single + bulk, exact→outcode fallback, vendor→`GeocodeResult` mapping. Lazy: reads no env, makes no call at import. |
| `lib/adapters/postcodes/index.ts` | Barrel: `createPostcodesGeocoder`, `postcodesGeocoder`. |
| `lib/adapters/fake/Geocoder.ts` | In-memory `Geocoder` for consumer unit tests (seeded postcode→result map; configurable misses + approximate). No vendor import. |
| `lib/ports/__contracts__/Geocoder.contract.ts` | Shared behavioural contract both adapters pass (exact hit, outcode fallback→approximate, double-miss→null, bulk keying). |
| `lib/wiring/geocoder.ts` | Composition root: binds postcodes adapter to port; exports `geocoder` singleton. No per-caller variant (geocoding is not user-scoped). |
| `lib/services/CustomersService.ts` | `createCustomersService({ customers })` factory + `CustomersService` interface. Methods below. Factory only — no singleton here. |
| `lib/wiring/customers.ts` | Composition root: `customersService` service-role singleton (rollback parachute). |
| `tests/unit/adapters/postcodes/Geocoder.test.ts` | Adapter unit tests (mocked `fetch`). |
| `tests/unit/services/CustomersService.test.ts` | Service unit tests over the Fake repo. |
| `tests/unit/adapters/fake/Geocoder.test.ts` | Fake adapter against the Geocoder contract. |
| `tests/unit/api/admin-customers.route.test.ts` | Route guard + shape tests for `customers` GET and `customers/[id]` PATCH. |
| `tests/unit/api/admin-geocode-all.route.test.ts` | Route guard-CHANGE tests (old secret rejected, admin accepted) + the Geocoder/Customers wiring is mocked. |

### EXTENDED files
| Path | Change |
|---|---|
| `lib/domain/Customer.ts` | Add `CustomerAdminView` interface (keep `Customer` as-is). |
| `lib/domain/index.ts` | Export `CustomerAdminView`, `GeocodeResult`. |
| `lib/ports/CustomersRepository.ts` | Add admin methods (see service section). Keep `findCustomerById`. |
| `lib/ports/index.ts` | Export `Geocoder`, `GeocoderError`. |
| `lib/ports/__contracts__/CustomersRepository.contract.ts` | Add cases for the new methods. |
| `lib/adapters/supabase/CustomersRepository.ts` | Implement new admin methods (the only place the `customers` table SELECT/UPDATE for admin lives). |
| `lib/adapters/fake/CustomersRepository.ts` | Implement new admin methods in-memory. |
| `lib/adapters/supabase/index.ts`, `lib/adapters/fake/index.ts` | (No change needed — barrels already re-export the repo factories.) |
| `lib/services/index.ts` | Export `createCustomersService`, `CustomersService`. |
| `app/api/admin/customers/route.ts` | Replace `supabaseService` import + raw query with `customersService.listAll()` from `@/lib/wiring/customers`; keep the `x-mfs-user-role` guard **byte-identical** (lines 13-16). Map domain view → 6-field response. |
| `app/api/admin/customers/[id]/route.ts` | Replace raw query with `customersService` writes; replace inline `geocodePostcode` (lines 16-39) with `geocoder.geocode(postcode)` from `@/lib/wiring/geocoder`; keep guard (lines 46-49) + the compute-road-times fire-and-forget (lines 105-112) + response shape **byte-identical**. |
| `app/api/admin/geocode-all/route.ts` | Replace `?secret` guard (lines 34-37) with `requireRole(req,['admin'])`; replace raw Supabase REST with Customers service/repo; replace bulk postcodes.io `fetch` with `geocoder.geocodeMany()`; preserve the JSON summary response shape (lines 123-130). |

🗣 In plain English: about six brand-new small files (the two sockets, their plugs,
their test doubles, the wiring), a handful of existing files widened, and the three
routes rewired to call the clerk instead of the database/website.

---

## CustomersService / Repository method surface (what PR1 needs)

Add to `CustomersRepository` (port) + both adapters + contract:

```ts
// reads
listAllCustomers(): Promise<readonly CustomerAdminView[]>;             // customers GET — order by name asc
listUngeocoded(limit: number): Promise<readonly CustomerAdminView[]>; // geocode-all — postcode not null, lat null
// writes
setActive(id: string, active: boolean): Promise<CustomerAdminView | null>;     // [id] PATCH active branch
setPostcodeAndCoords(id: string, fields: {                                     // [id] PATCH postcode branch
  postcode: string; lat: number | null; lng: number | null;
  geocoded_at: string | null; is_approximate_location: boolean;
}): Promise<CustomerAdminView | null>;
setCoords(id: string, fields: {                                                // geocode-all bulk write (per-id)
  lat: number; lng: number; geocoded_at: string; is_approximate_location: boolean;
}): Promise<void>;
```

`CustomersService` is a thin pass-through over these (no business decision beyond
what the routes already do — the postcode-format validation + the geocode call stay
in the route/geocoder, mirroring how `UsersService` keeps route-level validation in
the route). The service exists so `app/**` depends on `lib/services` + `lib/wiring`,
never adapters.

**geocode-all batch question (DECISION):** geocode-all calls
`customersService.listUngeocoded(500)`, then `geocoder.geocodeMany(postcodes)`, then
loops `customersService.setCoords(id, …)` per customer — mirroring the existing
per-row PATCH loop (lines 79-91, 108-120). No dedicated single "batch upsert" method
in PR1 (keeps the repo surface honest; PR3's `import/confirm` may add bulk-insert
later — note only, out of scope).

🗣 In plain English: the clerk gets a short list of new skills — list everyone, find
the ones missing coordinates, flip a customer on/off, save a postcode + its
coordinates, and stamp coordinates onto one customer. The backfill tool uses these
one customer at a time, exactly like today.

---

## Numbered atomic steps (each = one commit; TDD red→green)

1. **Geocoder port + domain type + contract (RED first).** Write
   `lib/ports/Geocoder.ts`, `GeocodeResult` in `lib/domain/Geocode.ts`, barrels,
   and `lib/ports/__contracts__/Geocoder.contract.ts`. Add the Fake
   (`lib/adapters/fake/Geocoder.ts`) and run it against the contract — green.
2. **postcodes.io adapter.** Write `lib/adapters/postcodes/Geocoder.ts` + barrel.
   Unit test with mocked `fetch` (step's RED): exact hit, exact-miss→outcode hit
   (`approximate:true`), double-miss→null, transport error→`GeocoderError`, bulk
   keying + bulk fallback, vendor-shape-never-leaks (assert return is `GeocodeResult`).
   Run the shared contract against it too. Green.
3. **Geocoder wiring.** `lib/wiring/geocoder.ts` singleton. Import-time no-network
   assertion (mirrors `llm.ts` lazy posture).
4. **Extend Customer domain + CustomersRepository port + contract (RED).** Add
   `CustomerAdminView`, the new port methods, new contract cases.
5. **Supabase CustomersRepository admin methods.** Implement; integration test mirrors
   `tests/integration/adapters/supabase/CustomersRepository.test.ts`. Vendor rows
   stay inside the adapter; return `CustomerAdminView`.
6. **Fake CustomersRepository admin methods.** Implement in-memory; pass the extended
   contract.
7. **CustomersService factory.** `lib/services/CustomersService.ts` + barrel export.
   Unit test over the Fake (`tests/unit/services/CustomersService.test.ts`).
8. **Customers wiring.** `lib/wiring/customers.ts` service-role singleton.
9. **Re-point `customers` GET.** Swap to `customersService.listAll()`; keep guard
   byte-identical; map to 6-field response. Route test: guard preserved + shape
   identical.
10. **Re-point `customers/[id]` PATCH.** Swap DB writes to the service; swap inline
    geocode to `geocoder.geocode()`; **preserve** guard, the postcode regex/validation
    branch, the compute-road-times fire-and-forget, and the
    `{...data, _geocoded, _approximate, _warning}` response shape byte-identical.
    Route test covers active-branch, postcode-branch (geocoded + failed), and the
    400 validation branches.
11. **Re-point `geocode-all` GET + guard swap.** Replace `?secret` with
    `requireRole(req,['admin'])`; map `UnauthorizedError`→401 / `ForbiddenError`→403
    exactly like `admin/users/route.ts:53-58`; replace raw REST with the service;
    replace bulk `fetch` with `geocoder.geocodeMany()`; preserve the summary JSON
    shape. Route test: **old `?secret=geocode2024` now 403**, non-admin 403, missing
    identity 401, admin 200 with summary shape.
12. **Lint pin + barrels green.** Confirm `tests/unit/lint/no-adapter-imports.test.ts`
    still passes (no `app/**` adapter import remains; postcodes.io `fetch` only in
    the adapter). Run full unit + integration suites.

🗣 In plain English: build the two sockets and their test stand-ins first (so nothing
else can break while they're unproven), then widen the customer filing-cabinet skills,
then rewire the three pages one at a time, each with a test that screams if the screen
output or the guard changes.

---

## Test matrix (per layer)

| Layer | What it proves | How |
|---|---|---|
| **Unit — Geocoder adapter** | exact hit, outcode fallback→`approximate`, double-miss→null, transport→`GeocoderError`, bulk keying, no vendor-shape leak | mock global `fetch` |
| **Unit — Geocoder contract** | Fake + (where feasible) adapter share one behavioural suite | `Geocoder.contract.ts` |
| **Unit — CustomersService** | each method delegates correctly; mapping to `CustomerAdminView` | Fake repo |
| **Unit — CustomersRepository contract** | new admin methods on BOTH adapters | extend existing contract |
| **Unit — routes** | guard preserved (customers, [id]); guard CHANGED (geocode-all: old secret→403, admin→200); response shapes byte-identical | call handlers directly, mock wiring singletons (precedent: `admin-users.route.test.ts`) |
| **Integration — Supabase repo** | real DB read/write of admin methods | mirror existing repo integration test |
| **Integration — admin routes** (optional, ANVIL) | end-to-end through booted server | mirror `tests/integration/admin-users.test.ts` |

Response-shape preservation is the load-bearing assertion: snapshot the exact keys
the current routes return (`customers` GET → array of
`{id,name,postcode,lat,lng,active,created_at}`; `[id]` PATCH → that plus
`{_geocoded,_approximate,_warning}`; `geocode-all` →
`{message,total_input,geocoded,approximate,failed,failed_list}`).

---

## Acceptance criteria

- No file under `app/**` imports `@/lib/adapters/**` or makes a postcodes.io/raw
  Supabase REST `fetch`. (`no-adapter-imports` lint pin green.)
- postcodes.io `fetch` appears in exactly one file: `lib/adapters/postcodes/Geocoder.ts`.
- All three routes return byte-identical JSON shapes (proven by route tests), EXCEPT
  geocode-all's guard: `?secret=geocode2024` now returns 403; admin returns the same
  summary shape.
- Rip-out test passes for both sockets (see below).
- No new `package.json` entry. No migration. No reformatting beyond changed lines.
- Full unit + integration suites green.

---

## Rip-out test statement

- **Geocoder:** replace postcodes.io with another geocoding vendor =
  one new `lib/adapters/<vendor>/Geocoder.ts` + one line in `lib/wiring/geocoder.ts`.
  The port, `GeocodeResult`, the three routes, the Customers service, and every test
  using the Fake are untouched. **PASS.**
- **Customers DB:** replace Supabase = one new
  `lib/adapters/<vendor>/CustomersRepository.ts` + one line in `lib/wiring/customers.ts`.
  Routes/service/domain untouched. **PASS.**

🗣 In plain English: swap the postcode website or the database tomorrow and you touch
one plug plus one wiring line each — nothing on the pages or in the rules moves.

---

## Risk Assessment

### R1 — geocode-all guard swap may break the live backfill tool — **HIGH, MUST-FIX-VERIFY**
Today geocode-all is reachable by anyone with the URL `?secret=geocode2024` and
needs **no logged-in session**. After the swap it requires middleware to have stamped
`x-mfs-user-id` + `x-mfs-user-role=admin` on `/api/admin/geocode-all`. There is a
**live 19-customer prod backlog** to geocode through this route.
- **Severity:** HIGH (operational — could leave the route un-callable in the way the
  operator currently calls it: a browser/curl hit with a query string).
- **Must-fix action (Render/Guard):** confirm `middleware.ts` matches
  `/api/admin/*` and stamps the identity headers for an authenticated admin session,
  AND confirm how the operator will actually invoke geocode-all post-swap (logged-in
  admin in a browser, NOT a bare curl). If the operator relies on curl, document the
  authenticated-call recipe (cookie/headers) in the PR, or the backlog cannot be
  cleared. This must be resolved before merge.
- 🗣 In plain English: we're replacing a password-in-the-URL with a real admin lock.
  Good for security — but we must make sure the person who runs the 19-customer
  backfill can still get in the new way, or the tool becomes a locked door.

### R2 — response-shape drift (silent UI break) — **MEDIUM, MUST-FIX (tests)**
The admin UI reads exact snake_case keys (`created_at`, `_warning`, `failed_list`).
A camelCase domain leak or a dropped key breaks the screen with no error.
- **Mitigation:** explicit field-by-field projection in each route (the `toAppUser`
  pattern) + per-route shape-snapshot tests asserting exact keys. Must be green.
- 🗣 In plain English: the pages expect the answer worded exactly so; we re-word the
  clerk's answer back into that exact form by hand and a test guards every word.

### R3 — postcodes.io single vs bulk semantic divergence — **MEDIUM**
Single lookup uses `/postcodes/{pc}` + `/outcodes/{oc}`; bulk uses POST `/postcodes`
+ POST `/outcodes` with different result shapes (`result[].query` vs `result[].outcode`).
Folding both behind one adapter risks subtle mapping bugs (e.g. case-normalization of
the bulk key, which the current code does at lines 70, 80, 104).
- **Mitigation:** preserve the EXACT key-normalization (`.toUpperCase()`, `.trim()`)
  from the current code; unit-test bulk keying explicitly with mixed-case inputs.
- 🗣 In plain English: the website answers one-at-a-time and many-at-a-time in slightly
  different formats; the plug must speak both dialects and match them up correctly.

### R4 — concurrency / race conditions — **LOW**
geocode-all does sequential per-row writes (no parallelism, no transaction today).
PR1 preserves the sequential loop. No new race introduced. The compute-road-times
fire-and-forget is preserved as-is (already race-tolerant by design).
- **Assessment:** no material new concurrency risk.

### R5 — security — **LOW (net positive)**
The geocode-all guard upgrade is a security *improvement* (R1 covers the operational
flip side). The other two guards are byte-preserved. The service-role singleton is
retained as the rollback parachute (same posture as already-shipped admin cutovers) —
RLS is NOT switched on in PR1, so no new privilege-escalation surface.
- **Assessment:** no new security risk; one security improvement.

### R6 — data migration — **NONE**
No schema change, no data migration. (Confirmed: all columns pre-exist.)

### R7 — business-logic flaw — **LOW**
The one judgment call (fallback in adapter vs service) is decided + justified above.
Postcode validation regex (`[id]` route line 14, 75) stays in the route unchanged.
- **Assessment:** no material business-logic risk if the validation branch is preserved verbatim.

### Risk headline for the conductor
**One MUST-FIX-VERIFY (R1):** the geocode-all guard swap must be proven callable by
the operator the new way before merge, given the live 19-customer prod backlog — this
is a Gate 2 condition. R2 (shape tests) is must-fix but fully addressed by the test
plan. No must-fix BLOCKER that changes the plan's shape; R1 is a verification gate, not
a redesign.

---

## OUT OF SCOPE for PR1 (do NOT touch)

- **PR2 routes:** `products`, `prospects`, `at-risk`, `commitments`.
- **PR3 routes:** `import/manual`, `import/confirm`, `map/data`. *(Note: PR3's
  `import/confirm` and `map/data` will CONSUME `geocodeMany` + the Customers service
  this PR builds — they are the reason the bulk method exists now.)*
- **Per-user RLS switch-on** and **auth-guard standardization** → F-RLS-04i (later).
  The two preserved guards stay hand-rolled `x-mfs-user-role` checks for now.
- **The compute-road-times fire-and-forget** in `customers/[id]` — preserved as-is,
  not re-pointed.
- **Deleting geocode-all** — explicitly KEPT (live backlog).
- **Any schema/migration change.** None needed.
- **Bulk-insert / upsert repo method** — deferred to PR3's import path if needed.

🗣 In plain English: this PR builds the two sockets and rewires three pages only.
The other seven admin pages, the RLS lockdown, and the road-time trigger are
deliberately left for their own turns — but we build the bulk geocoder now because
two later pages will plug into it.
