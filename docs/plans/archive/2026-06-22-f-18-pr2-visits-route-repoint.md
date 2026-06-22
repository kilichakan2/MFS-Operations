# F-18 PR2 — Re-point the 6 Visits routes onto `visitsService`

**FORGE unit:** F-18 (Day 12, second unit) · **This plan:** PR2 of 2 · **Lane:** STANDARD
**Date:** 2026-06-22 · **Precedent mirrored:** F-17 Complaints PR2 (`lib/api/complaints/dto.ts` + `lib/api/compliments/dto.ts`)
**Depends on:** PR1 (commit 660bdb5) — the Visits hexagon is built, tested, and dead. This PR makes it live.

PR1 built the socket and the plug but left them unconnected. PR2 connects them: the 6 route files stop talking to the database directly and start calling the one tested `visitsService` object instead. Nothing about *what the screens see* changes — that is the whole game.

## 1. Goal & guardrails

Re-point 6 route files (9 handlers) to call `visitsService` (from `@/lib/wiring/visits`) and a new pure wire-translator module `lib/api/visits/dto.ts`, **instead of** raw `fetch` to `/rest/v1/…` or direct `@supabase/*` client calls. ZERO behaviour change except the one deliberate W1 fix. No migration, no new dependency, no RLS, no domain/port/service/adapter change.

**Guardrails (binding):**
- **R-B1 — byte-identical mixed wire shapes.** Each route's JSON response keys AND key ORDER must be character-identical to today (`NextResponse.json` serialises in insertion order). snake_case stays snake_case on `screen3/today`, `screen3/visit` PATCH, `screen3/visit/notes` GET/POST/PATCH. camelCase stays camelCase on `detail/visit`, `admin/visits`. The domain is camelCase internally → the dto re-maps to each route's own wire shape.
- **Presentation stays in the route.** The `replace(/_/g,' ')` display transforms on `visit_type`/`outcome` in `detail/visit` (route.ts:39–40) and `admin/visits` (route.ts:92–93) STAY at the route edge. The domain + dto carry the RAW enum (`new_pitch`, `at_risk`). Same posture F-17 used for `category.replace`.
- **Preserve every status code + error contract** the routes emit today (enumerated per-route in §4).
- Routes MUST drop direct `@supabase/*` imports and raw `fetch` to `/rest/v1/`. Import `visitsService` from `@/lib/wiring/visits` and dto helpers from `@/lib/api/visits/dto`.
- **Hexagonal rules (CLAUDE.md):** routes are presentation (`app/**`); they go via the service singleton from `lib/wiring/`, never the adapter. `lib/api/visits/dto.ts` is a pure wire-translator — imports `@/lib/domain` types only, no vendor, no framework, no adapter (ADR-0002).

## 2. Files changed (8)

**Created (2):**
1. `lib/api/visits/dto.ts` — pure wire-translator (domain→wire), one function per distinct route shape.
2. `tests/unit/api/visits.dto.test.ts` — key-for-key + key-ORDER tripwire tests (mirrors `tests/unit/api/complaints.dto.test.ts`).

**Edited — route re-points (6):**
3. `app/api/screen3/sync/route.ts`
4. `app/api/screen3/today/route.ts`
5. `app/api/screen3/visit/route.ts`
6. `app/api/screen3/visit/notes/route.ts`
7. `app/api/detail/visit/route.ts`
8. `app/api/admin/visits/route.ts`

**No migration, no `package.json`, no domain/port/service/adapter edit.**

## 3. `lib/api/visits/dto.ts` — full spec

Pure functions, domain (camelCase) → the EXACT wire shape each route emits today. Header comment must mirror `complaints/dto.ts`: explain key-order is load-bearing, cite each route's response-literal line numbers, and state that the `replace(/_/g,' ')` prettify on `visitType`/`outcome` is applied by the ROUTE, not here (dto emits RAW enums). Import `@/lib/domain` types only.

