# FORGE Guard review — F-26 LocalCache port + Dexie adapter (offline-store cutover)

**Date:** 2026-06-27
**PR:** #86 · branch `feat/f26-localcache-dexie-cutover` · base `main` @ `4c12982`
**Reviewer:** code-critic (FORGE Guard, sole review authority for this pass)
**Verdict:** **NO BLOCKERS — hand to ANVIL.** Recommend ANVIL include one browser-tap confirming live auto-refresh on a consumer screen (closes the only un-automated R1 gap). Two 🟢 non-blocking notes.

---

## Toolchain results
- `tsc --noEmit`: clean.
- `npm run lint`: clean (no warnings/errors).
- Unit suite (`vitest run`): **2667/2667** (181 files); F-26-scoped **308/308**.
- `npm run build` (next build): **Compiled successfully** — all 4 consumer pages (`/dispatch`, `/complaints`, `/visits`, `/pricing`) prerendered static with NO IndexedDB/SSR crash (R2 proven).

## Depth verdicts — all DEEP, no pass-through / speculative seam
- `lib/ports/LocalCache.ts` → **DEEP** — pure-TS interface hiding queue + reference mirror + sync-meta; `Table<T>` correctly excluded; real substitutable seam (two adapters pass one contract).
- `lib/adapters/dexie/LocalCache.ts` → **DEEP** — maps each port method to a store op; owns the atomic clear+bulkAdd + the sacred schema; the 1:1 mapping IS the adapter boundary (correct forwarding, not pass-through).
- `lib/adapters/dexie/react.ts` → **DEEP** — owned reactive hooks hide `useLiveQuery` + the verbatim Dexie read bodies; must live here for table-tracking (R1).
- `lib/usecases/refreshReferenceData.ts` → **DEEP** — owns fetch/cooldown/timeout/validation/failure-paths; keeps HTTP out of the adapter.
- `lib/adapters/fake/LocalCache.ts` → **DEEP** — full in-memory contract impl.
- `lib/wiring/localCache.ts` → composition root (not a depth target).

## Must-verify confirmations
- **(a) Byte-identity of refreshReferenceData vs old syncReferenceData: HOLDS.** 30-min cooldown, `/api/reference`, `AbortSignal.timeout(10_000)`, Content-Type, `res.ok`, `Array.isArray` validation, `'Unexpected API response shape'`, BOTH `[syncReferenceData]` console prefixes (verbatim, kept despite the rename), `{force:true}` path, atomic clear+bulkAdd replace, all `{success}` return shapes — identical. **Determinism (R4):** clock read once via injected `now()`, reused for cooldown + timestamps (a strict improvement over the old double `Date.now()`; no observable change at non-boundary times). No bare `Date.now()` in the usecase.
- **(b) Schema byte-for-byte (R3): YES.** DB name `'mfs-ops'`, version count 2, v1 `queue: 'localId, screen, synced, createdAt'`, v2 queue (same) + `customers: 'id, name'` + `products: 'id, name, category'` + `syncMeta: 'key'` — identical strings/indexes/order/indentation. Adapter test proves the DB opens at `verno === 2` with exactly those 4 tables under fake-indexeddb.
- **(c) R1 — structural mitigation ADEQUATE; React-test stack NOT required as a blocker.** All 4 owned hooks do the SAME real `localDb.*` read INSIDE `useLiveQuery` with identical query body, deps array, and `[]` default as the pre-F-26 consumer:
  - `useUnsyncedQueue` ≡ AppHeader SyncDot + useSyncStatus
  - `useLocalCustomers` ≡ useCustomers
  - `useLocalProducts` ≡ useProducts/useProductsWithDetail
  - `useTodayScreenActivity` ≡ RecentActivity (character-for-character, incl. the `anyOf` customer/product pre-load keeping all 3 tables tracked)
  None routes the reactive read through the port or Fake (which would silently break table-tracking). Reviewer judgment: cover the actual re-render with a browser tap in ANVIL, not 3 new React-test devDeps.
- **R2 (SSR): PASS** — `'use client'` on `react.ts` + wiring; singleton built at module load but Dexie opens IndexedDB only on first query, so static prerender succeeded.
- **R5 (ESLint fence): PASS** — both `dexie` + `dexie-react-hooks` fenced in top-level paths AND services/usecases override; `lib/adapters/dexie/**` allow-listed; mirror test cases 55-64 pin both messages; real imports exist in EXACTLY `lib/adapters/dexie/LocalCache.ts:32` + `react.ts:25`; no stale `@/lib/localDb`; `lib/localDb.ts` deleted (260 lines).
- **R6:** `isReferenceDataStale` deleted, not carried forward. **PASS.**
- **R7:** `fake-indexeddb` in `devDependencies` ONLY, with `// reason:` justification; no runtime dep added. **PASS.**
- **Wiring fence: PASS** — usecase/adapter export factories; singleton + refresh runner only in wiring; all 9 callers go through wiring. Final committed code correct regardless of the fork/auto-commit-hook provenance.

## 🟢 Test-quality / non-blocking
- `tests/unit/adapters/dexie/LocalCache.test.ts` — the reactive hooks' `useLiveQuery` re-render is NOT exercised (data methods + schema-open only). The R1 gap. → cover with a browser tap in ANVIL (submit a Screen-1 discrepancy, watch RecentActivity update live + the AppHeader sync dot appear/clear).
- `tests/e2e/_seedLocalDb.ts:7` — stale comment references the deleted `lib/localDb.ts` (the seed uses its own in-browser esm.sh Dexie, functionally independent). Cosmetic doc-rot; fix opportunistically.

## Security & correctness
No security findings (client-side IndexedDB; no RLS/auth/server-input/new endpoint). One nuance cleared: in `lib/syncEngine.ts` the `exhausted` filter moved from Dexie-side `.filter().toArray()` to JS-side `(await listQueue()).filter()` — same result set (the `pending` path was already JS-side on main); no behaviour change.

## Verdict summary
| Dimension | Result |
|---|---|
| Security | ✓ no findings |
| Correctness | ✓ byte-identity holds (sync logic + schema verified) |
| Conventions | ✓ both Dexie packages fenced to one folder · 9 callers vendor-free · rip-out PASS |
| Depth | ✓ all new modules DEEP |
| Tests/tsc/lint/build | ✓ 2667/2667 · tsc clean · eslint clean · next build clean |

**NO BLOCKERS — hand to ANVIL.** Carry to ANVIL: (1) a browser-tap confirming live auto-refresh on a consumer screen (R1 gap); (2) optionally fix the `_seedLocalDb.ts:7` stale comment.
