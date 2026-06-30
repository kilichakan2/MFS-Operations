# Plan — HACCP hub touch-ups + design-system governance

**Date:** 2026-06-30
**Branch:** `fix/haccp-hub-touchups-ds-governance`
**Slug:** `haccp-hub-fixes-and-ds-governance`
**Type:** Presentation + governance (lint guard + docs rule). **NO DB / NO migration / NO RLS / NO new npm dependency.**
**Follow-up to:** PR #106 (HACCP hub rebuild).

🗣 In plain English: five small jobs on the food-safety kiosk screens plus one permanent
"rule with teeth" so a reusable visual component can never again be wired straight into a
page. Nothing touches the database, logins, or any outside vendor — it's all screen code,
one CI test, and one written rule.

---

## Goal

1. **Fix 1** — Stop a scroll gesture on a hub tile from being read as a tap (real touch bug).
2. **Fix 2** — Render ALL of the HACCP kiosk in the approved DARK theme, including the
   pop-up overlays (PIN keypad, help panels, menus) that portal outside the themed subtree.
3. **Fix 3** — Replace the wide wordmark in the HACCP header with the compact square brand
   icon, the design-system way (asset lives in the kit, consumed from the barrel).
4. **Governance (a)** — Write the rule into `CLAUDE.md`: every reusable visual primitive /
   brand asset is DEFINED in `components/ui/` and CONSUMED from its barrel; screens never
   define one inline or import one from outside the kit.
5. **Governance (b)** — A CI lint/test guard under `tests/unit/lint/` that FAILS if a
   brand/icon/logo-style component (an EXPORTED component whose body is an `<svg>`) is
   defined anywhere outside `components/ui/`.

🗣 In plain English: two bug-class fixes, one cosmetic swap, and a written-down-plus-
automated rule so the stray-logo mistake that triggered this work can't recur silently.

---

## Domain terms (plain-English)

- **Kit / design-system barrel** — `components/ui/index.ts`, the single re-export surface
  screens import from. 🗣 The shop counter: screens ask the counter for a Button or a logo,
  they never wander into the stockroom (`components/ui/*.tsx` files) themselves.
- **Token / `data-theme="dark"`** — CSS custom properties in `app/tokens.css`; the
  `[data-theme="dark"]` block (line 91) re-defines every colour variable for dark mode.
  🗣 A master colour dial: flip one attribute and every component that reads the dial
  repaints dark. Components only respond if they live *inside* the element holding the dial.
- **Radix Portal** — Radix renders Modal/Popover/DropdownMenu content into `document.body`,
  not where you wrote the JSX. 🗣 The pop-up teleports to the top of the page; if the colour
  dial is only set on the kiosk box, the teleported pop-up never sees it and stays light.
- **svg-rooted component** — a component function whose `return` is an `<svg>` and nothing
  else (the whole component IS the icon). 🗣 The fingerprint of a brand/icon/logo asset —
  exactly what must live in the kit, not loose in a page.

---

## Compliance flags

None. This is presentation + tooling + docs. No personal data, no auth, no HACCP record
logic, no allergen/labelling content is touched. The ~21 un-migrated HACCP screens still
use hardcoded colours (see Risk R3) — accepted, they are being rebuilt in UI Phase 1.

🗣 In plain English: nothing here changes what the kiosk records or who can see it, so no
food-safety or data-protection rules come into play.

---

## ADR / decision alignment

- **ADR-0014** (`docs/adr/0014-screen-design-system-consumption-and-tiered-design-workflow.md`)
  — Rule 1 "code-composes-the-kit" and Rule 3 "missing pattern → add to kit FIRST, then
  use it." The entire governance piece operationalises ADR-0014; the brand assets moving
  into the kit and being barrel-exported is Rule 1; the written rule + lint guard make
  Rule 3 enforceable.
- **Decision #17** (no style-leaking props) — honoured. `MfsIcon`/`MfsLogo` keep their
  existing single `className` prop (a sizing/colour hook, not a style-leak of internals);
  no new style props are added. StatusTile gains no new style props.
- **No ADR conflicts found.** This plan strengthens ADR-0014; it contradicts nothing.

