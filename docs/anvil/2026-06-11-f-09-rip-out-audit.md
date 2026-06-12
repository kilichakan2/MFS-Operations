# F-09 — ANVIL Gate Audit: Orders Domain rip-out test (Phase 1 close-out)

- **Date:** 2026-06-11
- **Audited at:** `main` @ `fa44982`
- **Auditor:** code-critic (report-only — no code changed)
- **Gate definition:** CLAUDE.md acceptance test — "If I rip out Supabase tomorrow and replace it for Orders, how many files change?" Required answer: **one adapter folder + one config/wiring line.**

---

## Headline verdict: FAIL — narrowly, on the wiring count. 1 BLOCKER.

Actual rip-out answer: **one new adapter folder + 4 changed wiring files** (required: 1 + 1).

Everything else passes cleanly: vendor containment, layer purity, route thinness, type boundaries, test health. Once the wiring is centralised, F-09 re-gates as a near-certain PASS.

### The literal rip-out enumeration

**New (allowed — "the one adapter"):**

- `lib/adapters/<newvendor>/` — new implementations of `OrdersRepository`, `CustomersRepository`, `ProductsRepository`, `UsersRepository` + barrel `index.ts`.

**Changed (the problem — 4 files, each a vendor-naming wiring line):**

1. `lib/services/OrdersService.ts:143-147` (import) + `:538-542` (singleton wiring) — names `supabaseOrdersRepository`, `supabaseCustomersRepository`, `supabaseProductsRepository`.
2. `lib/usecases/pickingList.ts:27-30` + `:120-124` — names `supabaseProductsRepository`, `supabaseUsersRepository`.
3. `lib/usecases/kdsLineDone.ts:25` + `:77-80` — names `supabaseUsersRepository`.
4. `lib/usecases/kdsQueue.ts:22` + `:71-74` — names `supabaseProductsRepository`.

**Unchanged (zero files):** all 5 route handlers, all 5 Orders/KDS UI pages, domain types, ports, DTO/schema helpers.

**`lib/supabase.ts` (F-TD-04, counted honestly):** the shared eager client at `lib/supabase.ts:15` is imported by all four Supabase adapter files. An Orders-only swap does NOT touch it (it stays alive for the ~80 unmigrated routes), so it does not add to the count — but it is Supabase code living physically outside `lib/adapters/supabase/`. Should relocate when F-TD-04's lazy-getter fix lands.

**Barrel footnote:** a degenerate one-file swap exists (re-point `lib/adapters/supabase/index.ts` exports at a new vendor) but is not credited — the folder and identifiers would be lying about their contents, and F-04 lint would force the new SDK into its own folder anyway. Honest count: 4.

---

## BLOCKER-1 — Wiring distributed across 4 files, not 1 composition root

- No composition-root file exists; the F-07 "factory + pre-wired singleton" template (documented at `OrdersService.ts:52-61`) embeds vendor wiring into every service and use-case file.
- This template is explicitly the worked example for every future service (`OrdersService.ts:4-7`). Left as-is, F-13 (UsersService) and each later domain clones it — wiring-site count grows linearly to ~30 by Phase 5. Cheapest fix moment is NOW, before the second domain copies it.
- **Fix shape:** one small refactor PR — a composition root (e.g. `lib/wiring/orders.ts`) that imports the adapter singletons once and constructs `ordersService`, `pickingListUsecase`, `kdsQueueUsecase`, `kdsLineDoneUsecase`. Service/use-case files keep their factories, lose their `@/lib/adapters/supabase` imports. Routes import singletons from the composition root. ~5 files, zero behaviour change, covered by existing 1504 unit tests.
- **Alternative resolution:** owner consciously amends the CLAUDE.md acceptance test to "one adapter folder + one wiring line _per composition point_". Legitimate owner decision — but must be explicit, not a wave-through.

---

## Findings per checklist item

