# ANVIL Clearance Certificate — CLEARED (conductor Lock complete 2026-06-27)

Date: 2026-06-27
App: MFS-Operations
Branch: feat/f26-localcache-dexie-cutover
PR: #86 — https://github.com/kilichakan2/MFS-Operations/pull/86
Head SHA: 287671c (ANVIL ran on 244366d; +1 test/tooling commit since — _seedLocalDb doc-rot + e2e-preview --grep, behaviourally identical, no source change)
Preview tested: https://mfs-operations-git-feat-f-48f927-hakan-kilics-projects-2c54f03f.vercel.app (dpl_9sUaLqn8LP1JP4ahW7QRMyMoyBPm, READY, commit 244366d)

## Scope — what this certificate actually covers

F-26 is a behaviour-preserving, **client-side** hexagonal re-point: the Dexie/IndexedDB
offline store + sync (`lib/localDb.ts`) moved behind a new owned `LocalCache` port. The
`dexie` SDK now lives only in `lib/adapters/dexie/LocalCache.ts` (schema v1/v2 copied
byte-for-byte); `dexie-react-hooks`' `useLiveQuery` lives only in
`lib/adapters/dexie/react.ts` as owned reactive hooks; the `/api/reference` fetch+cooldown
became `lib/usecases/refreshReferenceData.ts`. An in-memory `lib/adapters/fake/LocalCache.ts`
backs the shared `lib/ports/__contracts__/LocalCache.contract.ts`. 9 consumers re-pointed;
`lib/localDb.ts` deleted; ESLint fence (`.eslintrc.json`) now bans `dexie`/`dexie-react-hooks`
outside `lib/adapters/dexie/`. **NO migration, NO RLS, NO Postgres/Supabase schema change,
NO new RUNTIME dependency** (`fake-indexeddb` is a TEST-ONLY devDependency), **NO visual or
functional UI change.**

🗣 In plain English: this moved the app's offline phone-storage drawer behind a clean owned
interface. Nothing about the company database, logins, or permissions changed — only how the
client code talks to the browser's own IndexedDB. Swap Dexie for another offline store later
= one new adapter + one wiring line.

| Change / path                                                                   | Risk tier                      | Layers required                                | Layers run                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `lib/adapters/dexie/{LocalCache,react,index}.ts` (new dexie adapter + hooks)    | Medium (crosses a seam, client) | Unit (fake-indexeddb) + Architecture rung + E2E live-refresh | Unit 16/16 under fake-indexeddb + contract on both adapters + R1 browser tap |
| `lib/ports/LocalCache.ts` + `__contracts__` + `lib/adapters/fake/LocalCache.ts` | Medium (seam)                  | Unit (fake + shared contract on BOTH adapters) | Run — fake unit + shared contract green on Fake AND Dexie                   |
| `lib/usecases/refreshReferenceData.ts` (fetch + cooldown, `now` injected)       | Medium                         | Unit (parity, every branch)                    | Run — 11/11 parity cases                                                    |
| `lib/syncEngine.ts` re-point onto LocalCache                                    | Medium                         | Unit (every drain/retry branch)                | Run — 5/5                                                                   |
| 9 consumers (`app/dispatch`, `complaints`, `visits`, `pricing`; `components/{AppHeader,RecentActivity}`; `hooks/{useReferenceData,useSyncStatus}`) | Low–Med (UI, no visual change) | Build (SSR safety) + E2E @critical + R1 live-refresh tap | Build clean + @critical 75/75 + R1 live tap on /dispatch                    |
| `.eslintrc.json` fence (dexie/dexie-react-hooks ban) + lint-mirror test         | Low                            | Lint + the no-adapter-imports mirror test      | Run — lint clean + mirror green (113 lines)                                |

**Not run under the efficiency dial:** No exhaustive every-button HACCP-style browser sweep —
nothing about auth/RLS/permissions changed and there is ZERO visual change, so the standard
`@critical` smoke + the focused R1 live-refresh tap is the correct depth (right-sizing rule for
a no-RLS, behaviour-preserving re-point — same call as F-20 PR3 / F-21 / F-25). The full ladder
that DOES apply (unit + IndexedDB-adapter + SSR build + @critical + R1) was run in full.
**Baseline characterisation pass?** No — diff-driven, behaviour-preserving re-point.

**Architecture rung (seam crossed):** PASS. The new `LocalCache` port has a shared
`__contracts__` suite run against BOTH the in-memory Fake (`tests/unit/adapters/fake/`) and the
real Dexie adapter under `fake-indexeddb` (`tests/unit/adapters/dexie/`). The
`no-adapter-imports` lint-mirror test is green — `dexie`/`dexie-react-hooks` are imported ONLY
inside `lib/adapters/dexie/`; the 9 consumers import the OWNED hooks/usecase via
`lib/wiring/localCache.ts`, never the vendor. No vendor SDK leaks into `lib/domain`, `lib/ports`,
`lib/services`, `lib/usecases`, or their tests.

🗣 In plain English: the new swap-point is real — the same behaviour checklist passes on a
pretend in-memory store AND on the real Dexie engine running on a simulated browser database,
and the linter physically forbids any screen from reaching for Dexie directly.

