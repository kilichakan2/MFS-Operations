# Guard Review — UI Phase 0b · Wave 3 (Overlays + Nav)

**Date:** 2026-06-29 · **PR:** #96 · **Branch:** feat/ui-0b-wave3-overlays-nav
**Reviewer:** code-critic (FORGE Guard) · **Verdict:** SHIP — no blockers. Hand to ANVIL.

## Scope
23 new files (11 `components/ui/*.tsx`, 11 `tests/component/ui/*.test.tsx`, 1 `app/dev/ui/GalleryOverlaysNav.tsx`) + 2 allowed edits (`components/ui/index.ts` barrel, `app/dev/ui/page.tsx` gallery wire). Presentation-only; no ports/adapters.

## Contract checks — all PASS
1. **Purely additive** — diff = 23 new + 2 allowed edits only; live AppHeader/BottomNav/DesktopSidebar/MoreDrawer + all screens + W1/W2 components untouched (zero-line diff).
2. **Tier-2 semantic tokens only** — token guard `semantic-tokens-only.test.ts` 2/2; independent greps found no `text-[Npx]`, no `bg-white/black`, no stock palette, no hex, no `mfs-*`.
3. **No style-leaking props (decision #17)** — no `className`/`style`/`width`/grid props exposed; all props semantic-intent (`tone`/`variant`/`orientation`/`size`/`active`/`expanded`) or `ReactNode` slots.
4. **No new dependency** — `package.json` zero-line diff; `radix-ui` pre-existing/allow-listed (Modal/Popover/DropdownMenu).
5. **Nav bricks presentational** — take `activeHref`/`expanded`/`sync`/`menu`/`onToggle` as props; grep confirms no `usePathname`/`useRouter`/`cookies`/`useSyncQueue`/`localDb`/`useLiveQuery` reads.
6. **Logo = caller ReactNode slot** — `AppHeader.tsx:6` + DesktopSidebar `logo?: ReactNode`, no baked `public/` path.
7. **ARIA / a11y assertions real** — every interactive test ends with executing `axe(...).toHaveNoViolations()` (not skip/todo/stub); ARIA defaults: Popover `'Popover'`, BottomNav `'Main navigation'`, DesktopSidebar `'Primary navigation'`, Modal close `'Close'`, Spinner `'Loading'`, Banner dismiss `'Dismiss'`.

## Depth verdicts (all DEEP)
- `Modal.tsx` — DEEP. One Radix-Dialog engine; `variant` selects centred vs bottom-sheet; hides focus-trap/ESC/scroll-lock/labelledby behind ~6 props.
- `MoreDrawer.tsx` — DEEP, genuine composition. Renders `<Modal variant="sheet">`; NO second sheet engine (confirmed not a parallel RadixDialog).
- `NavItem.tsx` — DEEP. Single cell composed three ways (`vertical`/`rail`/`list`) by BottomNav/DesktopSidebar/MoreDrawer; real Link-vs-button + active-accent + colour-by-surface branching.
- `Popover.tsx` / `DropdownMenu.tsx` — DEEP. Distinct Radix primitives (dialog-role panel vs `role=menu` roving focus); not duplicates.
- `AppHeader.tsx` / `BottomNav.tsx` / `DesktopSidebar.tsx` — DEEP. Slot-and-compose shells over NavItem; additive replacements of live chrome (not speculation).
- `Banner.tsx` / `Spinner.tsx` / `EmptyState.tsx` — DEEP. Small interface, real tone/role/size logic (Banner `role` flips `alert`/`status` by tone).

No PASS-THROUGH, no SPECULATIVE SEAM, no SHALLOW-where-it's-the-point.

## Two flagged in-component decisions — scrutinised
- (a) Popover `aria-label` default `'Popover'` (`Popover.tsx:33`) — 🟢 acceptable. Radix Content is `role="dialog"`, needs a name; default prevents an unnamed-dialog axe violation, caller can override.
- (b) MoreDrawer `<div onClick={onClose}>` wrapping each `<Link>` (`MoreDrawer.tsx:54-56`) — 🟢 no a11y regression. Inner `<Link>` keeps `role="link"` + is the focusable element; wrapper div has no role/tabIndex → no second tab stop, no nested-interactive. axe passes; test drives real click + confirms close fires.

## Findings
- 🟡 **`MoreDrawer.tsx:54`** — close-on-navigate relies on click bubbling to `div onClick`. Enter works (synthetic click bubbles); but **middle-click / Cmd+click** (open-in-new-tab) also fires `onClose`, dismissing the sheet unexpectedly. Low impact in a PWA. Consider gating on plain left-click or wiring close to route-change. **Non-blocking; zero live impact today (no consumers until Phase 1).**
- 🔵 **`AppHeader.tsx:25` + `BottomNav.tsx:61`** — inline `style={{ paddingTop/Bottom: 'env(safe-area-inset-*)' }}` for iOS notch. Justified (no token expression for safe-area insets; internal hardcode, not a caller prop → not a decision-#17 violation). Fold into a `safe-area` utility/token if one is ever added.
- 🟢 Behaviour-first tests throughout (drive via props, assert via roles/ARIA/text, real userEvent + Escape). 🟢 `Modal.tsx:97` conditional `aria-describedby` suppression mirrors live Picker recipe + has a covering test. 🟢 DropdownMenu/Modal/MoreDrawer/Popover tests include inline colour-leak regex on rendered HTML (defence-in-depth over the lint guard).

## Test / lint results
- `tests/component/ui/` (full, incl. 11 Wave-3 specs) + token guard: 34 files, **221/221 pass**, 0 fail (~4.9s).
- `tests/unit/lint/semantic-tokens-only.test.ts`: **2/2 pass** (positive scan + proven-negative).
- Implementer-reported full suite: 2947/2947, tsc clean, next lint clean, production build green.