### 3.1 — `toTodayVisitWireDto(v: Visit): TodayVisitDto`  (snake_case)
Source of truth: `screen3/today/route.ts:88–102` `raw.map` literal. Direction: domain→wire, snake_case.
Key array (exact order):
```
['id', 'created_at', 'visit_type', 'outcome', 'pipeline_status',
 'commitment_made', 'commitment_detail', 'notes',
 'customer_id', 'customer_name', 'prospect_name', 'prospect_postcode',
 'logged_by_name', 'logged_by_id']
```
Mapping: `id←v.id`, `created_at←v.createdAt`, `visit_type←v.visitType` (RAW), `outcome←v.outcome` (RAW), `pipeline_status←v.pipelineStatus`, `commitment_made←v.commitmentMade`, `commitment_detail←v.commitmentDetail`, `notes←v.notes`, `customer_id←v.customerId`, `customer_name←v.customerName`, `prospect_name←v.prospectName`, `prospect_postcode←v.prospectPostcode`, `logged_by_name←v.loggedByName`, `logged_by_id←v.loggedById`. (Note: today emits NO prettify on visit_type/outcome — they go raw to the client today, so the dto raw value IS the wire value here.)

### 3.2 — `toVisitNoteWireDto(n: VisitNote): VisitNoteDto`  (snake_case)
Source of truth: `screen3/visit/notes/route.ts:64–72` (GET `shaped`) AND `124–133` (POST echo) — identical literals.
Key array (exact order):
```
['id', 'visit_id', 'body', 'created_at', 'updated_at', 'author_id', 'author_name']
```
Mapping: `id←n.id`, `visit_id←n.visitId`, `body←n.body`, `created_at←n.createdAt`, `updated_at←n.updatedAt`, `author_id←n.authorId`, `author_name←n.authorName`. (Domain already defaults `authorName` to `'Unknown'` in the adapter `toNote` — straight copy, do NOT re-default.)

### 3.3 — `toNoteUpdateWireDto(n: VisitNote): NoteUpdateDto`  (snake_case, trimmed PATCH echo)
Source of truth: `screen3/visit/notes/route.ts:171` returns `{ note: data }` where `data` is the raw `.select('id, body, updated_at')` row — so the PATCH echo today is exactly `{ id, body, updated_at }` (snake_case `updated_at`).
Key array (exact order): `['id', 'body', 'updated_at']`
Mapping: `id←n.id`, `body←n.body`, `updated_at←n.updatedAt`.

### 3.4 — `toVisitDetailWireDto(d: VisitDetail): VisitDetailDto`  (camelCase, RAW enums)
Source of truth: `detail/visit/route.ts:36–49` response literal. Direction: domain→wire, camelCase. **Enums RAW** — the route prettifies `visitType`/`outcome` at the edge.
Key array (exact order):
```
['id', 'createdAt', 'visitType', 'outcome', 'commitmentMade', 'commitmentDetail',
 'notes', 'customer', 'prospectName', 'prospectPostcode', 'loggedBy', 'pipelineStatus']
```
Mapping: `id←d.id`, `createdAt←d.createdAt`, `visitType←d.visitType` **(RAW)**, `outcome←d.outcome` **(RAW)**, `commitmentMade←d.commitmentMade`, `commitmentDetail←d.commitmentDetail`, `notes←d.notes`, `customer←d.customerName`, `prospectName←d.prospectName`, `prospectPostcode←d.prospectPostcode`, `loggedBy←d.loggedByName ?? 'Unknown'`, `pipelineStatus←d.pipelineStatus`.
**Route-edge prettify:** the route wraps `visitType` and `outcome` with `.replace(/_/g,' ')` AFTER calling the dto (see §4.5). `loggedBy` default `'Unknown'`: the route currently does `r.users?.name ?? 'Unknown'`; the adapter's `toVisit` sets `loggedByName = … ?? null`, so the dto (or route) must apply `?? 'Unknown'` to preserve the wire default — apply it in the dto so the shape carries it.

### 3.5 — `toAdminVisitWireDto(v: Visit): AdminVisitDto`  (camelCase, RAW enums)
Source of truth: `admin/visits/route.ts:88–97` `res.data.map` literal. Direction: domain→wire, camelCase. **Enums RAW** — route prettifies at edge.
Key array (exact order):
```
['id', 'customer', 'rep', 'visitType', 'outcome', 'notes', 'pipelineStatus', 'createdAt']
```
Mapping: `id←v.id`, `customer←v.customerName ?? v.prospectName ?? 'Unknown'`, `rep←v.loggedByName ?? 'Unknown'`, `visitType←v.visitType` **(RAW)**, `outcome←v.outcome` **(RAW)**, `notes←v.notes ? String(v.notes) : null`, `pipelineStatus←v.pipelineStatus ? String(v.pipelineStatus) : null`, `createdAt←v.createdAt`.
**Route-edge prettify:** route wraps `visitType`/`outcome` with `.replace(/_/g,' ')` after the dto (see §4.6).

