# UI Phase 0b · Wave 3 — OVERLAYS + NAV (precision execution plan)

> **GATE 2 APPROVED 2026-06-29 — render approved by Hakan. Build exactly as specified.**

> **FORGE plan, written for an implementer who cannot see the planning conversation.**
> Every path, name, prop, and test case is spelled out. Build EXACTLY what is here.
> If anything below is wrong against the live files, STOP and flag the conductor — do not improvise.

**Date:** 2026-06-29 · **Branch to cut from `main`:** `feat/ui-0b-wave3-overlays-nav`
**Scope:** Wave 3 of 3 (Overlays + Nav) — the LAST wave of the 0b core component library.
**NOT** Waves 1 (Forms, shipped PR #94) or 2 (Display, shipped PR #95).

🗣 In plain English: Wave 1 built the form bricks (buttons, inputs); Wave 2 built the display bricks
(cards, tables, pills). Wave 3 builds the *chrome* bricks — pop-up dialogs, banners, spinners, empty
states, menus, and the navigation frame (top bar, bottom tabs, side rail). Same proven recipe as Waves
1 and 2: new files only, a private showroom to eyeball them, one accessibility test each. We touch zero
live screens; the app's existing header/nav/modals get re-pointed onto these later (Phase 1), not now.

---

## 0 · Mini-map

```
DOMAIN (core logic) — NOT TOUCHED this wave
PRESENTATION (this is ALL presentation — no domain/ports/adapters)
  components/ui/   ← W1+W2 box; ADD 11 overlay+nav bricks (Modal…NavItem)
  app/dev/ui/      ← existing showroom; ADD an Overlays+Nav section
  reuses: semantic tokens (0a) · radix-ui Dialog/Popover/DropdownMenu (allow-listed 0a) · tokens.css keyframes
🗣 a new shelf of chrome parts in the same box + a showroom panel — zero live screens change, zero new deps
```

---

## 1 · Goal

Build **11 additive overlay + navigation** components in `components/ui/`, each bound to **semantic
Tier-2 tokens only** (the same token layer W1/W2 use — NOT the `mfs-*` tokens the live chrome uses; see
§3 + the deviation note in §12), each WCAG-AA, each with a jsdom component test plus a `vitest-axe`
zero-violations assertion. Plus a **`GalleryOverlaysNav.tsx`** section wired into the existing dev-only
`/dev/ui` gallery, rendering every Wave-3 component in its states across the four theme × density panels.

🗣 In plain English: make 11 clean, reusable chrome widgets that match the agreed design, prove each is
accessible with an automated test, and show them in the hidden showroom. Nothing ships to a real screen
yet.

**Hard boundary (locked at Gate 1): PURELY ADDITIVE.** After Render, `git diff --name-only main` must
show ONLY:
- new `components/ui/*.tsx` (11 component files),
- new `tests/component/ui/*.test.tsx` (11 test files),
- new `app/dev/ui/GalleryOverlaysNav.tsx` (1 file),
- **PLUS exactly two allowed edits:** `components/ui/index.ts` (barrel additions) and
  `app/dev/ui/page.tsx` (wire in `<GalleryOverlaysNav />`).

**NOTHING ELSE.** The live chrome — `components/AppHeader.tsx`, `components/BottomNav.tsx`,
`components/DesktopSidebar.tsx`, `components/MoreDrawer.tsx`, `components/DetailModal.tsx`,
`components/EditLockBanner.tsx`, `components/OrderCutoverBanner.tsx`, `components/RoleNav.tsx`,
`app/dashboard/admin/_components/primitives.tsx`, every Wave-1 and Wave-2 component, every screen — ALL
UNTOUCHED. Merging Wave 3 must change no screen behaviour.

🗣 In plain English: the only two existing files you may edit are the "index" that lists the parts and
the showroom page that displays them. Everything else is hands-off — especially the live `AppHeader`,
`BottomNav`, `DesktopSidebar`, and `MoreDrawer`, which we are deliberately *not* re-pointing here (Phase
1 swaps the screens onto these new parts).

---

## 2 · Domain terms / vocabulary used in this plan

- **Semantic Tier-2 token** — a purpose-named CSS variable surfaced as a Tailwind utility
  (`bg-surface-overlay`, `text-muted`, `border-default`, `bg-status-warning-soft`). 🗣 A labelled paint
  pot ("overlay background", "muted text") — change the pot once, every brick repaints.
- **Tier-1 brand primitive** (`bg-mfs-navy`, `text-mfs-orange`, the `mfs-*` utilities) — **BANNED**
  inside `components/ui/**` by the live lint test (`tests/unit/lint/semantic-tokens-only.test.ts`). 🗣 The
  raw colour-mixing tray. The live `AppHeader`/`BottomNav`/`DesktopSidebar` reach for it; our new
  components must NOT — they use the labelled pots instead. This is the single biggest difference from the
  live chrome.
- **Radix Primitives** (`radix-ui`, ONE namespaced package, allow-listed since 0a) — the accessibility
  engine for the three interactive overlays (Modal=Dialog, Popover, DropdownMenu). Imported as
  `import { Dialog as RadixDialog } from 'radix-ui'` (see `components/ui/Picker.tsx` for the exact
  established pattern). 🗣 A pre-built, keyboard-and-screen-reader-correct skeleton for pop-ups; we paint
  it with our tokens. NOT a new dependency — already in `package.json` and used by W1.
- **Variant / intent prop** — a small semantic-intent enum the caller passes (`variant='center'|'sheet'`,
  `tone='info'|'warning'|'danger'|'success'`, `size='sm'|'md'`). Mapped to tokens *inside* the component.
  🗣 The caller says "this is a warning" or "this is a bottom-sheet"; the component decides the look. No
  colour/layout class ever crosses the boundary.
- **Style-leaking prop** — any prop that lets a caller pass raw layout/colour (`className`, inline
  `style`, `width`, `gridTemplateColumns`, hex). **FORBIDDEN** (decision #17). 🗣 A hole in the wall that
  lets a screen smuggle in its own paint — defeats "change one token, every screen follows". The live
  chrome has these holes (hardcoded `bg-mfs-navy`, fixed `w-60`); Wave 3 closes them behind semantic
  props.
- **`sheet` variant reuse** — `MoreDrawer` does NOT ship its own pop-up engine; it renders `Modal` with
  `variant="sheet"`. 🗣 One bottom-sheet engine, two consumers — not two copies. The brief is explicit:
  "MoreDrawer consumes Modal's `sheet` variant — not a second engine."

---

## 3 · Sources of truth read (and what they bind)

| Source | What it locks |
|--------|---------------|
| `components/ui/Button.tsx` | The house pattern: `'use client'`, named export + exported prop interface, local `cx(...)` helper (NO `clsx`/`tailwind-merge` dep), `Record<Variant, string>` class maps, semantic tokens only, `forwardRef` where a single DOM element is wrapped. Copy this shape. |
| `components/ui/Picker.tsx` | **THE Radix-Dialog reference** (the W1 sheet-style dialog). Locks: `import { Dialog as RadixDialog } from 'radix-ui'`; `RadixDialog.Root/Portal/Overlay/Content/Title/Close`; the `aria-describedby={undefined}` on Content (suppresses the missing-description a11y warning); overlay `bg-[var(--text-body)]/50` (an arbitrary CSS-var class — PASSES the lint guard, it is not hex/stock/`mfs-*`); inline-SVG close icon (no icon lib); `labels?` optional-ARIA pattern with English defaults. **Modal copies this structure.** |
| `components/ui/Toggle.tsx` / `Radio.tsx` / `Checkbox.tsx` / `Select.tsx` | The other Radix usages — confirm the `import { X as RadixX } from 'radix-ui'` namespaced form and the `data-[state=…]` styling hook pattern. Popover + DropdownMenu mirror this. |
| `components/ui/index.ts` | The barrel pattern: one `export { X } from './X'` + one `export type { XProps, … } from './X'` per component. Append a Wave-3 block in the same style after the Wave-2 block. |
| `tests/component/ui/Card.test.tsx` + `SegmentedControl.test.tsx` | The EXACT test recipe: `render, screen` from `@testing-library/react`, `userEvent`, `axe` from `vitest-axe`; a semantic-class assertion (proves no hex leak); a `toHaveNoViolations` axe case; for interactive parts, click/keyboard + ARIA-role assertions. Tests live in **`tests/component/ui/`**. Copy per component. |
| `app/dev/ui/page.tsx` + `GalleryFrame.tsx` + `GalleryForms.tsx` + `GalleryDisplay.tsx` | The gallery wiring: `page.tsx` is a server component that `notFound()`s in production and renders `<GalleryFrame>{sections}</GalleryFrame>`. `GalleryFrame` paints the four `data-theme`×`data-density` panels. `GalleryDisplay.tsx` is the W2 `'use client'` body — **mirror it exactly** as `GalleryOverlaysNav.tsx`, including the inline-SVG demo-icon `Group` helper and the local `useState` for interactive demos. |
| `components/AppHeader.tsx` (live, line 27 SyncDot, 49 DotMenu, 224 header) | **REFERENCE ONLY — DO NOT EDIT.** The behaviour `AppHeader` (W3) generalizes: sticky top bar, logo slot, title, sync-dot slot, actions slot, a kebab/dropdown menu. The live one hardcodes `bg-mfs-navy`, `text-mfs-orange`, `lucide-react` icons, reads cookies/queue — W3 replaces all of that with semantic tokens, `ReactNode` slots, and caller-supplied data (no data fetching inside). |
| `components/BottomNav.tsx` (live) | **REFERENCE ONLY.** The behaviour `BottomNav` (W3) generalizes: fixed bottom bar, N tab cells (`Link` + icon + label + active 3px bar + `aria-current`), an optional "More" overflow cell firing `onOpenMore`. Live one hardcodes `bg-white`, `text-mfs-orange`, `lucide-react` `MoreHorizontal`. W3 uses semantic tokens + `ReactNode` icons. The live `NavItem` interface (`{href,label,icon,desktopOnly?}`) informs our `NavItem` component's props. |
| `components/DesktopSidebar.tsx` (live) | **REFERENCE ONLY.** The behaviour `DesktopSidebar` (W3) generalizes: fixed left rail, collapsed/expanded width, active item bar, label fade. **DECISION (§6.10):** W3's `DesktopSidebar` is a *presentational* rail — it takes `items` + `expanded?` + `onToggle?` and renders; it does NOT own the hover-peek timers or pin state-machine (that is screen/RoleNav orchestration logic, not a reusable presentational seam). Keep it deep but presentational. |
| `components/MoreDrawer.tsx` (live) | **REFERENCE ONLY.** The behaviour `MoreDrawer` (W3) generalizes: a bottom sheet listing overflow nav rows, ESC/backdrop close, optional "DESKTOP" badge. **W3's MoreDrawer renders `Modal` with `variant="sheet"`** (the brief's rule) and composes `NavItem` rows + the W2 `Badge` for the DESKTOP tag — it does NOT re-implement a sheet. |
| `components/EditLockBanner.tsx` + `OrderCutoverBanner.tsx` (live) | **REFERENCE ONLY.** The behaviour `Banner` (W3) generalizes: a coloured inline alert with an icon + message, in neutral/warning/danger (and success/info) tones. Live one hardcodes `bg-amber-50`/`bg-red-50`/`bg-slate-100` (stock palette — banned in `ui/`). W3 maps a `tone` prop to status `-soft`/`-text`/`-border` tokens. |
| `components/RecentActivity.tsx` (live, EmptyState-ish + Spinner-ish usage) | **REFERENCE ONLY.** Confirms the app has real empty-state and inline-spinner usage (not speculative seams). |
| `app/tokens.css` lines 122–130 (keyframes) | Pre-built 0a keyframes ready to reuse: `mfs-spin` (Spinner), `mfs-pulse`, `mfs-ring`/`mfs-dotpulse` (sync), `mfs-fade`/`mfs-toastin` (overlay enter). Reference them via `animate-[mfs-spin_0.7s_linear_infinite]` (an arbitrary-animation utility — PASSES the lint guard; the Button already uses `animate-[mfs-spin_…]`). |
| `tailwind.config.ts` lines 11–181 | The semantic utilities available (enumerated in §4 below). |
| `tests/unit/lint/semantic-tokens-only.test.ts` lines 34–40 | The live guard. Bans `#hex`, stock palette (`bg-blue-500`/`bg-amber-50`), and **Tier-1 brand primitives** `-mfs-(navy\|orange\|maroon\|red\|sand\|soft\|ink\|neutral\|kds)`. Wave-3 files must trip NONE. **Note: arbitrary `bg-[var(--…)]`, `text-[14px]`, `animate-[mfs-spin_…]`, `w-[46px]` all PASS** — the guard only matches hex literals, stock palette utilities, and `-mfs-*` utilities. |
| ADR-0002 / ADR-0009 | ADR-0002 (hexagonal) not engaged (presentation, no port/adapter). ADR-0009 (Radix + component-test stack) honoured — Modal/Popover/DropdownMenu use the allow-listed `radix-ui` (NO new dep). |

🗣 In plain English: `Button` is the template every new file copies; `Picker` is the exact recipe for a
Radix pop-up (Modal copies it); the barrel and gallery show how to register and show a new part; the live
`AppHeader`/`BottomNav`/`DesktopSidebar`/`MoreDrawer`/`EditLockBanner` show what each chrome part should
*do* but use the old paint names and an icon library — we keep the behaviour and switch to labelled paint
and caller-supplied icons.

### ⚠️ Prompt-vs-reality correction (read before writing any class) — IDENTICAL to W2
The W1/W2 convention some briefs reference is "resolve through `mfs-*` semantic tokens." **That is the
live-chrome convention and it is BANNED in `components/ui/**`.** The live lint guard
(`semantic-tokens-only.test.ts`) RED-fails on any `-mfs-*` utility, any `#hex`, and any stock-palette
utility (`bg-amber-50`, `bg-white`, `bg-slate-100`). **Use the Tier-2 semantic tokens W1/W2 use**
(`bg-surface-overlay`, `text-muted`, `border-default`, `bg-status-warning-soft`, …). This plan specifies
the semantic-token classes throughout. 🗣 The live header/nav use the wrong paint-pot names *and* stock
colours; the robot referee only accepts the new names, so we use those. This is the headline deviation
from the live chrome (§12).

---

## 4 · The exact semantic tokens these components need (Step-0 recon, confirmed against `tailwind.config.ts`)

All resolve through `var(--…)` CSS variables; the `mfs-*` aliases for the same vars are FORBIDDEN here.

**Surfaces:** `bg-surface-base` · `bg-surface-raised` (card/menu background) · `bg-surface-sunken`
(muted fill / badge) · `bg-surface-overlay` (modal/sheet/menu/popover panel background) ·
`bg-surface-inverse` (the navy header/sidebar fill — see the **inverse-chrome note** below).
**Text:** `text-body` · `text-muted` · `text-subtle` (captions/labels) · `text-on-action` ·
`text-inverse` (text ON the inverse/navy chrome) · `text-link`.
**Borders:** `border-default` (`border` DEFAULT) · `border-strong` · `border-subtle`.
**Action:** `bg-action-primary` / `text-action-primary` (the orange brand — active nav item) ·
`bg-action-secondary` / `text-action-secondary` (navy fill).
**Status families** (each `-fill` / `-soft` / `-text` / `-border`): `status-success-*`,
`status-warning-*`, `status-error-*`, `status-info-*`, `status-neutral-*`, `status-deviation-*`.
**Type ramp (`fontSize` keys):** `text-h1`/`h2`/`h3` (modal title) · `text-body`/`body-lg`/`body-sm` ·
`text-caption` (uppercase labels / nav labels).
**Fonts:** `font-display` (modal title optional) · `font-text` (everything else).
**Radius:** `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` / `rounded-pill` (+ arbitrary
`rounded-t-[18px]` for the sheet top, mirroring `Picker`).
**Shadow:** `shadow-sm` / `shadow-md` / `shadow-lg`.
**Focus:** `focus-visible:ring-2 focus-visible:ring-focus-ring` (interactive ones).
**Keyframes (pre-built, `app/tokens.css`):** `animate-[mfs-spin_0.7s_linear_infinite]` (Spinner) ·
`animate-[mfs-fade_0.2s_ease-out]` (overlay enter) · `animate-pulse` (Tailwind built-in, used by SyncDot).

### ⚠️ Inverse-chrome decision (AppHeader / DesktopSidebar background) — STATE EXPLICITLY
The live header and sidebar are **navy with white content** (`bg-mfs-navy text-white`). In `components/ui/**`
that must be expressed in semantic tokens. **Use `bg-surface-inverse` + `text-inverse`** for the
header/sidebar chrome fill and its content (the inverse surface IS the dark/navy chrome surface in the
token system — confirmed present in `tailwind.config.ts` line 18 + the `text-inverse` token line 24). The
active nav item uses `text-action-primary` (the orange) for its icon/label + an `bg-action-primary` 3px
bar. 🗣 Navy bar with white text = "inverse surface + inverse text" in the new vocabulary; the active tab
glows orange via the brand action token. If, during Render, `bg-surface-inverse`/`text-inverse` does NOT
resolve to the navy/white pairing the design intends (check `/dev/ui` visually), STOP and flag — do not
fall back to `bg-mfs-navy` (it would RED the lint guard).

🗣 In plain English: the components need overlay/menu surfaces, status colours for banners, the navy
"inverse" surface for the header/sidebar, the orange action colour for the active tab, and the pre-built
spin/fade animations. All already exist as labelled pots — no new tokens needed.

---

## 5 · Exact file tree to create

```
components/ui/
  Modal.tsx            ← Radix Dialog, variant: 'center' | 'sheet'   (NEW)
  Banner.tsx           ← inline alert, tone: neutral|info|warning|danger|success  (NEW)
  Spinner.tsx          ← inline loading spinner, size sm|md|lg  (NEW)
  EmptyState.tsx       ← icon + title + message + optional action  (NEW)
  Popover.tsx          ← Radix Popover  (NEW)
  DropdownMenu.tsx     ← Radix DropdownMenu  (NEW)
  AppHeader.tsx        ← presentational top bar (logo/title/sync/actions/menu slots)  (NEW)
  BottomNav.tsx        ← presentational bottom tab bar  (NEW)
  MoreDrawer.tsx       ← consumes Modal variant="sheet"  (NEW)
  DesktopSidebar.tsx   ← presentational left rail (expanded? + onToggle?)  (NEW)
  NavItem.tsx          ← single nav row/cell (shared by BottomNav/Sidebar/MoreDrawer)  (NEW)
  index.ts             ← EDIT: append Wave-3 exports (one of the 2 allowed edits)

app/dev/ui/
  GalleryOverlaysNav.tsx  ← NEW: 'use client' — renders every Wave-3 component in its states
  page.tsx                ← EDIT: import + render <GalleryOverlaysNav /> after <GalleryDisplay /> (2nd allowed edit)

tests/component/ui/
  Modal.test.tsx       Banner.test.tsx     Spinner.test.tsx
  EmptyState.test.tsx  Popover.test.tsx    DropdownMenu.test.tsx
  AppHeader.test.tsx   BottomNav.test.tsx  MoreDrawer.test.tsx
  DesktopSidebar.test.tsx  NavItem.test.tsx
```

**File count:** 11 components + 11 tests + 1 `GalleryOverlaysNav.tsx` = **23 NEW files**, plus **2 edits**
(`index.ts`, `page.tsx`). (No shared helper module like W2's `accent.ts` is needed — `NavItem` is the
shared composition unit, and it is a full component, not a helper.)

**Build order (each = one atomic commit; write the test alongside, red→green):**
`NavItem` → `Modal` → `Banner` → `Spinner` → `EmptyState` → `Popover` → `DropdownMenu` → `BottomNav` →
`MoreDrawer` → `DesktopSidebar` → `AppHeader`. (NavItem first because BottomNav/Sidebar/MoreDrawer compose
it; Modal early because MoreDrawer composes it.)

**Conventions for every component (match W1/W2 / `Button.tsx` / `Picker.tsx`):**
- `'use client'` at the top of every file (overlays have state; nav uses `usePathname`/`Link`; mark all
  `'use client'` for consistency with the box + because the gallery imports them into a client tree).
- TypeScript. Export a named component AND its props interface (`export interface ModalProps`).
- Local `cx(...)` helper per file (copy from `Button.tsx`/`Table.tsx`) — do NOT add a dep.
- `forwardRef` only where a single focusable/ref-able DOM element is wrapped — NONE strictly need it for
  Wave 3 (Radix manages its own refs internally). Skip `forwardRef` unless a test requires it.
- **Semantic tokens only** (§4). NO `mfs-*`, NO hex, NO stock palette (`bg-white`/`bg-amber-50`/`bg-slate-*`).
  Arbitrary `bg-[var(--…)]`, `animate-[mfs-spin_…]`, `rounded-t-[18px]`, `w-[…px]` are allowed (they pass
  the guard).
- **NO style-leaking props** (decision #17). Do NOT expose a generic `className` or inline `style` prop on
  ANY Wave-3 component. No `width`, no colour string, no hex. Only semantic-intent props
  (`variant`/`tone`/`size`/`active`/`expanded`/`align`).
- Icons: caller-supplied `ReactNode` props. NO icon library added to `package.json` (the live chrome uses
  `lucide-react`; our `ui/` versions take icons as `ReactNode` slots). The gallery uses inline demo SVGs.
- Logo: **caller-supplied `ReactNode` slot** (see §6.7 + the logo decision below). NO fixed `public/` path
  baked into `AppHeader`.
- ARIA labels: optional props with sensible English defaults (per §6 each); Phase-1 passes `t()` strings.
- Radix: `import { Dialog as RadixDialog } from 'radix-ui'` etc. — the namespaced single-package form.

### ⭐ Logo-slot decision (STATE EXPLICITLY — answers the brief's question)
**Decision: the logo comes in as a caller-supplied `ReactNode` slot** (`AppHeader` prop `logo?: ReactNode`,
`DesktopSidebar` may take a `logo?: ReactNode` if its design shows one). **AppHeader does NOT reference a
fixed `public/` path.** Rationale — this is the only choice consistent with decision #17 + the
caller-supplied-icon rule: a hardcoded `<img src="/brand/logo-orange.svg">` would (a) bake a screen-level
asset path into a presentational brick, (b) couple the component to exact filenames that don't exist yet
(the 7 brand SVGs are a Render prerequisite, see §13), and (c) prevent a caller from passing a different
logo (e.g. white-on-navy vs navy-on-white per theme) — a style decision leaking the wrong way. With a
`ReactNode` slot, Phase-1 screens (and the gallery) pass whatever logo element they want; the brick stays
asset-agnostic. The live `AppHeader` imports `MfsLogo` directly — W3 inverts that to a slot. 🗣 The header
has a picture-frame hole; the screen hangs whichever logo it wants. We never nail one specific picture
into the frame.

🗣 In plain English: 11 chrome widget files, 11 tests, one showroom section. Copy `Button`'s shape for the
plain ones and `Picker`'s shape for the Radix pop-ups. Crucially — do NOT give these components a
free-form `className`/`style` or any colour/width prop; the logo and all icons come in as `ReactNode`
slots, never baked-in file paths.

---

## 6 · Per-component spec (props are SEMANTIC-INTENT ONLY · Radix-or-plain + why · tokens · tests)

> Build order = §5. Mirror the live-chrome *behaviour*; mirror `Button.tsx`/`Picker.tsx` *structure*; use
> §4 *tokens*.

### 6.1 `NavItem` *(generalizes BottomNav cell / DesktopSidebar row / MoreDrawer row — the shared nav unit)*
- **Radix? NO** — Next `<Link>` (or a `<button>` when `onClick` given instead of `href`).
- **Behaviour:** one navigation cell/row. Renders icon (caller `ReactNode`) + label. `active` →
  highlighted (orange icon/label + the 3px accent bar). An `orientation` chooses the layout the three
  consumers need: `'vertical'` (BottomNav cell: icon-over-label, centred, `aria-current`),
  `'rail'` (DesktopSidebar row: icon column + fading label), `'list'` (MoreDrawer row: icon + label +
  optional trailing `badge` slot). 🗣 One nav brick that knows three poses — a bottom-tab, a side-rail
  row, and a drawer list row.
- **Tokens:** active icon/label `text-action-primary`; inactive `text-inverse` (on the inverse chrome) or
  `text-muted` (on a light surface — controlled by `onInverse?: boolean`, a semantic flag, default false);
  the active 3px bar `bg-action-primary`; label `text-caption font-semibold uppercase tracking-[0.05em]`
  (vertical) or `text-body-sm font-medium` (rail/list); focus `focus-visible:ring-2 focus-visible:ring-focus-ring`.
- **Props:** `{ href?: Route; onClick?: () => void; icon: ReactNode; label: ReactNode; active?: boolean;
  orientation?: 'vertical' | 'rail' | 'list'; onInverse?: boolean; badge?: ReactNode; 'aria-current'?:
  'page' | undefined }`. Import `type { Route } from 'next'`. Exactly one of `href`/`onClick` is expected.
- **Tests:** renders icon + label; with `href` renders a `<link>` to href (and sets `aria-current="page"`
  when `active`); with `onClick` renders a `<button>` firing onClick; `active` applies
  `text-action-primary`; `orientation='list'` renders the `badge` slot when given; class contains no
  hex/stock/`mfs-*`; axe zero violations.

### 6.2 `Modal` *(generalizes DetailModal + Picker sheet — THE overlay engine, ONE component, `variant` prop)*
- **Radix? YES** — `radix-ui` `Dialog` (the allow-listed pattern; copy `components/ui/Picker.tsx`
  structure verbatim: `RadixDialog.Root/Portal/Overlay/Content/Title/Close`, `aria-describedby={undefined}`
  on Content). 🗣 Radix Dialog gives focus-trap, ESC-close, scroll-lock, and `role="dialog"`/`aria-modal`
  for free — exactly the keyboard traps you must not hand-roll.
- **THE DECISION (brief-locked):** ONE component with a **`variant` intent prop**:
  - `variant='center'` → desktop-style centred dialog: `Content` fixed `top-1/2 left-1/2 -translate-…`,
    `max-w-[…]` semantic width, `rounded-xl bg-surface-overlay shadow-lg border border-default`.
  - `variant='sheet'` → mobile bottom-sheet: `Content` fixed `inset-x-0 bottom-0 max-h-[85vh]
    rounded-t-[18px] bg-surface-overlay shadow-lg border border-default border-b-0`, plus the drag-handle
    pill (copy `Picker` lines 130–132). **`MoreDrawer` consumes THIS variant** — there is no second sheet
    engine.
  - Default `variant='center'`.
- **Behaviour:** controlled `open`/`onOpenChange`; optional `title` (rendered in `RadixDialog.Title`);
  optional `description` (if absent, keep `aria-describedby={undefined}`); a close button (inline-SVG X,
  copy `Picker`); `children` is the body. Overlay `bg-[var(--text-body)]/50` + `animate-[mfs-fade_…]`.
- **Tokens:** as above; title `font-text text-h3 font-semibold text-body` (or `font-display` if the design
  shows a display face — default `font-text`); close button `text-subtle border border-default rounded-full
  focus-visible:ring-2 focus-visible:ring-focus-ring`.
- **Props:** `{ open: boolean; onOpenChange: (open: boolean) => void; variant?: 'center' | 'sheet';
  title?: ReactNode; description?: ReactNode; children: ReactNode; labels?: { close?: string } }`.
  Default close label `'Close'`. **NO `className`/`width` prop** — width is owned by the variant.
- **Tests:** when `open`, renders `role="dialog"` with `aria-modal`; `title` appears as the accessible
  name; the close button (`aria-label="Close"`) fires `onOpenChange(false)` on click; ESC fires
  `onOpenChange(false)` (Radix native — assert via `userEvent.keyboard('{Escape}')`);
  `variant='sheet'` renders the bottom-sheet positioning class (`bottom-0`) + the drag handle;
  `variant='center'` renders the centred positioning; closed (`open=false`) renders nothing in the
  document body; no hex/stock/`mfs-*`; axe zero violations on the open dialog.
  *(jsdom note: Radix Dialog portals into `document.body`; query with `screen`/`within(document.body)`,
  not `container` — see the SegmentedControl/Picker test approach. If a Radix Dialog needs `ResizeObserver`/
  `matchMedia` polyfills in jsdom, add them to `tests/component/setup.ts` ONLY if a test fails — and FLAG
  it, since `setup.ts` is outside the 23+2 file budget; coordinate with the conductor before editing it.)*

### 6.3 `Banner` *(generalizes EditLockBanner + OrderCutoverBanner — inline alert)*
- **Radix? NO** — plain `<div role="status">` (or `role="alert"` for danger).
- **Behaviour:** an inline coloured alert: optional icon (caller `ReactNode`) + message `children` +
  optional `title`. `tone` drives the colour family. Optional `onDismiss` → renders a close button.
- **Tokens (tone map, build a small `Record<Tone,string>`):**
  | tone | bg | text | border |
  |------|-----|------|--------|
  | `neutral` | `bg-status-neutral-soft` | `text-status-neutral-text` | `border-status-neutral-border` |
  | `info` | `bg-status-info-soft` | `text-status-info-text` | `border-status-info-border` |
  | `success` | `bg-status-success-soft` | `text-status-success-text` | `border-status-success-border` |
  | `warning` | `bg-status-warning-soft` | `text-status-warning-text` | `border-status-warning-border` |
  | `danger` | `bg-status-error-soft` | `text-status-error-text` | `border-status-error-border` |
  Wrapper `rounded-xl border px-4 py-3 flex items-start gap-3`; message `text-body-sm`; title `font-semibold`.
- **Props:** `{ tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; icon?: ReactNode;
  title?: ReactNode; children: ReactNode; onDismiss?: () => void; labels?: { dismiss?: string } }`.
  Default `tone='info'`, dismiss label `'Dismiss'`. `role` = `'alert'` when `tone==='danger'` else `'status'`.
- **Tests:** renders message; `tone='warning'` applies `bg-status-warning-soft`; `tone='danger'` applies
  `bg-status-error-soft` AND `role="alert"`; `onDismiss` renders a button (`aria-label="Dismiss"`) that
  fires `onDismiss`; absent `onDismiss` renders no button; no hex/stock/`mfs-*`; axe zero violations per tone.

### 6.4 `Spinner` *(generalizes the inline loading spinners across the app — Button loading, route loads)*
- **Radix? NO** — plain `<span role="status">`.
- **Behaviour:** a spinning ring. `size` controls dimensions. `label` is screen-reader text.
- **Tokens:** `inline-block rounded-full border-current/30 border-t-current animate-[mfs-spin_0.7s_linear_infinite]`
  + size (`sm`=`w-4 h-4 border-2`, `md`=`w-6 h-6 border-[2.5px]`, `lg`=`w-9 h-9 border-[3px]`). Colour is
  inherited (`border-current`) so the caller's text colour drives it — NO colour prop. (Mirrors Button's
  loading spinner line 95.)
- **Props:** `{ size?: 'sm' | 'md' | 'lg'; label?: string }`. Default `size='md'`, label `'Loading'`.
- **Tests:** renders `role="status"` with the default/overridden `aria-label`; `size='lg'` applies `w-9`;
  the spin animation class present; no hex/stock/`mfs-*`; axe zero violations.

### 6.5 `EmptyState` *(generalizes the "no results / nothing here" panels — e.g. Picker's no-results, list empties)*
- **Radix? NO** — plain centred `<div>`.
- **Behaviour:** centred icon (caller `ReactNode`) + title + optional message + optional action slot
  (caller passes a `<Button>` as `action?: ReactNode`).
- **Tokens:** wrapper `flex flex-col items-center justify-center text-center py-16 px-8 gap-3`; icon span
  `text-subtle`; title `text-body font-semibold text-body`; message `text-body-sm text-muted`.
- **Props:** `{ icon?: ReactNode; title: ReactNode; message?: ReactNode; action?: ReactNode }`.
- **Tests:** renders title; renders message + icon + action when given, absent when not; no
  hex/stock/`mfs-*`; axe zero violations.

### 6.6 `Popover` *(generalizes the DotMenu-style floating panel — Radix Popover)*
- **Radix? YES** — `radix-ui` `Popover` (`import { Popover as RadixPopover } from 'radix-ui'`). 🗣 Radix
  Popover gives the anchor-positioned floating panel + outside-click/ESC dismissal + focus management for
  free — the exact machinery the live DotMenu hand-rolls with `useEffect` mousedown/keydown listeners.
- **Behaviour:** a `trigger` slot (caller `ReactNode`, wrapped in `RadixPopover.Trigger asChild`) + a
  floating `children` panel (`RadixPopover.Content`). Optional controlled `open`/`onOpenChange`
  (uncontrolled if omitted — Radix manages). `align`/`side` are **semantic-intent** props mapped to Radix's
  props (NOT raw CSS).
- **Tokens:** Content `bg-surface-overlay border border-default rounded-lg shadow-lg p-1
  animate-[mfs-fade_0.15s_ease-out] focus:outline-none`.
- **Props:** `{ trigger: ReactNode; children: ReactNode; open?: boolean; onOpenChange?: (o: boolean) =>
  void; align?: 'start' | 'center' | 'end'; side?: 'top' | 'bottom' }`. Map `align`/`side` straight to
  `RadixPopover.Content align/side`. Default `align='end'`, `side='bottom'`.
- **Tests:** trigger renders; clicking the trigger opens the panel (`userEvent.click` → panel content
  visible via `screen`); ESC/outside-click closes (Radix native — assert content gone); panel class
  contains `bg-surface-overlay`; no hex/stock/`mfs-*`; axe zero violations on the open popover.
  *(Same jsdom-portal note as Modal §6.2.)*

### 6.7 `DropdownMenu` *(generalizes the AppHeader DotMenu/DesktopAvatarMenu — Radix DropdownMenu)*
- **Radix? YES** — `radix-ui` `DropdownMenu`
  (`import { DropdownMenu as RadixDropdownMenu } from 'radix-ui'`). 🗣 A *menu* (arrow-key roving focus,
  `role="menu"`/`menuitem`, type-ahead) — distinct from a generic Popover. The live DotMenu (language
  toggle + logout rows) is exactly this.
- **Behaviour:** a `trigger` slot + `items: DropdownMenuItem[]` where each item is `{ id; label:
  ReactNode; icon?: ReactNode; onSelect: () => void; tone?: 'default' | 'danger'; disabled?: boolean }`.
  Optional separators expressed as items with `{ separator: true }` OR a dedicated `DropdownMenu.Separator`
  — **choose the data-driven `items` array** (one item can be `{ separator: true }`) to keep the API a
  single prop and avoid a compound-export surface. Renders `RadixDropdownMenu.Item` per row, `Separator`
  per separator.
- **Tokens:** Content `bg-surface-overlay border border-default rounded-xl shadow-lg overflow-hidden p-1
  animate-[mfs-fade_0.15s_ease-out]`; item `flex items-center gap-3 px-3 py-2.5 text-body-sm rounded-md
  cursor-pointer outline-none data-[highlighted]:bg-surface-sunken`; danger item `text-status-error-text`;
  disabled `opacity-40 cursor-not-allowed`; separator `h-px bg-border-subtle my-1`.
- **Props:** `{ trigger: ReactNode; items: DropdownMenuItem[]; align?: 'start' | 'center' | 'end';
  'aria-label'?: string }`. Export `DropdownMenuItem` type. Default `align='end'`.
- **Tests:** trigger renders; clicking opens a `role="menu"` (Radix); each non-separator item renders a
  `role="menuitem"`; selecting an item fires its `onSelect`; a `tone='danger'` item carries
  `text-status-error-text`; a `disabled` item is not selectable; keyboard arrow-down moves focus (Radix
  native — assert open + first item focusable); no hex/stock/`mfs-*`; axe zero violations on the open menu.
  *(Same jsdom-portal note as Modal §6.2.)*

### 6.8 `BottomNav` *(generalizes components/BottomNav.tsx — presentational tab bar)*
- **Radix? NO** — `<nav>` + `NavItem` cells (orientation `'vertical'`).
- **Behaviour:** fixed bottom bar holding the visible tabs (composing `NavItem`) + an optional "More"
  overflow cell firing `onOpenMore`. Active state derived from a caller-passed `activeHref` (the component
  does NOT call `usePathname` itself — keep it presentational so it's testable without a router; the
  Phase-1 wiring passes `usePathname()`). 🗣 The bar doesn't ask "where am I?" — the screen tells it.
- **Tokens:** wrapper `fixed bottom-0 left-0 right-0 z-40 bg-surface-raised border-t border-default`
  (light bar — confirm against design; if the design shows an inverse bottom bar use `bg-surface-inverse`,
  decide at Render via `/dev/ui`), safe-area padding via inline `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}`
  (env() is layout, not colour — allowed); inner `flex`.
- **Props:** `{ items: { href: string; label: ReactNode; icon: ReactNode }[]; activeHref?: string;
  onOpenMore?: () => void; moreLabel?: ReactNode; moreIcon?: ReactNode; 'aria-label'?: string }`. Default
  `aria-label='Main navigation'`, `moreLabel='More'`. The "More" cell renders only when `onOpenMore` is set.
- **Tests:** renders one cell per item; the cell matching `activeHref` gets `aria-current="page"` +
  `text-action-primary`; the "More" cell renders + fires `onOpenMore` on click when `onOpenMore` given,
  absent otherwise; `aria-label` on the `<nav>`; no hex/stock/`mfs-*`; axe zero violations.

### 6.9 `MoreDrawer` *(generalizes components/MoreDrawer.tsx — consumes Modal sheet, brief-locked)*
- **Radix? via Modal** — renders `<Modal variant="sheet" open onOpenChange>` and fills the body with
  `NavItem` rows (orientation `'list'`). **NO second sheet engine** (brief rule).
- **Behaviour:** controlled `open`/`onClose`; lists the overflow nav `items` as `NavItem` `'list'` rows;
  an item flagged `desktopOnly` renders the W2 `Badge` ("DESKTOP") in NavItem's `badge` slot; tapping a row
  navigates then closes (the row's `href` + an `onNavigate` that calls `onClose`). Optional `title`
  (default a "More options" caption via the Modal title or a `SectionLabel`-style caption).
- **Tokens:** inherited from Modal (sheet) + NavItem; the caption uses `text-caption font-semibold
  uppercase tracking-[0.13em] text-subtle`.
- **Props:** `{ open: boolean; onClose: () => void; items: { href: string; label: ReactNode; icon:
  ReactNode; desktopOnly?: boolean }[]; title?: ReactNode; desktopBadgeLabel?: ReactNode }`. Default
  `desktopBadgeLabel='Desktop'`.
- **Tests:** when `open`, renders a `role="dialog"` (from Modal) listing one row per item; a `desktopOnly`
  item renders a `Badge`; tapping a row calls `onClose`; closed renders nothing; no hex/stock/`mfs-*`; axe
  zero violations. **Assert it composes Modal** (the dialog role + sheet positioning come from Modal, not a
  re-implemented sheet) — e.g. assert the bottom-sheet `bottom-0` class is present (proving it used the
  sheet variant, not a hand-rolled panel).

### 6.10 `DesktopSidebar` *(generalizes components/DesktopSidebar.tsx — presentational rail)*
- **Radix? NO** — `<aside>` + `NavItem` rows (orientation `'rail'`).
- **DECISION (presentational, NOT the state machine):** W3's `DesktopSidebar` takes `expanded?: boolean` +
  `onToggle?: () => void` and renders the rail at the matching width; it does **NOT** own the hover-peek
  timers or the pin tri-state (that orchestration is screen/RoleNav logic — a reusable presentational brick
  should not embed a bespoke timer state machine). 🗣 The rail knows how to *look* open or closed and how
  to *ask* to toggle; deciding *when* to peek/pin is the screen's job. Keeps the brick deep but
  presentational and testable without timers.
- **Behaviour:** fixed left rail, width `expanded ? 'w-60' : 'w-16'`, `transition-[width]`; lists `items`
  as `NavItem` `'rail'` rows (active from `activeHref`); a chevron toggle button (inline-SVG, caller may
  override via `collapseIcon`/`expandIcon` ReactNode slots, default inline chevron SVGs) firing `onToggle`;
  optional `logo` slot at the top. Inverse chrome surface.
- **Tokens:** `fixed left-0 top-16 h-[calc(100vh-64px)] z-30 bg-surface-inverse text-inverse shadow-md
  flex flex-col transition-[width] duration-medium ease-decelerate` + width; active item via NavItem
  (`onInverse`); chevron button `text-inverse/70 hover:text-inverse focus-visible:ring-2 focus-visible:ring-focus-ring`.
- **Props:** `{ items: { href: string; label: ReactNode; icon: ReactNode }[]; activeHref?: string;
  expanded?: boolean; onToggle?: () => void; logo?: ReactNode; collapseIcon?: ReactNode; expandIcon?:
  ReactNode; 'aria-label'?: string }`. Default `aria-label='Primary navigation'`, `expanded=false`.
- **Tests:** renders one row per item; the `activeHref` row is highlighted; `expanded` toggles `w-60`
  vs `w-16`; the chevron fires `onToggle` (with an `aria-label` reflecting expanded/collapsed); renders
  the `logo` slot when given; no hex/stock/`mfs-*`; axe zero violations. (No timer tests — by design.)

### 6.11 `AppHeader` *(generalizes components/AppHeader.tsx — presentational top bar, slot-driven)*
- **Radix? NO** (it may *compose* `DropdownMenu` for its menu slot, but the header itself is layout).
- **Behaviour:** sticky top bar with slots: `logo?` (ReactNode — see logo decision §5), `title?`,
  `sync?` (ReactNode — caller passes a `<SyncDot state=… />`, the W2 component; AppHeader does NOT read the
  queue), `actions?` (ReactNode), `menu?` (ReactNode — caller passes a `<DropdownMenu />`). Inverse chrome.
  Presentational only: no cookie reads, no router, no fetch (the live one does all three — removed here).
- **Tokens:** `sticky top-0 z-40 bg-surface-inverse text-inverse px-4 h-16 flex items-center gap-4`,
  safe-area top padding via inline `style={{ paddingTop: 'env(safe-area-inset-top)' }}`; title
  `text-inverse uppercase tracking-wider text-h3 truncate`; logo slot `flex-shrink-0`; a `flex-1` spacer
  pushes the right cluster (`sync` + `actions` + `menu`) to the edge.
- **Props:** `{ logo?: ReactNode; title?: ReactNode; sync?: ReactNode; actions?: ReactNode; menu?:
  ReactNode }`. **NO `maxWidth` string prop** (the live one has `maxWidth: 'lg'|'2xl'|…` — that is a layout
  knob; if a max width is needed it is the page layout's wrapper concern, not a header prop — noted §12).
- **Tests:** renders the `<header>` landmark (`role="banner"`); renders `title`/`logo`/`sync`/`actions`/
  `menu` slots when given, absent when not; inverse surface class present; no hex/stock/`mfs-*`; axe zero
  violations.

🗣 In plain English (whole section): the three pop-ups (Modal, Popover, DropdownMenu) ride the
already-allow-listed Radix engine — that's where the keyboard/focus correctness lives, and `Picker` is the
exact recipe to copy. Everything else is plain semantic HTML. The big rules honoured: one Modal with a
`variant` (center vs sheet) and MoreDrawer reuses the sheet rather than cloning it; every nav part is
*presentational* (the screen tells it what's active and when to toggle — the bricks never read the router,
cookies, or queue); and the logo/icons are slots, never baked-in file paths.

---

## 7 · Barrel + gallery wiring steps

### 7.1 Barrel — `components/ui/index.ts` (EDIT — allowed)
Append, in the existing style (named export + type export), after the Wave-2 block:
```ts
// ── Phase 0b Wave 3 (Overlays + Nav) ───────────────────────────────────────
export { Modal } from './Modal'
export type { ModalProps } from './Modal'

export { Banner } from './Banner'
export type { BannerProps } from './Banner'

export { Spinner } from './Spinner'
export type { SpinnerProps } from './Spinner'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { Popover } from './Popover'
export type { PopoverProps } from './Popover'

export { DropdownMenu } from './DropdownMenu'
export type { DropdownMenuProps, DropdownMenuItem } from './DropdownMenu'

export { AppHeader } from './AppHeader'
export type { AppHeaderProps } from './AppHeader'

export { BottomNav } from './BottomNav'
export type { BottomNavProps } from './BottomNav'

export { MoreDrawer } from './MoreDrawer'
export type { MoreDrawerProps } from './MoreDrawer'

export { DesktopSidebar } from './DesktopSidebar'
export type { DesktopSidebarProps } from './DesktopSidebar'

export { NavItem } from './NavItem'
export type { NavItemProps } from './NavItem'
```
**⚠️ Name-collision note:** the LIVE `components/BottomNav.tsx` already exports an interface named
`NavItem` (and `NavMatrix`). The W3 `components/ui/NavItem.tsx` exports a *component* `NavItem`. These live
in different modules and are imported by different paths (`@/components/ui` vs `@/components/BottomNav`), so
there is **no runtime collision** — but do NOT re-export the live `BottomNav`'s `NavItem` type from the
`ui` barrel. The `ui` barrel exports only the W3 component `NavItem` + its `NavItemProps`. 🗣 Two unrelated
things share the name "NavItem" in two separate boxes — fine, as long as we never pull both into the same
box. The barrel only carries our new one.

🗣 In plain English: add each new part to the index so a screen can later
`import { Modal } from '@/components/ui'`. Don't touch the Wave-1/Wave-2 lines above.

### 7.2 Gallery body — `app/dev/ui/GalleryOverlaysNav.tsx` (NEW)
Mirror `GalleryDisplay.tsx` exactly: `'use client'`, import the Wave-3 components from `@/components/ui`,
reuse the inline-SVG demo-icon + `Group` helper pattern (no icon library), local `useState` for the
interactive demos, render **every component in its states**:
- **Modal:** a `<Button>` that opens a `variant='center'` Modal (with title + body) via local `useState`;
  a second `<Button>` opening a `variant='sheet'` Modal.
- **Banner:** one per tone (`neutral/info/success/warning/danger`), with an icon, one with `onDismiss`.
- **Spinner:** all three sizes in a row.
- **EmptyState:** an icon + title + message + an action `<Button>`.
- **Popover:** a `<Button>` trigger opening a small panel.
- **DropdownMenu:** a `<Button>` trigger with 3–4 items incl. a separator + a `danger` item.
- **NavItem:** the three orientations rendered statically (vertical / rail / list, active + inactive).
- **BottomNav:** a static instance with 3–4 demo items + a "More" cell (wire `onOpenMore` to open the
  MoreDrawer).
- **MoreDrawer:** opened by the BottomNav "More" cell (local `useState`), listing demo overflow items incl.
  one `desktopOnly`.
- **DesktopSidebar:** a static instance with a local `expanded` toggle (wire the chevron `onToggle`).
- **AppHeader:** a static instance composing a demo logo (inline SVG), a title, a `<SyncDot state="syncing" />`,
  a demo action `<Button>`, and a `<DropdownMenu>` as the menu slot.

🗣 In plain English: a showroom panel that renders each chrome part in every look, with working open/close
buttons you can click, so a human can eyeball them in light/dark and roomy/tight.

### 7.3 Gallery shell — `app/dev/ui/page.tsx` (EDIT — allowed)
Add `import { GalleryOverlaysNav } from './GalleryOverlaysNav'` and render it inside `<GalleryFrame>` after
`<GalleryDisplay />`:
```tsx
return (
  <GalleryFrame>
    <GalleryForms />
    <GalleryDisplay />
    <GalleryOverlaysNav />
  </GalleryFrame>
)
```
(The `notFound()` production gate already exists — do not change it.) 🗣 In plain English: show the new
overlays+nav section right under the existing display section in the same hidden showroom. The only change
to the page file is one import and one extra line.

---

## 8 · Test plan (right-sized — presentation-only)

**Layer used: component (jsdom) + the existing static lint/token guards. NO E2E, NO integration, NO
pgTAP/RLS, NO PITR.** State this explicitly so ANVIL right-sizes. 🗣 This wave touches no database, route,
or auth — so those rungs are correctly N/A. The right tests are per-component accessibility/behaviour tests
plus the existing token/no-hex guard re-running over the new files.

- **Per component (11 files under `tests/component/ui/`)**, copying `tests/component/ui/Card.test.tsx`
  (plain) or `SegmentedControl.test.tsx` (interactive) exactly (`render, screen` from
  `@testing-library/react`; `userEvent`; `axe` from `vitest-axe`; the `component` vitest project +
  `tests/component/setup.ts` register `toHaveNoViolations` + cleanup). Each file covers the §6 cases:
  **semantic-token class assertions (no-hex proof), key behaviour/ARIA roles, and a `vitest-axe`
  zero-violations assertion.**
- **Radix-portal note (Modal/Popover/DropdownMenu):** these portal into `document.body`; query opened
  content via `screen`/`within(document.body)`, not `container`. The axe assertion runs on the opened state
  (open the overlay, then `axe(document.body)` or the content node). If jsdom is missing a polyfill Radix
  needs (`ResizeObserver`, `matchMedia`, `PointerEvent` capture), add it to `tests/component/setup.ts`
  ONLY — and FLAG it to the conductor, because `setup.ts` is OUTSIDE the 23+2 file budget (it is an
  allowed test-infra edit if required, but must be called out, not silent).
- **`sheet`-reuse assertion (MoreDrawer):** assert MoreDrawer's rendered output carries the Modal sheet
  positioning (`bottom-0`) — proving it composed `Modal variant="sheet"` rather than re-implementing a
  sheet.
- **Live guards that gate this tree (already exist — must STAY green over the new files):**
  - `tests/unit/lint/semantic-tokens-only.test.ts` → RED if any new `components/ui/**` file uses
    hex / `bg-blue-500` / `bg-amber-50` / `bg-white` / `-mfs-*`. **This is the guard that makes the §3
    correction load-bearing.**
  - `tests/unit/tokens/token-resolve.test.ts` → the 0a build-safety net.
- **Whole suite:** `npm test` (unit + component lanes) green; `tsc` clean; `next build` green.

**Acceptance criteria (Wave 3 "done"):**
1. All 23 new files exist exactly as in §5; the barrel re-exports all 11 components + their prop types
   (+ `DropdownMenuItem`).
2. Each of the 11 components matches its §6 spec (intent-only props, slots for icons/logo, semantic tokens).
3. `Modal` is ONE component with a `variant: 'center' | 'sheet'` prop; `MoreDrawer` composes
   `Modal variant="sheet"` (NO second sheet engine).
4. Each component has a passing jsdom test with a `vitest-axe` **zero-violations** assertion + its §6 cases.
5. `semantic-tokens-only.test.ts` GREEN over the new tree (no `mfs-*`/hex/stock-palette).
6. `/dev/ui` renders the new Overlays+Nav section in all states across the four panels and 404s in a prod build.
7. **`git diff --name-only main` shows ONLY the 23 new files + the 2 allowed edits (`index.ts`, `page.tsx`)**
   — plus, IF required and flagged, `tests/component/setup.ts` (Radix jsdom polyfill). The live
   `AppHeader.tsx`, `BottomNav.tsx`, `DesktopSidebar.tsx`, `MoreDrawer.tsx`, `EditLockBanner.tsx`,
   `OrderCutoverBanner.tsx`, `DetailModal.tsx`, `RoleNav.tsx`, `primitives.tsx`, every W1/W2 component,
   every screen UNTOUCHED.
8. `tsc` clean, `next build` green, full `npm test` green. NO new `package.json` entry (Radix already
   present). NO AI references.

---

## 9 · Hexagonal check (for Gate 2)

- **Layer:** PRESENTATION ONLY. 🗣 Signage and chrome, not wiring or plumbing.
- **Ports added/used:** NONE. No domain logic, no business operation, no `lib/ports/` contract. The nav
  components are deliberately presentational (caller passes active state / data; they never read the
  router, cookies, or sync queue).
- **Adapters added:** NONE. No `lib/adapters/<vendor>/`. No vendor SDK imported except `radix-ui`, which is
  a pre-existing allow-listed UI a11y engine used by Wave-1 (Picker/Select/Checkbox/Radio/Toggle), NOT a
  swappable external-service vendor (DB/auth/payment/storage/email). Next `<Link>` is a framework primitive
  already used throughout.
- **New dependencies:** NONE. `radix-ui` already in `package.json` (line 40). No icon library (icons are
  `ReactNode` slots). No `clsx`/`tailwind-merge` — local `cx` only. If you think a dep is needed, **STOP
  and flag** — do not `npm install`.
- **`lib/**` touched:** NONE. **`lib/adapters/**` imported from `components/**`:** NONE.
- **Rip-out test:** **N/A** — no external-service seam (DB/auth/payment/storage/email) is introduced. The
  Lego "swap a vendor = one adapter + one wiring line" test applies to external-service seams; this wave
  adds none. 🗣 No new socket-and-plug here, so the rip-out question doesn't apply — correct for pure UI.

**Verdict line (paste into Gate 2):**
> **Port:** none added/used · **Adapter:** none · **New deps:** none — `radix-ui` (Dialog/Popover/
> DropdownMenu) already allow-listed since 0a + used by Wave-1, NOT a new dep and NOT an external-service
> vendor; Next `<Link>` is a pre-existing framework primitive · **Rip-out test:** **N/A** (no
> external-service seam) → **PASS** (presentation-only, inner layers untouched, additive).

---

## 10 · Risk Assessment (mandatory)

> Severity: 🔴 high · 🟡 medium · 🟢 low. "Must-fix" = blocks Gate 2 until the plan resolves it.

### Concurrency / race conditions
- 🟢 **No material risks.** No timers owned by the components (the live DesktopSidebar's hover-peek timers
  are deliberately NOT carried into the presentational W3 brick — §6.10). Radix manages overlay
  open/close state internally; the only app state is controlled `open`/`onOpenChange` callbacks. 🗣 Nothing
  schedules work that could race.

### Security
- 🟢 **No material risks.** No auth, no data access, no API, no `dangerouslySetInnerHTML`, no network. The
  presentational refactor REMOVES the live AppHeader's `fetch('/api/auth/logout')` and cookie reads (those
  become caller-supplied `onSelect`/`menu` slots) — strictly less surface, not more. 🗣 Chrome code that
  takes data via props and emits via callbacks; nothing to leak or exploit.

### Data migration
- 🟢 **No material risks.** No schema, no migration, no DB. (State to ANVIL: PITR/pgTAP/RLS = justified N/A.)

### Business-logic flaws
- 🟡 **The `mfs-*`/stock-palette-vs-semantic-token trap (HEADLINE process risk).** The live chrome uses
  `bg-mfs-navy`, `text-mfs-orange`, `bg-white`, `bg-amber-50`, `bg-slate-100` — ALL banned in
  `components/ui/**` by the live lint guard. An implementer copying the live chrome verbatim would RED the
  lint suite (or worse, disable the guard). **Mitigation:** §3 correction + §4 inverse-chrome decision +
  every §6 spec gives the exact *semantic* class; the live guard catches any slip. **Must-fix:** NO
  (mitigated by the plan stating the correct tokens + the guard) — but it is the single most likely thing
  to go wrong, called out loudly.
- 🟡 **Inverse-surface token may not paint navy/white as the design intends.** The header/sidebar are navy
  chrome; the plan maps them to `bg-surface-inverse`/`text-inverse`. If those tokens don't resolve to the
  intended navy/white pairing (they were defined in 0a for the unified dark theme), the chrome could render
  wrong. **Mitigation:** §4 says to verify visually at `/dev/ui` during Render and FLAG rather than fall
  back to `bg-mfs-navy`. **Must-fix:** NO (verified at Render; the guard prevents the wrong fallback).
- 🟡 **Modal `variant` + MoreDrawer reuse is the architecture decision.** One Modal serving both centred
  dialogs and bottom-sheets, with MoreDrawer composing the sheet variant rather than cloning it. If the
  variant split is wrong, the Phase-1 re-point of DetailModal/Picker/MoreDrawer is a rewrite. **Mitigation:**
  §6.2/§6.9 fully specify the variant classes (copied from the live `Picker` sheet) + the MoreDrawer
  sheet-reuse test pins it. **Must-fix:** NO (brief-locked + test-covered). 🗣 One pop-up engine, two looks,
  one consumer reusing the second look — pinned by a test so no one clones the sheet.
- 🟡 **Radix overlays under jsdom may need polyfills.** Radix Dialog/Popover/DropdownMenu sometimes require
  `ResizeObserver`/`matchMedia`/pointer-capture shims in jsdom; W1's Picker/Select already pass, so the
  setup likely covers Dialog — but Popover/DropdownMenu are new Radix primitives this wave. If a test fails
  on a missing global, the fix is a one-line polyfill in `tests/component/setup.ts`. **Mitigation:** §8
  pre-authorises that single edit BUT requires it be FLAGGED (it is outside the 23+2 budget). **Must-fix:**
  NO — but the implementer must surface it, not silently edit. 🗣 The test harness might need a tiny shim
  for the new pop-ups; if so, it's a known, allowed, must-be-announced edit.

### Launch / merge blockers
- 🟡 **`next build` ignores tsc + ESLint** (next.config), AND an unknown Tailwind utility emits no CSS
  rather than failing — a typo'd token class renders colourless while the build stays green.
  **Mitigation:** the live `semantic-tokens-only` + `token-resolve` unit guards (hard-gated) are the net;
  run `npm test`, not just `next build`; visual smoke at `/dev/ui` confirms real paint. **Must-fix:** NO.
- 🟢 **Accidental scope creep into existing files.** Boundary = "no existing file edited except `index.ts`
  + `page.tsx`" (+ a flagged `setup.ts` only if Radix needs it). **Mitigation:** acceptance #7
  (`git diff --name-only main`); code-critic enforces. Must-fix: no.
- 🟢 **NavItem name collision with the live `BottomNav`'s `NavItem` type.** Same name, different modules,
  different import paths — no runtime clash. **Mitigation:** §7.1 forbids re-exporting the live type from
  the `ui` barrel. Must-fix: no.
- 🟢 **Gallery reachable in prod.** Already mitigated by the existing `notFound()` gate + no nav link;
  Wave 3 adds no route. Must-fix: no.
- 🟢 **A generic `className`/`style` prop sneaking onto a component.** Would reopen the style-leak the wave
  exists to close. **Mitigation:** §5 forbids exposing `className`/`style`/`width` on these bricks. Must-fix: no.

### Gaps the spec does not cover (flagged, not assumed)
1. **AppHeader `maxWidth` dropped** — the live header has a `maxWidth: 'lg'|'2xl'|…` string prop; that is a
   layout knob and is NOT carried into the presentational brick (page layout owns max width). Deviation, §12.
2. **DesktopSidebar hover/pin state machine NOT carried** — W3's rail is presentational (`expanded?` +
   `onToggle?`); the timers/pin tri-state stay in the screen/RoleNav layer. Deviation, §12.
3. **Nav components don't read the router/cookies/queue** — `activeHref`/`sync`/`menu` come in as
   props/slots (the live ones call `usePathname`/`getClientRole`/`useUnsyncedQueue`). Presentational by
   design — Phase-1 wiring supplies these. Deviation, §12.
4. **Bilingual ARIA labels** — all default labels are English literals (consistent with W1/W2's accepted 0b
   decision; Phase-1 passes `t()`). Default: ship English ARIA labels. 🗣 The hidden screen-reader text is
   English for now, same as W1/W2.
5. **Brand SVGs** — no icon library; logo + nav glyphs are `ReactNode` slots; the gallery uses inline demo
   SVGs. The 7 brand SVGs are a **Render prerequisite** (§13) but are NOT referenced by any component
   (slot-based), so their exact filenames do not block the build. No new dep.
6. **BottomNav light-vs-inverse fill** — decide at Render via `/dev/ui` against the design whether the
   bottom bar is `bg-surface-raised` (light) or `bg-surface-inverse`; the plan defaults to light (matching
   the live `bg-white` bar). Cosmetic, verified visually.

**Risk headline:** **No 🔴 high risks. No must-fix Gate-2 blockers.** The one process risk to watch is the
**`mfs-*`/stock-palette-vs-semantic-token correction** (live chrome uses banned paint; plan uses the correct
semantic tokens and the live guard backstops it) — plus its cousin, the **inverse-surface token** painting
the navy chrome (verify at Render, never fall back to `bg-mfs-navy`). The deliberate, brief-confirmed
architecture moves are the **single Modal with `variant` + MoreDrawer reusing the sheet** and the
**presentational nav bricks** (no router/timer/queue logic inside). The one possible test-infra edit
(a Radix jsdom polyfill in `setup.ts`) is pre-authorised but must be FLAGGED, not silent. All are
test-covered or plan-specified. 🗣 In plain English: nothing should block approval. The thing most likely to
trip the build is using the old paint-pot names or stock colours — the plan spells out the right ones and a
robot referee catches any slip.

---

## 11 · Hexagonal verdict (computed — for Gate 2, mirrors §9)

- **Port the change uses/adds:** NONE (presentation-only; no `lib/ports/` contract engaged).
- **Adapter implementing it:** NONE.
- **New dependencies:** NONE. `radix-ui` (Dialog/Popover/DropdownMenu) is pre-existing (line 40 of
  `package.json`), allow-listed since 0a (ADR-0009), and already consumed by Wave-1 — wrapped behind our own
  owned components (Modal/Popover/DropdownMenu) so the rest of the app depends on our wrapper, not the
  vendor. It is a UI a11y engine, not a swappable external-service vendor, so the single-use-wrapper rule is
  satisfied (it's behind owned components).
- **Rip-out test:** **N/A → PASS** (no external-service seam introduced; inner layers untouched; additive).

---

## 12 · Deviations from the live chrome (explicit list — for the conductor's report)

1. **Tokens:** every `mfs-*`/hex/stock-palette (`bg-white`/`bg-amber-50`/`bg-slate-100`) in the live chrome
   → **semantic Tier-2 token + type-ramp utility** (forced by the lint guard; the live components are
   exempt as pre-existing, `components/ui/**` is not). The navy header/sidebar → `bg-surface-inverse` +
   `text-inverse`; the orange active tab → `text-action-primary`/`bg-action-primary`.
2. **Modal:** DetailModal (centred) + Picker (sheet) → ONE `Modal` with `variant: 'center' | 'sheet'`.
3. **MoreDrawer:** the live hand-rolled sheet → **composes `Modal variant="sheet"`** (no second engine).
4. **Banner:** EditLockBanner/OrderCutoverBanner's stock-palette tones → a `tone` prop mapped to status
   `-soft`/`-text`/`-border` tokens.
5. **Icons:** `lucide-react` (live `MoreHorizontal`/`ChevronLeft`/`MoreVertical`) → caller `ReactNode`
   slots; no icon library in `components/ui/**`.
6. **Logo:** live `AppHeader` imports `MfsLogo` directly → a `logo?: ReactNode` slot (no fixed `public/`
   path baked in).
7. **AppHeader presentational:** removes the live header's `usePathname`/cookie reads/`fetch` logout/queue
   read → `sync`/`actions`/`menu` are caller slots; no `maxWidth` layout-knob prop.
8. **BottomNav presentational:** removes `usePathname()` → `activeHref` prop; the "More" cell is opt-in via
   `onOpenMore`.
9. **DesktopSidebar presentational:** removes the hover-peek timers + pin tri-state machine → `expanded?` +
   `onToggle?` props (the screen/RoleNav owns the orchestration).
10. **DropdownMenu vs Popover:** the live DotMenu (hand-rolled `useEffect` mousedown/keydown) → a real Radix
    `DropdownMenu` (menu semantics) for menu rows, and a Radix `Popover` for generic floating panels — two
    distinct, correct primitives instead of one bespoke panel.
11. **No `className`/`style`/`width` prop** on any Wave-3 component (the live chrome leaks these); layout is
    the caller's wrapper concern.

---

## 13 · Render prerequisite — the 7 brand SVGs (conductor action BEFORE Render)

The nav components (`AppHeader`, `DesktopSidebar`, and via the gallery, the demo header) need a real brand
logo to look right in the showroom, and Phase-1 screens will pass brand art into the `logo` slot. Per the
0a change log, the **7 brand SVGs are DEFERRED** (DesignSync was unavailable in the subagent context):
`public/brand/logo-{navy,orange,white}.svg` + `public/brand/star-icon-{navy,orange,sand,white}.svg`
(filenames indicative — confirm against DesignSync).

**Because the W3 components take the logo as a `ReactNode` slot (not a fixed path), the exact filenames do
NOT block the build or any test** — the gallery uses an inline demo SVG. The SVGs are needed only for the
*visual* showroom review to look on-brand and for Phase-1 wiring later. **Conductor action:** place the 7
SVGs into `public/brand/` via DesignSync (session-level access) BEFORE the visual `/dev/ui` review — but
their absence does not gate Render or the test suite. 🗣 The components have a picture-frame; the brand
pictures should be hung before the showroom walk-through, but the frame (and every test) works without them.

---

## 14 · ANVIL lane statement (right-sized — paste into the cert)

**Lane: COMPONENT + token/lint guards ONLY.** Justified N/A: **E2E, integration, pgTAP/RLS, PITR** — this
wave introduces no route, no API, no auth, no database, no migration, no business logic. The exhaustive
browser-tap / @critical sweep is NOT earned (no screen behaviour changes; additive presentation only). The
correct rungs:
- **Component (jsdom + vitest-axe):** 11 new test files, every component's behaviour/ARIA + a
  zero-violations axe assertion (Radix overlays asserted in their open state via the portal).
- **Static guards:** `semantic-tokens-only.test.ts` + `token-resolve.test.ts` GREEN over the new tree.
- **Build gates:** `tsc` clean · `next lint` clean · `next build` green · full `npm test` green.
- **Visual smoke:** `/dev/ui` rendered locally (temp middleware bypass — gallery 404s on deploys, backlog
  F-UI-GALLERY-01) across the four theme × density panels; confirm the inverse-chrome navy/white pairing
  and every overlay open/close by hand.
- **CI `smoke` required check:** still runs the live @critical 75-spec suite on the PR preview (unchanged by
  this additive diff) — expect 75/75; mind the F-INFRA-07 non-idempotency gotcha on a 2nd push.

🗣 In plain English: test each widget for accessibility and behaviour, re-run the colour-guard over the new
files, build it, and eyeball the showroom. No database/route/auth tests, because this wave has none of
those — saying so explicitly so ANVIL doesn't over-test.
