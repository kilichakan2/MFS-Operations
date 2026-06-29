# UI Phase 0a — Design-System Foundation (FORGE plan)

> **Opening note — inertness REVERSED in favour of design fidelity.** An earlier draft of this
> plan made 0a "visually inert" by preserving the old hexes/fonts. That is REVERSED (roadmap
> decision #12). The `.dc.html` design file is the SINGLE source of truth; 0a implements its
> tokens VERBATIM (new MFS palette, Adieu + Inter fonts, dark theme, both density modes) and
> **retires** the old colours and Plus Jakarta Sans. Existing screens WILL shift to the new look
> immediately — that is ACCEPTED and CORRECT. This work lives on the isolated
> `worktree-ui-system-rebuild` branch and does NOT merge to `main` until the whole UI overhaul is
> done and Hakan unlocks it; there is no live app to protect. The only remaining "don't break it"
> constraint is: **the app must still `next build` / `tsc` green** after the Tailwind rewire — no
> colour-utility name the existing screens use may silently evaporate.
>
> 🗣 In plain English: we used to plan to swap the wiring without changing the look. We flipped
> that: now we change the look to the real new brand on day one, on a private branch nobody ships
> yet. The single promise we keep is "the app still compiles and screens still get a colour, not
> blank."

```
FORGE · "UI Phase 0a — design-system foundation"
  Frame ✓ → Order ● (this plan) → Render ○ → Guard ○ → ANVIL ○ → Ship ○ (PR open, awaiting unlock)
  touching: app/tokens.css(new) · app/globals.css · tailwind.config.ts · app/layout.tsx
            · vitest.config.ts · package.json · .eslintrc area (pin only) · public/fonts · public/brand
  🗣 at "lay the foundation" — paint + fonts + test-stack, ZERO real components
```

```
DOMAIN (core logic — UNTOUCHED in 0a)
  └─ (presentation layer only: tokens, fonts, Tailwind, test-stack)
🗣 0a adds no port and no adapter — Radix is a presentation library that clicks straight into
   components/, not a swappable service behind a socket. Rip-out test is N/A → PASS (vacuous).
```

---

## 1 · Goal

Stand up the design-system **foundation** so every later screen/component has one place to read
colours, fonts, spacing and elevation from, and a test stack that can prove a component is
accessible. Concretely 0a:

1. Pulls the Adieu font binaries + brand SVGs into `public/`.
2. Writes the **two-tier token CSS** (Tier-1 primitives → Tier-2 semantic) VERBATIM from
   `docs/design/phase0a-foundation-tokens.reference.css`, including light defaults,
   `[data-theme="dark"]`, `[data-density="compact"]`, shadows, radii and keyframes.
3. Wires the fonts through `next/font` (Adieu display + Inter body) and **retires Plus Jakarta Sans**.
4. Rewires `tailwind.config.ts` so colours/radius/shadow read the CSS variables (killing today's
   double-declaration) — while keeping every colour-utility name the existing 48 screens + 19
   components use still resolving, so the build stays green.
5. Adds the one approved runtime dep (`radix-ui`) and the four test devDeps, and splits Vitest into a
   node `unit` lane (unchanged) + a jsdom `component` lane.
6. Adds a `semantic-tokens-only` lint guard scoped to the (empty) `components/ui/**`, pinned by a test.
7. Proves the stack with ONE disposable throwaway component and ships token-resolve/compile tests.

🗣 In plain English: 0a is the paint, the fonts, the rulers and the test bench — not the furniture.
No real buttons or cards get built here (that is 0b). After 0a, the app looks like the new brand and
the team can build accessible components with a safety net.

---

## 2 · Domain terms (plain-English glossary for this plan)

- **Tier-1 primitive token** — a raw brand value, e.g. `--mfs-orange-500: #EB6619`.
  🗣 The actual paint tin with a colour in it.
- **Tier-2 semantic token** — a named-by-purpose token that points at a primitive, e.g.
  `--action-primary: var(--mfs-orange-500)`. 🗣 A label that says "THIS is the primary-button
  colour" — change what it points at and every primary button follows, no hunting.
- **`next/font`** — Next.js's built-in font loader; it generates the `@font-face` rules and a CSS
  variable for you. 🗣 You hand it the font file, it handles the plumbing and gives you one variable
  name to use everywhere.
- **Channel-form token / alpha-value** — a colour written as its red/green/blue numbers
  (`22 32 91`) so Tailwind can inject opacity, e.g. `rgb(var(--x-rgb) / <alpha-value>)`.
  🗣 Storing the colour "unmixed" so the system can dim it to 40% on demand; a pre-mixed `var(--x)`
  can't be dimmed.
- **Two-project Vitest** — one test runner, two lanes: a fast Node lane for logic, a browser-like
  (jsdom) lane for components. 🗣 Two test benches under one roof — one for wiring, one for UI.
- **Radix Primitives (`radix-ui`)** — an unstyled accessibility engine for interactive components.
  🗣 The keyboard/focus/screen-reader behaviour, with no looks attached; we paint it ourselves.

---

## 3 · Compliance / guardrail flags

- **Presentation layer ONLY.** May touch: `app/**` (globals.css, the new `app/tokens.css`,
  `app/layout.tsx`), `tailwind.config.ts`, `postcss.config.mjs`, `package.json` (approved deps only),
  `public/**`, `vitest.config.ts`, `tests/unit/lint/**`, `tests/unit/tokens/**`, `tests/component/**`,
  and the vendor-fence pin.
- **Must NOT touch:** `lib/ports|adapters|wiring/**`, `lib/services|usecases|domain/**`,
  `middleware.ts`, auth/RLS, `app/api/**`, `.github/**`, Vercel settings, any migration/SQL.
- **No AI references** anywhere (commits, PR, code, comments).
- **Do NOT merge to `main`.** Plan ends at "PR open, ANVIL-certified, awaiting Hakan's unlock."
- **Tailwind v3** (the repo has `tailwindcss ^3.3.0`); NOT v4. Plain CSS variables — no
  Style-Dictionary / DTCG pipeline.
- New `package.json` entries limited to `radix-ui` + the four test devDeps, each justified in §7.

🗣 In plain English: stay strictly in the "looks" half of the codebase, add only the five blessed
packages, never write "AI" anywhere, and stop at an open PR — do not push to the real app.

---

## 4 · ADR / decision conflicts

- **ADR-0009** (`docs/adr/0009-ui-a11y-radix-and-component-test-stack.md`) — AUTHORISES exactly this
  work: Radix as a presentation library imported directly in `components/**` (no port/adapter), plus
  the four test devDeps as test-only. **No conflict** — 0a executes ADR-0009.
- **ADR-0002 / CLAUDE.md hexagonal rules** — require vendor SDKs to sit behind a port unless they are
  presentation libraries (the `recharts`/`lucide-react` class). Radix is explicitly in that class
  (ADR-0009). **No conflict**, provided `radix-ui` is added to the vendor-fence **allow-list** (step
  10), NOT the fence.
- **F-27 vendor-fence pin** (`tests/unit/lint/vendor-fence-complete.test.ts`) — will go RED the moment
  `radix-ui` lands in `dependencies` unless it is allow-listed. Step 10 handles this. **Manageable,
  not a conflict.**

🗣 In plain English: there's a written decision (ADR-0009) that already blesses everything here. The
only booby-trap is an existing test that fails if we add a package without telling it — we tell it.

---

## 5 · Build-safety colour-name inventory (the heart of step 5)

The current `tailwind.config.ts` `theme.extend.colors` defines these utility names. After the rewire
each must still resolve to a valid token, or the screens using it go colourless. Live grep
(`app` + `components`) of which are actually used, and the new token each maps to:

| Legacy Tailwind colour name (utility) | Used | New token it maps to (fidelity) | Notes |
|---|---|---|---|
| `mfs-navy` | bg 13 · text 10 · `/40`,`/50` opacity | `var(--mfs-navy)` (channel form `--mfs-navy-rgb`) | same hex #16205B; **needs channel form (R1)** |
| `mfs-orange` | bg 6 · text 6 | `var(--mfs-orange-500)` | same hex #EB6619 |
| `mfs-maroon` | (defined, low use) | `var(--mfs-maroon-500)` | same hex #590129 |
| `mfs-red` | (defined) | `var(--mfs-red-500)` | same hex #FF3300 |
| `mfs-sand` | bg 1 | `var(--mfs-sand-500)` | same hex #C0946F |
| `mfs-soft-neutral` | bg 11 | `var(--mfs-soft-200)` | same hex #EDEAE1 |
| `mfs-black` | text 29 | `var(--mfs-ink-900)` | same hex #1E1E1E |
| `mfs-success` | bg 1 · text 1 | `var(--status-success-fill)` | **value shifts** #16A34A→#2f7d52 (new brand green) |
| `mfs-warning` | bg 4 · text 8 | `var(--status-warning-fill)` | **value shifts** #B45309→#b07d12 |
| `mfs-danger` | bg 9 · text 12 · `/10`,`/30` opacity | `var(--status-error-fill)` (channel form `--mfs-danger-rgb`) | **value shifts** #FF3300→#c8102e; **needs channel form (R1)** |
| `mfs-neutral-50` | low | `var(--mfs-soft-100)` | nearest warm neutral |
| `mfs-neutral-100` | bg 1 | `var(--mfs-soft-200)` | exact #EDEAE1 |
| `mfs-neutral-200` | border 12 | `var(--mfs-soft-300)` | near-exact; heavy border use |
| `mfs-neutral-300` | bg 2 | `var(--mfs-soft-400)` | approx |
| `mfs-neutral-400` | text 1 | `var(--mfs-ink-400)` | approx (muted) |
| `mfs-neutral-500` | text 37 | `var(--text-muted)` | semantic: this IS muted body text |
| `mfs-neutral-700` | text 29 | `var(--text-body)` | semantic: this IS body text |
| `mfs-neutral-900` | text 2 | `var(--mfs-ink-900)` | exact |
| `mfs-kds-*` (9 keys) | 0 utility uses found | retain keys → point at dark-theme primitives or keep literal hex | KDS migrates in Phase 1; keep names resolving to be safe |

Also retained (read `var(--…)` from tokens.css, low/known usage): `borderRadius.mfs-*`
(`rounded-mfs-pill` used 1×), `boxShadow.mfs-1..4` (used 3×), `fontFamily.font-mfs-display`
(used 4×) / `font-mfs-body` (1×), and the `fontSize` type-ramp (`text-h1..mono`, used ~15×).

**Direct `var()` consumers in inline styles** (grep-confirmed) that must NOT lose their variable:
`var(--mfs-navy)` (1×), `var(--mfs-orange)` (1×), `var(--mfs-neutral)` (1×). The reference token file
defines `--mfs-navy` but NOT `--mfs-orange`/`--mfs-neutral` (it uses `--mfs-orange-500` /
`--mfs-soft-200`). **Mitigation:** a tiny LEGACY-ALIAS block in `tokens.css`:
`--mfs-orange: var(--mfs-orange-500); --mfs-neutral: var(--mfs-soft-200);` (and `--mfs-navy` already
exists). 🗣 Three screens type the old variable name straight into a style attribute; we leave a
forwarding label so those don't break, and clean them up in Phase 1.

**Stock Tailwind palette opacity modifiers** (`bg-orange-500/20`, `border-amber-500/40`, etc., ~80
uses) use Tailwind's BUILT-IN palette, which already supports opacity. They are **unaffected** by our
config edits — no action, no risk. Only the four `mfs-*` opacity uses (navy ×7, danger ×4) need the
channel-form fix.

> **Build-green reality check.** `next.config.ts` sets `eslint.ignoreDuringBuilds: true` and
> `typescript.ignoreBuildErrors: true`, AND an unknown Tailwind utility class does not crash a build
> (Tailwind just emits no CSS for it). So a missing colour name will NOT fail `next build` loudly —
> it will silently render unstyled. That is WHY the **token-resolve/compile test (step 14)** is the
> real guard: it asserts every name in this table still resolves. `next build` + `tsc --noEmit` are
> run as a second backstop (they catch `@apply`/`theme()`-level breakage in the CSS itself).

---

## 6 · Files to change (exact list)

| Path | Action |
|---|---|
| `public/fonts/adieu/Adieu-Regular.otf` | NEW (copied binary) |
| `public/fonts/adieu/Adieu-Light.otf` | NEW (copied binary) |
| `public/brand/logo-navy.svg` · `logo-orange.svg` · `logo-white.svg` | NEW (copied) |
| `public/brand/star-icon-navy.svg` · `-orange.svg` · `-sand.svg` · `-white.svg` | NEW (copied) |
| `app/tokens.css` | NEW — the verbatim two-tier token layer + legacy-alias bridge |
| `app/globals.css` | EDIT — import tokens.css; delete duplicate `:root` token block, Plus-Jakarta `@import`, the `h1,h2,h3` Plus-Jakarta rule, the GTF-Adieu `@font-face`; keep base resets + type-ramp `--text-*-size` + desktop-chrome rule; point `body`/headings at the font vars |
| `app/layout.tsx` | EDIT — load Adieu (`next/font/local`) + Inter (`next/font/google`); apply their `variable`s to `<html>` |
| `tailwind.config.ts` | EDIT — colours/radius/shadow/fontFamily read `var(--…)`; add semantic colour scale; retain legacy names per §5 |
| `package.json` | EDIT — add `radix-ui` (dep) + `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `vitest-axe` (devDeps) |
| `vitest.config.ts` | EDIT — split into `unit` (node) + `component` (jsdom) projects |
| `tests/component/setup.ts` | NEW — register vitest-axe matcher + RTL cleanup |
| `tests/component/_fixtures/ThrowawayProbe.tsx` | NEW — disposable test-only component |
| `tests/component/throwaway.test.tsx` | NEW — render + click + axe smoke |
| `tests/unit/tokens/token-resolve.test.ts` | NEW — token-resolve/compile guard (step 14) |
| `tests/unit/lint/semantic-tokens-only.test.ts` | NEW — semantic-tokens-only guard for `components/ui/**` |
| `tests/unit/lint/vendor-fence-complete.test.ts` | EDIT — allow-list `radix-ui` |

---

## 7 · Dependencies added (with one-line justification)

**Runtime (`dependencies`) — 1:**

- **`radix-ui`** — single umbrella package for accessible headless primitives (one dep, one
  allow-list line). Justification: the accessibility engine for the 0b component library
  (keyboard/focus/ARIA), authorised by ADR-0009; a *presentation library* (recharts/lucide class),
  not a swappable service, so it is allow-listed, not fenced. Installed in 0a, used by **zero**
  components until 0b.
  🗣 The behaviour brain for dropdowns/dialogs/tabs; we install the toolbox now, open it in 0b.

**Test-only (`devDependencies`) — 4 (exempt class, like `fake-indexeddb`; out of vendor-fence scope):**

- **`jsdom`** — in-process fake browser DOM so components can render in a unit test.
  🗣 A pretend browser so tests can "see" the component without opening Chrome.
- **`@testing-library/react`** — render React components + query them the way a user would.
  🗣 Lets a test mount a component and find the button by its label, not its internals.
- **`@testing-library/user-event`** — simulate real user interaction (clicks, typing, Tab).
  🗣 Fake fingers — presses keys and clicks like a person, so focus/keyboard behaviour is tested.
- **`vitest-axe`** — automated WCAG/ARIA assertions inside Vitest (`toHaveNoViolations`).
  🗣 An automatic accessibility inspector that fails the test if a component is unusable to assistive
  tech.

> **NOT added:** `@testing-library/jest-dom` (explicitly excluded by the spec; vitest-axe + RTL's
> built-ins cover what we need).

---

## 8 · Hexagonal verdict (computed — populates Gate 2)

- **Port used/added:** NONE. 0a is presentation-only; it adds no `lib/ports/**` interface.
- **Adapter:** NONE. No `lib/adapters/**` is touched or created.
- **New dependencies:** `radix-ui` (runtime) — presentation library, **allow-listed not wrapped**
  (single-use-wrapper rule does not apply: presentation libs are exempt per ADR-0009 / F-27, same as
  recharts/lucide; it will be imported across many 0b components, not one file). The four test
  devDeps are test-tooling, out of the runtime fence entirely.
- **Rip-out test:** **N/A → PASS (vacuous).** No external *service* (DB/auth/payments/storage) is
  introduced, so "replace the vendor = one adapter + one wiring line" has nothing to measure.
- **Verdict:** **PASS.** No new seam, no fence breach (radix allow-listed with written justification
  in ADR-0009 + this plan). Not a Gate-2 blocker.

🗣 In plain English: nothing here is a swappable back-end vendor, so the Lego rip-out rule simply
doesn't apply. The one new runtime package is a looks/behaviour toolkit that's allowed to be used
directly, and we register it so the guard test stays green.

---

## 9 · TDD step-by-step (atomic, each with its test + build-green check)

> Cut a feature branch off `worktree-ui-system-rebuild` (e.g. `feat/ui-phase-0a-foundation`). Run all
> commands from the worktree dir. Red→green→refactor; land each step's test WITH its code.

### Step 1 — Pull design assets into `public/`
- **Do:** Copy from DesignSync project `0e28a094-d725-42bd-8858-cd469b21a42d`:
  - `fonts/Adieu-Regular.otf` → `public/fonts/adieu/Adieu-Regular.otf`
  - `fonts/Adieu-Light.otf` → `public/fonts/adieu/Adieu-Light.otf`
  - `assets/logo-navy.svg` → `public/brand/logo-navy.svg`; `assets/logo-orange.svg` →
    `public/brand/logo-orange.svg`; `assets/logo-white.svg` → `public/brand/logo-white.svg`
  - `assets/star-icon-{navy,orange,sand,white}.svg` → `public/brand/star-icon-{navy,orange,sand,white}.svg`
- **If the implementer lacks the DesignSync MCP:** STOP and hand back to the conductor — the
  conductor pulls the binaries and drops them in place. Do NOT fabricate or substitute fonts.
- **Test/verify:** files exist + non-zero size (`ls -l`); `.otf` files are valid OpenType (first bytes
  `OTTO`/`\x00\x01\x00\x00`). No build impact yet.
- 🗣 Copy the real font files and brand logos into the app's public folder, exactly named.

### Step 2 — Write `app/tokens.css` VERBATIM
- **Do:** Create `app/tokens.css` reproducing `docs/design/phase0a-foundation-tokens.reference.css`
  EXACTLY for: Tier-1 primitives, Tier-2 semantic (light `:root`), `[data-theme="dark"]`,
  `[data-density="compact"]`, shadows, radii, all `@keyframes`. **Three justified deviations** from
  the reference file (the ONLY edits):
  1. **Drop** the reference's two `@font-face` blocks (lines 8–9) and the literal
     `--font-display`/`--font-text` declarations (lines 12–13) — `next/font` owns those now (step 4,
     R3). 🗣 The font wiring moves to Next's loader; leaving the hand-rolled copy would fight it.
  2. **Add** a small `LEGACY ALIAS` block at the end of `:root`:
     `--mfs-orange: var(--mfs-orange-500); --mfs-neutral: var(--mfs-soft-200);`
     (build-safety for the 3 inline-style consumers in §5). `--mfs-navy` already exists verbatim.
  3. **Add** channel-form companions for the two alpha-modified colours (R1):
     `--mfs-navy-rgb: 22 32 91;` and `--mfs-danger-rgb: 200 16 46;` (the rgb of scarlet-600 #c8102e).
- **Test:** part of step 14's token-resolve test (asserts a representative primitive + semantic +
  dark-override + density var + a keyframe name are present and parseable).
- 🗣 Copy the design's colour/spacing/shadow recipe word-for-word into one file, with three tiny,
  noted exceptions that keep the build safe.

### Step 3 — Rewrite `app/globals.css`
- **Do:** At the TOP add `@import './tokens.css';` (must precede the `@tailwind` directives;
  Next's css-loader resolves the local import at build). Then:
  - DELETE the Plus-Jakarta Google-Fonts `@import` (line 16), the `h1,h2,h3,.font-display`
    Plus-Jakarta rule (29–32), and the GTF-Adieu `@font-face` (35–45).
  - DELETE the duplicate `:root` token block (48–147) — superseded by `tokens.css` — **except KEEP
    the type-ramp `--text-*-size` vars + the `@media (min-width:768px)` ramp override** (the Tailwind
    `fontSize` config reads them; 15× util usage). Relocate that ramp block into `globals.css`
    (or `tokens.css`) so it survives. Before deleting any other legacy var, grep
    `app components` for `var(--mfs-space|--mfs-radius|--mfs-shadow|--mfs-duration|--mfs-ease|--mfs-container|--mfs-font-weight`
    and KEEP any that are referenced (token-resolve test + `next build` are the backstop).
  - KEEP the base resets; change `body` to `background-color: var(--surface-base); color: var(--text-body);`
    and set `body { font-family: var(--font-text); }` + `h1,h2,h3,.font-display { font-family: var(--font-display); }`.
  - KEEP the desktop-chrome `body[data-mfs-chrome="true"]` padding rule (162–166).
- **Test:** `next build` + `tsc --noEmit` green (step 15). Token-resolve test confirms `--text-*-size`
  + `--surface-base` + `--text-body` resolve.
- 🗣 Strip the old paint and the old heading font out of the global stylesheet, point the page at the
  new variables, and keep the bits other code still depends on (text-size ramp, desktop padding).

### Step 4 — Wire fonts via `next/font` in `app/layout.tsx` (retire Plus Jakarta)
- **Do:**
  - `import localFont from 'next/font/local'` →
    `const adieu = localFont({ src: [{ path: '../public/fonts/adieu/Adieu-Light.otf', weight: '300' }, { path: '../public/fonts/adieu/Adieu-Regular.otf', weight: '400' }], variable: '--font-display', display: 'swap', fallback: ['Inter','system-ui','sans-serif'] })`
  - `import { Inter } from 'next/font/google'` →
    `const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-text', display: 'swap' })`
  - Apply both to the root element: `<html lang="en" className={`${adieu.variable} ${inter.variable}`}>`.
  - **R3 reconciliation:** `next/font`'s `variable` option OWNS `--font-display` / `--font-text` —
    these are the SAME names the design's token CSS used, which is why step 2 drops the literal
    declarations. The names line up; no rename needed.
- **Test:** part of step 14 (assert `--font-display`/`--font-text` are referenced by `body`/heading
  rules); `next build` green confirms next/font resolves the local + google fonts.
- 🗣 Hand the two real fonts to Next's loader, give them the exact variable names the design already
  uses, and remove Plus Jakarta entirely. Headings now render in Adieu, body in Inter.

### Step 5 — Rewire `tailwind.config.ts` colours/radius/shadow → `var(--…)`
- **Do:** In `theme.extend`:
  - **`colors`** — keep ALL legacy names from §5, each value now `var(--…)`; use channel form for the
    two alpha colours: `'mfs-navy': 'rgb(var(--mfs-navy-rgb) / <alpha-value>)'`,
    `'mfs-danger': 'rgb(var(--mfs-danger-rgb) / <alpha-value>)'`; the rest plain `var(--…)`.
  - **ADD a semantic colour scale** (for 0b + the throwaway probe + the lint rule to target), e.g.
    `surface: { base:'var(--surface-base)', raised:'var(--surface-raised)', sunken:'var(--surface-sunken)', overlay:'var(--surface-overlay)', inverse:'var(--surface-inverse)' }`,
    `text: { body, muted, subtle, inverse, 'on-action', link }`,
    `border: { DEFAULT:'var(--border-default)', strong, subtle }`,
    `action: { primary, 'primary-hover', secondary, danger, … }`,
    `status: { 'success-fill','success-soft','warning-fill', … }`, plus `focus-ring`, `sync-*`.
    (Yields `bg-surface-raised`, `text-muted`, `border-strong`, `bg-action-primary`, etc.)
  - **`borderRadius`** — `mfs-sm/md/lg/pill` retained → `var(--radius-*)`; ADD semantic
    `sm/md/lg/xl/pill` → `var(--radius-*)`.
  - **`boxShadow`** — `mfs-1..4` retained → nearest `var(--shadow-*)`; ADD `sm/md/lg/accent` →
    `var(--shadow-*)`.
  - **`fontFamily`** — `mfs-display` → `['var(--font-display)']`, `mfs-body` → `['var(--font-text)']`,
    `mfs-mono` unchanged. (Optionally add `display`/`text` aliases.)
  - **Leave `fontSize`, `maxWidth`, `transitionDuration`, `transitionTimingFunction` AS-IS** (the
    type ramp still reads `--text-*-size`; spacing stays Tailwind's default 4px scale — do NOT add a
    custom spacing scale).
- **Test:** step 14 token-resolve/compile test (every §5 name + each semantic key compiles to a valid
  declaration; the two channel-form colours produce working opacity); `next build` green.
- 🗣 Make Tailwind read the variables instead of holding its own copy of the palette, keep every old
  class name alive so screens don't go blank, and add the new "named-by-purpose" classes the real
  components will use.

### Step 6 — (folded into Step 5) build-safety verification of the §5 inventory
- The §5 table IS the contract; the token-resolve test (step 14) iterates it. Any name with "no clean
  home" is pointed at the nearest primitive now and flagged as a Phase-1 semantic-cleanup item (see
  §11 R2). 🗣 Prove the list, don't trust it.

### Step 7 — Install `radix-ui` (runtime) + the four test devDeps
- **Do:** `npm install radix-ui` and
  `npm install -D jsdom @testing-library/react @testing-library/user-event vitest-axe`. Add the
  one-line justification for `radix-ui` to the PR description (per CLAUDE.md dependency rule; the ADR
  is its written reason).
- **Test:** install succeeds; lockfile updated. Vendor-fence test will be RED until step 10.
- 🗣 Install the five blessed packages.

### Step 8 — Split Vitest into `unit` (node) + `component` (jsdom) projects
- **Do:** In `vitest.config.ts`, replace the single `test` block with a two-project config:
  - `unit`: `environment: 'node'`, `include: ['tests/unit/**/*.test.ts']` (UNCHANGED behaviour for
    the existing suite — same env, same glob).
  - `component`: `environment: 'jsdom'`, `include: ['tests/component/**/*.test.{ts,tsx}']`,
    `setupFiles: ['tests/component/setup.ts']`.
  - Keep `globals: true`, the `@` alias, and `oxc.jsx.runtime: 'automatic'` for both. `npm test`
    (`vitest run`) runs BOTH projects, so both are hard-gated.