### 3.6 — `pipeline_status` PATCH echo (NO dto function)
`screen3/visit` PATCH returns the literal `{ id: body.id, pipeline_status: statusVal }` (route.ts:98) — built from the *request* values, not a domain object. This is a 2-key inline literal the route constructs itself after `updatePipelineStatus(...)` returns non-null. **No dto helper needed** (and adding one would be a shallow pass-through — fails the deletion test). Keep the inline literal in the route. Document this decision in the dto header so the next reader knows why only 5 functions exist.

**dto function count: 5** (`toTodayVisitWireDto`, `toVisitNoteWireDto`, `toNoteUpdateWireDto`, `toVisitDetailWireDto`, `toAdminVisitWireDto`).

## 4. Per-route change table (handler → service method → wire shape → status codes)

### 4.1 — `app/api/screen3/sync/route.ts` POST
| Concern | Today | After |
|---|---|---|
| Validation | inline `missing[]` cascade (lines 82–91) | `visitsService.validateCreate(input)` → `{error: msg}` `status` on `!ok` |
| Body→input map | snake_case body fields | build `CreateVisitInput` (camelCase): `id?`, `upsert←body._upsert===true`, `userId←x-mfs-user-id`, `customerId`, `prospectName`, `prospectPostcode`, `visitType`, `outcome`, `commitmentMade` (`===true || ==='true'`), `commitmentDetail`, `notes` |
| Insert/upsert | `supaPost`/`supaUpsert` raw fetch | `const created = await visitsService.createVisit(input)` |
| Duplicate (23505/409) | `{id, duplicate:true}` **200** | `if (created.duplicate) return {id: created.id, duplicate:true}` **200** |
| Success | `{id: recordId}` **201** | `{id: created.id}` **201** |
| Geocode PATCH | inline fire-and-forget block (lines 134–169), best-effort, swallows errors, exact + outcode fallback | KEEP the postcodes.io fetch (NOT a vendor SDK — external HTTP API, fine in route) BUT route the DB write-back through `visitsService.updateProspectLocation({visitId: created.id, lat, lng, approximate})` (replaces the raw PATCH `fetch` at lines 137–143). Fire-and-forget `(async()=>{…})()` wrapper stays; still swallows errors. |
| Audit log + customer-name lookup | `supaGet('customers',…)` + `supaPost('audit_log',…)` raw REST | **STAYS raw REST** — F-TD-31 (no owned audit port; `CreatedVisit` does not return customer name). Mirror complaints/sync exactly: drop only the *visit-data* fetches; keep `supaPost`/`supaGet` helpers for audit. Document with the same F-TD-31 comment complaints uses. |
| Validation 400 / Invalid JSON 400 / 401 unauth / 500 catch | unchanged | unchanged |

**Scope flag (non-blocking):** `createVisit` (`CreatedVisit`) returns only `{id, duplicate}`, so the route still needs the `supaGet('customers', 'select=name&id=eq.…')` lookup for the audit *summary* string. This stays as raw REST under F-TD-31 (consistent with the complaints precedent, which got `customerName` back from its service but writes audit raw). Do NOT pull in `CustomersRepository`/wire a `customersService` here — that expands scope beyond the Visits hexagon. If the Guard wants the audit write owned, it is F-TD-31, not this PR.

### 4.2 — `app/api/screen3/today/route.ts` GET
| Concern | Today | After |
|---|---|---|
| Role gate | `isManager = role==='admin'||role==='office'` | unchanged (route computes `isManager`) |
| Fetch | raw fetch with `selectFields` + optional `&user_id` filter | `const visits = await visitsService.listForCaller({ userId, isManager })` |
| Shape | `raw.map(r => TodayVisit{…})` snake_case | `visits.map(toTodayVisitWireDto)` |
| Response | `{ visits }` | `{ visits }` (key unchanged) |
| 401 / 500 catch / "Failed to fetch visits" | unchanged | service throws `ServiceError` ("Failed to fetch visits") → caught by route's `try/catch` → **500** `{error:'Server error'}`. NOTE the route's catch returns `'Server error'`, the OLD `!res.ok` branch returned `'Failed to fetch visits'`. To preserve the exact 500 body, wrap the service call so a thrown error returns `{error:'Failed to fetch visits'}` **500** — see Risk R3. |