🗣 In plain English: this is exactly the behaviour ADR-0014 already asks for, now with a
written rule and an automated check behind it. Nothing here fights an earlier decision.

---

## Exact files to change

**Fix 1 — StatusTile tap**
- `components/ui/StatusTile.tsx` — change tile button + help button activation (below).
- `tests/unit/components/StatusTile.test.tsx` — NEW unit test (tap/scroll/keyboard).

**Fix 2 — dark theme + overlays**
- `app/haccp/layout.tsx` — keep `data-theme="dark"` on the `haccp-shell` div AND mount a
  tiny client child that locks the document root to dark (so portals inherit). Stays a
  server component (keeps its `metadata` export).
- `app/haccp/ThemeLock.tsx` — NEW client component (`'use client'`), renders `null`, sets
  `document.documentElement[data-theme]="dark"` on mount, restores prior value on unmount.

**Fix 3 — header icon, the DS way**
- `components/MfsLogo.tsx` → **relocate to** `components/ui/MfsLogo.tsx` (git-move; no body
  change).
- `components/ui/index.ts` — barrel-export `MfsLogo` and `MfsIcon`.
- `app/haccp/page.tsx` — re-point the `MfsLogo` import to the kit barrel; swap the two
  HEADER call sites (lines ~386 and ~718) `MfsLogo` → `MfsIcon`; LEAVE the login-door
  watermark (line ~821) as the wordmark (flagged for visual review).
- `components/AppHeader.tsx` (legacy header, used by ~12 pages) — re-point the `MfsLogo`
  import to the kit barrel. **No visual change** (still the wordmark at lines 252, 289).
- `app/login/page.tsx` — re-point the `MfsLogo` import to the kit barrel. **No visual
  change** (still the wordmark at lines 107, 291, 516).

**Governance**
- `CLAUDE.md` — add the written rule under the design-system / "Build it like Lego" section.
- `tests/unit/lint/reusable-visual-in-kit.test.ts` — NEW lint guard (below).

🗣 In plain English: one shared tile component, the kiosk layout, the two brand-asset files,
their three importers, plus the rulebook and one new automated check. Tightly scoped.

---

## Numbered steps

### Fix 1 — scroll-registers-as-tap (StatusTile)

**Decision: use `onClick`, remove `onPointerDown`+`preventDefault`. Justification below.**

1. In `components/ui/StatusTile.tsx`, the **tile button** (~line 90-102): replace
   ```
   onPointerDown={(e) => { e.preventDefault(); onTap() }}
   ```
   with
   ```
   onClick={() => onTap()}
   ```
   Keep `type="button"`, keep the `active:scale-[0.98]` class (instant visual feedback on
   press), keep `select-none`. Do NOT keep `preventDefault`.
2. The **help "?" button** (~line 144-162): replace
   ```
   onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onHelp() }}
   ```
   with
   ```
   onClick={(e) => { e.stopPropagation(); onHelp() }}
   ```
   `stopPropagation` stays so tapping "?" doesn't also fire the tile. (The help button is a
   sibling, not a descendant, of the tile button — they don't actually nest — but keeping
   `stopPropagation` is harmless defensive belt-and-braces and documents intent.)

**Why `onClick` over a pointerdown→pointerup move-threshold:**
- The viewport already sets `width=device-width` → no 300ms click delay on modern mobile;
  `onClick` fires immediately on a genuine tap.
- The browser natively suppresses the synthetic `click` when a touch sequence becomes a
  scroll/drag — which is precisely the bug. We get correct scroll-vs-tap discrimination
  *for free* from the platform, instead of hand-rolling a fragile pixel-threshold.
- `onClick` is keyboard-activatable (Enter/Space on a `<button>`), restoring the keyboard
  accessibility that `onPointerDown` silently broke.
- A move-threshold pointer handler is more code, must guess a threshold, and re-implements
  what the browser already does correctly — rejected as shallow over-engineering.

🗣 In plain English: stop opening tiles on "finger touches glass." Listen for a real tap
(`onClick`), which the phone already knows how to tell apart from a scroll, and which the
keyboard can trigger too. Less code, fixes the bug, restores keyboard use.

