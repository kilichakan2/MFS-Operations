# F-26 — LocalCache port + Dexie adapter (full hexagonal cutover of the client-side offline store)

**Date:** 2026-06-27
**Unit:** F-26 (Day 15 of the 16-day sprint; sibling of F-25 PushSender + the F-20/F-21 re-point series)
**Status:** Plan — spec LOCKED at FORGE Gate 1 (FULL CLEAN); Gate-2 decisions LOCKED (below).
**Author:** forge-planner

---

## Gate 2 — LOCKED DECISIONS (these OVERRIDE any "decide/recommend/TBD" later in this doc)

Hakan decided at Gate 2. Implementer: follow THESE.

- **R7 = ADD `fake-indexeddb` as a TEST-ONLY devDependency.** It lets the REAL `lib/adapters/dexie/LocalCache.ts` run under vitest against a simulated IndexedDB, proving the sacred schema (R3), queue round-trips, and `useLiveQuery` table-tracking (R1) for real — not just via the Fake/mock. **Write the one-line justification per CLAUDE.md** (e.g. `// reason: test-only IndexedDB polyfill so the dexie LocalCache adapter runs under vitest without a real browser`) in the PR description AND next to its setup import. It is a `devDependencies` entry only — it never ships to users.
- **R6 = DROP `isReferenceDataStale()`.** Zero callers (grep-verified). Do NOT carry it onto the new `LocalCache` port — delete it with `lib/localDb.ts`. Keep the port surface to what's actually used.
- **R1, R2, R3, R5 = as written in the plan (must-fix, locked):** reactive hooks live INSIDE the dexie adapter doing real Dexie reads so `useLiveQuery` keeps table-tracking (or 4 screens silently stop auto-refreshing); `'use client'` + no eager IndexedDB at import (SSR-safe); Dexie schema v1/v2 copied BYTE-FOR-BYTE (never modify an existing version — would wipe field workers' un-sent offline submissions); add `dexie` + `dexie-react-hooks` to the `.eslintrc.json` fence + the `no-adapter-imports` mirror test BEFORE re-pointing consumers, proven by a lint run.

🗣 Both calls settled: add the test-only browser-database simulator so we actually prove the offline box works (not just a stand-in), and bin the stale-check helper nothing uses rather than dragging dead code onto the new socket.

---

## Mini-map

```
DOMAIN (offline cache core)
  ├─ LocalCache (NEW port) → [dexie] (NEW adapter: MFSLocalDB v1/v2 verbatim) + [Fake (in-mem)]
  ├─ refreshReferenceData (NEW client usecase) → owns /api/reference fetch + cooldown; calls localCache.replaceReferenceData
  └─ reactive hook useLocalCacheQuery → wraps dexie-react-hooks' useLiveQuery (lives INSIDE the dexie adapter)
🗣 one labelled socket for the browser's offline box — swap IndexedDB libs = change one plug, nothing else
```

🗣 Right now the offline store (the browser's IndexedDB, driven by the `dexie`
library) is wired directly into 9 files — pages, components and hooks all reach
straight into the vendor. We give the offline store ONE labelled socket the app
owns, move the only two `dexie` packages behind that socket, and re-point every
caller onto it. After this, ripping out `dexie` touches exactly one folder.

---

## Goal

Behaviour-preserving hexagonal cutover of the client-side offline store. After
this unit **ZERO files outside `lib/adapters/dexie/` import `dexie` or
`dexie-react-hooks`** (rip-out test passes). The offline submission queue, the
reference-data mirror, the 30-minute staleness/cooldown logic, and all four live
UI auto-updates behave **BYTE-IDENTICALLY**. NO new runtime dependency, NO
migration, NO RLS (this is browser IndexedDB — no Postgres), NO visual or
functional UI change.

**Explicitly OUT OF SCOPE (locked):**
- No DB migration, no RLS change, no Postgres touch (IndexedDB is browser-local).
- No new RUNTIME dependency (`dexie` + `dexie-react-hooks` already in
  `package.json`). The ONE new-dep *question* is a TEST-only devDep
  (`fake-indexeddb`) — flagged in R7; an alternative path avoids even that.
- No UI/visual change, no change to any wire response, no change to the
  `/api/reference` route (`app/api/reference/route.ts` is untouched — it is the
  server side; F-26 only re-points the CLIENT `syncReferenceData` that calls it).
- **The Dexie schema versions v1 + v2 are SACRED — never modified.** Users have
  live IndexedDB data on their devices keyed to these exact `.stores()`
  definitions; changing an existing version corrupts that data.

🗣 We are only re-routing pipes and putting a labelled cover on the offline box.
We are NOT changing how the box stores things (that would wipe field workers'
queued submissions), NOT adding a runtime package, NOT touching the server, and
NOT changing a single pixel.

---

## Domain terms (plain-English)

- **LocalCache** — a NEW port (`lib/ports/LocalCache.ts`) + a NEW vendor adapter
  (`lib/adapters/dexie/`). The app's own socket for "store/read offline submission
  queue + reference data + sync metadata." 🗣 The labelled cover on the browser's
  offline box; the rest of the app never types the word `dexie` again.
- **dexie / dexie-react-hooks** — the two vendor packages. `dexie` is the
  IndexedDB wrapper; `dexie-react-hooks` gives `useLiveQuery`, which re-runs a
  query automatically whenever the IndexedDB tables it touched change. 🗣 `dexie`
  is the box; `useLiveQuery` is the little bell that rings the screen to redraw
  the moment the box's contents change. Both go behind the cover.
- **IndexedDB** — the browser's built-in on-device database. 🗣 A filing cabinet
  that lives inside each user's browser, survives refreshes, and works with no
  network. The offline queue + the customer/product lists live here.
- **The offline queue** — `QueuedRecord[]` written on every Screen 1/2/3 submit,
  pushed to the server later by `syncEngine`. 🗣 The outbox: submissions wait here
  until there's signal, then get delivered.
- **The reference mirror** — local copies of active customers + products, so the
  selectors work offline. 🗣 A cached address book so you can pick a customer even
  with no signal.
- **`replaceReferenceData(customers, products, now)`** — the atomic
  clear+bulkAdd+syncMeta store operation (NO fetch — pure store write). 🗣 Swap the
  whole cached address book in one go; nothing half-written.
- **The reactive hook (`useLocalCacheQuery`)** — an OWNED React hook that
  internally calls `useLiveQuery`. The 4 consumer files import THIS, never the
  vendor. 🗣 Our own little bell-puller; the screens ask us to ring, and we use the
  vendor's bell behind the cover.
- **`refreshReferenceData` (client usecase)** — the thin orchestration that does
  the `/api/reference` fetch + 30-min cooldown + validation, then hands the result
  to `localCache.replaceReferenceData(...)`. The ADAPTER never does HTTP. 🗣 The
  errand-runner: it goes to the server, checks it's not too soon to bother, and
  drops the fresh address book into the box.
- **Port / Adapter / Fake / Contract / Wiring** — same glossary as F-25: socket /
  plug / pretend plug for the bench / shared exam / the fuse box (the only
  business-layer file allowed to import an adapter).

---

## Compliance / architecture flags

- **Hexagonal layering (CLAUDE.md + ADR-0002):** UI → port (via wiring) → adapter.
  After this unit, all 9 caller files import the LocalCache singleton / the owned
  hook from `lib/wiring/`, and ZERO of them import `dexie` / `dexie-react-hooks`. ✅
- **F-04 / F-27 vendor-SDK fence:** ⚠ **`dexie` + `dexie-react-hooks` are NOT in
  `.eslintrc.json`'s `no-restricted-imports` today** (verified — the fenced list is
  supabase / bcryptjs / @anthropic-ai/sdk / resend / leaflet×4 / jspdf×2 / xlsx /
  web-push; dexie is absent). So the current breach is not even lint-caught. **This
  unit MUST add `dexie` + `dexie-react-hooks` to the fence + a
  `lib/adapters/dexie/**` override + the mirror-test cases**, exactly as F-25 did
  for `web-push`. See **R5** — without it the closure is cosmetic. **Do this BEFORE
  re-pointing consumers** (the F-25 R5 lesson).
