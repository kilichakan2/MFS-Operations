# F-19 Cluster E — PR8 (the re-point): flip the 6 reporting routes onto the hexagon

- **Date:** 2026-06-24
- **Feature:** F-19 Cluster E, PR8 of the two-step rhythm (PR7 = introduce-only foundation [SHIPPED, `34783fc`], PR8 = re-point — **this plan, the LAST Cluster E step**)
- **Phase:** FORGE Order → plan for Render
- **Branch suggestion:** `feat/f19-pr8-cluster-e-reporting-repoint`

> 🗣 **In plain English:** PR7 built the new plumbing (the sockets, the plugs, and a "brain" that already reproduces every screen's exact output) but left all 6 admin reporting screens still wired straight into the database and the Excel library. This PR pulls those 6 screens off the direct vendor wires and plugs them into the brain instead, so each screen becomes a thin "doorman" — check the role, ask the brain, return the answer. The output must be **byte-for-byte the same** as today. This is the careful flip-the-switch step.

---

## Mini-map

```
DOMAIN (HACCP reporting core logic)
  ├─ HaccpReportingRepository (port) → [Supabase]  (adapter, reads)
  └─ SpreadsheetExporter (port)      → [xlsx]       (adapter, rows→Excel)
  routes: today-status · overview · annual-review·data · audit · audit·heatmap · audit·export
🗣 6 doormen drop their direct DB/Excel wires and call one wiring singleton — swap a vendor = one plug, nothing else.
```

---

## Goal

Re-point the 6 read-only HACCP reporting routes off their direct vendor calls
(`supabaseService`, `import * as XLSX from 'xlsx'`) and onto the
`haccpReportingService` wiring singleton (built in PR7). After PR8:

- Every route is a thin doorman: role-check → call the service → return the result.
- `@supabase/*` and `xlsx` are imported in **none** of the 6 route files.
- The output of every route is **BYTE-IDENTICAL** to today (the PR7 parity suite
  `tests/unit/services/HaccpReportingService.test.ts` is the contract proving this).
- The `xlsx` lint-ban lands (all 3 `.eslintrc.json` entries) — **after** the export
  route drops its direct import, so `npm run lint` stays green.
- The DB-error 500 body is normalised to `'Server error'` (R6) — already automatic
  for the audit route's per-section leaks once the early-return error branches are
  removed by the re-point.

> 🗣 **In plain English:** Move the 6 screens onto the brain with zero change to what
> they output, cage the Excel library behind its adapter for good, and stop one route
> leaking raw database error text on failures. No new database changes, no new
> libraries, no RLS changes.

---

## Domain terms (plain-English glossary for this plan)

- **Re-point** — change which thing a route calls, without changing what comes back. 🗣 Swap the supplier behind the counter; the customer gets the identical product.
- **Wiring singleton** (`haccpReportingService` in `lib/wiring/haccp.ts`) — the ready-to-use, pre-assembled brain the routes import. 🗣 One pre-built appliance plugged into the wall; the routes just press its buttons.
- **Doorman route** — a route reduced to: auth check, parse params, call the service, return. No business logic. 🗣 The bouncer checks your wristband and points you in; he doesn't cook the food.
- **Byte-identical** — the HTTP response body is the exact same bytes/JSON keys/values/order as before. 🗣 If you photographed the old answer and the new answer they'd be indistinguishable.
- **R6 posture** — on a server error, return the string `'Server error'`, never raw Postgres text. 🗣 Don't show the customer the kitchen's error log; show a clean "something went wrong".
- **Lint-ban (`no-restricted-imports`)** — an ESLint rule that fails the build if a banned library is imported outside its allowed adapter folder. 🗣 A tripwire that goes off if anyone touches the caged vendor library from the wrong place.
- **Service-role** — the master DB key that bypasses row-level security; the access these routes already have. 🗣 The master key that opens every door; we keep it exactly as-is, no RLS change in this PR.

---

## Compliance flags

- **HACCP food-safety records (SALSA audit domain).** The audit export and audit
  views are **what a food-safety auditor sees**. A dropped/renamed/reordered Excel
  sheet, a changed tally, or a mis-mapped label is a **compliance-integrity defect**,
  not a cosmetic one. Byte-identity here is a **safety** requirement.
- **PII** — `complaints`, `haccp_health_records` (visitor names, illness types,
  exclusion reasons), and `users.name` flow through these reads. PR8 changes **no**
  `.select()` column list (the verbatim selects already live in the PR7 adapter), so
  PR8 introduces **zero new exposure**. The R6 normalisation actually *reduces*
  surface by no longer echoing raw Postgres text to the client.

---

## ADR review & conflicts

Read: ADR-0002 (hexagonal shape & naming), ADR-0003 (strangler-fig + FREEZE rule),
ADR-0004 (RLS vs service-role).

- **ADR-0002** — honoured & **strengthened**. After PR8 the 6 routes import only the
  wiring singleton; vendor SDKs (`@supabase/*`, `xlsx`) live solely in
  `lib/adapters/<vendor>/`. The `xlsx` lint-ban (Step 8) closes the last gap left
  open in PR7 (PR7 deliberately could not ban `xlsx` while the export route still
  imported it).
- **ADR-0003 (FREEZE)** — honoured. `xlsx` becomes fully confined to
  `lib/adapters/xlsx/`; the export route stops importing it.
- **ADR-0004 (RLS vs service-role)** — honoured. **Service-role ONLY.** PR8 uses the
  existing `haccpReportingService` singleton (wired to `supabaseService`). **NO
  `…ForCaller(userId)` factory is added or used** — per-caller RLS is deferred to
  **F-RLS-04h (Cluster G)**, exactly as every prior cluster deferred it. The routes
  keep running as service-role exactly as today, so the re-point is byte-identical.

**No ADR conflicts.** The eslint ban (Step 8) is the ADR-0002-mandated housekeeping
that PR7 staged for this PR.

---

## Verified parity (read before planning — no parity gap found)

I read all 6 route files AND the PR7 service + Supabase adapter line-by-line. **The
PR7 service reproduces every route's current output. No parity gap was found — PR7
is complete; proceed with the re-point.** Specific confirmations:

- **today-status** — service `getTodayStatus(now)` (lines 113–245) reproduces the route's
  flat tile object verbatim, including the `RC01/RC02/RC04/RC05` safety set, the
  `nowHour` overdue cutoffs (am 10 / pm 14 / opening 10 / operational 13 / closing 17 /
  cleaning 15), the Friday-17:00 weekly clock, the last-day-of-month monthly clock, and
  the `training_overdue`/`training_due_soon` filters. The route's `new Date()` calls map
  onto the single injected `now`.
- **overview** — service `getOverview(from,to)` (lines 250–385) reproduces all 12 response
  keys, `missing_days` (working-days minus logged dates), `by_species`, `by_code`,
  `dispositions`, `by_ccp`, and the `corrective_actions.unresolved` filter. `workingDays`
  helper is copied verbatim (service lines 1211–1223).
- **annual-review/data** — service `getAnnualReviewData(from,to)` (lines 390–707) reproduces
  the `'3.2'..'3.9'` blocks (no `'3.5'`), the staff/allergen/calibration **dedup** Sets, the
  `complaints` block (non-HACCP table, correctly inside this method), supplier expiry windows
  (`expired_certs`/`expiring_60_days`), meat-BLS completeness, the `RETURN_LABELS` map, and the
  **no-from/to branch** (period-filtered sections stay empty).
- **audit/heatmap** — service `getAuditHeatmap(from,to)` (lines 712–783) reproduces all **11**
  DayMaps and each section's deviation rule (calibration manual-only; processing `within_limits`).
- **audit (per section)** — service `getAuditSection(section,from,to)` (lines 788–1169) reproduces
  every section's `rows`/`summary`/`heatmap`, the dual `tempRows`/`diaryRows` (process_room), the
  `weeklyRows`/`monthlyRows` (reviews), the `staffRows`/`allergenRows` (training), the ccas
  `actioned_by_name`/`verified_by_name`/`date` derivation, and the unknown-section `{ error }`
  branch. The adapter's `.select()` strings (deliveries, ccas with `verified_by_user`, returns
  with `return_code_notes`/`never_resell_reason`, health with `visitor_reason`/`symptom_free_48h`/
  `medical_certificate_provided`) are copied **verbatim** from the route, and the spread (`...d` /
  `merge(d, …)`) preserves every raw column — so byte-identity holds.
