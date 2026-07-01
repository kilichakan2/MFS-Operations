# Light Design-System Refresh — Spec

**Date:** 2026-07-01
**Author:** Consultant (pre-FORGE deliverable)
**Status:** DRAFT — awaiting Hakan sign-off, then FORGE
**Source of truth:** MFS Wholesale Brand Guidelines PDF (see `reference_brand_guidelines` memory)

---

## 0. One open decision (needs Hakan's yes/no before FORGE)

**Red strategy.** Today the app's "error / danger" red is an invented crimson
(`--scarlet-600 #c8102e`), which is **not** a brand colour. The brand's only red is
**Mediterranean Red `#FF3300`** (`--mfs-red-500`).

- **RECOMMENDED — unify on brand red.** All "bad / attention" states (error, danger,
  deviation, temperature-fail) use the one brand Mediterranean Red family. Green + amber
  then become the *only* non-brand colours in the whole system, cleanly caged. Slightly
  wider blast radius (touches every error/danger element) but it is the on-brand answer.
- **Alternative — minimal.** Only fix `deviation` → brand red; leave the crimson
  `error/danger` as-is. Smaller change, but leaves a non-brand red in the system and two
  different reds on screen.

🗣 One red that's actually yours, everywhere "something's wrong" — versus patching only the
pink and leaving a second, off-brand red in place. This spec assumes the RECOMMENDED option;
say the word to switch to minimal.

---

## 1. Goal & scope

**Goal:** make the shipped HACCP screens look *brand-perfect on the light skin*, by fixing
which semantic colour token is pointed at which surface — governed strictly by the brand's
own pairing rules. No layout changes; skin only.

**In scope:**
- `app/tokens.css` — semantic (Tier-2) light values only.
- The kit components (`components/ui/`) whose token wiring changes (header treatment,
  deviation state).
- Removing HACCP's opt-in to the dark theme (`app/haccp/layout.tsx`, `app/haccp/ThemeLock.tsx`).
- Verifying the 3 shipped token-pure screens: hub (`app/haccp/page.tsx`),
  `app/haccp/cold-storage/`, `app/haccp/process-room/`.

**Out of scope (explicit):**
- The ~19 remaining HACCP screens still holding raw hex — they do NOT follow a token change
  until individually rebuilt (tracked separately). Listed in the colour-audit catalogue.
- Any layout / structural / composition change (skin only).
- The `[data-theme="dark"]` token block itself — **leave it defined** (may serve the KDS
  kiosk). We only stop HACCP from opting into it. FORGE to confirm no other live consumer.
- Tier-1 primitives — the brand hexes already match 1:1; no primitive edits expected
  (except adding a deepened red for AA text — see §4).

---

## 2. Brand rules this spec enforces (the guardrails)

From the brand PDF:

- **Canvas** = Soft Neutral `#EDEAE1` (already the light `--surface-base`). Cards = white / soft.
- **Approved bold-on-bold pairings, ONLY these:** Navy+Orange · Navy+Red · Maroon+Red ·
  Maroon+Orange. Plus any bold on Soft Neutral; and Orange/Red/Sand/Soft on Black.
- **FORBIDDEN (brand "colour misuse"):** navy-on-navy, navy-on-maroon, maroon-on-black
  (dark-on-dark); orange-on-sand, red-on-orange, sand-on-red, navy-on-sand, maroon-on-sand.
- **Fonts:** Adieu (headings), Inter (body) — already wired, no change.
- **Maroon is a full-strength bold colour** (Meat, packaging) — never a washed-out pink tint.
- Brand has **no green, no amber** — those are an app-invented functional extension.

---

## 3. Resolved decisions (approved by Hakan 2026-07-01)

| # | Decision | Effect |
|---|---|---|
| A | **Flip HACCP to light** | Remove dark opt-in; screens inherit the light `:root` skin. Blue-on-blue dies automatically (navy button now on soft-neutral = an approved pairing). |
| B | **Deviation → brand Red** (was pink maroon tint) | Retire the invented pink; maroon freed to be a real brand colour. (Under §0-recommended, deviation shares the one brand-red family with error/danger/fail.) |
| C | **Cage green/amber** | Green/amber may appear ONLY on temperature reading tiles + pass/warn/fail badges — never on chrome (headers, buttons, nav, banners). |
| D | **Headers → bold colour block** | HACCP page headers become a Navy (default) or Maroon block with soft-neutral text — an approved pairing, matching the brand posters. |