### 4.3 — `app/api/screen3/visit/route.ts` DELETE + PATCH
**DELETE:**
| Concern | Today | After |
|---|---|---|
| id param | `?id=` required → 400 if missing | unchanged |
| Delete | raw fetch DELETE `?id=eq.${id}&user_id=eq.${userId}` | `await visitsService.deleteOwnVisit(id, userId)` |
| Success | `{deleted:true}` | `{deleted:true}` |
| Failure | `!res.ok` → 500 `{error:'Delete failed'}` | service throws `ServiceError('Delete failed')` on DB error → route catches → **500** `{error:'Delete failed'}` (wrap in try/catch to preserve exact body) |
| 401 | unchanged | unchanged |

**PATCH:**
| Concern | Today | After |
|---|---|---|
| Validation | inline `id required` / `pipeline_status required` / valid-set | `visitsService.validatePipelineStatus({id: body.id, status: body.pipeline_status})` → `{error: msg}` `status` on `!ok` |
| Update | raw fetch PATCH `?id=eq.${id}${ownerFilter}` | `const res = await visitsService.updatePipelineStatus({ id: body.id, status: statusVal, userId, isManager })` |
| Not found / not owned | `rows.length===0` → **404** `{error:'Visit not found or not authorised'}` | `if (res===null) return {error:'Visit not found or not authorised'}` **404** |
| Success | `{id: body.id, pipeline_status: statusVal}` | **inline literal** `{id: body.id, pipeline_status: statusVal}` (§3.6 — no dto) |
| DB error 500 | `!res.ok` → 500 `{error:'Update failed'}` | service throws `ServiceError('Update failed')` → try/catch → **500** `{error:'Update failed'}` |
| 401 / 400s | unchanged | unchanged |

### 4.4 — `app/api/screen3/visit/notes/route.ts` GET + POST + PATCH
**GET:**
| Concern | Today | After |
|---|---|---|
| `visit_id` param | required → 400 | unchanged |
| Sales ownership gate | inline `.from('visits').select('id').eq…maybeSingle()` → 404 if `vErr||!visit` | `if (!isManager && !(await visitsService.verifyVisitOwnership(visitId, userId))) return {error:'Visit not found or not authorised'}` **404** |
| Load notes | inline supabase `.from('visit_notes').select(…)` | `const notes = await visitsService.listNotes(visitId)` |
| Shape | inline `shaped` map snake_case | `notes.map(toVisitNoteWireDto)` |
| Response | `{ notes: shaped }` | `{ notes }` |
| DB error 500 | "Failed to load notes" | service throws `ServiceError('Failed to load notes')` → try/catch → **500** `{error:'Failed to load notes'}` |
| 401 | unchanged | unchanged |

**POST:**
| Concern | Today | After |
|---|---|---|
| Validation | inline `visit_id required` / `body required` | `visitsService.validateNote({visitId: body.visit_id, body: body.body})` → `{error: msg}` `status` |
| Sales gate | same inline check | `visitsService.verifyVisitOwnership(...)` → 404 (same as GET) |
| Insert | inline `.insert(…).select(…).single()` | `const note = await visitsService.createNote({visitId, body, userId})` |
| Shape | inline `{ note: {…} }` snake_case | `{ note: toVisitNoteWireDto(note) }` |
| Success | **201** | **201** |
| DB error 500 | "Failed to add note" | service/adapter throws `ServiceError('Failed to add note')` → try/catch → **500** |
| 401 | unchanged | unchanged |

**PATCH — W1 (the one deliberate behaviour change):**
| Concern | Today | After |
|---|---|---|
| Validation | inline `id required` / `body required` | `visitsService.validateUpdateNote({id: body.id, body: body.body})` → `{error: msg}` `status` |
| Update | inline `.update(…).eq('id',id)[.eq('user_id')].select('id, body, updated_at').single()` | `const note = await visitsService.updateNote({ id: body.id, body: body.body, userId, isManager })` |
| **No match** | `.single()` **THROWS on 0 rows → 500** (latent bug); the `!data` 404 branch is unreachable | **`if (note===null) return {error:'Note not found or not authorised'}` 404** — adapter uses `.maybeSingle()` (verified `lib/adapters/supabase/VisitsRepository.ts:389–399` returns `null`, never throws on no-match) |
| Success | `{ note: data }` (3-key `{id, body, updated_at}`) | `{ note: toNoteUpdateWireDto(note) }` (§3.3) |
| DB error 500 | "Update failed" | service throws `ServiceError('Update failed')` on a *real* DB error → try/catch → **500** |
| 401 | unchanged | unchanged |

