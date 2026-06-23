# F-19 PR4 — Cluster C (HACCP people & training): build TWO hexagons + re-point in one PR

> Date: 2026-06-23 · Author: forge-planner (FORGE Phase 2 — Order)
> FORGE unit: F-19 (HACCP crunch) · This plan: PR4 of ~10 · Lane: STANDARD
> Status: planned, awaiting Gate 2.
> Spec lock: Gate 1 approved 2026-06-23 — Cluster C, **COMBINED rhythm** (foundation +
> re-point in ONE PR, like Cluster B / PR3), **BYTE-IDENTICAL behaviour preservation**,
> NO schema change, NO migration, NO new dependency.
> Depends on: Cluster A (PR1 #68 / PR2 #69, SHIPPED) + Cluster B (PR3 #70, SHIPPED). The
> Cluster B "standing registers" hexagon is the structural template this PR mirrors
> (`lib/domain/HaccpAssessment.ts`, `lib/ports/HaccpAssessmentsRepository.ts`,
> `lib/services/HaccpAssessmentsService.ts`, `lib/adapters/{supabase,fake}/HaccpAssessmentsRepository.ts`,
> `lib/wiring/haccp.ts`, `tests/integration/haccpAssessments.test.ts`).
> Precedent: build + re-point collapsed into one PR (the roadmap's "combined" rhythm for Cluster C).

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ HaccpTrainingRepository (port) → [Supabase] (adapter) + [Fake] (test)
  │    covers 2 append-only tables: haccp_staff_training · haccp_allergen_training
  │    HaccpTrainingService depends on the port only
  ├─ HaccpPeopleRepository (port) → [Supabase] (adapter) + [Fake] (test)
  │    covers 1 append-only table: haccp_health_records (SHARED by people + kiosk)
  │    HaccpPeopleService depends on the port only (one shared visitor builder)
  └─ both wired service-role in lib/wiring/haccp.ts (the one biz file allowed to import lib/adapters/**)
🗣 TWO new sockets, not one. Training (who's been trained) and fitness-to-work (who's fit to handle food) are honestly different jobs, so each gets its own socket. The 3 screens unplug from the database and plug into these sockets — same output, swappable vendor.
```

🗣 **In plain English:** Cluster C is the "people" corner of HACCP: the staff-training records,
the allergen-awareness training, and the fitness-to-work / visitor health declarations (including
a public reception kiosk anyone can fill in). Today three route files reach straight into the
database. This PR builds two clean, tested machines — one for training, one for fitness-to-work —
and rewires the three screens to call them, all in one PR. Nothing a user sees changes: same
forms, same replies, same saved rows.

---

## 1. Goal & guardrails

Extract the persistence of the **3 Cluster C route files** out of inline `supabaseService` calls
and behind **TWO** new owned hexagons, THEN re-point all 3 routes onto them — **in this one PR**.

- **Hexagon ① — `HaccpTraining`** (`lib/domain/HaccpTraining.ts` + port + service + Supabase &
  Fake adapters + wiring line). Covers `haccp_staff_training` and `haccp_allergen_training` (both
  append-only). Re-points `app/api/haccp/training/route.ts`.
- **Hexagon ② — `HaccpPeople`** (`lib/domain/HaccpPeople.ts` + port + service + Supabase & Fake
  adapters + wiring line). Covers `haccp_health_records` (append-only, SHARED by people + kiosk).
  Re-points `app/api/haccp/people/route.ts` AND `app/api/haccp/visitor/route.ts`.

Mirror of the shipped Cluster B template (file-for-file structure, factory+singleton construction,
`now`-injection discipline, ServiceError-on-every-DB-failure error contract).

🗣 **In plain English:** Build two boxes, plug Supabase into each, then rewire the three screens to
use them — all at once (the "combined" rhythm Cluster B used).

### Hard constraints (locked at Gate 1 — restated so the implementer cannot drift)

1. **BYTE-IDENTICAL behaviour.** Every GET response shape (keys + order + values), every POST
   effect + status code + error string, every role-gate, preserved EXACTLY. Each route keeps
   building its response literal in the SAME key order it uses today.
2. **NO schema change, NO migration, NO SQL, NO RLS policy.** `supabase/migrations/` untouched.
   Every column the routes read/write already exists.
3. **NO new dependency.** `package.json` untouched. New files import only the already-wrapped
   `@supabase/supabase-js` (inside the adapter tree), `@/lib/errors`, `@/lib/observability/log`.
4. **All 3 routes DROP their direct `@supabase/supabase-js` import** (`import { supabaseService }
   from '@/lib/adapters/supabase/client'` + the `const supabase = supabaseService` line). After
   this PR, NO `app/api/haccp/{training,people,visitor}/route.ts` file imports `@supabase/*` or
   names a `haccp_*` table.
5. **Vendor types never leak past the adapter.** The adapter maps snake_case DB rows to domain
   models; the routes speak the app's own vocabulary.
6. **Each service depends on its port ONLY** (no adapter import — lint-enforced by
   `tests/unit/lint/no-adapter-imports.test.ts`). Adapters are the ONLY place `@supabase/*` is
   imported. Wiring is the ONLY business-layer place adapters are imported.
7. **Service-role wiring ONLY.** The two new singletons are bound to `supabaseService` (service-role
   key) — exactly the access the routes have today. **NO `…ForCaller(userId)` per-caller
   authenticated factory** — per-caller RLS is deferred to **F-RLS-04h** (Cluster G, PR10), same
   posture as Clusters A & B. Do not add one.
8. **Determinism (mirror Cluster B constraint 8).** The service `build…` methods take `now: Date`
   IN as a parameter and NEVER call `new Date()`. The route passes `new Date()` from the edge.
   `userId` is likewise injected by the route (for the visitor kiosk path it injects the fixed
   kiosk id — see §10.3).
9. **Reads define errors out of existence** (empty array on miss); every DB failure throws
   `ServiceError` (`@/lib/errors`). **No insert in Cluster C has a 23505/409 path today** — every
   DB error surfaces at 500 (raw pg message via the `.error` branch). So the port methods do NOT
   add a ConflictError path; preserve the current 500-on-any-error behaviour exactly (Risk R6).

### Hexagonal rules (CLAUDE.md "Non-negotiable architecture", ADR-0002)
Routes are presentation (`app/**`): they call the service singletons from `lib/wiring/`, never the
adapter, never a vendor SDK. The route keeps only presentation-edge concerns: the cookie role gate
(people + training) or no-auth (visitor), the wall clock (`new Date()`), the `todayUK()` date
helper, the fixed kiosk user-id constant, request-body parsing, and response assembly + key order.
Everything that touches a table moves into the service path.

---

## 2. OUT OF SCOPE (stated explicitly)

- **Per-caller RLS / authenticated client** — DEFERRED to F-RLS-04h (Cluster G). Wiring stays
  service-role only; no `…ForCaller`.
- **No UI change.** The page files for training, people and the `/haccp/visitor` kiosk are NOT
  edited — they call the same API routes with the same request/response contract.
- **No CA-ledger touch.** Cluster C routes file zero corrective actions; `HaccpCorrectiveActions*`
  and `submitHaccpDailyCheck` are NOT imported or changed.
- **No "fixing" the preserved quirks** — the allergen-training `'Completion date required'` string
  (§4), the two distinct `todayUK()` implementations (§6 / R3), and the people-visitor vs kiosk
  `health_questions` default divergence (§9 / R2) are PRESERVED, not corrected.

🗣 **In plain English:** We only move the plumbing behind clean sockets. No screens change, no
database changes, no new "draft/published" features, and we deliberately keep three small existing
oddities exactly as they are — fixing them would be a behaviour change, which this PR forbids.

---

## 3. The 3 Cluster C routes — verified against the real files

| # | Route file | Handlers | Table(s) | Persistence | Auth |
|---|---|---|---|---|---|
| 1 | `app/api/haccp/training/route.ts` | GET, POST | `haccp_staff_training`, `haccp_allergen_training` | append-only insert (both) | GET admin-only · POST admin + userId |
| 2 | `app/api/haccp/people/route.ts` | GET, POST | `haccp_health_records` | append-only insert | GET warehouse/butcher/admin · POST same + userId |
| 3 | `app/api/haccp/visitor/route.ts` | POST only | `haccp_health_records` | append-only insert | **PUBLIC — no auth** |

**All current call sites are `supabaseService` via `@/lib/adapters/supabase/client`** (verified in
all 3 files; no raw `fetch`).

**`haccp_health_records` is SHARED by two routes** (people-visitor path + the public kiosk) → the
single `HaccpPeopleRepository.insertHealthRecord` is the one write path for both, and the
visitor-row builder is shared in the service (§9 design call 2).

🗣 **In plain English:** Three screens. Training reads/writes two tables; people and the public
kiosk both write to the SAME health-records table. That shared table is exactly why the visitor
form's row-building logic gets written once and used by both the staff page and the public kiosk.

---

## 4. Hexagon ① — `HaccpTraining`

### 4.1 Tables & persistence
- `haccp_staff_training` — append-only. Used by training-types `butchery_process_room` and
  `warehouse_operative`.
- `haccp_allergen_training` — append-only. Used by training-type `allergen_awareness` (different
  table + different column names: `certification_date`, `training_completed`).

### 4.2 Port — `lib/ports/HaccpTrainingRepository.ts`
Pure interface; imports domain types only. Four methods (granularity confirmed against the route —
two distinct tables, two reads + two inserts):

```ts
import type {
  StaffTrainingRow, StaffTrainingPersist,
  AllergenTrainingRow, AllergenTrainingPersist,
} from "@/lib/domain";

export interface HaccpTrainingRepository {
  /** All staff-training rows, submitted_at DESC, limit 100. → GET /training (staff). */
  listStaffTraining(): Promise<readonly StaffTrainingRow[]>;
  /** All allergen-training rows, submitted_at DESC, limit 100. → GET /training (allergen). */
  listAllergenTraining(): Promise<readonly AllergenTrainingRow[]>;
  /** Append a staff-training row (returns void/ok — route returns { ok:true }). → POST. */
  insertStaffTraining(payload: StaffTrainingPersist): Promise<void>;
  /** Append an allergen-training row. → POST (allergen_awareness). */
  insertAllergenTraining(payload: AllergenTrainingPersist): Promise<void>;
}
```

> NOTE on return type: today both POST paths return `{ ok: true }` and DISCARD the inserted row
> (the inserts have NO `.select()`). To stay byte-identical, the inserts return `Promise<void>` (do
> NOT add a `.select().single()` — that would be a behaviour change + an extra round-trip). The
> reads return the raw row arrays the GET echoes.

### 4.3 Domain — `lib/domain/HaccpTraining.ts`
Pure TypeScript, no imports. Carry RAW DB column names/values for the GET-list rows so the wire
output is byte-identical; model each POST body as the app's own input vocabulary.

**Staff training GET row — VERBATIM select (training/route.ts:26):**
`'id, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, confirmation_items, submitted_at'`
```ts
export interface StaffTrainingRow {
  readonly id: string;
  readonly staff_name: string;
  readonly job_role: string;
  readonly training_type: string;
  readonly document_version: string;
  readonly completion_date: string;
  readonly refresh_date: string;
  readonly supervisor_name: string;
  readonly confirmation_items: unknown;
  readonly submitted_at: string;
}
```

**Allergen training GET row — VERBATIM select (training/route.ts:31):**
`'id, staff_name, job_role, training_completed, certification_date, refresh_date, reviewed_by, confirmation_items, supervisor_name, document_version, submitted_at'`
```ts
export interface AllergenTrainingRow {
  readonly id: string;
  readonly staff_name: string;
  readonly job_role: string;
  readonly training_completed: string;
  readonly certification_date: string;
  readonly refresh_date: string;
  readonly reviewed_by: string | null;
  readonly confirmation_items: unknown;
  readonly supervisor_name: string;
  readonly document_version: string | null;
  readonly submitted_at: string;
}
```

**GET response shape:** `TrainingListResult = { staff: readonly StaffTrainingRow[]; allergen: readonly AllergenTrainingRow[] }`.

**POST inputs + persist rows:**
```ts
/** Staff-training POST body (butchery_process_room | warehouse_operative). */
export interface CreateStaffTrainingInput {
  readonly training_type: string; // 'butchery_process_room' | 'warehouse_operative'
  readonly staff_name?: string;
  readonly job_role?: string;
  readonly document_version?: string;
  readonly completion_date?: string;
  readonly refresh_date?: string;
  readonly supervisor?: string;
  readonly confirmation_items?: unknown;
}

/** Derived insert row for haccp_staff_training (training/route.ts:79-90). */
export interface StaffTrainingPersist {
  readonly logged_by: string;
  readonly staff_name: string;           // .trim()
  readonly job_role: string;             // .trim()
  readonly training_type: string;        // the input training_type, verbatim
  readonly document_version: string;     // .trim()
  readonly completion_date: string;
  readonly refresh_date: string;
  readonly supervisor_name: string;      // supervisor.trim()
  readonly supervisor_signed_at: string; // now.toISOString()
  readonly confirmation_items: unknown;  // confirmation_items ?? {}
}

/** Allergen-training POST body (allergen_awareness). */
export interface CreateAllergenTrainingInput {
  readonly staff_name?: string;
  readonly job_role?: string;
  readonly certification_date?: string;
  readonly refresh_date?: string;
  readonly supervisor?: string;
  readonly confirmation_items?: unknown;
}

/** Derived insert row for haccp_allergen_training (training/route.ts:115-124). */
export interface AllergenTrainingPersist {
  readonly logged_by: string;
  readonly staff_name: string;            // .trim()
  readonly job_role: string;              // .trim()
  readonly training_completed: 'allergen_awareness'; // HARDCODED literal
  readonly certification_date: string;
  readonly refresh_date: string;
  readonly supervisor_name: string;       // supervisor.trim()
  readonly confirmation_items: unknown;   // confirmation_items ?? {}
}
```
> ⚠ Note `haccp_staff_training` insert sets `supervisor_signed_at: new Date().toISOString()` but
> `haccp_allergen_training` insert does NOT (no `supervisor_signed_at`). Preserve that asymmetry —
> staff persist carries `supervisor_signed_at`, allergen persist does not.

### 4.4 Service — `lib/services/HaccpTrainingService.ts`
`createHaccpTrainingService({ training })`. Depends on the `training` port alone.

```ts
export interface HaccpTrainingServiceDeps { readonly training: HaccpTrainingRepository; }

type ValidationResult = { ok: true } | { ok: false; status: number; message: string };
```

Surface:
- `getTraining(): Promise<TrainingListResult>` — runs `listStaffTraining()` + `listAllergenTraining()`
  (the route does `Promise.all`; the service can `Promise.all` internally) and returns
  `{ staff, allergen }`.
- `validateStaffTraining(input): ValidationResult` — the 6 required-field 400 cascade, VERBATIM
  strings + order (training/route.ts:72-77):
  1. `!staff_name?.trim()` → 400 `'Staff name required'`
  2. `!job_role?.trim()` → 400 `'Job role required'`
  3. `!document_version?.trim()` → 400 `'Document version required'`
  4. `!completion_date` → 400 `'Completion date required'`
  5. `!refresh_date` → 400 `'Refresh date required'`
  6. `!supervisor?.trim()` → 400 `'Supervisor name required'`
- `buildStaffTrainingPersist({ input, userId, now }): StaffTrainingPersist` — the insert map at
  training/route.ts:79-90 (trims, `training_type` verbatim, `supervisor_signed_at = now.toISOString()`,
  `confirmation_items ?? {}`).
- `insertStaffTraining(payload): Promise<void>` — pass-through.
- `validateAllergenTraining(input): ValidationResult` — the 5 required-field 400 cascade, VERBATIM
  (training/route.ts:109-113):
  1. `!staff_name?.trim()` → 400 `'Staff name required'`
  2. `!job_role?.trim()` → 400 `'Job role required'`
  3. `!certification_date` → 400 **`'Completion date required'`** ⚠ QUIRK — NOT 'Certification
     date required'. PRESERVE VERBATIM, do not "fix" (R5).
  4. `!refresh_date` → 400 `'Refresh date required'`
  5. `!supervisor?.trim()` → 400 `'Supervisor name required'`
- `buildAllergenTrainingPersist({ input, userId }): AllergenTrainingPersist` — the insert map at
  training/route.ts:115-124 (`training_completed: 'allergen_awareness'` HARDCODED; NO
  `supervisor_signed_at`; `confirmation_items ?? {}`). No `now` needed (no timestamp field).
- `insertAllergenTraining(payload): Promise<void>` — pass-through.

### 4.5 Supabase adapter — `lib/adapters/supabase/HaccpTrainingRepository.ts`
The ONLY `@supabase/*` importer for these two tables. Factory + service-role singleton
(`createSupabaseHaccpTrainingRepository(client)` + `supabaseHaccpTrainingRepository` bound to
`supabaseService`). VERBATIM select strings as module consts (the byte-identity anchor):

```ts
const STAFF_TRAINING_COLS =
  'id, staff_name, job_role, training_type, document_version, completion_date, refresh_date, supervisor_name, confirmation_items, submitted_at';
const ALLERGEN_TRAINING_COLS =
  'id, staff_name, job_role, training_completed, certification_date, refresh_date, reviewed_by, confirmation_items, supervisor_name, document_version, submitted_at';
```
- `listStaffTraining`: `.from('haccp_staff_training').select(STAFF_TRAINING_COLS).order('submitted_at', { ascending: false }).limit(100)`.
  On `error` → `log.error(...)` + `throw new ServiceError('Failed to load staff training', { cause: error })`. Return `(data ?? [])` cast to `StaffTrainingRow[]`.
- `listAllergenTraining`: `.from('haccp_allergen_training').select(ALLERGEN_TRAINING_COLS).order('submitted_at', { ascending: false }).limit(100)`. Same error handling.
- `insertStaffTraining(payload)`: `.from('haccp_staff_training').insert(payload)`. NO `.select()`,
  NO `.single()` (matches route). On `error` → `throw new ServiceError('Insert failed', { cause: error })`. Returns `void`.
- `insertAllergenTraining(payload)`: `.from('haccp_allergen_training').insert(payload)`. Same.

> BYTE-IDENTITY NUANCE: Unlike Cluster B, the training GET has **NO user joins** — the selects are
> flat column lists, no `users!`/aliased join. The reads MUST NOT add a join. Match Cluster B's
> error-throwing + `log.error` style exactly.

### 4.6 Fake adapter — `lib/adapters/fake/HaccpTrainingRepository.ts`
In-memory twin (mirror `lib/adapters/fake/HaccpAssessmentsRepository.ts`). Records inserted
payloads; reads seedable.
- `FakeHaccpTrainingSeed = { staffTraining?: readonly StaffTrainingRow[]; allergenTraining?: readonly AllergenTrainingRow[] }`.
- `FakeHaccpTrainingRepository extends HaccpTrainingRepository` with `readonly insertedStaffTraining:
  readonly StaffTrainingPersist[]` + `readonly insertedAllergenTraining: readonly AllergenTrainingPersist[]`.
- `createFakeHaccpTrainingRepository(seed?)` factory + `fakeHaccpTrainingRepository` singleton (empty,
  barrel symmetry).

---

## 5. Hexagon ② — `HaccpPeople`

### 5.1 Table & persistence
- `haccp_health_records` — append-only. SHARED by `people` (3 record-types) + the public `visitor`
  kiosk (1 record-type). One read (`listHealthRecords`), one write (`insertHealthRecord`).

### 5.2 Port — `lib/ports/HaccpPeopleRepository.ts`
```ts
import type { HealthRecordRow, HealthRecordPersist } from "@/lib/domain";

export interface HaccpPeopleRepository {
  /** Recent health records (all types), submitted_at DESC, limit 50, with the
   *  users!submitted_by(name) join. → GET /people. */
  listHealthRecords(): Promise<readonly HealthRecordRow[]>;
  /** Append a health record (any record_type). → POST /people + POST /visitor. */
  insertHealthRecord(payload: HealthRecordPersist): Promise<void>;
}
```
> Insert returns `Promise<void>` — both routes return `{ ok: true }` and DISCARD the row (no
> `.select()` today). Do NOT add `.select().single()`.

### 5.3 Domain — `lib/domain/HaccpPeople.ts`
Pure TypeScript, no imports.

**GET row — VERBATIM select (people/route.ts:29):**
`'id, record_type, date, staff_name, visitor_name, visitor_company, fit_for_work, health_questions, exclusion_reason, illness_type, absence_from, absence_to, manager_signed_name, submitted_at, users!submitted_by(name)'`
```ts
/** The users!submitted_by(name) join target (non-aliased; key is `users`). */
export type HaccpUserRef = { readonly name: string } | null;

export interface HealthRecordRow {
  readonly id: string;
  readonly record_type: string;
  readonly date: string;
  readonly staff_name: string | null;
  readonly visitor_name: string | null;
  readonly visitor_company: string | null;
  readonly fit_for_work: boolean;
  readonly health_questions: unknown;
  readonly exclusion_reason: string | null;
  readonly illness_type: string | null;
  readonly absence_from: string | null;
  readonly absence_to: string | null;
  readonly manager_signed_name: string | null;
  readonly submitted_at: string;
  readonly users: HaccpUserRef;
}
```
> NOTE: the join key here is `users` (NOT aliased) — `users!submitted_by(name)`. It is also NOT
> `!inner` (no `!inner` suffix), so a row with a null `submitted_by` still returns with
> `users: null`. Carry the key verbatim as `users`. (Do NOT reuse Cluster B's aliased `HaccpUserRef`
> import — define a local one in `HaccpPeople.ts` so the join key stays `users`.)

**GET response shape:** `HealthRecordsListResult = { records: readonly HealthRecordRow[] }`.

**Persist row — the SUPERSET of all 4 insert maps** (the three people paths + the kiosk path write
the same table with overlapping but not identical column sets). Model one `HealthRecordPersist`
covering every column any path sets; each `build…` fills the columns its path uses. Columns + their
sources, copied VERBATIM from the routes:

| Column | new_staff_declaration (people:70-80) | return_to_work (people:105-120) | visitor (people:138-150) | kiosk visitor (visitor:45-57) |
|---|---|---|---|---|
| `submitted_by` | userId | userId | userId | VISITOR_KIOSK_USER_ID |
| `record_type` | `'new_staff_declaration'` | `'return_to_work'` | `'visitor'` | `'visitor'` |
| `date` | `todayUK()` | `todayUK()` | `todayUK()` | `todayUK()` (kiosk's `en-GB` variant — R3) |
| `staff_name` | `.trim()` | `.trim()` | — | — |
| `health_questions` | raw (no default) | raw (no default) | raw (no default) | `health_questions ?? {}` ⚠ R2 |
| `fit_for_work` | `fit_for_work ?? true` | `true` (hardcoded) | `visitor_declaration_confirmed ?? false` | `fit_for_work ?? false` |
| `exclusion_reason` | `exclusion_reason?.trim() \|\| null` | — | — | — |
| `manager_signed_name` | `manager_signed_by.trim()` | `manager_signed_by.trim()` | `manager_signed_by.trim()` | `manager_signed_by.trim()` |
| `manager_signed_at` | `new Date().toISOString()` | `new Date().toISOString()` | `new Date().toISOString()` | `new Date().toISOString()` |
| `absence_from` | — | `absence_from \|\| null` | — | — |
| `absence_to` | — | `absence_to \|\| null` | — | — |
| `return_date` | — | `todayUK()` | — | — |
| `illness_type` | — | mapped (see below) | — | — |
| `symptom_free_48h` | — | `symptom_free_48h ?? null` | — | — |
| `medical_certificate_provided` | — | `medical_certificate_provided ?? null` | — | — |
| `visitor_name` | — | — | `.trim()` | `.trim()` |
| `visitor_company` | — | — | `.trim()` | `.trim()` |
| `visitor_reason` | — | — | `.trim()` | `.trim()` |
| `visitor_declaration_confirmed` | — | — | `?? false` | `?? false` |

> The persist type carries all columns as optional/nullable; each builder sets exactly the columns
> its path sets, and OMITS the rest (so the insert object key set matches the route's literal
> object key set byte-for-byte — do NOT add columns a given path didn't include).

**illness_type mapping (people/route.ts:98-103) — VERBATIM:**
`{ gi: 'gastrointestinal', other: 'other_illness', serious: 'serious_illness' }`, with fallback
`illnessTypeMap[illness_type] ?? illness_type` (an unmapped token passes through unchanged).

**Input types:**
```ts
export interface CreateNewStaffDeclarationInput {
  readonly staff_name?: string;
  readonly start_date?: string;     // validated but NOT written to a column (people:67)
  readonly health_questions?: unknown;
  readonly fit_for_work?: boolean;
  readonly exclusion_reason?: string;
  readonly manager_signed_by?: string;
}
export interface CreateReturnToWorkInput {
  readonly staff_name?: string;
  readonly absence_from?: string;
  readonly absence_to?: string;
  readonly illness_type?: string;
  readonly health_questions?: unknown;
  readonly symptom_free_48h?: boolean | null;
  readonly medical_certificate_provided?: boolean | null;
  readonly manager_signed_by?: string;
}
export interface CreateVisitorInput {
  readonly visitor_name?: string;
  readonly visitor_company?: string;
  readonly visitor_reason?: string;
  readonly health_questions?: unknown;
  readonly visitor_declaration_confirmed?: boolean;
  readonly manager_signed_by?: string;
  readonly fit_for_work?: boolean; // kiosk path only reads this
}
```
> ⚠ `start_date` is REQUIRED (validated → 400 'Start date required') but is NOT written to any DB
> column in the new_staff_declaration insert. Preserve: validate it, do not persist it.

### 5.4 Service — `lib/services/HaccpPeopleService.ts`
`createHaccpPeopleService({ people })`. Depends on the `people` port alone. THREE record-type
build/validate pairs + the SHARED visitor builder (design call 2):

Surface:
- `getRecords(): Promise<HealthRecordsListResult>` → `{ records: await people.listHealthRecords() }`.
- **new_staff_declaration:**
  - `validateNewStaffDeclaration(input): ValidationResult` — VERBATIM cascade (people:66-68):
    `!staff_name?.trim()` → 400 `'Staff name required'`; `!start_date` → 400 `'Start date required'`;
    `!manager_signed_by` → 400 `'Manager sign-off required'`.
  - `buildNewStaffDeclaration({ input, userId, now, today }): HealthRecordPersist` — the insert map
    at people:70-80. (`today` = the `todayUK()` string; `now` = the Date for `manager_signed_at`.)
- **return_to_work:**
  - `validateReturnToWork(input): ValidationResult` — VERBATIM (people:93-95): `!staff_name?.trim()`
    → `'Staff name required'`; `!illness_type` → `'Illness type required'`; `!manager_signed_by` →
    `'Manager sign-off required'`.
  - `buildReturnToWork({ input, userId, now, today }): HealthRecordPersist` — the insert map at
    people:105-120, INCLUDING the illness_type mapping (a private `mapIllnessType` helper in the
    service), `return_date = today`, `fit_for_work: true` hardcoded.
- **visitor (SHARED — design call 2):**
  - `validateVisitor(input): ValidationResult` — VERBATIM (people:133-136 / visitor:40-43):
    `!visitor_name?.trim()` → `'Visitor name required'`; `!visitor_company?.trim()` →
    `'Company required'`; `!visitor_reason?.trim()` → `'Visit reason required'`;
    `!manager_signed_by` (people) / `!manager_signed_by?.trim()` (kiosk) → `'Manager sign-off
    required'`. **These four strings MUST match across both routes — pin in integration parity test.**
  - `buildVisitorHealthRecord({ input, userId, now, today }): HealthRecordPersist` — the SHARED
    visitor-row builder called by BOTH the people-visitor path (userId = the cookie user) AND the
    kiosk route (userId = VISITOR_KIOSK_USER_ID, injected by the route). See §9 / R2 for the ONE
    divergence (`health_questions` default) that must be handled.

> ⚠ **Manager sign-off validation subtlety (R4):** people-visitor uses `!manager_signed_by`
> (truthy check — empty string `''` fails, whitespace `' '` PASSES); kiosk uses
> `!manager_signed_by?.trim()` (trim check — both `''` AND `' '` fail). These differ on a
> whitespace-only value. Decision: `validateVisitor` must REPRODUCE BOTH today's behaviours — the
> cleanest is to pass a flag or have the route apply its own manager-signoff check inline and let
> `validateVisitor` cover the three visitor-field checks only. **RECOMMENDATION: keep the
> manager-signoff check at the route edge for BOTH visitor routes (each route keeps its exact
> existing expression), and `validateVisitor` validates only `visitor_name`/`visitor_company`/
> `visitor_reason`.** This keeps both routes byte-identical without the service guessing which
> check to run. Confirm at Render; pin both in integration tests.

### 5.5 Supabase adapter — `lib/adapters/supabase/HaccpPeopleRepository.ts`
The ONLY `@supabase/*` importer for `haccp_health_records`. Factory + service-role singleton.
```ts
const HEALTH_RECORD_COLS =
  'id, record_type, date, staff_name, visitor_name, visitor_company, fit_for_work, health_questions, exclusion_reason, illness_type, absence_from, absence_to, manager_signed_name, submitted_at, users!submitted_by(name)';
```
- `listHealthRecords`: `.from('haccp_health_records').select(HEALTH_RECORD_COLS).order('submitted_at', { ascending: false }).limit(50)`.
  On `error` → `log.error` + `throw new ServiceError('Failed to load health records', { cause: error })`. Return `(data ?? [])` cast.
- `insertHealthRecord(payload)`: `.from('haccp_health_records').insert(payload)`. NO `.select()`.
  On `error` → `throw new ServiceError('Insert failed', { cause: error })`. Returns `void`.

> BYTE-IDENTITY NUANCE: the join key stays `users` (the `users!submitted_by(name)` join), NOT an
> alias. Non-inner → null-`submitted_by` rows still return with `users: null`.

### 5.6 Fake adapter — `lib/adapters/fake/HaccpPeopleRepository.ts`
- `FakeHaccpPeopleSeed = { healthRecords?: readonly HealthRecordRow[] }`.
- `FakeHaccpPeopleRepository extends HaccpPeopleRepository` with `readonly insertedHealthRecords:
  readonly HealthRecordPersist[]`.
- `createFakeHaccpPeopleRepository(seed?)` + `fakeHaccpPeopleRepository` singleton.

---

## 6. Date handling (`todayUK()`) — TWO distinct implementations, both preserved (R3)

- `people/route.ts:16-18` — `new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })`.
- `visitor/route.ts:20-25` — `new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London',
  year:'numeric', month:'2-digit', day:'2-digit' }).split('/').reverse().join('-')`.

Both yield `YYYY-MM-DD` for the same instant, but via DIFFERENT code. **Decision: `todayUK()` stays
a ROUTE-EDGE function in each route file, computed VERBATIM as today, and the resulting STRING is
passed into the service `build…` as `today: string`.** Do NOT centralise/unify the two
implementations into one (that would be a behaviour change risk on a TZ/locale edge and is out of
scope). The service receives `today` (the string) and `now` (the Date for `*_signed_at`) — it never
computes either.

🗣 **In plain English:** Two screens compute "today in London" with slightly different code that
happens to give the same answer. We keep both exactly as written and just hand the finished date
string to the service, rather than risk unifying them and changing an edge-case result.

---

## 7. Files created (12) + barrel edits (5) + routes re-pointed (3)

**Created — domain (2):**
1. `lib/domain/HaccpTraining.ts` (§4.3)
2. `lib/domain/HaccpPeople.ts` (§5.3)

**Created — ports (2):**
3. `lib/ports/HaccpTrainingRepository.ts` (§4.2)
4. `lib/ports/HaccpPeopleRepository.ts` (§5.2)

**Created — services (2):**
5. `lib/services/HaccpTrainingService.ts` (§4.4)
6. `lib/services/HaccpPeopleService.ts` (§5.4)

**Created — Supabase adapters (2):**
7. `lib/adapters/supabase/HaccpTrainingRepository.ts` (§4.5)
8. `lib/adapters/supabase/HaccpPeopleRepository.ts` (§5.5)

**Created — Fake adapters (2):**
9. `lib/adapters/fake/HaccpTrainingRepository.ts` (§4.6)
10. `lib/adapters/fake/HaccpPeopleRepository.ts` (§5.6)

**Created — unit tests (2):**
11. `tests/unit/services/HaccpTrainingService.test.ts`
12. `tests/unit/services/HaccpPeopleService.test.ts`
(Optionally also `tests/unit/wiring/haccpPeopleTraining.test.ts` mirroring `haccpAssessments`
wiring test — see §11; the implementer may fold both wiring assertions into one file.)

**Created — integration tests (1):**
- `tests/integration/haccpPeopleTraining.test.ts` (mirror `tests/integration/haccpAssessments.test.ts`
  + the `_setup` helpers from `tests/integration/haccp.test.ts`).

**Edited — barrels (5, additive re-export only):**
- `lib/domain/index.ts` — add the `HaccpTraining.ts` + `HaccpPeople.ts` types. (NOTE: `HaccpPeople`
  exports its OWN `HaccpUserRef` — there is already a `HaccpUserRef` exported from
  `HaccpDailyCheck.ts` at line 128. RENAME the people one on export to avoid a barrel collision,
  e.g. export it as `HealthRecordUserRef`, or do not re-export it from the barrel at all and keep it
  module-local. **Decision: keep `HaccpPeople`'s user-ref module-local and export only
  `HealthRecordRow`/`HealthRecordsListResult`/the input + persist types.** Confirm at Render.)
- `lib/ports/index.ts` — add `HaccpTrainingRepository`, `HaccpPeopleRepository`.
- `lib/services/index.ts` — add `createHaccpTrainingService` + types; `createHaccpPeopleService` + types.
- `lib/adapters/supabase/index.ts` — add the two new repos (factory + singleton).
- `lib/adapters/fake/index.ts` — add the two new repos (factory + singleton + Fake types).

**Edited — wiring (1):**
- `lib/wiring/haccp.ts` — add TWO singletons:
  ```ts
  export const haccpTrainingService: HaccpTrainingService =
    createHaccpTrainingService({ training: supabaseHaccpTrainingRepository });
  export const haccpPeopleService: HaccpPeopleService =
    createHaccpPeopleService({ people: supabaseHaccpPeopleRepository });
  ```
  Service-role only; no `…ForCaller`. Update the file's import block to pull the two new
  factories from `@/lib/services` and the two singletons from `@/lib/adapters/supabase`.

**Edited — route re-points (3):** §10.

**NO migration, NO `package.json`, NO `.eslintrc.json`, NO UI page edit.** New adapter files land
under the already-allow-listed glob `lib/adapters/supabase/**/*.ts` — no lint-config change.

---

## 8. Architecture / naming decision — TWO hexagons, NOT one (Ousterhout depth calls)

**Hakan's standing instruction: document each as a depth choice, not convenience.**

### Call 1 — TWO hexagons (`HaccpTraining` + `HaccpPeople`), not one combined "people" aggregate
Cluster B chose ONE aggregate for five register groups because they share a common skeleton
(user-ref + review cadence + version + the SAME role-gate). Cluster C is the OPPOSITE case:
- **Training** = "who has been trained" — staff/allergen training certificates, admin-only,
  refresh-date cadence, two append-only training tables.
- **People (fitness-to-work)** = "who is fit to handle food right now" — health declarations,
  return-to-work, visitor screening; warehouse/butcher/admin AND a PUBLIC kiosk; an exclusion
  /fit-for-work decision; one shared health-records table.
These are honest separate bounded contexts: different tables, different auth surfaces (training is
admin-only; people includes a no-auth public kiosk), different domain vocabulary (training
certificates vs fitness-to-work exclusions). Forcing them into one module would create a module
whose interface you must learn TWO unrelated halves of — a shallow, low-leverage merge.
**Deletion test:** delete the boundary between them and complexity does not concentrate — it just
smears two unrelated vocabularies into one barrel. So the boundary earns its keep. **Verdict: two
hexagons.**

### Call 2 — Shared visitor builder (locality)
The visitor health-record row is built in TWO places today (the people-visitor POST path AND the
public kiosk route) with near-identical logic. Rather than two copies that can drift, the
`HaccpPeopleService` exposes ONE `buildVisitorHealthRecord({ input, userId, now, today })` called by
both routes. **Locality:** when the visitor row shape changes, you edit one builder, not two route
files. The ONE genuine difference (the `health_questions` default — R2) is handled explicitly inside
the shared builder (or by each route passing its own default in), documented in §9. This is the
deeper choice: one tested builder, two thin callers.

### Call 3 — `now`/`userId`/`today` injected into build (deterministic, auth-agnostic, testable)
The service `build…` methods never call `new Date()` and never read cookies. The route injects
`now` (the Date), `today` (the `todayUK()` string), and `userId` (the cookie user for people; the
fixed `VISITOR_KIOSK_USER_ID` for the kiosk). This makes the service:
- **deterministic** — unit tests pass a fixed `now`/`today` and assert exact timestamps;
- **auth-agnostic** — the service does not know or care that the kiosk has no login; it just
  receives a userId. The kiosk's "no auth" is purely a route-edge fact.
- **testable** — the shared visitor builder is unit-tested with BOTH a real user id and the kiosk
  id, proving parity.

🗣 **In plain English:** (1) Training and "are you fit to handle food" are genuinely different
subjects with different rules and different audiences — two boxes, not one mixed box. (2) The
visitor form is filled from two places (a staff page and a public kiosk), so the row-building logic
is written once and used twice. (3) The boxes are handed the clock, the date, and "who is
submitting" from outside, so they're easy to test and don't care whether the submitter logged in.

---

## 9. The ONE visitor divergence to handle in the shared builder (R2)

The people-visitor insert (people:138-150) and the kiosk insert (visitor:45-57) are identical
EXCEPT:
- **people-visitor** passes `health_questions` RAW (whatever the body had, including `undefined`).
- **kiosk** passes `health_questions: health_questions ?? {}` (defaults to `{}`).
- (`submitted_by` differs — userId vs kiosk id — but that's the injected `userId`, not a divergence
  in the builder.)
- (people-visitor uses `visitor_declaration_confirmed ?? false` for BOTH `visitor_declaration_confirmed`
  AND `fit_for_work`; kiosk uses `visitor_declaration_confirmed ?? false` for the former and
  `fit_for_work ?? false` (a SEPARATE body field) for the latter. ⚠ Another divergence — pin both.)

**Decision:** `buildVisitorHealthRecord` takes the resolved values as already-defaulted inputs so
the divergence lives at the route edge (each route applies its own `?? {}` / `?? false` exactly as
today), OR the builder takes a small `defaults` flag. **RECOMMENDATION: each route resolves its own
`health_questions` and `fit_for_work` defaults and passes them into the builder as concrete values;**
the builder only assembles the row from the resolved values + `userId`/`now`/`today`. This keeps
both routes byte-identical and the builder genuinely shared. Confirm at Render; pin both insert
shapes (people-visitor RAW health_questions vs kiosk `?? {}`; people-visitor fit_for_work =
declaration vs kiosk fit_for_work = separate field) in integration tests.

🗣 **In plain English:** The staff page and the kiosk fill the visitor row almost identically, but
the kiosk fills in a couple of blanks with safe defaults that the staff page doesn't. We let each
screen apply its own defaults and hand the finished values to the one shared builder — so the
builder is truly shared and neither screen's behaviour shifts.

---

## 10. Per-route re-point notes (before → after)

For each route: the auth gate STAYS verbatim; the wall clock (`new Date()`), the `todayUK()`
helper, and (kiosk) the `VISITOR_KIOSK_USER_ID` constant STAY at the route edge; the response
literal is rebuilt in the SAME key order. Drop `import { supabaseService }` + `const supabase = ...`
from all 3.

### 10.1 — `app/api/haccp/training/route.ts`
- **GET:** keep `role !== 'admin'` → 401 `'Unauthorised — admin only'`. Then
  `const result = await haccpTrainingService.getTraining()` → `return NextResponse.json(result)`
  (`{ staff, allergen }`, same key order). Catch → 500 `'Server error'`.
- **POST:** keep `role !== 'admin' || !userId` → 401 `'Unauthorised — admin only'`. Parse body +
  `training_type`.
  - `training_type === 'butchery_process_room' || 'warehouse_operative'`:
    `const v = haccpTrainingService.validateStaffTraining(body); if (!v.ok) return
    NextResponse.json({ error: v.message }, { status: v.status })`; then
    `await haccpTrainingService.insertStaffTraining(haccpTrainingService.buildStaffTrainingPersist({ input: body, userId, now: new Date() }))`;
    → `return NextResponse.json({ ok: true })`.
  - `training_type === 'allergen_awareness'`: `validateAllergenTraining` (⚠ the 'Completion date
    required' quirk), then `insertAllergenTraining(buildAllergenTrainingPersist({ input: body, userId }))`
    → `{ ok: true }`.
  - else → 400 `'Invalid training_type'`.
  - Catch → 500 `'Server error'`.

### 10.2 — `app/api/haccp/people/route.ts`
- **GET:** keep `!role || !['warehouse','butcher','admin'].includes(role)` → 401 `'Unauthorised'`.
  `const result = await haccpPeopleService.getRecords()` → `return NextResponse.json(result)`
  (`{ records }`). Catch → 500 `'Server error'`.
- **POST:** keep the same role+userId gate → 401 `'Unauthorised'`. Parse `{ record_type }`;
  `if (!record_type)` → 400 `'record_type required'`. Compute `const today = todayUK()` and
  `const now = new Date()` at the edge.
  - `'new_staff_declaration'`: `validateNewStaffDeclaration` → build → `insertHealthRecord(buildNewStaffDeclaration({ input: body, userId, now, today }))` → `{ ok: true }`.
  - `'return_to_work'`: `validateReturnToWork` → build (illness mapping inside) → insert → `{ ok: true }`.
  - `'visitor'`: the visitor-field `validateVisitor` + the route's OWN `!manager_signed_by` check
    (R4); resolve `health_questions` (RAW) + `fit_for_work` (= `visitor_declaration_confirmed ?? false`)
    at the edge; `insertHealthRecord(buildVisitorHealthRecord({ input: resolved, userId, now, today }))` → `{ ok: true }`.
  - else → 400 `'Invalid record_type'`. Catch → 500 `'Server error'`.

### 10.3 — `app/api/haccp/visitor/route.ts`
- **PUBLIC, POST-only, NO auth, NO GET.** Keep the `VISITOR_KIOSK_USER_ID` constant + the
  `en-GB` `todayUK()` in this file. Parse body; run the route's OWN `!manager_signed_by?.trim()`
  check (R4) + `validateVisitor` for the three visitor fields (VERBATIM strings); resolve
  `health_questions ?? {}` + `fit_for_work ?? false` at the edge; then
  `await haccpPeopleService.insertHealthRecord(haccpPeopleService.buildVisitorHealthRecord({ input: resolved, userId: VISITOR_KIOSK_USER_ID, now: new Date(), today: todayUK() }))`
  → `return NextResponse.json({ ok: true })`. Catch → 500 `'Server error'`.
- 🔴 `VISITOR_KIOSK_USER_ID = '190d6c79-6239-4be7-bdbd-0df474895ebc'` STAYS a route constant —
  injected as `userId`. Do NOT move it into the service/domain (the service is auth-agnostic).

🗣 **In plain English:** Each route shrinks to "check who's allowed (or, for the kiosk, nobody to
check), grab the clock and today's date, validate, ask the service, send `{ ok: true }`." The
kiosk keeps its own "this submission is from the reception kiosk user" id and just hands it to the
shared builder.

---

## 11. Byte-identity & rip-out verification checklist

**Training:**
- [ ] GET admin-only → 401 `'Unauthorised — admin only'` for non-admin.
- [ ] GET returns `{ staff: [...], allergen: [...] }` — exact key order, both `submitted_at` DESC,
  limit 100, the two VERBATIM column lists, NO user join.
- [ ] POST non-admin/no-userId → 401 `'Unauthorised — admin only'`.
- [ ] POST staff paths: 6 required-field 400s in order with exact strings; insert sets
  `supervisor_signed_at`, `training_type` verbatim, `confirmation_items ?? {}`; `{ ok: true }`.
- [ ] POST allergen path: 5 required-field 400s; ⚠ missing `certification_date` → 400 **'Completion
  date required'**; insert `training_completed: 'allergen_awareness'`, NO `supervisor_signed_at`;
  `{ ok: true }`.
- [ ] POST unknown training_type → 400 `'Invalid training_type'`.

**People:**
- [ ] GET role gate (warehouse/butcher/admin) → 401 `'Unauthorised'`; returns `{ records: [...] }`,
  `submitted_at` DESC, limit 50, the VERBATIM select, the `users!submitted_by(name)` join key =
  `users`, null-`submitted_by` rows still returned with `users: null`.
- [ ] POST role+userId gate; `!record_type` → 400 `'record_type required'`.
- [ ] new_staff_declaration: 3 required-field 400s; `start_date` validated but NOT persisted;
  insert sets `fit_for_work ?? true`, `exclusion_reason?.trim() || null`; `{ ok: true }`.
- [ ] return_to_work: 3 required-field 400s; illness mapping `gi→gastrointestinal`,
  `other→other_illness`, `serious→serious_illness`, unmapped passes through; `return_date = today`,
  `fit_for_work: true`; `{ ok: true }`.
- [ ] visitor (people): 3 visitor 400s + `!manager_signed_by` check; `health_questions` RAW;
  `fit_for_work = visitor_declaration_confirmed ?? false`; `{ ok: true }`.
- [ ] POST unknown record_type → 400 `'Invalid record_type'`.

**Visitor kiosk (public):**
- [ ] NO auth required; POST-only (no GET handler).
- [ ] 3 visitor 400s + `!manager_signed_by?.trim()` check; `health_questions ?? {}`;
  `fit_for_work ?? false`; `submitted_by = VISITOR_KIOSK_USER_ID`; `{ ok: true }`.
- [ ] **Parity:** the four visitor error strings ('Visitor name required' / 'Company required' /
  'Visit reason required' / 'Manager sign-off required') IDENTICAL across people-visitor and kiosk.

**All 3 routes:**
- [ ] DB error → 500 (raw pg message at the `.error` branch became `ServiceError` → catch returns
  500 `'Server error'`; see R6). Unhandled → 500 `'Server error'`.
- [ ] NO `@supabase/*` import, NO `haccp_*` table name remaining in the file.

**Rip-out:** Before — 3 route files each import `supabaseService` directly. After — the 3 routes
depend ONLY on `haccpTrainingService` / `haccpPeopleService` from `lib/wiring/haccp.ts`. Swapping
the DB vendor for Cluster C = TWO new adapters (one per port) + TWO wiring lines, nothing in
`app/**` changes. **PASS.**

---

## 12. Hexagonal verdict (Gate 2)

- **Ports:** ADDS **two** — `HaccpTrainingRepository` (4 methods) + `HaccpPeopleRepository`
  (2 methods). No existing port changed.
- **Adapters:** ADDS `SupabaseHaccpTrainingRepository` + `SupabaseHaccpPeopleRepository` (the only
  `@supabase/*` importers for these 3 tables) + two Fakes (tests). All under
  `lib/adapters/{supabase,fake}/**` — already ESLint-allow-listed; no `.eslintrc.json` change.
- **New dependencies:** **NONE.** New files import only already-wrapped `@supabase/supabase-js`
  (adapter tree), `@/lib/errors`, `@/lib/observability/log`. `package.json` untouched.
- **Single-use vendor wrap:** N/A — no new vendor; Supabase already wrapped.
- **Rip-out test:** **PASS** — after the re-point, the 3 routes depend only on the wiring
  singletons; a DB-vendor swap for Cluster C = 2 adapters + 2 wiring lines, zero `app/**` changes.

**Verdict line:** Ports: **2 new** (`HaccpTrainingRepository`, `HaccpPeopleRepository`). Adapters:
**2 new** Supabase (+2 Fakes for tests). New deps: **0**. Rip-out: **PASS**. **Gate 2: PASS — no
blocker.**

🗣 **In plain English:** Two clean new sockets, two Supabase plugs, zero new vendors, and "rip out
the database = two adapter swaps + two wiring lines" holds. Green Gate-2 verdict.

---

## 13. Risk Assessment (mandatory)

**Headline: NO must-fix risks. No Gate-2 blocker.** This is a live byte-identical re-point of two
hexagons; the risk surface is behaviour drift, and every sharp edge is pinned by a unit +
integration test. The two genuinely tricky bits — the people-visitor vs kiosk divergences (R2) and
the manager-signoff whitespace difference (R4) — are each handled by keeping the divergent bit at
the route edge so the shared builder stays honestly shared.

| # | Category | Severity | Finding | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| **R1** | **Business-logic / byte-identity (shared health-records table, 4 insert maps)** | **MEDIUM** | `haccp_health_records` is written by 4 paths (3 people + kiosk) with overlapping-but-different column sets. A "tidy-up" that makes one persist superset apply to all paths would write columns a path didn't set today (e.g. `return_date` or `illness_type` on a visitor row), changing stored data. | One `HealthRecordPersist` type, but each `build…` sets EXACTLY its path's columns and omits the rest (§5.3 table). §11 pins each insert's column set; integration tests assert per-path stored rows. | No (mitigated by per-path builders + tests) |
| **R2** | **Business-logic (people-visitor vs kiosk divergence)** | **MEDIUM** | Two visitor write paths differ on `health_questions` default (RAW vs `?? {}`) and `fit_for_work` source (declaration vs separate `fit_for_work` field). A naive "share everything" merge would unify these and shift behaviour. | §9: each route resolves its own `health_questions`/`fit_for_work` and passes concrete values into the shared builder; builder assembles only. Integration parity test pins both stored shapes. | No |
| **R3** | **Business-logic (two `todayUK()` implementations)** | LOW | people = `en-CA`; kiosk = `en-GB` split/reverse. Same output normally, but different code on a locale/TZ edge. Unifying them risks an edge-case shift. | §6: `todayUK()` stays route-edge per file, computed verbatim; the string is passed in as `today`. Service never computes a date. | No |
| **R4** | **Business-logic (manager-signoff validation whitespace)** | LOW | people-visitor `!manager_signed_by` (whitespace `' '` passes) vs kiosk `!manager_signed_by?.trim()` (whitespace fails). `validateVisitor` can't run one check for both without changing one route. | §5.4 / §10: keep the manager-signoff check at each route edge verbatim; `validateVisitor` covers only the three visitor fields. Integration test pins both (whitespace-only manager value: people passes, kiosk 400). | No |
| **R5** | **Byte-identity (preserved quirk)** | LOW | allergen-training missing `certification_date` returns 'Completion date required' (not 'Certification date required'). A well-meaning "fix" would change the error string. | §4.4 pins it VERBATIM; §11 checklist; unit test asserts the exact string. Explicitly OUT OF SCOPE to fix (§2). | No |
| **R6** | **Error-body drift on DB-failure 500s** | LOW | Today a DB error returns 500 with the RAW pg message (`error.message`) via the `.error` branch; the catch returns `'Server error'`. After re-point the adapter throws `ServiceError` → the route catch returns `'Server error'`, so a DB-error 500 body shifts from a pg string to `'Server error'`. | Same accepted posture as Cluster A R6 / Cluster B R5: front-end does not display these 500 bodies. Preserve the catch's `'Server error'`. No ConflictError mapping (none exists today). Flag to Gate 3 for a one-line decision. | No |
| **R7** | **Security (public kiosk on service-role)** | LOW | The visitor route is PUBLIC (no auth) and now calls a service-role-wired singleton. This is UNCHANGED from today (the route already used `supabaseService` directly). The kiosk only inserts a visitor health record with a fixed system user id; it cannot read or write anything else. | No change in exposure. Service-role wiring matches today; per-caller RLS deferred to F-RLS-04h. Kiosk id stays a route constant. Document; pin "kiosk insert only" in integration test. | No |
| **R8** | **Concurrency / race** | NONE | All three writes are independent append-only inserts (no upsert, no in-place update, no unique key in scope). No lost-update or duplicate-key path. | No change from today (frozen, diff-only). | No |
| **R9** | **Data migration** | NONE | No schema/SQL/RLS change. `supabase/migrations/` untouched. | n/a | No |
| **R10** | **Launch blocker** | NONE | Live behaviour change but byte-identical; the visitor kiosk is public-facing (reception). Gates: full integration + pgTAP regression + E2E `@critical` + exhaustive browser-tap E2E on the prod-build preview (§14) + preview smoke before merge. | §14 matrix + Gate-4 preview smoke. | No |
| **R11** | **Barrel collision (`HaccpUserRef`)** | LOW | `HaccpDailyCheck.ts` already exports `HaccpUserRef`; `HaccpPeople.ts` needs a user-ref too. A duplicate barrel re-export breaks the build. | §7: keep `HaccpPeople`'s user-ref module-local (not re-exported) OR export under a distinct name. Build/type-check catches any collision at Render. | No |

🗣 **In plain English:** Nothing here can force a redesign or block the gate. The real work is
precision around the shared health-records table: four slightly different "save" shapes, two
visitor paths with small default differences, two date helpers, and one preserved typo-ish error
string — each kept exactly as today by keeping the divergent bits at the route edge and giving each
save its own builder. No must-fix risk.

---

## 14. Test plan / ANVIL matrix

**Unit (NEW — fast, fake DB, no Docker):**
- `tests/unit/services/HaccpTrainingService.test.ts` — `getTraining` returns `{ staff, allergen }`
  from seeded reads; `validateStaffTraining` all 6 strings in order; `validateAllergenTraining` all
  5 strings incl. the ⚠ 'Completion date required' quirk; `buildStaffTrainingPersist` (trims,
  `supervisor_signed_at = injected now`, `training_type` verbatim, `confirmation_items ?? {}`);
  `buildAllergenTrainingPersist` (`training_completed: 'allergen_awareness'`, NO
  `supervisor_signed_at`); insert delegation recorded on the Fake; determinism via a fixed `now`.
- `tests/unit/services/HaccpPeopleService.test.ts` — `getRecords` returns `{ records }`; the three
  validate cascades (exact strings); `buildNewStaffDeclaration` (`fit_for_work ?? true`,
  `exclusion_reason` trim/null, `start_date` NOT persisted, `manager_signed_at = injected now`,
  `date = injected today`); `buildReturnToWork` illness mapping (all three + unmapped pass-through,
  `return_date = today`, `fit_for_work: true`); **`buildVisitorHealthRecord` with BOTH a real
  userId AND `VISITOR_KIOSK_USER_ID`** (proving the shared builder + auth-agnostic injection);
  determinism via a fixed `now`/`today`.
- (optional) `tests/unit/wiring/haccpPeopleTraining.test.ts` — both singletons construct + expose
  their full surface; assert service-role wiring ONLY (no `…ForCaller`).

**Integration (NEW — real local DB, mirror `tests/integration/haccpAssessments.test.ts`):**
- `tests/integration/haccpPeopleTraining.test.ts`:
  - **training GET**: admin returns `{ staff, allergen }` (both DESC, limit 100); non-admin → 401.
  - **training POST**: each staff training_type inserts a `haccp_staff_training` row (assert stored
    columns); allergen_awareness inserts a `haccp_allergen_training` row; the 'Completion date
    required' quirk; unknown training_type → 400.
  - **people GET**: warehouse/butcher/admin returns `{ records }` (limit 50, DESC); the
    `users!submitted_by(name)` join survives (assert `users.name` present); a row with null
    `submitted_by` (the kiosk-inserted visitor row) still returns with `users: null`; non-role → 401.
  - **people POST**: each record_type inserts the right column set (assert stored row per §5.3
    table); illness mapping pinned; `start_date` not stored.
  - **visitor POST (public)**: no auth → 200 `{ ok: true }`; stored row has
    `submitted_by = VISITOR_KIOSK_USER_ID`, `health_questions = {}` when omitted; the kiosk row is
    then visible in the people GET with `users: null`.
  - **visitor parity**: same four error strings on the people-visitor path and the kiosk path; the
    whitespace-manager divergence (R4) pinned (people passes, kiosk 400).
  - **byte-identity error strings**: every 400/401 string asserted verbatim.
  - Self-seed via the service client in `beforeAll` (no people/training seed in `supabase/seed.sql`);
    append-only tables — assert by inserted-row lookup, never by total table count.

**ANVIL — exhaustive browser-tap E2E (authored at ANVIL on the production-build preview).** Screens
/ flows to cover (named here so ANVIL has the list):
- **Training admin screen** — staff-training form (butchery process room + warehouse operative
  tabs): every field, the confirmation-item checkboxes, completion + refresh date pickers,
  supervisor field, submit happy path + each required-field validation; the allergen-awareness
  training form (its fields, the certification-date field, the 'Completion date required' path);
  the training history table(s) render the submitted rows.
- **People (fitness-to-work) screen** — new-staff health declaration form (Y/N health-question
  pairs, fit-for-work, exclusion reason, manager sign-off), submit happy + exclusion path;
  return-to-work form (illness-type selector → mapping, absence dates, symptom-free 48h,
  medical-cert, manager sign-off); the visitor log form on the staff page; the health-records
  history table.
- **Public visitor kiosk (`/haccp/visitor`)** — the public form with NO login: visitor name /
  company / reason, the health-question Y/N pairs, the declaration checkbox, manager sign-off,
  submit happy path + each required-field validation + the exclusion/deviation path (declaration
  not confirmed → `fit_for_work=false` recorded).
- Pin: every numpad/Y-N pair/checkbox/history table across training, people, and the kiosk; happy
  + exclusion/deviation paths.

**Regression gates before merge:** full unit suite green · `npm run test:integration` green ·
pgTAP regression green · E2E `@critical` 8/8 · Gate-4 preview smoke against the PR's Vercel preview.

---

## 15. Rollback

**No migration → revert-only.** There is no schema/data change to undo. If a defect ships, revert
the PR merge commit (the 12 new files + 5 barrel edits + 1 wiring edit + 3 route edits) and the 3
routes return to their inline `supabaseService` calls — identical behaviour, since the re-point was
byte-identical. No data backfill, no down-migration, no orphaned Supabase preview branch concern
(no schema touched). The two new hexagons become dead code on revert but harm nothing; a clean
revert removes them entirely.

🗣 **In plain English:** Because we changed zero database structure, undoing this is just "undo the
code change" — the screens go back to talking to the database directly, exactly as before. Nothing
to clean up in the database.

---

## 16. Numbered implementer walk (atomic order)

1. Create `lib/domain/HaccpTraining.ts` (§4.3) and `lib/domain/HaccpPeople.ts` (§5.3). Type-check.
2. Add the two ports `lib/ports/HaccpTrainingRepository.ts` (§4.2) + `lib/ports/HaccpPeopleRepository.ts` (§5.2).
3. Add the two services `lib/services/HaccpTrainingService.ts` (§4.4) + `lib/services/HaccpPeopleService.ts` (§5.4).
4. Add the two Fake adapters (§4.6, §5.6).
5. Add the two Supabase adapters (§4.5, §5.5) with the VERBATIM select consts + factory + singleton.
6. Edit the 5 barrels (§7) — additive re-exports; resolve the `HaccpUserRef` collision (§7 / R11).
7. Edit `lib/wiring/haccp.ts` — add the two service-role singletons (§7). Type-check + run
   `tests/unit/lint/no-adapter-imports.test.ts`.
8. Write the two unit-test files (§14) against the Fakes; get them green.
9. Re-point `app/api/haccp/training/route.ts` (§10.1) — drop the supabase import; auth gate stays;
   validate → build → insert → reply.
10. Re-point `app/api/haccp/people/route.ts` (§10.2) — same; keep `todayUK()` + the route-edge
    manager-signoff check; resolve visitor defaults at the edge.
11. Re-point `app/api/haccp/visitor/route.ts` (§10.3) — keep `VISITOR_KIOSK_USER_ID` + `en-GB`
    `todayUK()` + the route-edge manager-signoff check; inject the kiosk id.
12. Confirm all 3 route files have NO `@supabase/*` import and NO `haccp_*` table name.
13. Write `tests/integration/haccpPeopleTraining.test.ts` (§14); `npm run db:up` + `db:reset`, run
    `npm run test:integration` green.
14. Full unit suite + pgTAP regression + E2E `@critical` green → hand to Guard / ANVIL.

🗣 **In plain English:** Build the inside-out core first (types → ports → services → fakes →
adapters → wiring), prove it with unit tests, then flip the three screens one at a time and prove
the whole round-trip against a real database. Each step type-checks before the next.
