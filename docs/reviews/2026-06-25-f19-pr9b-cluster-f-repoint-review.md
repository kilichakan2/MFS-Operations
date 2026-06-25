# Code-critic review — F-19 PR9b Cluster F re-point (PR #77)

**Date:** 2026-06-25
**Branch:** `feat/f19-pr9b-cluster-f-repoint` · base `fcc9ca7`
**Reviewer:** code-critic subagent (FORGE Guard)
**Verdict:** **CLEAR** — no blockers, hand to ANVIL. **0🔴 0🟡 0🔵.**

## What this PR is
4th repeat of the Cluster A→E re-point pattern. Moves 8 HACCP route handlers off direct
`supabaseService.from(...)` calls onto 3 pre-built, unit-tested service singletons
(`haccpHandbookService`, `haccpSuppliersService`, `haccpLookupsService` from
`lib/wiring/haccp.ts`, built in PR9a / squash `b9e0a6e`). Byte-identical happy path +
drop direct vendor imports (rip-out test realised). Scope = 9 files (8 routes + 1 test).

## Per-constraint pass/fail (items 1–7)

1. **Byte-identical happy path — PASS.** Every route keeps its cookie/role gate, URL/body
   parsing, status codes, route-edge `new Date().toISOString()` wall-clock
   (`recall/route.ts:53` computes `nowIso` at the edge; service never calls `new Date()`).
   Body shapes + key order verified against old inline blocks via verbatim select strings
   in all 3 adapters.
2. **R6 sanctioned delta (DB error → `{error:'Server error'}` 500) — PASS, correctly
   applied, not flagged.** Adapters throw `ServiceError` → route `catch` → clean 500. No
   route leaks raw Postgres text. Status stays 500.
3. **R-F-B1 documents bare array — PASS.** `documents/route.ts:17-18` returns
   `getDocuments()` directly (`NextResponse.json(documents)`), no wrap. Adapter preserves
   `.order('category').order('doc_ref')` two-level sort.
4. **R-F-B3 reject-object branching (all 3) — PASS.** `handbook/route.ts:22-24`,
   `admin/suppliers/route.ts:40-43` (POST) and `:59-62` (PATCH) all branch
   `if ('ok' in result && result.ok === false)` → return reject status/message. No reject
   leaks as 200.
5. **supplier-code NO try/catch (by design) — PASS, absence not flagged.** No try/catch;
   adapter `findLabelCodeByName` swallows errors → service `name.slice(0,4).toUpperCase()`
   fallback fires. Byte-identical.
6. **R-F-D1 / R-F-D2 — PASS.** customers route uses `haccpLookupsService.getCustomers()`
   (adapter reads `customers` table `id,name`, `active=true`, name-ordered —
   `lib/adapters/supabase/HaccpLookupsRepository.ts:48-62`), NOT the Orders
   `CustomersRepository`. admin/suppliers exports only GET/POST/PATCH — no DELETE added.
7. **Hexagonal / rip-out — PASS.** All 8 routes dropped `@supabase/*` / `lib/adapters`
   imports (grep = 0 hits). `no-adapter-imports` lint pin 49/49. Vendor SDK now only in
   `lib/adapters/supabase/Haccp*Repository.ts`.

## Depth verdict
No new seams — the 3 services/adapters/ports were built + reviewed in PR9a, unchanged here.
No depth grade applies (routes stayed inside their module interface; only the collaborator
they call changed). Routes are now thin doormen (role-check → parse → ask service → return)
— intended shape, behaviour lives in the deep services/adapters below. Not a pass-through
defect.

## Test quality (🟢 all positive — Pocock standard)
`tests/integration/haccpDocsLookupsRoutes.test.ts` drives live HTTP routes via `api()` on
the booted dev server (public interface, not internals).
- Byte-identity is REAL: asserts `Object.keys(body)` exact ordering (`:217,:228,:247,:323`)
  — `["section","doc","entries"]`, `["results","query"]`, `["config","suppliers"]`.
- `:238,:254-260` — q<2 short-circuit asserts `toEqual({results:[]})` (no stray key); bare
  array pin asserts `Array.isArray(res.body)` directly.
- `:327-335,:396-404` — both reject 400 paths exercised (recall `Invalid payload`; admin
  `Name is required`) + `id required` + `No valid fields to update`.
- `:337-353,:447-457` — WRITE assertions check PERSISTED values (recall POST
  `config.updated_by===admin.userId` + `internal_team` round-trip; PATCH trimmed/null
  contacts round-trip).
- `:406-419` — POST 201 asserts `position` assigned, `label_code` = trim→upper→slice(0,6)
  = `"ABCDEF"`, defaults (`active:true`, `address:null`).

Observed gap (not a defect, honestly disclosed at `:27-31`): the R6 DB-error→500 delta is
NOT exercised at integration level (clean DB-error injection infeasible without corrupting
the shared schema); covered deterministically by PR9a adapter unit tests. Acceptable.

## Test / lint / build results
| Check | Result |
|---|---|
| Unit suite (`vitest run`) | 2346 / 2346 (146 files) |
| `no-adapter-imports` lint pin | 49 / 49 |
| `tsc --noEmit` | clean (exit 0) |
| New integration suite (live local Supabase) | 24 / 24 |
| Debug-log / leftover `supabaseService` scan | none |

## Verdict
**CLEAR — hand to ANVIL.** No 🔴/🟡/🔵. Byte-identical where required, R6 delta correctly
applied across all routes, all 3 reject branches wired, supplier-code's intentional
no-try/catch preserved, R-F-D1/D2 hold, all 8 routes dropped vendor imports (rip-out real,
lint-pinned).