## Test Results

| Layer                          | Status                       | Notes                                                                                                                                   |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)                  | ✅ 2667/2667 (181 files)      | F-26-scoped: dexie adapter (16/16, under fake-indexeddb) · fake adapter + shared contract · refreshReferenceData parity (11) · syncEngine (5) · lint-mirror (113-line) |
| `tsc --noEmit`                 | ✅ clean                      | Whole project typechecks                                                                                                               |
| `next lint`                    | ✅ clean                      | No ESLint warnings/errors; the new dexie/dexie-react-hooks fence is active                                                             |
| `next build` (SSR safety)      | ✅ clean                      | All routes prerendered; the client-only IndexedDB code does NOT crash the server build (the graded SSR risk held — Dexie opens lazily in-browser) |
| IndexedDB layer (fake-indexeddb) | ✅ 16/16                     | dexie adapter opens `mfs-ops` at **verno 2** with the four v2 tables (queue/customers/products/syncMeta), queue PK = `localId`; queue + reference round-trips green. SACRED schema strings byte-preserved from the deleted `lib/localDb.ts` |
| Database (pgTAP)               | n/a — not required           | F-26 touches the **browser's** IndexedDB only. NO Postgres migration, NO RLS/policy change, NO Supabase schema change. There is no server-side DB surface to test for this cache |
| Edge Functions (Deno)          | n/a — not required           | None touched                                                                                                                          |
| Local full-stack rung          | n/a for the cache            | The offline store is browser IndexedDB, proved under `fake-indexeddb` (no Docker/local-Supabase needed for it). The @critical + R1 ran against the hosted preview |
| E2E (@critical preview smoke)  | ✅ 75/75 first run            | Against PR #86 preview (branch alias `…-git-feat-f-48f927-…`); readiness-gated on `/api/auth/team`=200; preview DB-identity probe (4 checks) passed; NO F-TD-37 flake, NO branch reset needed (6.0m) |
| **R1 live-refresh browser tap**| ✅ PASS — observed live       | See the dedicated section below. The headline rung                                                                                    |
| Populated UI smoke             | ✅ populated (R1 + @critical) | R1 rendered a live RecentActivity card from a real queued row; the @critical suite's data-dependent HACCP/reviews/audit specs all rendered seeded rows |
| Breadth crawl                  | covered by @critical 75/75   | The @critical suite walks every major screen incl. dispatch/complaints/visits/pricing (the re-pointed consumers) and all HACCP surfaces |

🗣 In plain English: every layer is green. Fast logic tests (2667), the offline-drawer tests on
a simulated browser database (16), a clean production build (the offline code didn't crash the
server), 75 real-browser journeys on the live preview, and — the headline — a real browser
proving the screen auto-updates the instant you submit.

## R1 — the headline live-refresh browser tap (what fast tests CANNOT prove)

**Why this rung exists:** `useLiveQuery(fn)` only re-runs `fn` when the Dexie tables `fn` READS
change. Moving the hooks into `lib/adapters/dexie/react.ts` risked the reads being routed through
the port/Fake (which would make liveQuery lose table-tracking) — the screens would then submit
correctly but silently STOP auto-refreshing, with NO error and ALL unit/contract tests still
green. Only a real browser observing an actual re-render catches this.

**Structural coverage (verified by reading the source, `lib/adapters/dexie/react.ts`):** each
owned hook performs the SAME real Dexie reads the consumer did before — directly against
`localDb.*`, NOT through the port — keeping the exact query body, `deps`, and `[]` default. So
liveQuery tracks the same tables:
- `useUnsyncedQueue()` → `localDb.queue.filter(r => !r.synced).toArray()` (tracks **queue**) →
  feeds AppHeader `SyncDot` + `useSyncStatus`.
- `useTodayScreenActivity(screen, today)` → reads **queue + customers + products** inside the hook
  (records, then `customers.where('id').anyOf(...)`, `products.where('id').anyOf(...)`) → feeds
  `RecentActivity`.