- **audit/export** — service `buildAuditWorkbook(from,to)` (lines 1174–1198 + builders 1232–1558)
  reproduces the **14**-tab workbook (`deliveriesSheet`, `coldStorageSheet`, `processRoomSheets×2`,
  `cleaningSheet`, `calibrationSheet`, `minceSheet`, `returnsSheet`, `casSheet`, `reviewsSheets×2`,
  `healthSheet`, `trainingSheets×2`) with verbatim headers, `columnWidths`, label maps, and sheet
  names/order `01/02/03a/03b/04/05/06/07/08/09a/09b/10/11a/11b`.

> 🗣 **In plain English:** I checked the new brain against all six screens, line by line.
> It already produces the exact same answers, including the tricky Excel export with its
> 14 tabs in a fixed order. Nothing is missing. We are clear to flip the switch — no need
> to loop back to rebuild the foundation.

---

## One behaviour change that IS intended: R6 (DB-error 500 body)

This is the **only** intended output change, and it only affects the **error body
string on the 500 path** — never the happy-path response.

**Current leak (must be normalised):** `app/api/haccp/audit/route.ts` returns the **raw
Postgres error message** on per-section DB failure:
`return NextResponse.json({ error: dErr.message }, { status: 500 })` at lines
**62, 142, 234, 235, 367, 436, 574, 607, 684** (the per-section `if (*Err)` early returns).