3. **Unit test** `tests/unit/components/StatusTile.test.tsx` (Testing Library + jsdom):
   - render a `StatusTile` with a spy `onTap` (and `onHelp`);
   - `fireEvent.pointerDown(tileButton)` ALONE → assert `onTap` NOT called;
   - `fireEvent.click(tileButton)` → assert `onTap` called once;
   - keyboard: focus the button, `fireEvent.keyDown/`/`user.keyboard('{Enter}')` (or
     `click` via Enter) → assert `onTap` called;
   - `fireEvent.click(helpButton)` → assert `onHelp` called once AND `onTap` NOT called
     (stopPropagation / separate target).
   - **Test-stack check (Risk R6):** confirm `@testing-library/react` + jsdom are already
     available before relying on them. From MEMORY: F-26 noted "no jsdom/@testing-library/
     react (needs 3+ devDeps)." If they are NOT present, do NOT add them in this PR. Fall
     back to a **pure-logic unit test**: extract nothing risky — instead assert the handler
     wiring by rendering through React's test renderer if available, or, minimally, write a
     DOM-event-dispatch test using the existing test environment. The implementer must
     report which path was taken at Gate "tests exist." (See Risk R6 for the must-resolve.)

### Fix 2 — force HACCP dark, overlays included

4. Keep `app/haccp/layout.tsx` a **server** component (retains `metadata`). Keep
   `data-theme="dark"` on the `haccp-shell` div (gives the in-tree page dark colours at
   first server paint, no flash). Render `<ThemeLock />` inside the shell.
5. NEW `app/haccp/ThemeLock.tsx`:
   ```tsx
   'use client'
   import { useEffect } from 'react'
   export default function ThemeLock() {
     useEffect(() => {
       const el = document.documentElement
       const prev = el.getAttribute('data-theme')
       el.setAttribute('data-theme', 'dark')
       return () => {
         if (prev === null) el.removeAttribute('data-theme')
         else el.setAttribute('data-theme', prev)
       }
     }, [])
     return null
   }
   ```
   **Why this resolves the portal problem (the headline risk):** Modal, Popover and
   DropdownMenu all render their content through a Radix `*.Portal`, whose default container
   is `document.body` — OUTSIDE the `haccp-shell` subtree. The `[data-theme="dark"]` block
   sets CSS custom properties; CSS variables cascade by inheritance to *descendants*. A
   portal to `document.body` is a descendant of `<html>` but NOT of `haccp-shell`, so a
   shell-only flag leaves overlays light. By also setting `data-theme="dark"` on
   `document.documentElement` (the `<html>` root), `document.body` and every portal under it
   inherit the dark variables. One attribute, set once, covers the whole document including
   teleported overlays. **No edits to the shared Modal/Popover/DropdownMenu kit components
   are required.**
   - **Flash-of-light is a non-issue for overlays:** portaled overlays are never on screen
     at first paint — they open on user interaction, long after hydration sets the root
     attribute. The main page content is dark from the server-rendered shell-level flag, so
     there is no visible light flash for the kiosk body either.
   - **Cleanup on unmount restores the prior root theme** so navigating away from HACCP does
     not leave the rest of the app dark.

   **Rejected alternative — Radix Portal `container` prop:** would require adding a
   `container?: HTMLElement | null` prop to all three shared kit overlays AND threading a
   shell ref through every HACCP overlay call site; fragile (each future overlay must
   remember to pass it) and invasive to shared components. The root-theme lock is the
   "set once" solution.

🗣 In plain English: the pop-ups physically jump to the top of the page, so dressing only
the kiosk box in dark leaves them in their light clothes. We instead set the dark dial on
the very top of the page while you're in the kiosk (and turn it back off when you leave), so
the box AND every pop-up read dark — without touching the shared pop-up components.

6. **Accepted limitation (Risk R3):** ~21 un-migrated HACCP screens use hardcoded colours
   and will NOT fully repaint from the theme flip. Accepted — they are being rebuilt in UI
   Phase 1. Call this out explicitly in the PR description and at the preview visual check.

### Fix 3 — compact brand icon in the header, DS way

7. **Relocate** `components/MfsLogo.tsx` → `components/ui/MfsLogo.tsx` via `git mv` (body
   unchanged — it already uses `currentColor`, no token/style edits needed). `MfsIcon`
   already lives at `components/ui/MfsIcon.tsx`.
