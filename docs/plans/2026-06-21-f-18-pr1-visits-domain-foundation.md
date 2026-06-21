# F-18 PR1 — Visits / Screen 3 domain foundation (introduce-only hexagonal extraction)

**FORGE unit:** F-18 (Day 12, first unit) · **This plan:** PR1 of 2 · **Lane:** STANDARD
**Date:** 2026-06-21 · **Precedent mirrored:** F-17 Complaints (PR1) + F-13 Users (PR1)

## 1. Goal & guardrails

Build the full Visits hexagon (domain types → port → service → Supabase adapter → fake
adapter → wiring) as **introduce-only**: ZERO behaviour change, NO route edited, NO
migration, NO new dependency. The new code is dead until PR2 re-points the 6 routes onto it.

- `lib/wiring/visits.ts` exports the **service-role `visitsService` singleton ONLY**. The
  per-caller `visitsServiceForCaller(userId)` factory (which fires RLS) is **deferred to the
  follow-on F-RLS-04g** — exactly as F-17's per-caller factory was added later by F-RLS-04f.
- Snake_case→camelCase mapping happens ONLY inside the adapter (ADR-0002). Domain carries
  RAW enum values; the `replace(/_/g,' ')` display transforms STAY in the routes (PR2).
- Hexagonal rules (CLAUDE.md "Non-negotiable architecture"): `lib/domain` + `lib/ports`
  import nothing from adapters; the Supabase adapter is the only `@supabase/*` importer;
  service depends on the port only; wiring is the only business-layer file importing the
  adapter; services export factories only (pinned by `tests/unit/lint/no-adapter-imports.test.ts`).

## 2. Files created (9) + barrel edits (5)

**Created:**
1. `lib/domain/Visit.ts`
2. `lib/ports/VisitsRepository.ts`
3. `lib/services/VisitsService.ts`
4. `lib/adapters/supabase/VisitsRepository.ts`  (only `@supabase/*` importer)
5. `lib/adapters/fake/VisitsRepository.ts`        (in-memory, for unit tests)
6. `lib/wiring/visits.ts`                          (singleton ONLY)
7. `tests/unit/services/VisitsService.test.ts`
8. `tests/unit/adapters/supabase/VisitsRepository.test.ts`
9. `tests/unit/wiring/visitsService.test.ts`

**Edited (additive re-exports only):** `lib/domain/index.ts`, `lib/ports/index.ts`,
`lib/services/index.ts`, `lib/adapters/supabase/index.ts`, `lib/adapters/fake/index.ts`.

**No route file, no migration, no package.json.**

## 3. Domain types — `lib/domain/Visit.ts`

