# Code-critic review — HACCP hub fixes + design-system governance

**Branch:** `fix/haccp-hub-touchups-ds-governance` vs `main` · **Date:** 2026-06-30 · **Phase:** FORGE Guard
**Verdict:** **NO BLOCKERS — hand to ANVIL.** (presentation + lint + docs only; no DB/port/adapter/vendor/dep)

## Test / lint / type
- `tsc --noEmit` clean · `next lint` clean
- StatusTile suite 9/9 (incl. new tap/keyboard/help tests)
- `reusable-visual-in-kit` guard + fixtures 3/3 · full `tests/unit/lint/` 123/123

## The three scrutiny items
1. **Tap fix (StatusTile) — CONFIRMED.** `onPointerDown`+`preventDefault` → `onClick` correctly fixes scroll-opens-tile (browser only synthesises click on a tap, not a scroll/drag); keyboard preserved (native button → Enter/Space); `active:scale` retained (CSS, handler-independent); no double-fire; new test strictly richer than old.
2. **ThemeLock save/restore — CONFIRMED, leak-free.** Saves prior `<html data-theme>` on mount, restores (`removeAttribute` if was null, else prior value) on unmount; StrictMode-safe (mount→cleanup→mount restores original before 2nd capture); layout stayed a server component (metadata intact); SSR shell carries `data-theme="dark"` + overlays open post-hydration ⇒ no flash. **DEEP / acceptable.**
3. **Governance guard NOT trivially bypassable — REFUTED (the 🟡).** Catches the canonical `MfsLogo`/`MfsIcon` shape but several common reusable-icon shapes evade the 4 regexes.

## 🟡 Warning (fixed in this branch before ship)
**`tests/unit/lint/reusable-visual-in-kit.test.ts` — guard misses common icon shapes.** Adversarial probe:
| Shape | Caught (before fix)? |
|---|---|
| `export default function X(){ return (<svg/>) }` | ✅ |
| `export const Star = (p) => (<svg/>)` | ✅ |
| `export const Star = () => { return (<svg/>) }` (block-body arrow) | ❌ evades |
| `export default function X(){ if(!ok) return null; return (<svg/>) }` (early return) | ❌ evades |
| `export default function X(){ return (<><svg/></>) }` (fragment) | ❌ evades |
| `export default forwardRef(function X(){ return (<svg/>) })` | ❌ evades |
| `export default memo(function X(){ return (<svg/>) })` | ❌ evades |
| `export const Star = <T,>(p) => (<svg/>)` (generic arrow) | ❌ evades |
Block-body arrow + early-return are the most idiomatic icon shapes → the guard's deterrent value was much smaller than it looked. **→ FIXED:** rewrote detection to brace-match each exported component's own body + an svg-root return check (`<svg` directly after `return (`/`=>`, optionally through a fragment), and normalise away `forwardRef`/`memo` wrappers. All 8 shapes now caught; negatives (`Ic` local helper, nested decorative `<div><svg>`, `HaccpRoot`) still green. Evasion shapes added as positive fixtures.

## 🔵 Note
**`app/haccp/ThemeLock.tsx` — global `<html>` mutation has one staleness edge:** it captures `prev` on mount; if another writer changed `<html data-theme>` while HACCP is mounted, restore-on-exit would clobber the newer value. No such writer exists on the kiosk route today. **→ one-line ownership comment added.**

## 🟢 Test-quality
- StatusTile test pinned Enter only, not Space (native button fires click on both) → **Space assertion added.**
- The help button's `stopPropagation` is dead-defensive (help button is a DOM sibling of the tile button, not a child — bubbling can't reach the tile). Harmless hygiene; left as-is.

## Design-system / hexagonal
`package.json` untouched (no new dep). No port/adapter/vendor/domain code. Brand assets now in `components/ui/`, barrel-exported, all 3 importers consume from the kit; zero direct-wire. `git mv` preserved MfsLogo byte-for-byte. 2 header swaps correct (home ~386, responsive ~718); login watermark ~821 left as wordmark. #17 honoured (MfsIcon `currentColor` + tokens, no leak). ADR-0014 Rule 1/3 operationalised and now lint-enforced.
