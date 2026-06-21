# Code-critic review — F-17 PR2 (complaint/compliment route re-point)

**Date:** 2026-06-21
**Branch:** `f-17-pr2-complaints-compliments-route-repoint`
**Reviewer:** code-critic subagent (FORGE Guard phase)
**Plan:** `docs/plans/2026-06-21-f-17-pr2-complaints-compliments-route-repoint.md`

## VERDICT: SHIP — no blockers, hand to ANVIL

Re-point of the 8 complaint/compliment routes onto the PR1-owned services. Every wire shape
byte-identical, W1 (till duplicate) proven on real DB, G1 (detail double-prettify) proven,
hexagonal rules hold. Two 🔵 notes, no gates.

## Byte-identity — per wire shape (PASS, all 8)

Each new route output diffed against the pre-PR `main` version, traced through translator +
adapter, confirmed with the integration suite (real local DB, 19/19 green).

| Wire shape | Keys/order | New path | Verdict |
|---|---|---|---|
| `compliments` GET/POST `{compliment(s)}` snake_case | id, body, created_at, posted_by_id, posted_by_name, recipient_id, recipient_name | `toComplimentWireDto` | ✅ IDENTICAL |
| `compliments/users` `{users:[{id,name,role}]}` | id, name, role | `toRecipientWireDto` | ✅ IDENTICAL |
| `screen2/all` bare array + nested notes | id,createdAt,category,description,status,resolutionNote,resolvedAt,customer,loggedBy,resolvedBy,notes / note id,body,author,createdAt | `toComplaintListItemWireDto` + edge prettify | ✅ IDENTICAL |
| `screen2/open` bare array | id,createdAt,category,description,customer,loggedBy | `toOpenComplaintWireDto` + edge prettify | ✅ IDENTICAL |
| `screen2/sync` `{id}` 201 / `{id,duplicate}` 200 | same | service `created.duplicate` | ✅ IDENTICAL |
| `screen2/resolve` `{id}` 200 / 404 | same | `resolveOpen`→null→404 | ✅ IDENTICAL |
| `screen2/note` `{id,body,author,createdAt}` 201 | same | `toNoteWireDto` | ✅ IDENTICAL |
| `detail/complaint` 11-key object | id,createdAt,category,description,receivedVia,status,resolutionNote,resolvedAt,customer,loggedBy,resolvedBy | `toComplaintDetailWireDto` + double edge prettify | ✅ IDENTICAL |

Spread-override pattern (`detail/complaint/route.ts:30-34`, `screen2/all:27-30`, `open:25-28`)
preserves key order (overwriting an existing key doesn't move it); pinned by
`tests/integration/complaints.test.ts` `Object.keys().toEqual([...])` at `:336`, `:268`.

## W1 — duplicate-replay (PASS, real DB)

- `app/api/screen2/sync/route.ts:80-83` returns 200 `{id, duplicate:true}` on `created.duplicate`, not 500.
- Adapter `lib/adapters/supabase/ComplaintsRepository.ts:301-322` maps `error.code==='23505'` → `{duplicate:true}` (PR1 code unchanged; contingency NOT needed — supabase-js surfaces the code as-is).
- Real-DB tripwire `tests/integration/complaints.test.ts:473-496` PASSES — first insert 201, identical replay 200 `{id, duplicate:true}`. Till offline-queue retry loop safe.

## G1 — detail double-prettify (PASS)

- `app/api/detail/complaint/route.ts:32-33` prettifies BOTH `category` and `receivedVia` at edge; domain RAW; DTO copies RAW (`lib/api/complaints/dto.ts:144-146`).
- Test `tests/integration/complaints.test.ts:324-341` seeds `missing_item`/`in_person`, asserts `'missing item'` + `'in person'` + key order. Green.

## 3 self-reported deviations — all ACCEPTABLE

1. **`screen2/note` DB-error → 500 (was 404)** — bug-fix. Old route returned 404 on any `!compRes.ok`; new path throws `ServiceError` on a true DB error → 500, while genuine not-found (`ctx===null`, route line 60) still 404. 404 pinned by test `:370-382`.
2. **`screen2/sync` non-23505 insert error → 500 `'Server error'` (was `'Insert failed: …'`)** — status-preserving (still 500); no longer leaks raw Postgres text (small security win). 201 + 200-duplicate bytes unchanged (`:451`, `:473`).
3. **`screen2/sync` audit summary `'Unknown'` for missing customer (was raw customer_id)** — audit-TEXT only (`sync/route.ts:96`), fire-and-forget, NOT wire output. HTTP response `{id}` regardless.

## Hexagonal / vendor-import (PASS)

- No route imports `@supabase/*` SDK after PR2 (grep clean); compliments routes dropped `supabaseService`.
- New `lib/api/*/dto.ts` import `@/lib/domain` types ONLY (`dto.ts:20-24`, `:19`).
- PR2 touched ZERO files under `lib/adapters|services|ports|domain|wiring` — pure route + DTO + test + backlog.
- `next lint` clean — F-04 no-supabase-SDK gate passes.

## Depth / rip-out

- `lib/api/complaints/dto.ts` → DEEP-enough presentation edge ✅ — 4 translators reshape+rename+drop (`customerName→customer`, drop `loggedById`/`receivedVia` from list shapes, nest notes). Deletion test concentrates complexity.
- `lib/api/compliments/dto.ts` → DEEP-enough ✅ — owns camelCase→snake_case mapping nothing else does.
- Rip-out: PASS — DB swap = 1 adapter + 1 wiring line; routes/services/ports/DTOs untouched. (Caveat: audit_log raw fetch wouldn't follow a swap — tracked F-TD-31, pre-existing, out of scope.)

## Tests / lint / typecheck

- Typecheck (`tsc --noEmit`): clean
- Lint (`next lint`): clean
- Unit (`npm test`): **2040/2040** passing, 120 files — incl. new `tests/unit/api/complaints.dto.test.ts` + `compliments.dto.test.ts`
- Integration (`npm run test:integration -- complaints`, real local Supabase): **19/19** passing — all 8 routes end-to-end, W1, G1, bare-array, 401/307, 404/400 branches
- Test quality 🟢 strong — behaviour-based through public HTTP/translator interfaces, exact-key-order tripwires, real red-green.

## 🔵 / 🟢 Non-blocking notes

- 🟢 `tests/integration/complaints.test.ts` — exemplary byte-identity guard; W1 fixed-UUID deterministic replay + targeted cleanup.
- 🔵 `app/api/compliments/route.ts:62-66` — `postedByName==='Unknown' ? 'Someone'` email remap; a real user named "Unknown" gets "Someone" in email. Cosmetic, email-only, faithful preservation. Note only.
- 🔵 `lib/adapters/supabase/ComplaintsRepository.ts:170` (`toComplaint`) — `description: row.description` without old route's `?? ''`; `description` is NOT NULL (min-5 on create) so latent only. Pre-existing PR1 adapter code, out of scope.
- 🔵 audit_log raw REST in sync/resolve/note — tracked F-TD-31, carved out + commented. Backlog F-TD-32 (email-helper users read) added cleanly at `docs/plans/BACKLOG.md:307-318`.

## Hand-off to ANVIL

Re-run unit + integration as the gate ladder; run existing E2E as non-regression; pair with a
manual prod/preview smoke of BOTH screens (plan §9: no automated E2E for complaints/compliments
UI — known coverage gap, not a PR2 regression).