```ts
export type VisitType = "routine" | "new_pitch" | "complaint_followup" | "delivery_issue";
export type VisitOutcome = "positive" | "neutral" | "at_risk" | "lost";

// pipeline_status is free text in the DB (default 'Logged'); the valid set is
// enforced in the route/service, not the column. Carry as the literal union +
// the canonical constant (lifted verbatim from screen3/visit/route.ts:15-23).
export type PipelineStatus =
  | "Logged" | "In Talks" | "Not Progressing" | "Trial Order Placed"
  | "Awaiting Feedback" | "Won" | "Not Won";
export const VALID_PIPELINE_STATUSES: readonly PipelineStatus[] = [
  "Logged", "In Talks", "Not Progressing", "Trial Order Placed",
  "Awaiting Feedback", "Won", "Not Won",
];

/** A visit_notes row, author join resolved. */
export interface VisitNote {
  readonly id: string;
  readonly visitId: string;
  readonly body: string;
  readonly authorId: string | null;     // author users.id
  readonly authorName: string;          // author users.name ?? 'Unknown'
  readonly createdAt: string;           // ISO-8601
  readonly updatedAt: string | null;
}

/** Rich superset visit shape for list contexts (today + admin). A given query
 *  populates only the columns it selects; PR2 routes pick the subset they emit,
 *  so wire output stays byte-identical. */
export interface Visit {
  readonly id: string;
  readonly createdAt: string;
  readonly userId: string | null;        // logger (rep) id
  readonly loggedById: string | null;    // rep users.id (today exposes via rep join)
  readonly loggedByName: string | null;  // rep users.name ?? 'Unknown'/null
  readonly customerId: string | null;
  readonly customerName: string | null;  // customers.name ?? null
  readonly visitType: VisitType;         // RAW enum (no replace)
  readonly outcome: VisitOutcome;        // RAW enum (no replace)
  readonly pipelineStatus: string;       // ?? 'Logged'
  readonly commitmentMade: boolean;
  readonly commitmentDetail: string | null;
  readonly notes: string | null;
  readonly prospectName: string | null;
  readonly prospectPostcode: string | null;
}

/** detail/visit shape — adds the customer id+name pair. */
export interface VisitDetail extends Visit {
  readonly customerId: string | null;    // customers.id (detail selects customers(id,name))
}

// ── Inputs / contexts ──
export interface CreateVisitInput {
  readonly id?: string;                  // optional client-supplied id (offline replay)
  readonly upsert?: boolean;             // body._upsert → on_conflict=id merge
  readonly userId: string;               // x-mfs-user-id
  readonly customerId: string | null;
  readonly prospectName: string | null;
  readonly prospectPostcode: string | null;
  readonly visitType: VisitType;
  readonly outcome: VisitOutcome;
  readonly commitmentMade: boolean;
  readonly commitmentDetail: string | null;  // forced null unless commitmentMade
  readonly notes: string | null;
}
/** createVisit returns the new id + duplicate flag (23505/409 → 200 path). */
export interface CreatedVisit {
  readonly id: string;
  readonly duplicate: boolean;
}

export interface ProspectLocation {
  readonly visitId: string;
  readonly lat: number;
  readonly lng: number;
  readonly approximate: boolean;
}

export interface UpdatePipelineStatusInput {
  readonly id: string;
  readonly status: string;
  readonly userId: string;
  readonly isManager: boolean;           // manager → no owner filter
}

export interface CreateVisitNoteInput {
  readonly visitId: string;
  readonly body: string;
  readonly userId: string;
}
export interface UpdateVisitNoteInput {
  readonly id: string;
  readonly body: string;
  readonly userId: string;
  readonly isManager: boolean;
}

export interface AdminVisitFilter {
  readonly from: string;                 // ISO
  readonly to: string;                   // ISO
  readonly repId?: string | null;
  readonly type?: string | null;
  readonly outcome?: string | null;
}
```

## 4. Port — `lib/ports/VisitsRepository.ts`

Every method maps 1:1 to a PR2 route operation — none speculative.

```ts
export interface VisitsRepository {
  // screen3/sync POST — insert OR upsert (on_conflict=id); 23505/409 → duplicate:true
  createVisit(input: CreateVisitInput): Promise<CreatedVisit>;
  // screen3/sync fire-and-forget geocode PATCH (best-effort, swallow errors)
  updateProspectLocation(loc: ProspectLocation): Promise<void>;
  // screen3/today GET (manager → all; sales → own)
  listForCaller(opts: { userId: string; isManager: boolean }): Promise<readonly Visit[]>;
  // screen3/visit DELETE (owner-only)
  deleteOwnVisit(id: string, userId: string): Promise<void>;
  // screen3/visit PATCH; null = 404 (no row matched owner filter)
  updatePipelineStatus(input: UpdatePipelineStatusInput): Promise<{ id: string } | null>;
  // screen3/visit/notes sales gate — does this visit belong to userId?
  verifyVisitOwnership(visitId: string, userId: string): Promise<boolean>;
  // screen3/visit/notes GET
  listNotes(visitId: string): Promise<readonly VisitNote[]>;
  // screen3/visit/notes POST
  createNote(input: CreateVisitNoteInput): Promise<VisitNote>;
  // screen3/visit/notes PATCH; null = 404 (W1 — see §6)
  updateNote(input: UpdateVisitNoteInput): Promise<VisitNote | null>;
  // detail/visit GET; null on miss
  findDetailById(id: string): Promise<VisitDetail | null>;
  // admin/visits GET (range + optional rep/type/outcome, limit 200)
  listAllWithFilters(filter: AdminVisitFilter): Promise<readonly Visit[]>;
}
```

## 5. Adapter — verbatim `.select()` strings (THE byte-identity anchor)

