# F-01 (narrowed) — Consolidate `lib/road-times.ts` onto `supabaseService`

## Goal

F-01 ships the **narrowed Phase 0 deliverable** that the v1.2 architecture review called for and that the 2026-06-07 grill subsequently re-scoped: a single, surgical refactor of `lib/road-times.ts` so it stops constructing its own ad-hoc Supabase service client and instead uses the central `supabaseService` exported from `lib/supabase.ts`. Concretely, four lines change in the source file — line 15's `import { createClient } from '@supabase/supabase-js'` becomes `import { supabaseService } from '@/lib/supabase'`, and the seven-line client-construction block at lines 32–39 collapses to direct use of `supabaseService` as the query client. Two unstructured `console.*` calls in the same file (line 50's `console.warn` after a DB error, line 61's `console.log` summarising cache hits) migrate to the structured logger from `lib/observability/log.ts` shipped by F-FND-03 — picking up `Caller` context automatically and emitting JSON-line logs that Vercel ingests cleanly. The intentional **swallow-and-fallback contract** — on DB error, `loadRoadTimes()` returns an empty-but-callable `RoadTimeMatrix` so `exactTSP` falls back to haversine — is preserved verbatim, because failing a delivery-route optimisation because a cache table failed to load is a user-visible regression the original code deliberately avoids. A new integration test at `tests/integration/road-times.test.ts` covers three cases (happy-path lookup, missing-pair `null` return, DB-error fallback) against the F-INFRA-01 local Supabase stack and proves the contract end-to-end.

**What this unit explicitly does NOT do:**

- Does **not** introduce or move anything behind a port. F-14 (Customers / addresses) will eventually own a `RoadTimesRepository` port; F-01 does not pre-empt that.
- Does **not** migrate `/api/routes/optimise/route.ts` to `withRequestContext`. That route migration belongs to its own unit and depends on F-03's `requireRole` helper.
- Does **not** touch `/api/routes/compute-road-times/route.ts`, even though it has its own `console.*` calls. That route is a separate Phase 1+ concern and is owned by whichever future unit absorbs road-times caching as a domain.
- Does **not** touch any of the **thirteen raw-fetch sites** that ADR-0005's Per-Site Map assigns to specific Phase 1+ units (F-17 Complaints, F-20 Admin, F-18 Visits, F-16 Cash, F-15 Pricing + F-11 Mailer).
- Does **not** edit the "Centralised here" comment at `lib/supabase.ts:9`. That comment becomes true at the end of Phase 5 when every raw-fetch site has been ported to its domain's repository — updating it earlier would lie about the actual state.

---

## Source spec

- **ADR-0005** — `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md`. The full rationale for narrowing F-01 to the SDK swap only and deferring the thirteen raw-fetch sites to their owning Phase 1+ units. Key paragraphs: the **Decision** (lines 24–29) frozen exactly as this plan implements, the **Per-Site Map** table (lines 31–46) listing the thirteen deferred sites and their future homes, and the **Consequences** (lines 51–61) documenting the "centralised client is gradually true" milestone trade-off.
- **Architecture review v1.2 addendum** — `docs/architecture-review-2026-06-06.md` lines 389–400 (2026-06-07 addendum, _"F-01/F-02 narrowed (see ADR-0005)"_). The addendum overrides the original F-01 framing at line 318 (_"Consolidate 14 inline Supabase clients onto `supabaseService`. (1 PR)"_) and the F-02 framing at line 319 (_"Fix `lib/road-times.ts` to use `supabaseService`. (1 PR — can be folded into F-01)"_). F-01 and F-02 are now the same unit.
- **ADR-0002** — `docs/adr/0002-hexagonal-shape-and-naming.md`. The dependency rule (line 21) and the rip-out test (line 25). F-01 **fails the rip-out test by design** — see Compliance section below. That failure is explicitly accepted in ADR-0005 because the work will be done properly when each owning Phase 1+ unit extracts its port.
- **ADR-0003** — `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`. The strangler-fig sequencing this unit slots into (Phase 0 = stop the bleeding). F-04 (the ESLint guard that activates the FREEZE rule) lands as **rule A only** per ADR-0005 — F-01's change reduces the SDK-leak surface from two files (`lib/supabase.ts` + `lib/road-times.ts`) to one (`lib/supabase.ts` + the future `lib/adapters/supabase/**`).
- **F-FND-03 cert** — `docs/anvil/2026-06-07-f-fnd-03-cert.md` (referenced; not read here — the cert names the `log.info` / `log.warn` / `log.error` API shipped in `lib/observability/log.ts`).
- **F-INFRA-01 cert** — `docs/anvil/2026-06-07-f-infra-01-cert.md` (referenced; not read here — the cert documents the local Supabase stack and the `assertLocalStackReachable` probe that integration tests rely on).
- **Locked Gate 1 spec** — the conductor handoff above. Frozen; no clarifications taken in planner; ambiguities flagged for Gate 2 in the Risks section.

---

## Compliance

**NO runtime compliance impact.** No changes to auth, payments, HACCP, data retention, document control, food-safety legislation, or financial logic. The change is observably behaviour-preserving: same query (`select from_id, to_id, duration_s from customer_road_times where from_id in (...) and to_id in (...)`), same return shape (`RoadTimeMatrix`), same swallow-and-fallback semantics on error, same exports (`MFS_HUB_ID`, `OZMEN_HUB_ID`, `RoadTimeMatrix`, `loadRoadTimes`) consumed by exactly the same two callers (`app/api/routes/optimise/route.ts:38` for the imports, `:547` for the call; `app/api/routes/compute-road-times/route.ts:22` for the hub-ID imports only).

**ADR-0002 rip-out test — F-01 fails the rip-out test by design.** This must be stated plainly so a future reader doesn't think it was an oversight. ADR-0002 line 25 asks: _"If I rip out the DB tomorrow and replace it, how many files change?"_ The intended answer is one adapter + one config line. After F-01 lands, the answer for `loadRoadTimes()` is still **two files** — `lib/supabase.ts` (the central client construction) and `lib/road-times.ts` (which still imports the SDK indirectly through that central client and still writes the PostgREST query inline as a `.from('customer_road_times').select(...)` call). The work to bring this to one file (a `RoadTimesRepository` port + adapter in `lib/adapters/supabase/road-times.ts`) is **explicitly deferred** to the Phase 1+ unit that owns customers/addresses (F-14 per ADR-0003's strangler-fig sequencing). ADR-0005 records the rationale: doing the port extraction in F-01 would force `app/api/routes/optimise/route.ts` to be rewritten twice — once to call `roadTimesRepository.load(...)`, then a second time when the rest of the optimise route migrates behind its own service in the owning Phase 1+ unit. The smaller, honest move is to consolidate onto the central SDK client now (reducing the SDK-leak surface to one file plus the central one) and absorb the port extraction inside the owning unit's port-extraction PR.

