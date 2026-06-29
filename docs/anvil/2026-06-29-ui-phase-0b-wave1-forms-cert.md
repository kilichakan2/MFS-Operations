# ANVIL Clearance Certificate

Title: UI Phase 0b · Wave 1 (Forms)
Date: 2026-06-29
App: MFS-Operations
Branch: feat/ui-0b-wave1-forms
PR: #94 (base main)

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| components/ui/* (11 form components + index.ts barrel) | Low (presentation-only, no data/auth) | Unit/component (jsdom) | ✅ 79/79 |
| app/dev/ui/* (dev-only gallery, 3 files) | Low (dev-only, double-gated) | Build compiles + visual smoke | ✅ builds; visual smoke via local screenshots (see below) |
| tests/component/ui/* + tests/unit/tokens/density-vars.test.ts | n/a (test layer) | run as part of suite | ✅ included in 2807 |
| Design tokens (semantic layer usage) | Low | token guards | ✅ 13/13 |

**Not run (justified N/A — approved at matrix gate):** Integration, pgTAP/RLS, Deno edge, Playwright @critical E2E, PITR, architecture rung — no API/DB/auth/migration/seam in diff.
**Baseline characterisation pass?** No — diff-driven, additive new library.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit / Component (Vitest jsdom) | ✅ 79/79 | 11 files; keyboard/focus/ARIA/disabled/error + vitest-axe zero-violations each |
| Token guards (Vitest) | ✅ 13/13 | density-vars 4 · semantic-tokens-only 2 · token-resolve 7 |
| Full suite sanity (Vitest) | ✅ 2807/2807 (200 files) | No regression; +64 net new vs prior 2743 baseline |
| Type (tsc --noEmit) | ✅ clean | exit 0 |
| Lint (next lint) | ✅ clean | No ESLint warnings or errors |
| Build (next build) | ✅ green | Compiled successfully; /dev/ui compiles as a route |
| Visual smoke of /dev/ui | ✅ achieved (local) | Gallery rendered on local dev server (HTTP 200, zero console errors); full-page + 4 theme×density panel screenshots captured and reviewed by Hakan. Required a temporary, UNCOMMITTED middleware bypass (reverted; branch clean) because /dev/ui is in no role's permission list and 404s in production by design. |
| Integration / pgTAP / Deno edge / @critical E2E / PITR / architecture rung | n/a | No API/DB/auth/migration/seam in diff |

## Warnings (non-blocking)
- code-critic 🔵: IconButton danger hover bg == base bg (no visible hover change); a few redundant `.toBeDefined()` test assertions; PinKeypad physical-keyboard listener bound to `window` (digit mirrors across all gallery panels — expected, not a defect on real single-keypad screens).
- Visual 🔵 (conductor): in LIGHT mode the empty PIN dots are very low-contrast (clear in dark). Token tweak for a later wave.

## FOLLOW-UPS (recorded, not blocking this wave)
- **F-UI-GALLERY-01 — make /dev/ui reachable on Vercel PREVIEW deploys** (still 404 in real production) so Hakan can visually review Waves 2 & 3 from a preview link without a local bypass. Likely a preview-only gate (`VERCEL_ENV === 'preview'`) + a middleware allowance for `/dev`. Its own small FORGE follow-up.

## Migration
None. Rollback script: N/A. PITR confirmed: N/A.

## Architecture rung
N/A — diff crosses no seam (no domain/ports/adapters/vendor touched). Rip-out test N/A.

## Verdict
✅ CLEARED FOR PRODUCTION. All applicable layers green; the one earlier-named gap (live visual render of /dev/ui) was closed via a reviewed local screenshot capture. No blockers, no migration, no PITR.
