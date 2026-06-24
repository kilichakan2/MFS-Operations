# Code-critic review — F-19 PR8 (Cluster E reporting re-point)

**Date:** 2026-06-24
**Branch / PR:** `feat/f19-pr8-cluster-e-reporting-repoint` / PR #75
**Base:** `main` (`7a01d34`)
**Phase:** FORGE Guard
**Verdict:** **CLEAR — no blockers. Hand to ANVIL.**

## Scope reviewed
PR8 flips 6 HACCP reporting routes off direct vendor calls (`supabaseService` / `import * as XLSX from 'xlsx'`) onto the `haccpReportingService` wiring singleton built + proved byte-identical in PR7 (#74). The PR7 service/ports/adapters are **not edited** by this PR — only the 6 routes, `.eslintrc.json`, and test files.

Routes: `audit`, `audit/export`, `audit/heatmap`, `overview`, `annual-review/data`, `today-status`.

## Findings
- **🔴 blockers:** none
- **🟡 should-fix:** none
- **🔵 nits:** none
- **🟢 deferred-ok / positive:** T1 export cell-assertion tests graded HIGH QUALITY (assert real cell values through the public service, refactor-survivable, not tautological).
- **Security findings:** none

## Depth verdicts (new/touched modules)
- `app/api/haccp/audit/route.ts` — **SHALLOW-BY-DESIGN ✅** (role check → require section → `getAuditSection` → 400-wrap unknown / return)
- `app/api/haccp/audit/export/route.ts` — **SHALLOW-BY-DESIGN ✅** (role check → `buildAuditWorkbook` → download headers)
- `audit/heatmap`, `overview`, `annual-review/data`, `today-status` — **SHALLOW-BY-DESIGN ✅** (role check → one service call → return)
- `lib/wiring/haccp.ts` — PR7 singleton only re-referenced, out of scope.

No PASS-THROUGH or SPECULATIVE SEAM introduced. Routes become *shallower* doormen over a deep, proven service — correct direction.

## Acceptance-criteria confirmations
1. **Byte-identical per route — CONFIRMED.** Only response-line change per route is the happy-path body becoming `NextResponse.json(result)` / the export body wrap. All 401 role checks, the overview `400` (`from and to date parameters required`), the audit `400` (`section param required`), and every outer `500 'Server error'` catch unchanged. `today-status` passes `new Date()` → service reproduces week-start/month-start clock logic (7 boundary tests).
2. **14 tabs in order — CONFIRMED.** `01/02/03a/03b/04/05/06/07/08/09a/09b/10/11a/11b` assembled in `HaccpReportingService.ts:1270–1553`, identical to main. Route adds zero workbook logic. Pinned by the "exactly 14 tabs in order + headers" test.
3. **Unknown-section → 400 — CONFIRMED.** Service returns `{ error: 'Unknown section: …' }` (`:1168`); route wraps `'error' in result` → HTTP 400 (`audit/route.ts:50-52`). `section param required` 400 survives (`:42-43`).
4. **R6 scoped to audit/route.ts only — CONFIRMED.** Exactly the per-section `*Err.message` 500 branches deleted (deliveries/training×/cleaning×/mince/reviews/cas/health), now falling through to the outer `'Server error'`. Other 5 routes had no raw-`.message` 500 response on main (removed lines were query destructurings that moved into the service). 400s + happy paths intact. Accepted house style — not flagged.
5. **xlsx confined to one file + full lint green — CONFIRMED.** `import * as XLSX` in production code only in `lib/adapters/xlsx/XlsxSpreadsheetExporter.ts` (two other hits are allow-listed test files). 3-part ban armed: base `no-restricted-imports`, services-override ban, `lib/adapters/xlsx/**` allow-list. Full `next lint` green.
6. **Rip-out / hexagonal — PASS.** Each route imports only `@/lib/wiring/haccp` + `next/server`; no `@supabase/*`, no `xlsx`, no reach past the singleton. Wiring service-role-only, no `…ForCaller` (pinned).
7. **Uint8Array byte-identical claim — CONFIRMED.** Adapter returns the same `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })` main produced inline. `new Uint8Array(buf)` copies element-for-element → identical length + bytes; `Content-Length` stays `String(buf.length)`.

## Tests / lint / types (run by code-critic)
- Reporting parity + T1 cell tests + xlsx adapter: **29/29 pass**
- Wiring pin (`tests/unit/wiring/haccpService.test.ts`): **6/6 pass** (incl. "service-role singletons ONLY — no `…ForCaller`")
- Adapter-import lint pin (`tests/unit/lint/no-adapter-imports.test.ts`): **49/49 pass**
- Full `npm run lint` (whole tree): ✔ no warnings/errors
- `npx tsc --noEmit`: clean

## Conductor action
No blockers → advance to ANVIL.