**ADR-0003 strangler-fig posture.** F-01 sits squarely inside Phase 0 (_stop the bleeding_). It does not move any vendor-specific type past an adapter boundary that would later have to be undone — the only vendor-specific type the file currently exposes is the implicit Supabase query-builder shape inside `loadRoadTimes`, and that shape is unchanged by the swap. The function's public contract (`RoadTimeMatrix.get(from, to): number | null`) is already a clean domain abstraction; the implementation behind it is what changes.

**ADR-0004 RLS posture.** No change. `customer_road_times` has **no RLS policy** (verified at `supabase/migrations/20260101000000_baseline.sql:397–409`) and grants `SELECT`/`INSERT`/`UPDATE`/`DELETE` to `anon`, `authenticated`, and `service_role` (lines 2577–2579). The query continues to run as service-role via `supabaseService` — same access level as the old ad-hoc client built with `SUPABASE_SERVICE_ROLE_KEY`. **Belt-and-braces note for Gate 2:** the table's open grants to `anon` are a separate F-RLS concern surfaced by the RLS audit track (F-RLS-01); not in scope here, but flagged so the reviewer sees the planner noticed.

---

## Branch + base

- **Base:** `main` HEAD `9c25a37` — `feat(testing): local Supabase stack + Playwright API/UI scaffolding (F-INFRA-01) (#18)`. Verified via `git rev-parse origin/main` returns `9c25a370c4f5edd373fac1b4907c3daa6c947fe1`.
- **Branch:** `f-01-consolidate-road-times-client` (matches the conductor brief verbatim; not `forge/...` because the brief names the branch directly).
- **PR target:** `main`. **Not auto-merged.** Hakan ships via the same squash-merge flow as #15–#18 once ANVIL gates pass.
- **PR title:** `refactor(road-times): consolidate onto supabaseService (F-01 narrowed)`.

---

## 1. Repo recon findings

Captured before planning. Every claim below grounded in the actual files on `main` HEAD `9c25a37`.

1. **`lib/road-times.ts` is 64 lines, single function `loadRoadTimes()` + two hub-ID consts + one interface.** Full content read; line numbers used in the plan match the file exactly. Line 15 is the ad-hoc SDK import; lines 32–39 contain the function signature plus the four-line `createClient(...)` block; line 50 is the `console.warn` on DB error; line 61 is the `console.log` cache-hit summary. The export surface (`MFS_HUB_ID`, `OZMEN_HUB_ID`, `RoadTimeMatrix`, `loadRoadTimes`) is unchanged after this PR.
2. **`lib/supabase.ts` is the central client.** 19 lines. Exports `supabaseService = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)`. Identical key/URL pair to the current ad-hoc construction in `road-times.ts:36–39`. The swap is therefore observably behaviour-preserving — same key, same URL, same client config (default auth options: persistSession off in the central client too, per the default `createClient` behaviour). The header comment at line 9 (_"Centralised here so the key rotation or URL change needs only one edit"_) is **left untouched** per locked spec — it becomes truthful only at the end of Phase 5 when every raw-fetch site has been ported.
3. **Callers of `loadRoadTimes` — exactly one.** `grep -rn "loadRoadTimes\|road-times\|MFS_HUB_ID\|OZMEN_HUB_ID\|RoadTimeMatrix" --include="*.ts" --include="*.tsx"` returns:
   - `app/api/routes/optimise/route.ts:38` — imports `loadRoadTimes, MFS_HUB_ID, OZMEN_HUB_ID, type RoadTimeMatrix`.
   - `app/api/routes/optimise/route.ts:544` — uses `MFS_HUB_ID` / `OZMEN_HUB_ID`.
   - `app/api/routes/optimise/route.ts:547` — the sole call: `const roadTimes = await loadRoadTimes([...stopIds, originId], hubId)`.
   - `app/api/routes/compute-road-times/route.ts:22` — imports `MFS_HUB_ID, OZMEN_HUB_ID` only; does not call `loadRoadTimes`.
   - `scripts/test-routing-engine.ts:1026, 1031, 1040, 1046` — a standalone Node script (not under any test runner; not part of `npm test` / `npm run test:integration`) that mocks `RoadTimeMatrix` for in-repo algorithm exploration. Not a real test file; lives outside `tests/`. **Confirmation requested at Gate 2:** the conductor brief asks the planner to confirm no test file exercises `loadRoadTimes` — confirmed, with the caveat that this standalone script references `RoadTimeMatrix` by type name only and is not affected by the refactor.
4. **`exactTSP` consumes the matrix via `roadTimes.get(aId, bId)` and falls back to haversine when the result is `null`.** Read at `app/api/routes/optimise/route.ts:122–133`. The empty-but-callable matrix returned on DB error (`{ get: () => null }` at `road-times.ts:51`) drives `dist2` into the haversine path on every pair — exactly the original intent. The integration test's DB-error case must assert this contract (every `.get()` returns `null`, no throw) and not assert any specific log shape.
5. **`customer_road_times` schema.** `supabase/migrations/20260101000000_baseline.sql:397–409`:
   ```sql
   CREATE TABLE IF NOT EXISTS "public"."customer_road_times" (
     "from_id"     uuid                       NOT NULL,
     "to_id"       uuid                       NOT NULL,
     "duration_s"  integer                    NOT NULL,
     "distance_m"  integer                    NOT NULL,
     "computed_at" timestamp with time zone DEFAULT now() NOT NULL
   );
   ```
   Primary key: composite `(from_id, to_id)` (line 1380–1381). Indexes: `crt_age_idx` on `computed_at`, `crt_from_idx` on `from_id`, `crt_to_idx` on `to_id`. **No RLS** (no `ENABLE ROW LEVEL SECURITY` for this table anywhere in the migration). **No FK constraints to `customers`** — the table comment at line 409 explicitly notes the hub sentinel UUIDs (`00000000-...-0001` MFS, `00000000-...-0002` Ozmen) are not customers. **Implication for the test seed:** the test can insert arbitrary UUID pairs without first creating matching `customers` rows. Both `duration_s` and `distance_m` are NOT NULL — the seed must populate both even though `loadRoadTimes` only selects `duration_s`. The test cleanup deletes by `(from_id, to_id)` pair using its own test prefix UUIDs.