**After re-point:** the route no longer has per-section DB-error branches — it just calls
`haccpReportingService.getAuditSection(...)`. A DB failure now **throws** out of the service
(the PR7 adapter throws `ServiceError` on failure) and is caught by the route's existing
outer `catch` → `return NextResponse.json({ error: 'Server error' }, { status: 500 })`
(audit route line 741). So R6 normalisation is **structurally automatic** in the re-point —
removing the early-return branches *is* the fix.

**The other 5 routes already comply** (verified): today-status (line 147), audit/heatmap
(line 171), overview (line 229), annual-review/data (line 442) all already return
`{ error: 'Server error' }`; audit/export returns the string `'Server error'` (line 539).
Only the **audit per-section** route currently leaks `dErr.message`. **R6 normalisation
list = audit/route.ts only.**

This matches the PR3–6 HACCP house style (A/B/C/D postures already applied to sibling
routes): raw vendor error text is never returned to the client; the clean `'Server error'`
500 is the standard.

> 🗣 **In plain English:** Five of the six screens already hide database errors behind a
> clean "Server error". The sixth (the per-section audit screen) currently prints the raw
> database error to the browser. Because the re-point deletes that screen's own error-handling
> and lets the error fall through to the clean catch, the leak is fixed for free — we just
> have to make sure we delete those branches and don't reintroduce them.

---

## Files to change (exact paths)

**Edited route files (the re-point — 6 files):**

1. `app/api/haccp/today-status/route.ts`
2. `app/api/haccp/audit/route.ts` (also removes per-section `dErr.message` 500 branches → R6)
3. `app/api/haccp/audit/export/route.ts` (also **drops `import * as XLSX from 'xlsx'`** + the `book_append_sheet` assembly; keeps only the role-check, param parse, filename, headers)
4. `app/api/haccp/audit/heatmap/route.ts`
5. `app/api/haccp/overview/route.ts`
6. `app/api/haccp/annual-review/data/route.ts`

**Edited lint config (after the export re-point — 1 file):**

7. `.eslintrc.json` — add the `xlsx` ban in **both** `no-restricted-imports` blocks
   (top-level `rules` + the `lib/services/**` + `lib/usecases/**` override) **and** add
   `"lib/adapters/xlsx/**/*.ts"` to the allow-list override `files` array.

**Edited test file (T1 — populated-row cell assertions):**

8. `tests/unit/services/HaccpReportingService.test.ts` (and/or
   `tests/unit/adapters/XlsxSpreadsheetExporter.test.ts`) — add per-sheet populated-row
   cell assertions for the non-trivial tabs.

**Explicitly NOT changed:** no `supabase/migrations/**`; no `package.json`; no `app/**`
or `components/**` beyond the 6 routes; no `lib/wiring/haccp.ts` (singleton already exists);
no `…ForCaller` factory anywhere; no new screen/UI.

> 🗣 **In plain English:** Six screen files get slimmed down, one rulebook file gets the
> Excel tripwire armed, one test file gets extra checks. Nothing else moves — no database
> structure changes, no new libraries.

---

## Per-route re-point mapping (current vendor call → service call)

For each route, the implementer must:
(a) **read the route's current response shaping** and confirm the service method already
returns exactly that shape (the parity table above + the PR7 parity tests are the contract),
(b) replace the vendor call(s) with the single service call,
(c) keep the role-check, param parsing, and (for export) the filename + HTTP headers in the route,
(d) keep each route's existing 401/400 branches **byte-identical** (do NOT route them through the service).