8. In `components/ui/index.ts`, add a "Brand assets" block:
   ```ts
   // ── Brand assets ──
   export { default as MfsLogo } from './MfsLogo'
   export { default as MfsIcon } from './MfsIcon'
   ```
   (Both are default exports today; re-export as named from the barrel.)
9. Re-point the **three importers** off `@/components/MfsLogo` onto the barrel:
   - `app/haccp/page.tsx:17` → `import { MfsIcon, MfsLogo } from '@/components/ui'`
     (needs both: icon for the headers, wordmark still for the watermark).
   - `components/AppHeader.tsx:8` → `import { MfsLogo } from '@/components/ui'`.
   - `app/login/page.tsx:5` → `import { MfsLogo } from '@/components/ui'`.
   These three import sites are exhaustive — verified by grep across `app/**` + `components/**`
   for both the alias form. The kit `components/ui/AppHeader.tsx` does NOT import MfsLogo.
10. In `app/haccp/page.tsx`, swap the **header** brand marks to the icon, top-left
    (keep position):
    - line ~386: `<MfsLogo className={cx('h-6 w-auto', alarm.isAlarming ? 'text-inverse' : 'text-body')} />`
      → `<MfsIcon className={cx('h-7 w-7', alarm.isAlarming ? 'text-inverse' : 'text-body')} />`
      (square icon → use a square `h-7 w-7`, not `w-auto`).
    - line ~718 (second responsive header): `<MfsLogo className="h-6 w-auto text-body" />`
      → `<MfsIcon className="h-7 w-7 text-body" />`.
    - line ~821 (login-door full-screen watermark, opacity-40): **LEAVE as `<MfsLogo>`**.
      Flag for visual review in dark — if the wordmark watermark reads wrong on the dark
      background, raise it at the preview check; do not change blindly here.
11. `components/AppHeader.tsx` (lines 252, 289) and `app/login/page.tsx` (lines 107, 291,
    516): **import path change only**, the wordmark stays. No visual change intended.

🗣 In plain English: move both brand files into the kit's stockroom, list them at the
counter, and have all three screens ask the counter for them. On the kiosk header, show the
compact star instead of the long wordmark (same top-left spot); leave the big faded
watermark as the wordmark unless it looks wrong in dark.

### Governance (a) — the written rule

12. In `CLAUDE.md`, under the design-system / "Build it like Lego" architecture section,
    add a concise subsection, e.g. **"### Reusable visual components live in the kit"**:
    > Every shared visual primitive and brand asset (icons, logos, brand marks, shared UI
    > primitives) is DEFINED in `components/ui/` and CONSUMED from its barrel
    > (`components/ui/index.ts`). Screens (`app/**`) and feature components
    > (`components/**` outside `components/ui/`) never define a reusable visual component
    > inline, and never import one from outside `components/ui/`. A new shared visual
    > pattern is added to `components/ui/` FIRST (ADR-0014 Rule 3), then used. Enforced by
    > `tests/unit/lint/reusable-visual-in-kit.test.ts`.

🗣 In plain English: write the law down where the project's rules live — reusable visuals
come from the kit, full stop — and point at the test that enforces it.

### Governance (b) — the lint guard with teeth