- **Test:** `npx vitest run` executes the existing unit suite in node (unchanged green) AND the new
  component lane in jsdom. 🗣 One test command, two benches — old logic tests stay exactly as they
  were; UI tests get a pretend browser.

### Step 9 — `tests/component/setup.ts`
- **Do:** Register vitest-axe's matcher (`expect.extend(matchers)` from `vitest-axe/matchers` — or
  `import 'vitest-axe/extend-expect'` per its API) and add `afterEach(cleanup)` from
  `@testing-library/react`. Do NOT import `@testing-library/jest-dom`.
- **Test:** consumed by step 11's test (the `toHaveNoViolations` matcher must exist).
- 🗣 Switch on the accessibility matcher and tidy up the DOM between tests.

### Step 10 — Allow-list `radix-ui` in the vendor-fence pin
- **Do:** In `tests/unit/lint/vendor-fence-complete.test.ts`, add `"radix-ui", // a11y-primitives (presentation)`
  to the `ALLOWLIST` set. (Do NOT add it to `.eslintrc.json` — it is allowed in `components/**`, not
  fenced.)
- **Test:** `npx vitest run tests/unit/lint/vendor-fence-complete.test.ts` → green again (all three
  cases). 🗣 Tell the "no unexplained vendors" guard that radix is a deliberately-allowed looks
  library, so it stops complaining.

