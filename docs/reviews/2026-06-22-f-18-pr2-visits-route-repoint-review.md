# Code review — F-18 PR2: re-point 6 Visits routes onto `visitsService`

**Date:** 2026-06-22 · **Branch:** `feat/f-18-pr2-visits-route-repoint` (vs `main`)
**Reviewer:** code-critic (FORGE Guard) · **Plan:** `docs/plans/2026-06-22-f-18-pr2-visits-route-repoint.md`
**Commits:** `fd583c2`, `dfc52bb`, `ce845d5`, `bdab826` (tsc fix)

## Verdict: CLEAN — NO BLOCKERS. Hand to ANVIL.

Two 🟡 warnings — plan-consistent judgement calls for Hakan at Gate 3, NOT merge gates.

---

## R-B1 byte-identity — PASS on all 6 routes
Old route literals (`git show main:…`) compared key-for-key + key-order against dto outputs + route-edge prettify. Verbatim selects in adapter (`VisitsRepository.ts:60-103`); inline `??` defaults moved upstream to adapter `toVisit`/`toNote` (`VisitsRepository.ts:162-192`).

- `screen3/today` GET — 14-key snake_case via `toTodayVisitWireDto`; `visit_type`/`outcome` raw. PASS.
- `screen3/visit` PATCH — inline 2-key `{id, pipeline_status}` from request values, no dto (correct per §3.6). PASS.
- `screen3/visit/notes` GET/POST — 7-key snake_case via `toVisitNoteWireDto`; `author_name ?? 'Unknown'` in adapter; body trimmed in adapter (`createNote:363`). PASS.
- `screen3/visit/notes` PATCH — 3-key `{id, body, updated_at}` via `toNoteUpdateWireDto`. PASS.
- `detail/visit` GET — 12-key camelCase; route re-applies `String(dto.visitType ?? '').replace(/_/g,' ')` IN PLACE via spread (`route.ts:43-46`), keys not appended; `loggedBy ?? 'Unknown'`, `pipelineStatus ?? 'Logged'` (adapter:172) preserved. PASS.
- `admin/visits` GET — 8-key camelCase, same in-place spread prettify (`route.ts:80-87`); `customer` fallback chain + `rep ?? 'Unknown'` reproduced. PASS.

## W1 — PASS
`screen3/visit/notes` PATCH maps `note === null` → 404 `{error:'Note not found or not authorised'}` (`route.ts:140-142`); adapter `.maybeSingle()` → null on no-match, still throws `ServiceError('Update failed')` → 500 on real DB error (`VisitsRepository.ts:386-404`). Pinned by `tests/unit/api/visit-notes.route.test.ts` (404 + 200 cases through the public handler).

## Hexagonal — PASS
No `@supabase/*` import / no `/rest/v1/` visit-DATA fetch in the 6 routes. Grep hits = 4 doc-comments + sanctioned F-TD-31 `audit_log` supaPost + `customers` supaGet in `screen3/sync` (matches `screen2/sync` complaints precedent). `lib/api/visits/dto.ts:35` imports `@/lib/domain` types only — pure. `no-adapter-imports.test.ts` green. Rip-out holds: swap DB = one adapter + one wiring line.

## Deviation A — `TodayVisit` re-export → 🟢 SAFE
`app/api/screen3/today/route.ts:30` `export type TodayVisit = TodayVisitDto`; consumed by `app/visits/page.tsx:15`. Pure type alias, structurally identical, dto is single source of truth, keys pinned by tripwire test. Correct — preserves consumer import path, zero churn.

## Deviation B — `screen3/sync` insert-failure body → 🟡 WARNING (non-blocking)
Non-duplicate insert failure now returns generic `{error:'Server error'}` 500 (was `{error:'Insert failed: <text>'}` 500). `createVisit` throws `ServiceError('Insert failed')` (`VisitsRepository.ts:230`); route has no inner try/catch so it hits the outer catch → `'Server error'`. **Status code unchanged (500).** Plan-consistent (R3 excluded `'Insert failed'`; §4.1 marked 500 catch "unchanged"). Ruling 🟡 not 🔴: offline-queue client keys retry off status code (200 dup vs 500), not body string; old body leaked raw Postgres text (`text.slice(0,100)`) which `'Server error'` improves. Flag for Hakan only if a client parses that body.

## 🟡 WARNING — sync duplicate detection narrowed (non-blocking)
Old: `httpStatus === 409 || text.includes('23505')` → duplicate→200. New: relies solely on adapter `code === '23505'` (`VisitsRepository.ts:224`). A bare HTTP-409 with no `23505` would now 500 instead of 200. Theoretical — Supabase always sets `23505` for unique violations. Genuine narrowing of the duplicate path; note for the record.

## 🟢 Test-quality + minor notes
- `tests/unit/api/visits.dto.test.ts` — exemplary R-B1 tripwire: values (`toEqual`) AND key-order (`Object.keys().toEqual`), RAW-enum discipline, all fallback chains. Behaviour through public interface. 🟢
- `tests/unit/api/visit-notes.route.test.ts` — drives real PATCH handler, mocks at the `@/lib/wiring/visits` seam, asserts status+body, positive 200 proves not always-404. 🟢
- `commitment_made`: dto path emits `commitmentMade ?? false`; non-null boolean column → no observable wire diff. 🟢 info.
- Duplicate-echo `id`: new `{id: created.id}` = `body.id ?? ""`; duplicate path only fires on client-supplied id → functionally identical. 🟢 info.

## Architecture depth — `lib/api/visits/dto.ts` DEEP / earns its place
5 pure translators concentrate camelCase-domain → mixed-wire mapping in one tested place vs smearing across 6 routes. Deletion test: removing it pushes 14/7/3/12/8-key hand-maps back into every route — complexity concentrates here. Absence of a 6th fn for `{id, pipeline_status}` echo (§3.6) is correct — request-value literal, a helper would be shallow pass-through. No PASS-THROUGH, no SPECULATIVE SEAM.

## Tests / lint
- `npx vitest run tests/unit/api/visits.dto.test.ts tests/unit/api/visit-notes.route.test.ts tests/unit/lint/no-adapter-imports.test.ts` → 60/60.
- tsc ✓ / lint ✓ / full unit 2125/2125 (conductor-confirmed).
