# Light Design-System Refresh — EXECUTION PLAN (FORGE Order phase)

**Date:** 2026-07-01
**Author:** forge-planner (Order phase)
**Approved spec (source of truth):** `docs/plans/2026-07-01-light-design-system-refresh.md`
**§0 red decision:** RESOLVED = **RECOMMENDED** — unify all error / danger / deviation /
temperature-fail reds onto the brand Mediterranean Red family (`--mfs-red-*`); retire the
invented scarlet crimson (`--scarlet-*`) from the **light** semantic mappings only.
**Build location:** git worktree `worktree-ui-system-rebuild` (does NOT exist yet — the
implementer cuts it fresh from `main`; merge to `main` only after ANVIL certification).

> 🗣 In plain English: this is a paint job on the light theme, plus one new reusable
> "bold header" piece. No new plumbing, no database, no vendors. The heavy lifting is
> in one CSS file; the risk sits in the header restyle of the alarm screen.

---

## 0. Visual mini-map

```
DOMAIN (HACCP presentation — no port/adapter touched)
  ├─ tokens.css (:root light)   → repoint error/danger/deviation → brand red
  ├─ components/ui/ (the kit)   → + ScreenHeader (bold navy), + Button ghost-inverse
  └─ app/haccp/* (3 screens)    → drop dark opt-in · consume bold header · stay token-pure
🗣 skin + one kit part; swap a colour = edit one token, every screen repaints
```

This change lives entirely in the **presentation ring**. There is no vendor, DB, auth, or
network seam involved, so no **port** (the socket the core owns) and no **adapter** (the
vendor plug) is added or altered. The hexagonal rip-out test is **N/A** (nothing to rip out).

---

## 1. Goal

Make the 3 shipped HACCP screens **brand-perfect on the light skin**, governed by the brand's
own pairing rules, with **zero layout/structural change** — skin only. Retire the two
off-brand reds (scarlet crimson + the pink maroon-tint deviation) and unify on the single
brand Mediterranean Red. Flip HACCP off the dark theme so it inherits the light `:root`.
Introduce a reusable **bold header** (Navy block) so the screen tops match the brand posters.

> 🗣 In plain English: the shipped screens currently run on a dark navy theme and use a
> crimson that isn't a real brand colour. We switch them to the light look, make every
> "something's wrong" red the one true brand red, and give the page tops a bold navy bar.

---

## 2. Domain terms (plain-English)

- **Tier-1 primitive** — a raw brand colour value, e.g. `--mfs-red-500:#FF3300`.
  🗣 The paint tin itself. You almost never point a screen straight at a tin.
- **Tier-2 semantic token** — a purpose-named variable, e.g. `--status-error-fill`.
  🗣 The label on the wall ("error fill") that points at whichever tin we chose. Screens
  read the label, so re-aiming the label repaints every screen at once.
- **`:root` (light) vs `[data-theme="dark"]`** — two token blocks; light is the default,
  dark applies only where an ancestor sets `data-theme="dark"`.
  🗣 Two lighting presets. Removing HACCP's dark switch drops it back to the default lights.
- **Bold-on-bold pairing** — two strong brand colours together (Navy+Orange, Navy+Red,
  Maroon+Red, Maroon+Orange). 🗣 The only "loud on loud" combos the brand allows.
- **Token-pure screen** — a screen with no raw hex / stock Tailwind colour / brand-primitive
  utility; it uses semantic tokens only. 🗣 The screen never names a paint tin directly.

---

## 3. Compliance / architecture flags

- **Hexagonal (ports & adapters):** no port added or used, no adapter touched, no vendor SDK,
  no new `package.json` entry. Rip-out test **N/A**. **PASS.** (Full verdict in §11.)
- **Kit-only rule (ADR-0014 Rule 1/3 + `reusable-visual-in-kit` guard):** the new bold header
  is a reusable visual → it MUST be defined in `components/ui/` and consumed from the barrel.
  The plan honours this. **PASS by construction.**
- **`semantic-tokens-only` guard (`tests/unit/lint/semantic-tokens-only.test.ts`):** scopes
  `components/ui/**` ONLY. The new `ScreenHeader` and the `ghost-inverse` Button variant MUST
  contain **no raw hex, no stock palette colour (`bg-white/…` included in spirit), no
  `-mfs-*` primitive** — semantic tokens only, or the guard fails.
