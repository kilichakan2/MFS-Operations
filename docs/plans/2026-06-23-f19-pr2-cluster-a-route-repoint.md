# F-19 PR2 — Re-point the 9 Cluster A HACCP routes onto the daily-checks hexagon

> Date: 2026-06-23 · Author: forge-planner (FORGE Phase 2 — Order)
> FORGE unit: F-19 (Days 13–14, HACCP crunch) · This plan: PR2 of ~10 · Lane: STANDARD
> Status: planned, awaiting Gate 2.
> Spec lock: Gate 1 approved 2026-06-23 — re-point the 9 Cluster A routes onto the
> PR1 hexagon, **BYTE-IDENTICAL behaviour preservation**. Mirror of F-16 / F-17 / F-18 PR2.
> Depends on: PR1 (SHIPPED, PR #68, squash `c724e77`) — the daily-checks + corrective-actions
> hexagon is built, unit-tested, and DEAD. This PR throws the switch.
> Precedent mirrored: F-18 Visits PR2 (`docs/plans/archive/2026-06-22-f-18-pr2-visits-route-repoint.md`).

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ HaccpDailyChecksRepository (port) → [Supabase] (adapter)  ← PR1, reused as-is
  └─ HaccpCorrectiveActionsRepository (port) → [Supabase] (adapter)  ← PR1, reused as-is
  haccpDailyChecksService · haccpCorrectiveActionsService · submitHaccpDailyCheck
    ↑ the 9 routes now import these singletons from lib/wiring/haccp.ts
🗣 PR1 built two clean sockets and plugged Supabase in; the 9 HACCP screens were still hard-wired to the database. PR2 unplugs each screen from the database and plugs it into the socket instead — same output, swappable vendor.
```

🗣 **In plain English:** Today the 9 HACCP route files reach straight into the
database. PR1 built a labelled, tested "daily-checks machine" beside them but left
them untouched. PR2 re-wires each route to call that machine. Nothing a user sees or
does changes — same forms, same errors, same saved data. The only difference is that
the database is now reachable through a single swappable plug instead of being soldered
into every screen.

---

## 1. Goal & guardrails

Re-point **9 route files (16 handlers — 7 GET + 9 POST/PATCH)** off their inline
`supabaseService` calls and onto the three PR1 singletons exported by
`@/lib/wiring/haccp.ts`:
- `haccpDailyChecksService` — the 7 daily-check tables (reads + inserts + validation + builders),
- `haccpCorrectiveActionsService` — the shared CA ledger (admin queue + sign-off),
- `submitHaccpDailyCheck` — the `fileCorrectiveActions(rows, label)` soft-fail filer.

**ZERO behaviour change.** Same wire JSON (keys + values + key order), same DB writes,
same 409/400/401/500 status codes and error-body strings, same `ca_write_failed`
semantics. This is the mirror of F-16/F-17/F-18 PR2.

🗣 **In plain English:** "Byte-identical" = if you photographed every screen response
and every database row before and after this PR, the two photos are pixel-for-pixel the
same. We are moving plumbing, not changing the building.

### Hard constraints (locked at Gate 1 — restated so the implementer cannot drift)

1. **BYTE-IDENTICAL.** Every `.select`/insert/409 string the routes emit today is
   reproduced by the PR1 service/adapter path (the verbatim anchors are pinned in PR1
   §7a/§8 and re-verified against the live adapter constants in §3 below). The route
   keeps building its response literal in the SAME key order it uses today.
2. **W2 — the allergen-gate byte-identity trap (TOP RISK).** Delivery allergen-only
   deviations (temp `pass`, `covered_contaminated:'no'`, but `allergens_identified:true`
   on a meat/poultry category) write the delivery row with
   `corrective_action_required:true` and **ZERO CA rows** today — because the route gates
   the ENTIRE CA block on `(hasDeviationTemp || hasDeviationContam)` at
   `delivery/route.ts:498`. PR1 already reproduced this gate INSIDE
   `buildDeliveryCorrectiveActions` (`HaccpDailyChecksService.ts:970`, `if (!hasDeviationTemp && !hasDeviationContam) return caRows;`).
   The re-point MUST call that builder and MUST NOT re-add an allergen-only CA write.
   See §4.1 and Risk R1.
3. **Service-role wiring ONLY.** Routes import the service-role singletons. **NO**
   `…ForCaller(userId)` factory — per-caller RLS is deferred to **F-RLS-04h** (Cluster G).
   Do not add it (`lib/wiring/haccp.ts` does not export one; do not create one).
4. **Heterogeneity to preserve (PR1 §15):**
   - **product-return writes a CA row on EVERY POST** (SOP-12 audit trail, not just
     deviations) — `buildReturnCorrectiveActions` always returns 1 row.
   - **process-room diary CA rows carry `null` disposition + `null` recurrence** —
     `buildDailyDiaryCorrectiveActions` sets both to `null`.
   - **timesep (time-separation) writes NO CA row** — there is no
     `buildTimeSeparationCorrectiveActions`; do not file CA rows on the timesep branch.
5. **Soft-fail contract.** A CA-insert failure must NOT fail the daily-check submit.
   Each POST: (a) validate via the service, (b) build the persist row via the service,
   (c) insert via the service (this is the row that must succeed), (d) build the CA rows
   via the service, (e) file them via `submitHaccpDailyCheck.fileCorrectiveActions(rows, '<label>')`,
   (f) read `ca_write_failed` off the returned `{ ca_write_failed }` and echo it in the
   response. The use-case logs + swallows a CA-insert error; the daily-check row stays
   committed. Method name verified: `fileCorrectiveActions(rows, label)` returns
   `Promise<{ ca_write_failed: boolean }>`.
6. **Routes drop direct `@supabase/*` imports** for the re-pointed operations. After this
   PR, NO `app/api/haccp/**` route file imports `@/lib/adapters/supabase/client` or names a
   Supabase table. (There is no residual out-of-scope supabase use in these 9 files —
   every DB call in all 9 is in Cluster-A scope, so the import is removed entirely.)
7. **NO migration.** Re-point only. `supabase/migrations/` untouched. Confirmed: no schema,
   no RLS policy, no SQL change — every method already exists in the PR1 adapter.
8. **New tests land now** (PR1 deferred them as dead code): NEW integration tests per
   route, full pgTAP REGRESSION (no new policy surface), E2E `@critical` for the live HACCP
   paths, full prod build. See §6.

### Hexagonal rules (CLAUDE.md "Non-negotiable architecture", ADR-0002)
Routes are presentation (`app/**`): they go via the service/use-case singletons from
`lib/wiring/`, never the adapter, never a vendor SDK. The route keeps only
presentation-edge concerns: cookie role gate, London-day computation (`todayUK()`/
`nowTimeUK()`/`nDaysAgoUK()`/week-window math), range/date query-param parsing, response
assembly. Everything that touches a table or derives a food-safety value moves to the
service path (all of it already lives there from PR1).

---

## 2. Files changed (≈11)

**Edited — route re-points (9):**
1. `app/api/haccp/delivery/route.ts`
2. `app/api/haccp/cold-storage/route.ts`
3. `app/api/haccp/calibration/route.ts`
4. `app/api/haccp/cleaning/route.ts`
5. `app/api/haccp/process-room/route.ts`
6. `app/api/haccp/mince-prep/route.ts`
7. `app/api/haccp/product-return/route.ts`
8. `app/api/haccp/corrective-actions/route.ts` (GET — admin queue)
9. `app/api/haccp/corrective-actions/[id]/route.ts` (PATCH — sign-off)

**Created — NEW integration tests (the byte-identity safety net, 1 file or a folder):**
10. `tests/integration/haccp.test.ts` (or a `tests/integration/haccp/` folder, one
    describe per route — match whatever the repo's existing layout is; `visits.test.ts`
    and `complaints.test.ts` are single-file precedents).

**Created — NEW E2E `@critical` HACCP smoke (extend the existing spec set):**
11. one `@critical` flow per the existing E2E pattern (see §6) — likely added to the
    existing Playwright spec dir rather than a brand-new file; the implementer matches
    the repo's E2E convention.

**NO migration, NO `package.json`, NO domain/port/service/adapter/wiring edit.** The PR1
hexagon is consumed exactly as built. If the implementer finds a service method missing or
mis-shaped for a byte-identical re-point, STOP and report — that is a PR1 gap, not a PR2
edit (PR2 must not change the hexagon).

---

## 3. Verbatim anchors re-verified against the LIVE PR1 code (not just PR1's plan)

These were spot-checked against the shipped adapter + service so the implementer trusts
them:

- **Delivery GET select** = `HaccpDailyChecksRepository.ts:68 DELIVERY_COLS` — matches
  `delivery/route.ts:227-233` char-for-char (incl. `species` and `users!inner(name)`).
- **CA admin-queue selects** = the two strings at `corrective-actions/route.ts:25` and `:32`
  (the `users!actioned_by(name)` / `verifier:users!verified_by(name)` joins) — carried into
  `CorrectiveActionQueueRow` / `CorrectiveActionResolvedRow` and read by
  `haccpCorrectiveActionsService.listVerificationQueue()`.
- **CA sign-off** = `corrective-actions/[id]/route.ts:29-37` `.update({verified_by, verified_at, resolved:true}).eq('id',id).eq('management_verification_required', true)` →
  `haccpCorrectiveActionsService.signOff(id, userId)`. NOTE: the route currently computes
  `verified_at: new Date().toISOString()`; confirm the adapter's `signOff` sets the same
  `verified_at = now` server-side (PR1 §7a pins it). If the adapter takes `verifiedBy` only
  and stamps `verified_at` internally, the route passes `userId` and drops its own ISO call.
- **Delivery allergen gate** = `HaccpDailyChecksService.ts:970` — present, reproduces
  `delivery/route.ts:498`. (W2 confirmed mitigated in PR1.)
- **product-return always-1-CA** = `HaccpDailyChecksService.ts:1817-1847` — always returns
  one row (no deviation gate). Matches `product-return/route.ts:117-135`.
- **diary null-field CA** = `HaccpDailyChecksService.ts:1451-1472` — `product_disposition:null`,
  `recurrence_prevention:null`. Matches `process-room/route.ts:342-344`.
- **timesep no-CA** = no builder exists; `insertTimeSeparation` returns `void`. Matches
  `mince-prep/route.ts:585-595` (free-text `corrective_action` column only).

🗣 **In plain English:** I opened the actual shipped PR1 files (not just its plan) and
confirmed the database calls and the three tricky behaviours are already baked in exactly
as the routes do them today. The re-point is wiring, with no hidden surprises.

---

## 4. Per-route re-point table (every inline DB call/helper → the exact service method)

For each route: which inline DB calls + local helpers it has today, and what replaces them.
Route-local pure helpers (`tempStatus`, `buildBatchNumber`, `deriveTempAction`,
`DISPOSITION_MAP`, etc.) were LIFTED into `HaccpDailyChecksService` in PR1 (byte-identical)
— PR2 **DELETES the route copies** and calls the service. `todayUK()`/`nowTimeUK()`/
`nDaysAgoUK()` + the ISO-week window math STAY in the route (presentation-edge date
computation the service takes as parameters). The role-cookie gate STAYS in every route.

### 4.1 — `app/api/haccp/delivery/route.ts`  (GET + POST)  ← contains W2

**GET:**
| Today | After |
|---|---|
| role gate (cookies) | unchanged (stays in route) |
| `todayUK()` + week/last_week window math | unchanged (stays in route) |
| inline `baseQuery` on `haccp_deliveries` + `haccp_suppliers` (`:225-245`), range filters, ordering, `next_number` count | `const result = await haccpDailyChecksService.listDeliveries(range)` where `range = (searchParams.get('range') ?? 'today')`. Returns `{ date, deliveries, suppliers, next_number }` already shaped. |
| response `{ date, deliveries, suppliers, next_number }` | `return NextResponse.json(result)` — **verify the service computes `next_number` the same way** (`deliveries.filter(d => d.date === today).length + 1`). PR1 §8 says `listDeliveries` returns `DeliveryListResult` incl. `next_number`; if it does not compute it, the route must compute it from `result.deliveries` to stay identical. Confirm at Render. |
| GET DB error → 500 `{error: <pg message>}` | service throws `ServiceError`; route `try/catch` returns its existing 500. Today the body is the raw pg message; the catch returns `'Server error'`. Acceptable per the F-18 R3 posture — the GET catch already returns `'Server error'` and the `.error` branch returned the pg message. Preserve `'Server error'` (the catch path); flag at Gate 3 (Risk R6). |

**POST (byte-identity sensitive — W2):**
| Today (route) | After |
|---|---|
| inline supplier `.single()` lookup (`:313-318`) | `const supplier = supplier_id ? await haccpDailyChecksService.findSupplierForDelivery(supplier_id) : null` |
| inline supplier/product/category/temp/traceability/CA-payload validation cascade (`:306-437`) | build `CreateDeliveryInput` from the body, compute `tempStatus = haccpDailyChecksService.deliveryTempStatus(temperature_c, product_category)`, then `const v = haccpDailyChecksService.validateDelivery({ input, supplier, tempStatus })`; `if (!v.ok) return NextResponse.json({error: v.message}, {status: v.status})`. Verbatim strings live in the service. |
| inline `count` (`:440-443`) | `const deliveryNumber = (await haccpDailyChecksService.countDeliveriesOn(today)) + 1` |
| inline `tempStatus`, `buildBatchNumber`, `DISPOSITION_MAP`, protocol consts, `deriveTempAction`, `deriveContamAction`, `ALLERGEN_CA_CATEGORIES` (**DELETE all of these route-local copies**) | gone — all in the service |
| inline insert into `haccp_deliveries` `.select('id').single()` (`:454-481`) | `const built = haccpDailyChecksService.buildDelivery({ input, userId, today, nowTime: nowTimeUK(), resolvedSupplierId, resolvedSupplierName, deliveryNumber })`; `const { id } = await haccpDailyChecksService.insertDelivery(built.persist)` |
| 23505 → 409 `'Another delivery was logged at the same moment. Please retry.'` | adapter maps 23505→`ConflictError`; route catches `ConflictError`→409 with that exact string (see §5 error mapping) |
| inline CA-row build gated on `(hasDeviationTemp \|\| hasDeviationContam)` + allergen push (`:498-557`) | **`const caRows = haccpDailyChecksService.buildDeliveryCorrectiveActions({ input, userId, sourceId: id, tempStatus: built.tempStatus })`** — the W2 gate is INSIDE this builder. Do NOT re-add the allergen-only push. |
| inline CA insert + `caWriteFailed` (`:559-568`) | `const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'delivery')` |
| response `{ ok, temp_status, corrective_action_required, delivery_number, batch_number, ca_write_failed }` | rebuild the SAME literal in the SAME order: `temp_status: built.tempStatus`, `corrective_action_required: built.persist.corrective_action_required`, `delivery_number: deliveryNumber`, `batch_number: built.persist.batch_number`, `ca_write_failed`. |

🔴 **W2 byte-identity flag:** allergen-only delivery (temp pass, `covered_contaminated:'no'`,
`allergens_identified:true`, meat/poultry) → delivery row `corrective_action_required:true`,
ZERO CA rows, `ca_write_failed:false`. The builder returns `[]`; `fileCorrectiveActions([], …)`
no-ops to `{ca_write_failed:false}`. An integration test MUST pin this exact case.

### 4.2 — `app/api/haccp/cold-storage/route.ts`  (GET + POST)

**GET:** inline units + temps selects (`:114-122`) → `const result = await haccpDailyChecksService.listColdStorage(queryDate)` returning `{ units, readings, date }`. `queryDate` regex-parse stays in the route. `return NextResponse.json(result)`.

**POST:**
| Today | After |
|---|---|
| `Missing required fields` / today-only / unit lookup / `Unknown or inactive unit` / CA-payload validation (`:159-222`) | `const units = await haccpDailyChecksService.listActiveColdStorageUnits()`; build `CreateColdStorageReadingsInput`; compute `hasDeviation` via `buildColdStorage` (below) OR call `validateColdStorage({ input, today, units, hasDeviation })`. **Order matters:** the route validates the unit set BEFORE computing statuses; `validateColdStorage` checks unit membership then the CA payload. Build the persist rows first to get `hasDeviation`, then validate. Confirm the validate/build ordering reproduces the route's 400 precedence (unit-unknown 400 fires before CA-incomplete 400). |
| inline `tempStatus`, `DISPOSITION_MAP`, `VALID_CAUSES`, `PROTOCOLS`, `deriveColdStorageAction` (**DELETE**) | in the service |
| insert N rows `.select('id, unit_id, temperature_c, temp_status')` (`:236-239`) | `const built = haccpDailyChecksService.buildColdStorage({ input, userId, units })`; `const inserted = await haccpDailyChecksService.insertColdStorageReadings(built.rows)` |
| 23505 → 409 `'This session has already been submitted for one or more units.'` | adapter maps; route catches `ConflictError` → 409 (exact string) |
| CA fan-out (one per deviating reading) (`:254-295`) | `const caRows = haccpDailyChecksService.buildColdStorageCorrectiveActions({ input, userId, inserted, units })`; `const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'cold-storage')` |
| response `{ ok, has_deviation, ca_write_failed }` | `has_deviation: inserted.some(r => r.temp_status !== 'pass')` (matches `deviations.length > 0`); same key order |

### 4.3 — `app/api/haccp/calibration/route.ts`  (GET + POST)

**GET:** inline `haccp_calibration_log` select with `.gte('date', 6-months-ago)` (`:47-59`) → `const records = await haccpDailyChecksService.listCalibration()` (the 6-month filter is INSIDE the adapter — PR1 §8). The route still computes `thisMonthUK()` `{from,to}` and derives `done_this_month` + `this_month_count` from `records` (presentation aggregation — STAYS in the route). Response `{ records, done_this_month, this_month_count }`.

**POST (two modes):**
| Today | After |
|---|---|
| `calibration_mode === 'certified_probe'` branch: validate + insert (no id select) (`:93-113`) | build `CreateCalibrationCertifiedInput`; `const v = haccpDailyChecksService.validateCalibrationCertified(input)`; on ok `await haccpDailyChecksService.insertCalibrationCertified(haccpDailyChecksService.buildCalibrationCertified({ input, userId, today, nowTime }))`; response `{ ok: true }` |
| manual branch: validate + ice/boil pass bands + insert `.select('id').single()` (`:115-152`) | `const v = haccpDailyChecksService.validateCalibrationManual(input)`; `const built = haccpDailyChecksService.buildCalibrationManual({...})`; `const { id } = await haccpDailyChecksService.insertCalibrationManual(built)` |
| inline CA write on fail (`:154-180`) | `const caRows = haccpDailyChecksService.buildCalibrationCorrectiveActions({ input, userId, sourceId: id })`; `const { ca_write_failed } = await submitHaccpDailyCheck.fileCorrectiveActions(caRows, 'calibration')` |
| response `{ ok, ice_pass, boil_pass, any_fail, ca_write_failed }` | recompute `ice_pass`/`boil_pass`/`any_fail` — these are returned to the client. The service exposes the pass bands via `buildCalibrationManual` (`ice_water_pass`/`boiling_water_pass` on the persist). Read them off `built` (`ice_pass: built.ice_water_pass`, `boil_pass: built.boiling_water_pass`, `any_fail: !built.ice_water_pass || !built.boiling_water_pass`) to keep one source of truth; same key order. |

### 4.4 — `app/api/haccp/cleaning/route.ts`  (GET + POST)

**GET:** select (`:45-61`) → `const entries = await haccpDailyChecksService.listCleaning()`; response `{ date: today, entries }`.

**POST:**
| Today | After |
|---|---|
| validate (`:97-102`) | `const v = haccpDailyChecksService.validateCleaning(input)` |
| `DISPOSITION_MAP` (cleaning's own set) (**DELETE** — lifted as `CLEANING_DISPOSITION_MAP` in the service) | in the service |
| insert `.select('id').single()` (`:104-117`) | `const { id } = await haccpDailyChecksService.insertCleaning(haccpDailyChecksService.buildCleaning({ input, userId, today, nowTime }))` |
| CA write if `issues` (`:124-147`) | `const caRows = haccpDailyChecksService.buildCleaningCorrectiveActions({ input, userId, sourceId: id })`; file via use-case |
| response `{ ok, ca_write_failed }` | same |

### 4.5 — `app/api/haccp/process-room/route.ts`  (GET + POST temps/diary)  ← diary null-field flag

**GET:** temps + diary selects (`:99-110`) → `const result = await haccpDailyChecksService.listProcessRoom(queryDate)` returning `{ date, temps, diary }`.

**POST type='temps':**
| Today | After |
|---|---|
| validate + product/room pass + CA-payload (`:152-184`) | `const v = haccpDailyChecksService.validateProcessingTemp({ input, today })` |
| `DISPOSITION_MAP`, `VALID_CAUSES`, `PROTOCOLS`, `deriveProcRoomAction` (**DELETE**) | in the service |
| insert `.select('id').single()` (`:187-201`) | `const { id } = await haccpDailyChecksService.insertProcessingTemp(haccpDailyChecksService.buildProcessingTemp({ input, userId }))` |
| 23505 → 409 `'This ${session} check has already been submitted for today.'` | adapter maps; route catches `ConflictError`. **NUANCE:** the 409 string is session-interpolated. Confirm the adapter's `ConflictError` for `insertProcessingTemp` carries enough for the route to rebuild `This ${session} check…`. If the adapter throws a generic `ConflictError`, the route knows `session` from the input and builds the message itself in the catch. Pin the exact message either way. |
| CA fan-out per breached channel (`:214-268`) | `const caRows = haccpDailyChecksService.buildProcessingTempCorrectiveActions({ input, userId, sourceId: id })`; file via use-case |
| response `{ ok, has_deviation, ca_write_failed }` | `has_deviation: !built.within_limits` (matches `!bothPass`) |

**POST type='diary':**
| Today | After |
|---|---|
| validate (`:286-300`) | `const v = haccpDailyChecksService.validateDailyDiary({ input, today })` |
| insert `.select('id').single()` (`:303-314`) | `const { id } = await haccpDailyChecksService.insertDailyDiary(haccpDailyChecksService.buildDailyDiary({ input, userId }))` |
| 23505 → 409 `'${Phase} checks have already been submitted for today.'` | same nuance as temps — phase-interpolated 409 string; route rebuilds in catch from the input `phase` if the adapter throws generic `ConflictError`. |
| 🔴 CA write per failed check, `product_disposition:null` + `recurrence_prevention:null` (`:329-355`) | `const caRows = haccpDailyChecksService.buildDailyDiaryCorrectiveActions({ input, userId, sourceId: id })` — already emits `null` fields. Do NOT supply enum/text values. file via use-case |
| `type` neither temps nor diary → 400 `'Invalid type'` | unchanged (route dispatch) |

### 4.6 — `app/api/haccp/mince-prep/route.ts`  (GET + POST mince/meatprep/timesep)  ← timesep no-CA flag

**GET:** the 3 log selects + the 16-day deliveries select + `mince_batches` map (`:202-268`) →
`const result = await haccpDailyChecksService.listMincePrep(range)` returning
`{ date, mince, meatprep, timesep, deliveries, mince_batches }` (the `mince_batches` projection
is done in the adapter/service per PR1 §8). `range`/`since16`/week-window stays in the route only
if the service needs it as a param; PR1's `listMincePrep(range)` takes the range and computes the
windows internally — confirm and drop the route's window math if so (else keep it and pass dates).

**POST `form==='mince'`:**
| Today | After |
|---|---|
| species/kill-date/temp validation + kill-date hard-fail (`:308-339`) | compute `daysFromKill` in the route (date math, presentation-edge) OR confirm the service takes `kill_date` + `today` and computes it. PR1's `validateMince`/`buildMince` take `daysFromKill` as a param → the route computes `daysFromKill` (it already does, `:317-319`) and passes it. `const v = haccpDailyChecksService.validateMince({ input, daysFromKill })`. **The kill-date hard-fail 400 returns extra keys** `{ error, kill_date_hard_fail:true, days_from_kill }` (`:322-326`) — `validateMince` returns only `{status,message}`, so the route must special-case the hard-fail to add those two keys. Confirm `killDateHardFail` is exposed (`HaccpDailyChecksService.ts` exposes `killDateHardFail` and `killDatePass`) and the route calls it to decide whether to attach the extra keys. |
| `runNum` via `nextRunNumber` (count) (`:341`) | `const runNum = (await haccpDailyChecksService.countMinceRuns('haccp_mince_log', today)) + 1` |
| `buildBatchCode`, temp-pass helpers, `DISPOSITION_MAP`, `deriveMinceTempAction` (**DELETE**) | in the service |
| insert `.select('id').single()` (`:345-368`), 23505→409 `'Duplicate submission — batch code already exists today'` | `const { id } = await haccpDailyChecksService.insertMince(haccpDailyChecksService.buildMince({ input, userId, today, nowTime, daysFromKill, runNum }))`; adapter maps 23505→`ConflictError`→409 (exact string) |
| CA fan-out (`:376-423`) | `const caRows = haccpDailyChecksService.buildMinceCorrectiveActions({ input, userId, sourceId: id })`; file via use-case |
| response `{ ok, batch_code, days_from_kill, kill_pass, has_deviation, ca_write_failed }` | `batch_code: built.batch_code`, `kill_pass: built.kill_date_within_limit`, `has_deviation: !built.input_temp_pass || !built.output_temp_pass`; same key order |

**POST `form==='meatprep'`:**
| Today | After |
|---|---|
| validation incl. `allergenLabelIssue` deviation (`:446-469`) | `const v = haccpDailyChecksService.validateMeatPrep(input)`; `daysFromKill` computed in route (nullable) and passed to `buildMeatPrep` |
| insert `.select('id').single()` (`:480-505`), 23505→409 (same string) | `const { id } = await haccpDailyChecksService.insertMeatPrep(haccpDailyChecksService.buildMeatPrep({ input, userId, today, nowTime, daysFromKill, runNum }))` |
| CA write gated on **temperature only** (NOT allergenLabelIssue) (`:515-560`) | `const caRows = haccpDailyChecksService.buildMeatPrepCorrectiveActions({ input, userId, sourceId: id })` — PR1 comment at `:1700` confirms it gates on temp only. file via use-case |
| response `{ ok, batch_code, has_deviation, ca_write_failed }` | `has_deviation: anyDeviation` — note `anyDeviation` here INCLUDES `allergenLabelIssue` for the response flag, but the CA write does NOT. Recompute `anyDeviation` in the route from the input (`!inPass || !outPass || allergenLabelIssue`) for the response, while the CA rows come from the temp-only builder. **Subtle — pin in an integration test.** |

**POST `form==='timesep'`:**
| Today | After |
|---|---|
| validate (`:578-583`) | `const v = haccpDailyChecksService.validateTimeSeparation(input)` |
| insert (no select, NO CA) (`:585-595`) | `await haccpDailyChecksService.insertTimeSeparation(haccpDailyChecksService.buildTimeSeparation({ input, userId, today, nowTime }))` |
| 🔴 **NO CA write** | do NOT call `fileCorrectiveActions`. There is no timesep CA builder. |
| response `{ ok: true }` | unchanged |
| `form` none of the three → 400 `'Invalid form type'` | unchanged (route dispatch) |
| top-level `body.date && body.date !== today` → 400 `'Records may only be submitted for today\\'s date'` | STAYS in the route (applies before form dispatch) |

### 4.7 — `app/api/haccp/product-return/route.ts`  (GET + POST)  ← always-1-CA flag

**GET:** select (`:35-44`) → `const returns = await haccpDailyChecksService.listReturns()`; response `{ date: today, returns }`.

**POST:**
| Today | After |
|---|---|
| validation incl. RC08/RC01 conditional (`:84-92`) | `const v = haccpDailyChecksService.validateReturn(input)` |
| insert `.select('id').single()` (`:94-110`) | `const { id } = await haccpDailyChecksService.insertReturn(haccpDailyChecksService.buildReturn({ input, userId, today, nowTime }))` |
| 🔴 CA write on EVERY return (`:117-135`) | `const caRows = haccpDailyChecksService.buildReturnCorrectiveActions({ input, userId, sourceId: id })` — ALWAYS returns 1 row. file via use-case. Do NOT add a deviation gate. |
| response `{ ok, ca_write_failed }` | same |

### 4.8 — `app/api/haccp/corrective-actions/route.ts`  (GET — admin queue)

| Today | After |
|---|---|
| `role !== 'admin'` → 401 `'Unauthorised — admin only'` | unchanged (stays in route) |
| two inline selects (unresolved + resolved) (`:22-37`) | `const queue = await haccpCorrectiveActionsService.listVerificationQueue()` returning `{ unresolved, resolved }` |
| response `{ unresolved, resolved }` | `return NextResponse.json(queue)` — verify the service returns the rows with the `users`/`verifier` joins intact (it does; `CorrectiveActionQueueRow`/`CorrectiveActionResolvedRow` carry them) |
| DB error → 500 `{error: <pg msg>}` | service throws `ServiceError`; route catch returns `'Server error'` (preserve; Risk R6) |

### 4.9 — `app/api/haccp/corrective-actions/[id]/route.ts`  (PATCH — sign-off)

| Today | After |
|---|---|
| `role !== 'admin' \|\| !userId` → 401 | unchanged |
| `!id` → 400 `'ID required'` | unchanged (param guard stays in route) |
| inline `.update({verified_by, verified_at: now, resolved:true}).eq('id',id).eq('management_verification_required', true)` (`:29-37`) | `await haccpCorrectiveActionsService.signOff(id, userId)` — the adapter stamps `verified_at = now` + `resolved:true` + the `management_verification_required` filter (PR1 §7a). Confirm and drop the route's `new Date().toISOString()`. |
| response `{ ok: true }` | unchanged |
| DB error → 500 | service throws `ServiceError`; route catch → `'Server error'` (preserve) |

---

## 5. Route-local code to DELETE vs KEEP

**DELETE (now in `HaccpDailyChecksService`, byte-identical — pinned by PR1 unit tests):**
- delivery: `DISPOSITION_MAP`, `VALID_TEMP_CAUSES`, `VALID_CONTAM_CAUSES`, `VALID_CONTAM_TYPES`,
  all `PROTOCOL_*` consts, `PROTOCOL_CONTAM`, `deriveTempAction`, `deriveContamAction`,
  `CATEGORY_BATCH_PREFIX`, `buildBatchNumber`, `tempStatus`, `ALLERGEN_CA_CATEGORIES`, the
  `CAPayload` type, `isMeat` inline logic.
- cold-storage: `DISPOSITION_MAP`, `VALID_CAUSES`, `PROTOCOLS`, `deriveColdStorageAction`,
  `tempStatus`.
- calibration: `CAPayload`, ice/boil pass-band inline logic (now in `buildCalibrationManual`).
- cleaning: `DISPOSITION_MAP` (cleaning set), `CAPayload`.
- process-room: `DISPOSITION_MAP`, `VALID_CAUSES`, `PROTOCOLS`, `deriveProcRoomAction`, `CAPayload`.
- mince-prep: `DISPOSITION_MAP`, `deriveMinceTempAction`, `derivePrepTempAction`, `killDatePass`,
  `killDateHardFail`, `inputTempPass`, `outputTempPass`, `buildBatchCode`, `nextRunNumber`
  (replaced by `countMinceRuns`), `CAPayload`.
- product-return: `isFoodSafety` inline logic (now in `buildReturnCorrectiveActions`).
- the `const supabase = supabaseService` line + the `import { supabaseService }` in all 9.

**KEEP (presentation-edge, route-only):**
- the role-cookie gate in every route (`mfs_role` / `mfs_user_id` cookies + the allow-list).
- `todayUK()`, `nowTimeUK()`, `nDaysAgoUK()`, `thisMonthUK()`, the ISO-week window helpers,
  the `?range=` / `?date=` query-param parsing + regex validation.
- `daysFromKill` date arithmetic in mince/meatprep (passed to the service as a param).
- response-literal assembly + key order; the calibration `done_this_month`/`this_month_count`
  aggregation; the mince `kill_date_hard_fail` extra-keys 400; the meatprep `anyDeviation`
  response flag (incl. allergen) vs temp-only CA gate.

🗣 **In plain English:** Anything that does food-safety maths or talks to the database moves
into the tested machine and the route's copy is deleted. Anything that's about "what time
is it in London" or "which range did the user pick" or "shape the reply" stays at the edge.

---

## 6. Test plan / ANVIL matrix (UPGRADED — routes now go live)

**Unit (regression only — DO NOT add):** the PR1 suite already pins every validation string,
builder payload (incl. the W2 gate, the always-1 return, the null diary fields, the timesep
no-CA), the 23505→`ConflictError` mapping, and the soft-fail contract. PR2 adds NO unit tests;
`npm run test:unit` must stay green (it proves the lifted helpers behave identically).

**Integration (GENUINELY NEW — `tests/integration/haccp.test.ts`):** there is currently NO
HACCP integration spec, so this is the first live coverage. Boots the dev server against local
Supabase (the `.env.test.local` invariant + sentinel probe). Per route, assert the wire shape +
status codes + DB writes are byte-identical to the pre-PR behaviour:
- **delivery POST** — happy non-deviation (0 CA); temp-deviation (1 CA, `management_verification_required` per `fail`); contamination-deviation (1 CA); **🔴 W2 allergen-only** (`corrective_action_required:true`, ZERO CA rows, `ca_write_failed:false`); 3-track case (3 CA rows); 23505→409 exact string; each 400 string; `next_number` correctness; `batch_number` format.
- **delivery GET** — today/week/last_week ranges; `users` join present; ordering.
- **cold-storage POST** — no-deviation (0 CA); N deviating readings → N CA rows; `Unknown or inactive unit` 400 precedence; 23505→409 exact string; today-only 400.
- **calibration POST** — certified mode `{ok:true}`; manual pass; manual fail → 1 CA + `any_fail:true`; pass-band edges (`-1/1`, `99/101`).
- **cleaning POST** — no-issues (0 CA); issues → 1 CA; `issues && !corrective_action` 400.
- **process-room POST temps** — no-deviation; product-only breach (1 CA); room-only breach (1 CA, `management_verification_required: room>15`); both (2 CA); 23505→409 session string; today-only 400.
- **process-room POST diary** — issues with failed checks → N CA rows with **`null` disposition + `null` recurrence**; 23505→409 phase string; `Invalid type` 400.
- **mince POST** — kill-date hard-fail 400 with `{kill_date_hard_fail, days_from_kill}` extra keys; temp deviation → CA rows; 23505→409 exact string; batch-code format.
- **meatprep POST** — temp deviation → CA; **🔴 allergen-label issue → `has_deviation:true` in response but ZERO CA rows**; 23505→409.
- **timesep POST** — `{ok:true}`, **🔴 ZERO CA rows written**.
- **product-return POST** — **🔴 every return writes exactly 1 CA row** (food-safety code → `management_verification_required:true`; non-food-safety → false); RC08/RC01 conditional 400s.
- **corrective-actions GET** — admin queue `{unresolved, resolved}` shape + joins + 401 non-admin.
- **corrective-actions/[id] PATCH** — sign-off sets `verified_at`/`verified_by`/`resolved`; 401 non-admin; `ID required` 400.

**pgTAP (REGRESSION only):** no migration, no new policy → run the existing pgTAP suite green
to prove the RLS/policy surface is unchanged. State explicitly to ANVIL: no NEW pgTAP because
no schema/policy change.

**E2E `@critical` (NEW live HACCP path):** add at least one `@critical` flow exercising a
real deviation submit end-to-end (e.g. delivery temp-deviation → CA filed → appears in the
admin corrective-actions queue → admin sign-off), plus one happy-path log submit. Match the
existing Playwright `@critical` convention; runs against the PR's Supabase preview branch at
Gate 4 (`npm run test:e2e:preview`).

**Full prod build:** `next build` clean; `npm run typecheck` 0; `next lint` 0;
`tests/unit/lint/no-adapter-imports.test.ts` green; `npm run test:integration` green.

🗣 **In plain English:** Because these screens now go live through the new machine, we need
real end-to-end proof — not just the fast fake-database unit tests. The integration tests
re-create each form submission against a real local database and check the saved rows and the
JSON reply match exactly. The three trick cases (allergen-only delivery, always-on return CA,
timesep no-CA) each get their own pinning test. pgTAP just re-confirms nothing about the
database locks moved, because we changed no SQL.

---

## 7. Hexagonal verdict (Gate 2)

- **Port:** USES the two existing ports (`HaccpDailyChecksRepository`,
  `HaccpCorrectiveActionsRepository`) via the three PR1 singletons. **No port added or changed.**
- **Adapter:** none added or changed. The two PR1 Supabase adapters remain the sole `@supabase/*`
  importers for these 13 tables; PR2 does not touch them.
- **New dependencies:** **NONE.** `package.json` untouched. No vendor SDK enters a route.
- **Single-use vendor wrap:** N/A — no new vendor; Supabase already wrapped in the adapters.
- **Rip-out test:** **PASS (now fully realised).** Before PR2 the 9 routes each imported
  `supabaseService` directly (the rip-out cost was "9 route files + the adapter"). After PR2 the
  routes depend ONLY on the `lib/wiring/haccp.ts` singletons; swapping the DB vendor for HACCP
  Cluster A = one new adapter per port + the two wiring lines in `lib/wiring/haccp.ts`, nothing in
  `app/**` changes. PR1 built the seam; PR2 collects the rip-out win.

**Verdict line:** Ports: 2 reused, 0 new. Adapters: 0 new. New deps: 0. Rip-out: **PASS**.
**Gate 2: PASS — no blocker.**

🗣 **In plain English:** No new sockets, no new plugs, no new vendors. The win this PR banks:
before, ripping out the database meant editing 9 screen files; after, it's one adapter swap plus
two wiring lines. That's the "build it like Lego" promise actually delivered for HACCP.

---

## 8. Risk Assessment (mandatory)

**Headline: NO must-fix risks. No Gate-2 blocker.** The risk surface is byte-identity drift on a
live re-point; every sharp edge is pinned by a PR1 unit test plus a NEW integration test.

| # | Category | Severity | Finding | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| **R1** | **Business-logic / byte-identity (W2 allergen gate)** | **MEDIUM** | An allergen-only delivery must write the delivery row with `corrective_action_required:true` but ZERO CA rows. If the route re-adds an allergen CA push outside the `(temp\|\|contam)` gate, or the builder's gate regresses, allergen-only deliveries would suddenly file CA rows — silent data change. | The gate lives INSIDE `buildDeliveryCorrectiveActions` (`HaccpDailyChecksService.ts:970`, verified live). The route calls the builder and adds NO allergen logic of its own. A dedicated integration test pins `{corrective_action_required:true, CA rows:0}`. PR1 unit test already covers both sides. | **No** (mitigated; flagged as #1 watch item) |
| R2 | **Business-logic (soft-fail contract)** | MEDIUM | A CA-insert failure must NOT 500 the daily-check submit; the response must carry `ca_write_failed:true` and the daily-check row stays committed. If a route awaits `fileCorrectiveActions` without catching, or files CA before the daily-check insert, a deviation submit that succeeds today could 500. | Every POST inserts the daily-check row FIRST, then calls `fileCorrectiveActions(rows, label)` which logs+swallows. The route echoes the returned `ca_write_failed`. PR1 use-case test pins "CA fails → `ca_write_failed:true`, no throw". | No |
| R3 | **Business-logic (heterogeneity)** | MEDIUM | Three non-uniform behaviours could regress: product-return always-1-CA, diary null-field CA, timesep no-CA; plus meatprep's response `has_deviation` includes allergen-label while its CA gate is temp-only. | Each is owned by a distinct service builder (or absence of one). §4.5/4.6/4.7 pin them; three dedicated integration tests assert exactly these. | No |
| R4 | **Business-logic (409 message interpolation)** | LOW | process-room temps/diary 409 strings interpolate `session`/`phase`; mince/delivery/cold-storage 409s are static. If the adapter throws a generic `ConflictError`, the route must rebuild the interpolated string from the input. | §4.5 pins the exact strings; the route rebuilds from its known `session`/`phase` in the `ConflictError` catch. Integration tests assert each exact 409 body. | No |
| R5 | **Concurrency / race** | LOW | `delivery_number` / mince `runNum` are COUNT-then-insert (TOCTOU); the DB unique indexes catch the race → 23505 → `ConflictError` → clean 409. Unchanged by the re-point. | Adapter already maps 23505 (PR1); pre-existing race semantics frozen (ADR-0003, diff-only). | No |
| R6 | **Error-body drift on DB-failure 500s** | LOW | GET/PATCH DB failures today surface the raw pg message via the `.error` branch; the service throws `ServiceError` and the route catch returns `'Server error'`. The exact 500 body could shift from a pg string to `'Server error'`. | Front-end does not display these 500 bodies (they were already inconsistent — some routes return the pg message, the catch returns `'Server error'`). Preserve the catch's `'Server error'`; flag to Gate 3 for a one-line decision (same posture as F-18 R3). | No |
| R7 | **Security** | LOW | Same service-role (RLS-bypass) posture as today; the role-cookie gate stays in every route; no per-caller RLS added (deferred to F-RLS-04h). No widening — the admin-only gate on corrective-actions stays in the route. | Wiring exports service-role singletons only; no `…ForCaller` exists. | No |
| R8 | **Data migration** | NONE | No schema/SQL/RLS change. `supabase/migrations/` untouched. | n/a | No |
| R9 | **Launch blocker** | NONE | First live HACCP behaviour change, but byte-identical. Gates: full integration + pgTAP regression + E2E `@critical` + preview smoke before merge. | §6 matrix; Gate 4 preview smoke. | No |

🗣 **In plain English:** Nothing here forces a redesign. The job is precision wiring: keep the
allergen-only delivery from suddenly filing paperwork, keep a failed corrective-action write
from sinking a saved form, and keep the three odd-one-out behaviours (returns always log,
diary logs blanks, time-separation logs nothing) exactly as they are. Each is pinned by a test.
No blocker stands between this plan and Gate 2.

---

## 9. ADR check

- **ADR-0002 (hexagonal shape + naming)** — GOVERNING. Honoured: routes (`app/**`) call the
  service/use-case singletons from `lib/wiring/`, never the adapter, never `@supabase/*`. No
  vendor type leaks past the adapter. No conflict.
- **ADR-0003 (strangler-fig + FREEZE)** — followed: diff-only review scope; pre-existing race
  semantics + pre-existing error-body quirks frozen; the re-point is behaviour-preserving.
- **ADR-0004 / ADR-0007 (RLS mechanism / token-GUC bridge)** — out of scope, correctly deferred
  to **F-RLS-04h** (Cluster G). `lib/wiring/haccp.ts` exports service-role singletons only; no
  per-caller authenticated client is added. No conflict.
- **ADR-0005 (raw-fetch Per-Site Map)** — **NO conflict, NO inheritance.** The Per-Site Map
  assigns NO `app/api/haccp/**` route (HACCP already used `supabaseService`, never raw `fetch`),
  so there is nothing to inherit — confirmed in PR1 §14. (Positive: HACCP is simpler than
  Cash/Complaints on this axis.)
- **ADR-0006 (per-PR Supabase preview branches)** — the Gate-4 `@critical` preview smoke runs
  against this PR's preview branch.

**No ADR conflicts.**

---

## 10. Scope discrepancies found (PR1 pins vs real route code, as it stands now)

Re-checked the live route code against PR1's pins. All three PR1 heterogeneity flags are
accurate; additional precision notes for the implementer (no re-scope):

1. **calibration GET 6-month filter lives in the adapter, not the route after re-point.** The
   route's `.gte('date', 6-months-ago)` (`:57-58`) is folded into `listCalibration()` (PR1 §8).
   The route still computes `thisMonthUK()` to derive `done_this_month`/`this_month_count` from
   the returned records — that aggregation STAYS in the route. Flag so the implementer does not
   try to pass a date range to `listCalibration()` (it takes none).
2. **mince kill-date hard-fail 400 returns THREE keys, not just `error`.** `validateMince`
   returns `{status,message}` only; the route must detect the hard-fail (via the exposed
   `killDateHardFail(species, daysFromKill)`) and attach `kill_date_hard_fail:true` +
   `days_from_kill` to the 400 body to stay byte-identical (`:322-326`). Not a service change —
   a route-edge response-assembly detail.
3. **meatprep response `has_deviation` ≠ CA-write gate.** The response flag includes the
   allergen-label issue (`!inPass || !outPass || allergenLabelIssue`), but `buildMeatPrepCorrectiveActions`
   gates on temperature only (PR1 `:1700`). The route recomputes `anyDeviation` for the response
   while the CA rows come temp-only. Pinned in the meatprep integration test.
4. **PATCH sign-off `verified_at` ownership.** The route computes `new Date().toISOString()`
   today; after re-point the adapter should stamp it (PR1 §7a). Confirm `signOff(id, verifiedBy)`
   sets `verified_at`/`resolved` internally; if it does NOT, that is a PR1 gap to report, not a
   PR2 workaround.

🗣 **In plain English:** Four small "watch the edges" notes — the calibration date filter moved
into the machine, the mince hard-fail reply carries two extra fields, meatprep's "deviation?"
reply flag is broader than what triggers paperwork, and the sign-off timestamp should now be
stamped by the machine. None of these change scope; they keep the reply byte-for-byte the same.

---

## 11. Step-by-step build sequence (executable blind)

1. **Branch** off `main` (e.g. `f19-pr2-cluster-a-route-repoint`).
2. Re-point the **two simplest routes first** as the pattern template:
   `cleaning/route.ts` then `product-return/route.ts` (single table, one CA path / always-CA).
   For each: replace `import { supabaseService }` with imports of the singletons from
   `@/lib/wiring/haccp`; delete the route-local helpers/consts listed in §5; rewrite GET + POST
   per §4; keep the role gate + date helpers + response key order.
3. Re-point `cold-storage`, `calibration`, `process-room` (temps + diary).
4. Re-point `delivery` (W2) — call `buildDeliveryCorrectiveActions`; add NO allergen logic.
5. Re-point `mince-prep` (the big one — 3 forms; mind the kill-date hard-fail extra keys, the
   meatprep temp-only CA gate, and the timesep no-CA branch).
6. Re-point `corrective-actions` GET + `[id]` PATCH onto `haccpCorrectiveActionsService`.
7. After each route: confirm NO `@supabase/*` import and NO table name remains in the file.
8. Write `tests/integration/haccp.test.ts` per §6 (boot local Supabase: `npm run db:up`,
   `npm run db:reset`). Run `npm run test:integration` → green.
9. Add the E2E `@critical` HACCP flow(s) per the repo convention.
10. Run the full bar: `npm run test:unit` (regression green), `npm run typecheck` 0,
    `next lint` 0, `tests/unit/lint/no-adapter-imports.test.ts` green, `next build` clean,
    pgTAP regression green.
11. Grep-confirm `grep -rl "@/lib/adapters/supabase/client\|from('haccp" app/api/haccp/` returns
    nothing (all 9 routes dropped the direct import and table calls).

🗣 **In plain English:** Start with the two easiest forms to lock the pattern, then work up to
delivery and mince-prep (the tricky ones), finish with the admin queue, then prove it with the
new live tests and a clean build.

---

## 12. Acceptance criteria

- All 9 route files re-pointed onto the `lib/wiring/haccp.ts` singletons; NO route imports
  `@supabase/*` or names a `haccp_*` table; the route-local helpers/consts in §5 are deleted.
- NO migration, NO `package.json`, NO domain/port/service/adapter/wiring edit.
- `npm run test:unit` green (regression); NEW `tests/integration/haccp.test.ts` green incl. the
  W2 allergen-only case, the always-1 return CA, the diary null fields, the timesep no-CA, and
  the meatprep allergen-deviation-but-no-CA case; pgTAP regression green; E2E `@critical` green;
  `next build` / `typecheck` 0 / `next lint` 0; `no-adapter-imports` lint test green.
- Every verbatim select/insert/409/400 string from §4 reproduced byte-for-byte (wire JSON keys +
  order + values, status codes, `ca_write_failed` semantics identical to pre-PR).
- Wiring still exports service-role singletons ONLY (no `…ForCaller`).
- Rip-out test PASS; no new dependency; no port/adapter added.
- Gate-4 preview smoke green against the PR's Supabase preview branch.