### 4.5 — `app/api/detail/visit/route.ts` GET
| Concern | Today | After |
|---|---|---|
| id param | required → 400 | unchanged |
| Fetch | raw fetch `?id=eq.${id}` with DETAIL select | `const d = await visitsService.findDetailById(id)` |
| Not found | `rows.length===0` → **404** `{error:'Not found'}` | `if (!d) return {error:'Not found'}` **404** |
| Shape | inline literal with `.replace(/_/g,' ')` on visitType/outcome | `const dto = toVisitDetailWireDto(d)` then **route applies prettify**: `return NextResponse.json({ ...dto, visitType: String(dto.visitType ?? '').replace(/_/g,' '), outcome: String(dto.outcome ?? '').replace(/_/g,' ') })` — spread preserves key ORDER (visitType/outcome re-assigned in place, not appended). |
| DB error 500 | `!res.ok` → 500 `{error:'DB error'}` | preserve `'DB error'` for the DB-failure 500 (Risk R3) |
| 401 / 500 catch | unchanged | unchanged |

**Key-order note for the implementer:** `String(r.visit_type ?? '').replace…` today also coerces null→`''`. The dto carries RAW enum (always a string in practice); to be byte-safe the route prettify should be `String(dto.visitType ?? '').replace(/_/g,' ')` to reproduce the null→`''` edge exactly.

### 4.6 — `app/api/admin/visits/route.ts` GET
| Concern | Today | After |
|---|---|---|
| Param validation | `isValidRepId`/`isValidVisitType`/`isValidOutcome` from `@/lib/adminFilters` → 400s | **STAYS in the route** (presentation-layer input guard; not part of the visits port) |
| from/to defaults | `todayMidnight` / `now` | unchanged (route computes) |
| Fetch | inline supabase query with `.gte/.lte/.eq/.order/.limit(200)` | `const visits = await visitsService.listAllWithFilters({ from, to, repId, type, outcome })` |
| Shape | inline `.map` with `.replace(/_/g,' ')` on visitType/outcome | `visits.map(v => { const dto = toAdminVisitWireDto(v); return { ...dto, visitType: String(dto.visitType ?? '').replace(/_/g,' '), outcome: String(dto.outcome ?? '').replace(/_/g,' ') } })` (spread preserves key order) |
| Response | `{ rows }` | `{ rows }` |
| DB error 500 | `res.error` → 500 `{error:'Database error'}` | preserve `'Database error'` for DB-failure 500 (Risk R3) |
| 401 / 500 catch | unchanged | unchanged |

## 5. Test matrix

**Unit — `tests/unit/api/visits.dto.test.ts` (the R-B1 tripwire, mirrors `complaints.dto.test.ts`):**
- One `describe` per dto function. Each asserts BOTH `expect(dto).toEqual({…})` (key-for-key values) AND `expect(Object.keys(dto)).toEqual([…])` (key ORDER — the load-bearing assertion).
- `toTodayVisitWireDto`: 14-key order array (§3.1); assert `visit_type`/`outcome` survive RAW.
- `toVisitNoteWireDto`: 7-key array (§3.2); assert `author_name` default NOT re-applied here.
- `toNoteUpdateWireDto`: 3-key array `['id','body','updated_at']` (§3.3).
- `toVisitDetailWireDto`: 12-key array (§3.4); assert `visitType`/`outcome` RAW; `customer←customerName`, `loggedBy←loggedByName ?? 'Unknown'`.
- `toAdminVisitWireDto`: 8-key array (§3.5); assert `customer` fallback chain (customerName → prospectName → 'Unknown') with 3 fixtures; `notes`/`pipelineStatus` null-coalescing.