6. **No seed for `customer_road_times` in `supabase/seed.sql`.** Read end-to-end (40 lines) — seed populates only `users`. The integration test must seed its own rows (and clean up after itself). This matches the pattern in `orders-crud.test.ts` and `picking-list.test.ts` (both create + delete fixtures inside `beforeAll` / `afterAll`).
7. **Existing integration-test rails are exactly what the conductor brief names.** Inspected:
   - `tests/integration/_setup.ts` (260 lines) — exports `getServiceClient()`, `TEST_PREFIX = 'ANVIL-TEST-'`, `setupTestUsers()`, `setupTestCustomer()`, `getTestProduct()`, `api()`, `cleanupTestData()`, `assertLocalStackReachable()`. Has production-safety guard at lines 38–43 (throws if URL matches prod project ref). Lines 30–35 throw if `SUPABASE_SERVICE_ROLE_KEY` is unset.
   - `tests/integration/_loadEnv.ts` (12 lines) — loads `.env.test.local` via `dotenv` before any test runs.
   - `vitest.integration.config.ts` (39 lines) — runs `tests/integration/**/*.test.ts`, `setupFiles: ['./tests/integration/_loadEnv.ts', './tests/integration/_assertStack.ts']`, `pool: 'forks', isolate: false, fileParallelism: false` (single-fork serial — shared DB state).
   - `tests/integration/_assertStack.ts` invokes `assertLocalStackReachable()` once per run; fails fast with a clear message if `supabase start` hasn't been run.
   - Existing pattern in `picking-list.test.ts` and `orders-crud.test.ts`: `beforeAll` populates fixtures (`setupTestUsers`, `setupTestCustomer`, `getTestProduct`, `cleanupTestData`); `afterAll` calls `cleanupTestData()`. Each test creates more rows as needed and asserts via `getServiceClient()` direct SQL.
8. **Observability foundations.** `lib/observability/log.ts` exports `log.info`, `log.warn`, `log.error` (signature `(msg: string, fields?: LogFields) => void`). Each emits one JSON line with `{ level, msg, ts, ...callerFields, ...fields }`. `log.warn` routes to `console.warn`; `log.info` routes to `console.log`. Crucially: **when `loadRoadTimes` is called from `/api/routes/optimise/route.ts:547` and that route is later wrapped in `withRequestContext` (different unit), the log line will automatically carry the request's correlationId.** Today, the optimise route is **not** yet wrapped — so the log line will lack `correlationId`. F-FND-03 docs this explicitly. The structured payload (`{ hits, pairs }` for info, `{ error: error.message }` for warn) is still strictly better than today's interpolated string.
9. **F-INFRA-01 local stack rails.** `package.json:16–18`: `npm run db:up` → `supabase start`, `npm run db:reset` → `supabase db reset`, `npm run db:down` → `supabase stop`. `npm run test:integration` (line 12) is the runner. The conductor brief's reference to "F-INFRA-01 local-stack rails" maps cleanly to: bring the stack up, run `npm run test:integration -- road-times`, the test seeds + cleans up its own rows.
10. **No new package.json deps required.** `@supabase/supabase-js` is already at `^2.39.0` and used by `lib/supabase.ts`. The structured logger is already available via `@/lib/observability`. `vitest` and `dotenv` already devDeps. **Assertion for the implementer:** `git diff main package.json` must be empty when this PR lands. If a dep is added inadvertently, ANVIL Gate 4 fails.
11. **Plan filename convention.** `2026-06-07-f-01-consolidate-road-times-client.md` — matches the conductor brief's verbatim spec. Same date as F-FND-03 and F-INFRA-01.
12. **Commit-message convention.** Recent history on `main`: `feat(testing):` (F-INFRA-01), `feat(observability):` (F-FND-03), `feat(errors):` (F-FND-02), `docs(adr):` (F-FND-01), `docs(roadmap):` (v1.2 roadmap). F-01 is a refactor, not a feature — the conductor brief names `refactor(road-times):` for the PR title and `refactor(road-times):` / `test(integration):` for individual commits. Plan adopts that scheme verbatim.
13. **Co-author trailer.** Matches F-FND-02/03/INFRA-01 exactly: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` on every commit.
14. **No DB migrations.** This unit does not modify schema, does not add migrations, does not touch `supabase/migrations/`. Therefore the standing PITR / migration-safety hook does not fire at Gate 4. The plan calls this out explicitly so ANVIL doesn't expect a migration manifest.
15. **TypeScript / lint baseline.** Per the F-FND-03 cert pattern, `npx tsc --noEmit` and `npm run lint` are run as **calibrated** gates: zero NEW violations attributable to F-01-touched files (`lib/road-times.ts` and `tests/integration/road-times.test.ts`). The ~60 pre-existing `tsc` errors and the pre-existing ESLint nits are F-TD-01's responsibility, not this PR's.

---

## 2. File-by-file changes

### Modified files (1)

| Path                | Edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/road-times.ts` | Replace the SDK import (line 15) with the central-client import. Delete the ad-hoc `createClient(...)` block (lines 36–39) and bind `supabase` directly to the imported `supabaseService` (or use `supabaseService` directly in the `.from(...)` chain — see skeleton below). Replace `console.warn(...)` (line 50) with `log.warn('road-times cache load failed, using haversine fallback', { error: error.message })`. Replace `console.log(...)` (line 61) with `log.info('road-times cache loaded', { hits: hitCount, pairs: pairCount })`. Add `import { log } from '@/lib/observability'` and `import { supabaseService } from '@/lib/supabase'` in the import block. The file's public surface (`MFS_HUB_ID`, `OZMEN_HUB_ID`, `RoadTimeMatrix` interface, `loadRoadTimes` signature) is **unchanged**. The header doc comment (lines 1–13) is **untouched** — the function's purpose hasn't changed. |

### New files (1)

| Path                                   | Purpose                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/road-times.test.ts` | Three integration cases against the local Supabase stack: (a) happy-path lookup, (b) missing-pair returns `null`, (c) DB-error returns empty matrix without throwing. Seeds `customer_road_times` rows directly with `TEST_PREFIX`-derived UUIDs; cleans up in `afterAll`. Matches the style of `tests/integration/picking-list.test.ts` and `tests/integration/orders-crud.test.ts`. |

### `lib/road-times.ts` — before / after diff intent

**Before (current `main` HEAD `9c25a37`):**

```ts
import { createClient } from "@supabase/supabase-js";

export const MFS_HUB_ID = "00000000-0000-0000-0000-000000000001";
export const OZMEN_HUB_ID = "00000000-0000-0000-0000-000000000002";

export interface RoadTimeMatrix {
  get(fromId: string, toId: string): number | null;
}

