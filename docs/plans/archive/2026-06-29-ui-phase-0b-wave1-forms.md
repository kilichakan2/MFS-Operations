# UI Phase 0b · Wave 1 — FORMS (precision execution plan)

> **FORGE plan, written for an implementer who cannot see the planning conversation.**
> Every path, name, variant, and test case is spelled out. Build EXACTLY what is here.
> If anything below is wrong against the live files, STOP and flag the conductor — do not improvise.

**Date:** 2026-06-29 · **Branch to cut from `main`:** `feat/ui-0b-wave1-forms`
**Scope:** Wave 1 of 3 (Forms) of the 0b core component library. **NOT** Waves 2/3.

🗣 In plain English: we are building the first 11 reusable form bricks of a brand-new Lego box (`components/ui/`), plus a private showroom page to look at them. We are not touching any existing screen — those keep working exactly as they do today and get migrated onto these bricks much later.

---

## 0 · Mini-map

```
PRESENTATION (this is ALL presentation — no domain/ports/adapters touched)
  components/ui/   ← NEW Lego box: 11 form bricks (Button…Picker)
  app/dev/ui/      ← NEW private showroom (dev-only, blocked in prod)
  reuses: Radix Primitives (already installed) · semantic tokens (0a) · t() i18n (0a)
🗣 a new, additive box of parts + a showroom to view them — zero existing screens change
```

---

## 1 · Goal

Build a standalone, additive component library at `components/ui/` containing the 11 Wave-1
("Forms") components, each faithful to the design spec, each bound to **semantic tokens only**,
each working in light/dark × comfortable/compact, each WCAG-AA and keyboard-operable, each with a
jsdom component test (+ a vitest-axe zero-violations assertion). Plus a **dev-only gallery** at
`app/dev/ui/page.tsx` that renders every Wave-1 component in all states across all four theme×density
combinations, gated so it is unreachable in production.

🗣 In plain English: make 11 clean, reusable form widgets that match the agreed design, prove each one is accessible and keyboard-friendly with automated tests, and put them in a hidden showroom page so a human can eyeball them. Nothing ships to a real screen yet.

**Hard boundary (locked at Gate 1):** PURELY ADDITIVE. Do **NOT** re-point, edit, or delete any
existing screen, `app/dashboard/admin/_components/primitives.tsx`, or any existing `components/*`
file (`AppHeader`, `BottomNav`, `DesktopSidebar`, `MoreDrawer`, `AuthKeypad`, `BottomSheetSelector`,
etc. all stay LIVE and untouched). Merging Wave 1 must change **no screen behaviour**.

---

## 2 · Domain terms / vocabulary used in this plan