### 1 · `app/api/haccp/today-status/route.ts`
- **Remove:** `import { supabaseService } from '@/lib/adapters/supabase/client'`, `const supabase = supabaseService`, the local `todayUK`/`getWeekStart`/`getMonthStart` helpers, the `Promise.all` of 12 selects, and the entire tile-inference body (lines 32–144).
- **Add:** `import { haccpReportingService } from '@/lib/wiring/haccp'`.
- **Replace body with:** keep the role-check (401 `{ error: 'Unauthorised' }`), then
  `const result = await haccpReportingService.getTodayStatus(new Date())` →
  `return NextResponse.json(result)`.
- **Keep:** the outer `catch` → `{ error: 'Server error' }` 500 (already compliant).
- 🗣 The screen now just asks the brain "what's today's status, as of now?" and returns it.

### 2 · `app/api/haccp/audit/route.ts`
- **Remove:** the `supabaseService` import + `const supabase`, the `todayUK`/`daysAgo` helpers
  (keep them only if still needed for default `from`/`to`), **all 11 inline `if (section === …)`
  blocks** AND **every per-section `if (*Err) return … dErr.message` early return** (R6).
- **Add:** `import { haccpReportingService } from '@/lib/wiring/haccp'`.
- **Replace body with:** role-check (401), the `section` param required-check (400
  `{ error: 'section param required' }` — keep byte-identical), the `from`/`to` defaults
  (`daysAgo(30)` / `todayUK()` — keep these date helpers in-route since they compute defaults),
  then `const result = await haccpReportingService.getAuditSection(section, from, to)`.
  **Unknown-section handling:** the service returns `{ error: 'Unknown section: …' }` for an
  unknown section, but the **current route returns that with HTTP 400** (line 737). Preserve the
  400: after the service call, `if ('error' in result) return NextResponse.json(result, { status: 400 })`,
  else `return NextResponse.json(result)`. **Verify against the parity test** that `getAuditSection`
  returns `{ error: \`Unknown section: ${section}\` }` (service line 1168) so the string matches byte-for-byte.
- **Keep:** the outer `catch` → `{ error: 'Server error' }` 500. R6 is satisfied because the
  per-section `dErr.message` branches are gone and DB failures bubble to this catch.
- 🗣 The screen asks the brain for one section's data; if the brain says "unknown section" it
  returns the same 400 as before; any DB blow-up now shows a clean "Server error", not raw SQL text.

