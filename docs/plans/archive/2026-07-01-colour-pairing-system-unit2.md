# Spec — Global colour-pairing system (light refresh · Unit 2)

**Date:** 2026-07-01
**Status:** DRAFT — §11 decisions LOCKED by Hakan; awaiting final Gate-1 "go" to enter FORGE
**Author:** consultant session with Hakan (brand-book re-read + measured contrast audit)
**Supersedes:** the original narrow "Unit 2 = hub bold-navy header" scope — that work is **absorbed into §8** of this spec.
**Prereq backlog item:** F-TD-40 (inert `text-*` utilities) — fixed as Phase 0 of this unit (§7).

---

## 1 · Problem

Unit 1 (PR #110) fixed the **palette** (tokens now carry the right brand colours) but not the
**placement rules** (which colour may sit on which background, per element role). Audit of
`/haccp` (hub) + brand PDF found three root causes:

1. **F-TD-40 bug** — most semantic text-colour utilities (`text-body`, `text-muted`,
   `text-subtle`, `text-on-action`) are inert (Tailwind `colors.text` group collides with
   `fontSize` keys → no colour emitted). All text falls back to black. Concrete result:
   **black initials on navy avatar circles** — literally on the brand book's misuse page
   (p12), and the exact thing Hakan spotted on prod.
2. **Grey composition** — the canvas is brand cream `#EDEAE1`, but everything on it is
   white/grey (grey-wash `neutral` StatusTiles, grey borders, no navy anywhere). The page
   reads 100-0-0 instead of 60-30-10.
3. **No pairing layer** — tokens say what colours exist; nothing encodes which
   foreground is legal on which background, per role. Every screen re-decides by hand.

## 2 · Scope

**Global by construction.** The rules land in `app/tokens.css`, `tailwind.config.ts` and
`components/ui/` — every screen already connected to tokens/kit inherits them instantly;
every screen migrated later in the overhaul inherits them on its overhaul turn.

**Covers ALL element roles** (Hakan's explicit requirement): page backgrounds, surfaces/cards
on backgrounds, buttons on top of surfaces (fill AND label), outlines/borders (decorative and
load-bearing), text at every level, icons, badges/pills, focus rings, disabled states, the
alarm surface, category-colour chips.

**Out of scope:** KDS `[data-theme="dark"]` block (keeps scarlet until KDS re-tokenised);
migrating additional screens (each adopts on its own overhaul unit); F-INFRA items.

## 3 · The law — two gates, three roles

Every colour decision passes BOTH gates:

- **Gate 1 · Brand legality** — the pairing must be approved by the MFS Wholesale Brand
  Guidelines (pairings p10; misuse p12). Brand has NO green/amber (app-invented, caged —
  CLAUDE.md rule unchanged).
- **Gate 2 · Measured contrast, per role** (WCAG 2.x):
  - **Body text** ≥ 4.5:1
  - **Large text** (≥24px, or ≥18.5px bold), **icons, meaningful UI shapes, load-bearing
    outlines, focus rings** ≥ 3:1
  - **Decorative shapes/separators** — Gate 1 only.

A pairing legal at one role is NOT automatically legal at another (e.g. white on brand
orange = 3.3 → large/bold only, never body text).

## 4 · Pairing matrix (measured ratios; ✗ = brand-banned, ✕ = fails maths)

| Background | Body text (≥4.5) | Large text / icons (≥3) | Shapes only | Never |
|---|---|---|---|---|
| **Cream `#EDEAE1` / White** | ink-900 `13.9`, navy-700 `12.5`, maroon-500 `11.9`, orange-700 `5.0`, red-700 `6.0` | orange-600 `3.9`, red-500 `3.0`, red-600 `4.2`, sand-600 `3.3`, ink-400 `3.7`, navy-300 `4.5` | orange-500, red-500, sand-500 | orange-500 as text ✕`2.7`, sand-500 as text ✕`2.3` |
| **Navy-700** | white `15.1`, cream `12.5`, orange-500 `4.6` | red-500 `4.1` | — | black ✗✕`1.1`, maroon ✗✕`1.0`, sand ✗ |
| **Maroon-500** | white `14.4`, cream `11.9` | orange-500 `4.4`, red-500 `3.9` | — | navy ✗✕, black ✗✕`1.2` |
| **Orange-500** | ink-900 `5.1` | white `3.3` | — | cream as text ✕`2.7`, red ✗✕`1.1`, sand ✕`1.2`, maroon ✗ |
| **Red-600 `#d62a00` (alarm fill)** | white `5.0` | cream | — | sand ✗, orange ✗✕ |
| **Red-500 `#FF3300` (brand shape)** | black `4.5` | white `3.7`, cream `3.0` | — | sand ✗✕, orange ✗✕ |
| **Sand-500** | ink-900 `6.1` **only** | — | — | white ✕`2.7`, cream ✕`2.3`, navy ✗, maroon ✗, orange ✗ |

Verified safe already (no change): badge text on soft fills — red-700/red-100 `5.8`,
green-700/green-100 `6.6`, amber-700/amber-100 `4.8`, navy-700/navy-50 `12.8`,
ink-600/neutral-soft `7.5`.

## 5 · Element-role rules

### 5.1 Canvas & surfaces
- Canvas = cream (`--surface-base`). Cards = white (`--surface-raised`) with `border-default`
  + `shadow-sm` (white-vs-cream is 1.2 — the border/shadow IS the separation; both required).
- Bold surfaces (navy header, alarm bar, maroon accents) are **surface contexts** (§5.9).

### 5.2 Text on light surfaces
- Headings: **maroon-500** (DECISION (a) — LOCKED by Hakan 2026-07-01; `11.9` on cream, and it
  is the brand book's own typography treatment: its type-specimen pages set headlines in maroon
  on cream). Division of labour: **maroon is the voice** (headings), **navy is the frame**
  (header, icons, nav, structure). Body/muted/subtle/links unchanged below.
- Body: ink-900. Muted: ink-600 (`7.4` on cream). Subtle: keep `#645f55`.
- Links: **orange-700 on cream**, orange-600 allowed on white cards
  (`--text-link` currently orange-600 = 3.9 on cream → below body-text bar; token change §8).

### 5.3 Buttons (fill + label + outline, on light surfaces)
- **Primary:** orange-500 fill + **ink-900 label `5.1`** (DECISION (b) — LOCKED by Hakan
  2026-07-01; brand-approved pairing p10 col-2). App-wide, no mixing with white labels.
- **Secondary:** navy-700 fill + white label `15.1`.
- **Ghost/outline:** transparent fill, navy-700 label, **navy-300 border `4.5/5.5`**
  (current `border-strong` outline = `1.8` on cream — FAILS, see §5.4).
- **Danger:** red-600 fill + white label `5.0` (already the token — keep).
- **Disabled:** the ONLY grey allowed on interactive elements (existing `*-disabled` tokens).

### 5.4 Outlines & borders — two classes
- **Decorative separators** (hairlines, card edges): `border-default`/`border-subtle`
  unchanged — Gate 1 only, no contrast bar.
- **Load-bearing outlines** (input fields, outline buttons, anything whose boundary is the
  only way to find it): must hit 3:1. Current `border-strong` = `1.8` cream / `2.1` white →
  **FAILS**. New token `--border-input` = **ink-400 `#7c786e`** (`3.7/4.4`); outline buttons
  use navy-300 (§5.3). Inputs additionally keep the focus ring as the active affordance.

### 5.5 Focus ring
- Current orange-500 = `2.7` on cream → FAILS 3:1. Change `--focus-ring` to
  **orange-600** (`3.9` cream / `4.7` white). Shadow alpha companion updated to match.

### 5.6 Icons
- Follow the large-text column of §4 (≥3:1). Icons on cream: navy-700 default, status-`*-text`
  tones when conveying status. Never colour-only: every status icon keeps its text/badge twin
  (WCAG 1.4.1 — colour is never the only signal).

### 5.7 Badges & status (cages preserved)
- Green/amber remain caged: temperature pass/warn/fail tiles + badges ONLY, never chrome.
- Badge = soft fill + `-700` text + border (all verified §4). No change to values;
  the rule layer just makes them the ONLY legal badge recipe.

### 5.8 StatusTile — `neutral` state redesign (kills the grey wall)
- `neutral` becomes: **white card + navy-700 icon + ink label + ink-600 status line**,
  border-default. Grey wash retired. States `complete/due/overdue/deviation` unchanged
  (already legal per §4 verifications).
- Grey (`status-neutral-*` wash) is demoted to genuinely-disabled/inactive elements only.

### 5.9 Surface contexts — the enforcement mechanism
- New attribute contexts re-scope the semantic vars so components can't pick wrong pairings:
  - `data-surface="canvas"` (default; light values as today)
  - `data-surface="bold-navy"` → `--text-body`:white, `--text-muted`:cream/85%,
    accents restricted to orange-500 (text-legal `4.6`) + red (icons/badges only `4.1`)
  - `data-surface="alarm"` → fill red-600, `--text-body`:white (legal ALL sizes at `5.0`),
    borders white/30%
  - `data-surface="bold-maroon"` (reserved; white text, orange/red accents-only)
- Inside a context, `text-body` etc. AUTOMATICALLY resolve to the legal foreground.
  Black-on-navy becomes unrepresentable rather than merely forbidden.
- Kit components (`ScreenHeader`, `Banner`, future bold surfaces) declare their own context.

### 5.10 Alarm surface (food-safety signal — MUST survive)
- Hub header alarm flip (`app/haccp/page.tsx` ~:382, gated on `alarm.isAlarming`) is
  preserved: it becomes a context swap `bold-navy → alarm`, not a class soup.
- Alarm fill stays **red-600** (`--status-error-fill`) → white text legal at every size.
  Brand red-500 `#FF3300` on the alarm surface = shapes/pulse accents only.
- **Forced-alarm E2E required:** drive `alarm.isAlarming` true, assert the header context is
  `alarm`, white-on-red text visible + computed styles (not just class presence).

### 5.11 Category colours (future products work; recorded now)
- Frozen→navy, Meat→maroon, Chilled→sand, Poultry→orange, Ambient→red (brand p14).
- Category chips: colour as the CHIP FILL with its §4-legal text (sand chip = ink text;
  navy/maroon chips = white text; orange chip = ink text; red chip = white bold).
  Never category colour as text on light surfaces except via `-700` shades.

### 5.12 Composition rule — 60-30-10
- ~60% cream canvas + white cards · ~30% structure = navy frame (header, icons, nav,
  side-panel accents) + maroon voice (headings) · ~10% orange, EXCLUSIVE to "act here"
  (primary buttons, links, focus, active states). Orange never decorates (no orange
  headings/borders/washes).
- Status colours sit outside the budget and keep their cages.
- Every screen gets exactly ONE bold anchor (the navy `ScreenHeader`).

## 6 · Token changes (concrete list)

| Token | From | To | Why |
|---|---|---|---|
| `--text-link` | orange-600 | **orange-700** | 3.9 on cream fails body-text bar; 5.0 passes |
| `--focus-ring` | orange-500 | **orange-600** | 2.7 on cream fails 3:1; 3.9 passes |
| `--focus-ring-shadow` | rgba(orange-500,.40) | rgba(orange-600,.40) | match ring |
| `--border-input` (NEW) | — | ink-400 `#7c786e` | load-bearing outlines need 3:1 (border-strong=1.8) |
| `--action-ghost-border` | border-strong | **navy-300** | outline buttons are load-bearing; 4.5/5.5 |
| `--action-primary-fg` (NEW) | (blanket `--text-on-action`: white) | **ink-900** | white on orange-500 = 3.3 fails body text — DECISION (b) LOCKED |
| `--action-secondary-fg` / `--action-danger-fg` (NEW) | (same blanket) | **white** | white on navy `15.1` / on red-600 `5.0` — one blanket token can't serve an ink-label fill AND white-label fills |
| `--text-on-action` | white | **DEPRECATED** → per-action `-fg` tokens above | "on action" stopped being one colour the moment primary went ink; kit `Button` maps variant→fg |
| `--on-navy-*` / context blocks (NEW) | — | per §5.9 | surface contexts |
| `--status-neutral-*` | (unchanged values) | usage demoted to disabled-only | §5.8 |

Everything else in `tokens.css` verified legal — no value churn for churn's sake.

## 7 · Phase 0 (prerequisite) — F-TD-40 proper fix

- Root cause: `colors.text.*` in `tailwind.config.ts` collides with `fontSize` keys →
  `text-body`, `text-muted`, `text-subtle`, `text-on-action`, `text-link` emit no colour.
- Fix direction (planner to finalise): break the collision so ALL semantic text-colour
  utilities emit — either rename the colour namespace or move the type scale off the
  `text-` prefix — **app-wide light + KDS-dark regression required** (this un-inerts
  classes on every already-migrated screen at once; expect visible diffs beyond HACCP —
  that is the point, but it must be EYEBALLED on preview, not just green tests —
  Unit-1 lesson).
- Also resolve the Unit-1 side-effect foot-guns: `bg-inverse`/`border-inverse` currently
  compile to the *text* token (white). Kill or alias correctly.
- Nothing in §5 works until this lands: contexts re-scope vars that inert utilities
  would never read.

## 8 · Hub repaint (absorbs old Unit 2)

- `/haccp/page.tsx` (both `HomeScreen` and `LoginDoor`): adopt kit `ScreenHeader`
  bold-navy via `data-surface="bold-navy"`; alarm flip per §5.10 + forced-alarm E2E.
- Avatar circles: context/on-fill tokens (white initials on navy `15.1`; primary-fill
  avatar follows DECISION (b) label colour).
- Header buttons (Admin/Documents/logout), login-door buttons: per §5.3.
- StatusTile neutral redesign per §5.8 (kit change → cold-storage/process-room inherit —
  visual regression check on both).
- Add `/haccp/page.tsx` to `tests/unit/lint/haccp-screens-token-pure.test.ts` SCREENS list.

## 9 · Enforcement & tests

1. **Contrast regression test (NEW, the keystone):** a vitest unit that hard-codes the §4/§6
   pairing claims (bg hex, fg hex, role threshold) and computes WCAG ratios — any future
   token edit that breaks a legal pairing fails CI. The matrix stops being a doc and
   becomes executable.
2. Token-purity guard extended to the hub (§8).
3. Forced-alarm E2E (§5.10) with computed-style assertions.
4. ANVIL browser-tap on the preview (upgraded matrix — HACCP is critical section):
   hub + cold-storage + process-room, light regression sweep of dispatch/orders/cash
   (F-TD-40 un-inerting touches them), KDS dark spot-check.
5. Green/amber caging: visual check at ANVIL (unchanged — no brittle lint).

## 10 · Acceptance criteria

- [ ] Every `text-*` semantic colour utility emits colour (F-TD-40 closed).
- [ ] Hub renders: navy anchor header, white/navy neutral tiles, zero grey-wash tiles,
      zero black-on-navy/black-on-orange-unintended pairs.
- [ ] Alarm flip works; forced-alarm E2E green; white-on-red measured ≥4.5.
- [ ] Contrast regression vitest green and wired into the unit suite.
- [ ] Focus ring visible (≥3:1) on cream AND white.
- [ ] Inputs/outline buttons hit ≥3:1 boundaries.
- [ ] Cold-storage + process-room unchanged-or-better (kit inheritances eyeballed).
- [ ] KDS dark unaffected.
- [ ] Rip-out test unaffected (no vendor/dependency changes expected).

## 11 · Gate-1 decisions — LOCKED (Hakan, 2026-07-01)

- **(a) Headings on cream: MAROON-500.** The brand book's own typography treatment.
  Navy stays the structural frame (header, icons, nav); maroon is the voice.
- **(b) Primary button: orange-500 fill + ink-900 label**, app-wide. Consequence:
  `--text-on-action` splits into per-action `-fg` tokens (§6).

## 12 · Relationship to the Claude Design file ("MFS OPS NEW")

- **The CODE is the design system** — `app/tokens.css` + `tailwind.config.ts` +
  `components/ui/` are where these rules attach and the ONLY place they are enforced.
  The Claude Design project `0e28a094-d725-42bd-8858-cd469b21a42d` was the *origin* of the
  Phase-0 foundation and remains a Tier-A mockup tool; it does NOT receive or enforce the
  pairing rules (locked direction 2026-07-01: direct-to-code; a second rule-carrying source
  of truth would drift and need babysitting — it has already drifted: it still shows the
  retired dark theme + scarlet).
- **Rules attach per component in the kit:** `Button` owns its variant→fill/label pairs,
  `StatusTile` its state recipes, `ScreenHeader`/`Banner` their surface contexts, tokens
  own the values, and the §9.1 contrast vitest enforces the whole matrix. A screen composing
  the kit gets every rule without knowing it exists.
- **Tier-A workflow consequence (ADR-0014):** any future Claude Design mockup is checked
  against the §4 matrix at the per-screen requirements-audit gate BEFORE build — the mockup
  proposes, the pairing law disposes. Optionally sync "MFS OPS NEW" after big ships as a
  visual record — never as the build route.

---

*Research grounding: brand PDF pp. 8–16 (palette, pairings, misuse, category colours);
WCAG 2.x thresholds; on-colour token practice (USWDS, UX Collective, aufait UX);
60-30-10 composition (sixtythirtyten, Groto). Contrast ratios computed 2026-07-01
(relative-luminance method, scripts in session scratchpad; re-runnable via §9.1 test).*
