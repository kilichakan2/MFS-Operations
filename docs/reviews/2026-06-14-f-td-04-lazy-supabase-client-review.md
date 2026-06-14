# FORGE Guard (code-critic) review — F-TD-04 lazy Supabase client (PR #35)

**Branch:** `f-td-04-lazy-supabase-client` · **Base:** `main` · **Date:** 2026-06-14
**Verdict: SHIP** — no blockers, no should-fix. One trivial 🔵 nice-to-have, three 🟢 good-marks. Hand to ANVIL (integration suite deferred — local stack not running at review time).

## Suite results

| Check | Expected | Actual | Status |
|---|---|---|---|
| `npm run typecheck` | 0 errors | 0 errors (exit 0) | PASS |
| `npm run lint` | 0 problems | "No ESLint warnings or errors" | PASS |
| `npm test` (with `tests/setup.ts` DELETED) | ~1536 unit | 1536 passed / 77 files, `setup 0ms` | PASS — acceptance proof met |
| Straggler grep `from '@/lib/supabase'` | 0 | 0 matches | PASS |
| `npm run test:integration` | 122 | not run — local Supabase not up | DEFERRED to ANVIL |

Headline: 1536 tests pass with no setup file running (`setup 0ms`). Baseline 1533 + 3 new `client.test.ts` cases = 1536. The shim existed only to stop the eager client crashing tests; green-without-it proves the laziness removed that need.

## Layer 1 — Security — 🟢 Good (exposure unchanged)
- Env var names in `lib/adapters/supabase/client.ts:24-25` byte-identical to deleted `lib/supabase.ts` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). No new env wiring.
- No `'use client'` file imports `@/lib/adapters/supabase/client` (zero hits). Service-role key stays server-only.
- No key logging in `client.ts`. Header retains the "bypasses RLS / server-only / never in client component" warning (`client.ts:6-7`).

## Layer 2 — Correctness (the lazy proxy linchpin) — 🟢 Good
- **(b) Inert on import / when passed to factories.** Repo singletons run at module-eval, e.g. `OrdersRepository.ts:961-962` `createSupabaseOrdersRepository(supabaseService)`; factory body (`OrdersRepository.ts:340-380`) only closes over `client` and accesses `client.from(...)` inside async methods. Passing the proxy at module-load triggers no property access → no `createClient`.
- **(c) Memoization sound.** `client.ts:15-29`: `let memo` + `if (memo === null)` guard, single module-scope binding. Single-threaded eval → no race. Runtime probe: 2nd `.from()` does not re-construct.
- **(a) Trap set complete for actual usage.** `grep -rhoE "supabaseService\.[a-zA-Z]+"` → only `supabaseService.from` across the repo. No `.auth/.storage/.rpc`, no call/new, no destructuring. `get` trap (`client.ts:39-41`) covers `.from`; proxy also implements `has/set/ownKeys/getOwnPropertyDescriptor/getPrototypeOf`.
- **(e) No circular import.** `client.ts` imports only `@supabase/supabase-js` (`client.ts:18`); repos → client one-way.
- **Codemod correctness — 🟢.** Spot-checked `app/api/auth/login/route.ts`, `lib/road-times.ts`, `OrdersRepository.ts`, `app/api/reference/route.ts`: pure path swaps, 88 files all `2 +-`. Straggler grep zero.
- **Deleted-file safety — 🟢.** `lib/supabase.ts` + `tests/setup.ts` gone; `vitest.config.ts` drops `setupFiles: ["./tests/setup.ts"]`; zero remaining `tests/setup` refs. Green suite proves nothing else depended on the stubs.

## Layer 3 — Conventions / architecture
**Depth rubric (new `lib/adapters/supabase/client.ts`): PASS — deep, not pass-through/speculative.** Deletion test: removing it spreads lazy-construction to 88 call-sites or re-introduces the eager-client+shim problem. 88 real consumers (not speculative). Hexagonal: SDK import now inside the allow-listed `lib/adapters/supabase/` folder; `.eslintrc.json` override drops the dead `lib/supabase.ts` entry.

**🔵 Nice-to-have — stale doc-comment paths.** `UsersRepository.ts:18`, `CustomersRepository.ts:20`, `OrdersRepository.ts:25` JSDoc headers still say `` `supabaseService` from `@/lib/supabase` ``. Actual imports on those files were rewritten correctly; only prose is stale. No functional impact. Fix: update the three comment strings.

**Lint-mirror sync — 🟢 Good.** Forbidden-message string assembled from `.eslintrc.json` (both copies) and both lint-test mirrors (`no-supabase-sdk.test.ts`, `no-adapter-imports.test.ts`) — all four byte-for-byte identical. `no-supabase-sdk.test.ts` allow-case (2) correctly retargeted to `lib/adapters/supabase/client.ts`.

## Layer 4 — Test quality — 🟢 Good
- `tests/unit/adapters/supabase/client.test.ts`: Test 1 (`:21`) import-with-no-env doesn't throw; Test 2 (`:27`) holding the proxy reference doesn't construct; Test 3 (`:33`) memoization. `vi.resetModules()` in `beforeEach` (`:11`) fresh memo per test; env saved/restored in `afterEach`. Behaviour via public exports, not internals.
- Forwarding (`.from`/get-trap) not asserted directly but covered transitively by the 1533 existing repo tests through the proxy + runtime probe — adequate.

## Verdict
**SHIP — no blockers, hand to ANVIL.** Depth: PASS. Single 🔵 (3 stale doc-comment paths) optional, need not block. Integration suite (122) outstanding → ANVIL on local/preview stack.