Copy each select EXACTLY as it appears today so PR2's wire output is character-identical.

| Method | Route source | Verbatim select string |
|---|---|---|
| `createVisit` (insert) | `app/api/screen3/sync/route.ts:16-29` POST to `/rest/v1/visits`, `Prefer: return=representation`. Payload keys (in order): `id?`, `user_id`, `customer_id`, `prospect_name`, `prospect_postcode`, `visit_type`, `outcome`, `commitment_made`, `commitment_detail` (null unless `commitment_made`), `notes`. Returns `rows[0].id`. | (insert — no select; representation returns full row, route reads `.id`) |
| `createVisit` (upsert) | `screen3/sync/route.ts:32-45` POST `?on_conflict=id`, `Prefer: resolution=merge-duplicates,return=representation` | `?on_conflict=id` |
| 23505/409 path | `screen3/sync/route.ts:117-121` → returns `{ id, duplicate:true }` 200 | adapter maps 23505/409 → `{ id, duplicate:true }` (NOT an error) |
| `updateProspectLocation` | `screen3/sync/route.ts:137-143` PATCH `?id=eq.${id}`, `Prefer: return=minimal`, body `{ prospect_lat, prospect_lng, is_approximate_location }` | (no select; minimal) — best-effort, swallow errors |
| `listForCaller` | `screen3/today/route.ts:49-64` | `id,created_at,visit_type,outcome,pipeline_status,commitment_made,commitment_detail,notes,customer_id,prospect_name,prospect_postcode,customers!visits_customer_id_fkey(name),rep:users!visits_user_id_fkey(id,name)` + `&order=created_at.desc`; non-manager adds `&user_id=eq.${userId}` |
| `deleteOwnVisit` | `screen3/visit/route.ts:33-43` DELETE `?id=eq.${id}&user_id=eq.${userId}`, `Prefer: return=minimal` | (filter is the owner clause; no select) |
| `updatePipelineStatus` | `screen3/visit/route.ts:75-86` PATCH `?id=eq.${id}${ownerFilter}`, `Prefer: return=representation`, body `{ pipeline_status }`; `rows.length===0` → 404 | manager → no owner filter; sales → `&user_id=eq.${userId}` |
| `verifyVisitOwnership` | `screen3/visit/notes/route.ts:38-43, 93-98` | `.from('visits').select('id').eq('id',visitId).eq('user_id',userId).maybeSingle()` |
| `listNotes` | `screen3/visit/notes/route.ts:52-57` `.order('created_at',{ascending:true})` | `id, visit_id, body, created_at, updated_at, author:users!visit_notes_user_id_fkey(id, name)` |
| `createNote` | `screen3/visit/notes/route.ts:107-117` insert `{ visit_id, user_id, body, created_at: now }` then `.single()` select | same select string as `listNotes` |
| `updateNote` | `screen3/visit/notes/route.ts:152-161` update `{ body, updated_at: now }` `.eq('id',id)` (+ `.eq('user_id',userId)` if sales) then `.select('id, body, updated_at')` | `id, body, updated_at` — **use `.maybeSingle()` (W1)** |
| `findDetailById` | `app/api/detail/visit/route.ts:16-25` `?id=eq.${id}`; `rows.length===0` → 404 | `id,created_at,visit_type,outcome,pipeline_status,commitment_made,commitment_detail,notes,prospect_name,prospect_postcode,customers(id,name),users!visits_user_id_fkey(name)` |
| `listAllWithFilters` | `app/api/admin/visits/route.ts:66-76` `.gte('created_at',from).lte('created_at',to).order('created_at',{ascending:false}).limit(200)`; filters: `repId→user_id`, `type→visit_type`, `outcome→outcome` | `id, created_at, outcome, visit_type, notes, pipeline_status, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)` |

Construction (F-06 template, mirrors ComplaintsRepository): `createSupabaseVisitsRepository(client)`
factory + `supabaseVisitsRepository` singleton bound to `supabaseService`.

## 6. Risks found while reading the routes

