# Code-critic review — F-19 PR7 · Cluster E reporting foundation (introduce-only)

- **PR:** #74 · branch `feat/f19-pr7-cluster-e-reporting-foundation`
- **Commits reviewed:** `1e3351f` (domain+ports), `cca538c` (service+adapters+wiring), `3b27707` (tests+guards)
- **Date:** 2026-06-24
- **Reviewer:** code-critic (FORGE Guard)
- **Initial verdict:** BLOCKERS PRESENT (1 × 🔴) → looped back to Render.
- **Post-fix verdict:** CLEAR (B1 resolved this session — see Resolution).

## Verdict summary
Architecturally clean, deep, and the parity is byte-identical across all 6 routes including the 14-tab audit workbook. The single blocker was process, not logic: the `xlsx` lint ban arrived a PR cycle early.

## 🔴 Blockers

### B1 · `.eslintrc.json` `xlsx` import-ban makes `npm run lint` fail on an unedited route
PR7 added the `xlsx` ban to `no-restricted-imports` (base rule + services override) + a `lib/adapters/xlsx/**` allow-list, but `app/api/haccp/audit/export/route.ts:16` still does `import * as XLSX from 'xlsx'` — that route isn't re-pointed until PR8. `npm run lint` → 1 error on `export/route.ts:16`. Every prior vendor confinement (jspdf/F-22, leaflet/F-24, resend, bcrypt) landed the ban **and** the re-point in the same PR; PR7 broke that invariant. `next build` masked it via `eslint.ignoreDuringBuilds: true`; `npx vitest run` doesn't run eslint.
**Resolution (this session):** chose option (a) — reverted all three `xlsx` ESLint additions (base ban, services-override ban, adapter allow-list) so the full confinement (ban + allow-list + route re-point) lands together in PR8, matching the established pattern. The wrapper adapter `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts` remains and is still the only real `xlsx` site by construction; only its lint-enforcement defers to PR8. `npm run lint` → green after the revert.

## 🟡 Warnings
None.

## 🔵 Architecture notes
None new.

## 🟢 Test-quality notes

### T1 · per-sheet populated-data assertions (non-blocking) — DEFERRED to PR8
`tests/unit/services/HaccpReportingService.test.ts:1031` — the 14-tab test pins set + order + every header row, and one Deliveries data row pins cell shaping. The other 13 builders are header-only. The trickiest transforms (calibration `Certified/Pass/Fail`, cleaning `>=82` flag, mince `batches.join(', ')`, monthly `invertFail`, returns SAFETY-code map, training `${n}/14`) are copied verbatim from the route so current risk is low, but a future edit wouldn't be caught. **Decision:** deferred to PR8's test pass — PR8 re-points the routes and adds the exhaustive browser-tap E2E on the export screen (which downloads the actual workbook), so per-sheet coverage is gained end-to-end there. Recorded so it isn't lost.

### T2 · Praise
The parity suite is genuine red-green, not smoke: deterministic clock injection (`getTodayStatus(now)`) at six boundary times, real `XlsxSpreadsheetExporter` round-trip through `XLSX.read`, exact-equality `.toEqual` on missing-days/dedup/label-maps/complaints, behaviour-through-the-public-interface.

## Depth verdicts (new/touched modules)
- `lib/ports/HaccpReportingRepository.ts` → **DEEP** — one fat read-only socket hiding 6 cross-table reads behind 6 named ops. Correctly one port, not six thin per-route ones.
- `lib/ports/SpreadsheetExporter.ts` → **DEEP + genuinely generic** — `toXlsxBuffer(sheets): Buffer`, zero HACCP vocabulary, no `xlsx` types leaked.
- `lib/services/HaccpReportingService.ts` → **DEEP** — 100% of shaping lives here; passes the deletion test (remove it and logic smears back into 6 routes).
- `lib/adapters/supabase/HaccpReportingRepository.ts` → **DEEP** — reads + CA-merges, maps vendor rows to owned types, no shaping.
- `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts` → appropriately thin vendor-confinement adapter.
- `lib/adapters/fake/HaccpReportingRepository.ts` → faithful test twin.

No PASS-THROUGH, no SPECULATIVE SEAM. Single-adapter-per-port is a proven seam (DB + Excel are real substitution points).

## Hexagonal boundary check
- No `lib/domain/**` or `lib/ports/**` imports `lib/adapters/**`. ✅
- `@supabase/supabase-js` confined to the supabase adapter; `xlsx` only in the xlsx adapter + the export route (PR8's job). ✅
- No new `package.json` entry (`xlsx@^0.18.5` pre-existing; justification comment at `XlsxSpreadsheetExporter.ts:17`). ✅
- Service-role only: `haccpReportingService` singleton, NO `…ForCaller` factory (pinned by wiring guard tests). Matches F-RLS-04h deferral. ✅

## Parity verdict — service matches all 6 routes (byte-identical)
| Route | Verdict | Notes confirmed |
|---|---|---|
| `today-status` | ✅ | overdue cutoffs 10/14/10/13/17/15, Fri-17:00 weekly, last-day monthly, training overdue/due-soon, `nowHour` server-local (faithful latent TZ quirk) |
| `overview` | ✅ | missing-days, by_species/by_code/dispositions maps, `Z`-suffixed CA window |
| `annual-review/data` | ✅ | 3.2 dedup keys, 3.4 `<82`, 3.6 latest-per-unit, 3.7 60-day window, 3.8 source/RC labels + sort, non-HACCP `complaints` present, 3.9 `next_review < today` |
| `audit/heatmap` | ✅ | 11 DayMaps, manual-only calibration deviation rule |
| `audit` (11 sections) | ✅ | summaries, dual process_room/reviews/training rows, `?? '—'` user fallback, `invertFail`, unknown-section → `{error}` |
| `audit/export` | ✅ | 14 tabs in order 01/02/03a/03b/04/05/06/07/08/09a/09b/10/11a/11b, headers/widths/cell shaping verbatim, CA column subsets (`CA_EXPORT` vs `CA_EXPORT_LITE`) per-sheet |

14-tab compliance requirement met — no sheet dropped, renamed, or reordered.

## Suite / lint / typecheck (verified independently by critic, then re-verified post-fix)
- Unit: `npx vitest run` → 2311 passed / 2311 (143 files). ✅
- Typecheck: `npx tsc --noEmit` → clean. ✅
- Lint: `npm run lint` → was RED on B1; **green after the B1 revert**. ✅
- Build: `next build` → clean. ✅