### 3 · `app/api/haccp/audit/export/route.ts`
- **Remove:** `import * as XLSX from 'xlsx'` (**critical — this is what lets Step 8's ban go green**),
  the `supabaseService` import + `const supabase`, **all 12 `fetch*Sheet` helper functions**
  (lines 30–469), and the `XLSX.utils.book_new()` + 14 `book_append_sheet` + `XLSX.write` assembly
  (lines 485–524).
- **Add:** `import { haccpReportingService } from '@/lib/wiring/haccp'`.
- **Replace body with:** keep the admin role-check (401 `new NextResponse('Unauthorised', { status: 401 })`),
  keep `daysAgo`/`todayUK` for the `from`/`to` defaults, then
  `const buf = await haccpReportingService.buildAuditWorkbook(from, to)`, keep the
  `filename = \`MFS_HACCP_Audit_${from}_to_${to}.xlsx\`` and the **exact** response headers
  (`Content-Type` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `Content-Disposition` attachment, `Content-Length: String(buf.length)`).
- **Keep:** the outer `catch` → `new NextResponse('Server error', { status: 500 })`.
- **Confirm:** `buf.length` works — `buildAuditWorkbook` returns a `Buffer` (PR7), and the route
  already uses `String(buf.length)`; no change needed.
- 🗣 The export screen now just asks the brain for the finished Excel bytes and wraps them in the
  download headers. It never touches the Excel library again — that's now caged in the adapter.

### 4 · `app/api/haccp/audit/heatmap/route.ts`
- **Remove:** `supabaseService` import + `const supabase`, the local `DayMap` type + `mark` helper,
  the `Promise.all` of 7 selects, and the entire 11-DayMap build body (lines 100–167). Keep
  `daysAgo`/`todayUK` for `from`/`to` defaults.
- **Add:** `import { haccpReportingService } from '@/lib/wiring/haccp'`.
- **Replace body with:** role-check (401), `from`/`to` defaults, then
  `const result = await haccpReportingService.getAuditHeatmap(from, to)` →
  `return NextResponse.json(result)`.
- **Keep:** outer `catch` → `{ error: 'Server error' }` (already compliant).
- 🗣 The heatmap screen asks the brain for the 11 day-grids and returns them.

### 5 · `app/api/haccp/overview/route.ts`
- **Remove:** `supabaseService` import + `const supabase`, the `workingDays` helper, the
  `Promise.all` of 10 selects, and the entire aggregation body (lines 59–225).
- **Add:** `import { haccpReportingService } from '@/lib/wiring/haccp'`.
- **Replace body with:** role-check (401 `{ error: 'Unauthorised — admin only' }`), the
  `from`/`to` **required**-check (400 `{ error: 'from and to date parameters required' }` —
  keep byte-identical; this route does NOT default the dates), then
  `const result = await haccpReportingService.getOverview(from, to)` →
  `return NextResponse.json(result)`.
- **Keep:** outer `catch` → `{ error: 'Server error' }` (already compliant).
- 🗣 The overview screen demands both dates (unchanged), then asks the brain for the tallies.

### 6 · `app/api/haccp/annual-review/data/route.ts`
- **Remove:** `supabaseService` import + `const supabase`, all the inline reads + dedup + SALSA
  block assembly (lines 34–426). Note this route reads `from`/`to` but does **not** require them
  (period-filtered sections fall back to empties when absent).
- **Add:** `import { haccpReportingService } from '@/lib/wiring/haccp'`.
- **Replace body with:** role-check (401 `{ error: 'Unauthorised' }` — note: warehouse/butcher/admin,
  NOT admin-only), parse `from`/`to` (nullable), then
  `const result = await haccpReportingService.getAnnualReviewData(from, to)` →
  `return NextResponse.json(result)`. Pass `from`/`to` as `string | null` exactly as
  `searchParams.get(...)` yields (the service signature is `(from: string | null, to: string | null)`).
- **Keep:** outer `catch` → `{ error: 'Server error' }` (already compliant).
- 🗣 The annual-review data screen passes its optional date range to the brain; if no dates, the
  brain leaves the period-filtered panels empty, exactly as today.

---

## Numbered implementation steps (ordered — the eslint ordering is load-bearing)

**Step 1 — re-point today-status.** Edit `app/api/haccp/today-status/route.ts` per the
mapping above. Run the today-status parity tests (already green from PR7) as the contract.

**Step 2 — re-point audit/heatmap.** Edit `app/api/haccp/audit/heatmap/route.ts`.

**Step 3 — re-point overview.** Edit `app/api/haccp/overview/route.ts` (keep the
both-dates-required 400).

**Step 4 — re-point annual-review/data.** Edit `app/api/haccp/annual-review/data/route.ts`
(nullable dates, broader role set).

**Step 5 — re-point audit (per section).** Edit `app/api/haccp/audit/route.ts`. **Delete all
per-section `dErr.message` 500 early returns (R6).** Preserve the `section`-required 400, the
unknown-section 400, and route DB failures to the outer `'Server error'` catch.

**Step 6 — re-point audit/export AND drop the direct xlsx import.** Edit
`app/api/haccp/audit/export/route.ts`: remove `import * as XLSX from 'xlsx'` and the whole
sheet-assembly; call `buildAuditWorkbook`. **This must happen BEFORE Step 7** — the export
route is the only remaining `xlsx` importer, and arming the ban while it still imports `xlsx`
turns `npm run lint` red.

**Step 7 — arm the xlsx lint-ban (`.eslintrc.json`).** ONLY now that no route imports `xlsx`:
- Add to the **top-level** `rules.no-restricted-imports[1].paths`:
  ```json
  { "name": "xlsx", "message": "Use the SpreadsheetExporter port via @/lib/wiring/haccp. xlsx may only be imported inside lib/adapters/xlsx/. See ADR-0002 / F-19." }
  ```
- Add the **identical** entry to the `lib/services/**` + `lib/usecases/**` override's
  `no-restricted-imports[1].paths` (mirror the existing jspdf/leaflet entries' shape and the
  ADR-0002 / F-19 reference, matching the message style already in the file).
- Add `"lib/adapters/xlsx/**/*.ts"` to the **allow-list override** `files` array (the override
  block at `.eslintrc.json` lines 64–78 that turns `no-restricted-imports` `"off"`), alongside the
  existing `lib/adapters/jspdf/**`, `lib/adapters/leaflet/**`, etc. — otherwise
  `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts` fails its own ban.
- 🗣 Arm the tripwire that bans the Excel library everywhere, and write the one permission slip
  for the adapter folder. Do this strictly **after** the export route stops importing it, or the
  build goes red.

**Step 8 — add T1 populated-row cell assertions.** In
`tests/unit/services/HaccpReportingService.test.ts` (and/or
`tests/unit/adapters/XlsxSpreadsheetExporter.test.ts`), seed each non-trivial section with at
least one populated row and assert the **cell values** of the produced sheet (parse with
`XLSX.utils.sheet_to_json(ws, { header: 1 })`). The 13 currently-header-only tabs whose shaping
is non-trivial (deliveries already has a data-row test at line 1031 — extend to the rest):
  - **calibration (05)** — `overall` is `'Certified'` (certified_probe) / `'Pass'` / `'Fail'`; ice/boiling pass `'Yes'/'No'/''`.
  - **cleaning (04)** — sanitiser pass `>= 82 ? 'Yes' : 'No'` and `''` when temp null.
  - **mince (06)** — `source_batch_numbers.join(', ')`; input/output pass `'Yes'/'No'`.
  - **monthly reviews (09b)** — `invertFail` rule: `i.invertFail ? result==='YES' : result!=='YES'` fail count.
  - **returns (07)** — `SAFETY` set `['RC01','RC02','RC04','RC05']` → `'Yes'/'No'`; `CODE_LABELS` map.
  - **training (11a/11b)** — staff status `Overdue/Due soon/Current`; allergen `${aCount}/14` and `${uCount}/5` counts.
  Each assertion pins the verbatim cell-shaping so a future refactor can't silently drift a
  food-safety value. 🗣 Don't just check the tab exists — check the actual numbers and labels
  inside it for the trickiest sheets, so a wrong "Pass/Fail" or "82°C" can't slip through.

**Step 9 — full green gate (do NOT skip the full lint run).**
- `npx tsc --noEmit` green.
- **`npm run lint`** (the FULL repo lint, not a new-files-only/changed-files check). **Rationale,
  call this out loudly:** `next build` masks eslint via `eslint.ignoreDuringBuilds: true`, and
  vitest does not run eslint — so a partial lint check could miss a route that still imports `xlsx`
  or `@supabase/*`. Only the full `npm run lint` proves all 6 routes are clean and the ban holds.
- Full unit suite green (incl. the PR7 parity suite + the new T1 assertions +
  `tests/unit/lint/no-adapter-imports.test.ts`).
- `npm run build` green.
- Integration + E2E: see the test plan below.

> 🗣 **In plain English:** Flip the five simple screens, then the audit screen (deleting its
> error-leak branches), then the export screen (which is the one that drops the Excel import),
> THEN arm the Excel tripwire, then add the cell-level safety checks, then run the FULL lint and
> the whole test suite. The order matters: arming the tripwire before the last Excel import is
> gone would break the build.

---

## TDD test plan (ANVIL executes)

PR8 **changes live behaviour** (it re-points real prod routes), so it is NOT frame-light —
run the full FORGE loop + ANVIL (per the "FORGE+ANVIL for production work" memory).

### Unit (the parity contract — primary safety net)
- The PR7 parity suite `tests/unit/services/HaccpReportingService.test.ts` is the byte-identity
  contract. It already pins the 14-tab workbook set/order/headers (lines 995–1029) and the
  deliveries data-row shaping (line 1031). **It must stay 100% green unchanged** — if a re-point
  forces a service edit, that is a red flag (the service should not need editing; only routes change).
- **New T1 cell assertions** (Step 8) extend the populated-row coverage to calibration / cleaning /
  mince / monthly / returns / training.
- `tests/unit/lint/no-adapter-imports.test.ts` green (services still import ports only).

### Integration (`npm run test:integration`)
- Hit each re-pointed route against local Supabase and assert the response shape is unchanged
  from the pre-PR baseline. Prioritise: `audit?section=…` for every section (esp. the
  unknown-section 400 and a forced DB-error → `'Server error'` 500 to prove R6), and
  `audit/export` (download the buffer, `XLSX.read` it, assert 14 tabs in order).
- Confirm 401 paths unchanged on all 6 (no role cookie).

### E2E (`npm run test:e2e:api` + prod-build preview browser-taps for the HACCP section)
- Per the "ANVIL full browser-tap depth" memory: exhaustive browser-tap on the HACCP audit/reporting
  screens on the prod-build preview — open today-status tiles, the overview overlay, the annual-review
  data panels, the audit heatmap + each section tab, and **actually download the Excel export and open
  it** to eyeball the 14 tabs. HACCP is a critical section → do not make Hakan ask.

### Lint / typecheck / build
- **Full `npm run lint`** green (the `xlsx` ban + allow-list; all 6 routes free of `@supabase/*` and `xlsx`).
- `npx tsc --noEmit` + `npm run build` green.

> 🗣 **In plain English:** The unit parity tests prove the answers didn't change. The integration
> tests prove the live routes still return the same JSON and that the audit error now says "Server
> error". The browser taps prove a human opening the screens — and the downloaded Excel file — sees
> exactly what they saw before, all 14 tabs included.

---

## Acceptance criteria

- [ ] All 6 route files import the `haccpReportingService` wiring singleton and call exactly one
      service method each; none import `@supabase/*` or `xlsx` directly.
- [ ] Every route's happy-path response is **byte-identical** to the pre-PR baseline (PR7 parity
      suite green + integration shape-diff green).