**Integration (extend, don't invent):**
- Search `tests/integration/**` for existing screen3/visit/admin-visits specs. If present, byte-identity is covered by re-running them green. Add a focused W1 assertion: `PATCH /api/screen3/visit/notes` with a non-existent note id returns **404** (not 500). If no integration harness touches these routes, note it and rely on dto tripwires + E2E `@critical` smoke.

**Regression / Guard:**
- `tests/unit/lint/no-adapter-imports.test.ts` must stay green.
- Confirm no route retains a `@supabase/*` import or a `fetch('…/rest/v1/…')` for visit DATA. The `audit_log` raw `supaPost` + `customers` `supaGet` in `screen3/sync` are the documented F-TD-31 exception.
- Typecheck: routes compile against camelCase domain inputs.

## 6. Hexagonal verdict (Gate 2)

- **Port:** USES the existing `VisitsRepository` via `visitsService`. No port added or changed.
- **Adapter:** none added or changed. The Supabase `VisitsRepository` adapter (PR1) is the sole `@supabase/*` importer for visits; PR2 does not touch it.
- **New dependencies:** **NONE.** (`postcodes.io` is called via plain `fetch` to a public HTTP API — not a vendor SDK, no package — and stays in the route, unchanged.)
- **Rip-out test:** **PASS.** After PR2, replacing the DB vendor for Visits = one new adapter + one wiring line. The 6 routes depend only on `visitsService` + the pure dto; neither names a vendor.
- **Caveat (NOT a blocker):** `screen3/sync` retains a raw-REST `audit_log` write + a `customers` name lookup for the audit summary. This is the **F-TD-31** cross-cutting-audit debt the Complaints re-point also carries. It does not affect the visits rip-out answer. Owning the audit write is F-TD-31, out of scope here.

## 7. ADR check

**No conflicts.** ADR-0002 honoured: routes → service → adapter; dto is pure domain-only. ADR-0005 Per-Site Map assigns `app/api/detail/visit/route.ts` to F-18 Visits — this PR is its planned home. ADR-0004/0007 (RLS) out of scope — `lib/wiring/visits.ts` still exports the service-role singleton only; per-caller `visitsServiceForCaller` deferred to F-RLS-04g (identical to F-17's deferral to F-RLS-04f).

## 8. Risk Assessment

**R1 — Byte-identity drift on mixed wire shapes (R-B1).** Severity: **medium**. Mitigation: 5 dto functions pinned key-for-key AND key-order by `visits.dto.test.ts`; the two camelCase routes re-assign `visitType`/`outcome` in-place via spread (preserving order); verbatim selects locked in PR1's adapter. **Must-fix: NO.**

**R2 — W1 behaviour change (404 vs 500 on note-edit no-match).** Severity: **low** (it's a *fix*). Only observable behaviour change. Mitigation: 404 is the contractually-intended response; pinned by a W1 assertion; called out at Gate 3. **Must-fix: NO.**

**R3 — Error-body text drift on DB-failure 500s.** Severity: **low**. Routes today distinguish a DB-failure 500 body (`'Failed to fetch visits'`, `'Delete failed'`, `'Update failed'`, `'Failed to load notes'`, `'DB error'`, `'Database error'`) from the generic catch `'Server error'`. Service throws `ServiceError(<message>)` with those exact strings; route `try/catch` defaults to `'Server error'`. **Recommendation:** preserve the exact strings (cheap, byte-safe). **Must-fix: NO** (flag to Guard / Gate 3 for a decision).

**R4 — Concurrency.** None material. Geocode write stays best-effort fire-and-forget; 23505/409 duplicate path preserved → 200. **Must-fix: NO.**

**R5 — Security.** None material. Same service-role posture; owner-filter logic moves intact into `listForCaller`/`updatePipelineStatus`/`verifyVisitOwnership`/`updateNote`; `isManager` still computed in the route from the trusted `x-mfs-user-role` header. No widening. **Must-fix: NO.**

**R6 — Data migration.** None. **Must-fix: NO.**

**R7 — Business-logic flaws.** Severity: **low**. Validation cascades lifted verbatim into the service in PR1 + unit-tested there. Watch: `screen3/sync` `commitmentMade` parsing (`===true || ==='true'`) must be reproduced in the route's input-build before constructing `CreateVisitInput`. **Must-fix: NO.**

**R8 — Launch blockers.** None.

**Must-fix risks: NONE. Gate 2 is clear of blockers.**

**One thing for the conductor to relay to Hakan at Gate 3 (R3):** the DB-failure 500 error-body strings — the plan preserves them, but if no front-end reads those strings we could simplify to the generic `'Server error'`. A one-line decision, not a blocker.