### Step 11 — Throwaway probe component + its test
- **Do:**
  - `tests/component/_fixtures/ThrowawayProbe.tsx` — a tiny function component: a real `<button>`
    styled with a SEMANTIC token class (e.g. `className="bg-action-primary text-on-action"`) that
    calls an `onClick` prop and renders its children. **Test-only, never imported by app code, never
    placed in `components/ui/`.**
  - `tests/component/throwaway.test.tsx` — render it with RTL, assert it shows; click it with
    `user-event` and assert the handler fired; run `axe` on the container and assert
    `toHaveNoViolations()`.
- **Test:** this IS the test; `npx vitest run tests/component` green. Proves render + interaction +
  a11y all work end-to-end.
- 🗣 Build one throwaway button purely to prove the new test bench can mount it, click it, and
  a11y-check it — then never ship it.

### Step 12 — `semantic-tokens-only` lint guard (file-reading test)
- **Do:** `tests/unit/lint/semantic-tokens-only.test.ts` — scan `components/ui/**/*.{ts,tsx}` and
  assert NONE contain: (a) raw hex literals `#[0-9a-fA-F]{3,8}`, (b) stock Tailwind palette colour
  utilities (`(bg|text|border|ring|fill|stroke|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d`),
  (c) Tier-1 brand-primitive utilities (`-mfs-(navy|orange|maroon|red|sand|soft|ink|neutral|kds)`).
  Allowed: the semantic utility names from step 5. **Scope: `components/ui/**` ONLY** — the existing
  19 components and `app/dashboard/admin/_components/primitives.tsx` are NOT retro-flagged (mirror the
  scoping pattern of the existing `tests/unit/lint/*` pins). In 0a the directory is empty, so the test
  passes vacuously and PINS the rule for 0b. (Next build ignores ESLint, so this test is the real
  guard — same rationale as the vendor-fence pin.)
