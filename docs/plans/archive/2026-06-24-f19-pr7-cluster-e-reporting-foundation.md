# F-19 Cluster E — PR7 (foundation only): HACCP cross-domain reporting hexagon

- **Date:** 2026-06-24
- **Feature:** F-19 Cluster E, PR7 of the two-step rhythm (PR7 = introduce-only foundation, PR8 = re-point, planned separately later)
- **Phase:** FORGE Order → plan for Render
- **Branch suggestion:** `f19-pr7-cluster-e-reporting-foundation`

> 🗣 **In plain English:** Six admin "reporting" screens (today's status tiles, the weekly/monthly overview, the annual SALSA review data panels, the audit heatmap, the per-section audit tables, and the Excel export) each currently reach straight into the database and one reaches straight into the Excel library. This PR builds the clean "sockets and plugs" those screens will plug into later — it does **not** move the screens yet, and it touches **no** database migration. PR8 (a separate later PR) flips the screens over.

---

## Mini-map

```
DOMAIN (HACCP reporting core logic)
  ├─ HaccpReportingRepository (port) → [Supabase] · [Fake]   (adapters)
  └─ SpreadsheetExporter (port)      → [xlsx]                 (adapter)
🗣 Two new sockets: "read the HACCP tables" + "turn rows into an Excel file". PR7 builds sockets+plugs; PR8 moves the 6 screens onto them.
```

---

## Goal

Introduce the hexagonal foundation for the 6 read-only HACCP reporting routes **without editing any route and without any DB migration**. After PR7, the new ports/adapters/service/wiring exist and are fully unit-tested, but have **zero callers** — exactly like every prior cluster's first PR (PR1/PR3/PR5).

The service must reproduce each route's **current response shape byte-for-byte** so that PR8 becomes a pure re-point with no behaviour change. The unit tests written here are the safety net PR8 leans on.

> 🗣 **In plain English:** Build the new plumbing, prove with tests that the new plumbing produces the exact same output the screens already return, but don't connect the screens to it yet. That keeps the risky "flip the switch" step (PR8) small and provably safe.

---

## Domain terms (plain-English glossary for this plan)

- **Port** (`lib/ports/`) — a socket the app owns, described in business words, no vendor mentioned. 🗣 The shape the business insists on; vendors must fit it.
- **Adapter** (`lib/adapters/<vendor>/`) — the plug for one specific vendor; the only place that vendor's SDK is imported. 🗣 The actual plug; Supabase gets one, the fake gets one, xlsx gets one.
- **Service** (`lib/services/`) — business logic that depends on ports only, never on a vendor. 🗣 The brain; it knows the rules but not where data lives.
- **Wiring** (`lib/wiring/haccp.ts`) — the one business-layer file allowed to import adapters; it bolts plugs into sockets and exports ready-to-use singletons. 🗣 The fuse box.
- **AOA (array-of-arrays)** — a sheet expressed as rows, each row an array of cells. 🗣 A grid of values, exactly what a spreadsheet is under the hood.
- **Shaping/aggregation** — the tally/inference/grid-building logic currently sprawled in the routes (status inference, missing-days, heatmap grids, SALSA section blocks, the 13-sheet assembly). 🗣 Turning raw rows into the numbers and structures the screen shows.

---

## Compliance flags

- **HACCP food-safety records** — this is a UK food-safety compliance domain (SALSA audit). The data is read-only here, but **the export and audit views are what an auditor sees**. A wrong tally, a dropped sheet, or a mis-mapped label is a compliance-integrity defect, not just a cosmetic one. The byte-identical requirement is therefore a **safety** requirement, not only a hygiene one.
- **PII** — `complaints`, `haccp_health_records` (visitor names, illness types, exclusion reasons) and `users.name` flow through these reads. PR7 introduces no new exposure (no route reads change), but the new code must not widen what is read beyond what the routes already read.

---

## ADR review & conflicts

Read: ADR-0002 (hexagonal shape & naming), ADR-0003 (strangler-fig + FREEZE rule), ADR-0004 (RLS vs service-role).

- **ADR-0002** — honoured. New port in `lib/ports/`, adapters in `lib/adapters/<vendor>/`, service depends on ports only, wiring is the sole adapter-importer. Vendor types (`SupabaseClient`, `XLSX.WorkSheet/WorkBook`) never leak past the adapter boundary.
- **ADR-0003 (FREEZE)** — honoured. `@supabase/supabase-js` and `xlsx` are both confined to `lib/adapters/<vendor>/`. The `xlsx` import currently living in `app/api/haccp/audit/export/route.ts` is being given its owned home (the route keeps its copy until PR8 — that's fine, PR7 is introduce-only).
- **ADR-0004 (RLS vs service-role)** — honoured. **Service-role ONLY.** No `…ForCaller(userId)` per-request authenticated factory is added — that is deferred to F-RLS-04h / Cluster G, exactly as every prior cluster deferred it. Wiring singletons use `supabaseService`, matching the access the 6 routes have today, so PR8 is byte-identical.

**No ADR conflicts.** One ADR-adjacent housekeeping item is **required** (not a conflict): the ESLint vendor-confinement allow-list must gain `xlsx` (see Step 8). Without it, `XlsxSpreadsheetExporter.ts` would itself fail lint. There is currently **no** `no-restricted-imports` entry banning `xlsx` outside its adapter — F-27 (extend confinement to all vendors) has not yet covered `xlsx`. Adding the ban + the allow-list entry in this PR is the correct hexagonal move and closes that gap.

> 🗣 **In plain English:** The rulebook says "only the adapter folder may touch a vendor library." Right now there's no rule stopping random files from importing the Excel library, and no permission slip for our new adapter either. We add both in this PR: the ban (so nobody imports xlsx elsewhere) and the permission slip for our one adapter folder.

---

## Architecture decision (locked, per spec — Ousterhout)

- **ONE deep `HaccpReportingRepository` port**, not six per-route ports and not extensions of the 7 existing daily-check write-ports. The six reporting reads are cross-table aggregators that don't map onto any single write-domain, so they get their own read-only reporting port. 🗣 One fat socket for "give me the reporting rows," not six thin ones.
- **Generic `SpreadsheetExporter` port** — no HACCP word in it. Reusable for any future export. 🗣 A generic "rows → Excel file" socket, not a HACCP-specific one.
- **Adapter does reads only; service does all shaping.** The Supabase adapter returns typed raw-ish row collections; the service holds every tally, inference, date-grid, SALSA block, and the 13-sheet assembly. This is what makes the routes thin in PR8. 🗣 The plug just fetches rows; the brain does the maths.

---

## Files to change (exact paths)

**New files (7 source + tests):**

1. `lib/ports/SpreadsheetExporter.ts` — generic export port (NEW)
2. `lib/ports/HaccpReportingRepository.ts` — deep read-only reporting port (NEW)
3. `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts` — xlsx adapter, factory + singleton (NEW)
4. `lib/adapters/xlsx/index.ts` — adapter barrel (NEW)
5. `lib/adapters/supabase/HaccpReportingRepository.ts` — Supabase adapter, factory + singleton (NEW)
6. `lib/adapters/fake/HaccpReportingRepository.ts` — in-memory fake, factory + singleton (NEW)
7. `lib/services/HaccpReportingService.ts` — service factory (NEW)
8. `lib/domain/HaccpReporting.ts` — owned reporting domain types (NEW; the row-collection shapes + the response shapes)

**Edited files (barrels + wiring + lint — additive only):**

9. `lib/ports/index.ts` — add the two new port type exports
10. `lib/services/index.ts` — add the new service factory + type exports
11. `lib/adapters/supabase/index.ts` — add the new adapter factory + singleton exports
12. `lib/adapters/fake/index.ts` — add the new fake factory + singleton + types
13. `lib/domain/index.ts` — add the new reporting domain type exports
14. `lib/wiring/haccp.ts` — add the new service singleton(s), service-role only
15. `.eslintrc.json` — add `xlsx` to the `no-restricted-imports` ban + add `lib/adapters/xlsx/**/*.ts` to the allow-list override

**New test files:**

16. `tests/unit/services/HaccpReportingService.test.ts` — shaping parity tests (the PR8 safety net)
17. `tests/unit/adapters/XlsxSpreadsheetExporter.test.ts` — round-trip buffer test
18. (extend) `tests/unit/lint/no-adapter-imports.test.ts` is already generic; no change expected, but verify it still passes.

**Explicitly NOT changed:** none of the 6 route files; no `supabase/migrations/**`; no `app/**`; no `components/**`. No new `package.json` entry (`xlsx@^0.18.5` already present).

> 🗣 **In plain English:** Eight brand-new files (the sockets, the plugs, the brain, and the owned data shapes), six small additive edits to "index" files and the fuse box, one rulebook edit, and two test files. Zero screen files and zero database changes.

---

## Chosen method signatures & return types

### `lib/ports/SpreadsheetExporter.ts`

```ts
/** One sheet: a name + a grid of cells (array-of-arrays). Cells are the
 *  primitives a spreadsheet stores — string | number | boolean | null. */
export type SheetCell = string | number | boolean | null;
export interface SheetSpec {
  readonly name: string;                       // becomes the worksheet tab name
  readonly rows: ReadonlyArray<ReadonlyArray<SheetCell>>;  // row 0 = headers, by convention of the caller
  /** Optional column widths, in xlsx "wch" character units. Vendor-neutral:
   *  the adapter maps these to xlsx's `!cols`. Omit to let the vendor default. */
  readonly columnWidths?: readonly number[];
}

export interface SpreadsheetExporter {
  /** Build a single workbook from an ordered list of named sheets and return
   *  the binary xlsx buffer. Pure: no I/O, no download, no filesystem.
   *  Sheet order is preserved. Throws nothing app-specific (let a vendor error
   *  bubble; callers wrap). */
  toXlsxBuffer(sheets: readonly SheetSpec[]): Buffer;
}
```

> 🗣 **In plain English:** The export socket takes "here are my tabs, each tab is a grid of values (plus optional column widths)" and hands back the raw bytes of an .xlsx file. It says nothing about HACCP, so any other part of the app could reuse it.
>
> **Design notes:** `columnWidths` is included because the current export route sets `ws['!cols']` per sheet and we must preserve that exactly (byte-identical). Carrying it as a vendor-neutral `number[]` keeps the `!cols` xlsx detail inside the adapter. `toXlsxBuffer` is synchronous because the underlying `XLSX.write` is synchronous — keeping it sync avoids a fake-vs-real async mismatch. (If the build environment objects to `Buffer` in a pure-TS port, fall back to `Uint8Array` as the return type and have the adapter return `XLSX.write(...)` which already yields a Buffer that is a Uint8Array — decide at implementation against the tsconfig `lib`. **Default: `Buffer`**, since the route already passes the xlsx buffer straight to `NextResponse` and uses `.length`.)

### `lib/ports/HaccpReportingRepository.ts`

One method per route. Each returns **raw-ish typed row collections** (the adapter does the multi-table reads + the per-table CA-merge fetches; the service does all tallying/inference/grid/sheet-assembly). Return types live in `lib/domain/HaccpReporting.ts`.

```ts
export interface HaccpReportingRepository {
  /** today-status route: 12 today/period-scoped reads. The adapter runs the
   *  Promise.all of 12 selects and returns each table's rows as-is. The service
   *  does ALL tile inference + overdue-clock logic. */
  fetchTodayStatus(today: string, weekStart: string, monthStart: string): Promise<TodayStatusData>;

  /** overview route: 10 range-scoped reads (deliveries, cold, processing, diary,
   *  cleaning, mince, meatprep, returns, calibration, corrective_actions). */
  fetchOverview(from: string, to: string): Promise<OverviewData>;

  /** annual-review/data route: 15 reads incl. non-HACCP `complaints`. Some are
   *  current-state (training, suppliers, specs, units, food-fraud, food-defence),
   *  some are period-filtered (health, cleaning, deliveries, returns, complaints,
   *  CA). The adapter returns all collections; the service does the dedup +
   *  SALSA section assembly. NOTE: the period-filtered reads only fire when
   *  from&to are present — the adapter mirrors that (pass nullable from/to). */
  fetchAnnualReviewData(from: string | null, to: string | null): Promise<AnnualReviewRawData>;

  /** audit/heatmap route: 7 range-scoped lightweight reads. Service builds the
   *  per-section DayMap grids. */
  fetchAuditHeatmap(from: string, to: string): Promise<AuditHeatmapRawData>;

  /** audit route: ONE section per call (11 sections). The adapter runs the
   *  section's read(s) + its CA-merge fetch and returns the raw rows + CA map.
   *  Service does the row-merge, summary counts, and per-section heatmap. */
  fetchAuditSection(section: string, from: string, to: string): Promise<AuditSectionRawData>;

  /** audit/export route: 14 reads feeding 13 sheets. Adapter returns all raw row
   *  collections + their CA maps; service assembles the 13 SheetSpec arrays. */
  fetchAuditExportData(from: string, to: string): Promise<AuditExportRawData>;
}
```

> 🗣 **In plain English:** Six "give me the rows for screen X" methods. The plug fetches; the brain decides what the numbers mean. The annual-review one takes nullable dates because that screen genuinely skips some reads when no date range is given — we keep that behaviour exactly.
>
> **Return-type strategy (key decision):** Rather than invent a hand-typed interface for all ~40 table reads up front (high risk of a field drift breaking byte-identity), each `…RawData` type is defined as **`readonly` arrays of `Record`-ish row types that mirror exactly the `.select(...)` column list of the current route**, plus the joined `users.name` shaped as the route shapes it. The implementer captures these by copying each route's `.select()` string and typing the returned row to those columns. The CA-merge maps (audit + export) are carried as `Record<string, CaRow>` keyed by `source_id`, identical to the routes' `casMap`. **The shaping logic moved into the service is the verbatim code from each route** — same filters, same `?? '—'` fallbacks, same label maps, same sort orders.

### `lib/services/HaccpReportingService.ts`

```ts
export interface HaccpReportingServiceDeps {
  readonly reporting: HaccpReportingRepository;
  readonly spreadsheet: SpreadsheetExporter;
}

export interface HaccpReportingService {
  getTodayStatus(now: Date): Promise<TodayStatusResponse>;          // tiles + overdue clock
  getOverview(from: string, to: string): Promise<OverviewResponse>;
  getAnnualReviewData(from: string | null, to: string | null): Promise<AnnualReviewResponse>;
  getAuditHeatmap(from: string, to: string): Promise<AuditHeatmapResponse>;
  getAuditSection(section: string, from: string, to: string): Promise<AuditSectionResponse>;
  /** Reads via repo, assembles the 13 SheetSpec arrays, calls
   *  spreadsheet.toXlsxBuffer, returns the buffer. Does NOT set HTTP headers or
   *  the filename — that stays in the route (PR8). */
  buildAuditWorkbook(from: string, to: string): Promise<Buffer>;
}

export function createHaccpReportingService(deps: HaccpReportingServiceDeps): HaccpReportingService;
```

> 🗣 **In plain English:** The brain exposes one method per screen. Each returns exactly the JSON the screen returns today (a `…Response` type that mirrors the current route response). `buildAuditWorkbook` returns just the bytes; the filename and download headers stay in the route so PR7 changes no route.
>
> **`getTodayStatus(now: Date)` takes the clock as an argument** so the overdue-cutoff logic (`nowHour`, "Friday after 17:00", "last day of month") is **testable deterministically** against the fake. The route currently calls `new Date()` inline 5+ times; in the service those all derive from the single injected `now`. PR8's route passes `new Date()`. This is the one allowed *internal refactor* and must be proven byte-identical for a fixed `now`. ⚠️ See Risk B2.

---

## Numbered implementation steps (TDD order)

**Step 0 — capture the response-shape snapshots (do this first).** For each of the 6 routes, write down the exact response object keys/structure from the route files (already captured in this plan's appendix). These become the assertions in `HaccpReportingService.test.ts`. 🗣 Write down the "correct answer" before building, so the tests are the contract.

**Step 1 — `lib/domain/HaccpReporting.ts`.** Define the raw-row collection types (mirroring each route's `.select()` columns) and the `…Response` types (mirroring each route's response object). Pure TS, no vendor imports. Export from `lib/domain/index.ts`.

**Step 2 — `lib/ports/SpreadsheetExporter.ts`** (port) + add to `lib/ports/index.ts`. Pure TS.

**Step 3 — `lib/ports/HaccpReportingRepository.ts`** (port) + add to `lib/ports/index.ts`. Imports domain types only.

**Step 4 — write the failing unit tests** (`HaccpReportingService.test.ts` + `XlsxSpreadsheetExporter.test.ts`). Red first.

**Step 5 — `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts`** + `index.ts`. The ONLY place `xlsx` is imported. Implements `toXlsxBuffer`: `XLSX.utils.book_new()`, loop sheets → `aoa_to_sheet(rows)`, apply `columnWidths`→`ws['!cols']`, `book_append_sheet(wb, ws, name)`, return `XLSX.write(wb, {type:'buffer', bookType:'xlsx'})`. Factory `createXlsxSpreadsheetExporter()` + singleton `xlsxSpreadsheetExporter`.

**Step 6 — `lib/services/HaccpReportingService.ts`.** Move the shaping logic VERBATIM from the 6 routes into the service methods. The 13-sheet assembly in `buildAuditWorkbook` reproduces the exact header arrays, label maps, `!cols` widths, and sheet names/order from `audit/export/route.ts`. Export factory from `lib/services/index.ts`. **Factory only — no singleton here.**

**Step 7 — `lib/adapters/supabase/HaccpReportingRepository.ts`.** Copy each route's `.select(...)` strings and query chains VERBATIM (so wire output is byte-identical after PR8). Map vendor rows to the domain row-collection types at the return boundary. Factory + `supabaseHaccpReportingRepository` singleton wired to `supabaseService`. Add to `lib/adapters/supabase/index.ts`.

**Step 8 — `.eslintrc.json`.** Add the `xlsx` ban to BOTH `no-restricted-imports` blocks (top-level + the services/usecases override) with a message pointing at the `SpreadsheetExporter` port, and add `"lib/adapters/xlsx/**/*.ts"` to the allow-list override `files` array. 🗣 Add the rule that bans the Excel library everywhere, and the permission slip for the one adapter folder.

**Step 9 — `lib/adapters/fake/HaccpReportingRepository.ts`.** In-memory, seedable fake mirroring `HaccpReviewsRepository.ts`'s fake pattern (seed fixtures per method; test-inspectable). Factory + singleton + `Fake…Seed` type. Add to `lib/adapters/fake/index.ts`. Also provide a **fake/real SpreadsheetExporter** for the service tests — recommend using the **real** `XlsxSpreadsheetExporter` in the `buildAuditWorkbook` test (so the buffer is genuinely parseable) and a trivial spy exporter where only the `SheetSpec[]` input matters.

**Step 10 — `lib/wiring/haccp.ts`.** Add:
```ts
export const haccpReportingService: HaccpReportingService =
  createHaccpReportingService({
    reporting: supabaseHaccpReportingRepository,
    spreadsheet: xlsxSpreadsheetExporter,
  });
```
Service-role only. INTRODUCE-ONLY: no caller. Update the file's header comment to note PR7 mirroring PR1/PR3/PR5. NO `…ForCaller`.

**Step 11 — go green.** Run typecheck, lint, the two new unit suites, and the full unit suite. Build.

> 🗣 **In plain English:** Write the "correct answer" tests first, build the sockets, then the plugs, then move the maths into the brain, prove the tests pass. The Excel adapter is built and tested against a real round-trip so we know the bytes are valid.

---

## TDD test plan (ANVIL executes)

PR7 is introduce-only → **unit-level + green build**. No integration/E2E changes because **no route is touched** (state this explicitly in the ship record).

### `tests/unit/services/HaccpReportingService.test.ts` — the PR8 safety net
For each of the 6 methods, seed the fake repo with representative fixtures and assert the service output **equals the exact shape the current route returns**:

1. **`getTodayStatus`** — fix `now` to a known date/time (e.g. a Friday 17:30 in Europe/London). Assert every key: `cold_storage.{am_done,pm_done,am_overdue,pm_overdue}`, `processing_room.*`, `daily_diary.*` (incl. the three `_overdue` clocks), `cleaning.{count_today,has_issues_today,overdue,last_logged_at}`, `deliveries`, `mince_runs`, `product_returns` (incl. the `RC01/RC02/RC04/RC05` safety set), `corrective_actions.open`, the calibration trio, `weekly_review_*`, `monthly_review_*`, `training_overdue`, `training_due_soon`, `total_checks`, `completed_checks`. Add a second case at a morning hour to flip the overdue booleans.
2. **`getOverview`** — assert `from,to,expected_days,goods_in,cold_storage,process_room,cleaning,mince,meatprep,returns,calibration,corrective_actions` including `missing_days` (working-days minus logged dates), `by_species`, `by_code`, `dispositions`, `by_ccp`, and the `unresolved` filter.
3. **`getAnnualReviewData`** — assert the `'3.2'..'3.9'` block structure, the training/allergen/calibration **dedup** behaviour, the `complaints` block, the supplier expiry windows (`expired_certs`, `expiring_60_days`), the meat-BLS completeness, and the **no-from/to** branch (period-filtered sections stay empty). Use fixed `now` for the `today`/`in60Days`/`oneYearAgo` thresholds.
4. **`getAuditHeatmap`** — assert all 11 DayMap keys (`deliveries, cold_am, cold_pm, room_am, room_pm, diary_open, diary_operational, diary_close, cleaning, mince, calibration`) and the deviation logic per section (esp. calibration's manual-only deviation rule and processing's `within_limits`).
5. **`getAuditSection`** — at least the structurally distinct sections: `deliveries`/`cold_storage`/`process_room` (the dual tempRows/diaryRows shape + heatmap) /`calibration`/`mince`/`returns`/`ccas`/`reviews`/`health`/`training`, plus the unknown-section → 400-equivalent path. Assert `rows`/`summary`/`heatmap` (and the section-specific `tempRows`/`diaryRows`/`weeklyRows`/`staffRows` variants) match.
6. **`buildAuditWorkbook`** — using the **real** `XlsxSpreadsheetExporter`, assert the returned buffer parses (`XLSX.read`) to **exactly 13 sheets** with the exact names `['01 Deliveries','02 Cold Storage','03a Process Room Temps','03b Process Room Diary','04 Cleaning','05 Calibration','06 Mince & Prep','07 Product Returns','08 Corrective Actions','09a Weekly Reviews','09b Monthly Reviews','10 Health & People','11a Staff Training','11b Allergen Training']` and that each sheet's header row matches the current route's header arrays. (Note: that's 13 *section* fetches feeding **14 sheets** — process-room and reviews and training each emit two tabs; deliveries..CAs are single. Confirm the count against `audit/export/route.ts` at implementation — the route appends **14** `book_append_sheet` calls. **The spec says "13 sheets"; the route emits 14 tabs. RESOLVE at implementation by counting the route — the test asserts the actual count, byte-identity wins over the prose.** ⚠️ Risk B1.)

### `tests/unit/adapters/XlsxSpreadsheetExporter.test.ts`
Round-trip: feed 2–3 `SheetSpec`s (with `columnWidths`), call `toXlsxBuffer`, `XLSX.read` the buffer back, assert sheet names, sheet order, and cell values survive. Assert `!cols` widths applied.

### Lint / typecheck / build
- `tests/unit/lint/no-adapter-imports.test.ts` still green (service imports ports only).
- Lint green incl. the new `xlsx` ban + allow-list.
- `npx tsc --noEmit` green; `npm run build` green.

> 🗣 **In plain English:** The big test file proves the new brain reproduces every screen's exact output for known inputs — that's the seatbelt PR8 buckles into. The adapter test proves the Excel bytes are real and round-trip. Then lint/build must be green.

---

## Acceptance criteria

- [ ] 8 new source files + 6 additive barrel/wiring edits + 1 eslint edit, exactly as listed. No route edited; no migration added.
- [ ] `xlsx` imported in exactly ONE file: `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts` (the route's existing import is untouched and is *expected* until PR8 — call this out in the ship record).
- [ ] `SpreadsheetExporter` port mentions no HACCP/domain concept.
- [ ] Service exports a FACTORY only (no singleton in `lib/services/`); wiring holds the singleton; service-role only; no `…ForCaller`.
- [ ] `lib/ports/**` and `lib/domain/**` import no adapters; service imports ports only (lint-pinned).
- [ ] Service unit tests reproduce all 6 route response shapes for fixed inputs; `buildAuditWorkbook` produces a parseable workbook with the exact tab set/order.
- [ ] Xlsx adapter round-trip test green.
- [ ] Lint + typecheck + build green. Full unit suite green.
- [ ] Ship record explicitly notes: introduce-only, no caller, no route, no migration, no integration/E2E delta.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **C1 (low, no must-fix):** All six methods are read-only; `Promise.all` fan-outs are independent reads with no write or shared mutable state. The `now: Date` injection removes the only nondeterminism (multiple `new Date()` calls drifting across the request). **Mitigation:** single injected clock. **No must-fix.**

### Security
- **S1 (low):** PII (`complaints`, `haccp_health_records`, `users.name`) flows through the new reads. PR7 must not read **more** columns than the routes already read. **Mitigation:** copy `.select()` strings verbatim; reviewer diffs each against its route. **No must-fix**, but a code-critic check item.
- **S2 (low):** Service-role (RLS-bypassing) singleton in wiring. This matches today's route access exactly and is the deliberate, ADR-0004-sanctioned deferral to F-RLS-04h. **Mitigation:** wiring test pins that no `…ForCaller` leaked early. **No must-fix.**

### Data migration
- **None.** PR7 adds no migration and changes no schema. 🗣 Nothing touches the database structure. **No material risks in this category.**

### Business-logic flaws (the real risk surface — byte-identity)
- **B1 (medium → must-fix on the assertion, not the build):** The spec says **"13 sheets"** but `audit/export/route.ts` emits **14 `book_append_sheet` tabs** (process-room ×2, reviews ×2, training ×2; the rest ×1). If the service emits 13, the export silently loses a sheet — a compliance defect. **Mitigation:** the `buildAuditWorkbook` test asserts the **actual** tab set/order copied from the route, and byte-identity wins over the "13" prose. **Must-fix that the workbook tab set/order/headers exactly match `audit/export/route.ts`.** Not a Gate-2 blocker (it's resolved by following the route, not by changing the plan), but flagged as the single highest-value correctness check.
- **B2 (medium):** The `getTodayStatus(now)` clock-injection is the only internal refactor. The route calls `new Date()` / `new Date().getHours()` / `getDay()` / month-end math inline. Consolidating onto one injected `now` could shift a boundary case (e.g. a call that straddled a clock tick). **Mitigation:** unit tests at multiple fixed `now` values covering each overdue boundary (before/after each cutoff hour, Friday 17:00, last-day-of-month); PR8's route passes a single `new Date()`. **No must-fix**, but the boundary tests are mandatory.
- **B3 (medium):** Subtle shaping divergences are easy to introduce when moving code — e.g. `temp_status !== 'pass'` vs `=== 'fail'`, the `?? '—'` user fallback, the `slice(0,5)`/`slice(0,10)` time/date truncations, label maps (`RETURN_LABELS` differs between overview and export!), the dedup `Set` keys, sort orders. **Mitigation:** move the code **verbatim**; the parity tests assert exact output; reviewer diffs service methods against route source line-by-line. **No must-fix on the plan**, but B3 is why the test file must be exhaustive.
- **B4 (low):** `annual-review/data` mixes current-state reads (always run) with period-filtered reads (only when `from&to`). Mishandling the nullable branch would change output when dates are absent. **Mitigation:** explicit nullable `from/to` in the port signature + a no-dates test case. **No must-fix.**
- **B5 (low):** `complaints` is a NON-HACCP table read inside the annual-review method — easy to forget it belongs to this port. It is correctly part of `fetchAnnualReviewData` (cross-domain aggregator). **Mitigation:** noted in the port doc-comment. **No must-fix.**

### Launch blockers
- **L1 (low):** ESLint allow-list must include `lib/adapters/xlsx/**` or the adapter fails its own lint and the build breaks. **Mitigation:** Step 8 is mandatory and called out. **No must-fix** (it's in the plan), but if omitted the PR won't build.
- **L2 (low):** `Buffer` type in a pure-TS port could trip strict `lib` settings. **Mitigation:** fall back to `Uint8Array` if tsc objects (the xlsx buffer is a `Uint8Array`). **No must-fix.**

### Risk headline
**No Gate-2-blocking must-fix risks.** The single most important correctness obligation is **B1**: the audit-export workbook must contain the **exact tab set/order/headers** the current route emits (count it from `audit/export/route.ts` — expect **14** tabs, not the prose's "13"), because a dropped or reordered sheet is a food-safety-audit compliance defect. **B2/B3** make the exhaustive parity test suite non-optional. Everything else is low and mitigated within the plan.

---

## Hexagonal verdict (populates Gate 2)

- **Ports used/added:** ADDS two ports — `SpreadsheetExporter` (generic) and `HaccpReportingRepository` (deep, read-only, cross-table). Uses no existing port.
- **Adapters added:** `lib/adapters/xlsx/XlsxSpreadsheetExporter` (implements SpreadsheetExporter), `lib/adapters/supabase/HaccpReportingRepository` + `lib/adapters/fake/HaccpReportingRepository` (implement HaccpReportingRepository).
- **New dependencies:** **NONE.** `xlsx@^0.18.5` is already in `package.json`. This PR *confines* it to its adapter (previously imported directly in the route) and adds the lint ban — a hexagonal improvement, not a new dep. It is currently single-use (one import) and after PR7 will sit behind the owned `lib/adapters/xlsx/` wrapper → **wrapped: YES (this PR is what wraps it).**
- **Rip-out test:** After PR7, swapping the Excel library = one new adapter folder (`lib/adapters/<vendor>/`) + one wiring line (`spreadsheet:` in `lib/wiring/haccp.ts`). Swapping the DB for reporting = one new `lib/adapters/<vendor>/HaccpReportingRepository` + one wiring line. The service, ports, domain types, and (after PR8) the routes are untouched. **RESULT: PASS.**
- **Gate-2 verdict:** **PASS — no blocker.** No unjustified/unwrapped dep; rip-out PASSes; no must-fix risk blocks the plan (B1 is resolved by following the route, not by re-planning).

> 🗣 **In plain English:** This PR adds two clean sockets and three plugs, adds zero new libraries, and actually *tightens* the rules by caging the Excel library behind its own adapter. After this, replacing Excel or the database for reporting is a one-plug-one-wire change. The verdict is green.

---

## Appendix — current response shapes (the byte-identity contract for PR8)

(Captured from the route source on 2026-06-24. The service `…Response` types and tests mirror these exactly.)

- **today-status:** flat object — `cold_storage`, `processing_room`, `daily_diary`, `cleaning`, `deliveries`, `mince_runs`, `product_returns`, `corrective_actions{open}`, `calibration_due/done/pass`, `weekly_review_due/overdue`, `monthly_review_due/overdue`, `training_overdue`, `training_due_soon`, `total_checks`, `completed_checks`. (See route lines 73–144.)
- **overview:** `{from,to,expected_days,goods_in,cold_storage,process_room,cleaning,mince,meatprep,returns,calibration,corrective_actions}`. (Lines 212–225.)
- **annual-review/data:** `{'3.2','3.3','3.4','3.6','3.7','3.8','3.9'}`. (Lines 430–438.) NOTE: no `'3.5'`; `complaints` lives in `'3.8'`.
- **audit/heatmap:** 11 DayMaps `{deliveries,cold_am,cold_pm,room_am,room_pm,diary_open,diary_operational,diary_close,cleaning,mince,calibration}`. (Lines 155–167.)
- **audit (per section):** varies by section — `{rows,summary,heatmap}` for most; `{tempRows,diaryRows,tempSummary,diarySummary,heatmap}` for `process_room`; `{weeklyRows,monthlyRows}` for `reviews`; `{staffRows,allergenRows,summary}` for `training`; unknown section → `{error}` 400. (Lines 42–737.)
- **audit/export:** binary xlsx buffer; **14** appended tabs (`01 Deliveries … 11b Allergen Training`). (Lines 485–521.) Headers + `!cols` per the `fetch*Sheet` helpers.