export async function loadRoadTimes(
  stopIds: string[],
  hubId: string,
): Promise<RoadTimeMatrix> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const allIds = [...new Set([...stopIds, hubId])];

  const { data, error } = await supabase
    .from("customer_road_times")
    .select("from_id, to_id, duration_s")
    .in("from_id", allIds)
    .in("to_id", allIds);

  if (error) {
    console.warn(
      "[road-times] Failed to load cache — will use haversine fallback:",
      error.message,
    );
    return { get: () => null };
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(`${row.from_id}:${row.to_id}`, row.duration_s);
  }

  const hitCount = data?.length ?? 0;
  const pairCount = allIds.length * allIds.length;
  console.log(`[road-times] Loaded ${hitCount}/${pairCount} cached pairs`);

  return { get: (from, to) => map.get(`${from}:${to}`) ?? null };
}
```

**After (target shape):**

```ts
import { supabaseService } from "@/lib/supabase";
import { log } from "@/lib/observability";

export const MFS_HUB_ID = "00000000-0000-0000-0000-000000000001";
export const OZMEN_HUB_ID = "00000000-0000-0000-0000-000000000002";

export interface RoadTimeMatrix {
  get(fromId: string, toId: string): number | null;
}

export async function loadRoadTimes(
  stopIds: string[],
  hubId: string,
): Promise<RoadTimeMatrix> {
  const allIds = [...new Set([...stopIds, hubId])];

  const { data, error } = await supabaseService
    .from("customer_road_times")
    .select("from_id, to_id, duration_s")
    .in("from_id", allIds)
    .in("to_id", allIds);

  if (error) {
    log.warn("road-times cache load failed, using haversine fallback", {
      error: error.message,
    });
    // CONTRACT: exactTSP relies on the empty-matrix return to fall back to
    // haversine — never throw here.
    return { get: () => null };
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(`${row.from_id}:${row.to_id}`, row.duration_s);
  }

  const hitCount = data?.length ?? 0;
  const pairCount = allIds.length * allIds.length;
  log.info("road-times cache loaded", { hits: hitCount, pairs: pairCount });

  return { get: (from, to) => map.get(`${from}:${to}`) ?? null };
}
```

**Diff at a glance:**

- One import-line replacement: `createClient` from `@supabase/supabase-js` → `supabaseService` from `@/lib/supabase`.
- One added import: `log` from `@/lib/observability`.
- Six lines deleted (the `const supabase = createClient(...)` block plus the blank line before `const allIds`).
- One reference renamed: `supabase.from(...)` → `supabaseService.from(...)` in the query chain.
- One `console.warn(...)` line replaced by a `log.warn(...)` line with structured `{ error }` payload.
- One `console.log(...)` line replaced by a `log.info(...)` line with structured `{ hits, pairs }` payload.

Net: **the file shortens by ≈4 lines.** The header comment (lines 1–13), the two exported hub-ID consts, the `RoadTimeMatrix` interface, and the function signature all stay byte-for-byte identical. The query body (the `.from('customer_road_times').select(...).in(...).in(...)` chain) is identical in shape — only the client object changes.

### `tests/integration/road-times.test.ts` — skeleton

```ts
/**
 * tests/integration/road-times.test.ts
 *
 * F-01 (narrowed) — proves loadRoadTimes() behaviour end-to-end against
 * the local Supabase stack (F-INFRA-01). Three cases:
 *
 *   (a) Happy path     — seeded pairs are returned by .get(from, to).
 *   (b) Missing pair   — .get() returns null for any non-seeded pair.
 *   (c) DB error       — when the query fails, loadRoadTimes() returns
 *                        a matrix where .get() always returns null AND
 *                        does NOT throw. This is the swallow-and-fallback
 *                        contract that exactTSP relies on for haversine.
 *
 * Fixture strategy:
 *   - Insert rows into customer_road_times directly via the service
 *     client. The table has no FK to customers, so arbitrary test UUIDs
 *     are fine.
 *   - Use a TEST_PREFIX-derived UUID range so cleanup is unambiguous.
 *   - afterAll deletes by (from_id, to_id) pairs created here. No other
 *     test currently writes to this table, so a `.delete().in(from_id, [...])`
 *     by our test UUIDs is sufficient.
 *
 * Run with the local stack up:
 *   npm run db:up                              (in one terminal)
 *   npm run test:integration -- road-times     (in another)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { loadRoadTimes } from "@/lib/road-times";
import { getServiceClient } from "./_setup";

// Stable, recognisable UUIDs for the three test "customers". The "f01"
// fragment makes them greppable if a row leaks past cleanup.
const A_ID = "00000000-0000-0000-0000-00000000f001";
const B_ID = "00000000-0000-0000-0000-00000000f002";
const C_ID = "00000000-0000-0000-0000-00000000f003";
const HUB = "00000000-0000-0000-0000-000000000001"; // MFS_HUB_ID

const TEST_IDS = [A_ID, B_ID, C_ID, HUB];

async function cleanup() {
  const supa = getServiceClient();
  await supa.from("customer_road_times").delete().in("from_id", TEST_IDS);
}

describe("lib/road-times.loadRoadTimes integration", () => {
  beforeAll(async () => {
    await cleanup();
    const supa = getServiceClient();
    // Seed two known directional pairs:
    //   A → B = 180s
    //   B → A = 200s
    //   A → HUB = 600s
    // Intentionally do NOT seed B → HUB so case (b) has a definite miss.
    const { error } = await supa.from("customer_road_times").insert([
      { from_id: A_ID, to_id: B_ID, duration_s: 180, distance_m: 4_000 },
      { from_id: B_ID, to_id: A_ID, duration_s: 200, distance_m: 4_100 },
      { from_id: A_ID, to_id: HUB, duration_s: 600, distance_m: 9_500 },
    ]);
    if (error) throw new Error(`seed failed: ${error.message}`);
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  // ── (a) Happy path ──────────────────────────────────────────

  it("returns seeded duration_s on cache hit", async () => {
    const m = await loadRoadTimes([A_ID, B_ID], HUB);
    expect(m.get(A_ID, B_ID)).toBe(180);
    expect(m.get(B_ID, A_ID)).toBe(200);
    expect(m.get(A_ID, HUB)).toBe(600);
  });

  // ── (b) Missing pair ────────────────────────────────────────

  it("returns null for a pair not present in the cache", async () => {
    const m = await loadRoadTimes([A_ID, B_ID], HUB);
    // B → HUB was deliberately not seeded.
    expect(m.get(B_ID, HUB)).toBeNull();
    // Same for an entirely unrelated UUID.
    expect(m.get(C_ID, A_ID)).toBeNull();
  });

  // ── (c) DB-error fallback ───────────────────────────────────

  it("returns an empty matrix without throwing when the query fails", async () => {
    // Trigger a query error by passing a value that PostgREST will
    // reject inside the .in() filter. The cleanest way that does NOT
    // pollute the DB is to construct a custom failure path. Strategy
    // chosen (see Risk #2 for alternatives weighed):
    //
    //   Pass an oversized array of malformed (non-UUID) string IDs.
    //   PostgREST will reject the `from_id=in.(...)` filter on the
    //   first non-UUID value with a 400 error. loadRoadTimes() catches
    //   the {data, error} return from the SDK and enters the
    //   swallow-and-fallback branch.
    //
    // Crucially: this never inserts, updates, or deletes anything.

    // Scoped spy on console.warn — log.warn routes to console.warn under
    // the hood. The spy is restored at the end of the test so it does not
    // leak into other tests (pattern mirrors tests/integration/withErrors).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const badIds = ["not-a-uuid", "also-not-a-uuid"];
      const m = await loadRoadTimes(badIds, "still-not-a-uuid");

      // Contract part 1: every .get() must return null; nothing throws.
      expect(m.get(badIds[0], badIds[1])).toBeNull();
      expect(m.get(A_ID, B_ID)).toBeNull(); // also null — empty matrix
      expect(m.get(HUB, A_ID)).toBeNull();

      // Contract part 2: log.warn fired with the structured payload.
      // Each log.* call emits exactly one JSON line to its console handle.
      expect(warnSpy).toHaveBeenCalled();
      const lastLine = warnSpy.mock.calls.at(-1)?.[0] as string;
      const parsed = JSON.parse(lastLine);
      expect(parsed.level).toBe("warn");
      expect(parsed.msg).toBe(
        "road-times cache load failed, using haversine fallback",
      );
      // error.message is non-empty (the PostgREST UUID-syntax error).
      expect(typeof parsed.error).toBe("string");
      expect(parsed.error.length).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
```

**What each test asserts, summarised for ANVIL Gate 3:**

- **(a) Happy path.** Seeded rows are retrievable via `.get(from, to)` and the returned value equals the seeded `duration_s`. Proves: import wiring, central-client construction, the `.from('customer_road_times').select(...).in(...).in(...)` chain, the Map key encoding, and the success-branch return.
- **(b) Missing pair.** `.get()` returns `null` for any pair not in the seeded data. Proves: the `Map.get(...) ?? null` fallback at the bottom of the success branch. Important because exactTSP relies on `null` to trigger the haversine fallback **per pair**, not just on whole-query failure.
- **(c) DB-error fallback.** Triggering a query failure (malformed UUIDs in the `.in()` filter — see Risk #2 for the strategy choice) returns a matrix where every `.get()` returns `null` and the function does not throw. Proves: the error branch at `road-times.ts:50–52` still works (the new `log.warn` does not throw under any circumstance, even with the structured logger), and the empty-matrix shape is callable. **Also asserts** (per Gate 2 decision) that `log.warn` emitted exactly one structured JSON line with `level: "warn"`, the expected message, and a non-empty `error` field — proving both the contract AND the observability wiring fired correctly.

**Why three cases is enough.** Together they exercise every branch of `loadRoadTimes()`: success-with-hits, success-with-misses (the `?? null` at the bottom), and error. There is no additional code path. A fourth case (DB up, query returns zero rows) collapses into case (b)'s assertion (the matrix exists, all `.get()` calls return `null`); not worth a separate test.

---

## 3. Implementation steps (ordered, atomic, each its own commit)

1. **Cut the branch.** `git checkout -b f-01-consolidate-road-times-client` off `main` HEAD `9c25a37`. Confirm `git rev-parse origin/main` matches `9c25a370c4f5edd373fac1b4907c3daa6c947fe1`.
2. **Confirm clean-tree baseline.** Run `npm test` (unit suites must exit 0 — F-INFRA-01 + F-FND-03 baseline). Run `npm run test:integration` against an already-running local Supabase to confirm existing 5 integration suites pass. If either fails, STOP and report — F-01 does not fix orthogonal rot.
3. **Verify `customer_road_times` schema matches the recon.** Quick sanity check via `supabase status` + a `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customer_road_times'`. Columns must be `from_id (uuid)`, `to_id (uuid)`, `duration_s (integer)`, `distance_m (integer)`, `computed_at (timestamptz)`. If the schema has drifted, STOP and re-cut the seed shape in section 2.
4. **Edit `lib/road-times.ts`** per the before/after diff in section 2. Single commit:
   ```
   refactor(road-times): consolidate onto supabaseService + structured logging (F-01 narrowed)
   ```
   Body: one-paragraph summary of why (cite ADR-0005 by file path), the four-line client swap, the two `console.*` → `log.*` migrations, and an explicit "swallow-and-fallback behaviour preserved verbatim — exactTSP still falls back to haversine on DB error" line. Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
5. **Verify the source-only commit compiles and lints clean.** Run `npm run lint 2>&1 | grep -E "lib/road-times\.ts"` — must return empty. Run `npx tsc --noEmit 2>&1 | grep -E "lib/road-times\.ts"` — must return empty. **No tests run yet** — the next commit adds them.
6. **Create `tests/integration/road-times.test.ts`** per the skeleton in section 2. Single commit:
   ```
   test(integration): cover loadRoadTimes cache hit, miss, and DB-error fallback (F-01 narrowed)
   ```
   Body: lists the three cases and what each proves; references the F-INFRA-01 local stack rails; explicit note that no migrations are added and no other test file writes to `customer_road_times` so cleanup-by-UUID-pair is sufficient. Trailer: same co-author line.
7. **Run the new test.** `npm run db:up` (if not already up), then `npm run test:integration -- road-times`. Must exit 0 with 3 cases passing. If any case fails, STOP and report — do NOT amend; create a third commit fixing the failure if root cause is genuine, or fix the seed/cleanup if it's a fixture issue.
8. **Run the full integration suite** to confirm no regression elsewhere. `npm run test:integration` must exit 0. The new road-times suite runs in addition to the existing 5 integration suites. Total: 6.
9. **Run the unit suite** for sanity. `npm test` must exit 0 — no unit-test surface changes in F-01, but the build graph compiles the new module and re-typechecks `lib/road-times.ts`.
10. **Run lint + tsc on the full repo.** `npm run lint 2>&1 | grep -E "(lib/road-times\.ts|tests/integration/road-times\.test\.ts)"` returns empty. `npx tsc --noEmit 2>&1 | grep -E "(lib/road-times\.ts|tests/integration/road-times\.test\.ts)"` returns empty. **Pre-existing rot elsewhere is calibrated baseline, not this PR's problem** — same methodology as F-FND-03 and F-INFRA-01.
11. **Run `npm run build`** as a smoke check. `next build` must exit 0. F-01 doesn't touch app code so this is fast; failure would indicate something orthogonal broke and should STOP the PR.
12. **Verify no package.json drift.** `git diff main package.json` must be empty. If anything appears, STOP and revert.
13. **Push the branch.** `git push -u origin f-01-consolidate-road-times-client`.
14. **Open PR to `main`** via `gh pr create`. Title: `refactor(road-times): consolidate onto supabaseService (F-01 narrowed)`. Body uses the standard HEREDOC pattern, summarises the two commits, pastes the ANVIL results from steps 7–11, references `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md` and `docs/architecture-review-2026-06-06.md` lines 389–400 (the 2026-06-07 addendum), and states explicitly: _"Two commits — one refactor (lib/road-times.ts), one test (tests/integration/road-times.test.ts). No migrations. No new deps. No app-route changes. Swallow-and-fallback contract preserved verbatim (exactTSP haversine fallback unchanged)."_

**Verification commands the implementer should be able to copy-paste:**

```bash
git checkout -b f-01-consolidate-road-times-client
git rev-parse origin/main                                                    # expect 9c25a37...
npm test                                                                      # baseline green
npm run db:up                                                                 # local stack up
npm run test:integration                                                      # baseline green

# After editing lib/road-times.ts (commit 1):
npm run lint 2>&1 | grep -E "lib/road-times\.ts"                              # expect empty
npx tsc --noEmit 2>&1 | grep -E "lib/road-times\.ts"                          # expect empty

# After adding tests/integration/road-times.test.ts (commit 2):
npm run test:integration -- road-times                                        # expect 3 passing
npm run test:integration                                                      # expect 6 suites passing
npm test                                                                      # expect baseline green
npm run lint 2>&1 | grep -E "(lib/road-times\.ts|tests/integration/road-times\.test\.ts)"   # expect empty
npx tsc --noEmit 2>&1 | grep -E "(lib/road-times\.ts|tests/integration/road-times\.test\.ts)"   # expect empty
npm run build                                                                 # exit 0
git diff main package.json                                                    # expect empty

git push -u origin f-01-consolidate-road-times-client
gh pr create --title "refactor(road-times): consolidate onto supabaseService (F-01 narrowed)" --body "..."
```

---

## 4. Test matrix (pre-ANVIL — what each layer will see)

Same calibrated-vs-strict discipline as F-FND-02/03 and F-INFRA-01. ANVIL Gate 3 will read this section verbatim.

| #   | Layer              | Command                                  | Pass criterion                                                                                                                                                                                                                               | Calibrated / Strict              |
| --- | ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Vitest unit        | `npm test`                               | Exit 0. No new unit suite added (see note below).                                                                                                                                                                                            | Strict (baseline must hold)      |
| 2   | Vitest integration | `npm run test:integration`               | Exit 0. New `road-times.test.ts` runs and passes 3 cases. Existing 5 integration suites continue to pass. Requires local Supabase up (`npm run db:up`).                                                                                      | Strict (this is the deliverable) |
| 3   | ESLint             | `npm run lint`                           | **Calibrated.** Bar: zero NEW violations attributable to F-01 files. Verify: `npm run lint 2>&1 \| grep -E "(lib/road-times\.ts\|tests/integration/road-times\.test\.ts)"` returns empty. Pre-existing nits elsewhere are F-TD-01 territory. | Calibrated                       |
| 4   | TypeScript check   | `npx tsc --noEmit`                       | **Calibrated.** Bar: zero NEW errors in F-01 files. Verify: same grep as #3. The ~60 pre-existing errors are F-TD-01.                                                                                                                        | Calibrated                       |
| 5   | Next.js build      | `npm run build`                          | Exit 0. Sanity check — no app-route changes, so this is fast and is definitionally green unless something orthogonal broke.                                                                                                                  | Strict                           |
| 6   | Playwright E2E     | n/a — no UI surface, no new HTTP surface | **No E2E for F-01.** The optimise route already has UI E2E coverage indirectly via the existing chrome-matrix specs; this PR is internal-only.                                                                                               | Skipped                          |
| 7   | Migration safety   | n/a — no migrations                      | **No migrations, no PITR check at Gate 4.** The standing Supabase migration-lock hook does not fire.                                                                                                                                         | Skipped                          |

**Layer 1 note for ANVIL.** No new unit test is added in F-01. The reasoning, surfaced explicitly so ANVIL doesn't ask for one:

- `loadRoadTimes()` is a thin async function whose entire behaviour is _talk to the DB, build a Map, return a callable_. There is no pure-function logic worth isolating from the DB call (the Map encoding is two lines and the `?? null` fallback is one). A unit test would either need to mock `supabaseService.from(...).select(...).in(...).in(...)` (a brittle four-call chain), or extract a pure helper just to test it — which adds surface area for no behavioural confidence the integration test doesn't already give. The integration test fully covers the three branches (success-hit, success-miss, error). Adding a unit test on top would be ceremony, not coverage.
- This calls back to the same APOSD discipline F-FND-03 used: depth over ceremony. Three integration cases against a real Postgres is a higher-confidence signal than three mocked-SDK unit cases.

**Layer 7 note for ANVIL.** No DB migrations. The schema for `customer_road_times` already exists in `supabase/migrations/20260101000000_baseline.sql` and predates F-01 by months. F-01 does not modify the schema, does not add a migration file, and does not need a PITR check.

---

## 5. Risks and mitigations

1. **Swallow-and-fallback contract preserved — but if it broke, the optimise route silently degrades to haversine without anyone noticing.** This is the single highest-stakes invariant in this PR. The original code at `road-times.ts:50–52` returns `{ get: () => null }` on DB error so `exactTSP` (read at `app/api/routes/optimise/route.ts:122–133`) falls back to haversine per pair. If a future edit accidentally throws from the error branch instead of returning the empty matrix, exactTSP would propagate the throw and the entire optimise route would 500 — a user-visible regression on a daily delivery-planning workflow. **Mitigation (Gate 2 decisions, both adopted):** (a) integration test case (c) is the load-bearing assertion. It explicitly triggers a DB error and asserts both (i) the returned matrix's `.get()` returns `null` for any pair, and (ii) the function does not throw. The test name is verbose precisely so a future implementer renaming it (or removing it) sees the contract written into the name: _"returns an empty matrix without throwing when the query fails"_. (b) A two-line `// CONTRACT:` comment is added above the error-branch `return { get: () => null }` in `lib/road-times.ts` so the next reader of the source file (not just the test) sees the invariant. The comment hits CLAUDE.md's "subtle invariant / behaviour that would surprise a reader" criterion and is the cheapest insurance against a future "improvement" that throws a `ServiceError` for typed-error consistency without realising the consequence.
2. **Simulating a DB-error in case (c) without polluting the local DB.** The conductor brief suggests _"point the test at a bogus table or temporarily revoke select, whichever is cleaner."_ Three strategies were weighed:
   - **(A) Pass malformed UUIDs into the `.in()` filter.** PostgREST validates UUID column filters and rejects non-UUID values with a 400 (the SDK surfaces this as `{ data: null, error: { ... } }`). **Chosen.** Zero DB writes; deterministic; works on any Supabase install; does not depend on test ordering. The bad-UUID path is the same code branch as a real DB error from the consumer's perspective (`error` is non-null, `data` is null), so the test is faithful to the production failure mode.
   - **(B) Temporarily rename / drop the table.** Brittle — affects every other test running in parallel (though `fileParallelism: false` in `vitest.integration.config.ts` mitigates) and requires schema mutation + rollback in `afterAll`. Rejected.
   - **(C) Mock the supabaseService import at the test level.** Would test the wrong thing — it would prove F-01's code branches but not the integration with the actual SDK error shape. Rejected as a unit-test concern that doesn't belong in the integration suite.
   - **(D) Point `loadRoadTimes` at a non-existent table.** Would require changing the function signature or adding a parameter — out of scope.
     Strategy (A) is the cleanest. **Verified behaviour:** PostgREST returns `{ code: '22P02', details: 'Invalid input for ...', message: 'invalid input syntax for type uuid: "not-a-uuid"' }` (or similar — the exact `code` may differ by Supabase version; the spy asserts only on the message + `level` + non-empty `error` field, not on the PostgREST error code, so version drift is tolerated). **Gate 2 decision: spy ADOPTED.** Case (c) additionally spies on `console.warn` (the underlying handle `log.warn` writes to) inside a `try/finally` that restores the spy. The assertion checks the spy was called once with a JSON line whose `level === "warn"`, `msg === "road-times cache load failed, using haversine fallback"`, and `error` is a non-empty string. This proves both the contract (empty matrix, no throw) AND the observability wiring (the new `log.warn` actually fires). The spy adds ~15 lines including the try/finally restore.
3. **Schema verification before writing the seed.** The recon confirmed the columns (`from_id`, `to_id`, `duration_s`, `distance_m`, `computed_at`) and the NOT NULL on `distance_m`. If the schema has drifted since the migration was committed (e.g., a future migration adds a NOT NULL column without a default), the seed insert would fail. **Mitigation:** step 3 of the implementation steps explicitly verifies the schema via `information_schema.columns` before writing the seed. The implementer must STOP if the schema differs.
4. **The structured logger emits to `console.warn` / `console.log`, which are still global handles.** F-FND-03's `log.warn` and `log.info` route to `console.warn` and `console.log` respectively (read at `lib/observability/log.ts:43–47`). Any test that spies on `console.warn` globally (e.g., a future test) would now see the road-times warning as a JSON line instead of an interpolated string. **Mitigation:** spies are always scoped within a single test and restored in `finally` so they do not leak. Verified: `grep -rn "spyOn.*console" tests/` returns only the F-FND-02 `withErrors` spec, which already uses the same scoped-spy pattern this PR adopts. F-01's case (c) spy follows the same shape (`vi.spyOn(console, "warn").mockImplementation(() => {})` + `warnSpy.mockRestore()` in `finally`), so cross-test bleed is structurally impossible under `fileParallelism: false`. **No further action.**
5. **`/api/routes/optimise/route.ts:547` is the sole caller and is not wrapped in `withRequestContext` yet.** That means the `log.info` / `log.warn` calls emitted by `loadRoadTimes` will lack `correlationId` until that route is migrated in a later unit. The log lines still carry `level`, `msg`, `ts`, and the structured payload — strictly better than today's interpolated `console.log` line — but the correlationId column will be empty in Vercel's log search until then. **This is fine and expected.** F-FND-03's plan section 6 risk #5 documents this exact pattern: the logger ships ready, individual routes migrate over time. No action in F-01.
6. **Test isolation if `customer_road_times` ever gains other tests.** Today, no other test under `tests/integration/**` writes to `customer_road_times`. If a future test (e.g., a future `compute-road-times` route test) writes to the same table with overlapping UUIDs, our cleanup-by-UUID-prefix strategy could collide. **Mitigation:** the test UUIDs use a deliberately greppable fragment (`f001`, `f002`, `f003`) that no realistic customer UUID would match. A future test that touches this table should choose its own prefix (e.g., `f01a`, `f01b`); the cleanup pattern (`.delete().in('from_id', TEST_IDS)`) only touches rows whose `from_id` is in our four-UUID list. **No action in F-01.**
7. **Race between `assertLocalStackReachable` probe and a slow `supabase start`.** The probe times out at 3s. If the local stack is mid-boot, the probe may see a transient 503 / connection refused even though `npm run db:up` was issued moments ago. **Mitigation:** standard developer workflow per CLAUDE.md is `npm run db:up && supabase status` until the stack is reported as up. The probe's error message is actionable (_"Supabase local stack unreachable at <URL>. Run `npm run db:up` first."_). **No action in F-01; documented in F-INFRA-01 already.**
8. **The error-branch's `error.message` could be `undefined` in unusual SDK error shapes.** `lib/road-times.ts:50` passes `error.message` into the structured fields. If `error` is somehow `null` (the conditional `if (error)` guards against that), or `error.message` is missing (Supabase SDK consistently returns `PostgrestError` with a `message` string per its types — verified empirically across the existing codebase), the log line would have `error: undefined`. JSON.stringify silently omits undefined values, so the log line is still valid JSON. **No action; acknowledged.**
9. **Risk that the planner missed an additional caller of `loadRoadTimes`.** Recon-step 3 grepped for every reference; confirmed exactly one production caller. **The standalone script `scripts/test-routing-engine.ts` references `RoadTimeMatrix` by type name only.** It is not part of any test runner and does not import `loadRoadTimes`. Its mocked `RoadTimeMatrix` will continue to type-check after this PR because the interface is unchanged. **No action; flagged so the implementer doesn't get surprised by it during the recon repeat.**
10. **Gate 2 decision: contract comment ADOPTED.** The two-line `// CONTRACT:` comment is added above the error-branch return in `lib/road-times.ts`. See updated "After" block in section 2 and Risk #1 mitigation.

---

## 6. Rollback

Straightforward. F-01 squash-merges into `main` as a single commit. To roll back:

```bash
git revert <merge-commit-sha>           # creates a clean revert commit
git push origin main
```

**No data implications.** F-01 makes no schema changes, no data migrations, no row inserts/updates/deletes in any production-relevant table. The integration test seeds and cleans up its own rows in `customer_road_times`, using greppable test UUIDs (`f001`, `f002`, `f003`) that cannot collide with real customers. A revert reinstates the ad-hoc `createClient(...)` block; the only observable change to operators is that `console.log` / `console.warn` interpolated strings reappear in Vercel logs and the structured `log.info` / `log.warn` JSON lines disappear. No customer-facing impact.

**If the revert needs to happen mid-day** (e.g., the structured logger turns out to mis-handle some error case in production): the integration test would have caught it in CI/local, but if a production-only edge case appears, the revert is a 30-second operation and brings the file back to its pre-PR state byte-for-byte. The rollback strategy is documented here so the conductor has the procedure on file.

---

## 7. Definition of done

The implementer can tick this list off before the PR is considered Gate 3 / Gate 4 ready:

- [ ] Branch `f-01-consolidate-road-times-client` cut from `main` HEAD `9c25a37`.
- [ ] `lib/road-times.ts` edited per the diff in section 2 — single commit `refactor(road-times): consolidate onto supabaseService + structured logging (F-01 narrowed)` with co-author trailer. **Includes the two-line `// CONTRACT:` comment above the error-branch return** (Gate 2 decision).
- [ ] `tests/integration/road-times.test.ts` created per the skeleton in section 2 — single commit `test(integration): cover loadRoadTimes cache hit, miss, and DB-error fallback (F-01 narrowed)` with co-author trailer. **Case (c) includes the `console.warn` spy assertion** (Gate 2 decision).
- [ ] `npm run db:up` running; local Supabase reachable.
- [ ] `npm run test:integration -- road-times` passes (3 cases).
- [ ] `npm run test:integration` passes (full suite — 6 suites total).
- [ ] `npm test` exits 0 (unit baseline holds).
- [ ] `npm run lint 2>&1 | grep -E "(lib/road-times\.ts|tests/integration/road-times\.test\.ts)"` returns empty.
- [ ] `npx tsc --noEmit 2>&1 | grep -E "(lib/road-times\.ts|tests/integration/road-times\.test\.ts)"` returns empty.
- [ ] `npm run build` exits 0.
- [ ] `git diff main package.json` is empty (no new deps).
- [ ] `git diff main lib/supabase.ts` is empty (the centralised-here comment is intentionally NOT updated).
- [ ] PR opened to `main` with title `refactor(road-times): consolidate onto supabaseService (F-01 narrowed)`.
- [ ] PR body cites ADR-0005 and the architecture-review addendum (2026-06-07 lines 389–400).
- [ ] PR body explicitly states: no migrations, no new deps, no app-route changes, swallow-and-fallback contract preserved.
- [ ] ANVIL Gate 3 results pasted into PR body (the test matrix table from section 4 with actual command output).
- [ ] The thirteen raw-fetch sites in ADR-0005's Per-Site Map are NOT touched. Verify: `git diff main app/api/screen2 app/api/detail app/api/admin/geocode-all app/api/map lib/complaint-email.ts lib/compliment-email.ts lib/pricing-email.ts` returns empty.
- [ ] `app/api/routes/compute-road-times/route.ts` is NOT touched. Verify: `git diff main app/api/routes/compute-road-times/` returns empty.
- [ ] `app/api/routes/optimise/route.ts` is NOT touched. Verify: `git diff main app/api/routes/optimise/` returns empty.

---

## 8. Out of scope (DO NOT touch in this PR)

- **Port extraction.** `RoadTimesRepository` port + `lib/adapters/supabase/road-times.ts` adapter. Owned by the future Phase 1+ unit per ADR-0005.
- **Migrating `/api/routes/optimise/route.ts` to `withRequestContext`.** Different unit; blocks on F-03 (`requireRole` helper).
- **Touching `/api/routes/compute-road-times/route.ts`** — including its three `console.*` calls (lines 72, 81, 125, 219, 237, 240, 245 — six unstructured calls in total). Phase 1+ concern, not F-01.
- **Touching any of the thirteen raw-fetch sites** in ADR-0005's Per-Site Map:
  - `app/api/screen2/note/route.ts`, `app/api/screen2/resolve/route.ts`, `app/api/screen2/all/route.ts`, `app/api/screen2/sync/route.ts`, `app/api/screen2/open/route.ts` (→ F-17 Complaints).
  - `app/api/admin/geocode-all/route.ts`, `app/api/map/data/route.ts` (→ F-20 Admin).
  - `app/api/detail/visit/route.ts` (→ F-18 Visits).
  - `app/api/detail/complaint/route.ts` (→ F-17 Complaints).
  - `app/api/detail/discrepancy/route.ts` (→ F-16 Cash).
  - `lib/complaint-email.ts`, `lib/compliment-email.ts` (→ F-17 Complaints + F-11 Mailer).
  - `lib/pricing-email.ts` (→ F-15 Pricing + F-11 Mailer).
- **Editing `lib/supabase.ts:9` comment** (_"Centralised here so the key rotation or URL change needs only one edit"_). Becomes truthful at the end of Phase 5. Updating it now would lie about the state.
- **Migrating any other `console.*` calls.** The codebase still has ~340 `console.*` calls across `app/api/**` and `lib/**` (per F-FND-03 recon). F-01 only touches the two in `lib/road-times.ts`.
- **F-03** — `requireRole` helper. Separate Phase 0 unit.
- **F-04** — ESLint guard activating the FREEZE rule. Separate Phase 0 unit; ships rule A only per ADR-0005.
- **F-RLS-01** — RLS audit (parallel docs-only track).
- **F-TD-01** — pre-existing ~60 `tsc` errors + ESLint nits. Side-track unit.
- **Updating the central client to a non-default config** (e.g., adding `auth: { persistSession: false, autoRefreshToken: false }` explicitly). The current behaviour is preserved verbatim; the central client uses `createClient`'s default options, same as the old ad-hoc client did.
- **Adding a `customer_road_times` seed to `supabase/seed.sql`.** Test seeds its own fixtures; seeding production-shape data into the local stack by default is a separate concern (and arguably the wrong move — empty cache is a valid state that the optimise route handles via haversine fallback).
- **Adding a comment to `lib/road-times.ts` documenting the swallow-and-fallback contract** for the next reader of the source file. Flagged in Risk #10 for Gate 2; not in the default plan.
- **CI / GitHub Actions.** Still no CI configured project-wide. ANVIL runs locally for this PR per the same discipline as F-FND-01/02/03 and F-INFRA-01.

---

## 9. ADR / docs implications

**No new ADR required.** ADR-0005 already records the narrowing rationale, the per-site map, and the consequence trade-offs. The architecture-review addendum (`docs/architecture-review-2026-06-06.md` lines 389–400, dated 2026-06-07) records the narrowing inline so anyone scanning the review sees it without needing to chase ADR-0005. Both documents are already on `main`; this PR neither creates nor modifies any ADR.

**No CLAUDE.md edit.** F-01 introduces no new developer workflow that CLAUDE.md should mention. The local-test commands added by F-INFRA-01 are already documented; the structured logger added by F-FND-03 is already documented; F-01 simply consumes both.

**No runbook edit.** `docs/runbooks/local-dev.md` (F-INFRA-01) already covers the daily workflow the implementer needs.