- **F-TD-11 wiring fence:** the adapter + usecase export factories only; singletons
  live in `lib/wiring/localCache.ts`. Pinned by
  `tests/unit/lint/no-adapter-imports.test.ts`. ✅
- **Ports purity:** `lib/ports/LocalCache.ts` is pure TS — no `dexie` import, no
  React import, no framework import. The owned types (`QueuedRecord`,
  `LocalCustomer`, `LocalProduct`, `SyncMeta`) move INTO the port file (they are
  already vendor-neutral today — Dexie's `Table<T>` was the only vendor type and it
  stays inside the adapter). ✅
- **Single-use-vendor rule:** `dexie` + `dexie-react-hooks` become imported in
  EXACTLY one folder (`lib/adapters/dexie/`) — satisfies the "single-use vendor
  must sit behind an owned wrapper" rule. ✅
- **Dependency justification:** NO new RUNTIME entry. `dexie@^3.2.4` +
  `dexie-react-hooks@^1.1.7` already present (justification: "client-side IndexedDB
  offline store for the field-worker PWA queue + reference mirror" — the existing,
  sufficient reason; this unit only relocates the imports). The ONLY possible new
  entry is a TEST devDep (`fake-indexeddb`) — see R7; it needs a one-line
  justification IF chosen. ✅/⚠
- **No migration:** Postgres migration-filename-convention test is irrelevant
  (IndexedDB is not Postgres). ✅

🗣 Every house rule is satisfied, with ONE active to-do the spec demands: add the
two `dexie` packages to the lint blocklist so the new socket is actually enforced —
today nothing stops a fresh `import 'dexie'` from re-opening the hole.

## ADR conflicts

**None.** ADR-0002 (hexagonal shape & naming) governs and this unit follows it
exactly — same pattern as F-11 (Mailer/Resend) and F-25 (PushSender/web-push). No
ADR is contradicted or amended. (One nuance worth a Gate-2 nod: ADR-0002's stock
adapters are server-side; the dexie adapter is BROWSER-side and a React hook lives
inside it. This is consistent with how `lib/adapters/leaflet/MapCanvas.tsx` already
holds React/`'use client'` code inside an adapter — precedent exists, see R2.)

---

## VERIFIED current-state analysis (the load-bearing part)

I read `lib/localDb.ts`, `lib/syncEngine.ts`, all 4 `useLiveQuery` consumers, the 4
page-level callers, `.eslintrc.json`, the no-adapter-imports mirror test, and the
Mailer port/wiring as the template. Confirmed facts that anchor byte-identity:

### `lib/localDb.ts` (the breach core, 260 lines)
- Imports `Dexie, { type Table } from 'dexie'` (line 13).
- **Owned types (already vendor-neutral):** `QueuedRecord` (PK `localId`; fields
  `screen`/`payload`/`createdAt`/`synced`/`syncError?`/`retries`), `LocalCustomer`
  (`id`/`name`/`syncedAt`), `LocalProduct` (`id`/`name`/`category`/`box_size`/
  `code`/`syncedAt`), `SyncMeta` (`key`:'customers'|'products' / `lastSyncedAt` /
  `recordCount`). These move into `lib/ports/LocalCache.ts`.
- **`class MFSLocalDB extends Dexie`** with `version(1).stores({ queue:'localId,
  screen, synced, createdAt' })` and `version(2).stores({ queue:…, customers:'id,
  name', products:'id, name, category', syncMeta:'key' })`. **SACRED — copy
  verbatim into the adapter.**
- **`localDb` singleton** = `new MFSLocalDB()` at module top-level (line 98).
  **NO SSR guard today** — Dexie's constructor does not touch IndexedDB until a
  query runs, and every importer is a `'use client'` file, so it has never broken
  SSR. The adapter/wiring MUST preserve this (do not add an eager
  IndexedDB-touching call at import). See **R2**.
- **`syncReferenceData({force?})`** — cooldown check (reads syncMeta customers +
  products; stale if missing or `now - lastSyncedAt > 30min`
  `BACKGROUND_REFRESH_INTERVAL_MS`; if BOTH fresh and not forced → early-return
  `{success:true, customerCount, productCount}` from the meta), THEN
  `fetch('/api/reference', {signal: AbortSignal.timeout(10_000)})`, `res.ok` check,
  `await res.json()`, `Array.isArray` validation, THEN an atomic Dexie transaction
  (`clear` customers+products, `bulkAdd` fresh, `put` two syncMeta rows with
  `now = Date.now()`). Failure paths: fetch/parse throw →
  `console.warn('[syncReferenceData] Fetch failed, using cached data:', message)` +
  return `{success:false,error}`; bad shape → `{success:false,error:'Unexpected
  API response shape'}`; transaction throw →
  `console.error('[syncReferenceData] Transaction failed:', message)` +
  `{success:false,error}`. **Two `Date.now()` calls** (one in the cooldown, one for
  the syncedAt timestamps).
- **`isReferenceDataStale()`** — reads syncMeta customers+products; true if either
  missing or `> 30min` old. One `Date.now()`.

### The 5 vendor import sites (grep-confirmed, all must end dexie-free)
1. `lib/localDb.ts:13` — `import Dexie, { type Table } from 'dexie'` → moves to adapter.
2. `components/RecentActivity.tsx:14` — `useLiveQuery` (reads `queue` filtered by
   screen+today, reverse, limit 5; THEN `customers`/`products` `anyOf` for name
   resolution).
3. `components/AppHeader.tsx:5` — `useLiveQuery` (`queue.filter(r=>!r.synced)`).
4. `hooks/useSyncStatus.ts:13` — `useLiveQuery` (`queue.filter(r=>!r.synced)`).
5. `hooks/useReferenceData.ts:10` — `useLiveQuery` ×3 (`customers.orderBy('name')`,
   `products.orderBy('name')` twice).

### The full caller set (grep-confirmed — every file that re-points)
**9 files import `@/lib/localDb`:**
- `lib/syncEngine.ts` — `localDb.queue.filter(...).toArray()`,
  `localDb.queue.toArray()`, `localDb.queue.update(localId, {...})`. (The offline
  outbox consumer: exhausted-reset, pending-filter, per-record sync, mark-synced,
  retry-increment.)
- `components/RecentActivity.tsx`, `components/AppHeader.tsx`,
  `hooks/useSyncStatus.ts`, `hooks/useReferenceData.ts` — the 4 `useLiveQuery`
  consumers above.
- `app/complaints/page.tsx` — `import { localDb, syncReferenceData }` (line 12);
  `syncReferenceData().catch(...)` in an effect (line 592);
  `localDb.queue.add({...})` (lines 461, 626); **plus a DYNAMIC
  `const { localDb } = await import('@/lib/localDb')` at line 459** inside
  `handleResolve` (screen2_resolve). BOTH the static + dynamic import must
  re-point.