- **Test:** `npx vitest run tests/unit/lint/semantic-tokens-only.test.ts` green (zero files → pass);
  add one inline-fixture negative case (a string containing `#abc` is detected by the matcher) so the
  rule's teeth are proven, not just its silence.
- 🗣 A guard that, from 0b onward, fails the build if a new shared component reaches for a raw colour
  or a primitive instead of a purpose-named token. Today it watches an empty room — that's intended.

### Step 13 — (reserved) lane-conventions note
- Optional: a 3-line header comment in `tests/component/setup.ts` documenting the lane split. No code.

### Step 14 — Token-resolve / compile test (the BUILD-GREEN guard)
- **Do:** `tests/unit/tokens/token-resolve.test.ts` (node lane). It must:
  1. Read `app/tokens.css` + `tailwind.config.ts` from disk.
  2. Assert every legacy colour name in the §5 table is still present in the Tailwind `colors` config
     AND its `var(--…)` target exists in `tokens.css` (semantic→primitive reference chain is valid —
     no dangling `var()`).
  3. Assert the two alpha colours are in channel form (`<alpha-value>` present) and their `*-rgb`
     vars exist (R1).
  4. Assert the dark-override (`[data-theme="dark"]`) and density (`[data-density="compact"]`) blocks
     exist and redefine a representative semantic var.
  5. Assert `--font-display`/`--font-text` are consumed (not dangling) and the type-ramp
     `--text-*-size` vars exist (so `fontSize` utilities resolve).
  6. Assert the legacy-alias vars (`--mfs-orange`, `--mfs-neutral`) and `--mfs-navy` exist (the 3
     inline-style consumers).
