# F-19 PR1 — Cluster A daily-check foundation (introduce-only hexagonal extraction)

> Date: 2026-06-22 · Author: forge-planner (FORGE Phase 2 — Order)
> FORGE unit: F-19 (Days 13–14, HACCP crunch) · This plan: PR1 of ~10 · Lane: STANDARD
> Status: planned, awaiting Gate 2.
> Spec lock: Gate 1 approved 2026-06-22 — Cluster A foundation, **introduce-only,
> ZERO behaviour change**. Mirror of F-16 / F-17 / F-18 PR1.
> Precedent mirrored: F-18 Visits PR1 (`docs/plans/archive/2026-06-21-f-18-pr1-visits-domain-foundation.md`)
> + F-16 Cash PR1 (`docs/plans/archive/2026-06-22-f-16-pr1-cash-domain-foundation.md`).

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ HaccpDailyChecksRepository (port) → [Supabase] (adapter) + [Fake] (test)
  └─ HaccpCorrectiveActionsRepository (port) → [Supabase] (adapter) + [Fake] (test)
  HaccpDailyChecksService + HaccpCorrectiveActionsService depend on the ports only
  wired in lib/wiring/haccp.ts (the one file allowed to touch lib/adapters/**)
🗣 Two new sockets — one for the 7 daily-check log tables, one for the shared corrective-action ledger. The daily-check brain writes into BOTH; only the wiring panel knows Supabase is behind each. Nothing is plugged into a live route yet.
```

🗣 **In plain English:** We build a clean, fully-assembled "daily HACCP checks" machine
in `lib/` next to the existing raw route code, ready to use — but we do NOT plug any
live screen into it. The user sees and does nothing different. PR2 (a separate FORGE
loop) throws the switch.

---

## 1. Goal & guardrails

Extract the persistence + write-orchestration of the **7 daily-check sub-domains** and
the **shared Corrective-Actions writer** out of the route files into owned hexagonal
layers (`lib/domain`, `lib/ports`, `lib/services`, `lib/adapters/{supabase,fake}`,
`lib/wiring`). **Introduce-only**: the new code is dead until PR2 re-points the routes.

🗣 **In plain English:** Today every HACCP route reaches straight for the database. We
lift that database talk into a labelled, swappable box. This PR builds the box and
wires it to Supabase but leaves the routes untouched — they keep working byte-for-byte.

Hard constraints, ALL locked at Gate 1 (re-stated so the implementer cannot drift):

- **Dead code only.** No existing route file is edited. Grep-proven unused (see §10 Step 8).
- **ZERO behaviour change.** No wire output moves. PR2 is the byte-identical re-point.
- **NO migration.** No SQL, no schema change, no RLS policy. (`supabase/migrations/` untouched.)
- **NO new dependency.** `package.json` untouched. Only already-wrapped `@supabase/supabase-js`
  + `@/lib/errors` + `@/lib/observability/log` are imported by new files.
- **Service-role wiring ONLY.** `lib/wiring/haccp.ts` exports the service-role singletons.
  The per-caller `…ForCaller(userId)` factory (which fires RLS) is **deferred to F-RLS-04h**
  (Cluster G, PR10) — exactly as F-18's `visitsServiceForCaller` was added later by F-RLS-04g.
- **Verbatim `.select()` strings.** Every column list + insert payload-key set is copied
  CHAR-FOR-CHAR from the current route (pinned in §6 / §7), so PR2's re-point is byte-identical.

🗣 **In plain English:** "Service-role" = the master key that bypasses the database's
per-user locks. Right now it is the only key that works on these tables (they have locks
enabled but no doors cut yet — see §4). So PR1 wires the master key; the per-user-key
version is a later security PR.

Hexagonal rules (CLAUDE.md "Non-negotiable architecture", ADR-0002): `lib/domain` +
`lib/ports` import nothing from adapters; the Supabase adapter is the only `@supabase/*`
importer; services depend on ports only and export factories (never singletons); wiring is
the only business-layer file importing adapters. Pinned by
`tests/unit/lint/no-adapter-imports.test.ts`.

---

## 2. The 7 daily-check sub-domains + the shared writer (verified against real files)

| # | Sub-domain | Route file (verified) | Primary table(s) | Writes CA rows? |
|---|---|---|---|---|
| 1 | **delivery** | `app/api/haccp/delivery/route.ts` | `haccp_deliveries` (+ reads `haccp_suppliers`) | YES — up to **3 per POST** (temp + contamination + allergen) |
| 2 | **cold-storage** | `app/api/haccp/cold-storage/route.ts` | `haccp_cold_storage_temps` (+ reads `haccp_cold_storage_units`) | YES — one per deviating reading (N rows) |
| 3 | **calibration** | `app/api/haccp/calibration/route.ts` | `haccp_calibration_log` | YES — 1 per failed manual test |
| 4 | **cleaning** | `app/api/haccp/cleaning/route.ts` | `haccp_cleaning_log` | YES — 1 when issues reported |
| 5 | **process-room** | `app/api/haccp/process-room/route.ts` | `haccp_processing_temps` + `haccp_daily_diary` | YES — N per breached channel / failed diary check |
| 6 | **mince-prep** | `app/api/haccp/mince-prep/route.ts` | `haccp_mince_log` + `haccp_meatprep_log` + `haccp_time_separation_log` | YES — N per temp-breach channel (mince/prep only; timesep never) |
| 7 | **product-return** | `app/api/haccp/product-return/route.ts` | `haccp_returns` (reads none extra) | YES — **always** 1 per POST (SOP-12 audit trail) |
| — | **Corrective-Actions (shared)** | `app/api/haccp/corrective-actions/route.ts` (GET) + `app/api/haccp/corrective-actions/[id]/route.ts` (PATCH) | `haccp_corrective_actions` | n/a — this IS the CA table; admin verification queue |

🗣 **In plain English:** Seven daily forms, each logging a food-safety check. When a check
fails, the form also files a "corrective action" — what went wrong and what was done — into
ONE shared ledger table. The 8th item is the admin screen that lists and signs off those
corrective actions. We model the 7 forms as one service, and the shared ledger as its own
service the 7 forms call.

**Tables touched in PR1 (12 distinct):** `haccp_deliveries`, `haccp_suppliers`,
`haccp_cold_storage_temps`, `haccp_cold_storage_units`, `haccp_calibration_log`,
`haccp_cleaning_log`, `haccp_processing_temps`, `haccp_daily_diary`, `haccp_mince_log`,
`haccp_meatprep_log`, `haccp_time_separation_log`, `haccp_returns`, plus the shared
`haccp_corrective_actions`. All confirmed read/written by the route files above.

**All current call sites are `supabaseService` via `@/lib/adapters/supabase/client`** (NOT
raw `fetch`). Verified: every one of the 9 route files imports
`import { supabaseService } from '@/lib/adapters/supabase/client'`. So there is **no raw-fetch
inheritance** (ADR-0005's Per-Site Map assigns NO `app/api/haccp/**` route — see §11).

---

## 3. Architecture decision — TWO ports, TWO services (mirrors Cash's two-port shape)

The roadmap locked: **Corrective-Actions is a SHARED SERVICE, not a peer domain.** It is a
write-target hub the 7 daily-check routes file into via the `(source_table, source_id)`
pattern. We realise that as:

- **`HaccpCorrectiveActionsRepository`** (port) — the CA ledger: `insertMany(rows)` for the
  daily-check writers, plus `listVerificationQueue()` + `signOff(...)` for the admin routes.
- **`HaccpDailyChecksRepository`** (port) — the 7 daily-check tables: the GET-list reads +
  the POST inserts (returning the inserted `id` so the service can link CA rows).
- **`HaccpCorrectiveActionsService`** — thin business object over the CA port (queue +
  sign-off + the shared `insertCorrectiveActions` write).
- **`HaccpDailyChecksService`** — owns the daily-check validation cascades AND composes the
  CA service to file CA rows after a successful insert.

🗣 **In plain English:** One socket for the seven log tables, one socket for the shared
corrective-action ledger. The daily-checks brain plugs into both — it writes the log, then
(if a check failed) writes the corrective action. Keeping the ledger as its own socket means
when Cluster B/C/D/E forms also start filing corrective actions, they reuse the same socket
instead of each re-inventing it.

**Composition rule (CLAUDE.md):** a service must NEVER import another service. The CA-filing
soft-fail wrapper therefore lives in a **use-case**, `lib/usecases/submitHaccpDailyCheck.ts`,
which depends on `HaccpCorrectiveActionsService` ALONE. It does NOT compose the daily-check
insert (see **DECISION 1 — RESOLVED** below); PR2's routes call the daily-checks service for
the form-specific insert, then call this use-case to file the CA rows.

🗣 **In plain English:** Two brains aren't allowed to phone each other directly. PR1 ships a
small "CA-filing" coordinator that owns ONE rule — "if filing the corrective action trips, log
it and carry on, don't sink the form." It does NOT also run the form-save; the routes do that.

> **DESIGN DECISION 1 — RESOLVED at Render (option a, the Ousterhout-honest choice; supersedes
> the earlier "compose both writes" sketch).** This plan originally sketched a use-case that
> composes the daily-check insert THEN the CA fan-out behind one `submit…` method (option b).
> We **rejected** that at Render. The 7 sub-domains have HETEROGENEOUS inserts (delivery inserts
> one row + returns an id; cold-storage inserts N readings; mince-prep dispatches 3 forms;
> calibration has two modes; process-room writes two tables) plus a bespoke CA-derivation each.
> Forcing all seven insert+derive paths through one method would NOT be a deep module — it would
> be a SHALLOW 7-way dispatcher whose interface (a union input over all 7 forms) is nearly as
> large as the per-route code it hides, merely RELOCATING complexity. Ousterhout's deep-module
> test prefers a small module that truly owns ONE thing over a shallow one pretending to own
> seven. **So the use-case owns the soft-fail contract ALONE** (`dailyChecks` dep dropped). The
> CA service still exists standalone for the admin queue/sign-off routes, and ADR-0002 forbids a
> service importing another service, so the CA-filing wrapper belongs in a use-case, not a
> service. Both shapes satisfy the rip-out test; (a) is the deeper, more honest module.

---

## 4. RLS / security state (context, no change in PR1)

All 30 HACCP tables have RLS **ENABLED + ZERO policies** since T2 (`20260613000000_enable_rls_42_tables.sql`)
— a deny-all trap that only the service-role key (which bypasses RLS) can read/write. That is
exactly why PR1 wires the **service-role** singleton: it is the only thing that works on these
tables today, and it preserves byte-identical behaviour. The per-caller authenticated client +
the full per-table policy set are **F-RLS-04h** (Cluster G, PR10, the closing lock).

🗣 **In plain English:** The tables have locks installed but no doors cut into them yet — only
the master key opens them. We use the master key now (same as the routes do today) and defer
cutting the per-user doors to the final security PR. No security regression: access is
identical to today.

---

## 5. Files created (18) + barrel edits (5)

**Created — domain (2):**
1. `lib/domain/HaccpDailyCheck.ts` — domain types for the 7 sub-domains' rows + inputs (§6).
2. `lib/domain/HaccpCorrectiveAction.ts` — CA row + insert-input + verification-queue types (§7).

**Created — ports (2):**
3. `lib/ports/HaccpDailyChecksRepository.ts` — the 7-table read/insert interface.
4. `lib/ports/HaccpCorrectiveActionsRepository.ts` — the shared CA-ledger interface.

**Created — services (2):**
5. `lib/services/HaccpDailyChecksService.ts` — `createHaccpDailyChecksService(deps)` factory.
6. `lib/services/HaccpCorrectiveActionsService.ts` — `createHaccpCorrectiveActionsService(deps)` factory.

**Created — use-case (1):**
7. `lib/usecases/submitHaccpDailyCheck.ts` — composes daily-checks insert + CA-row filing.

**Created — Supabase adapters (2):**
8. `lib/adapters/supabase/HaccpDailyChecksRepository.ts` — only `@supabase/*` importer for the 7 tables.
9. `lib/adapters/supabase/HaccpCorrectiveActionsRepository.ts` — only `@supabase/*` importer for the CA ledger.

**Created — Fake adapters (2):**
10. `lib/adapters/fake/HaccpDailyChecksRepository.ts` — in-memory, for unit tests.
11. `lib/adapters/fake/HaccpCorrectiveActionsRepository.ts` — in-memory, for unit tests.

**Created — wiring (1):**
12. `lib/wiring/haccp.ts` — composition root; service-role singletons ONLY (no `…ForCaller`).

**Created — unit tests (6):**
13. `tests/unit/services/HaccpDailyChecksService.test.ts`
14. `tests/unit/services/HaccpCorrectiveActionsService.test.ts`
15. `tests/unit/usecases/submitHaccpDailyCheck.test.ts`
16. `tests/unit/adapters/supabase/HaccpDailyChecksRepository.test.ts`
17. `tests/unit/adapters/supabase/HaccpCorrectiveActionsRepository.test.ts`
18. `tests/unit/wiring/haccpService.test.ts`

**Edited (additive re-exports only — NO behaviour change):**
`lib/domain/index.ts`, `lib/ports/index.ts`, `lib/services/index.ts`,
`lib/adapters/supabase/index.ts`, `lib/adapters/fake/index.ts`.

🗣 **In plain English:** 18 brand-new files plus 5 tiny "add this name to the export list"
edits. The export-list edits are append-only — they cannot change any existing behaviour.

**NO route file, NO migration, NO `package.json`, NO `.eslintrc.json`** edited.
(New adapter files land under the existing glob `lib/adapters/supabase/**/*.ts`, already
allow-listed for `@supabase/*` in `.eslintrc.json` — no lint config change needed.)

---

## 6. Domain — `lib/domain/HaccpDailyCheck.ts` (shape guide)

Pure TypeScript, no imports. Carry RAW enum/string values from the DB; presentation transforms
(if any) stay in the routes (PR2). Model each sub-domain's **GET-list row** and **POST-input**.
The implementer copies field names + types from the route bodies cited in §2. Key shapes:

- **Delivery:** `DeliveryRow` (the GET `.select` columns — see §8 row 1), `CreateDeliveryInput`
  (the POST body keys: `supplier_id?`, `supplier_name?`, `product`, `product_category`,
  `temperature_c`, `covered_contaminated`, `contamination_type?`, `contamination_notes?`,
  `notes?`, `born_in?`, `reared_in?`, `slaughter_site?`, `cut_site?`, `allergens_identified`,
  `allergen_notes?`, `corrective_action_temp?`, `corrective_action_contam?`), plus the
  derived-write shape (`temp_status`, `delivery_number`, `batch_number`, `corrective_action_required`).
- **ColdStorage:** `ColdStorageUnit`, `ColdStorageReading`, `CreateColdStorageReadingsInput`
  (`session`, `date`, `readings[]`, `comments`, `corrective_action?`).
- **Calibration:** `CalibrationRecord`, `CreateCalibrationInput` (the two modes: `manual` +
  `certified_probe`).
- **Cleaning:** `CleaningEntry`, `CreateCleaningInput`.
- **ProcessRoom:** `ProcessingTempRow`, `DailyDiaryRow`, `CreateProcessingTempInput`,
  `CreateDailyDiaryInput`.
- **MincePrep:** `MinceLogRow`, `MeatPrepLogRow`, `TimeSeparationRow`, and the 3 create inputs
  (`form: 'mince' | 'meatprep' | 'timesep'`).
- **ProductReturn:** `ReturnRow`, `CreateReturnInput`.
- **Shared:** `CAPayload = { cause; disposition; recurrence; notes? }` (the per-track corrective
  payload used by delivery/cold-storage/calibration/cleaning/process-room/mince-prep).

🗣 **In plain English:** One file naming every field each daily form reads and writes, in the
app's own vocabulary, so the rest of the code never has to know the database's column spelling.

> **MODELING NOTE (low risk):** seven sub-domains in one domain file is large but cohesive —
> they share the `submitted_by`/`date`/`time_*` skeleton, the `corrective_action_required`
> flag, and the `CAPayload`. The grill may split into per-sub-domain files
> (`lib/domain/haccp/Delivery.ts`, …) if it prefers; both pass review. Pick one at Render.

---

## 7. Domain — `lib/domain/HaccpCorrectiveAction.ts`

```ts
// The (source_table, source_id) hub pattern — a CA row links back to the daily-check row.
export type HaccpCASourceTable =
  | "haccp_deliveries" | "haccp_cold_storage_temps" | "haccp_calibration_log"
  | "haccp_cleaning_log" | "haccp_processing_temps" | "haccp_daily_diary"
  | "haccp_mince_log" | "haccp_meatprep_log" | "haccp_returns";

// One row to INSERT into haccp_corrective_actions. Keys are the EXACT insert keys the
// routes use today (snake_case carried verbatim so PR2 inserts byte-identical payloads).
export interface CorrectiveActionInsert {
  readonly actioned_by: string;
  readonly source_table: HaccpCASourceTable;
  readonly source_id: string;
  readonly ccp_ref: string;
  readonly deviation_description: string;
  readonly action_taken: string;
  readonly product_disposition: string | null;
  readonly recurrence_prevention: string | null;
  readonly management_verification_required: boolean;
  readonly resolved?: boolean;        // delivery sets resolved:false explicitly; others omit
}

// Admin verification queue (corrective-actions GET) — the two lists.
export interface CorrectiveActionQueueRow { /* shape = the GET .select, §7a */ }
export interface CorrectiveActionResolvedRow { /* shape = the GET .select, §7a */ }
```

> **PAYLOAD NUANCE the implementer MUST preserve (byte-identity):** the CA insert payloads
> are NOT uniform across the 7 writers. Pin each verbatim from the route:
> - `delivery` sets `resolved: false` on all 3 rows; cold-storage/process-room/mince-prep/
>   calibration/cleaning/product-return do **not** set `resolved` (DB default applies).
> - `product_disposition` is `null` for the process-room **diary** CA rows and for delivery's
>   derived map; a mapped enum elsewhere. Carry the literal each route writes.
> - `recurrence_prevention` is `null` for diary rows; a string elsewhere.
> The CA port write method must accept the row AS-IS (no normalisation) so PR2 sends the same
> bytes. Model `CorrectiveActionInsert` with optional fields and have each PR2 caller build the
> exact object it builds today.

🗣 **In plain English:** The corrective-action rows are slightly different depending on which
form filed them — some set a "resolved" flag, some leave fields blank. The box must pass each
row through unchanged so the future switch-flip writes exactly the same data the routes write
today.

### §7a — verbatim CA GET selects (admin queue, pinned from corrective-actions/route.ts:25,32)

| List | Verbatim `.select(...)` string |
|---|---|
| unresolved | `id, submitted_at, ccp_ref, deviation_description, action_taken, product_disposition, recurrence_prevention, source_table, management_verification_required, users!actioned_by(name)` then `.eq('management_verification_required', true).is('verified_at', null).order('submitted_at', { ascending: false })` |
| resolved | `id, submitted_at, verified_at, ccp_ref, deviation_description, action_taken, source_table, users!actioned_by(name), verifier:users!verified_by(name)` then `.eq('management_verification_required', true).not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(20)` |

**CA sign-off (corrective-actions/[id] PATCH, pinned from route.ts:29-37):**
`.update({ verified_by: userId, verified_at: <ISO now>, resolved: true }).eq('id', id).eq('management_verification_required', true)`.

---

## 8. Adapter — verbatim daily-check `.select()` + insert strings (THE byte-identity anchor)

Copy each EXACTLY as it appears today. The PR2 re-point must reproduce these char-for-char.

| Method (port) | Route source | Verbatim `.select(...)` / insert detail |
|---|---|---|
| `listDeliveries(range)` | `delivery/route.ts:227-245` | `id, date, time_of_delivery, supplier, product, product_category, species, temperature_c, temp_status, covered_contaminated, contamination_notes, notes, born_in, reared_in, slaughter_site, cut_site, batch_number, delivery_number, allergens_identified, allergen_notes, submitted_at, users!inner(name)` + suppliers `id, name, categories` (`.eq('active',true).order('name')`); ordering `date desc, delivery_number desc`; range filters today / week / last_week |
| `findSupplierForDelivery(id)` | `delivery/route.ts:314-318` | `.from('haccp_suppliers').select('id, name, active').eq('id', supplier_id).single()` |
| `countDeliveriesOn(date)` | `delivery/route.ts:440-443` | `.select('*', { count:'exact', head:true }).eq('date', today)` |
| `insertDelivery(payload)` | `delivery/route.ts:454-481` | insert keys verbatim (§6 derived-write); `.select('id').single()`; map 23505 → `ConflictError` (route → 409 "Another delivery was logged at the same moment. Please retry.") |
| `listColdStorage(date)` | `cold-storage/route.ts:115-122` | units `id, name, unit_type, target_temp_c, max_temp_c` (`.eq('active',true).order('position')`); temps `unit_id, session, temperature_c, temp_status, comments` (`.eq('date', queryDate)`) |
| `listActiveColdStorageUnits()` | `cold-storage/route.ts:172-175` | `id, name, unit_type, target_temp_c, max_temp_c` (`.eq('active',true)`) |
| `insertColdStorageReadings(rows)` | `cold-storage/route.ts:236-239` | insert rows; `.select('id, unit_id, temperature_c, temp_status')`; 23505 → `ConflictError` (409 "This session has already been submitted for one or more units.") |
| `listCalibration()` | `calibration/route.ts:48-59` | `id, date, time_of_check, thermometer_id, calibration_mode, cert_reference, purchase_date, ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass, action_taken, verified_by, submitted_at, users!inner(name)` (`.gte('date', <6mo ago>).order('submitted_at', desc)`) |
| `insertCalibration(payload)` | `calibration/route.ts:100-110` (certified) / `136-150` (manual) | both insert key-sets verbatim; manual `.select('id').single()`; certified no select |
| `listCleaning()` | `cleaning/route.ts:47-61` | `id, date, time_of_clean, what_was_cleaned, issues, what_did_you_do, verified_by, sanitiser_temp_c, submitted_at, submitted_by, users!inner(name)` (`.eq('date', today).order('submitted_at', desc)`) |
| `insertCleaning(payload)` | `cleaning/route.ts:104-117` | insert keys verbatim; `.select('id').single()` |
| `listProcessRoom(date)` | `process-room/route.ts:99-110` | temps `session, product_temp_c, room_temp_c, product_within_limit, room_within_limit, within_limits, submitted_at` (`.eq('date', queryDate).order('submitted_at')`); diary `phase, check_results, issues, what_did_you_do, submitted_at` (`.eq('date', queryDate).order('submitted_at')`) |
| `insertProcessingTemp(payload)` | `process-room/route.ts:187-201` | insert keys verbatim; `.select('id').single()`; 23505 → `ConflictError` (409 "This {session} check has already been submitted for today.") |
| `insertDailyDiary(payload)` | `process-room/route.ts:303-314` | insert keys verbatim; `.select('id').single()`; 23505 → `ConflictError` (409 "{Phase} checks have already been submitted for today.") |
| `listMincePrep(range)` | `mince-prep/route.ts:202-245` | THREE selects (`minceSelect`, `meatprepSelect`, `timesepSelect` — copy the multi-line template literals verbatim from lines 202-213) + a deliveries select (`id, supplier, product, product_category, batch_number, slaughter_site, born_in, delivery_number, date, temperature_c, temp_status`, `.gte('date', since16).not('batch_number','is',null)`) |
| `countMinceRuns(table, date)` | `mince-prep/route.ts:142-150` | `.select('*', { count:'exact', head:true }).eq('date', date)` over `haccp_mince_log` / `haccp_meatprep_log` |
| `insertMince(payload)` | `mince-prep/route.ts:345-368` | insert keys verbatim; `.select('id').single()`; 23505 → `ConflictError` (409 "Duplicate submission — batch code already exists today") |
| `insertMeatPrep(payload)` | `mince-prep/route.ts:480-505` | insert keys verbatim; `.select('id').single()`; 23505 → `ConflictError` (same 409 msg) |
| `insertTimeSeparation(payload)` | `mince-prep/route.ts:585-595` | insert keys verbatim; **no select** |
| `listReturns()` | `product-return/route.ts:36-44` | `id, date, time_of_return, customer, product, temperature_c, return_code, return_code_notes, disposition, corrective_action, verified_by, submitted_at, users!inner(name)` (`.eq('date', today).order('submitted_at', desc)`) |
| `insertReturn(payload)` | `product-return/route.ts:94-110` | insert keys verbatim; `.select('id').single()` |

**Construction (F-06 / ADR-0002 template, mirrors VisitsRepository):**
`createSupabaseHaccpDailyChecksRepository(client)` factory + `supabaseHaccpDailyChecksRepository`
singleton bound to `supabaseService`; same factory+singleton for the CA repository.

**Error contract:** reads return `[]`/`null` on miss; every DB failure throws `ServiceError`
(`@/lib/errors`); `23505` maps to `ConflictError` (the routes' clean 409 paths). The
`ca_write_failed` soft-failure path (CA insert error logged, NOT thrown — the daily-check still
succeeds) is preserved at the **use-case** level (§9), NOT inside the adapter.

🗣 **In plain English:** The adapter asks the database for the exact same columns, in the exact
same order, with the exact same filters the routes use now — so when PR2 swaps the route's
inline call for this adapter, the bytes on the wire are identical. The one subtlety: if writing
the corrective-action row fails, the form still counts as submitted (that's how it works today),
so that "shrug and carry on" logic lives in the coordinator, not the database box.

---

## 9. Use-case — `lib/usecases/submitHaccpDailyCheck.ts`

**Per DECISION 1 (§3, resolved at Render — option a):** the use-case owns ONLY the CA-filing
soft-fail contract; it does **not** compose the daily-check insert. Its single method,
`fileCorrectiveActions(rows, label)`, is called by PR2's routes AFTER the daily-check row is
already committed:
1. an empty `rows` batch → no-op, `ca_write_failed: false`;
2. otherwise file the rows via `HaccpCorrectiveActionsService.insertCorrectiveActions(rows)`;
3. on CA-insert failure: **log + return `ca_write_failed: true`** (do NOT throw — preserve the
   route's soft-fail contract; the daily-check row stays committed).

The CA-row DERIVATION (the route's `derive*Action` / `DISPOSITION_MAP` helpers + the per-route
gates, e.g. delivery's `(hasDeviationTemp || hasDeviationContam)` gate) is lifted into
`HaccpDailyChecksService`'s per-sub-domain `build*CorrectiveActions` builders (§7) and unit-tested
there. The use-case only takes the already-built rows and files them under the soft-fail rule.

🗣 **In plain English:** The form-save and the "work out which corrective actions to write" both
live in the daily-checks brain. This little coordinator does one job: file those rows, and if
filing trips, log it and still report the form as saved — exactly today's behaviour, so users
never lose a submitted check over a secondary write.

> **SCOPE NOTE for the grill:** the `derive*Action` protocol-text builders + `DISPOSITION_MAP`
> tables + temp/kill-date/batch-code logic currently live in the route files. PR1 may either
> (a) lift them into the service/use-case now (cleaner, more dead code to test), or (b) leave
> them in the routes for PR2 to move. **Recommendation: lift the pure helpers** (`tempStatus`,
> `buildBatchNumber`, `deriveColdStorageAction`, `deriveTempAction`, etc.) into the domain/
> service in PR1 so they get unit tests here, and let PR2 delete the route copies. Confirm the
> boundary at Render — but keep it byte-identical either way.

---

## 10. Step-by-step build sequence (executable blind)

1. **`lib/domain/HaccpCorrectiveAction.ts`** — CA insert + queue types (§7). Pure TS.
2. **`lib/domain/HaccpDailyCheck.ts`** — the 7 sub-domains' row + input types + `CAPayload` (§6).
3. **`lib/ports/HaccpCorrectiveActionsRepository.ts`** — `insertMany`, `listVerificationQueue`,
   `signOff`. Pure interface.
4. **`lib/ports/HaccpDailyChecksRepository.ts`** — the read + insert methods from §8. Pure interface.
5. **`lib/adapters/fake/HaccpCorrectiveActionsRepository.ts`** + **`lib/adapters/fake/HaccpDailyChecksRepository.ts`**
   — in-memory impls (record inserts, return canned rows) for unit tests.
6. **`lib/services/HaccpCorrectiveActionsService.ts`** — `createHaccpCorrectiveActionsService(deps)`;
   thin over the CA port.
7. **`lib/services/HaccpDailyChecksService.ts`** — `createHaccpDailyChecksService(deps)`; owns the
   validation cascades (exact route error strings) + insert delegation; lift the pure helpers (§9).
8. **`lib/usecases/submitHaccpDailyCheck.ts`** — compose the two services (§9).
9. **`lib/adapters/supabase/HaccpCorrectiveActionsRepository.ts`** — verbatim CA selects (§7a) +
   `insertMany`; factory + service-role singleton; ONLY `@supabase/*` importer for the CA ledger.
10. **`lib/adapters/supabase/HaccpDailyChecksRepository.ts`** — verbatim daily-check selects/inserts
    (§8); factory + service-role singleton; ONLY `@supabase/*` importer for the 7 tables.
11. **`lib/wiring/haccp.ts`** — compose `haccpDailyChecksService` + `haccpCorrectiveActionsService`
    + `submitHaccpDailyCheck` singletons against the service-role repos. **Service-role only — NO
    `…ForCaller`** (cite F-RLS-04h deferral in the file header, mirroring `lib/wiring/visits.ts`).
12. **Barrel edits (5, additive only):** add the new types to `lib/domain/index.ts`,
    `lib/ports/index.ts`; add the factories + types to `lib/services/index.ts`; add the supabase
    repos to `lib/adapters/supabase/index.ts`; add the fake repos to `lib/adapters/fake/index.ts`.
13. **Write the 6 unit tests** (§11 below). Run `npm run test:unit` → all green.
14. **Grep-prove dead code:** confirm NO file under `app/**` imports `@/lib/wiring/haccp`,
    `HaccpDailyChecksService`, `HaccpCorrectiveActionsService`, or `submitHaccpDailyCheck`. The
    only consumers are the new unit tests.
15. **Run `npm run typecheck` + `next lint`** → 0/0 (STRICT since F-TD-01).

🗣 **In plain English:** Build inside-out — types first, then the sockets, then the test doubles,
then the brains, then the real Supabase plugs, then the wiring panel, then the export lists,
then the tests. Last two steps prove nothing live touches the new code and the strict
type/lint bars stay green.

---

## 11. TDD test plan (mirrors F-18 PR1 / F-16 PR1)

- **`HaccpDailyChecksService.test.ts`** — validation cascades with EXACT message strings per
  sub-domain (against the Fake repo):
  - delivery: `Supplier is required`, `Product description is required`, `Select a product
    category`, `Temperature is required` (non-dry-goods), `Traceability required: …` (meat),
    `Corrective action required for temperature deviation`, `Invalid temperature cause: …`,
    `Contamination type required (…)`, `Invalid contamination cause: …`, `Invalid disposition: …`;
  - cold-storage: `Missing required fields`, `Readings may only be submitted for today's date.`,
    `Unknown or inactive unit: …`, `Corrective action required for deviation`, `Invalid cause: …`;
  - calibration: certified-mode + manual-mode required-field strings, `Corrective action is
    required when a test fails`, ice/boil pass-band logic (`-1..1`, `99..101`);
  - cleaning: `Select at least one item that was cleaned`, `Verified by is required`, issues→CA gate;
  - process-room: temps + diary required-field strings, today-only gate, deviation→CA gate;
  - mince-prep: species validation, `Kill date is required`, kill-date hard-fail string,
    temp-pass logic (input ≤7; mince out ≤2/frozen ≤-18; prep out ≤4), 3-form dispatch;
  - product-return: required fields, `RC08`/`RC01` conditional strings.
- **`HaccpCorrectiveActionsService.test.ts`** — `insertCorrectiveActions` delegates to the port
  with the rows unchanged (Fake asserts the exact payload — incl. the `resolved`/`null` nuances
  from §7); `listVerificationQueue` + `signOff` delegate.
- **`submitHaccpDailyCheck.test.ts`** — happy path inserts the daily row then files N CA rows;
  **CA-insert failure → `ca_write_failed: true`, NOT thrown, daily row still committed** (the
  soft-fail contract); the 3-CA-row delivery case (temp + contamination + allergen) fans out to
  3 rows; the always-1-row product-return case; the never-CA timesep case.
- **`adapters/supabase/HaccpDailyChecksRepository.test.ts`** — row→domain mapping per method;
  `23505` → `ConflictError` on every insert that has a 409 path; null/`[]`-on-miss for reads;
  **verbatim-select smoke** (assert the exact column string per method — the byte-identity pin).
- **`adapters/supabase/HaccpCorrectiveActionsRepository.test.ts`** — `insertMany` passes rows
  through unmodified; verbatim CA queue selects (§7a); sign-off filter (`management_verification_required`).
- **`wiring/haccpService.test.ts`** — the 3 singletons construct + expose the full method surface;
  **assert wiring exports the service-role singletons ONLY — no `…ForCaller`** (that is F-RLS-04h).

🗣 **In plain English:** Every rule the forms enforce (and its exact wording) gets a test against
a fake in-memory database — fast, no Docker. The adapter tests pin the exact database columns so
the future switch-flip can't silently change them. One test specifically proves a failed
corrective-action write doesn't sink a submitted form.

**No integration / pgTAP / E2E in PR1** — the code is dead (nothing live calls it). Those land in
PR2 when routes re-point (the F-18/F-16 PR1 posture). State this explicitly to ANVIL.

---

## 12. Hexagonal verdict (Gate 2)

- **Ports:** ADDS **two** — `HaccpDailyChecksRepository` (`lib/ports/HaccpDailyChecksRepository.ts`)
  and `HaccpCorrectiveActionsRepository` (`lib/ports/HaccpCorrectiveActionsRepository.ts`).
- **Adapters:** ADDS `createSupabaseHaccpDailyChecksRepository` +
  `createSupabaseHaccpCorrectiveActionsRepository` (the only `@supabase/*` importers for these
  tables) + the two Fake repos (tests). All under `lib/adapters/{supabase,fake}/**` — already
  ESLint-allow-listed; no `.eslintrc.json` change.
- **New dependencies:** **NONE.** New files import only already-wrapped `@supabase/supabase-js`
  (inside the adapter tree), `@/lib/errors`, `@/lib/observability/log`. `package.json` untouched.
- **Single-use vendor wrap:** N/A — no new vendor library; Supabase is already wrapped.
- **Rip-out test:** **PASS.** Swapping the DB vendor for HACCP daily-checks = one new adapter per
  port + one wiring line each (the `haccp:` bindings in `lib/wiring/haccp.ts`). Domain, ports,
  services, use-case untouched. Full realisation lands after PR2 re-points routes (PR1 builds the
  seam) — the same staged posture F-16/F-17/F-18 shipped under.

🗣 **In plain English:** Two clean new sockets, Supabase plugs in each, zero new vendors, and the
"rip out the database = change one plug + one wiring line" test passes. This is the green Gate-2
verdict.

---

## 13. Risk Assessment (mandatory)

**Headline: NO must-fix risks. No Gate-2 blocker.** This is dead, introduce-only code — the
risk surface is byte-identity drift for the later PR2, not live behaviour.

| # | Category | Severity | Finding | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| R1 | **Business-logic / byte-identity** | MEDIUM | The 7 routes have non-uniform CA payloads (`resolved` set only by delivery; `null` disposition/recurrence on diary rows), per-track `derive*Action` text, and bespoke 23505 messages. If the adapter/service normalises any of these, PR2's re-point silently changes stored data or wire output. | §7/§8 pin every payload + select + 409 string verbatim; verbatim-select smoke tests + per-payload Fake assertions enforce it. Lift helpers byte-identically (§9). | No (mitigated by pins; this is the unit's central discipline) |
| R2 | **Business-logic (soft-fail contract)** | MEDIUM | The `ca_write_failed` path: a CA-insert failure must NOT fail the daily-check submit. If the use-case throws on CA failure, a deviation submission that succeeds today would 500 in PR2. | §9 puts the soft-fail in the use-case; `submitHaccpDailyCheck.test.ts` asserts "CA fails → `ca_write_failed:true`, row still committed, no throw". | No |
| R3 | **Concurrency / race** | LOW | `delivery_number` / mince `runNum` are COUNT-then-insert (TOCTOU); the DB unique indexes catch the race → 23505. No change in PR1 (dead code) — but the adapter must map 23505 → `ConflictError` so PR2 keeps the clean 409, not a 500. | Adapter maps 23505 per §8; tested. Pre-existing race semantics unchanged (out of scope per ADR-0003 freeze — diff-only). | No |
| R4 | **Security** | LOW | PR1 wires the service-role (RLS-bypass) key. Same access the routes have today; no new exposure. Per-caller RLS is F-RLS-04h. | Wiring header cites the deferral (mirrors `visits.ts`); wiring test asserts NO `…ForCaller` leaked early. | No |
| R5 | **Data migration** | NONE | No schema/SQL/RLS change. `supabase/migrations/` untouched. | n/a | No |
| R6 | **Launch blocker** | NONE | Code is dead until PR2 — cannot affect production. Grep-proof of zero live consumers (Step 14) is the gate. | Step 14 grep + `wiring` test. | No |
| R7 | **Modeling/scope creep** | LOW | Two large domain files / one big daily-checks service could sprawl. | §6/§3 design notes give the grill the split options; either passes review. | No |

🗣 **In plain English:** Nothing here can break the live app, because nothing live uses it yet.
The real job is precision: copy the database calls and the corrective-action data exactly, and
keep the "a failed corrective-action write still saves the form" rule intact — both are pinned
by tests. No blocker stands between this plan and Gate 2.

---

## 14. ADR check

- **ADR-0002 (hexagonal shape + naming)** — GOVERNING. This plan follows it exactly: domain/ports
  import nothing inward-violating; adapters are the sole `@supabase/*` importers; services export
  factories; wiring is the only adapter-importing business file. No conflict.
- **ADR-0005 (raw-fetch Per-Site Map)** — **NO conflict, and NO inheritance.** The Per-Site Map
  (lines 33-45) assigns NO `app/api/haccp/**` route — the HACCP routes already use
  `supabaseService` (not raw `fetch`), so there is nothing to inherit. Worth noting to the
  conductor as a *positive* (HACCP is simpler than Cash/Complaints on this axis).
- **ADR-0003 (strangler-fig + FREEZE)** — followed: diff-only review scope; introduce-only;
  pre-existing route behaviour frozen until PR2.
- **ADR-0004 / ADR-0007 (RLS mechanism)** — out of scope, correctly deferred to F-RLS-04h.

**No ADR conflicts.**

---

## 15. Scope discrepancies found (roadmap vs real code) — reported, not silently resolved

1. **CA writer count "~7 daily-check routes" → verified exactly 7, but write-counts vary widely.**
   Roadmap says delivery files 3 CA rows; verified TRUE (temp + contamination + allergen,
   `delivery/route.ts:508-557`). Additionally found: **product-return writes a CA row on EVERY
   POST** (not just deviations — SOP-12 audit trail, `product-return/route.ts:117-135`), and
   **process-room's diary branch writes CA rows with `null` disposition/recurrence**. These are
   not in the roadmap's one-line summary; they are pinned in §7/§8. No scope change — flagging so
   the conductor knows the CA payloads are more heterogeneous than "delivery is the fat one" implies.
2. **Tables-per-sub-domain higher than a 1:1 reading of the roadmap.** mince-prep owns THREE
   tables (`haccp_mince_log` + `haccp_meatprep_log` + `haccp_time_separation_log`) and reads a 4th
   (`haccp_deliveries`); process-room owns TWO (`haccp_processing_temps` + `haccp_daily_diary`);
   cold-storage + delivery each read a config/lookup table (`haccp_cold_storage_units`,
   `haccp_suppliers`). The port surface is therefore wider than "7 tables" — 12 distinct tables in
   PR1 (§2). Consistent with the roadmap's "33 routes · 30 tables" measure; just making the PR1
   slice explicit.
3. **`timesep` (time-separation) never writes a CA row** despite living in the mince-prep route —
   its `corrective_action` is a free-text column on its own row, not a `haccp_corrective_actions`
   insert (`mince-prep/route.ts:585-595`). The CA port is NOT called for timesep. Pinned so PR2
   doesn't accidentally add a CA write.

🗣 **In plain English:** The roadmap's headline ("delivery is the fat one, 7 routes, 30 tables")
is right but rounds off three details: product returns always log a corrective action, the diary
logs blank-field ones, and the time-separation form logs none. The plan captures all three so the
later switch-flip copies today's behaviour exactly. No re-scope needed — these are precision notes,
not new work.

---

## 16. Acceptance criteria

- 18 new files + 5 additive barrel edits exist; NO route / migration / `package.json` /
  `.eslintrc.json` edited.
- `npm run test:unit` green incl. the 6 new files; `npm run typecheck` 0; `next lint` 0.
- Grep proves zero `app/**` consumers of the new wiring/services (dead code).
- Every verbatim select/insert/409-string in §7a/§8 is reproduced char-for-char in the adapters.
- Wiring exports service-role singletons ONLY (no `…ForCaller`); wiring test asserts it.
- Rip-out test PASS; no new dependency; both ports + both adapters present.