- `app/dispatch/page.tsx` — `import { localDb, syncReferenceData }` (line 13);
  `syncReferenceData().catch(...)` (line 225); `localDb.queue.add({...})` (line 275).
- `app/visits/page.tsx` — `import { localDb, syncReferenceData }` (line 12);
  `syncReferenceData().catch(...)` (line 792); the RICHEST queue surface:
  `localDb.queue.filter(...).toArray()` (829),
  `localDb.queue.where('localId').equals(x).delete()` (887, 917, 921),
  `localDb.queue.put({...})` (889). (Note `.delete().catch(()=>{})` on 921 — the
  no-op-on-miss is preserved by the port's `deleteFromQueue` resolving cleanly when
  the key is absent.)
- `app/pricing/page.tsx` — `import { syncReferenceData }` only (line 10);
  `syncReferenceData({ force: true }).catch(...)` (line 903). **Only caller using
  `{force:true}` — preserve the force path.**

**`syncReferenceData` callers:** complaints, dispatch, visits, pricing (4 pages) +
its definition in localDb.ts. **`isReferenceDataStale` callers:** ONLY its own
definition — **grep finds ZERO external callers** (the spec mentioned a login
handler; it does NOT call this today). See **R6** — keep it in the port surface for
parity/safety, but note it is currently dead-but-exported.

### The queue operation surface the port MUST cover (union of all callers)
| Operation | Used by | Dexie call today |
|---|---|---|
| add a queued record | complaints, dispatch | `queue.add(rec)` |
| put (upsert) a queued record | visits | `queue.put(rec)` |
| delete by localId | visits | `queue.where('localId').equals(id).delete()` |
| list unsynced | AppHeader, useSyncStatus | `queue.filter(r=>!r.synced).toArray()` |
| list all | syncEngine | `queue.toArray()` |
| list exhausted unsynced | syncEngine | `queue.filter(...).toArray()` |
| update fields by localId | syncEngine | `queue.update(id, patch)` |
| list today's screen records | RecentActivity, visits | `queue.where('screen')…` / `queue.filter(...)` |
| read customers (ordered) | useReferenceData, RecentActivity | `customers.orderBy('name')` / `customers.where('id').anyOf(...)` |
| read products (ordered) | useReferenceData, RecentActivity | `products.orderBy('name')` / `products.where('id').anyOf(...)` |
| replace reference data | refreshReferenceData usecase | atomic clear+bulkAdd+put |
| read syncMeta / staleness | usecase, isReferenceDataStale | `syncMeta.get(key)` |

🗣 The hard part isn't the address book — it's the outbox. Six different shapes of
"poke the queue" are scattered across three screens plus the sync engine. The port
has to offer a method for every one of them, or a screen can't re-point and we'd be
stuck.

---

## The reactive-hook design (the trickiest piece — read carefully)

`useLiveQuery(fn)` re-runs `fn` whenever the Dexie tables that `fn` READ change. So
the owned hook MUST execute real Dexie reads that `useLiveQuery` can track — it
cannot wrap an opaque port method that hides the table access, or live-tracking
breaks and screens stop auto-refreshing.

**Decision (LOCKED in the plan): the `useLiveQuery` import lives INSIDE the dexie
adapter**, because `dexie-react-hooks` IS the vendor. The owned reactive hook is
exposed from the adapter and re-exported through wiring. Concretely:

- `lib/adapters/dexie/react.ts` (`'use client'`) — the ONLY file importing
  `dexie-react-hooks`. It exports a small set of **purpose-built owned hooks**, each
  internally calling `useLiveQuery` with a query function that reads the Dexie
  tables directly (so tracking is preserved). One hook per existing consumer
  pattern, returning the EXACT mapped shape each consumer needs:
  - `useUnsyncedQueue(): QueuedRecord[]` — `queue.filter(r=>!r.synced).toArray()`
    (covers AppHeader's `SyncDot` + `useSyncStatus`). Returns the raw rows; the
    consumers keep their own `.filter`/`.length` derivations.
  - `useTodayScreenActivity(screen, today): RecentActivityItem[]` — the
    RecentActivity query VERBATIM (queue where-screen+createdAt, reverse, limit 5,
    THEN customers/products `anyOf` name resolution → the `{...r, custMap, prodMap}`
    shape). All the table reads stay inside the hook so liveQuery tracks queue +
    customers + products.
  - `useLocalCustomers(): LocalCustomer[]` and `useLocalProducts(): LocalProduct[]`
    — `customers.orderBy('name').toArray()` / `products.orderBy('name').toArray()`
    (covers `useCustomers`/`useProducts`/`useProductsWithDetail`; the consumers keep
    their thin `.map` to `SelectableItem`/`ProductDetail`).

  Rationale for purpose-built hooks over a generic `useLocalCacheQuery(fn)`: a
  generic hook would force callers to pass a `fn` containing Dexie reads — which
  re-exposes the vendor surface to the caller (the `fn` would have to reference
  `localDb.queue`). Purpose-built hooks keep ALL Dexie references inside the
  adapter file, so the consumers import only named owned hooks and zero vendor
  surface. (If Hakan prefers the generic form, it can be offered, but the query
  function must be a method ON the adapter, not passed by the caller — flagged as a
  style choice, not a correctness one.)

- The 4 consumer files import these owned hooks from `lib/wiring/localCache.ts`
  (which re-exports them from the adapter), NEVER from `dexie-react-hooks`.

- **ESLint-fenceable:** because `dexie-react-hooks` is imported only in
  `lib/adapters/dexie/react.ts`, the `lib/adapters/dexie/**` override covers it and
  the global fence catches any other import. The consumers, importing named hooks
  from wiring, are clean.

🗣 The bell only rings if WE are the ones touching the box — so the bell-puller has
to live next to the box, inside the cover. We give each screen a ready-made
bell-puller shaped exactly for what it needs (the outbox dot, the activity list,
the customer picker), and every one of them reads the box from inside the cover, so
the auto-redraw keeps working untouched.

---

## Files to change

### NEW files
1. `lib/ports/LocalCache.ts` — the port interface + the 4 owned types
   (`QueuedRecord`, `LocalCustomer`, `LocalProduct`, `SyncMeta`) moved from
   `localDb.ts`. Pure TS, no `dexie`, no React.
2. `lib/ports/__contracts__/LocalCache.contract.ts` — shared contract suite (run
   against the Fake, and — if R7 = fake-indexeddb — against the real dexie adapter).
3. `lib/adapters/dexie/index.ts` — barrel: `export { createDexieLocalCache }` +
   `export { … owned hooks }` from `./react`.
4. `lib/adapters/dexie/LocalCache.ts` — the ONLY file importing `dexie`. Holds
   `MFSLocalDB` (schema v1/v2 VERBATIM) + the singleton + `createDexieLocalCache()`
   factory implementing every port method by mapping to Dexie calls.
5. `lib/adapters/dexie/react.ts` (`'use client'`) — the ONLY file importing
   `dexie-react-hooks`. The owned reactive hooks (see the reactive-hook section).
6. `lib/adapters/fake/LocalCache.ts` — in-memory Fake implementing the port (Maps
   for queue/customers/products/syncMeta). For unit tests + the contract. Does NOT
   implement the reactive hooks (those are tested separately — see test matrix).
7. `lib/usecases/refreshReferenceData.ts` — the client usecase (factory) that owns
   the `/api/reference` fetch + 30-min cooldown + 10s timeout + validation + the
   non-fatal failure path, calling `localCache.replaceReferenceData(...)`. Exports
   `createRefreshReferenceData(deps)`.
8. `lib/wiring/localCache.ts` (`'use client'`) — composition root: the
   browser-instantiated `localCache` singleton (`createDexieLocalCache()`), the
   `refreshReferenceData` singleton (`createRefreshReferenceData({ localCache,
   fetch: globalThis.fetch })`), AND the re-exported owned reactive hooks.

### MODIFIED files
9.  `lib/ports/index.ts` — re-export `LocalCache` + the 4 owned types.
10. `lib/adapters/fake/index.ts` — export the LocalCache Fake.
11. `.eslintrc.json` — add `dexie` + `dexie-react-hooks` to the top-level
    `no-restricted-imports.paths` AND the services/usecases override paths; add
    `lib/adapters/dexie/**/*.{ts,tsx}` to the adapter override. (R5)
12. `tests/unit/lint/no-adapter-imports.test.ts` — add F-26 mirror cases
    (dexie + dexie-react-hooks banned in app/components/hooks/services/usecases;
    allowed in `lib/adapters/dexie/`; verbatim message). (R5)
13. `lib/syncEngine.ts` — re-point onto `localCache` (queue list/update methods).
14. `components/RecentActivity.tsx` — replace `useLiveQuery` + `localDb` with
    `useTodayScreenActivity(screen, today)` from wiring.
15. `components/AppHeader.tsx` — `SyncDot` uses `useUnsyncedQueue()` from wiring.
16. `hooks/useSyncStatus.ts` — `useUnsyncedQueue()` from wiring.
17. `hooks/useReferenceData.ts` — `useLocalCustomers()` / `useLocalProducts()`.
18. `app/complaints/page.tsx` — re-point the static `{ localDb, syncReferenceData }`
    import, the dynamic `await import('@/lib/localDb')`, the two `queue.add`, and the
    `syncReferenceData()` effect → `localCache.addToQueue(...)` +
    `refreshReferenceData()`.
19. `app/dispatch/page.tsx` — same shape (one `queue.add`, one `syncReferenceData`).
20. `app/visits/page.tsx` — the richest: `queue.filter`, `queue.put`, three
    `queue.where().delete()`, the `syncReferenceData` effect → port methods.
21. `app/pricing/page.tsx` — `syncReferenceData({force:true})` → `refreshReferenceData({force:true})`.

### DELETED file
22. `lib/localDb.ts` — deleted once all importers re-pointed AND grep-clean.

🗣 One socket with its plug, pretend-plug, exam and fuse box; the errand-runner
usecase; the lint guard updated; nine callers flipped; the old vendor-coupled file
deleted. Nothing outside `lib/`, the 4 pages, the 2 components, the 2 hooks and the
two test/config files is touched.

---

## Port / method signatures (exact)

### `lib/ports/LocalCache.ts`
```ts
// ── Owned types (moved verbatim from lib/localDb.ts — already vendor-neutral) ──
export interface QueuedRecord {
  localId: string;
  screen: 'screen1' | 'screen2' | 'screen3' | 'screen2_resolve';
  payload: Record<string, unknown>;
  createdAt: number;
  synced: boolean;
  syncError?: string;
  retries: number;
}
export interface LocalCustomer { id: string; name: string; syncedAt: number; }
export interface LocalProduct {
  id: string; name: string; category: string | null;
  box_size: string | null; code: string | null; syncedAt: number;
}
export interface SyncMeta {
  key: 'customers' | 'products'; lastSyncedAt: number; recordCount: number;
}

export interface LocalCache {
  // ── Queue: writes ──
  /** queue.add — insert; rejects on duplicate localId (Dexie add semantics). */
  addToQueue(record: QueuedRecord): Promise<void>;
  /** queue.put — upsert (visits edit path). */
  putToQueue(record: QueuedRecord): Promise<void>;
  /** queue.where('localId').equals(localId).delete() — no-op if absent. */
  deleteFromQueue(localId: string): Promise<void>;
  /** queue.update(localId, patch) — partial update; no-op if absent (Dexie update). */
  updateQueue(localId: string, patch: Partial<QueuedRecord>): Promise<void>;
  // ── Queue: reads ──
  /** queue.toArray() — every record (syncEngine). */
  listQueue(): Promise<QueuedRecord[]>;
  /** queue.filter(r => !r.synced).toArray() — unsynced only (syncEngine non-reactive read). */
  listUnsynced(): Promise<QueuedRecord[]>;
  // ── Reference: reads ──
  listCustomers(): Promise<LocalCustomer[]>;      // orderBy('name')
  listProducts(): Promise<LocalProduct[]>;        // orderBy('name')
  // ── Reference: replace (atomic, NO fetch — pure store op) ──
  /** clear customers+products, bulkAdd fresh, put both syncMeta rows — one atomic
   *  transaction. `now` INJECTED (stamped onto syncedAt + lastSyncedAt). */
  replaceReferenceData(
    customers: ReadonlyArray<{ id: string; name: string }>,
    products: ReadonlyArray<{ id: string; name: string; category: string | null; box_size: string | null; code: string | null }>,
    now: number,
  ): Promise<void>;
  // ── SyncMeta / staleness ──
  getSyncMeta(key: 'customers' | 'products'): Promise<SyncMeta | undefined>;
}
```
> Note: the reactive hooks are NOT on this port interface — they are React-coupled
> and live in the adapter's `react.ts`, exposed via wiring. The port stays pure TS
> and framework-free so it can have an in-memory Fake and a contract. (The Fake
> implements the data methods above; the hooks are tested separately.)

### Adapter — `lib/adapters/dexie/LocalCache.ts`
- `class MFSLocalDB extends Dexie` with `.version(1)` + `.version(2)` **byte-for-byte
  identical** to today (the SACRED schema).
- `const localDb = new MFSLocalDB()` (module-level singleton, no eager IndexedDB
  touch — preserves SSR-safety, R2).
- `export function createDexieLocalCache(): LocalCache` mapping each method:
  `addToQueue→queue.add`, `putToQueue→queue.put`,
  `deleteFromQueue→queue.where('localId').equals(id).delete()`,
  `updateQueue→queue.update(id, patch)`, `listQueue→queue.toArray()`,
  `listUnsynced→queue.filter(r=>!r.synced).toArray()`,
  `listCustomers→customers.orderBy('name').toArray()`,
  `listProducts→products.orderBy('name').toArray()`,
  `getSyncMeta→syncMeta.get(key)`, and `replaceReferenceData` = the EXACT atomic
  `transaction('rw', [customers, products, syncMeta], …)` lifted verbatim (clear,
  bulkAdd with `syncedAt: now`, put both meta rows with `lastSyncedAt: now`,
  `recordCount`).

### Reactive hooks — `lib/adapters/dexie/react.ts` (`'use client'`)
```ts
export function useUnsyncedQueue(): QueuedRecord[];                 // queue.filter(!synced)
export function useLocalCustomers(): LocalCustomer[];               // customers.orderBy('name')
export function useLocalProducts(): LocalProduct[];                 // products.orderBy('name')
export function useTodayScreenActivity(
  screen: 'screen1' | 'screen2' | 'screen3',
  today: number,
): RecentActivityRow[];   // the verbatim RecentActivity query incl. name-resolution maps
```
Each calls `useLiveQuery(queryFn, deps, defaultValue)` with the SAME `deps` +
default `[]` the original used, and queryFn does the SAME Dexie reads (so
liveQuery's table-tracking is byte-identical).

### Client usecase — `lib/usecases/refreshReferenceData.ts`
```ts
export interface RefreshReferenceDataDeps {
  readonly localCache: LocalCache;
  readonly fetch: typeof globalThis.fetch;   // injected for testability
  readonly now?: () => number;               // defaults to Date.now (R4)
}
export type RefreshResult =
  | { success: true; customerCount: number; productCount: number }
  | { success: false; error: string };
export interface RefreshReferenceData {
  /** Byte-identical to today's syncReferenceData: cooldown (unless force) via
   *  getSyncMeta + the 30-min interval; fetch('/api/reference', 10s timeout);
   *  res.ok + json + Array.isArray validation; replaceReferenceData(now); the
   *  three failure paths with the SAME console.warn/error strings + return shapes. */
  run(options?: { force?: boolean }): Promise<RefreshResult>;
}
export function createRefreshReferenceData(deps: RefreshReferenceDataDeps): RefreshReferenceData;
```
The usecase keeps the `BACKGROUND_REFRESH_INTERVAL_MS = 30*60*1000` constant, the
`'/api/reference'` URL, the `AbortSignal.timeout(10_000)`, the `Content-Type`
header, the `Unexpected API response shape` string, and the two console messages
VERBATIM. Wiring binds `fetch: (...a) => globalThis.fetch(...a)` and the default
`now`.

🗣 The errand-runner has the same checklist as today — don't go if you went in the
last half hour, give up after 10 seconds, refuse a garbled reply, and on any
failure keep the old address book and log the same warning. We only moved it out of
the box and gave it the clock + the phone as inputs so a test can fake both.

---

## Byte-identical-behaviour checklist (the safety net)

The implementer MUST preserve every item; parity unit tests pin them:

1. **Dexie schema:** `version(1).stores({queue:'localId, screen, synced,
   createdAt'})` + `version(2).stores({queue:…, customers:'id, name', products:'id,
   name, category', syncMeta:'key'})` — character-for-character. (R3 — SACRED.)
2. **Queue add vs put:** complaints/dispatch use `add` (reject-on-duplicate); visits
   uses `put` (upsert). Keep the two distinct methods — do NOT collapse to one.
3. **Queue delete-by-localId:** no-op when the key is absent (visits line 921's
   `.catch(()=>{})` relied on this; `deleteFromQueue` resolves cleanly on miss).
4. **Queue update:** `updateQueue` is a partial-field update keyed by localId;
   no-op if absent (Dexie `update` returns 0). syncEngine's mark-synced + retry
   increments must behave identically.
5. **syncEngine reads:** `listQueue()` (toArray) + the exhausted/pending `.filter`
   stay in syncEngine (it filters the returned array — same as today, which did
   `queue.toArray()` then `.filter` in JS for `pending`, and `queue.filter(...)` for
   `exhausted`). Keep the exhausted path as a `.filter` on `listQueue()` OR add a
   dedicated method — **recommend keep syncEngine's JS-side filtering** so the
   queue-read surface stays minimal and behaviour is identical.
6. **Reactive queries:** each of the 4 consumers' `useLiveQuery` becomes the
   matching owned hook with the SAME query body, `deps`, and `[]` default — so the
   reactive re-render triggers on the SAME table changes.
7. **RecentActivity name-resolution:** the customers/products `anyOf` join + the
   `{...r, custMap, prodMap}` shape preserved verbatim inside
   `useTodayScreenActivity` (so the component's render is unchanged).
8. **refreshReferenceData cooldown:** both-fresh-and-not-forced → early return
   `{success:true, customerCount: meta.recordCount ?? 0, productCount: …}` from the
   META (NOT a fetch). `{force:true}` (pricing) bypasses it.
9. **refreshReferenceData fetch:** `'/api/reference'`, GET, `Content-Type` header,
   `AbortSignal.timeout(10_000)`, `res.ok` check.
10. **refreshReferenceData failure paths (all 3, verbatim):**
    (a) fetch/parse throw → `console.warn('[syncReferenceData] Fetch failed, using
    cached data:', message)` + `{success:false,error:message}`;
    (b) bad shape → `{success:false, error:'Unexpected API response shape'}`;
    (c) transaction throw → `console.error('[syncReferenceData] Transaction failed:',
    message)` + `{success:false,error:message}`.
    **Keep the `[syncReferenceData]` log prefix even though the function is renamed**
    (byte-identical log output > internal name).
11. **replaceReferenceData mapping:** `box_size: p.box_size ?? null`,
    `code: p.code ?? null`, `category: p.category` (passthrough), `syncedAt: now`;
    syncMeta `recordCount` = fresh array lengths.
12. **isReferenceDataStale:** if kept (R6), identical logic (missing OR >30min →
    true). Currently has ZERO callers — keep as a port method `isReferenceStale()`
    OR drop it (R6 decision).
13. **No SSR break:** no eager IndexedDB access at import; singleton created at
    module load but first touch is lazy (R2).
14. **Dynamic import in complaints:** `await import('@/lib/localDb')` at line 459
    re-points to the wiring import (static is fine — it was dynamic only to defer
    the dexie load; importing the wiring singleton at the top is equally fine since
    the file is already `'use client'`). Confirm no behavioural change (the dynamic
    import was a micro-optimisation, not load-bearing).

---

## SSR / `'use client'` note

- `lib/localDb.ts` has NO `'use client'` and NO `typeof window` guard today, yet
  never breaks SSR because (a) every importer is a client component, and (b) Dexie's
  constructor does not open IndexedDB until the first query. **Preserve both
  conditions:** the adapter constructs the `MFSLocalDB` singleton at module load
  (no `'use client'` needed on `LocalCache.ts` itself — it's only imported by
  wiring, which IS `'use client'`), and never runs a query at import.
- `lib/adapters/dexie/react.ts` + `lib/wiring/localCache.ts` carry `'use client'`
  (they export React hooks / are consumed by client components).
- **Verify during Render:** importing `lib/wiring/localCache.ts` from a client
  component must not pull a server-only module, and must not eagerly touch
  IndexedDB. The `refreshReferenceData` usecase is framework-free (it only needs
  `fetch` + `localCache`), so wiring can construct it on the client safely.
- Precedent: `lib/adapters/leaflet/MapCanvas.tsx` already holds `'use client'`
  React code inside an adapter folder — F-26's `react.ts` follows the same shape.

🗣 The offline box only exists in the browser. Today it quietly never runs on the
server because nothing opens it until a screen asks. We keep that exact quiet: the
cover and the bell-puller are marked browser-only, and we never crack the box open
at import time.

---

## Determinism / injection note

- `replaceReferenceData(customers, products, now)` takes `now` INJECTED — the
  usecase computes `now = deps.now()` (default `Date.now`) ONCE and passes it, so a
  frozen-clock test asserts the exact `syncedAt` + `lastSyncedAt` written.
- The cooldown check in `refreshReferenceData` uses the SAME injected `now()` — so
  the "is it stale?" decision and the timestamps written agree.
- The adapter's data methods never call `Date.now()` themselves (they receive
  `now`) — matching F-25's discipline (the SERVICE/USECASE owns the clock; the
  adapter is a dumb store).
- Matches today's behaviour: today `syncReferenceData` calls `Date.now()` twice
  (cooldown + timestamps); injecting a single `now()` into the usecase is a strict
  improvement with no observable change at non-boundary times.

🗣 Read the clock once in the errand-runner and hand it to the box, so the "too
soon?" check and the freshness stamps can't disagree, and a test can freeze time
and check every number.

---

## Numbered implementation steps (TDD order — contract-first)

> Proven F-25 sequence: port + types → contract → fake → adapter → wiring → usecase
> → lint fence → re-point callers → delete. Write the failing test before each impl.

1. **LocalCache port + owned types** — `lib/ports/LocalCache.ts` (move the 4 types
   verbatim); re-export from `lib/ports/index.ts`. (tsc gate covers the types.)
2. **LocalCache contract** — `__contracts__/LocalCache.contract.ts`: queue
   add/put/delete/update/list round-trips; listUnsynced filters synced;
   listCustomers/listProducts ordered by name; replaceReferenceData is atomic
   (clears old, inserts new, stamps syncMeta); getSyncMeta returns the put row.
3. **LocalCache Fake** — `lib/adapters/fake/LocalCache.ts` (Maps); run the contract
   against it. Export from `lib/adapters/fake/index.ts`.
4. **Dexie adapter** — `lib/adapters/dexie/LocalCache.ts` (schema VERBATIM +
   singleton + `createDexieLocalCache`). If R7 = fake-indexeddb, run the SAME
   contract against the real adapter under `fake-indexeddb`. Barrel `index.ts`.
5. **Reactive hooks** — `lib/adapters/dexie/react.ts` (`'use client'`) — the 4 owned
   hooks. (Tested in step 11's test matrix — hook tests under fake-indexeddb OR a
   focused liveQuery mock.)
6. **ESLint fence (R5 — do this NOW, before re-pointing)** — add `dexie` +
   `dexie-react-hooks` to `.eslintrc.json` (top-level paths + services/usecases
   override + `lib/adapters/dexie/**/*.{ts,tsx}` allow-override). Add the mirror
   cases to `tests/unit/lint/no-adapter-imports.test.ts`. Run
   `npm run lint` + the mirror test to confirm the adapter passes and an import
   elsewhere fails.
7. **refreshReferenceData usecase** — `lib/usecases/refreshReferenceData.ts`
   (factory; injected `fetch` + `now`; the cooldown/fetch/validate/replace flow +
   the 3 verbatim failure paths). Unit-test with the Fake + a stub `fetch` + frozen
   `now`: cooldown-skip (both fresh), force-bypass, happy path
   (replaceReferenceData called + `{success:true,counts}`), fetch-throw warn-path,
   bad-shape, transaction-throw error-path.
8. **Wiring** — `lib/wiring/localCache.ts` (`'use client'`): `localCache` singleton,
   `refreshReferenceData` singleton, re-export the 4 hooks. Confirm no server-only
   import + no eager IndexedDB access (R2).
9. **Re-point syncEngine** — `lib/syncEngine.ts`: `import { localCache } from
   '@/lib/wiring/localCache'`; `localCache.listQueue()` + JS-side filters;
   `localCache.updateQueue(id, patch)`. Behaviour identical. Unit-test (Fake) the
   exhausted-reset + mark-synced + retry-increment paths.
10. **Re-point the 4 reactive consumers** — RecentActivity (`useTodayScreenActivity`),
    AppHeader `SyncDot` + `useSyncStatus` (`useUnsyncedQueue`), useReferenceData
    (`useLocalCustomers`/`useLocalProducts`). Each ends importing only owned hooks
    from wiring.
11. **Re-point the 4 pages** — complaints (static + dynamic import + 2 `add` +
    effect), dispatch (`add` + effect), visits (`filter`/`put`/3×`delete` + effect),
    pricing (`{force:true}`). Each → `localCache.*` + `refreshReferenceData(...)`.
12. **Delete `lib/localDb.ts`** — grep `@/lib/localDb` + `from 'dexie'` +
    `dexie-react-hooks` returns ZERO hits outside `lib/adapters/dexie/`; THEN delete.
13. **Final fence + suite** — `npm run lint` + the mirror test + tsc + full unit +
    integration; `@critical` preview smoke.

🗣 Build the socket and prove it on the bench, turn the lint guard on EARLY, lift
the errand-runner out with a frozen-clock + fake-phone test, flip the sync engine,
the four auto-updating screens, and the four pages, then delete the old box file —
each step has a test that fails until it's right.

---

## TDD test plan (ANVIL executes this) — be honest about what's provable where

### Unit (`tests/unit/…`, no real IndexedDB)
- **LocalCache contract against the Fake** — the headline correctness suite. Every
  port method (queue add/put/delete/update/list, customers/products ordered,
  replaceReferenceData atomicity, getSyncMeta).
- **refreshReferenceData usecase** (`usecases/refreshReferenceData.test.ts`) — Fake
  + stub `fetch` + frozen `now`: all 6 branches in step 7. THE key parity suite for
  the split — pins every console string + return shape.
- **syncEngine** (Fake) — exhausted-reset, pending-filter, mark-synced,
  retry-increment, the `syncInProgress`/`navigator.onLine`/`typeof window` guards
  (unchanged) still behave.
- **Lint mirror** (`no-adapter-imports.test.ts`) — dexie + dexie-react-hooks banned
  in app/components/hooks/services/usecases; allowed in `lib/adapters/dexie/`;
  verbatim message.

### Adapter / reactive-hook tests — **the honesty section (R7)**
Real IndexedDB does not exist in the headless vitest/node environment. Two options,
**flag for Gate-2 decision**:
- **Option A (recommended): add `fake-indexeddb` as a devDep.** It polyfills
  `indexedDB` in node so the REAL dexie adapter + the REAL `useLiveQuery` hooks run
  under test. Lets us: (1) run the LocalCache contract against the real dexie
  adapter (schema v1/v2 actually opens), (2) test the 4 reactive hooks fire on table
  change (write a queue row → assert `useUnsyncedQueue` re-renders). This is the
  strongest proof the cutover preserved behaviour. **Cost: ONE new devDep** needing
  a one-line justification ("test-only IndexedDB polyfill so the dexie adapter +
  liveQuery hooks run in node"). It is dev-only, never shipped — low risk.
- **Option B: no new dep.** Prove the port contract against the FAKE only; assert
  the dexie adapter maps to the right Dexie calls via a hand-mocked Dexie; assert
  the hooks via a mocked `useLiveQuery`. Cheaper, but it does NOT prove the SACRED
  schema actually opens or that liveQuery tracking survived — weaker confidence on
  exactly the two highest-risk pieces (R1, R3).

**Recommendation: Option A** — the two highest risks (reactive tracking + schema
sacredness) are only TRULY provable with a real IndexedDB, and a dev-only polyfill
is a cheap, low-risk way to get it. Decide at Gate 2.

### Integration
- No Supabase/Postgres integration applies (IndexedDB is browser-local — there is
  no DB-identity-probe surface here). `app/api/reference/route.ts` is untouched.

### E2E (`@critical` preview smoke)
- Standard `npm run test:e2e:preview -- <preview-url> --unprotected`,
  readiness-gated on `/api/auth/team`=200. A focused browser walk of the
  offline-dependent screens that the smoke already covers (orders-new / dispatch /
  visits submit → the AppHeader sync dot appears; the customer/product selectors
  populate). **NO exhaustive every-button sweep** — no UI change, no RLS, no
  visual change; right-sized per `[[anvil-full-browser-taps]]`.
- **Honesty:** true offline / service-worker / IndexedDB-persistence behaviour is
  HARD to assert in a headless preview smoke. The contract + (Option A) real-adapter
  tests carry the offline-correctness proof; the preview smoke confirms the online
  happy paths (queue write + reactive dot + selectors) didn't regress. Do NOT claim
  the smoke proves offline mode — say so plainly in the ship record.

🗣 The bench (with a fake browser-box) proves the schema opens, the queue stores,
and the bell rings on change; the errand-runner test proves every fetch outcome is
byte-identical; the preview smoke confirms the live screens still light up. We do
NOT pretend a headless smoke proves true airplane-mode offline — that's the
contract's job.

---

## Acceptance criteria

1. NO file outside `lib/adapters/dexie/` imports `dexie` or `dexie-react-hooks`
   (grep-clean). `lib/localDb.ts` no longer exists.
2. `.eslintrc.json` fences `dexie` + `dexie-react-hooks` (an import elsewhere fails
   lint); the mirror test pins it; `lib/adapters/dexie/**` is the only allow-override.
3. All 9 caller files import the LocalCache singleton / owned hooks /
   `refreshReferenceData` from `lib/wiring/localCache.ts`, and import zero vendor.
4. The Dexie schema v1/v2 is byte-identical to pre-F-26 (the SACRED check).
5. Every behaviour in the byte-identical checklist holds (parity unit tests green):
   queue add/put/delete/update, the 4 reactive auto-updates, the cooldown + force +
   3 failure paths + the `[syncReferenceData]` log prefixes.
6. `replaceReferenceData` + `refreshReferenceData.run` take `now`/`fetch` injected;
   the adapter's data methods call `Date.now()` zero times.
7. LocalCache passes one shared contract (Fake + — if Option A — the real dexie
   adapter under fake-indexeddb).
8. No new RUNTIME `package.json` entry; no migration; no RLS; no UI change. (The
   only possible new entry is the Option-A `fake-indexeddb` devDep, justified.)
9. Rip-out test holds (below).
10. `no-adapter-imports` mirror + eslint + tsc + full unit suite green;
    `@critical` preview smoke green.

---

## Rip-out test statement

**PASS (target).** Swapping the offline-store library (e.g. dexie → idb, or a
different IndexedDB wrapper) = one new `lib/adapters/<vendor>/` folder (the
`LocalCache` impl + the reactive `react.ts`) + one edit to `lib/wiring/localCache.ts`
(point the singleton + hook re-exports at the new adapter). The port, the 4 owned
types, the `refreshReferenceData` usecase, the 4 reactive consumers, the 4 pages and
the sync engine all stay unchanged. The reactive hooks are the one extra surface a
new adapter must provide — but they're inside the adapter folder, so they swap WITH
the vendor, not separately. **Currently FAIL** (9 files import the vendor directly);
**PASS after F-26**.

---

## Risk Assessment

### R1 — reactive-hook liveQuery table-tracking (business-logic / UX) — **MUST-FIX**
**Severity: HIGH.** `useLiveQuery` only re-runs when the Dexie tables its query
function READ change. If the owned hook wraps a port method that hides the table
access (or reads via the Fake), liveQuery loses tracking and **the screens stop
auto-refreshing** — the sync dot freezes, the activity feed goes stale, the
selectors don't update after a background sync. This is silent (no error) and the
exact kind of regression a headless smoke can miss.
**Mitigation:** the owned hooks live INSIDE `lib/adapters/dexie/react.ts` and call
`useLiveQuery` with query functions that perform the SAME real Dexie reads as today
(same tables, same `deps`, same `[]` default). Do NOT route the reactive read
through the port abstraction. Prove it with Option-A fake-indexeddb hook tests
(write a queue row → assert the hook re-renders). **Flag: must-fix** — and it is
the single strongest argument for the fake-indexeddb devDep (R7).
🗣 The whole point of the bell is it rings when the box changes. If we hide the box
behind the cover from the bell too, the bell goes silent and screens quietly stop
updating. The bell-puller must stand next to the box, and we must actually test the
bell rings.

### R2 — SSR safety (`'use client'` / no eager IndexedDB) — **MUST-FIX**
**Severity: MEDIUM.** Today `localDb.ts` has no `'use client'` and no `typeof
window` guard but never breaks SSR (lazy IndexedDB open + client-only importers). A
re-point that (a) eagerly touches IndexedDB at import, or (b) pulls the dexie
adapter into a server component via a mis-marked wiring file, would crash SSR /
build.
**Mitigation:** mark `lib/adapters/dexie/react.ts` + `lib/wiring/localCache.ts`
`'use client'`; construct the singleton at module load but NEVER run a query at
import; keep the usecase framework-free. Verify with `next build` (the
`@critical` smoke runs a prod build — an SSR break fails there) and a quick import
check during Render. **Flag: must-fix** — but it's a known, mechanical guard.
🗣 The box only works in the browser. We keep the existing quiet — never crack it
open at import, and mark the browser-only files browser-only — so the server build
doesn't trip over a thing that doesn't exist on the server.

### R3 — Dexie schema-version sacredness (data integrity) — **MUST-FIX**
**Severity: HIGH.** Field workers have LIVE IndexedDB data on their devices keyed to
the exact `version(1)`/`version(2)` `.stores()` strings. Modifying an existing
version (even reformatting whitespace inside the schema string, or reordering
indexed fields) triggers a Dexie upgrade that can corrupt or wipe queued, unsynced
submissions — real data loss.
**Mitigation:** copy `version(1)` + `version(2)` CHARACTER-FOR-CHARACTER into the
adapter; add NO new version; change NO index. Pin with a test asserting the exact
schema strings (and, Option A, that the DB opens at version 2 with the right
tables). **Flag: must-fix** — this is the one place a "tidy" causes irreversible
field data loss.
🗣 People have un-sent submissions sitting in the box on their phones, filed under
the exact current labels. Re-labelling the drawers — even cosmetically — can shred
those submissions. Copy the labels exactly; add nothing.

### R4 — `Date.now()` injection vs inline (determinism) — LOW
**Severity: LOW.** Today `syncReferenceData` calls `Date.now()` twice. The usecase
injects a single `now()`. At a 30-minute-boundary or sub-millisecond edge the
single-clock version is actually MORE correct (cooldown + timestamps agree). No
observable change otherwise; no race (single client call).
**Mitigation:** inject `now` into the usecase, pass it to `replaceReferenceData`;
default to `Date.now`. Frozen-clock tests pin it. **Not a blocker.**
🗣 We read the clock once instead of twice — if anything it's tidier and a test can
freeze it. No user-visible change.

### R5 — `dexie`/`dexie-react-hooks` NOT in the eslint fence today (enforcement) — **MUST-FIX**
**Severity: MEDIUM.** Verified: `.eslintrc.json` fences supabase/bcryptjs/anthropic/
resend/leaflet×4/jspdf×2/xlsx/web-push — but NOT dexie or dexie-react-hooks. So the
current breach isn't lint-caught, and without adding the fence a future
`import 'dexie'` silently re-opens it. The whole unit (closing the breach) is only
real if the fence + its mirror test land.
**Mitigation:** add both packages to the top-level paths + the services/usecases
override + a `lib/adapters/dexie/**/*.{ts,tsx}` allow-override; add the mirror cases
(banned in app/components/hooks/services/usecases, allowed in the adapter, verbatim
message). Do it in step 6, BEFORE re-pointing. **Flag: must-fix** — else the closure
is cosmetic and code-critic should reject.
🗣 There's no guard today stopping anyone grabbing the offline-box library directly —
that's the hole. We must add the guard, or we've only moved the leak, not sealed it.

### R6 — `isReferenceDataStale` has ZERO callers (dead code) — LOW (decision)
**Severity: LOW.** The spec mentioned a login handler calling `isReferenceDataStale`;
grep finds NO external caller — only its own definition. So it is currently
dead-but-exported.
**Mitigation:** either (a) port it as `localCache.isReferenceStale()` / a usecase
helper for parity + future use, or (b) drop it (delete with `localDb.ts`). **Recommend
(b) drop it** — it's genuinely unused; re-adding later is trivial and the rip-out is
cleaner. **Decide at Gate 2.** Not a blocker — just don't "preserve" dead code
without saying so.
🗣 There's a "is the address book stale?" helper nobody actually calls. Recommend we
bin it with the old file rather than carry it forward for no reason.

### R7 — `fake-indexeddb` new devDep question (testing) — **MUST-FIX (decision)**
**Severity: MEDIUM (decision, not a defect).** Real IndexedDB doesn't exist in the
node test runner. To prove the two HIGHEST risks — R1 (reactive tracking) and R3
(schema actually opens) — against the REAL dexie adapter, we need
`fake-indexeddb` (a dev-only polyfill; NOT currently installed). Option B (no dep)
tests the Fake + mocked Dexie/liveQuery only, leaving R1/R3 proven only indirectly.
**Mitigation:** **recommend adding `fake-indexeddb` as a devDep** with the one-line
justification — it directly proves the two must-fix risks and is dev-only (never
shipped). If Hakan declines, accept Option B and explicitly note in the ship record
that schema-open + liveQuery-tracking are covered by mock-level tests + the preview
smoke, not a real-IndexedDB run. **Flag: must-fix decision** — it determines the
confidence level on R1/R3 and whether a (dev-only) dep is added.
🗣 To truly prove the box still opens correctly and the bell still rings, the test
needs a pretend browser-box. It's a test-only tool, never shipped. Strongly worth
it — but it's one new (dev) tool, so it's your call.

### R8 — the dynamic `await import('@/lib/localDb')` in complaints (re-point edge) — LOW
**Severity: LOW.** `app/complaints/page.tsx:459` lazy-imports `localDb` (and
`syncEngine`) inside `handleResolve`. Re-pointing to a static wiring import is fine
(the file is already `'use client'`; the dynamic import was a minor deferral, not
load-bearing), but the implementer must not miss it (it's a SECOND import site in
the same file beyond the line-12 static one).
**Mitigation:** re-point BOTH the line-12 static import and the line-459 dynamic
import; grep the file for `localDb` after editing to confirm zero residue. **Not a
blocker.**
🗣 One screen grabs the box lazily in the middle of a function as well as at the top.
Easy to miss the second spot — re-point both and grep to be sure.

### Categories with no material risk
- **Concurrency / races:** the offline store is single-tab client state; this unit
  introduces no new concurrent writer. `syncEngine`'s `syncInProgress` guard is
  unchanged. The reference replace stays a single atomic Dexie transaction
  (byte-identical). No new race surface.
- **Data migration (Postgres):** none — IndexedDB is browser-local, no Postgres
  touched, no SQL migration. (The IndexedDB "schema version" sacredness is R3 — a
  different, client-side concern.)
- **Security / RLS:** none — no Postgres, no RLS, no auth surface. The offline store
  holds only already-authorised reference data + the user's own queued submissions,
  exactly as today.
- **Launch blockers:** R1, R2, R3, R5, R7 (all resolvable in-plan / at Gate 2 — R1/
  R2/R3 are preserve-and-test instructions, R5 is a config edit, R7 is a devDep
  decision). None loops back to Order.

### MUST-FIX summary (Gate 2 blockers)
- **R1** — owned reactive hooks MUST live in the dexie adapter and do real Dexie
  reads so `useLiveQuery` tracking is preserved; prove the bell rings.
- **R2** — `'use client'` on the adapter `react.ts` + wiring; no eager IndexedDB at
  import; SSR-safe.
- **R3** — Dexie schema v1/v2 copied byte-for-byte; no new version; no index change.
- **R5** — add `dexie` + `dexie-react-hooks` to the eslint fence + mirror test
  BEFORE re-pointing.
- **R7 (decision)** — add `fake-indexeddb` devDep (recommended) to truly prove
  R1+R3, or accept Option B with the confidence caveat noted.

All are decisions/preserve-instructions, not deep unknowns — they do NOT loop back
to Order, but MUST be resolved in the plan / at Gate 2 before Render proceeds.

---

## Biggest risk + mitigation (headline)

**The biggest risk is R1 — the reactive hook losing liveQuery table-tracking.** It's
the one place a "clean" abstraction silently breaks behaviour: if the owned hook
reads through the port/Fake instead of doing real Dexie reads, `useLiveQuery` stops
re-running and four screens quietly stop auto-updating — with no error and a green
headless smoke. The plan mitigates it by keeping the `useLiveQuery` import + the
real table reads INSIDE the dexie adapter's `react.ts`, exposing only purpose-built
owned hooks, and proving the bell actually rings with a fake-indexeddb hook test
(R7). The schema-sacredness risk (R3) is the close second — irreversible field data
loss if the v1/v2 strings are touched — mitigated by byte-for-byte copy + a
schema-pin test.
🗣 The trap is making it "clean" and silently deaf: route the auto-update through
the cover and the screens stop refreshing with nobody noticing. We keep the
auto-update machinery next to the box, and we actually test that a change makes the
screen redraw — and we copy the box's drawer-labels exactly so we don't shred
people's un-sent submissions.

---

## Hexagonal verdict (populates Gate 2)

- **Ports used/added:** 1 NEW — `LocalCache` (`lib/ports/LocalCache.ts`), owning the
  4 offline types. No existing port touched.
- **Adapters:** `lib/adapters/dexie/LocalCache.ts` (NEW vendor wrapper — the only
  `dexie` importer) + `lib/adapters/dexie/react.ts` (NEW — the only
  `dexie-react-hooks` importer) + `lib/adapters/fake/LocalCache.ts` (Fake). Wiring:
  `lib/wiring/localCache.ts`. Orchestration: `lib/usecases/refreshReferenceData.ts`.
- **New dependencies:** **RUNTIME = NONE.** `dexie@^3.2.4` +
  `dexie-react-hooks@^1.1.7` already in `package.json` (justification: client-side
  IndexedDB offline store for the field PWA — the existing, sufficient reason; this
  unit only RELOCATES the imports). Both become single-use (one folder) and ARE
  wrapped → single-use-vendor rule satisfied. **TEST-only = `fake-indexeddb`
  (PROPOSED, R7)** — dev-only IndexedDB polyfill so the real dexie adapter +
  liveQuery hooks run in node; needs a one-line justification; recommended but
  Hakan's call at Gate 2.
- **Rip-out test:** **PASS** (after F-26) — swapping the IndexedDB library = one new
  `lib/adapters/<vendor>/` (impl + reactive hooks) + one line in
  `lib/wiring/localCache.ts`; port, types, usecase, the 4 reactive consumers, the 4
  pages and the sync engine unchanged. Currently FAIL (9 files import the vendor).
  **No unjustified/unwrapped new dep** — the only proposed dep is a justified
  dev-only test polyfill behind a Gate-2 decision; not a Gate-2 blocker on its own.