- **Semantic token** — a purpose-named CSS variable (e.g. `--action-primary`, `--text-muted`),
  surfaced as a Tailwind utility (`bg-action-primary`, `text-muted`). 🗣 A labelled paint pot ("primary
  button colour") instead of a raw hex — change the pot once, every brick repaints.
- **Tier-1 primitive** (`--mfs-orange-500`, the `mfs-*` Tailwind names) — BANNED inside `components/ui/**`
  by the live lint test. 🗣 The raw colour mixing tray — components must never reach for it directly.
- **Density** — `[data-density="compact"]` on an ancestor shrinks the control-size CSS vars
  (`--ctl-h`, `--field-h`, …). Default (no attribute) = comfortable. 🗣 One switch makes every control
  tighten for desktop or relax for touch — components must read the vars, never hard-code px.
- **Radix Primitives** — the installed `radix-ui` unified package (v1.6, allow-listed in 0a). The a11y
  engine for interactive controls. 🗣 A pre-built, accessibility-correct skeleton we dress in our tokens.
- **`t()`** — the i18n translate helper from `useLanguage()` (`lib/LanguageContext.tsx`), backed by
  `lib/translations.ts`. 🗣 The EN/TR text lookup; any words a USER sees route through it.
- **FormField** — the wrapper that ties a label + hint + error message to a control via ARIA. 🗣 The
  picture-frame around an input: holds the caption, the help text, and the red error, wired so screen
  readers announce them.

---

## 3 · Sources of truth read (and what they bind)

| Source | What it locks |
|--------|---------------|
| `docs/design/MFS-Operations-Design-System.dc.html` lines **714–842** | The exact variants/states/sizes/markup for all 11 components. Build verbatim against these. |
| `app/tokens.css` + `docs/design/phase0a-foundation-tokens.reference.css` | The semantic + density token names. Components bind to these via Tailwind utilities. |
| `tailwind.config.ts` | The semantic Tailwind colour/radius/shadow/font utilities available (e.g. `bg-action-primary`, `text-on-action`, `border-strong`, `rounded-md`, `shadow-sm`, `font-display`). |
| `app/globals.css` lines 27–46 | The type-ramp size vars (`--text-body-size`, …) behind the `text-body`/`text-h2`/etc. Tailwind `fontSize` keys. |
| `tests/component/throwaway.test.tsx` + `tests/component/setup.ts` + `vitest.config.ts` | The EXACT jsdom test pattern to copy (RTL + user-event + `axe()` + `toHaveNoViolations`). |
| `tests/unit/lint/semantic-tokens-only.test.ts` | The live guard that will RED if any `components/ui/**` file uses raw hex / stock Tailwind palette / `mfs-*` primitive. |
| `tests/unit/tokens/token-resolve.test.ts` | The 0a build-safety guard pattern (static CSS parse). Wave-1 extends its spirit with a density-var smoke (§9). |
| `components/AuthKeypad.tsx` | PIN behaviour reference (4 digits, auto-submit on 4th, error pulse, physical-keyboard fallback, verifying state). Do NOT edit it. |
| `components/BottomSheetSelector.tsx` | Picker behaviour reference (fuzzy 2-pass search, selected tick, footer action, Escape-to-close, focus search on open). Do NOT edit it. |
| `app/dashboard/admin/_components/primitives.tsx` | House style for prop typing / className composition (`[...].join(' ')`). Wave-2 components live there conceptually; do NOT edit it. |
| ADR-0009 | Radix + the bought test stack are the approved a11y/test choices. |

🗣 In plain English: the design HTML is the picture we copy; the tokens/Tailwind config are the paints we're allowed to use; the existing throwaway test is the recipe card for how to write each component's test; the two reference components show how the PIN pad and the picker should behave.

---

## 4 · Compliance / architecture flags

- **Presentation-only.** Allowed write paths: `components/ui/**`, `app/dev/ui/**`, and test files under
  `tests/component/ui/**` (+ one token guard under `tests/unit/tokens/`). **Forbidden:** any `lib/**`,
  `middleware.ts`, auth/RLS, `app/api/**`, `.github/**`, Vercel settings, and every existing
  `components/*` / screen file. 🗣 We only add to the new box and the showroom; we never reach into the engine room.
- **No data fetching in components.** Every component takes its data via props (controlled or
  uncontrolled inputs). 🗣 The bricks display what they're handed — they never phone the database.
- **No new vendor dep.** Radix (`radix-ui`) is already installed + allow-listed; use it. If you believe
  any other package is needed, **STOP and flag** — do not `npm install`. 🗣 The toolbox is closed; one
  already-approved tool (Radix) only.
- **Semantic tokens only**, lint-enforced. No hex, no `bg-blue-500`, no `bg-mfs-navy`. 🗣 Labelled paint
  pots only — the robot referee (the lint test) fails the build otherwise.
- **No AI references** in any code, comment, commit, or PR text.

### ADR conflicts
**None.** ADR-0002 (hexagonal) is not engaged — this is the presentation layer and introduces no port,
adapter, vendor SDK, or wiring. ADR-0009 is directly *honoured* (Radix + jsdom/RTL/user-event/vitest-axe).
🗣 In plain English: nothing here contradicts a past architecture decision; it follows the UI-a11y decision exactly.

---

## 5 · Exact file tree to create

```
components/ui/
  Button.tsx          IconButton.tsx
  TextField.tsx       Textarea.tsx        Select.tsx
  Checkbox.tsx        Radio.tsx           Toggle.tsx
  FormField.tsx
  PinKeypad.tsx       Picker.tsx
  index.ts            ← barrel: re-exports every component + its public prop types

app/dev/ui/
  page.tsx            ← gallery SHELL + the Forms section (server component shell; see §8)
  GalleryForms.tsx    ← 'use client' — renders all 11 components in every state (the interactive body)
  GalleryFrame.tsx    ← 'use client' — the theme×density harness wrapper (4 panels) + section chrome

tests/component/ui/
  Button.test.tsx     IconButton.test.tsx
  TextField.test.tsx  Textarea.test.tsx   Select.test.tsx
  Checkbox.test.tsx   Radio.test.tsx      Toggle.test.tsx
  FormField.test.tsx
  PinKeypad.test.tsx  Picker.test.tsx

tests/unit/tokens/
  density-vars.test.ts  ← NEW static guard: comfortable + compact define the control/field size vars
```

**File count:** 11 components + 1 barrel + 3 gallery files + 11 component tests + 1 token guard = **27 new files.**

🗣 In plain English: 11 widget files, one "index" that lists them all so screens can import from one place later, three files for the showroom, 11 test files (one per widget), and one small extra test that proves the density switch is wired. 27 files, all new, all in allowed folders.

**Conventions for every component (match the repo):**
- `'use client'` at the top of any component with state/handlers/Radix (all except possibly FormField,
  which can stay a pure render — but mark it `'use client'` too if it carries any hook; safest: all client).
- TypeScript. Export a named component AND its props interface (e.g. `export interface ButtonProps`).
- `forwardRef` for components that wrap a single focusable DOM element a caller may need to ref
  (Button, IconButton, TextField, Textarea). Choice controls and PIN/Picker do not need it.
- className composition via `[...].join(' ')` (house style) or a tiny local `cx(...)` helper inside
  `index.ts`/each file — do NOT add `clsx`/`tailwind-merge` (that's a new dep — forbidden).
- All sizing/spacing/colour via semantic Tailwind utilities or inline `style={{ height: 'var(--ctl-h)' }}`
  reading the density vars. Reading `var(--ctl-h)` etc. via inline style is ALLOWED (it is not a colour
  literal and not an `mfs-*` utility) — the lint guard only bans hex/stock-palette/`mfs-*`.

---

## 6 · Per-component spec (variants · states · sizes · Radix-or-plain · props · tests)

> Design source lines in brackets. Density vars: `--ctl-h` (48/36), `--ctl-h-sm` (40/30), `--ctl-h-lg`
> (56/44), `--ctl-px`, `--ctl-fs`, `--ctl-radius`, `--field-h`, `--field-px`, `--field-fs`. Read them via
> Tailwind arbitrary values (`h-[var(--ctl-h)]`) or inline style. Focus ring everywhere:
> `focus-visible:ring-2 focus-visible:ring-focus-ring` (the `focus-ring` colour utility exists in 0a).

### 6.1 Button  *(design 714–741)*
- **Wraps:** plain semantic `<button>` (Radix adds nothing). 🗣 A normal button — Radix not needed.
- **Variants:** `primary` (orange `bg-action-primary text-on-action`, hover/active/disabled tokens),
  `secondary` (navy `bg-action-secondary`), `ghost` (transparent, `border-action-ghost-border text-action-ghost-fg`),
  `danger` (`bg-action-danger`). Each variant has **default / hover / active / disabled** states (drive
  hover/active with Tailwind `hover:`/`active:` utilities; disabled via the `-disabled` token + `disabled` attr).
- **Sizes:** `sm` → `h-[var(--ctl-h-sm)]` px-14 text-13; `md` (default) → `h-[var(--ctl-h)]`
  `px-[var(--ctl-px)]` `text-[length:var(--ctl-fs)]`; `lg` → `h-[var(--ctl-h-lg)]` px-24 text-17. Radius
  `rounded-[var(--ctl-radius)]`.
- **Extras:** `leadingIcon` / `trailingIcon` slots (ReactNode, 16–17px, gap-8); `loading` (shows a
  spinner using the `mfs-spin` keyframe, sets `aria-busy`, `cursor-wait`, disables activation);
  `fullWidth` (`w-full flex justify-center`).
- **Props:** `{ variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'|'lg'; loading?: boolean;
  fullWidth?: boolean; leadingIcon?: ReactNode; trailingIcon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>`.
  `type` defaults to `"button"`. `forwardRef<HTMLButtonElement>`.
- **Tests:** renders children as accessible name; `onClick` fires on click AND Enter when focused (copy
  throwaway test); `disabled` prevents `onClick`; `loading` sets `aria-busy="true"` and blocks `onClick`;
  each variant renders the expected semantic class (assert class string contains `bg-action-primary` etc.);
  axe zero violations for a default render.

### 6.2 IconButton  *(design 744–752)*
- **Wraps:** plain `<button>`.
- **Variants:** `ghost` (bordered), `primary` (filled orange), `neutral` (`bg-surface-sunken`),
  `danger` (`bg-status-error-soft text-status-error-text`).
- **Sizes:** `md` → `w-[var(--ctl-h)] h-[var(--ctl-h)]`; `sm` → `w-[var(--ctl-h-sm)] h-[var(--ctl-h-sm)]`.
  **Tap area stays ≥44px** even when the glyph is small — if `size==='sm'` would compute below 44px in
  compact, keep a `min-w-[44px] min-h-[44px]` on touch. (Document: comfortable sm=40px is acceptable per
  design; the ≥44 floor is the design's stated rule — apply `min-h-[44px] min-w-[44px]`.)
- **Required:** `aria-label` (icon-only) — make it a **required** prop (`aria-label: string`) so TS forces it.
- **Props:** `{ 'aria-label': string; icon: ReactNode; variant?: ...; size?: 'sm'|'md' } & ButtonHTMLAttributes`.
  `forwardRef`.
- **Tests:** has the accessible name from `aria-label`; click + Enter fire `onClick`; disabled blocks it;
  axe zero violations; a test asserting it throws/errors at the type level is N/A (runtime: assert the
  rendered button exposes `aria-label`).

### 6.3 TextField  *(design 758–762)*
- **Wraps:** plain semantic `<input>`.
- **States:** default, **focus** (`focus:border-focus-ring focus:ring-[3px] focus:ring-focus-ring/?`
  — use `focus-visible:ring-focus-ring` + the focus-ring-shadow look; the shadow var is
  `--focus-ring-shadow`, apply via `focus-visible:shadow-[0_0_0_3px_var(--focus-ring-shadow)]`),
  **error** (`border-status-error-fill`, `shadow-[0_0_0_3px_var(--status-error-soft)]`), **disabled**
  (`bg-surface-sunken text-subtle cursor-not-allowed`).
- **Affixes:** optional `prefix` / `suffix` (the £ … /kg pattern) rendered in a flex wrapper with
  `bg-surface-sunken` affix cells; the inner input becomes borderless.
- **Sizing:** `h-[var(--field-h)] px-[var(--field-px)] text-[length:var(--field-fs)]`,
  `rounded-[var(--ctl-radius)]`, `border-[1.5px] border-default bg-surface-raised text-body`.
- **Props:** `{ error?: boolean; prefix?: ReactNode; suffix?: ReactNode } & InputHTMLAttributes<HTMLInputElement>`.
  `forwardRef`. NOTE: label/hint/error MESSAGE live in FormField, not here — TextField only carries the
  `error` boolean for its red border. Accept `id`, `aria-describedby`, `aria-invalid` passthrough so
  FormField can wire them.
- **Tests:** typing updates value (controlled via `onChange` spy); `disabled` blocks typing; `error`
  renders the error border class and the component forwards `aria-invalid` when set; focus is reachable
  via Tab; axe zero violations (rendered inside a `<label>` or with an `aria-label` for the test).

### 6.4 Textarea  *(design 766)*
- **Wraps:** plain `<textarea>`. Same border/focus/error/disabled tokens as TextField. `min-h-[84px]`,
  `resize-vertical`, `py-12 px-[var(--field-px)]`, line-height 1.5.
- **Extras:** optional `maxLength` + `showCount` → renders a "`{len} / {max}`" counter bottom-right
  (`text-subtle`, position absolute in a relative wrapper). Counter text is **not** user-facing prose →
  it is numeric, no `t()` needed.
- **Props:** `{ error?: boolean; showCount?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>`.
  `forwardRef`.
- **Tests:** typing updates value; counter shows correct count when `showCount` + `maxLength` set;
  `error` border; disabled blocks typing; axe zero violations.

### 6.5 Select  *(design 763, 767–773)*
- **Wraps:** **Radix `Select`** (`import { Select } from 'radix-ui'`). 🗣 Use Radix because a custom
  dropdown must be keyboard + screen-reader correct (arrow keys, type-ahead, focus return) — Radix gives
  that for free; we only paint it.
- **Trigger:** matches the design field button — `h-[var(--field-h)]`, between value `<span>` and a
  chevron (`i-chevrons-up-down` look), `border-default bg-surface-raised`.
- **Content/menu:** `bg-surface-overlay border-default shadow-md rounded-[var(--ctl-radius)]`; items
  show a check (`text-action-primary`) on the selected one; highlighted item `bg-surface-sunken`.
- **States:** default / open / disabled / error (error → trigger gets `border-status-error-fill`).
- **Props:** `{ value?: string; onValueChange?: (v: string) => void; options: { value: string;
  label: string }[]; placeholder?: string; disabled?: boolean; error?: boolean; id?: string;
  'aria-label'?: string; 'aria-describedby'?: string }`. (Map `options` → Radix `Select.Item`s.)
- **Tests:** Radix Select renders a `combobox`/button trigger with accessible name; opening with click
  reveals options (Radix renders to a portal — use `screen.getByRole('option')` after open); selecting an
  option fires `onValueChange`; keyboard: focus trigger → `{Enter}`/`{ArrowDown}` opens, arrow + Enter
  selects (user-event); disabled trigger does not open; axe zero violations on the closed trigger.
  NOTE: Radix portals into `document.body`; the throwaway-style `render` works, but call
  `axe(document.body)` for the open state if needed and assert on `screen` not `container` for portalled
  options.

### 6.6 Checkbox  *(design 781–785)*
- **Wraps:** **Radix `Checkbox`**. States: unchecked, checked (orange fill + white tick `i-check`),
  **indeterminate** (orange fill + `i-minus`), disabled (`opacity-50 cursor-not-allowed`,
  `border-strong`). Box `w-[22px] h-[22px] rounded-[6px] border-2`. Checked/indeterminate fill =
  `bg-action-primary`.
- **Label:** rendered beside the box; the whole row is a `<label>` (click-to-toggle). Label text comes
  from a `label` prop (caller passes `t('…')` for real strings; the gallery passes literals — see §10 i18n note).
- **Props:** `{ checked?: boolean | 'indeterminate'; onCheckedChange?: (c: boolean | 'indeterminate') => void;
  disabled?: boolean; label: ReactNode; id?: string }`.
- **Tests:** clicking toggles `onCheckedChange`; keyboard Space toggles when focused; indeterminate
  renders `aria-checked="mixed"`; disabled blocks toggle; label is associated (clicking label toggles);
  axe zero violations.

### 6.7 Radio  *(design 788–791)*
- **Wraps:** **Radix `RadioGroup`**. A `RadioGroup` with N `RadioGroupItem`s; selected shows the orange
  inner dot inside the ring. Disabled item dims. Vertical stack, gap-14, each row a clickable `<label>`.
- **Props:** `{ value?: string; onValueChange?: (v: string) => void; options: { value: string;
  label: ReactNode; disabled?: boolean }[]; name?: string; 'aria-label'?: string }`.
- **Tests:** renders a `radiogroup` with N `radio`s; clicking an option fires `onValueChange`; **arrow
  keys move selection** within the group (Radix behaviour — assert via user-event ArrowDown); the group
  has an accessible name (`aria-label`); disabled option not selectable; axe zero violations.

### 6.8 Toggle  *(design 794–797)*
- **Wraps:** **Radix `Switch`** (semantic on/off switch). Track `w-[46px] h-[27px] rounded-pill`; knob
  `21px` white circle that slides. ON track = `bg-action-primary`; OFF track = `bg-border-strong`.
  Disabled `opacity-50 cursor-not-allowed`.
- **Props:** `{ checked?: boolean; onCheckedChange?: (c: boolean) => void; disabled?: boolean;
  label: ReactNode; id?: string }`. Whole row is a `<label>`.
- **Tests:** renders `role="switch"` with `aria-checked`; click toggles `onCheckedChange`; Space toggles
  when focused; disabled blocks; label associated; axe zero violations.

### 6.9 FormField  *(design 756–764 — the wrapper concept)*
- **Wraps:** plain layout component (no Radix). Renders: a `<label>` (with `htmlFor`), the child
  **control** (cloned/with injected `id` + `aria-describedby` + `aria-invalid`), an optional **hint**
  (`text-subtle`), and an optional **error** message (`text-status-error-text` + alert-circle icon).
- **Wiring (the whole point):** generates a stable `id` (use React `useId()`); passes `htmlFor={id}` to
  the label and `id` to the control; builds `aria-describedby` from hint-id and/or error-id; sets
  `aria-invalid` on the control when `error` is set. Error message gets `role="alert"` /
  `aria-live="polite"` so screen readers announce it.
- **API choice (state explicitly):** FormField takes the control as `children` and injects the wiring
  props via `React.cloneElement`. The Wave-1 controls (TextField/Textarea/Select) MUST accept `id`,
  `aria-describedby`, `aria-invalid` passthrough (specified above) for this to work. 🗣 The frame slips
  the right ID tags onto whatever input you put inside it, so the label and the red error are correctly
  announced together.
- **Props:** `{ label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean;
  children: ReactElement }`.
- **Tests:** the label's `htmlFor` matches the control's `id` (clicking label focuses the control);
  when `error` set, the control has `aria-invalid="true"` and `aria-describedby` includes the error id,
  and the error has `role="alert"`; when `hint` set, `aria-describedby` includes the hint id; axe zero
  violations wrapping a TextField; `required` renders an indicator.

### 6.10 PinKeypad  *(design 814–828; behaviour ref `components/AuthKeypad.tsx`)*
- **Wraps:** plain. NEW ui/ version — do NOT edit `AuthKeypad.tsx`. Faithfully reproduce the behaviour:
  4 PIN dots that fill, 3×4 key grid (1–9, blank, 0, backspace), **auto-submit on the 4th digit**
  (~120ms delay), **error pulse** (`mfs-pinpulse`) + clear on error, **verifying** state, **physical
  keyboard fallback** (digits + Backspace), `navigator.vibrate(8)` on press if available, double-submit
  guard via a ref (copy the ref-not-state guard reasoning from AuthKeypad to avoid the cleanup race).
- **Tokens (the difference from AuthKeypad):** AuthKeypad hard-codes `#16205B`/`#EB6619`/`#1e2d6b`. The
  ui/ version uses semantic tokens: keys `bg-surface-raised text-body shadow-sm` active `bg-surface-sunken`,
  filled dot `bg-action-primary`, status text via `text-subtle`/`text-status-error-text`, key font
  `font-display`. Per design 822–828: `64px` key height, `rounded-[14px]`, 3-col grid.
- **Props:** `{ onComplete: (pin: string) => void; pinLength?: number (default 4); error?: string;
  title?: string; status?: string; resetSignal?: number; onReset?: () => void }`. Strings that are
  user-facing (`title`, `status`) are passed in by the caller (gallery passes literals).
- **a11y:** key buttons have `aria-label` ("Digit 3", "Delete last digit"); dots have an
  `aria-live="polite"` "N of 4 digits entered" label; grid is `role="group"` with a label.
- **Tests:** entering 4 digits via clicks calls `onComplete` with the 4-digit string (use `vi.useFakeTimers`
  or `findBy`/`waitFor` for the 120ms delay — copy a timer-safe pattern; `userEvent` advances real timers,
  so prefer `vi.useFakeTimers()` + `vi.advanceTimersByTime`); **physical keyboard** digits fill dots and
  the 4th auto-submits; Backspace removes a digit; `error` prop clears the pin and shows the error text;
  `resetSignal` change clears the pin; each key button has its `aria-label`; axe zero violations.

### 6.11 Picker  *(design 832–841; behaviour ref `components/BottomSheetSelector.tsx`)*
- **Wraps:** **Radix `Dialog`** for the modal/focus-trap/escape/overlay correctness, styled as a
  bottom-sheet (slide-up). NEW ui/ version — do NOT edit `BottomSheetSelector.tsx`. Reproduce: drag-handle
  pill, title, **search input** with the same **two-pass fuzzy match** (substring → all-words fallback;
  copy the `normalise` + filter logic verbatim — it is pure UI logic, not domain), selected-tick row,
  optional **footer action** ("+ New …"), **empty state**, **Escape closes**, **focus the search on open**.
  Bottom-sheet shape per design 834: `rounded-t-[18px] bg-surface-overlay shadow-lg border-default`.
- **Why Radix here (not the old hand-rolled overlay):** Radix Dialog gives the focus trap, `aria-modal`,
  Escape, and scroll-lock correctly; we keep our own list/search/animation inside its content. 🗣 We reuse
  the proven accessible modal shell and just put our searchable list inside it.
- **Tokens:** semantic only — rows `border-subtle`, selected row tick `text-action-primary`, search box
  `bg-surface-sunken`, footer action `text-link`. (The old file uses `#EDEAE1`, `#EB6619`, `orange-50`,
  `gray-*` — all REPLACED with tokens here.)
- **Props:** `{ open: boolean; onOpenChange: (open: boolean) => void; items: { id: string; label: string;
  sublabel?: string }[]; onSelect: (item) => void; selectedId?: string; title?: string;
  searchPlaceholder?: string; footerAction?: { label: string; onPress: () => void } }`. (Controlled `open`
  is cleaner than the old self-animating mount; the gallery toggles it with a Button.)
- **Tests:** opening renders a `dialog` with `aria-modal`; the search input is focused on open (Radix
  autoFocus or an effect); typing filters the list (substring match), and the all-words fallback works
  ("naz rest" → "Naz Restaurant" — reuse a fixture); clicking a row fires `onSelect`; Escape calls
  `onOpenChange(false)`; the selected row shows the tick; empty query shows all; no-match shows the empty
  state; footer action fires; axe zero violations on the open dialog (`axe(document.body)` since Radix
  portals).

🗣 In plain English (whole section): three of the eleven are plain HTML buttons/inputs because they need
nothing fancy (Button, IconButton, TextField, Textarea, FormField, PinKeypad). Five lean on Radix because
getting dropdowns, checkboxes, radios, switches, and modals keyboard- and screen-reader-correct by hand is
where bugs hide — Radix does the hard a11y part and we just paint it with our colours. The PIN pad and Picker
copy the behaviour of the two existing components but repaint them with the token system and don't touch the
originals.

---

## 7 · Recommended internal build order (each = one atomic commit)

> TDD where it pays: write the test alongside each component (red → green). The lint guard and
> token-resolve guard are already live and will gate the whole `components/ui/**` tree.

1. **`Button` + test** — the simplest, sets the className/variant/forwardRef pattern everything copies.
2. **`IconButton` + test** — reuses Button's variant/size logic; proves the `aria-label`-required pattern.
3. **`FormField` + test** — the wiring wrapper; needed by the text inputs' tests for the AA story.
   (Build before the inputs so the inputs can be tested inside it.)
4. **`TextField` + test**, then **`Textarea` + test** — plain inputs; verify FormField wiring.
5. **`Select` + test** — first Radix component; establishes the Radix-import + portal-testing pattern.
6. **`Checkbox` + test**, **`Radio` + test**, **`Toggle` + test** — the Radix choice controls (copy
   Select's Radix + portal/test approach).
7. **`PinKeypad` + test** — behaviour-heavy; copy AuthKeypad's logic, swap to tokens, add fake-timer test.
8. **`Picker` + test** — Radix Dialog + the two-pass search; copy BottomSheetSelector's filter logic.
9. **`index.ts` barrel** — re-export all 11 components + their prop types.
10. **`tests/unit/tokens/density-vars.test.ts`** — the density static guard (§9).
11. **Gallery: `GalleryFrame.tsx` + `GalleryForms.tsx` + `app/dev/ui/page.tsx`** (§8) — last, since it
    imports every component.

🗣 In plain English: build the easy button first to lock the house pattern, then the frame that wires labels,
then the inputs, then the Radix family, then the two behaviour-heavy ones, then the index, then the showroom.
Each step is one self-contained commit so the implementer (and reviewer) can follow the chain.

---

## 8 · Gallery route + production gating

**Structure:**
- `app/dev/ui/page.tsx` — a thin Server Component that (a) **gates production** and (b) renders
  `<GalleryFrame><GalleryForms /></GalleryFrame>`.
- `GalleryFrame.tsx` (`'use client'`) — renders **four panels** in a grid, each panel a `<div>` carrying
  `data-theme`/`data-density` so every combination shows at once: (light·comfortable), (light·compact),
  (dark·comfortable), (dark·compact). Each panel sets `background: var(--surface-base); color: var(--text-body)`
  so the dark panels actually render dark. Section heading chrome (matches design eyebrow + h1 style).
  🗣 One screen showing the same widgets four ways so a human sees light/dark and roomy/tight side by side.
- `GalleryForms.tsx` (`'use client'`) — renders **every Wave-1 component in every state** described in §6
  (all Button variants×states×sizes + icons/loading/full-width; all field states incl. focus/error/disabled/affix;
  all selection-control states incl. indeterminate/disabled; a live PinKeypad with `1234` accepted, anything
  else pulses; a Picker opened by a Button with a small fixture list). Local React state drives the live ones.

**Production gating (decide + state — REQUIRED):**
At the top of `app/dev/ui/page.tsx`:
```ts
import { notFound } from 'next/navigation'
export default function DevUiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return ( /* <GalleryFrame>…</GalleryFrame> */ )
}
```
🗣 In plain English: in a production build the page returns a 404 — it simply does not exist for real users.
It is reachable only when running locally (`npm run dev`) or in a non-production build. This is the chosen
mechanism (over a middleware rule or an env flag) because it is the smallest, self-contained, no-config gate
and keeps us off `middleware.ts` (forbidden path).

**Navigation:** the gallery is **NOT** linked from any staff navigation (`BottomNav`, `DesktopSidebar`,
`MoreDrawer`, `RoleNav`, `AppHeader` are untouched). It is reachable only by typing `/dev/ui` in dev.

**ANVIL note:** `/dev/ui` is the **manual visual-smoke surface** — ANVIL screenshots it across the four
panels. It is NOT part of the `@critical` E2E suite and adds no route to staff flows.

---

## 9 · Test plan (right-sized — presentation-only)

**Layer used: component (jsdom) + one static unit guard. No E2E / integration / pgTAP / migration —
state this explicitly so ANVIL right-sizes.** 🗣 In plain English: this wave touches no database, no API,
no auth, no migration — so the database/end-to-end test rungs are correctly skipped. The right tests are
the per-component accessibility/keyboard tests plus a tiny check that the density switch is wired.

- **Per component (11 files under `tests/component/ui/`)**, copying `tests/component/throwaway.test.tsx`
  exactly (import `render, screen` from `@testing-library/react`, `userEvent`, `axe` from `vitest-axe`;
  the `component` vitest project + `tests/component/setup.ts` already register `toHaveNoViolations` and
  cleanup): each file covers **keyboard operation, focus management, ARIA roles/attributes,
  disabled + error states, and a `vitest-axe` zero-violations assertion** — the specific cases are listed
  per component in §6.
- **Radix portal note:** Radix Select/Dialog portal into `document.body`. Query portalled content with
  `screen.getByRole(...)` (not `container`), and run axe on `document.body` for open states.
- **PinKeypad timers:** use `vi.useFakeTimers()` + `vi.advanceTimersByTime(120)` (and
  `vi.useRealTimers()` in cleanup) for the auto-submit assertion, since the component schedules
  `setTimeout`. 🗣 We fast-forward the clock in the test so we don't actually wait.
- **`tests/unit/tokens/density-vars.test.ts`** (node lane, copies the static-parse pattern of
  `token-resolve.test.ts`): loads `app/tokens.css` and asserts the comfortable `:root` block AND the
  `[data-density="compact"]` block each DEFINE `--ctl-h`, `--ctl-h-sm`, `--ctl-h-lg`, `--ctl-px`,
  `--ctl-fs`, `--ctl-radius`, `--field-h`, `--field-px`, `--field-fs`, and that compact's `--ctl-h`
  differs from comfortable's. 🗣 Proves the one switch the components rely on (compact vs comfortable)
  is really wired both ways, so a future token edit can't silently break density.
- **Live guards that gate this tree (already exist — must stay green):**
  - `tests/unit/lint/semantic-tokens-only.test.ts` → RED if any `components/ui/**` file has a hex /
    `bg-blue-500` / `bg-mfs-navy`.
  - `tests/unit/tokens/token-resolve.test.ts` → the 0a build-safety net.
- **Whole suite:** `npm test` (unit + component lanes) green; `tsc` clean; `next build` green.

**Acceptance criteria (Wave 1 "done"):**
1. All 27 files exist exactly as in §5; the barrel re-exports all 11 components + prop types.
2. Each of the 11 components matches its §6 spec (variants/states/sizes/Radix-or-plain).
3. Every component works in light/dark × comfortable/compact (proven visually in `/dev/ui`, structurally
   by reading density vars).
4. Each component has a passing jsdom test with a `vitest-axe` **zero-violations** assertion and the
   keyboard/focus/ARIA/disabled/error cases from §6.
5. `semantic-tokens-only.test.ts` is GREEN against the new `components/ui/**` tree (no token violations).
6. `density-vars.test.ts` GREEN.
7. `/dev/ui` renders all components in all states across the four panels and **404s in a production build**.
8. No existing screen, `components/*` file, or `_components/primitives.tsx` is modified (verify via
   `git diff --name-only` — only the 27 new files appear).
9. `tsc` clean, `next build` green, full `npm test` green. No new `package.json` entry. No AI references.

---

## 10 · i18n note (read before writing user-facing strings)

The components themselves should **not** import `t()` or `useLanguage()` — they are presentation primitives
that receive their labels/strings **via props** (so a screen later passes `t('businessName')`, the gallery
passes a literal). This keeps the components reusable and avoids forcing every consumer through the i18n
context. **Rule:** any string a real USER sees is the CALLER's responsibility to route through `t()`;
Wave-1 components expose label/hint/error/title/placeholder as props and never hard-code English UI prose.
The only literal text inside a component is non-translatable (numeric counters, the digit glyphs, ARIA
labels which may be English `aria-label`s — acceptable for 0b; a follow-up can parametrise ARIA labels if
Hakan wants TR screen-reader text). 🗣 In plain English: the widgets are blank frames for text, not text
themselves — the screen that uses a widget feeds it the right EN/TR words. The showroom feeds plain
English sample words because it's a dev-only showroom, not a real screen.

**FLAG for Hakan/conductor:** ARIA labels baked into PinKeypad/IconButton ("Digit 3", "Delete last digit",
"Close") are English literals. For 0b that is accepted (they are not visible prose and the app's a11y story
is AA, not bilingual-SR). If bilingual screen-reader labels are desired, those become props too — **decision
needed only if Hakan cares now**; default is ship English ARIA labels in 0b.

---

## 11 · Hexagonal check (for Gate 2)

- **Layer:** PRESENTATION ONLY. 🗣 This is the wallpaper and light-switches, not the wiring or plumbing.
- **Ports added/used:** NONE. No domain logic, no business operation, no contract in `lib/ports/`.
- **Adapters added:** NONE. No `lib/adapters/<vendor>/`. No vendor SDK imported (Radix is a UI a11y
  primitive library, already installed + allow-listed in 0a, used directly in the presentation layer —
  it is not a swappable external *service* like a DB/auth/payments vendor, so it needs no port/wrapper;
  this matches ADR-0009 which already justified it).
- **New dependencies:** NONE. `radix-ui` already in `package.json` (line 40, `^1.6.0`), justified in 0a/ADR-0009.
- **`lib/**` touched:** NONE. **`lib/adapters/**` imported from `components/**`:** NONE.
- **Rip-out test:** **N/A** — no external vendor *seam* is introduced (no DB/auth/payment/storage/email
  vendor enters via this wave). The Lego "swap a vendor = one adapter + one wiring line" test applies to
  external-service seams; this wave adds none. 🗣 There's no new socket-and-plug here to rip out, so the
  rip-out question doesn't apply — and that's correct for a pure-UI wave.

**Verdict line (for the conductor to paste into Gate 2):**
> **Port:** none added/used · **Adapter:** none · **New deps:** none (Radix pre-existing, justified ADR-0009) ·
> **Rip-out test:** N/A (no external-service seam introduced) → **PASS** (presentation-only, inner layers untouched).

---

## 12 · Risk Assessment (mandatory)

> Severity scale: 🔴 high · 🟡 medium · 🟢 low. "Must-fix" = blocks Gate 2 until the plan resolves it.

### Concurrency / race conditions
- 🟡 **PinKeypad auto-submit cleanup race** — the original `AuthKeypad` has a documented trap: putting
  `isSubmitting` in the auto-submit effect's dependency array causes the cleanup to `clearTimeout` the
  120ms submit timer before `onComplete` fires. **Mitigation:** copy AuthKeypad's `submittingRef` (ref,
  not state) pattern verbatim and keep the effect deps `[pin, onComplete]` only. Pin it with the
  fake-timer test (entering 4 digits → `onComplete` called once). **Must-fix:** NO (mitigated by the
  reference + the test).
- 🟢 Picker open/close animation vs Radix Dialog mount — using Radix Dialog's controlled `open` avoids the
  old hand-rolled `setTimeout(onDismiss, 260)` double-fire risk. Mitigation: drive everything off
  controlled `open`/`onOpenChange`. Must-fix: no.

### Security
- 🟢 **No material risks in this category.** No auth, no data access, no API, no user input persisted —
  presentation-only. Inputs take values via props and emit via callbacks; no `dangerouslySetInnerHTML`,
  no eval, no network. 🗣 Nothing here can leak data or be exploited — it's display code.

### Data migration
- 🟢 **No material risks.** No schema, no migration, no DB. (State to ANVIL: PITR/pgTAP/RLS = justified N/A.)

### Business-logic flaws
- 🟡 **Picker search fidelity** — the two-pass fuzzy match (substring → all-words fallback) is real,
  user-affecting logic copied from `BottomSheetSelector`. If copied imperfectly, screens that later adopt
  the Picker get worse search than today. **Mitigation:** copy `normalise()` + the two-pass `filtered`
  logic verbatim; add the explicit "naz rest → Naz Restaurant" fallback test. Must-fix: NO (test-covered).
- 🟡 **FormField ARIA wiring is the AA promise** — if `cloneElement` injection of `id`/`aria-describedby`/
  `aria-invalid` is wrong, the whole "label+error announced together" claim is hollow even though it
  *looks* right. **Mitigation:** the FormField test asserts the `htmlFor`↔`id` match, `aria-invalid` on
  error, `aria-describedby` includes hint+error ids, and `role="alert"` on the error; build FormField
  before the inputs so they're tested together. Must-fix: NO (test-covered) — but call it the headline
  correctness risk of the wave.

### Launch / merge blockers
- 🟡 **Radix portal testing surprise** — Select/Dialog render options/content into `document.body`, so a
  naive `container`-scoped query or `axe(container)` misses them and a test could false-green or false-red.
  **Mitigation:** §9 mandates `screen.getByRole` + `axe(document.body)` for open/portalled states.
  Must-fix: NO (planned).
- 🟡 **`next build` ignores tsc + ESLint** (`next.config` `ignoreBuildErrors`/`ignoreDuringBuilds` true),
  AND an unknown Tailwind utility emits no CSS rather than failing — so a typo'd token class would render
  colourless while the build stays green. **Mitigation:** the live `semantic-tokens-only` + `token-resolve`
  guards (unit lane, hard-gated) are the net; run `npm test` not just `next build`; visual smoke at `/dev/ui`
  confirms real paint. Must-fix: NO (existing guards cover it).
- 🟢 **Accidental scope creep into existing files** — the boundary is "no existing file edited."
  **Mitigation:** acceptance criterion #8 (`git diff --name-only` shows only the 27 new files); code-critic
  enforces. Must-fix: no.
- 🟢 **Gallery reachable in prod** — mitigated by the `notFound()` gate (§8) + no nav link. Must-fix: no.

### Gaps the spec does not cover (flagged, not assumed)
1. **Bilingual ARIA labels** — see §10 FLAG. Default: English ARIA labels in 0b. Decision needed only if
   Hakan wants TR screen-reader text now.
2. **Brand SVG / icons** — 0a DEFERRED the 7 brand SVGs (logo/star) and there is no shared icon set in
   the repo; the design uses `<use href="#i-…">` sprite refs that do NOT exist in our codebase. Wave-1
   components take icons as a `ReactNode` **prop** (caller supplies the SVG) and the gallery uses small
   inline SVGs for demo. The PinKeypad design shows `assets/star-icon-orange.svg` — the gallery will
   omit/inline a placeholder rather than depend on the un-synced asset. **No new icon dependency is
   introduced.** 🗣 We don't ship an icon library; each widget just accepts whatever icon you hand it.
   FLAG: if Hakan wants a shared icon component, that's a separate (Wave 2 / follow-up) decision.
3. **`cx`/className-merge helper** — we deliberately do NOT add `clsx`/`tailwind-merge` (new deps). Use
   `[...].join(' ')` (house style) or a 3-line local `cx`. Stated so the implementer doesn't reach for a dep.
4. **The design `.dc.html` last ~8KB was truncated** at fetch — but all 11 Wave-1 components are fully
   present (lines 714–842, verified). No Wave-1 spec is missing. 🗣 The cut-off part was later sections, not ours.

**Risk headline:** No 🔴 high risks. No **must-fix** Gate-2 blockers. The two correctness risks to watch
(both test-covered) are the **FormField ARIA wiring** and the **PinKeypad auto-submit timer race**; the
two process risks are **Radix portal test scoping** and the **build-ignores-tsc/ESLint** gap (covered by
the live token guards). 🗣 In plain English: nothing here should block approval. The things most likely to
go subtly wrong are the label-to-error wiring and the PIN auto-submit timing — both have a named fix and a
test that proves it.
