# Code-critic review — F-19 PR9a Cluster F foundation (PR #76)

**Branch:** feat/f19-pr9a-cluster-f-foundation
**Date:** 2026-06-25
**Verdict:** CLEAR — no blockers. Hand to ANVIL.

Introduce-only hexagonal foundation for 8 HACCP "docs & lookups" surfaces. 3 hexagons
(Handbook, Suppliers, Lookups), each = domain type + port + service factory + Supabase
adapter + Fake adapter. No route re-pointed.

## Priority findings

### Priority 1 — Introduce-only invariant: CONFIRMED
- No `app/api/**`, no `supabase/migrations/**`, no `package.json`, no `.eslintrc.json`,
  no `app/**`/`components/**` touched. Orders `CustomersRepository` untouched.
  (Verified via `git diff --name-only main...FETCH_HEAD`.)
- The 3 new singletons referenced ONLY in `lib/wiring/haccp.ts` +
  `tests/unit/wiring/haccpService.test.ts` — zero `app/` callers.
- `tests/unit/wiring/haccpService.test.ts:253-268` pins the exact wiring export set and
  asserts no `…ForCaller` leaked.

### Priority 2 — Hexagonal / dependency rules: CLEAN
- `lib/ports/Haccp*` and `lib/domain/Haccp*` import `@/lib/domain` only — no adapter imports.
- `@supabase/supabase-js` imported only in the 3 `lib/adapters/supabase/Haccp*Repository.ts`.
- Services export factories (`createHaccp*Service`); singletons only in `lib/wiring/haccp.ts`.
- Wiring service-role only; no `…ForCaller` added (deferred, documented at `haccp.ts:155-156`).
- Rip-out test passes.

### Priority 3 — Write-path byte-identity (the real risk): VERIFIED
Each adapter/service write diffed line-by-line against its current route:
- `createSupplier` reproduces `admin/suppliers/route.ts:56-72` exactly (active ?? true,
  position=count+1, 13 `?? null` defaults, label_code trim/upper/slice(0,6), key order;
  correctly omits `categories` from insert). Pinned `HaccpSuppliersService.test.ts:217-233`.
- `updateSupplier` — 16-key whitelist matches `admin/suppliers/route.ts:95-99`; non-whitelisted
  dropped; empty→"No valid fields to update"; missing id→"id required". Pinned test :272-296.
- `saveRecallConfig` — payload matches `recall/route.ts:78-100`; id→update / no-id→insert;
  userId/nowIso injected at edge. Pinned test :134-143.
- `updateSupplierContacts` — each field `?.trim() || null` matches `recall/route.ts:136-140`.
  Pinned test :180-188.
Fake adapter records every write payload as-is — genuine written-row assertions.

### Priority 4 — Test quality: STRONG
- Write payloads pinned exactly via inspectable fake.
- Shape pins: bare-array documents, admins-first sort, slice(0,4) fallback, key-order.
- Negative/edge branches: missing-param 400, q<2 no-repo-call, config-null, blank-name reject,
  empty-update reject.
- Behaviour-through-public-factory against inspectable fakes; no internal-collaborator mocking.

## Depth verdicts
- `HaccpSuppliersService` → DEEP (create-payload assembly, whitelist, label norm, trim-to-null, position).
- `HaccpHandbookService` → DEEP (section-vs-doc validation, q<2 short-circuit, bare-array contract).
- `HaccpLookupsService` → DEEP (borderline; admins-first comparator is real presentation logic).
- 3 ports → proven seams (one real adapter + one fake), not speculative.
- 3 Supabase adapters → thin I/O-and-cast wrappers (expected for an adapter).
- No PASS-THROUGH or SPECULATIVE SEAM introduced.

## 🔵 Architecture notes (follow-up, NOT blocking)
1. Snake_case domain types + `as unknown as` casts instead of explicit snake→camel mapping.
   Deliberate, pre-existing pattern across every prior HACCP cluster — it's the byte-identity
   mechanism that makes PR9b a zero-change re-point. Known debt; deepen whole HACCP domain to
   camelCase in a later pass, not here.
2. `as unknown as` double-casts bypass the type-checker at the adapter boundary. A future column
   rename wouldn't be caught by `tsc` here. Mitigated by byte-identity select strings + PR9b
   integration/E2E. Follow-up candidate for a runtime row-validator.

## 🟡 Warnings: none.
## 🔴 Blockers: none.

## Test / typecheck / lint
- New + touched unit suites (4 files): 33/33 pass.
- Full unit suite: 146 files, 2346/2346 pass (incl. no-adapter-imports 49/49).
- `tsc --noEmit`: clean (exit 0).
- `next lint`: clean.
- Integration/E2E correctly NOT run — no route touched (introduce-only).