- [ ] `audit/export` emits **14** tabs in order `01/02/03a/03b/04/05/06/07/08/09a/09b/10/11a/11b`
      with verbatim headers + column widths (parity test pins this; browser-tap confirms the file opens).
- [ ] `xlsx` imported in exactly ONE file: `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts`.
- [ ] `.eslintrc.json` has the `xlsx` ban in BOTH `no-restricted-imports` blocks + the allow-list
      entry for `lib/adapters/xlsx/**/*.ts`; **full `npm run lint` green**.
- [ ] R6: `audit/route.ts` no longer returns `dErr.message`; a DB failure on any audit section
      returns `{ error: 'Server error' }` with status 500. The other 5 routes' 500 bodies unchanged
      (already `'Server error'`).
- [ ] Each route's 401 and 400 branches are byte-identical to today (unknown-section still 400;
      overview still requires both dates; annual-review still allows missing dates + broader roles).
- [ ] Service-role only: `lib/wiring/haccp.ts` unchanged; **no `…ForCaller` added or used**.
- [ ] T1 populated-row cell assertions added for calibration / cleaning / mince / monthly / returns / training.
- [ ] No migration; no `package.json` change; no UI/screen change.
- [ ] Rip-out test PASSES (below).
- [ ] Ship record notes: re-point, first PR to make Cluster E reporting routes thin doormen,
      xlsx fully confined + banned, R6 applied to audit, no migration, no new dep, service-role only.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **C1 (low, no must-fix):** All six routes are read-only; the service fan-outs are independent
  reads with no writes or shared mutable state. `getTodayStatus` now takes a single injected
  `new Date()` from the route, removing the route's old multi-`new Date()` drift. **Mitigation:**
  single injected clock (already in PR7). **No must-fix.**

