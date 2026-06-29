# UI Phase 0b · Wave 2 — DISPLAY (precision execution plan)

> **FORGE plan, written for an implementer who cannot see the planning conversation.**
> Every path, name, prop, and test case is spelled out. Build EXACTLY what is here.
> If anything below is wrong against the live files, STOP and flag the conductor — do not improvise.

**Date:** 2026-06-29 · **Branch to cut from `main`:** `feat/ui-0b-wave2-display`
**Scope:** Wave 2 of 3 (Display) of the 0b core component library. **NOT** Waves 1 (shipped, PR #94) or 3.

🗣 In plain English: Wave 1 built the form bricks (buttons, inputs). Wave 2 builds the *display* bricks — cards, tables, KPI tiles, pills, badges — the parts that show information rather than collect it. Same proven recipe as Wave 1: new files only, a private showroom to eyeball them, one accessibility test each. We touch zero live screens; the admin dashboard gets re-pointed onto these later (Phase 1), not now.

---

## 0 · Mini-map

```
DOMAIN (core logic) — NOT TOUCHED this wave
PRESENTATION (this is ALL presentation — no domain/ports/adapters)
  components/ui/   ← Wave-1 box; ADD 11 display bricks (Card…SyncDot)
  app/dev/ui/      ← existing showroom; ADD a Display section
  reuses: semantic tokens (0a) · Next <Link> (already used) — NO new dep, NO Radix needed
🗣 a new shelf of display parts in the same box + a showroom panel — zero live screens change
```

---

## 1 · Goal

Build 11 additive **display** components in `components/ui/`, each bound to **semantic Tier-2 tokens
only** (the same token layer Wave 1 uses — NOT the `mfs-*` tokens `primitives.tsx` uses; see §3 + the
deviation note in §12), each WCAG-AA, each with a jsdom component test plus a `vitest-axe`
zero-violations assertion. Plus a **`GalleryDisplay.tsx`** section wired into the existing dev-only
`/dev/ui` gallery, rendering every Wave-2 component in its states across the four theme × density panels.

🗣 In plain English: make 11 clean, reusable display widgets that match the agreed design, prove each is accessible with an automated test, and show them in the hidden showroom. Nothing ships to a real screen yet.

**Hard boundary (locked at Gate 1): PURELY ADDITIVE.** After Render, `git diff --name-only` must show
ONLY:
- new `components/ui/*.tsx` (11 files),
- new `tests/component/ui/*.test.tsx` (11 files),
- new `app/dev/ui/GalleryDisplay.tsx` (1 file),
- **PLUS exactly two allowed edits:** `components/ui/index.ts` (barrel additions) and
  `app/dev/ui/page.tsx` (wire in `<GalleryDisplay />`).

**NOTHING ELSE.** `app/dashboard/admin/_components/primitives.tsx`, `components/RecentActivity.tsx`,
`components/AppHeader.tsx`, every Wave-1 component, every screen — ALL UNTOUCHED. Merging Wave 2 must
change no screen behaviour.

🗣 In plain English: the only two existing files you may edit are the "index" that lists the parts and the showroom page that displays them. Everything else is hands-off — especially `primitives.tsx`, which we are deliberately *not* fixing here (Phase 1 rewrites the dashboard onto these new parts).

---

## 2 · Domain terms / vocabulary used in this plan

- **Semantic Tier-2 token** — a purpose-named CSS variable surfaced as a Tailwind utility
  (`bg-surface-raised`, `text-muted`, `border-default`, `bg-status-success-fill`). 🗣 A labelled paint pot
  ("card background", "muted text") — change the pot once, every brick repaints.
- **Tier-1 brand primitive** (`bg-mfs-navy`, `text-mfs-neutral-500`, the `mfs-*` utilities) — **BANNED**
  inside `components/ui/**` by the live lint test (`tests/unit/lint/semantic-tokens-only.test.ts`). 🗣 The
  raw colour-mixing tray. `primitives.tsx` reaches for it; our new components must NOT — they use the
  labelled pots instead. This is the single biggest difference from `primitives.tsx`.
- **Accent** — a small semantic-intent enum (`success | warning | danger | navy`) the caller passes to
  KPI tiles / pills. We map it to status tokens *inside* the component. 🗣 The caller says "this is a
  warning"; the component decides the colour. No colour class ever crosses the boundary.
- **Compound component** — a parent component exporting related sub-parts (`Table`, `Table.Head`,
  `Table.Row`, `Table.Cell`) so callers compose real semantic markup. 🗣 A table kit: the box plus its
  matching header/row/cell pieces, all from one import, so you build a real `<table>` not a fake grid.
- **Style-leaking prop** — any prop that lets a caller pass raw layout/colour (`widths`, `className` with
  colour classes, inline hex, `gridTemplateColumns` strings). **FORBIDDEN.** 🗣 A hole in the wall that
  lets a screen smuggle in its own paint — defeats the whole "change one token, every screen follows"
  promise. `primitives.tsx`'s `RowHead`/`TableRow` have this hole (`widths: string[]`); Wave 2 closes it.
- **`mfs-*` token** vs **semantic token** — note the tailwind config defines BOTH (the `mfs-*` ones are
  legacy aliases). The lint guard bans the `mfs-*` *form*; use the semantic form. 🗣 Two names point at the
  same paint; only one name is allowed in the new box.

---

## 3 · Sources of truth read (and what they bind)

| Source | What it locks |
|--------|---------------|
| `components/ui/Button.tsx` | The house pattern: `'use client'`, named export + exported prop interface, local `cx(...)` helper (NO `clsx`/`tailwind-merge` dep), `Record<Variant, string>` class maps, semantic tokens only, `forwardRef` where a single DOM element is wrapped. Copy this shape. |
| `components/ui/index.ts` | The barrel pattern: one `export { X } from './X'` + one `export type { XProps, … } from './X'` per component. Append Wave-2 entries in the same style. |
| `tests/component/ui/Button.test.tsx` | The EXACT test recipe: `render, screen` from `@testing-library/react`, `userEvent`, `axe` from `vitest-axe`, a `bg-action-*`-class assertion (proves no hex leak), and a `toHaveNoViolations` axe case. Copy verbatim per component. Tests live in **`tests/component/ui/`** (confirmed). |
| `app/dev/ui/page.tsx` + `GalleryFrame.tsx` + `GalleryForms.tsx` | The gallery wiring: `page.tsx` is a server component that `notFound()`s in production and renders `<GalleryFrame>{sections}</GalleryFrame>`. `GalleryFrame` paints the four `data-theme`×`data-density` panels. `GalleryForms.tsx` is the `'use client'` body. Wave 2 mirrors `GalleryForms.tsx` as `GalleryDisplay.tsx`, including the inline-SVG demo-icon pattern (no icon library). |
| `app/dashboard/admin/_components/primitives.tsx` | **REFERENCE ONLY — DO NOT EDIT.** The behaviour to generalize (Card href/compact branch, CardHead icon+title+count, KpiTile accent stripe + display value, SectionLabel, PageHeading eyebrow, ListRow accent-dot+last, RowHead/TableRow, StagePill, RangeTabs). Wave 2 reproduces the *behaviour* but: (a) swaps every `mfs-*`/`text-[Npx]`-hardcode to semantic tokens + type-ramp utilities, (b) closes the `widths` style-leak via a semantic `<table>`. |
| `tailwind.config.ts` lines 11–168 | The semantic utilities available (enumerated in §4 below). |
| `tests/unit/lint/semantic-tokens-only.test.ts` lines 32–66 | The live guard. Bans `#hex`, stock palette (`bg-blue-500`), and **Tier-1 brand primitives** `-mfs-(navy\|orange\|maroon\|red\|sand\|soft\|ink\|neutral\|kds)`. Wave-2 files must trip NONE. |
| `components/RecentActivity.tsx` line 172 | SyncDot shape A: `function SyncDot({ synced, time }: { synced: boolean; time: string })` — dot (green if synced, amber if not) + time text. STAYS LIVE/untouched. |
| `components/AppHeader.tsx` line 27 | SyncDot shape B: `function SyncDot()` — no args; reads a queue, renders red+ring (stuck) / amber+pulse+ring (syncing) / `null` (clean), with `aria-label`. STAYS LIVE/untouched. |
| ADR-0002 / ADR-0009 | ADR-0002 (hexagonal) not engaged (presentation, no port/adapter). ADR-0009 (Radix + test stack) honoured — but Wave 2 needs Radix in ZERO components (all plain semantic HTML; see §6). |

🗣 In plain English: Button is the template every new file copies; the barrel and gallery show exactly how to register and show a new part; `primitives.tsx` shows what each part should *do* but uses the old paint names — we keep the behaviour and switch the paint. The two SyncDot functions are the two real shapes our generalized SyncDot must cover.

### ⚠️ Prompt-vs-reality correction (read before writing any class)
The conductor brief said components "must resolve through `mfs-*` semantic tokens." **That is the
`primitives.tsx` convention and it is BANNED in `components/ui/**`.** The live lint guard
(`semantic-tokens-only.test.ts`) RED-fails on any `-mfs-*` utility. **Use the Tier-2 semantic tokens
Wave 1 uses** (`bg-surface-raised`, `text-muted`, `border-default`, `bg-status-success-fill`, …). This
plan specifies the semantic-token classes throughout. 🗣 The brief used the wrong paint-pot names; the
robot referee only accepts the new names, so we use those. This is the headline deviation from
`primitives.tsx` (§12).

---

## 4 · The exact semantic tokens these components need (Step-0 recon, confirmed against `tailwind.config.ts`)

All resolve through `var(--…)` CSS variables; the `mfs-*` aliases for the same vars are FORBIDDEN here.

**Surfaces:** `bg-surface-base` · `bg-surface-raised` (card/tile background) · `bg-surface-sunken`
(count-pill / muted fill) · `bg-surface-overlay`.
**Text:** `text-body` · `text-muted` · `text-subtle` (captions/labels) · `text-on-action` ·
`text-link` · `text-inverse`.
**Borders:** `border-default` (`border` DEFAULT) · `border-strong` · `border-subtle`.
**Action:** `text-action-primary` / `bg-action-primary` (navy-stripe substitute? NO — see accent map) ·
`bg-action-secondary` (navy fill, used for SegmentedControl active pill).
**Status families** (each with `-fill` / `-soft` / `-text` / `-border`): `status-success-*`,
`status-warning-*`, `status-error-*`, `status-info-*`, `status-deviation-*`, `status-neutral-*`.
**Type ramp (`fontSize` keys):** `text-display` (KPI value) · `text-h1`/`h2`/`h3` · `text-body`/`body-lg`/`body-sm` · `text-caption` (uppercase labels).
**Fonts:** `font-display` (KPI value, PIN keys) · `font-text` (everything else).
**Radius:** `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` / `rounded-pill`.
**Shadow:** `shadow-sm` / `shadow-md` / `shadow-lg`.
**Focus:** `focus-visible:ring-focus-ring` (interactive ones).

### The accent map (build this helper, mirror `accentClassFor` in `primitives.tsx` but token-clean)
The brief lists KPI/pill accents as `success | warning | danger | navy`. Map them to semantic tokens
**inside** the component (a small pure helper, NOT a caller-passed class):

| Accent | stripe / dot (bg) | value / text |
|--------|-------------------|--------------|
| `success` | `bg-status-success-fill` | `text-status-success-text` |
| `warning` | `bg-status-warning-fill` | `text-status-warning-text` |
| `danger`  | `bg-status-error-fill`   | `text-status-error-text`  |
| `navy`    | `bg-action-secondary`    | `text-action-secondary`   |

🗣 In plain English: the caller says "warning"; the component looks it up in this little table and applies the right *labelled* paint. Stripes/dots use the solid fill; value text uses the readable text shade. `danger` maps to the `error` status family (same colour, clearer name); `navy` maps to the brand secondary action colour. Keep this helper local to the file that needs it (Card/Kpi/Status/Sync share the same enum — define once in a shared tiny module if you prefer, e.g. `components/ui/accent.ts`, exported through the barrel as `Accent`; that is an additional NEW file and is allowed).

**Decision (state explicitly):** create **`components/ui/accent.ts`** exporting
`export type Accent = 'success' | 'warning' | 'danger' | 'navy'` and a pure
`accentTokens(accent): { fill: string; text: string }` helper. KpiTile, StatusPill, ListRow (accent dot),
and Badge import from it. This avoids four copies of the map. It is a NEW file under the allowed path; add
`export type { Accent } from './accent'` to the barrel. 🗣 One shared lookup table for accents instead of four — change a colour once.

---

## 5 · Exact file tree to create

```
components/ui/
  accent.ts            ← shared Accent type + accentTokens() map (NEW)
  Card.tsx             CardHead.tsx        KpiTile.tsx
  SectionLabel.tsx     PageHeading.tsx
  ListRow.tsx          Table.tsx
  SegmentedControl.tsx Badge.tsx
  StatusPill.tsx       SyncDot.tsx
  index.ts             ← EDIT: append Wave-2 exports (one of the 2 allowed edits)

app/dev/ui/
  GalleryDisplay.tsx   ← NEW: 'use client' — renders every Wave-2 component in its states
  page.tsx             ← EDIT: import + render <GalleryDisplay /> after <GalleryForms /> (2nd allowed edit)

tests/component/ui/
  Card.test.tsx        CardHead.test.tsx   KpiTile.test.tsx
  SectionLabel.test.tsx PageHeading.test.tsx
  ListRow.test.tsx     Table.test.tsx
  SegmentedControl.test.tsx Badge.test.tsx
  StatusPill.test.tsx  SyncDot.test.tsx
```

**File count:** 11 components + 1 shared `accent.ts` + 11 tests + 1 `GalleryDisplay.tsx` = **24 NEW
files**, plus **2 edits** (`index.ts`, `page.tsx`). (Card/SegmentedControl etc. count as the "10-ish";
the brief listed 11 component bullets — all 11 are built.)

**Conventions for every component (match Wave 1 / `Button.tsx`):**
- `'use client'` at the top of any component with state/handlers (SegmentedControl). Pure-render display
  components (Card, CardHead, KpiTile, SectionLabel, PageHeading, ListRow, Table, Badge, StatusPill,
  SyncDot) may be server-safe, **but mark them `'use client'` too** for consistency with the Wave-1 box and
  because the gallery (a client tree) imports them — safest and matches house style.
- TypeScript. Export a named component AND its props interface (`export interface CardProps`).
- Local `cx(...)` helper per file (copy from `Button.tsx`) OR import a shared one — do NOT add a dep.
- `forwardRef` only where a single focusable/ref-able DOM element is wrapped: NONE strictly need it for
  Wave 2 (display, mostly non-focusable). `Card` with `href` wraps a `<Link>`/`<div>` — `forwardRef` is
  optional; skip it unless a test needs it (Wave-1 Card primitive didn't ref). Keep it simple: no
  `forwardRef` in Wave 2 unless a behaviour requires it.
- **Semantic tokens only** (§4). NO `mfs-*`, NO hex, NO stock palette. NO `className` prop that carries
  layout/colour (a bare `className` passthrough is tempting but is a style-leak hole — **do NOT expose a
  generic `className` prop on these components**; if a caller needs spacing, that's the caller's wrapper,
  not a prop on the brick). Exception: internal composition only.
- Icons: caller-supplied `ReactNode` props. NO icon library added to `package.json`.
- ARIA labels: optional props with sensible English defaults (per §6 each).

🗣 In plain English: 11 widget files plus one shared accent table, 11 tests, one showroom section. Copy the Button file's shape exactly. Crucially — do NOT give these components a free-form `className` or any colour/width prop; that's the trap `primitives.tsx` fell into and the whole point of this wave is to close it.

---

## 6 · Per-component spec (props are SEMANTIC-INTENT ONLY · Radix-or-plain + why · tokens · tests)

> Build order = the numbered order below (each = one atomic commit; write the test alongside, red→green).
> Mirror `primitives.tsx` *behaviour*; mirror `Button.tsx` *structure*; use §4 *tokens*.

### 6.1 `Card` *(generalizes primitives.tsx Card, lines 63–82)*
- **Radix? NO** — plain `<div>` or Next `<Link>`. 🗣 A surface; no keyboard/ARIA machinery needed. When
  clickable it's a real link (Radix adds nothing).
- **Behaviour:** root surface. When `href` is set → renders Next `<Link href={href}>` with
  `transition-shadow hover:shadow-md cursor-pointer no-underline text-inherit`; else a `<div>`. `compact`
  toggles padding.
- **Tokens:** `block bg-surface-raised border border-default rounded-lg shadow-sm` + (`compact ? 'p-4' :
  'p-5'`). (primitives used `bg-white` + `border-mfs-neutral-200` → REPLACE with `bg-surface-raised` +
  `border-default`.)
- **Props (intent-only):** `{ children: ReactNode; compact?: boolean; href?: Route }`. Import
  `type { Route } from 'next'` (primitives.tsx already does, line 22). **NO `className` prop.**
- **Tests:** renders children; with `href` renders an `<a>` (`screen.getByRole('link')`) pointing at href;
  without href renders a non-link container; `compact` toggles the padding class (assert `p-4` vs `p-5`);
  className contains `bg-surface-raised` (no-hex proof); axe zero violations (wrap link content in
  meaningful text so the link has an accessible name).

### 6.2 `CardHead` *(generalizes primitives.tsx CardHead, lines 96–117)*
- **Radix? NO** — plain flex `<div>`.
- **Behaviour:** optional icon (caller `ReactNode`) + uppercase title + optional count. **The count
  renders via the new `Badge`** (compose, don't re-implement the pill).
- **Tokens:** `flex items-center gap-3` + (`compact ? 'mb-3' : 'mb-4'`); icon span `text-subtle flex`;
  title span `flex-1 font-semibold uppercase text-body` + (`compact ? 'text-caption' : 'text-body-sm'`)
  with `tracking-[0.1em]`. (Replace `text-mfs-neutral-500`→`text-subtle`, `text-mfs-black`→`text-body`,
  `text-xs/text-sm`→type-ramp keys.)
- **Props:** `{ icon?: ReactNode; title: string; count?: number | string; compact?: boolean }`.
- **Tests:** title rendered uppercase-styled (assert class + text); icon rendered when given, absent when
  not; count renders a `Badge` when `count != null` and is hidden when null; axe zero violations.

### 6.3 `KpiTile` *(generalizes primitives.tsx KpiTile, lines 186–251)*
- **Radix? NO** — Next `<Link>` (KPI tiles are clickable in the dashboard) OR a `<div>` when no href.
  **Decision:** make `href` **optional** (the brief says "optional href→Link"; primitives forced it
  required — this is a deliberate generalization, noted in §12). No href → render a non-link `<div>` with
  the same surface, omitting the tap-affordance arrow.
- **Behaviour:** accent stripe (left, `w-1 absolute`) + display-ramp value + label + optional sub +
  optional icon. `compact`. Uses `accentTokens(accent)` (§4) for stripe + value colour.
- **Tokens:** surface `relative block h-full overflow-hidden bg-surface-raised border border-default
  rounded-lg shadow-sm transition-shadow hover:shadow-md` + padding (`compact ? 'p-4 pl-5' : 'p-5
  pl-6'`); stripe `absolute left-0 top-0 bottom-0 w-1 ${tokens.fill}`; label `text-caption font-semibold
  uppercase text-subtle`; value `font-display leading-none tracking-[-0.02em] mt-3 ${tokens.text}` +
  (`compact ? 'text-h1' : 'text-display'`); sub `text-muted mt-1.5 text-body-sm`. (Replace `bg-white`,
  `text-mfs-neutral-*`, `text-[44px]`, `accentClassFor` → semantic + type-ramp + `accentTokens`.)
- **Props:** `{ value: string | number; label: string; sub?: string; accent: Accent; icon?: ReactNode;
  href?: Route; compact?: boolean }`.
- **Tests:** value + label render; `accent` produces the mapped stripe class (e.g. `success` →
  `bg-status-success-fill`) and value-text class — assert all four accents; `href` renders a link, no
  href renders a non-link; `sub` shows when given; `compact` swaps value size class; axe zero violations.

### 6.4 `SectionLabel` *(primitives.tsx lines 86–92)*
- **Radix? NO** — plain `<span>`.
- **Tokens:** `text-caption font-semibold tracking-[0.14em] uppercase text-subtle`. (Replace
  `text-[11px]`→`text-caption`, `text-mfs-neutral-500`→`text-subtle`.)
- **Props:** `{ children: ReactNode }`.
- **Tests:** renders children; class contains `text-subtle` + `uppercase`; axe zero violations (render
  inside a landmark or with surrounding text so axe is meaningful).

### 6.5 `PageHeading` *(primitives.tsx lines 292–300 — eyebrow only, NO H1)*
- **Radix? NO** — plain `<div>`. Per the Q4 design decision, NO `<h1>`.
- **Behaviour:** an eyebrow caption line + optional children below it.
- **Tokens:** eyebrow `text-caption font-semibold tracking-[0.14em] uppercase text-subtle`.
- **Props:** `{ eyebrow: ReactNode; children?: ReactNode }`. (Generalize: primitives baked a default
  string `'Admin · Daily glance'`; make `eyebrow` an explicit prop so it's reusable — noted §12.)
- **Tests:** renders the eyebrow text; renders children when given; NO `<h1>` in the output
  (`expect(container.querySelector('h1')).toBeNull()`); class contains `text-subtle`; axe zero violations.

### 6.6 `ListRow` *(primitives.tsx lines 121–138 — mobile stacked row)*
- **Radix? NO** — plain flex `<div>`.
- **Behaviour:** stacked row holding caller `cells`; optional accent dot (semantic accent, NOT a raw
  class); `last` flag removes the bottom border.
- **Tokens:** `flex items-center gap-3 py-3` + (`last ? '' : 'border-b border-default'`); dot
  `w-1.5 h-1.5 rounded-full flex-shrink-0 ${accentTokens(accent).fill}`. **Deviation from primitives:**
  primitives took `accentClassName?: string` (a style-leak!). Replace with `accent?: Accent` and map it
  internally. 🗣 Caller says "warning dot", not "amber class" — closes the leak.
- **Props:** `{ cells: ReactNode; accent?: Accent; last?: boolean }`.
- **Tests:** renders cells; accent dot present + correct mapped class when `accent` given, absent when
  not; `last` toggles `border-b`; axe zero violations.

### 6.7 `Table` *(generalizes primitives.tsx RowHead/TableRow, lines 142–171 — THE architecture decision)*
- **Radix? NO** — real semantic `<table>`. 🗣 A browser table is already accessible (header association,
  row/cell semantics) — Radix has no table primitive and none is needed.
- **THE DECISION:** replace the `widths: string[]` grid faux-table with a **SEMANTIC `<table>`** using a
  **compound API**. Column sizing/alignment is expressed as *semantic props owned inside the component* —
  **NO `widths`, NO `gridTemplateColumns`, NO raw grid strings ever cross the boundary.** The Phase-1
  admin re-point will be a rewrite of the dashboard tables; that is accepted (brief-confirmed).
- **Chosen compound API (named exports + dot-notation):**
  ```
  Table        → <table> wrapper  (props: { children })
  Table.Head   → <thead>          (props: { children })
  Table.Body   → <tbody>          (props: { children })  — optional; rows can sit directly, but provide it
  Table.Row    → <tr>             (props: { children; last?: boolean })  — last drops the row border
  Table.HeaderCell → <th scope="col"> (props: { children; align?: 'start'|'center'|'end';
                                                  hideBelow?: 'sm'|'md' })
  Table.Cell   → <td>             (props: { children; align?: 'start'|'center'|'end';
                                            hideBelow?: 'sm'|'md' })
  ```
  Attach sub-components via `Table.Head = TableHead` etc. AND export each individually
  (`export { TableHead, TableRow, TableCell, TableHeaderCell }`) so both `<Table.Cell>` and a named import
  work. `align` maps to `text-start/center/end`; `hideBelow` maps to a responsive utility
  (`hidden sm:table-cell` / `hidden md:table-cell`) — these are **layout utilities, not colour**, so they
  pass the lint guard. Width is governed by content + `<colgroup>`-free natural sizing; if a caller needs a
  fixed first column they wrap content, they do NOT pass a width.
  🗣 In plain English: a proper table you build from labelled pieces — `Table`, a head, rows, header-cells
  and cells. You tell it "align this column right" or "hide this column on phones" with words, never with a
  pixel/grid string. That's the deep-module choice: the screen can't smuggle in its own layout.
- **Tokens:** table `w-full text-body-sm`; `<th>` `text-caption font-semibold tracking-[0.1em] uppercase
  text-subtle text-start pb-2 border-b border-default`; `<td>` `py-3 align-middle`; row border
  `border-b border-default` unless `last`.
- **Props:** as above — all semantic-intent, no style-leak.
- **Tests:** renders a real `<table>` with `<thead>/<tbody>/<th>/<td>` (assert tag names / `role="table"`,
  `role="columnheader"`, `role="cell"`); `<th>` has `scope="col"`; `align='end'` applies `text-end`;
  `hideBelow='md'` applies the responsive hide class; `last` row drops `border-b`; **assert NO inline
  `style` attribute and NO `grid-template` anywhere** (the anti-leak guard); axe zero violations on a
  small populated table.

### 6.8 `SegmentedControl` *(generalizes primitives.tsx RangeTabs, lines 255–288)*
- **Radix? NO — explicitly NOT Radix Tabs.** 🗣 Radix Tabs is for tab *panels* (content that swaps); we
  have zero tab-panel usage in the app and the brief rejects it as speculative. This is a controlled pill
  *button group* — plain `<button>`s with `aria-pressed` do the a11y job correctly and lighter.
- **Behaviour:** controlled `value`/`onChange`; `options: {id,label}[]`; renders a pill group; active pill
  filled; each button `aria-pressed`. NO content panels.
- **Tokens:** group `inline-flex gap-1 bg-surface-raised border border-default rounded-pill p-1 w-fit
  max-w-full`; button `rounded-pill px-4 py-1.5 text-body-sm font-semibold font-text transition-colors
  border-0 cursor-pointer whitespace-nowrap`; active `bg-action-secondary text-on-action`, inactive
  `bg-transparent text-muted hover:text-body`. (Replace `bg-white`, `bg-mfs-navy text-white`,
  `text-mfs-neutral-700`, `text-[13px]` → semantic + type-ramp.)
- **Props (intent-only, generic over the id):**
  `<T extends string>{ value: T; onChange: (next: T) => void; options: { id: T; label: ReactNode }[];
  'aria-label'?: string }`. (Drop primitives' `scrollOnSmall` styling-knob OR keep it as a semantic
  `scrollable?: boolean` — keep it as `scrollable?: boolean` since it's behavioural, not a style string.)
  Add `role="group"` + the optional `aria-label` (default e.g. `'View options'`) on the wrapper.
- **Tests:** renders one button per option; active option has `aria-pressed="true"`, others `"false"`;
  clicking an option fires `onChange(id)`; keyboard: focus a button → `{Enter}`/`Space` activates (native
  button behaviour — assert `onChange`); group has accessible name from `aria-label`; **NO content
  panel/tabpanel role present**; active pill class contains `bg-action-secondary`; axe zero violations.

### 6.9 `Badge` *(NEW generalization — the CardHead count-pill + a neutral label pill)*
- **Radix? NO** — plain `<span>`.
- **Behaviour:** a generic count/label pill. Two intents: a **count** pill (the one CardHead's count used,
  lines 109–113 in primitives) and a **neutral label** pill. Drive via an optional `tone` semantic-intent
  prop, default neutral.
- **Tokens (neutral):** `inline-flex items-center justify-center text-caption font-semibold text-muted
  bg-surface-sunken border border-default rounded-pill px-2.5 py-0.5 min-w-[24px] text-center`. (Replace
  `text-[11px]`, `text-mfs-neutral-500`, `bg-mfs-soft-neutral`, `border-mfs-neutral-200` → semantic.)
  Optional `tone?: 'neutral' | Accent` — when an accent is passed, use the status `-soft` bg +
  `-text` text + `-border` (e.g. `success` → `bg-status-success-soft text-status-success-text
  border-status-success-border`). Default `neutral`.
- **Props:** `{ children: ReactNode; tone?: 'neutral' | Accent }`.
- **Tests:** renders children; default neutral class contains `bg-surface-sunken`; `tone='success'`
  applies `bg-status-success-soft`; axe zero violations.

### 6.10 `StatusPill` *(generalizes primitives.tsx StagePill, lines 175–182)*
- **Radix? NO** — plain `<span>`.
- **Behaviour:** coloured dot + text label, accent-driven. Generalizes StagePill (which took a raw
  `dotClassName` string — a style-leak). Replace with `accent: Accent` mapped internally.
- **Tokens:** `inline-flex items-center gap-1.5 text-caption font-semibold tracking-wide uppercase
  text-body`; dot `w-1.5 h-1.5 rounded-full ${accentTokens(accent).fill}`. (Replace
  `dotClassName`→accent map, `text-[11px]`→`text-caption`, `text-mfs-neutral-700`→`text-body`.)
- **Props:** `{ accent: Accent; label: ReactNode }`.
- **Tests:** renders label; dot class matches the mapped accent fill (assert all four); axe zero
  violations.

### 6.11 `SyncDot` *(generalizes BOTH live shapes: RecentActivity line 172 + AppHeader line 27)*
- **Radix? NO** — plain `<span>`.
- **Behaviour (cover BOTH shapes via one prop set):**
  - **Shape A** (RecentActivity `{ synced, time }`): when `time` is provided, render the dot + the time
    text. `synced` true → green (success) dot; false → amber (warning) dot.
  - **Shape B** (AppHeader bare/no-arg, queue-derived): a bare indicator with NO time. Cover the three
    visual states it produces — `clean` (renders nothing / `null`), `syncing` (amber + pulse + ring),
    `stuck` (red/error + ring). Drive via an explicit `state` prop so the component stays presentational
    (it does NOT read a queue — the caller computes state from the queue, per "no data fetching in
    components" Wave-1 rule).
- **Chosen unified interface:**
  ```ts
  export type SyncState = 'clean' | 'synced' | 'syncing' | 'stuck'
  export interface SyncDotProps {
    state: SyncState
    time?: string                 // Shape A: render the timestamp text beside the dot
    'aria-label'?: string         // default per state: 'Synced' | 'Syncing' | 'Sync error'
  }
  ```
  - `state='synced'` → success-fill dot (+ `time` text if given) — Shape A "synced".
  - `state='syncing'` → warning-fill dot + `animate-pulse` + ring (+ optional `time`) — covers Shape A
    "not synced" AND Shape B "syncing".
  - `state='stuck'` → error-fill dot + ring + default `aria-label='Sync error'` — Shape B "stuck".
  - `state='clean'` → returns `null` — Shape B "queue empty".
- **Tokens:** dot base `w-1.5 h-1.5 rounded-full flex-shrink-0` (Shape-A small) — for the Shape-B bare
  indicator use `w-2.5 h-2.5` + `ring-2`; fills: synced `bg-status-success-fill`, syncing
  `bg-status-warning-fill`, stuck `bg-status-error-fill`; rings `ring-status-warning-soft` /
  `ring-status-error-soft`; time text `text-caption text-subtle`. (Replace `bg-green-400`/`bg-amber-400`/
  `bg-red-400`/`text-gray-500` — all stock-palette, ALL banned — with status tokens.)
  **Size note:** expose a semantic `size?: 'sm' | 'md'` (`sm` = the RecentActivity inline dot, `md` = the
  AppHeader header dot) rather than two components. Default `sm` when `time` present, else `md`.
- **Props (final):** `{ state: SyncState; time?: string; size?: 'sm' | 'md'; 'aria-label'?: string }`.
- **a11y:** the bare states carry an `aria-label` (default per state); when `time` is shown the dot is
  decorative beside readable text (give the dot `aria-hidden` if the time conveys the info, OR keep the
  aria-label — keep a sensible default label).
- **Tests:** `state='synced'` renders success-fill class + shows `time` when given; `state='syncing'`
  renders warning-fill + pulse; `state='stuck'` renders error-fill + default `aria-label='Sync error'`;
  `state='clean'` renders nothing (`container.firstChild` is null); `size` toggles `w-1.5` vs `w-2.5`;
  NO stock-palette/hex class present; axe zero violations for each non-clean state.

🗣 In plain English (whole section): every Wave-2 component is plain semantic HTML — no Radix needed, because nothing here is an interactive widget that hides keyboard/focus traps (the one interactive piece, SegmentedControl, is a button group that `aria-pressed` handles natively). The big architecture move is the Table: we build a real HTML table from labelled pieces and refuse to let callers pass pixel widths. And SyncDot folds the app's two existing sync-dot shapes into one `state`-driven widget that the caller feeds — it never phones the queue itself.

---

## 7 · Barrel + gallery wiring steps

### 7.1 Barrel — `components/ui/index.ts` (EDIT — allowed)
Append, in the existing style (named export + type export), after the Wave-1 block:
```ts
export type { Accent } from './accent'

export { Card } from './Card'
export type { CardProps } from './Card'

export { CardHead } from './CardHead'
export type { CardHeadProps } from './CardHead'

export { KpiTile } from './KpiTile'
export type { KpiTileProps } from './KpiTile'

export { SectionLabel } from './SectionLabel'
export type { SectionLabelProps } from './SectionLabel'

export { PageHeading } from './PageHeading'
export type { PageHeadingProps } from './PageHeading'

export { ListRow } from './ListRow'
export type { ListRowProps } from './ListRow'

export { Table } from './Table'
export type {
  TableProps, TableRowProps, TableCellProps, TableHeaderCellProps,
} from './Table'

export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps } from './SegmentedControl'

export { Badge } from './Badge'
export type { BadgeProps } from './Badge'

export { StatusPill } from './StatusPill'
export type { StatusPillProps } from './StatusPill'

export { SyncDot } from './SyncDot'
export type { SyncDotProps, SyncState } from './SyncDot'
```
🗣 In plain English: add each new part to the index so a screen can later `import { Table } from '@/components/ui'`. Don't touch the Wave-1 lines above.

### 7.2 Gallery body — `app/dev/ui/GalleryDisplay.tsx` (NEW)
Mirror `GalleryForms.tsx`: `'use client'`, import the Wave-2 components from `@/components/ui`, reuse the
inline-SVG demo-icon pattern (no icon library), render **every component in its states**:
- A few `Card`s (plain, with-href, compact) each holding a `CardHead` (with/without icon, with count) and
  body content.
- A KPI row: one `KpiTile` per accent (`success/warning/danger/navy`), with/without `sub`, with/without
  `href`, plus a `compact` row.
- `SectionLabel` + `PageHeading` (eyebrow + sample children).
- A `Table` with a `Table.Head` and 3–4 `Table.Row`s using `align` and one `hideBelow` column.
- A live `SegmentedControl` driven by local `useState` (e.g. Today/Week/Month).
- `Badge` in neutral + each accent tone.
- `StatusPill` for each accent.
- `SyncDot` in all four states (`clean` shows "nothing", `synced` with a time, `syncing`, `stuck`) at both
  sizes.

🗣 In plain English: a showroom panel that renders each display part in every look, with a working tab-strip you can click, so a human can eyeball them in light/dark and roomy/tight.

### 7.3 Gallery shell — `app/dev/ui/page.tsx` (EDIT — allowed)
Add `import { GalleryDisplay } from './GalleryDisplay'` and render it inside `<GalleryFrame>` after
`<GalleryForms />`:
```tsx
return (
  <GalleryFrame>
    <GalleryForms />
    <GalleryDisplay />
  </GalleryFrame>
)
```
(The `notFound()` production gate already exists — do not change it.) Optionally the implementer may add a
small heading/separator between the two sections **inside GalleryDisplay** (not by editing GalleryFrame).
🗣 In plain English: show the new display section right under the existing forms section in the same hidden showroom. The only change to the page file is one import and one extra line.

---

## 8 · Test plan (right-sized — presentation-only)

**Layer used: component (jsdom) + the existing static lint/token guards. NO E2E, NO integration, NO
pgTAP/RLS, NO PITR.** State this explicitly so ANVIL right-sizes. 🗣 This wave touches no database, route,
or auth — so those rungs are correctly N/A. The right tests are per-component accessibility/behaviour tests
plus the existing token/no-hex guard re-running over the new files.

- **Per component (11 files under `tests/component/ui/`)**, copying `tests/component/ui/Button.test.tsx`
  exactly (`render, screen` from `@testing-library/react`; `userEvent`; `axe` from `vitest-axe`; the
  `component` vitest project + `tests/component/setup.ts` register `toHaveNoViolations` + cleanup). Each
  file covers the §6 cases: **semantic-token class assertions (no-hex proof), key behaviour/ARIA roles,
  and a `vitest-axe` zero-violations assertion.**
- **Table anti-leak assertion** (the architecture test): assert the rendered output contains a real
  `<table>`/`<th scope="col">`/`<td>` AND contains **no inline `style` attribute and no `grid-template`
  string** — proving the faux-grid/style-leak was eliminated.
- **SegmentedControl**: assert `aria-pressed` flips and `onChange` fires on click + keyboard; assert NO
  `role="tabpanel"` is present (it is NOT Radix Tabs).
- **Live guards that gate this tree (already exist — must STAY green over the new files):**
  - `tests/unit/lint/semantic-tokens-only.test.ts` → RED if any new `components/ui/**` file uses
    hex / `bg-blue-500` / `-mfs-*`. **This is the guard that makes the §3 correction load-bearing.**
  - `tests/unit/tokens/token-resolve.test.ts` → the 0a build-safety net.
- **Whole suite:** `npm test` (unit + component lanes) green; `tsc` clean; `next build` green.

**Acceptance criteria (Wave 2 "done"):**
1. All 24 new files exist exactly as in §5; the barrel re-exports all 11 components + `Accent` + prop types.
2. Each of the 11 components matches its §6 spec (intent-only props, plain HTML, semantic tokens).
3. `Table` is a real semantic `<table>` with a compound API; NO `widths`/grid-string/inline-style leak.
4. Each component has a passing jsdom test with a `vitest-axe` **zero-violations** assertion + its §6 cases.
5. `semantic-tokens-only.test.ts` GREEN over the new tree (no `mfs-*`/hex/stock-palette).
6. `/dev/ui` renders the new Display section in all states across the four panels and 404s in a prod build.
7. **`git diff --name-only` shows ONLY the 24 new files + the 2 allowed edits (`index.ts`, `page.tsx`).**
   `primitives.tsx`, `RecentActivity.tsx`, `AppHeader.tsx`, every Wave-1 component, every screen UNTOUCHED.
8. `tsc` clean, `next build` green, full `npm test` green. NO new `package.json` entry. NO AI references.

---

## 9 · Hexagonal check (for Gate 2)

- **Layer:** PRESENTATION ONLY. 🗣 Wallpaper and signage, not wiring or plumbing.
- **Ports added/used:** NONE. No domain logic, no business operation, no `lib/ports/` contract.
- **Adapters added:** NONE. No `lib/adapters/<vendor>/`. No vendor SDK imported. (Radix isn't even used
  this wave; Next `<Link>` is a framework primitive already used throughout, not a swappable service.)
- **New dependencies:** NONE. No icon library, no `clsx`/`tailwind-merge` — local `cx` only. If you think a
  dep is needed, **STOP and flag** — do not `npm install`.
- **`lib/**` touched:** NONE. **`lib/adapters/**` imported from `components/**`:** NONE.
- **Rip-out test:** **N/A** — no external-service seam (DB/auth/payment/storage/email) is introduced. The
  Lego "swap a vendor = one adapter + one wiring line" test applies to external-service seams; this wave
  adds none. 🗣 No new socket-and-plug here, so the rip-out question doesn't apply — correct for pure UI.

**Verdict line (paste into Gate 2):**
> **Port:** none added/used · **Adapter:** none · **New deps:** none (no Radix this wave; Next `<Link>` is a
> pre-existing framework primitive) · **Rip-out test:** **N/A** (no external-service seam) →
> **PASS** (presentation-only, inner layers untouched, additive).

---

## 10 · Risk Assessment (mandatory)

> Severity: 🔴 high · 🟡 medium · 🟢 low. "Must-fix" = blocks Gate 2 until the plan resolves it.

### Concurrency / race conditions
- 🟢 **No material risks.** No timers, no async, no effects with cleanup (SegmentedControl is a controlled
  click handler; everything else is pure render). 🗣 Nothing schedules work that could race.

### Security
- 🟢 **No material risks.** No auth, no data access, no API, no `dangerouslySetInnerHTML`, no network.
  Components take data via props and emit via callbacks. 🗣 Display code — nothing to leak or exploit.

### Data migration
- 🟢 **No material risks.** No schema, no migration, no DB. (State to ANVIL: PITR/pgTAP/RLS = justified N/A.)

### Business-logic flaws
- 🟡 **The `mfs-*`-vs-semantic-token trap (HEADLINE process risk).** The conductor brief literally said
  "must resolve through `mfs-*` semantic tokens" — but the live lint guard **bans `-mfs-*`** in
  `components/ui/**`. An implementer following the brief verbatim would write `bg-mfs-navy` and **RED the
  lint suite**, OR (worse) someone might disable the guard. **Mitigation:** §3 correction + every §6 spec
  gives the exact *semantic* class; §4 enumerates the allowed tokens; the live guard catches any slip.
  **Must-fix:** NO (mitigated by the plan stating the correct tokens + the guard) — but it is the single
  most likely thing to go wrong, so it is called out loudly.
- 🟡 **Table semantic-rewrite (the deliberate deviation).** `primitives.tsx` uses a CSS-grid faux-table
  with caller-passed `widths: string[]`. Wave 2 replaces it with a real `<table>` + compound API and NO
  width prop. This means the Phase-1 admin re-point is a **rewrite, not a drop-in** — accepted by the
  brief, but flag it so no one expects API parity with the old `RowHead`/`TableRow`. **Mitigation:** the
  anti-leak test pins "no grid-template / no inline style"; the §6.7 API is fully specified. **Must-fix:**
  NO (intentional, brief-confirmed). 🗣 We're choosing the right long-term shape over a quick like-for-like
  copy — the dashboard tables get rebuilt later, on purpose.
- 🟡 **SyncDot two-shape coverage.** The unified `state`-driven API must faithfully cover BOTH live shapes
  (RecentActivity's `{synced,time}` and AppHeader's queue-derived clean/syncing/stuck). If the state
  mapping is wrong, a future screen adopting it shows the wrong sync status. **Mitigation:** §6.11 maps
  every state explicitly; tests assert each state's class + the `clean`→null behaviour. The component is
  presentational (caller computes state) per the Wave-1 "no data fetching in components" rule — it does NOT
  read the queue. **Must-fix:** NO (test-covered + explicitly specified).

### Launch / merge blockers
- 🟡 **`next build` ignores tsc + ESLint** (next.config), AND an unknown Tailwind utility emits no CSS
  rather than failing — a typo'd token class renders colourless while the build stays green.
  **Mitigation:** the live `semantic-tokens-only` + `token-resolve` unit guards (hard-gated) are the net;
  run `npm test`, not just `next build`; visual smoke at `/dev/ui` confirms real paint. **Must-fix:** NO.
- 🟢 **Accidental scope creep into existing files.** Boundary = "no existing file edited except `index.ts`
  + `page.tsx`." **Mitigation:** acceptance #7 (`git diff --name-only`); code-critic enforces. Must-fix: no.
- 🟢 **Gallery reachable in prod.** Already mitigated by the existing `notFound()` gate + no nav link;
  Wave 2 adds no route. Must-fix: no.
- 🟢 **A generic `className`/`style` prop sneaking onto a component.** That would reopen the style-leak the
  wave exists to close. **Mitigation:** §5 forbids exposing `className` on these bricks; the Table
  anti-leak test pins it for the highest-risk component. Must-fix: no.

### Gaps the spec does not cover (flagged, not assumed)
1. **KPI `href` made optional** — primitives forced `href` required; the brief says "optional href→Link",
   so Wave-2 KpiTile renders a non-link `<div>` when no href (omitting the tap-arrow). Deviation, noted §12.
2. **PageHeading `eyebrow` is now an explicit prop** (primitives baked a default string). Deviation, §12.
3. **Bilingual ARIA labels** — SyncDot/Table default labels are English literals (consistent with Wave-1's
   accepted 0b decision). Default: ship English ARIA labels. Decision needed only if Hakan wants TR
   screen-reader text now. 🗣 The hidden screen-reader text is English for now, same as Wave 1.
4. **Brand icons** — no icon library; components take icons as `ReactNode` props; the gallery uses inline
   demo SVGs (same as Wave 1). No new dep.

**Risk headline:** **No 🔴 high risks. No must-fix Gate-2 blockers.** The one process risk to watch is the
**`mfs-*`-vs-semantic-token correction** (brief said `mfs-*`, lint bans it — plan uses the correct semantic
tokens and the live guard backstops it). The deliberate, brief-confirmed deviations are the **Table
semantic rewrite** (no `widths`) and **KpiTile/PageHeading generalizations**. All are test-covered or
plan-specified. 🗣 In plain English: nothing should block approval. The thing most likely to trip the build
is using the old paint-pot names — the plan spells out the right ones and a robot referee catches any slip.

---

## 11 · Deviations from `primitives.tsx` (explicit list — for the conductor's report)

1. **Tokens:** every `mfs-*`/hex/`text-[Npx]` in primitives → **semantic Tier-2 token + type-ramp
   utility** (forced by the lint guard; primitives is exempt as pre-existing, `components/ui/**` is not).
2. **Table:** primitives' `RowHead`/`TableRow` CSS-grid + `widths: string[]` → a **real `<table>` compound
   API** with semantic `align`/`hideBelow` props. NO `widths`, NO grid-template, NO inline style.
3. **ListRow accent:** primitives' `accentClassName?: string` (style-leak) → **`accent?: Accent`** mapped
   internally.
4. **StatusPill (StagePill):** primitives' `dotClassName: string` (style-leak) → **`accent: Accent`**.
5. **KpiTile `href`:** required in primitives → **optional** (renders `<div>` when absent).
6. **PageHeading:** baked default string → **explicit `eyebrow` prop**.
7. **SegmentedControl (RangeTabs):** `ranges`→`options`, `bg-mfs-navy`→`bg-action-secondary`,
   `scrollOnSmall`→`scrollable`, adds `role="group"` + `aria-label`.
8. **SyncDot:** unifies the two live shapes (RecentActivity + AppHeader) into one `state`-driven,
   presentational component (caller computes state; no queue read inside).
9. **No `className` prop** on any Wave-2 component (primitives' Card exposed `className` — a leak); spacing
   is the caller's wrapper concern.