- This is a static/text-parse guard (no headless browser needed); it is the precise, fast backstop
  the §5 "build-green reality check" calls for.
- **Test:** `npx vitest run tests/unit/tokens` green.
- 🗣 An automated checklist that proves the §5 table is honoured — every old class still has a home,
  every semantic token points at a real primitive, opacity works, dark/compact exist.

### Step 15 — Full build-green verification
- **Do/verify (all must pass):**
  - `npx tsc --noEmit` → 0 errors.
  - `npm run build` (`next build`) → succeeds (no PostCSS/Tailwind compile error from the rewire).
  - `npx vitest run` → entire suite green (existing unit suite UNCHANGED count + new token-resolve,
    semantic-tokens-only, vendor-fence (re-green), component lane).
  - Smoke the look manually (dev server) on 2–3 representative screens (e.g. `/orders`,
    `/dashboard/admin`, `/login`) to confirm the new palette + Adieu headings render and nothing is
    colourless. 🗣 Eyeball that screens shifted to the new brand and nothing went blank.

---

## 10 · Acceptance criteria

1. Adieu `.otf` files + 3 logos + 4 star icons present under `public/fonts/adieu/` and `public/brand/`.
2. `app/tokens.css` reproduces the reference foundation tokens verbatim (the 3 noted deviations
   only); light default + `[data-theme="dark"]` + `[data-density="compact"]` all present.