### Security
- **S1 (low):** PII (`complaints`, `haccp_health_records`, `users.name`) flows through these reads.
  PR8 changes **no** `.select()` column list (verbatim selects live in the PR7 adapter), so **zero
  new exposure**. **Mitigation:** no select edits in this PR; reviewer confirms routes only call the
  service. **No must-fix.**
- **S2 (low → positive):** R6 *removes* a real info-leak — the audit route currently echoes raw
  Postgres error text to the client. PR8 closes it. **Mitigation:** Step 5 deletes the `dErr.message`
  branches; integration test forces a DB error and asserts `'Server error'`. **No must-fix** (it's a
  hardening, not a regression).
- **S3 (low):** Service-role (RLS-bypassing) access is retained exactly as today — deliberate,
  ADR-0004-sanctioned deferral to F-RLS-04h. **Mitigation:** `lib/wiring/haccp.ts` untouched; no
  `…ForCaller`. **No must-fix.**

### Data migration
- **None.** PR8 adds no migration and changes no schema. **No material risks in this category.**

### Business-logic flaws (the real surface — byte-identity)
- **B1 (medium → the single highest-value check, NOT a Gate-2 blocker):** The audit export must
  emit **14** tabs in the exact order/headers. A dropped/renamed/reordered sheet is a food-safety
  compliance defect. **Mitigation:** the re-point delegates entirely to the PR7 `buildAuditWorkbook`,
  whose parity test already pins the 14-tab set/order/headers; the export browser-tap opens the actual
  file. **Resolved by delegating to the proven service — no re-plan needed.**