| #   | Check                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Vendor containment (Orders flow) | **PASS** (except wiring above). `@supabase/*` imported only at `lib/supabase.ts:13` and inside `lib/adapters/supabase/*`. All 5 routes clean. Transitive helpers (`lib/api/validate.ts`, `lib/api/orders/*`, `lib/api/kds/*`, `lib/orders/pickingList.ts`, `lib/errors`, `lib/observability`, `lib/auth`) clean. UI pages talk HTTP only; zero adapter/SDK imports in `app/**` or `components/**`. Note: no "dispatch-list endpoint" exists in the Orders pipeline — `app/dispatch/page.tsx` is the van-routes domain (out of scope); Orders is exactly 5 routes. |
| 2   | Layer purity                     | **PASS** for `lib/domain/**` + `lib/ports/**` (zero adapter/framework/vendor imports). `OrdersService.ts` depends on ports only, with two carve-outs: the adapter import for the default singleton (= BLOCKER-1) and `import type { Role } from "@/lib/observability"` (`:123`) — type-only, erased at compile time, documented F-13 forward path, acceptable.                                                                                                                                                                                                    |
| 3   | Route thinness                   | **PASS.** Handler logic line counts: GET /api/orders ~12, POST ~11, GET /api/orders/[id] ~6, PUT ~14, picking-list GET+POST ~7 each, GET /api/kds/orders ~3, POST kds line-done ~17. Pattern everywhere: `requireRole` → zod `parseOrThrow` → one service/usecase call → DTO. Zero try/catch, zero business logic, zero DB calls.                                                                                                                                                                                                                                 |
| 4   | Type leakage                     | **PASS.** `SupabaseClient` only inside adapter files; `PostgrestResponse` nowhere outside adapters; barrel re-exports no vendor types (`index.ts:19-20`); ports trade in owned shapes; routes/UI consume DTOs.                                                                                                                                                                                                                                                                                                                                                    |
| 5   | Wiring count                     | **FAIL — 4 composition points** (ideal 1): `OrdersService.ts:538-542`, `pickingList.ts:120-124`, `kdsLineDone.ts:77-80`, `kdsQueue.ts:71-74`. (Adapters' internal singletons wire against `supabaseService` _inside_ the vendor boundary — fine, not counted.)                                                                                                                                                                                                                                                                                                    |
| 6   | Rip-out enumeration              | **FAIL** — 1 adapter folder + 4 wiring files vs mandated 1 + 1. See headline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7   | Known-debt cross-check           | Neither F-TD-04 nor F-TD-05 changes the verdict. F-TD-04: no Orders rip-out impact; its fix is the moment to relocate `lib/supabase.ts` into the adapter folder. F-TD-05: the architecture-pin test as written does NOT flag adapter imports inside services — it codifies, rather than catches, the BLOCKER-1 pattern; tighten it in the same PR as the composition-root refactor (forbid `lib/adapters` imports from `lib/services/**` and `lib/usecases/**`).                                                                                                  |

**Informational notes:**

- `app/api/dashboard/route.ts` and `app/api/admin/at-risk/route.ts` still read the `orders` table via direct Supabase — legal under the strangler-fig plan (ADR-0003) until their own phases; no Orders-flow file depends on them.
- `lib/orders/types.ts` (legacy DB-mirror wire shapes, app-owned, no SDK content) is still imported by all 5 Orders UI pages + `components/EditLockBanner.tsx`. Not a violation; `lib/domain/Order.ts:25-27` records the intent to retire it. Routes no longer import it; the UI still does. Backlog candidate for the UI phase.

---

## Baseline health numbers

| Check              | Result                            | Baseline  | Status    |
| ------------------ | --------------------------------- | --------- | --------- |
| `npx tsc --noEmit` | 60 errors                         | 60        | unchanged |
| `npm run lint`     | 58 (`Error:`/`Warning:` lines)    | 58        | unchanged |
| `npm test` (unit)  | 1504/1504 passed, 73 files, 1.57s | all green | PASS      |

Test-quality note: the Orders suite is behaviour-shaped — shared port contract tests (fake + real adapters), use-case tests through public factories with fake repositories, architecture pins. No internals-mocking observed. The one gap is the pin's narrow scope (F-TD-05, already logged).

---

## Recommended backlog entries

1. **NEW — F-TD-11: single composition root for Orders wiring** (the BLOCKER-1 fix). Extract `lib/wiring/orders.ts`; strip `@/lib/adapters/supabase` imports from `OrdersService.ts` + 3 use-cases; tighten the architecture pin / add ESLint rule forbidding `lib/adapters` imports from `lib/services/**` and `lib/usecases/**`. Must land (or the acceptance criterion be formally amended in CLAUDE.md) before F-09 stamps Phase 1 closed — and before F-13 clones the template.
2. **AMEND F-TD-04:** when the lazy-getter fix lands, also move `lib/supabase.ts` → `lib/adapters/supabase/client.ts` so all Supabase code lives in one folder.
3. **NEW (low priority):** retire `lib/orders/types.ts` wire shapes from the UI (5 pages + `EditLockBanner.tsx`) in favour of DTO-derived types; fold into the UI phase.

---

## Verdict line

**Blockers present (1) — Phase 1 does NOT close today.** The rip-out test fails on the letter of the wiring count. Resolution: either the composition-root refactor (recommended, ~5 files, zero behaviour change) or an explicit owner amendment of the acceptance criterion in CLAUDE.md. On either resolution, F-09 re-gates.

---

## RE-GATE ADDENDUM — 2026-06-12: PASS. Phase 1 CLOSED.

Hakan chose the fix. **F-TD-11** (PR #29, squash `43f5049`, cert `docs/anvil/2026-06-12-f-td-11-cert.md`) shipped the composition root + ESLint guard. The rip-out enumeration was re-run on shipped `main@43f5049` by the conductor:

- Business/UI files importing `@/lib/adapters` outside `lib/adapters/` + `lib/wiring/`: **empty**
- Wiring files importing adapters: **exactly `lib/wiring/orders.ts`**
- Any `@/lib/adapters` mention in `lib/services/` + `lib/usecases/`: **empty**

**Orders rip-out cost: 1 adapter folder + 1 wiring file — the mandated answer. BLOCKER-1 discharged. F-09 verdict flips to PASS; Phase 1 of the strangler-fig migration (ADR-0003) is formally closed.** The wiring rule is now codified in CLAUDE.md (folder layout, `lib/wiring/`) and ADR-0002 (2026-06-12 amendment); recommended backlog entries from this audit are booked as F-TD-11 (done), F-TD-12 (open), and the F-TD-04 amendment.