3. Fonts load via `next/font` (Adieu→`--font-display`, Inter→`--font-text`); Plus Jakarta Sans is
   GONE (no Google-Fonts `@import`, no heading rule referencing it); headings render Adieu, body Inter.
4. `tailwind.config.ts` reads `var(--…)`; the double-declaration is gone; every §5 legacy name still
   resolves; semantic colour utilities exist for 0b.
5. R1 solved: `mfs-navy`/`mfs-danger` opacity modifiers (`/40`,`/50`,`/10`,`/30`) compile and apply.
6. `radix-ui` installed + allow-listed (vendor-fence pin green); 4 test devDeps installed; NOT
   `@testing-library/jest-dom`.
7. Vitest runs two projects; existing unit suite unchanged + green; component lane green.
8. The throwaway probe proves render + click + axe; it lives only under `tests/component/**`.
9. `semantic-tokens-only` pin scoped to `components/ui/**`, passes (empty) + has a proven-negative case.
10. `tsc --noEmit` + `next build` + full `vitest run` all green.
11. PR open on a feature branch off `worktree-ui-system-rebuild`; **NOT merged to `main`**; awaiting
    Hakan's unlock. No AI references anywhere.

---

## 11 · Risk Assessment (mandatory)

> Severity scale: 🔴 high · 🟡 medium · 🟢 low. "Must-fix" = a Gate-2 blocker until resolved in-plan.