- **B2 (medium):** The audit per-section R6 change must delete **all** `dErr.message` branches without
  altering the happy-path or the 400 branches. Missing one branch leaves a leak; over-deleting could
  drop the section-required 400 or unknown-section 400. **Mitigation:** explicit branch list (lines
  62/142/234/235/367/436/574/607/684); integration test for a forced DB error + the two 4xx paths.
  **No must-fix on the plan**, but the branch-by-branch diff is mandatory in review.
- **B3 (medium):** Subtle re-point slips — passing the wrong arg order to a service method
  (`getAuditSection(section, from, to)`), forgetting the unknown-section 400 wrap, or dropping the
  `new Date()` arg to `getTodayStatus`. **Mitigation:** the per-route mapping above spells out each
  call's exact args; the PR7 parity tests + integration shape-diff catch any divergence. **No must-fix.**
- **B4 (low):** Eslint ordering — arming the `xlsx` ban (Step 7) before the export route drops its
  import (Step 6) turns `npm run lint` red. **Mitigation:** Steps 6→7 ordering is explicit and
  load-bearing; the full-lint gate (Step 9) catches it if mis-ordered. **No must-fix** (it's sequenced),
  but it is the most likely "oops" and is called out three times in this plan.

### Launch blockers
- **L1 (low):** A partial/changed-files-only lint check could pass while a route still imports `xlsx`
  or `@supabase/*`, because `next build` ignores eslint (`eslint.ignoreDuringBuilds: true`) and vitest
  doesn't run eslint. **Mitigation:** Step 9 mandates the **full** `npm run lint`. **No must-fix**
  (it's in the plan), but skipping it would ship a hidden vendor import.
- **L2 (low):** `buf.length` / `Buffer` return from `buildAuditWorkbook` must satisfy the export
  route's `String(buf.length)` + `NextResponse(buf, …)`. **Mitigation:** PR7 returns a `Buffer`; the
  route already uses `.length`; no change. **No must-fix.**

### Risk headline
**No Gate-2-blocking must-fix risks.** No parity gap was found — PR7 is complete, so this is a
clean re-point, not a loop-back. The single highest-value correctness obligation is **B1** (14-tab
export integrity), fully covered by delegating to the proven PR7 service + the export browser-tap.
The most likely operational slip is **B4/L1** (eslint ordering / partial-lint masking), mitigated by
the explicit Step 6→7 ordering and the mandatory **full** `npm run lint`.

---

## Hexagonal verdict (populates Gate 2)

- **Port(s) used:** USES the two PR7 ports — `HaccpReportingRepository` (deep, read-only,
  cross-table reads) and `SpreadsheetExporter` (generic rows→xlsx). Adds **no** new port.
- **Adapter(s) used:** `lib/adapters/supabase/HaccpReportingRepository` (reads) and
  `lib/adapters/xlsx/XlsxSpreadsheetExporter` (export), both via the existing
  `haccpReportingService` singleton in `lib/wiring/haccp.ts`. Adds **no** new adapter.
- **New dependencies:** **NONE.** No `package.json` change. PR8 *removes* the last direct `xlsx`
  import (from the export route) and arms the lint-ban → `xlsx` is now **wrapped: YES** (confined to
  `lib/adapters/xlsx/` and ban-enforced). This is a hexagonal tightening, not a new dep.
- **Rip-out test:** After PR8, swapping the Excel library = one new `lib/adapters/<vendor>/` +
  one wiring line (`spreadsheet:` in `lib/wiring/haccp.ts`). Swapping the DB for reporting = one new
  `lib/adapters/<vendor>/HaccpReportingRepository` + one wiring line. The 6 routes, the service, the
  ports, and the domain types are untouched. **RESULT: PASS.**
- **Gate-2 verdict:** **PASS — no blocker.** No new/unjustified/unwrapped dep; rip-out PASSes; no
  must-fix risk; no parity gap (PR7 confirmed complete).

> 🗣 **In plain English:** This PR adds zero new sockets, plugs, or libraries — it just plugs the
> 6 screens into the sockets PR7 built, and finishes caging the Excel library. After this, replacing
> Excel or the database for reporting is a one-plug-one-wire change. Verdict: green.