**R-B1 (medium) — mixed wire shapes. The headline. Enforced in PR2, documented now:**
- **snake_case to the client:** `screen3/today` (`created_at`, `visit_type`, `customer_name`,
  `logged_by_name`, `logged_by_id`), `screen3/visit` PATCH (`{id, pipeline_status}`),
  `screen3/visit/notes` GET/POST/PATCH (`visit_id`, `created_at`, `updated_at`, `author_id`,
  `author_name`). Domain is camelCase → **PR2 must re-map back to snake_case** on these.
- **camelCase to the client:** `detail/visit` + `admin/visits` (`createdAt`, `visitType`,
  `pipelineStatus`, etc.).
- **Display transform `replace(/_/g,' ')`** on `visit_type`/`outcome` in `detail/visit`
  (`route.ts:39-40`) and `admin/visits` (`route.ts:92-93`) → PRESENTATION, **stays in the
  route**; domain carries the RAW enum (`new_pitch`, `at_risk`). Same posture F-17 used for
  `category.replace`.
- **fkey-hint inconsistency:** `today` uses `customers!visits_customer_id_fkey(name)`;
  `detail`/`admin` use plain `customers(name)`/`customers(id,name)`. Each verbatim select is
  pinned per-route so PR2 swaps in a character-identical string.

**W1 (`.single()`→`.maybeSingle()`):** `screen3/visit/notes` PATCH (`route.ts:159-161`) uses
`.single()` then a `!data` check, but `.single()` THROWS on zero rows → would turn a "no
match" 404 into a 500. The adapter's `updateNote` must use `.maybeSingle()` → null → the
route returns 404. Same nuance as the F-13 PR3 login finding. Flagged for PR2 Guard.

**R-modeling (low):** `Visit` is a superset; `listForCaller` and `listAllWithFilters` select
different column subsets. Each adapter method selects its own verbatim columns and populates
only those domain fields; PR2 routes emit only the fields they emit today → byte-identical.
The grill/implementer may split `AdminVisitRow` out if the superset feels loose.

**Security:** unchanged — adapter binds to the service-role singleton, same access visits
have today. RLS is deferred to F-RLS-04g. **Data-migration:** none. **Concurrency:** geocode
PATCH stays best-effort fire-and-forget. **Launch-blockers:** none — code is dead until PR2.

## 7. Unit-test matrix (mirrors F-17 PR1 / F-13 PR1)

- `VisitsService.test.ts` — validation cascades with EXACT message strings:
  `screen3/sync` `missing[]` order (`customer_id or prospect_name required` /
  `only one of customer_id/prospect_name allowed` / `visit_type` / `outcome` /
  `commitment_detail`), and pipeline-status validity (`Invalid status. Must be one of: …`);
  passthrough delegation to the port for the non-validating methods (fake repo asserts call).
- `adapters/supabase/VisitsRepository.test.ts` — row→domain mapping per method;
  23505/409 → `{ duplicate:true }` on `createVisit`; null-on-miss for `findDetailById`,
  `updatePipelineStatus`, `updateNote`; `maybeSingle` no-throw on W1; verbatim-select smoke
  (assert the exact column string per method).
- `wiring/visitsService.test.ts` — `visitsService` singleton smoke (constructs, exposes the
  full method surface); assert wiring exports the singleton ONLY (no `visitsServiceForCaller`
  yet — that is F-RLS-04g).

## 8. Hexagonal verdict (Gate 2)

- **Port:** ADDS `VisitsRepository` (`lib/ports/VisitsRepository.ts`).
- **Adapters:** ADDS `createSupabaseVisitsRepository` (only `@supabase/*` importer) +
  `createFakeVisitsRepository` (tests).
- **New dependencies:** NONE (only `@supabase/supabase-js` already-wrapped, `@/lib/errors`,
  `@/lib/observability/log`).
- **Rip-out test:** **PASS** — swapping the DB vendor for visits = one new adapter + one
  wiring line (the `visits:` binding). Full realisation lands after PR2 re-points routes (PR1
  builds the seam) — the same staged posture F-17 shipped under.

## 9. ADR check

**No conflicts.** ADR-0005's Per-Site Map (line 40) explicitly assigns
`app/api/detail/visit/route.ts` to **F-18 Visits** — this plan is its planned home.
ADR-0004/0007 (RLS) are out of scope, correctly deferred to F-RLS-04g.