### Concurrency / race conditions
- **No material risks in this category.** 0a touches static styling, build config and test setup —
  no runtime concurrency, no shared mutable state, no async ordering. 🟢
  🗣 Nothing here runs concurrently or races; it's paint and config.

### Security
- **No material risks.** No auth, RLS, API, secrets, or data paths touched (guardrail-enforced). Fonts
  are self-hosted local `.otf` (no third-party font CDN call after Plus-Jakarta removal — a minor
  privacy/perf *improvement*). 🟢
  🗣 Removing the Google-Fonts fetch is a small win; nothing sensitive is in scope.

### Data migration
- **N/A.** No DB, no migration, no SQL, no persisted-data shape change. 🟢

### Business-logic flaws
- **No material risks.** No business logic changes; the throwaway component is test-only and unshipped.
  The semantic-tokens-only rule scopes to an empty dir, so it cannot mis-flag existing code. 🟢

### Launch blockers / build-safety (the real risk surface here)
- **R1 — alpha-modifier breakage on `var()` colours.** 🟡 **Mitigation:** `mfs-navy` (×7) and
  `mfs-danger` (×4) are the only `mfs-*` opacity-modifier users; expose them in channel form
  (`rgb(var(--…-rgb) / <alpha-value>)`) with `--mfs-navy-rgb` / `--mfs-danger-rgb` (steps 2, 5).
  Caught by the token-resolve test (step 14) + `next build`. Stock-palette opacity (`orange-500/20`
  etc.) is unaffected (built-in palette). **Must-fix? NO** (mitigated in-plan).
  🗣 Dimmed brand colours need the "unmixed" form to dim; we provide it for the two that need it.