- **No inner-layer import breach:** this diff adds no `lib/adapters/**` import anywhere.

> 🗣 In plain English: the one architecture rule that bites here is "reusable visuals live in
> the kit, and kit files may only use the semantic labels, never raw paint." Both are easy to
> satisfy — just don't hardcode a colour inside the new header component.

---

## 4. ADR conflicts

None. Checked `docs/adr/0014` (kit consumption + tiered workflow) and `0002` (hexagonal
shape). This change **reinforces** 0014 (adds a reusable header to the kit, keeps screens
token-pure) and is out of scope for 0002 (no ports/adapters). No ADR needs amending; no ADR
is violated.

> 🗣 In plain English: nothing here contradicts a past decision. It actually strengthens the
> "reusable visuals live in the kit" decision.

---

## 5. Exact files to change

| # | File | Change |
|---|------|--------|
| 1 | `app/tokens.css` | Add `--mfs-red-700` primitive; repoint the **light `:root`** error/danger/deviation/sync-stuck tokens to the brand-red family. **Do NOT touch `[data-theme="dark"]`.** |
| 2 | `app/haccp/layout.tsx` | Remove `data-theme="dark"` from the shell `<div>`; remove the `<ThemeLock />` render + import; update the stale header comment. |
| 3 | `app/haccp/ThemeLock.tsx` | **Delete the file** (light `:root` is the default; portals inherit light). |
| 4 | `components/ui/ScreenHeader.tsx` | **NEW** — reusable bold navy header (eyebrow + title + back + actions slot). |
| 5 | `components/ui/Button.tsx` | Add `ghost-inverse` variant (white-outline, inverse text) for actions sitting on the navy header. |
| 6 | `components/ui/IconButton.tsx` | Add matching `ghost-inverse` variant for the inverse Back affordance (or ScreenHeader renders its own inverse back — see §7-C). |
| 7 | `components/ui/index.ts` | Export `ScreenHeader` + its prop types from the barrel. |
| 8 | `app/haccp/cold-storage/page.tsx` | Replace the back-bar (L519–531) with `<ScreenHeader>`; update the stale "dark theme inherited" comment (L11). |
| 9 | `app/haccp/process-room/page.tsx` | Replace the back-bar (L712–724) with `<ScreenHeader>`; update stale comment (L10). |
| 10 | `app/haccp/page.tsx` | Re-skin the HomeScreen `<header>` (L379) and LoginDoor `<header>` (L716) to the bold-navy treatment, **preserving the alarm-red flip** and restyling inner chrome to inverse-safe. |
| 11 | `tests/unit/lint/haccp-screens-token-pure.test.ts` | **NEW (recommended)** — pins the 3 shipped screens as raw-hex/stock/primitive-free (closes acceptance criterion #6 with real teeth — see §9 + Gate-2 decision D3). |
| 12 | `CLAUDE.md` (or `docs/design/…`) | Add the **green/amber caging** doc rule (§8). |

> 🗣 In plain English: one CSS file does most of the work; three screen files consume the new
> header; two-plus kit files add the header and an on-navy button style; one small new test
> guards the screens from ever sneaking a raw colour back in.

---

## 6. Token remap — `app/tokens.css` (`:root` LIGHT only)

**6.1 — Add one Tier-1 primitive** (next to the `--mfs-red-*` line, currently L21):

```
--mfs-red-700:#a8210a;   /* deepened brand red — AA-legible red text on red-soft */
```
🗣 A darker shade of the brand red, needed so red *text* on a pale-red panel is still legible
(the bright `#FF3300` fails contrast as text). ANVIL verifies the exact AA number.

**6.2 — Repoint the light semantic tokens** (edit only these lines in the `:root` block):

| Token (current value) | New value |
|---|---|
| `--action-danger` (`var(--scarlet-600)`) | `var(--mfs-red-600)` |
| `--action-danger-hover` (`var(--scarlet-700)`) | `var(--mfs-red-700)` |
| `--action-danger-active` (`#6e0a19`) | a deeper brand red, implementer-final (≈ `#7a1800`); ANVIL AA-checks |
| `--action-danger-disabled` (`#e6b6bd`) | brand-red-tinted, e.g. `var(--mfs-red-100)` or `#f3b6a6` |
| `--status-error-fill` (`var(--scarlet-600)`) | `var(--mfs-red-600)` |
| `--status-error-soft` (`var(--scarlet-100)`) | `var(--mfs-red-100)` |
| `--status-error-text` (`var(--scarlet-700)`) | `var(--mfs-red-700)` |
| `--status-error-border` (`#eeb9c1`) | brand-red-tinted, ≈ `#f3b6a6` |
| `--status-deviation-fill` (`var(--mfs-maroon-500)`) | `var(--mfs-red-600)` |
| `--status-deviation-soft` (`#f0e2e8` — pink) | `var(--mfs-red-100)` |
| `--status-deviation-text` (`var(--mfs-maroon-500)`) | `var(--mfs-red-700)` |
| `--status-deviation-border` (`#d9bcc8` — pink) | brand-red-tinted, ≈ `#f3b6a6` |
| `--sync-stuck` (`var(--scarlet-600)`) | `var(--mfs-red-600)` |

**6.3 — Channel-form companion (L87):** `--mfs-danger-rgb:200 16 46` are the *scarlet* channels.
Update to the brand-red-600 channels **`214 42 0`** (`#d62a00`) so any `bg-mfs-danger/<alpha>`
opacity utility renders brand red, not crimson. (No usage on the 3 screens today — grep-clean —
but leaving it crimson is an inconsistency. Low-risk; recommended.)

**6.4 — DO NOT edit:**
- `--status-success-*` and `--status-warning-*` (green/amber) — **values unchanged**; only
  usage-caged (§8).
- The entire `[data-theme="dark"]` block — **left intact** (may serve the KDS kiosk).
- The `--scarlet-*` primitives (L28) — **leave DEFINED, do not delete.** The dark block still
  references `--scarlet-500/600` (L99, L105); deleting the primitives would break dark. In the
  **light** skin they simply become unreferenced. Note in the PR: "scarlet retired from light;
  retained for dark until KDS is re-tokenised."

**6.5 — Auto-following aliases (no edit):** `--status-overdue-*` reference `--status-error-*`
via `var()`, so they inherit brand red automatically. Verify visually; no line edited.

> 🗣 In plain English: point the "error / danger / deviation / stuck-sync" labels at the brand
> red instead of the crimson and pink. Add one darker red for legible red text. Leave green,
> amber, and the whole dark preset untouched, and leave the old crimson tin on the shelf
> (the dark preset still uses it).

**⚠ Blast-radius note (medium risk — see §10):** these are GLOBAL light tokens. Every
token-based light screen in the app (dispatch, orders, cash, complaints, etc.) that renders a
`danger` button or `error` state will ALSO shift crimson → brand red. That is the intended
"brand-wide red", but it means regression scope is the whole light app, not just 3 screens.

---

## 7. Removing the dark opt-in + the bold header

### A · `app/haccp/layout.tsx`
- Remove `data-theme="dark"` from the shell `<div>` (L20) → `<div className="haccp-shell" style={{ minHeight:'100dvh', width:'100%' }}>`.
- Remove `import ThemeLock from './ThemeLock'` (L12) and the `<ThemeLock />` element (L21).
- Rewrite the file header comment (L6–10) — delete the "dark colours at first paint / ThemeLock"
  rationale; replace with "inherits the default light `:root` skin".

### B · `app/haccp/ThemeLock.tsx`
- **Delete the file.** Light is the `:root` default, so Radix-portaled overlays (Modal /
  Popover / DropdownMenu that render to `document.body`) already inherit light — the reason
  ThemeLock existed (forcing portals dark) disappears.
- Grep confirms the ONLY live `data-theme="dark"` writers are `layout.tsx` + `ThemeLock.tsx`.
  The sole remaining consumer is the dev gallery (`app/dev/ui/GalleryFrame.tsx`, which sets
  `data-theme={panel.theme}` to preview both themes) — untouched, legitimate. **No other live
  consumer exists.** After this change, nothing in the running HACCP app sets dark.

> 🗣 In plain English: HACCP had two switches forcing the dark preset (one on the page, one
> globally so pop-ups matched). Both go. The only thing left that mentions dark is the
> developer preview gallery, which is supposed to show both. Confirmed by search.

### C · Bold header — new kit component `components/ui/ScreenHeader.tsx`

A reusable bold header so the 3 screen tops match the brand posters (Navy block + soft/white
text = an approved "bold on soft-neutral" / Navy+white pairing; the orange eyebrow makes it
Navy+Orange, also approved).

**Proposed prop shape (implementer may refine names):**
```
interface ScreenHeaderProps {
  eyebrow: ReactNode          // e.g. "CCP 2 — Cold Storage" — renders text-action-primary (orange)
  title: string               // e.g. "Temperature Check" — renders text-inverse
  onBack?: () => void         // renders an inverse-safe Back affordance when set
  backLabel?: string          // aria-label, default "Back"
  actions?: ReactNode         // right-aligned slot for Quick ref / Handbook etc.
  tone?: 'navy'               // default 'navy'; 'maroon' DEFERRED (see decision D2)
}
```
- Renders `bg-surface-inverse text-inverse` (navy in light) — the existing kit convention
  (same tokens the kit `AppHeader` uses).
- **Back affordance:** ScreenHeader renders its OWN inverse back button (`text-inverse`, plain
  `<button>`, internal to the kit file) — do NOT reuse the ghost `IconButton` here, whose
  `--action-ghost-fg` is navy → **navy-on-navy = forbidden + invisible**. (Alternatively add a
  `ghost-inverse` IconButton variant and use it — implementer's call; either is token-pure.)
- **Actions slot:** the caller passes buttons rendered with the new **`ghost-inverse`** Button
  variant (see D below) so they read on navy. A caller passing a plain `variant="secondary"`
  (navy) button would be navy-on-navy — the ScreenHeader doc comment must warn against this.
- **Token-purity:** the file is under `components/ui/**`, so it is scanned by
  `semantic-tokens-only`. Use semantic tokens only — no raw hex, no `bg-white/…`, no `-mfs-*`.
- Export from `components/ui/index.ts` (barrel) with its prop types.

### D · New `ghost-inverse` Button variant — `components/ui/Button.tsx`
Add to `ButtonVariant` and `VARIANT_CLASSES`: a transparent button with an inverse (white)
border + inverse text that reads on the navy header, e.g.
`bg-transparent border-[color:var(--text-inverse)] text-inverse hover:bg-[color:var(--text-inverse)]/10`.
Avoid the stock `bg-white/10` (stock colour) — derive the hover overlay from `--text-inverse`.
Mirror on `IconButton.tsx` if the inverse Back uses IconButton.
🗣 A button style that looks right sitting on the dark navy bar — see-through with a white
outline — so Quick ref / Handbook stay visible and on-brand.

### E · Consume in the two CCP screens (clean fit)
- `app/haccp/cold-storage/page.tsx` L519–531 → replace the back-bar `<div>` with:
  ```
  <ScreenHeader
    eyebrow="CCP 2 — Cold Storage"
    title="Temperature Check"
    onBack={() => { window.location.href = '/haccp' }}
    backLabel="Back to HACCP"
    actions={<>
      <Button variant="ghost-inverse" size="sm" leadingIcon={<HelpGlyph />} onClick={() => setShowQuick(true)}>Quick ref</Button>
      <Button variant="ghost-inverse" size="sm" leadingIcon={<HandbookGlyph />} onClick={openHandbook}>Handbook</Button>
    </>}
  />
  ```
  Also fix the stale comment at L11 ("Dark theme is inherited …") → "Inherits the light `:root`."
- `app/haccp/process-room/page.tsx` L712–724 → same pattern, eyebrow
  `"CCP 3 + SOP 1 — Process Room"`, title `"Process Room Check"`, Handbook onClick unchanged
  (`/haccp/documents/hb-001?from=/haccp/process-room`). Fix stale comment L10.

### F · Hub — `app/haccp/page.tsx` (heaviest touch, see risk R2)
The hub header is NOT a simple back-bar; it is bespoke app-chrome:
- **HomeScreen `<header>` (L379–439):** normally `bg-surface-raised` (white), **flips to
  `bg-status-error-fill` while the overdue alarm is active** — a load-bearing safety behaviour.
  Contains MfsIcon, a two-line "Food Safety / MFS Sheffield · HACCP" brand block, an Admin
  button (orange-bordered), a Documents button, and an avatar chip with sign-out.
- **LoginDoor `<header>` (L716–729):** white bar with brand block + live clock.

This screen is the root of the kiosk (no "Back"), so `ScreenHeader` does not fit it directly.
**Plan:** re-skin BOTH `<header>`s inline to the bold-navy treatment (`bg-surface-inverse
text-inverse`), keeping them screen-specific (a one-off app-chrome header is NOT a reusable
primitive, so it may stay inline and token-pure — the `reusable-visual-in-kit` guard only
flags exported svg-rooted components, not a `<header>` block). Requirements:
1. **Preserve the alarm-red flip exactly** — navy in the normal state, brand-red
   (`bg-status-error-fill` + `text-inverse`) while `alarm.isAlarming`. This is safety-critical.
2. Restyle the inner chrome buttons to be inverse-safe on navy (Admin / Documents / avatar /
   logout): white-outline or inverse-ghost, per the same treatment as the `ghost-inverse`
   variant; the orange Admin accent (Navy+Orange) is an approved pairing and may stay orange.
3. Keep the two-line brand block (`text-inverse` for the title, an inverse-muted for the
   subline).
4. No layout / structural change — swap surface + text tokens + button variants only.

**Scope option (Gate-2 decision D1):** the hub restyle is materially heavier and higher-risk
than the two CCP back-bars because of the alarm-red flip and the chrome-button density. It may
be split into a **second FORGE unit** (tokens + dark-removal + the two CCP back-bars ship
first; the hub bold-header ships second) to shrink blast radius. Recommend Hakan chooses.

> 🗣 In plain English: the two check-entry screens get the new navy bar cleanly. The hub is
> the alarm screen — its top bar turns red when checks are overdue, and it's packed with
> buttons. Turning it navy is doable but fiddly and must not break the red-alarm behaviour, so
> I'm flagging the option to ship it as a small second step.

---

## 8. Green / amber caging (§ decision C)

**Audit result (grep of the 3 screens):** green (`status-success-*`) and amber
(`status-warning-*`) appear ONLY on pass/warn/fail indicators and temperature classification
surfaces — e.g. hub "All checks on track" / "Alarms active" strips, mandatory-set dots;
process-room tick/cross checklist and the DB-band amber card; cold-storage amber/critical temp
states. **No green/amber is used on chrome** (headers, buttons, nav, banners) today. The 3
screens already COMPLY with the cage rule; no removal needed.

**Guardrail to add:** a written doc rule (in `CLAUDE.md` design section or a
`docs/design/*.md`): *"Green and amber are an app-invented functional extension, NOT brand
colours. They may appear ONLY on temperature reading tiles and pass/warn/fail badges — never
on chrome (headers, buttons, nav, banners)."*

**Lint test?** A static lint that reliably distinguishes "badge" from "chrome" is brittle
(both use the same `status-*` utilities; the difference is contextual/positional). Recommend
**doc rule + ANVIL visual check only — NO lint test** for caging. (Gate-2 decision D4 if Hakan
wants a best-effort guard anyway.)

> 🗣 In plain English: green and amber aren't brand colours; they're allowed only on the
> temperature readouts and pass/fail marks. The screens already follow this — I just want it
> written down so a future screen can't smuggle green onto a button. A machine check would be
> too unreliable to be worth it.

---

## 9. Test approach (scoped for ANVIL)

**TDD note:** this is a presentation/token change; there is no new business logic to test-drive
red-first. The "tests" are guardrails + regression + visual/contrast verification.

**Unit / lint (must be green):**
1. `semantic-tokens-only` — the NEW `ScreenHeader` + the `ghost-inverse` variant must pass
   (no raw hex / stock palette / `-mfs-*` in `components/ui/**`).
2. `reusable-visual-in-kit` — stays green (ScreenHeader is not an svg-rooted brand asset; the
   hub header stays inline and is not exported).
3. **NEW `tests/unit/lint/haccp-screens-token-pure.test.ts`** — assert `app/haccp/page.tsx`,
   `app/haccp/cold-storage/page.tsx`, `app/haccp/process-room/page.tsx` contain no raw hex /
   stock-palette / brand-primitive colour (reuse the `violations()` matchers from
   `semantic-tokens-only`). This is the ONLY machine guarantee behind acceptance criterion #6
   today — the existing `semantic-tokens-only` guard scopes `components/ui/**` and does NOT
   cover app screens. **Recommended addition (Gate-2 decision D3).**
4. Full existing unit suite green (no regression).

**Integration / pgTAP:** unaffected (no API/DB change) — run to confirm no regression.

**E2E — full browser-tap on the 3 screens in LIGHT theme** (Hakan wants exhaustive HACCP taps):
- Assert `document.documentElement` / the shell has **NO** `data-theme="dark"` on all 3 routes.
- **Hub:** login door → PIN → home; tap every daily tile + every records tile (navigation);
  open the per-tile SOP help sheet; **drive the alarm state** and assert the header flips to
  brand-red with legible inverse text and the "OVERDUE" pill + Banner render; push-permission
  banner path; sign-out.
- **cold-storage:** AM/PM segmented switch; open the NumberPad; enter pass / amber / critical
  readings; trigger the corrective-action modal; quick-ref + handbook overlays; back button.
- **process-room:** temp card + 3-phase diary (tick/cross, issues-note gate, CCA-on-deviation);
  quick-ref + handbook; back button.
- Regression tap-through of ≥1 non-HACCP token-based danger surface in light (e.g. a delete/
  error confirmation) to prove the global red repaint looks right elsewhere (see R1).

**WCAG-AA contrast checks (ANVIL):** every new text/surface pairing —
- `--mfs-red-700` text on `--mfs-red-100` soft (error/deviation text on soft) — the primary
  risk pairing;
- `text-inverse` (white) on `bg-surface-inverse` (navy) header;
- `text-inverse` on `bg-status-error-fill` (alarm-red hub header);
- `text-action-primary` (orange) eyebrow on navy;
- the `ghost-inverse` button outline/text on navy.

> 🗣 In plain English: the screens already can't hide a raw colour once the new little test is
> in. Then we tap through all three screens on the light theme — including forcing the overdue
> alarm on the hub — and a colour-contrast tool checks the new red-on-pale-red text and the
> white-on-navy bar are legible. We also poke one non-HACCP screen to confirm the app-wide red
> change didn't spoil it.

---

## 10. Risk Assessment (MANDATORY)

Severity scale: 🔴 high · 🟠 medium · 🟢 low. "Must-fix" = a Gate-2 blocker until resolved.

### Concurrency / race conditions
**No material risks in this category.** Pure CSS/TSX presentation; no shared mutable state,
no async ordering, no DB writes introduced. (ThemeLock's `useEffect` set/restore dance is
*removed*, which eliminates its documented "sole ownership of `<html data-theme>`" edge case.)

### Security
**No material risks in this category.** No auth, RLS, service-role, network, or input-handling
code is touched. No new dependency = no new supply-chain surface.

### Data migration
**No material risks in this category.** No schema, no migration file, no data transform.

### Business-logic flaws
- **R2 · Alarm-red header regression — 🔴 MUST-FIX.** The hub header's flip to red while checks
  are overdue is a safety-critical HACCP signal. The bold-navy re-skin (§7-F) rewrites exactly
  the element that carries this behaviour. If the conditional `alarm.isAlarming ? red : navy`
  logic or the `text-inverse` legibility is broken, operators could miss overdue food-safety
  checks. **Mitigation:** preserve the exact conditional; E2E MUST drive the alarming state and
  assert header colour + "OVERDUE" pill + Banner; ANVIL AA-checks white-on-red. **Blocks Gate 2
  until the plan's §7-F requirement (preserve alarm flip) is explicitly carried into the build.**
- **R3 · Push-permission / "alarms active" banners — 🟢 low.** Same header/banner region; ensure
  the re-skin doesn't hide the `push.permission === 'default'` prompt or the success strip.
  Mitigation: E2E covers both banner paths. Not a blocker.

### Launch blockers
- **R1 · App-wide red blast radius — 🟠 medium (must-VERIFY, not must-fix).** The token remap is
  global to the light theme: EVERY token-based light screen (dispatch, orders, cash, complaints,
  admin, etc.) repaints its `danger`/`error` surfaces crimson → brand red. This is the intended
  brand-wide red, but it is a wider visual change than "3 screens". **Mitigation:** run the FULL
  existing suite (unit/integration/pgTAP/E2E) + a visual spot-check of at least one non-HACCP
  danger surface in light. If any non-HACCP danger surface fails AA on the new red, that becomes
  a must-fix. Not a Gate-2 blocker by itself, but must be called out to Hakan.
- **R4 · AA contrast of `--mfs-red-700` as text on `--mfs-red-100` — 🟠 medium.** The whole
  red-text-on-red-soft pairing hinges on the deepened red clearing AA (~4.5:1 normal text). If
  `#a8210a` falls short, deepen it further. **Mitigation:** ANVIL contrast gate; implementer
  finalises the exact tint. Contained (one primitive value).
- **R5 · `ghost-inverse` / inverse-back contrast on navy — 🟢 low.** White-outline button + white
  back glyph on navy is high-contrast by construction; ANVIL confirms. Watch the hover overlay
  stays token-derived (not stock `white`) to satisfy `semantic-tokens-only`.
- **R6 · Stale `--mfs-danger-rgb` crimson channels — 🟢 low.** If not updated (§6.3), any future
  `bg-mfs-danger/<alpha>` util renders crimson. No current usage on the 3 screens; low impact.

**Must-fix summary for the conductor:** **R2 (alarm-red header must survive the hub re-skin)** is
the single must-fix and is a **Gate-2 blocker** until the build commits to preserving it (E2E on
the alarming state). R1 and R4 are must-VERIFY (regression + AA), surfaced for Hakan but not
plan-blocking.

> 🗣 In plain English: nothing here can corrupt data or open a security hole. The one thing that
> could genuinely hurt is breaking the alarm screen's turn-red behaviour — that's a food-safety
> signal, so it's a hard must-fix and the tests must force the alarm on. Two things to double-
> check rather than block on: the new red now shows across the whole app (so glance at other
> screens), and the darker red text must stay readable on the pale-red panels.

---

## 11. Hexagonal verdict (for Gate 2)

- **Port used/added:** NONE. This change is entirely in the presentation ring (CSS tokens +
  shared kit components + 3 screens). No business operation crosses a vendor/DB/network seam.
- **Adapter implementing it:** NONE.
- **New dependencies:** NONE. No `package.json` entry added → no justification/wrapping needed.
- **Kit-only rule:** RESPECTED — the reusable bold header is defined in `components/ui/` and
  consumed from the barrel; kit files use semantic tokens only.
- **Rip-out test:** **N/A** — there is no vendor to replace. (Vacuously PASS.)
- **Inner-layer import breach:** none introduced.

**VERDICT: PASS.** No architecture Gate-2 blocker. The only Gate-2 blocker is the must-fix
business-logic risk **R2** (alarm-red header preservation).

> 🗣 In plain English: architecturally this is clean — no vendors, no plumbing, nothing to
> swap out, and the reusable header lands in the kit where the rules require. The only thing
> holding the gate is making sure we don't break the alarm screen.

---

## 12. Decisions to take to Hakan at Gate 2

- **D1 — Hub scope:** ship the hub bold-navy header in THIS unit, or split it into a second
  FORGE unit (tokens + dark-removal + the two CCP back-bars first)? Recommend split if we want
  the lowest-risk first ship. *(Ties to must-fix R2.)*
- **D2 — Maroon header variant:** build `tone='maroon'` now (needs a new `--surface-inverse-
  maroon` token) or DEFER until a screen actually needs it? Recommend DEFER (YAGNI — don't build
  the second plug before a socket needs it).
- **D3 — Screen token-purity test:** add the new `haccp-screens-token-pure.test.ts` (recommended
  — it's the only real guarantee behind acceptance criterion #6)? Recommend YES.
- **D4 — Green/amber lint:** doc-rule only (recommended), or also attempt a best-effort caging
  lint (brittle)? Recommend doc-rule only.
- **D5 — Confirm** the app-wide red repaint (R1) is acceptable — i.e. non-HACCP light screens
  switching crimson → brand red is desired, not a surprise.

> 🗣 In plain English: five yes/no calls — mainly (1) do the risky alarm-screen header now or
> next, (2) don't build the maroon bar until we need it, (3) add the little screen-purity test,
> (4) keep the green/amber rule as a written note not a flaky check, and (5) confirm you're
> happy the new red shows up on every screen, not just these three.
```
