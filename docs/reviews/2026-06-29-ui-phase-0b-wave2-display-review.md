# Code review — UI Phase 0b · Wave 2 (Display)

- **PR:** #95 `feat/ui-0b-wave2-display`
- **Reviewer:** FORGE Guard (code-critic subagent)
- **Date:** 2026-06-29
- **Plan:** `docs/plans/2026-06-29-ui-phase-0b-wave2-display.md`

## Verdict: SHIP — no blockers. Handed to ANVIL.

Purely-additive presentation work: 11 new display components + `accent.ts` helper under
`components/ui/`, 11 jsdom+vitest-axe test files, a dev-only `GalleryDisplay.tsx`, and 2
allowed edits (`components/ui/index.ts` barrel, `app/dev/ui/page.tsx` gallery wire). No
security/correctness/architecture/token-leak issues.

## Gate results (rejection criteria)

| Check | Result |
|---|---|
| 1. Purely additive | ✅ PASS — `git diff --name-only main` = 24 new + exactly the 2 allowed edits; `primitives.tsx`/existing components/screens untouched |
| 2. Tier-2 semantic tokens only | ✅ PASS — no hex, no `mfs-*`, no stock palette, no `text-[Npx]` in any of 12 `components/ui/**` files; guard `walkUi` covers them, 2/2 |
| 3. No style-leaking props | ✅ PASS — no `className`, `widths`, grid-template, or inline `style`; intent props only |
| 4. No new dependencies | ✅ PASS — package.json/lockfile unchanged, no Radix |
| 5. Accessibility | ✅ PASS — real awaited `toHaveNoViolations()` per component; ARIA optional w/ English defaults; icons caller `ReactNode` |
| 6. Test quality | ✅ PASS — behaviour + token-class assertions; Table anti-leak + SegmentedControl no-tab-roles tests real |
| 7. No-AI-references | ✅ PASS — clean in commits and code/comments |

## Suite
- Component lane (`vitest run tests/component/ui`): 138/138 pass (22 files incl. Wave-1)
- Token guard (`semantic-tokens-only.test.ts`): 2/2 (incl. proven-negative "rule has teeth")
- `tsc --noEmit`: clean (exit 0)
- `npm run build`: green (run in conductor env)

## Specially-flagged tests
- `tests/component/ui/Table.test.tsx:76` — anti-leak: asserts `[style]` null AND no `grid-template`/`gridTemplate` in innerHTML; real `<table>/<thead>/<tbody>/<th scope=col>/<td>` + ARIA table/columnheader/cell roles.
- `tests/component/ui/SegmentedControl.test.tsx:49` — asserts `tabpanel`/`tablist`/`tab` roles all null; `role="group"` + `aria-pressed` + real `userEvent` keyboard activation.

## Implementer-flagged deviations — all confirmed sound
- Badge built before CardHead (CardHead composes Badge at `CardHead.tsx:36`) — sequence only.
- Badge `tone='navy'` → `text-action-secondary` on `bg-surface-sunken`/`border-default` (`Badge.tsx:27`) — token-clean; no `status-navy` family exists.
- SyncDot `role="status"` + aria-label (`SyncDot.tsx:56-57`) — presentation-only; caller still computes `state`.

## Depth verdict
DEEP: `accent.ts`, `KpiTile`, `Table`, `SyncDot`. DEEP-ish: `CardHead`. Adequate: `Card`,
`SegmentedControl`, `Badge`, `StatusPill`, `ListRow`. SHALLOW (borderline, 🔵 not a blocker):
`SectionLabel`, `PageHeading` — intentional token-binding atoms. No PASS-THROUGH and no
SPECULATIVE SEAM introduced by this diff.

## Findings
### 🔴 Blockers — none
### 🟡 Should-fix — none
### 🔵 Nice-to-have (non-blocking, no loop-back)
- `CardHead.tsx:30`, `KpiTile.tsx:77`, `SectionLabel.tsx:12`, `PageHeading.tsx:16`, `Table.tsx:72` — arbitrary `tracking-[…]` letter-spacing values; legal (guard bans colour + font-size only). If a `tracking-*` token scale is ever added, fold these in.
- `app/dev/ui/GalleryDisplay.tsx:33,53` — `text-[10.5px]`/`text-[12px]` in dev-only showroom chrome (outside guard scope, dev page). Could use `text-caption` for consistency.
### 🟢 Good
- All 11 test files assert real behaviour AND the specific semantic-token class (e.g. `Badge.test.tsx:19` → `bg-status-success-soft`; `KpiTile.test.tsx:21` table-drives all 4 accents) — makes "no hex leak" genuinely tested.
- `SegmentedControl.test.tsx:33` real `userEvent` keyboard activation; `SyncDot.test.tsx:25,44` covers `clean`→renders-nothing edge + axe across states.