**Live browser proof (machine-observed, NOT inferred):** a temporary Playwright chromium probe
(`@f26r1`, run through the preview wrapper's fail-closed guards + DB-identity probe) drove the
real preview build:
1. Logged in as **warehouse** (the Screen-1 / `/dispatch` role).
2. Seeded the Dexie reference cache from `/api/reference` (reference rows only — NO queue rows).
3. On `/dispatch`, asserted BASELINE: no sync dot (`useUnsyncedQueue` empty → SyncDot null) and
   no activity section.
4. Submitted a NOT-SENT Screen-1 discrepancy (real `localCache.addToQueue({ screen:'screen1',
   synced:false })` + `triggerSync()`).
5. **WITHOUT any `page.reload()`**, asserted LIVE:
   - **(a)** the AppHeader **sync dot lit up** (`aria-label` "Syncing"/"Sync error" appeared) —
     proving `useUnsyncedQueue` → `useLiveQuery` on the queue re-fired.
   - **(b)** the **"My Activity Today" RecentActivity section materialised** with a card carrying
     a **NOT SENT** badge — proving `useTodayScreenActivity` → `useLiveQuery` on
     queue+customers+products re-fired and resolved the customer/product names.
   Probe result: **1 passed (6.7s)**, first run.

**Honest scope of what was observed:** the live tap was driven on **Screen 1 (`/dispatch`)**,
which exercises BOTH reactive hooks (queue-only via SyncDot AND the queue+customers+products join
via RecentActivity) — the two hooks that carried the entire R1 risk. The other re-pointed
consumers (Screen-2 complaints, Screen-3 visits, pricing, `useReferenceData`/`useSyncStatus`)
import the SAME owned hooks/wiring (`useLocalCustomers`/`useLocalProducts`/`useUnsyncedQueue` via
`lib/wiring/localCache`), so they are covered by the same liveQuery proof at the hook level plus
the @critical suite mounting those screens — they were NOT each separately hand-driven for a live
re-render (right-sized: no UI/RLS change). What is machine-proven is the queue→RecentActivity and
queue→SyncDot live re-render on Screen 1; what is structural-coverage (verbatim shared hooks + the
fake-indexeddb adapter proof) is the equivalent live re-render on the other three consumer screens.

🗣 In plain English: the single biggest risk of this change was "the screen quietly stops
updating itself." A real browser proved it still updates live on the dispatch screen — both the
new-entry list AND the sync indicator — without a refresh. The other screens reuse the exact same
update wiring, so they ride on the same proof.

## Iterate log (2 loops max — used 0)

No failures. Every layer passed on its first run. No re-run loops needed. The F-TD-37 HACCP flake
did not trip; no Supabase preview-branch reset was needed.

## Real-code bugs requiring a FORGE eject

**NONE.** No `/reorder`, `/reframe`, or `/rerender` needed. (Guard / code-critic had already passed
with NO BLOCKERS; ANVIL confirms green across all layers.)

## Migration

**None.** Rollback: `docs/anvil/2026-06-27-f26-localcache-dexie-cutover-rollback.md` (CODE-ONLY —
revert the merge / promote the previous Vercel build; no `db push`, no schema change, no PITR).
The browser IndexedDB schema (`mfs-ops`, verno 2) is byte-identical before and after the cutover,
so neither the cutover nor a revert forces any on-device migration or user re-sync.
PITR confirmed: **N/A** (no migration, no destructive operation, no server DB data touched).

## Merge Sequence

1. (No migration — skip `supabase db push`.)
2. Merge PR #86 → Vercel auto-deploys.
3. Post-deploy smoke: 3 `@critical` paths against the production URL.
4. If smoke fails → `vercel rollback` / promote the previous prod build (code only; no data to
   recover).

Supabase preview branch (PR #86's Branching DB) auto-deletes on merge.

## Manual smoke at merge

**Not required** — critical flows proven on the real preview with real data (@critical 75/75
first-run), the offline-store live-refresh proven end-to-end in a real browser on the deployed
build (R1 sync-dot + RecentActivity, no reload), a clean SSR production build, and the post-deploy
smoke armed with a code rollback. No visual UI changed, so no populated-UI or breadth-crawl gap to
name. The one explicitly-bounded scope note (R1 live tap driven on Screen 1; the other three
consumers covered structurally via the shared hooks) is stated in the R1 section above, not hidden.

## ANVIL-added artifacts the conductor must land (NOT in the pushed PR yet)

These were created/edited by ANVIL after PR #86 was pushed, so they are NOT in the current squash —
land them on the branch (or as a follow-up on main) before/at merge:
- `tests/e2e/_seedLocalDb.ts` — **modified**: doc-rot fix only (stale `lib/localDb.ts` comment →
  the LocalCache port + refreshReferenceData usecase). Test-only, no source change. (Item 6.)
- `scripts/e2e-preview.mjs` — **modified**: added a backward-compatible optional `--grep` override
  (default `@critical`) so ANVIL can run a focused probe through the same fail-closed guards.
  Tooling-only; omitting the flag is byte-identical to before.
- `docs/anvil/2026-06-27-f26-localcache-dexie-cutover-rollback.md` — the rollback note.
- `docs/anvil/2026-06-27-f26-localcache-dexie-cutover-cert.md` — this certificate.

**Discard (do NOT merge):** `tests/e2e/99-f26-r1-live-refresh.spec.ts` — the temporary R1 probe
spec. It is **untracked** (never staged/committed → not in the PR or squash-merge). It depends on
`ANVIL-TEST` seed rows + warehouse PINs and is not part of the `@critical` suite; leave it out.

## Verdict

✅ CLEARED FOR PRODUCTION — Lock gate complete (no destructive migration → PITR N/A;
pre-ship @critical preview smoke 75/75 first-run; R1 live-refresh observed in a real browser;
rollback armed, code-only). ANVIL-added artifacts landed on the branch (`287671c`: `_seedLocalDb.ts`
doc-rot fix + `e2e-preview.mjs` `--grep` override); the throwaway R1 probe spec removed. Conductor
approved 2026-06-27.