13. NEW `tests/unit/lint/reusable-visual-in-kit.test.ts`, mirroring the file-reading-pin
    pattern of `semantic-tokens-only.test.ts` (walk files, regex, proven-negative fixtures).

    **Exact detection rule:**
    - **Scope:** every `.tsx` file under `app/**` and `components/**`, EXCLUDING
      `components/ui/**` (the kit is the allowed home) and excluding `node_modules`/`.next`.
    - **Flag a file** if its full text matches an **EXPORTED component whose body opens
      directly with an svg-rooted return** — the brand/icon/logo fingerprint. Match any of
      (regexes run against the whole file string; `\s` spans newlines):
      ```
      R1: /export\s+default\s+function\s+\w+\s*\([^)]*\)\s*(:\s*[^{]+)?\{\s*return\s*\(?\s*<svg[\s/>]/
      R2: /export\s+function\s+\w+\s*\([^)]*\)\s*(:\s*[^{]+)?\{\s*return\s*\(?\s*<svg[\s/>]/
      R3: /export\s+const\s+\w+\s*(:[^=]+)?=\s*\([^)]*\)\s*(:\s*[^=]+)?=>\s*\(?\s*<svg[\s/>]/
      R4: /export\s+default\s+\([^)]*\)\s*=>\s*\(?\s*<svg[\s/>]/
      ```
    - **Why "exported" + "body opens with the svg" is the precise discriminator** (this is
      the false-positive guard the brief asks for): the EXPORT keyword means the component
      is a unit of reuse shared across files — exactly what must come from the kit. Anchoring
      the svg to the FIRST thing in the body (`{ return ( <svg`) means the component IS the
      svg (the brand-asset shape), so:
      - a **local, non-exported** icon helper like `Ic` in `app/haccp/page.tsx` (line 182,
        `function Ic(...)`, no `export`) is private to its file → NOT flagged;
      - Modal's local `CloseIcon` (and similar in-file helpers) → NOT flagged;
      - a larger component returning `<div>…<svg/>…</div>` (decorative nested SVG) → NOT
        flagged, because the first token after `{ return (` is `<div`, not `<svg`.
      Both `MfsLogo` and `MfsIcon` are `export default function … { return ( <svg` → matched
      by R1.
    - **Verified empirically while planning:** the export-anchored matcher flags ONLY
      `components/MfsLogo.tsx` on the current tree (pre-move) and nothing else — so after
      Step 7 moves it into `components/ui/`, the positive scan is GREEN. The loose
      "any svg-rooted return" form would have false-flagged `app/haccp/page.tsx` via the
      local `Ic` helper; the export anchor removes that false positive.
    - **Self-test cases (teeth — mirror semantic-tokens-only's proven-negative `it`):**
      - planted POSITIVE: `'export default function X(){ return (<svg></svg>) }'` → flagged;
      - planted POSITIVE (arrow): `'export const Star = () => <svg/>'` → flagged;
      - planted NEGATIVE (local helper): `'function Ic(){ return (<svg/>) }'` → NOT flagged;
      - planted NEGATIVE (nested decorative): `'export default function P(){ return (<div><svg/></div>) }'`
        → NOT flagged.
    - **Positive directory scan:** walk the real scope, assert ZERO offenders now (proves
      the tree is clean after the move AND pins the rule going forward — a future stray
      `components/SomethingIcon.tsx` turns this test RED).

🗣 In plain English: the test reads every screen/feature file and shouts if it finds an
EXPORTED component that is just an icon/logo, because those belong in the kit. It is careful
to ignore a little private icon helper used only inside one file and an SVG tucked inside a
bigger layout — so it catches the real mistake (a loose, shared logo/icon) without nagging
about harmless local SVGs. We proved it goes red on a planted stray and green on today's
tree once the two brand files are in the kit.

---

## TDD test plan

| Test | Type | Asserts | Red-before / Green-after |
|------|------|---------|--------------------------|
| `StatusTile.test.tsx` | unit (jsdom) | pointerDown-alone ≠ onTap; click = onTap; Enter = onTap; help click = onHelp & ≠ onTap | RED against current `onPointerDown` code (pointerDown would fire onTap), GREEN after Fix 1 |
| `reusable-visual-in-kit.test.ts` | unit (file-read lint pin) | scope scan = 0 offenders; 2 planted positives flagged; 2 planted negatives not flagged | the positive-scan is RED while `components/MfsLogo.tsx` is outside the kit, GREEN after Step 7 move |
| existing HACCP `@critical` E2E | regression | hub still loads, tiles navigate, PIN/help overlays still open & function | must stay GREEN (no behaviour regression) |
| `next lint` + `tsc` | static | barrel re-exports + re-pointed imports type-check; no lint break | GREEN |

🗣 In plain English: write the tile test so it fails on today's buggy code and passes after
the fix; write the guard so it fails while the logo is in the wrong place and passes once
it's moved; and make sure the existing food-safety E2E suite still passes untouched.

---

## ANVIL test matrix (recommended)

- **Unit:** `StatusTile.test.tsx` (tap/scroll/keyboard) + `reusable-visual-in-kit.test.ts`
  (scan + self-fixtures). Plus full existing unit suite green (tsc + next lint).
- **Integration / pgTAP / RLS:** **N/A** — no DB, no API, no RLS touched. Right-size DOWN;
  do not run integration/pgTAP for this change.
- **E2E `@critical` (preview):** the existing HACCP suite as **regression** — hub loads,
  tiles navigate, PIN keypad + help overlays open and work.
- **PREVIEW VISUAL CHECK (the part unit tests can't prove) — required, on the deployed
  preview:**
  1. **Dark mode** — every migrated HACCP screen renders dark.
  2. **Overlays go dark** — open the PIN keypad Modal, a help panel, and any
     Popover/DropdownMenu on the hub → confirm they render DARK (this is the portal fix;
     a unit test cannot prove the cascaded-theme paint).
  3. **Header icon** — the compact `MfsIcon` shows top-left in both header variants
     (normal + alarming/red state), correctly coloured (`text-body` / `text-inverse`).
  4. **Watermark** — confirm the login-door wordmark watermark reads acceptably on dark; if
     not, raise it (Step 10 flagged this).
  5. **Tile tap** — on a touch device/emulator, scroll the hub starting on a tile → confirm
     it does NOT navigate; a deliberate tap DOES.

🗣 In plain English: machines check the tap logic and the logo's location; a human looks at
the preview to confirm the kiosk and its pop-ups are actually dark and the star sits top-left
— because "is it visually dark?" is something only eyes can confirm.

---

## Acceptance criteria

1. Scrolling the hub with a finger that starts on a tile no longer opens that tile; a real
   tap opens it; keyboard Enter opens it; tapping "?" opens help only.
2. Every migrated HACCP screen AND its overlays (PIN keypad, help panels, menus) render in
   the dark theme on the preview.
3. The HACCP header shows the compact `MfsIcon` top-left (both header states); the login-
   door watermark is reviewed and acceptable.
4. `MfsLogo` and `MfsIcon` live in `components/ui/`, are barrel-exported, and all three
   former importers consume them from `@/components/ui`. No file outside `components/ui/`
   defines a brand asset.
5. `CLAUDE.md` carries the written rule; `reusable-visual-in-kit.test.ts` is green now and
   goes red on a planted stray (proven by its self-fixtures).
6. No new `package.json` entry. tsc + next lint + unit suite + HACCP `@critical` all green.

---

## Risk Assessment

> Categories: concurrency/race, security, data-migration, business-logic, launch-blocker.
> Scaled to a presentation + tooling change (no DB, no auth, no money).

- **Concurrency / race conditions** — No shared mutable state, no async ordering, no DB.
  The only timing element is `ThemeLock`'s `useEffect` (runs once on mount, cleans up on
  unmount). React guarantees cleanup ordering; no race. **No material risks.**

- **Security** — No auth, no input handling, no data flow, no new dependency, no vendor
  surface. Moving an inline SVG file and re-exporting it introduces no attack surface.
  **No material risks.**

- **Data migration** — None. No schema, no data, no migration file. **N/A.**

- **Business-logic flaws** —
  - **R1 (MEDIUM, must-fix-by-test) — `onClick` regression on the shared tile.** StatusTile
    is used 16× on the hub; if `onClick` changed navigation behaviour it would break the
    whole hub. *Mitigation:* the `StatusTile.test.tsx` unit test pins click/keyboard/scroll
    behaviour, and the HACCP `@critical` E2E regression proves tiles still navigate. **Not a
    Gate-2 blocker** (mitigation is in-plan), but the tile unit test is mandatory.
  - **R2 (LOW) — help button `stopPropagation` semantics.** The "?" and tile are siblings,
    not nested, so `stopPropagation` is belt-and-braces; verified by the help-click test
    asserting onTap is NOT also fired. *Mitigation:* covered by the unit test.

- **Launch-blocker risks —**
  - **R3 (LOW, accepted) — un-migrated HACCP screens stay partly light.** ~21 screens use
    hardcoded colours and won't fully repaint dark. *Mitigation:* explicitly accepted (being
    rebuilt in Phase 1); called out in the PR + preview check. Not a blocker.
  - **R4 (MEDIUM) — overlays could still be light if the portal-theme assumption is wrong.**
    The whole Fix-2 value rests on Radix portals inheriting the dark variables from
    `document.documentElement`. If a portal sets its own theme or an overlay hardcodes
    colours, it stays light. *Mitigation:* (a) Modal/Popover/DropdownMenu were read and all
    use semantic tokens (`bg-surface-overlay`, `text-body`, `border-default`) — they DO read
    the dial; (b) the **preview visual check explicitly opens each overlay type to confirm
    dark**. If an overlay is still light at preview, that is a finding to fix before ship,
    not a silent pass. Not a Gate-2 blocker (mechanism is sound + verified by token reads),
    but the preview overlay check is mandatory.
  - **R5 (LOW) — root-theme leak on navigation.** If `ThemeLock` cleanup failed, the rest of
    the app could stay dark after leaving HACCP. *Mitigation:* cleanup restores the prior
    `data-theme` (or removes it) on unmount; HACCP is a full-page route group so the layout
    unmounts on navigation away. Confirm at preview by navigating HACCP → another app screen.
  - **R6 (MEDIUM, RESOLVE-AT-RENDER, not a Gate-2 blocker) — test stack for
    `StatusTile.test.tsx`.** Project memory (F-26) records that `@testing-library/react` +
    jsdom were NOT present and adding them needs 3+ devDeps — which would violate the
    "no new dependency" constraint of THIS change. *Mitigation:* the implementer MUST check
    at the start of Fix 1 whether the React test stack already exists. If YES → write the
    full render test. If NO → DO NOT add the devDeps in this PR; write the tap-logic test at
    the level the existing environment supports (e.g. a handler-wiring/DOM-dispatch test) and
    report the chosen path. The acceptance criterion is "pointerDown-alone doesn't navigate /
    click does / keyboard works" proven at whatever level is available without new deps. This
    is a scoping decision for Render, not a planning blocker.