---

## 4. Exact token changes — `app/tokens.css` (`:root`, light)

> Values below are the **intent + proposed values**. FORGE/implementer finalises exact tints;
> ANVIL verifies **WCAG AA contrast** on every text/surface pairing. No pink anywhere.

**B — Deviation & the red family (assuming §0 RECOMMENDED: unify on brand red `#FF3300`):**

- Add one primitive for AA-legible red text on soft: `--mfs-red-700: ~#a8210a` (deepened brand red).
- Repoint the **error / danger** semantic set from scarlet → brand red:
  - `--status-error-fill: var(--mfs-red-600)` (`#d62a00`)
  - `--status-error-soft: var(--mfs-red-100)` (`#ffe0d6`)
  - `--status-error-text: var(--mfs-red-700)` (`~#a8210a`, AA on soft)
  - `--status-error-border: ~#f3b6a6` (brand-red-tinted)
  - `--action-danger: var(--mfs-red-600)`; `--action-danger-hover: var(--mfs-red-700)`
- Repoint the **deviation** set to the SAME brand-red family (keep the token names — the
  screens read `--status-deviation-*`, so no screen edits needed):
  - `--status-deviation-fill / -soft / -text / -border` = the brand-red values above.
- `--sync-stuck: var(--mfs-red-600)` (brand red, was scarlet).
- Scarlet primitives (`--scarlet-*`) become unused — leave defined or remove (implementer's call, note in PR).

*(Minimal alternative: change only the four `--status-deviation-*` to the brand-red family;
leave `--status-error-*` / `--action-danger` on scarlet.)*

**C — Green/amber unchanged in value** (`--status-success-*`, `--status-warning-*`), but
governed by the caging rule (§5). No token edit; a usage guardrail.

**D — Header treatment:** no new token needed — the light `--surface-inverse` already = Navy
(`--mfs-navy-700`) and `--text-inverse` = white. A bold navy header = `bg-surface-inverse` +
`text-inverse` (the existing kit `AppHeader` pattern). A Maroon variant = a bold maroon block +
soft-neutral text.

---

## 5. Component / screen touches

**Kit (`components/ui/`):**
- **Header treatment** — provide a "bold header" treatment (Navy block / soft text; optional
  Maroon variant) via `PageHeading`/`CardHead` or a header primitive, so screens consume it
  from the kit (ADR-0014 kit-only rule) rather than styling inline.
- **StatusTile** — `deviation` state now resolves to brand red via the retargeted tokens
  (no component logic change; colour follows the token).
- No other kit component changes expected — `SegmentedControl` active pill and
  `Button variant="secondary"` are `--action-secondary` (Navy); on the light canvas that is
  the approved Navy-on-Soft pairing, so they are correct once the theme is light. **No edit.**

**Screens (verify, minimal edits):**
- `app/haccp/layout.tsx` — remove `data-theme="dark"` from the shell div.
- `app/haccp/ThemeLock.tsx` — remove (light is the `:root` default; portals inherit light).
- hub / cold-storage / process-room — swap their inline header bars to the kit bold-header
  treatment (D). Confirm each screen stays **token-pure** (no raw hex introduced).

---

## 6. Acceptance criteria (ANVIL gate)

1. **No dark-on-dark** anywhere in the 3 screens (brand p13) — no navy/maroon/black on navy/maroon/black.
2. **Only approved pairings** on all chrome (headers, buttons, nav, banners, tiles, tags).
3. **No pink** — deviation renders as brand red; no `#f0e2e8`/maroon-tint fills remain.
4. **Green/amber appear only** on temperature reading tiles + pass/warn/fail badges.
5. **WCAG AA** contrast on every text/surface pairing (esp. red text on red-soft).
6. Screens remain **token-pure** (rip-out/`reusable-visual-in-kit` guards stay green).
7. HACCP no longer sets `data-theme="dark"`; `[data-theme="dark"]` block still defined for KDS.
8. Full existing suite green (unit / integration / pgTAP / E2E) — no regression.

---

## 7. Sign-off → next step

On Hakan's approval (and §0 red decision): hand to **FORGE** on the isolated
`worktree-ui-system-rebuild`, then **ANVIL**, then Hakan gives the final visual yes on a real
preview (component gallery + the 3 screens).