- **R2 — colour-name mapping / build-safety.** 🟡 If any legacy Tailwind colour name is dropped or
  mistyped in the rewire, the screens using it render colourless (and, because Next ignores
  eslint/tsc and Tailwind ignores unknown utilities, the build stays *green and silently wrong*).
  **Mitigation:** the §5 inventory is exhaustive (live-grepped) and the token-resolve test (step 14)
  asserts every name resolves; the manual smoke (step 15) catches any colourless screen. Names with
  "no clean semantic home" (`mfs-neutral-300/400`) are pointed at the nearest primitive now and
  flagged for Phase-1 semantic cleanup. **Must-fix? NO** (mitigated; this is the plan's core guard).
  🗣 The danger is a colour vanishing without an error; the §5 list + the resolve test + an eyeball
  pass are the three nets under it.
- **R3 — `next/font` variable-name reconciliation.** 🟡 If both the token CSS AND next/font declare
  `--font-display`/`--font-text`, they fight. **Mitigation:** step 2 DROPS the literal `--font-*`
  declarations from tokens.css so `next/font` is the sole owner of those exact names (step 4); the
  token-resolve test asserts they're consumed, not redeclared. **Must-fix? NO** (mitigated in-plan).
  🗣 One owner per font variable — Next's loader — so the name lines up instead of clashing.
- **R4 — legacy inline-style `var()` consumers.** 🟢 Three screens use `var(--mfs-orange)` /
  `var(--mfs-neutral)` (names the reference file doesn't define). **Mitigation:** the legacy-alias
  block (step 2) forwards them; token-resolve test asserts they exist. **Must-fix? NO.**
- **R5 — `@import './tokens.css'` ordering / css-loader.** 🟢 A misplaced `@import` (not first) or an
  unresolved local import fails the CSS build. **Mitigation:** place it as globals.css's first line;
  `next build` (step 15) is the immediate check; fallback is importing `tokens.css` in `layout.tsx`
  before `globals.css`. **Must-fix? NO.**

**Risk headline:** No 🔴, **no must-fix blockers.** The cluster is all build-safety (R1–R3, 🟡),
each mitigated in-plan and pinned by the token-resolve test + `next build`. Gate 2 is clear on risk.

🗣 In plain English: nothing here can corrupt data, leak, or race. The only thing that can go wrong is
a colour or font wiring quietly breaking the build or a screen's paint — and we've put a specific
automated test plus an eyeball pass under each of those.

---

## 12 · Explicitly NOT in 0a

- **No real components.** Button, fields, Card, Modal, Tabs, nav, etc. → **0b**. The only component is
  the disposable test probe (never shipped, never in `components/ui/`).
- **Speculative component set** (date pickers, command palette, data-grid, kanban, etc.) → **0c
  (DEFERRED, build-on-demand)**.
- **No theme/density toggle UI.** `[data-theme="dark"]` / `[data-density="compact"]` are DEFINED but
  nothing in 0a flips them at runtime (no switch, no system-pref listener). Default stays light +
  comfortable.
- **No per-screen redesign / migration.** The 46 routes are Phase 1+, audit-first, one section at a
  time. Existing screens shift palette/fonts automatically but keep their current layout/structure.
- **No retro-fix of existing components.** The 19 components + admin `primitives.tsx` are NOT
  re-tokenised or lint-flagged here.
- **No custom Tailwind spacing scale.** Spacing stays Tailwind's default 4px ruler; density tokens
  (`--ctl-h`, `--field-h`, `--tap`, …) are defined for 0b to consume directly, not turned into
  spacing utilities.
- **No `@testing-library/jest-dom`**, no Tailwind v4, no Style-Dictionary/DTCG.
- **No merge to `main`**, no Vercel/CI/`.github` changes, no `lib/**` / `middleware.ts` / `app/api/**`.

🗣 In plain English: 0a is foundation only. Dark mode and compact mode exist in the paint but have no
switch yet; no real buttons, no screen redesigns, no touching the back-end half — all of that is later
phases.