**Must-fix (Gate-2 blockers): NONE.** R1/R4/R6 are mitigated in-plan (mandatory tile unit
test, mandatory preview overlay check, no-new-dep guard on the test stack). R3/R5 accepted/
verifiable. No risk blocks Gate 2.

🗣 In plain English: nothing here can corrupt data or open a security hole. The two things to
watch are (1) don't break the shared tile — the unit test plus the food-safety E2E guard
that, and (2) actually eyeball the pop-ups on the preview to confirm they went dark. One
honest caveat: if the React testing tools aren't already installed, write the tap test
without adding new packages rather than breaking the "no new dependency" rule.

---

## Hexagonal / design-system verdict (for Gate 2)

- **Ports/adapters:** none used, none added. This change is entirely presentation
  (`app/**` + `components/**`), one CI lint test, and one docs rule. No domain port, no
  vendor adapter, no service/usecase/wiring touched.
- **New dependencies:** **NONE.** `package.json` is unchanged. (R6 explicitly forbids adding
  a React test stack as part of this work.)
- **Single-use vendor wrap:** N/A — no vendor.
- **Rip-out test:** **N/A** — no external dependency / vendor boundary is touched, so there
  is nothing to rip out and replace. (Not a FAIL; simply out of scope for a presentation +
  governance change.)
- **Design-system check (the relevant invariant here): PASS.** Brand assets (`MfsLogo`,
  `MfsIcon`) now live in the kit (`components/ui/`) and are consumed from the barrel by all
  three screens; no brand asset is defined or imported outside the kit. Decision #17 (no
  style-leaking props) honoured — no new style props. ADR-0014 Rule 1 (code-composes-kit)
  and Rule 3 (missing pattern → kit-first) are operationalised AND made enforceable by the
  new lint guard. The guard goes green on today's tree (verified) and red on a planted stray
  (self-fixtures).

🗣 In plain English: this isn't a Lego/vendor change — there's no socket or plug to swap, so
the rip-out test doesn't apply. The design-system rule that DOES apply passes cleanly: the
logo and icon are now proper kit parts taken from the counter, and we've added an automated
guard so a stray one can't slip in again.
