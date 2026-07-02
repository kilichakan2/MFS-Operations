# EXECUTION PLAN — Global colour-pairing system (light refresh · Unit 2)

**Date:** 2026-07-01 · **Spec:** `docs/plans/2026-07-01-colour-pairing-system-unit2.md` (Gate-1 approved, §11 LOCKED)
**Planner:** forge-planner (FORGE Phase 2 — Order)
**Branch:** `feat/colour-pairing-system-unit2` off `main` → single PR → smoke.

```
DOMAIN (core logic — untouched this unit)
  ├─ (no port touched)  → presentation layer only
  ├─ tailwind.config.ts / app/tokens.css  ← the rule layer being built
  └─ components/ui/*    ← kit carries the rules to every screen
🗣 no sockets, no plugs — this unit rewires the paint shop, not the machinery
```

**🗣 In plain English:** this plan fixes a bug where half our colour "labels" were
silently doing nothing, then writes the brand's colour law into the token files and the
component kit so every screen obeys it automatically, then repaints the HACCP hub as the
first consumer — all without touching a single line of business logic, database, or auth.

---

## 0 · Evidence corrections to the spec/conductor brief (verified by compile probe + grep)

These change the shape of the work — each was verified against the real tree, not assumed:

1. **KDS does NOT consume `[data-theme="dark"]`.** `app/kds/page.tsx` is styled with stock
   Tailwind classes (`bg-slate-900`, `text-slate-400`) and zero semantic tokens. The
   `[data-theme="dark"]` block in `app/tokens.css` has exactly ONE consumer: the dev gallery
   (`app/dev/ui/GalleryFrame.tsx:43`). KDS regression scope = a spot-check, not a migration risk.
   **🗣 In plain English:** the kitchen screen paints itself with its own hard-coded colours —
   nothing we change here can reach it. We still glance at it on preview, but it is not wired
   to any of the switches we are flipping.
2. **Dispatch / orders / cash are NOT repainted by Phase 0.** The semantic text-colour classes
   exist only in `app/haccp/**` (4 files), `app/dev/ui/**` (gallery), `components/ui/**` (kit),
   and the kit is imported by exactly 9 app files (the HACCP screens, the gallery, and
   `app/login/page.tsx`; plus `components/AppHeader.tsx`). Legacy screens still use `mfs-*`
   Tier-1 classes — untouched. The regression sweep is therefore **HACCP + /login + gallery**,
   not app-wide.
   **🗣 In plain English:** the "expect diffs everywhere" warning was too pessimistic — the
   dormant labels are only written on the new-style screens, so only those screens wake up.
3. **`app/haccp/page.tsx` is ALREADY in the token-purity SCREENS list**
   (`tests/unit/lint/haccp-screens-token-pure.test.ts:35`). Spec §8's "add it" item is already
   satisfied — no edit needed; the guard simply must stay green through the repaint.
4. **NEW latent bug found (same disease, border namespace):** `border-default`,
   `border-strong`, `border-subtle` are ALSO inert. A Tailwind compile probe against the real
   config proves only `border-border` emits (the nested `colors.border` group prefixes the
   class). All 78 call sites (62 + 9 + 7) currently render Tailwind preflight's default border
   colour **gray-200 `#e5e7eb`** (cool grey), not the warm token `#d8d3c5`. Fixed in Phase 0
   with the same mechanism as the text fix. `bg-border` (6 sites, the divider hairlines) DOES
   work via `colors.border.DEFAULT` and must keep working.
   **🗣 In plain English:** the border colour labels were fake too — every card edge on the new
   screens has quietly been a slightly-wrong cool grey. Same root cause, same one-file fix,
   and the warm brand grey comes back everywhere at once.
5. **Compile-probe ground truth** (run 2026-07-01, `npx tailwindcss` against the real config):
   `text-muted`/`text-subtle`/`text-on-action`/`text-link` emit **nothing**; `text-body` emits
   **font-size only**; `text-inverse` emits colour (Unit-1 alias); `bg-inverse`/`border-inverse`
   emit the TEXT token (white) but have **0 call sites** — safe to kill outright.

---

## 1 · Goal

Close F-TD-40 (inert semantic colour utilities — text AND border namespaces), install the §4
pairing matrix as executable law (tokens + surface contexts + kit recipes + a contrast-regression
vitest), and repaint the `/haccp` hub (HomeScreen + LoginDoor) as the first full consumer —
preserving the alarm flip byte-for-byte at the logic level and proving it with a forced-alarm E2E.

**🗣 In plain English:** three jobs in one PR — (1) make the dormant colour switches live,
(2) write the "which colour may sit on which background" rulebook into code so CI rejects any
future violation, (3) give the HACCP home screen its navy anchor header while proving the
red food-safety panic light still flips exactly as before.

## 2 · Domain terms

- **Pairing** — an approved (background, foreground, role) triple from spec §4.
- **Surface context** — a `data-surface="…"` attribute that re-scopes the semantic CSS variables
  underneath it (`canvas` / `bold-navy` / `alarm` / `bold-maroon`), spec §5.9.
- **Load-bearing outline** — a border that is the only way to find the element (inputs, outline
  buttons) → must hit 3:1 (spec §5.4); decorative hairlines are exempt.
- **Alarm surface** — the hub header while `alarm.isAlarming` (the food-safety panic light).
**🗣 In plain English:** "pairing" = a legal colour combination; "surface context" = a zone of
the page that tells everything inside it which colour dialect to speak; "load-bearing" = a line
you must be able to see to use the control; "alarm surface" = the header going red when checks
are overdue.

## 3 · Compliance flags

- **HACCP-critical surface** — full ANVIL browser-tap depth on preview (project policy
  [[anvil-full-browser-taps]]); hub + cold-storage + process-room.
- **Alarm parity is the headline risk** — `hooks/useHACCPAlarm.ts` and
  `lib/haccp-alarm-status.ts` stay **BYTE-IDENTICAL** (verify: `git diff --stat main --`
  on those two paths must be empty). No new caller of `fireAlarm()` is introduced; the only
  render-side change is WHICH classes/attribute the `alarm.isAlarming` boolean toggles.
- Green/amber caging unchanged (visual check at ANVIL; no lint).
- No AI references in code/commits/PR. No new dependencies.
**🗣 In plain English:** the siren's brain is untouchable — we only re-dress the lamp it
switches on, and a robot test forces the lamp on and measures the actual painted colours.

## 4 · ADR conflicts

**None found.** ADR-0014 Rule 1/3 followed (every new visual pattern lands in
`components/ui/` + barrel before any screen uses it: ScreenHeader `surface` prop, StatusTile
neutral recipe, Button per-variant labels). ADR-0002 untouched (no layer crossing; this unit
never imports outside `app/**` + `components/**` + tests). The three token-purity/lint guards
are allies, not conflicts — the plan keeps them green and adds two more.

## 5 · The F-TD-40 fix — chosen design (planner decision, spec §7 delegated)

**Chosen: dedicated `textColor` / `borderColor` theme namespaces + rename the ONE colliding
fontSize key (`body` → `body-md`).** Rejected alternatives:

- *Move the whole type scale off `text-`* — ~101 mechanical renames for no real win: Tailwind's
  stock size utilities (`text-base` — 82 live sites, `text-sm`, `text-xl`) keep the `text-`
  prefix anyway, so "text- means colour only" is unattainable. Churn without payoff.
- *Let `text-body` emit BOTH size and colour* — provably breaks real code: `.text-body`'s
  font-size would beat `.text-h3` (stylesheet order) at e.g. `app/haccp/page.tsx:258`, and its
  colour would fight `text-on-action` at `:763`. Dead on arrival.
- *A custom Tailwind plugin* — same output as the `textColor` theme key with more machinery.

**🗣 In plain English:** Tailwind has a drawer meant specifically for text-colour labels
(`textColor`) and one for border-colour labels (`borderColor`) — the original code put the
colours in the general drawer inside a folder called "text", which mangled every label name.
We move them to the right drawers, and rename the single size label ("body") that would
otherwise share a name with a colour label.

**Mechanics (why this works):** entries in `theme.extend.textColor` generate ONLY `text-*`
utilities (killing the `bg-inverse` foot-gun class), and entries in `theme.extend.borderColor`
generate ONLY `border-*` utilities. Lower-case `default` is a legal key (only upper-case
`DEFAULT` is special), so `border-default` compiles exactly as the 62 call sites already spell it.

**Blast radius (counted):** `tailwind.config.ts` (1 file restructured) + **5 call-site edits**
(the only size-intent uses of bare `text-body`) + 0 edits for the 78 border sites (they start
working as spelled). The other ~50 bare `text-body` sites are colour-intent (each sits beside an
explicit size class or intentionally inherits size) — verified by grep; implementer re-audits
with the script in step 2.

## 6 · Exact files to change

| File | Phase | What |
|---|---|---|
| `tailwind.config.ts` | 0 | textColor/borderColor namespaces; delete `colors.text` + `colors.inverse`; fontSize `body`→`body-md`; add `action.*-fg` colour entries |
| `app/haccp/page.tsx` | 0, 2 | 4 size-intent `text-body`→`text-body-md` (lines 649, 747, 763, 771); Phase 2 hub repaint (both `HomeScreen` + `LoginDoor`) |
| `components/ui/EmptyState.tsx` | 0 | 1 size-intent `text-body`→`text-body-md` (line 25, first occurrence) |
| `tests/unit/lint/tailwind-namespace-collision.test.ts` | 0 | NEW — executable F-TD-40 invariant |
| `app/tokens.css` | 1 | token diff (§7 below) + surface-context blocks |
| `tests/unit/design/contrast-pairings.test.ts` | 1 | NEW — the §9.1 keystone contrast-regression vitest |
| `components/ui/Button.tsx` | 1 | variant→fg mapping (primary = ink-900 label — LOCKED (b)) |
| `components/ui/IconButton.tsx` | 1 | primary variant → `text-action-primary-fg` (line 40) |
| `components/ui/Toggle.tsx` | 1 | knob `bg-[var(--text-on-action)]` → `bg-[var(--action-secondary-fg)]` (line 43) |
| `components/ui/Checkbox.tsx` | 1 | tick `text-on-action` → `text-action-secondary-fg` (line 77) |
| `components/ui/SegmentedControl.tsx` | 1 | active segment `text-on-action` → `text-action-secondary-fg` (line 58) |
| `components/ui/NumberPad.tsx` | 1 | `active:text-on-action` → `active:text-action-primary-fg` (line 228); `text-on-action` → `text-action-primary-fg` (line 243) |
| `components/ui/StatusTile.tsx` | 1 | `neutral` state redesign (§5.8) |
| `components/ui/ScreenHeader.tsx` | 1 | `surface` prop (`'bold-navy' \| 'alarm'`), `data-surface` attr, context-driven accent |
| `components/ui/Banner.tsx` | 1 | declare `data-surface="canvas"` on the shell (soft fills are light surfaces) |
| `components/ui/TextField.tsx`, `Textarea.tsx`, `Select.tsx`, `Picker.tsx`, `Radio.tsx` | 1 | load-bearing field boundaries → `border-input` (§5.4) |
| `tests/e2e/31-haccp-hub-alarm-surface.spec.ts` | 2 | NEW — forced-alarm E2E, computed-style assertions |
| `docs/plans/BACKLOG.md` | 2 | close F-TD-40 (note the border-namespace extension of the bug) |

**Never touched:** `hooks/useHACCPAlarm.ts`, `lib/haccp-alarm-status.ts`, `app/haccp/hubModel.ts`
(logic), anything in `lib/ports|adapters|services|usecases|wiring`, middleware, auth, migrations,
`.github`, vercel config, the `[data-theme="dark"]` block in `tokens.css` (one orphaned
`--text-on-action` declaration may remain there — harmless, retired with KDS).
**🗣 In plain English:** the do-not-touch list is the point — the siren logic, the plumbing
layers, and the kitchen screen's dark skin all stay bit-for-bit as they are.

## 7 · Exact token diff (`app/tokens.css` — Phase 1)

In `:root` (Tier-2 semantic):

```css
/* CHANGED */
--text-link:  var(--mfs-orange-700);            /* was orange-600 — 3.9 on cream fails body bar; 5.0 passes */
--focus-ring: var(--mfs-orange-600);            /* was orange-500 — 2.7 on cream fails 3:1; 3.9 passes */
--focus-ring-shadow: rgba(196,80,15,.40);       /* was rgba(235,102,25,.40) — match ring (orange-600 #c4500f) */
--action-ghost-border: var(--mfs-navy-300);     /* was var(--border-strong) — 1.8 fails; 4.5/5.5 passes */
/* NEW */
--text-heading: var(--mfs-maroon-500);          /* LOCKED (a) — headings on cream = maroon voice */
--border-input: var(--mfs-ink-400);             /* #7c786e — load-bearing outlines 3.7/4.4 */
--action-primary-fg:   var(--mfs-ink-900);      /* LOCKED (b) — ink on orange 5.1 */
--action-secondary-fg: #ffffff;                 /* white on navy 15.1 */
--action-danger-fg:    #ffffff;                 /* white on red-600 5.0 */
--icon-default: var(--mfs-navy-700);            /* §5.6 — icons on cream default navy */
/* DELETED from :root */
--text-on-action                                /* deprecated → per-action -fg (spec §6) */
```

Appended AFTER the `[data-theme="dark"]` block (custom properties resolve per-element from the
nearest ancestor declaration, so these compose with the dark block without specificity fights —
a `data-surface` element inside a dark tree takes the context values, which is correct, and no
production dark consumer exists anyway):

```css
[data-surface="canvas"]{ /* explicit reset so a light card nested inside a bold surface recovers */
  --text-body:var(--mfs-ink-900); --text-muted:var(--mfs-ink-600); --text-subtle:#645f55;
  --text-heading:var(--mfs-maroon-500); --icon-default:var(--mfs-navy-700);
  --surface-accent-fg:var(--mfs-orange-600);
  --border-default:#d8d3c5; --border-subtle:#e6e2d6;
}
[data-surface="bold-navy"]{
  --text-body:#ffffff; --text-muted:rgba(237,234,225,.85); --text-subtle:rgba(237,234,225,.70);
  --text-heading:#ffffff; --icon-default:#ffffff;
  --surface-accent-fg:var(--mfs-orange-500);   /* orange on navy 4.6 — text-legal */
  --border-default:rgba(255,255,255,.22); --border-subtle:rgba(255,255,255,.12);
}
[data-surface="alarm"]{
  --text-body:#ffffff; --text-muted:rgba(255,255,255,.85); --text-subtle:rgba(255,255,255,.70);
  --text-heading:#ffffff; --icon-default:#ffffff;
  --surface-accent-fg:#ffffff;                 /* orange is brand-banned on red (§4) */
  --border-default:rgba(255,255,255,.30); --border-subtle:rgba(255,255,255,.18);
}
[data-surface="bold-maroon"]{ /* reserved (§5.9) */
  --text-body:#ffffff; --text-muted:rgba(237,234,225,.85); --text-subtle:rgba(237,234,225,.70);
  --text-heading:#ffffff; --icon-default:#ffffff;
  --surface-accent-fg:var(--mfs-orange-500);   /* orange on maroon 4.4 */
  --border-default:rgba(255,255,255,.22); --border-subtle:rgba(255,255,255,.12);
}
```

**🗣 In plain English:** the first block corrects five labels whose values failed the maths and
adds per-button-type label colours (an orange button now carries ink writing, navy and red
buttons carry white). The four `data-surface` blocks are the zone dialects: stamp `bold-navy`
on a header and every piece of "body text" inside it automatically turns white — writing
black-on-navy stops being a mistake you can make and becomes a thing the system cannot render.

## 8 · Numbered steps (TDD order — each step names its test first)

### Phase 0 — un-inert the semantic utilities (F-TD-40 proper fix)

**Step 1 — write the collision guard (RED).**
NEW `tests/unit/lint/tailwind-namespace-collision.test.ts`. Import the config
(`import config from '@/tailwind.config'`). Assert:
(a) `theme.extend.colors` has NO nested `text` group and NO top-level `inverse` key;
(b) `theme.extend.fontSize` has NO key that also exists in `theme.extend.textColor`
    (compare full key sets, not just today's names);
(c) `theme.extend.textColor` contains exactly `heading, body, muted, subtle, inverse, link, icon,
    on-action` (Phase 1 removes `on-action` and updates this list — the test pins the contract);
(d) `theme.extend.borderColor` contains `default, strong, subtle, input`;
(e) teeth: an inline fixture proves the collision detector fires on `{fontSize:{x},textColor:{x}}`.
Run `npm test` — MUST FAIL against the current config.
**🗣 In plain English:** first we write the tripwire that makes this whole class of bug —
a size label and a colour label sharing a name — impossible to reintroduce, and watch it
correctly catch today's broken layout before we fix it.

**Step 2 — restructure `tailwind.config.ts` (GREEN).**
- Delete the nested `colors.text = {...}` group (its only outputs were unused `text-text-*` /
  `bg-text-*` classes — 0 call sites) and the top-level `inverse: 'var(--text-inverse)'` alias
  with its comment block (kills `bg-inverse`/`border-inverse`, 0 call sites).
- Keep `colors.border` (feeds the 6 working `bg-border` divider sites); keep everything else.
- Add:
  ```ts
  textColor: {
    heading: 'var(--text-heading)',      // Phase 1 token; harmless before it exists
    body:    'var(--text-body)',
    muted:   'var(--text-muted)',
    subtle:  'var(--text-subtle)',
    inverse: 'var(--text-inverse)',
    link:    'var(--text-link)',
    icon:    'var(--icon-default)',
    'on-action': 'var(--text-on-action)', // Phase-0 bridge; REMOVED in step 6
  },
  borderColor: {
    default: 'var(--border-default)',
    strong:  'var(--border-strong)',
    subtle:  'var(--border-subtle)',
    input:   'var(--border-input)',      // Phase 1 token
  },
  ```
  (inside `theme.extend`; order `on-action` AFTER `body` so state-variant overrides like
  `active:text-on-action` win the cascade until they are migrated).
- In `fontSize`: rename key `'body'` → `'body-md'` (same tuple
  `['var(--text-body-size)', { lineHeight:'1.5', letterSpacing:'0' }]`). `body-lg`/`body-sm`
  and the rest stay — no colour name collides with them (guarded by step 1 forever).
Collision test now GREEN. Re-run the compile probe (scratchpad, same command as §0.5) and
confirm: `text-muted`→colour, `text-body`→colour ONLY, `text-body-md`→size,
`border-default`→colour, `bg-inverse`→nothing.

**Step 3 — fix the 5 size-intent call sites.**
`app/haccp/page.tsx:649` and `:747` (`"text-body font-semibold text-body"` → first token
becomes `text-body-md`); `:763` and `:771` (`font-semibold text-body` → `text-body-md` — these
elements take their colour from `text-on-action` / `text-action-ghost-fg`);
`components/ui/EmptyState.tsx:25` (same first-token rename). Then audit the remaining ~50 bare
sites: `grep -rnE '(^|[^-a-zA-Z])text-body([^-a-zA-Z]|$)' app components | grep -v text-body-`
— every survivor must be colour-intent (has its own size class or intentionally inherits size).
Full suite + `npx tsc --noEmit` green. **EYEBALL on dev server** (Unit-1 lesson): /haccp hub,
cold-storage, process-room, admin, /login, /dev/ui — muted/subtle text de-emphasises, avatar
initials go white-on-navy (the p12 misuse dies), borders warm up from gray-200 to `#d8d3c5`.
**🗣 In plain English:** five spots wrote "body" meaning the SIZE; we relabel those, then walk
every other use to confirm it meant the colour. Then we look at the real screens with human
eyes, because this is the step where the dormant paint switches all flip on.

### Phase 1 — pairing tokens, surface contexts, kit recipes, contrast law

**Step 4 — write the contrast-regression vitest (RED).**
NEW `tests/unit/design/contrast-pairings.test.ts` (picked up by the `unit` project's
`tests/unit/**/*.test.ts` include). Self-contained WCAG relative-luminance math (same formulas
as `tests/e2e/_theme.ts:41-54`; duplicate the ~15 pure lines rather than couple unit↔e2e trees).
Two layers:
- **Token-mapping layer:** read `app/tokens.css` (fs, like the other lint pins) and assert the
  `:root` declarations: `--text-link:var(--mfs-orange-700)`, `--focus-ring:var(--mfs-orange-600)`,
  `--border-input:var(--mfs-ink-400)`, `--action-ghost-border:var(--mfs-navy-300)`,
  `--action-primary-fg:var(--mfs-ink-900)`, `--action-secondary-fg:#ffffff`,
  `--action-danger-fg:#ffffff`, `--text-heading:var(--mfs-maroon-500)`, and that
  `--text-on-action` is ABSENT from `:root`.
- **Maths layer:** hard-coded fixtures `{ bg, fg, role, min, documented }` — assert
  `ratio >= min` AND `|ratio − documented| ≤ 0.2` (keeps the spec's numbers honest):

  | bg | fg | min | documented |
  |---|---|---|---|
  | cream `#EDEAE1` | ink-900 `#1E1E1E` | 4.5 | 13.9 |
  | cream | navy-700 `#16205B` | 4.5 | 12.5 |
  | cream | maroon-500 `#590129` | 4.5 | 11.9 |
  | cream | orange-700 `#a8440c` | 4.5 | 5.0 |
  | cream | red-700 `#a8210a` | 4.5 | 6.0 |
  | cream | ink-600 `#4a4a4a` | 4.5 | 7.4 |
  | cream | orange-600 `#c4500f` | 3.0 | 3.9 |
  | cream | ink-400 `#7c786e` | 3.0 | 3.7 |
  | cream | navy-300 `#5566a8` | 3.0 | 4.5 |
  | cream | red-600 `#d62a00` | 3.0 | 4.2 |
  | cream | sand-600 `#a27854` | 3.0 | 3.3 |
  | white `#ffffff` | orange-600 | 4.5 | 4.7 |
  | white | ink-400 | 3.0 | 4.4 |
  | white | navy-300 | 3.0 | 5.5 |
  | navy-700 | white | 4.5 | 15.1 |
  | navy-700 | cream | 4.5 | 12.5 |
  | navy-700 | orange-500 `#EB6619` | 4.5 | 4.6 |
  | navy-700 | red-500 `#FF3300` | 3.0 | 4.1 |
  | maroon-500 | white | 4.5 | 14.4 |
  | maroon-500 | cream | 4.5 | 11.9 |
  | maroon-500 | orange-500 | 3.0 | 4.4 |
  | maroon-500 | red-500 | 3.0 | 3.9 |
  | orange-500 | ink-900 | 4.5 | 5.1 |
  | orange-500 | white | 3.0 | 3.3 |
  | red-600 | white | 4.5 | 5.0 |
  | red-500 | white | 3.0 | 3.7 |
  | red-500 | cream | 3.0 | 3.0 |
  | sand-500 `#C0946F` | ink-900 | 4.5 | 6.1 |
  | red-100 `#ffe0d6` | red-700 | 4.5 | 5.8 |
  | green-100 `#e3f0e8` | green-700 `#1b5e3a` | 4.5 | 6.6 |
  | amber-100 `#f7ead0` | amber-700 `#8a5e08` | 4.5 | 4.8 |
  | navy-50 `#eaecf4` | navy-700 | 4.5 | 12.8 |
  | neutral-soft `#efece4` | ink-600 | 4.5 | 7.5 |

- **Negative fixtures (must fail the bar — proves the maths has teeth and pins the bans):**
  orange-500 on cream `< 3` (2.7 — why the focus ring moved), sand-500 on cream `< 3` (2.3),
  white on orange-500 `< 4.5` (3.3 — why the primary label is ink, LOCKED (b)),
  border-strong `#b9b2a0` on cream `< 3` (1.8 — why `--border-input` exists).
The mapping layer FAILS against current tokens. GREEN comes in step 5.
**🗣 In plain English:** the brand rulebook stops being a document and becomes a robot: it
recomputes every approved colour pair's legibility score on every CI run, and it also checks
the *illegal* pairs still score badly — so nobody can quietly nudge a hex and break the law.

**Step 5 — apply the token diff (GREEN).** Edit `app/tokens.css` exactly per §7. Contrast test
green. E2E `29-light-danger-brand-red` untouched and still green (it asserts red-family tokens
this diff does not move).

**Step 6 — kit recipe updates (component-level TDD: update/extend component tests where they
exist under `tests/component/`, else the lint pins + gallery eyeball are the guard).**
- `Button.tsx` `VARIANT_CLASSES`: primary → `text-action-primary-fg`, secondary →
  `text-action-secondary-fg`, danger → `text-action-danger-fg` (ghost/ghost-inverse unchanged —
  the ghost border upgrade arrived via the `--action-ghost-border` token).
- `IconButton.tsx:40`, `Checkbox.tsx:77`, `SegmentedControl.tsx:58`, `NumberPad.tsx:228,243`,
  `Toggle.tsx:43` per the table in §6 (each maps to the fg of the fill it sits on).
- Delete `'on-action'` from `textColor` in `tailwind.config.ts`; update the step-1 collision
  test's pinned key list; add to it a grep assertion that `text-on-action` and
  `var(--text-on-action)` appear NOWHERE in `app/**` + `components/**` (deprecation guard).
- `StatusTile.tsx` `TILE_TONE.neutral` → `{ shell: 'bg-surface-raised border-default',
  dot: 'bg-status-neutral-fill', line: 'text-muted', icon: 'text-icon' }` — white card,
  navy-700 icon, existing ink label (`text-body`, already on the label spans), ink-600 status
  line (§5.8). The 8px grey dot stays as the "dormant" signal (grey is demoted to
  inactive/disabled — a no-status dot qualifies; judgment call, flag at ANVIL eyeball).
- `ScreenHeader.tsx`: add `surface?: 'bold-navy' | 'alarm'` (default `'bold-navy'`); render
  `data-surface={surface}`, fill `bg-surface-inverse` for bold-navy / `bg-status-error-fill`
  for alarm, add `transition-colors duration-500`; title/back switch from `text-inverse` to
  `text-body` (context makes it white — the mechanism proving §5.9); eyebrow switches from
  `text-action-primary` to `text-[color:var(--surface-accent-fg)]` (orange on navy, white on
  alarm — orange is brand-banned on red).
- `Banner.tsx`: add `data-surface="canvas"` to the shell (soft fills are light surfaces; makes
  nested semantic text resolve light even when a Banner sits inside a bold context).
- Field boundaries (§5.4): in `TextField.tsx`, `Textarea.tsx`, `Select.tsx`, `Picker.tsx`
  (trigger), `Radio.tsx`/`Checkbox.tsx` (box outline) replace the boundary `border-default`/
  `border-strong` with `border-input`. Decorative hairlines (list separators, card edges)
  stay `border-default`/`border-subtle` — the implementer classifies each of the 9
  `border-strong` sites: control boundary → `border-input`; decorative → `border-default`.
- Heading voice (LOCKED (a)): hub `LoginDoor` prompt `app/haccp/page.tsx:732`
  `font-display text-h2 text-body` → `text-heading`. (Other screens adopt `text-heading` on
  their own overhaul turns — the token + utility are the global system change.)
- `semantic-tokens-only` + `reusable-visual-in-kit` + `haccp-screens-token-pure` stay green
  (new classes are all semantic; `text-[color:var(--surface-accent-fg)]` follows the existing
  ScreenHeader `color-mix` var precedent).
**🗣 In plain English:** each kit part learns its own colour recipe — the orange button now
writes in ink, the toggles/keypads/checkboxes get the right label for the fill they sit on,
the grey launcher tiles become white cards with navy icons, and input boxes get a visibly
darker outline. Screens using these parts inherit all of it without editing a single screen.

### Phase 2 — hub repaint + forced-alarm proof

**Step 7 — write the forced-alarm E2E (RED against the un-repainted hub).**
NEW `tests/e2e/31-haccp-hub-alarm-surface.spec.ts`, `@critical`, chromium project; reuse the
`kioskLogin` pattern from `30-haccp-hub-ui-phase1.spec.ts:61` and the `_theme.ts` probes.
- **Forced alarm:** BEFORE `page.goto`, intercept
  `page.route('**/api/haccp/today-status', …)` and fulfil a JSON payload with
  `cold_storage: { am_overdue: true }` (matches the `HACCPAlarmStatus` shape read by
  `useHACCPAlarm` → `getOverdueItems` → `isAlarming === true`; drives the REAL hook through its
  REAL input — zero alarm-code modification; audio stays silent without a gesture, which is
  fine, the assertion is visual). Assert: `header[data-surface="alarm"]` present; computed
  `background-color === rgb(214,42,0)` (red-600); computed `color` of the "Food Safety" title
  `=== rgb(255,255,255)`; `contrastRatio(fg,bg) ≥ 4.5` via the shared helper; the OVERDUE pill
  visible. **Computed styles, not class presence** (spec §5.10).
- **Calm counterpart:** fulfil an all-clear payload → `header[data-surface="bold-navy"]`,
  computed bg `rgb(22,32,91)` (navy-700), white title, no OVERDUE pill.
**🗣 In plain English:** the robot logs in, feeds the page a fake "cold store is overdue"
answer from the server, and then measures the actual pixels: is the header genuinely
alarm-red, is the writing genuinely white, is it genuinely readable. Then it does the
opposite to prove the calm navy state too.

**Step 8 — repaint the hub (GREEN).** `app/haccp/page.tsx`:
- `HomeScreen` header (lines 379-439) → kit `<ScreenHeader surface={alarm.isAlarming ? 'alarm'
  : 'bold-navy'} title="Food Safety" eyebrow="MFS Sheffield · S3 8DG · HACCP" actions={…}>`,
  preserving the OVERDUE pulse pill and moving Admin panel (→ `Button variant="primary"` —
  orange fill + ink label, legal on navy, passes the NAVY_ON_NAVY guard), Documents + Sign out
  (→ `IconButton`/`Button variant="ghost-inverse"`), and the avatar chip into the `actions`
  slot. Avatar circle `bg-action-primary` → label `text-action-primary-fg`; the chip's inner
  name/border resolve via the context automatically.
- `LoginDoor` header (lines 716-729) → `<ScreenHeader surface="bold-navy" …>` with the clock in
  `actions` (context turns it white).
- `StaffCard` avatars (line 642): `text-on-action` → per-fill fg
  (`isWh ? 'bg-action-primary text-action-primary-fg' : 'bg-action-secondary
  text-action-secondary-fg'`).
- Push-banner Enable button (line 463) → `text-action-primary-fg`.
- **Selector parity with spec 30 (must not break):** "Food Safety" text, `Select <name>` +
  `Digit N` + `Help for <label>` aria-labels, "Admin panel"/"Documents" accessible names,
  "Sign out" aria-label, tile labels, "Tap your name to sign in", footer button names.
- `haccp-screens-token-pure` stays green (no hex, no `variant="secondary"`/bare-`ghost` in the
  `actions` slot).
Run: new alarm E2E green; spec 30 green; specs 11/13/16/29 green (no assertion they make is
changed by this unit — verified during planning).

**Step 9 — full local verification + sweep.**
`npm test` (all unit incl. 3 new/changed) → `npx tsc --noEmit` → `npm run test:e2e:ui` →
alarm-parity byte check: `git diff main --stat -- hooks/useHACCPAlarm.ts
lib/haccp-alarm-status.ts` prints NOTHING. Eyeball sweep (dev + preview): hub calm, hub forced-
alarm (devtools request override or temporary route), login door, cold-storage, process-room,
haccp/admin, /login, /dev/ui gallery, KDS `/kds` (expect ZERO diff), one legacy screen
(e.g. /orders — expect ZERO diff). Update `docs/plans/BACKLOG.md`: F-TD-40 closed (+ border
namespace extension documented).
**🗣 In plain English:** every robot check plus a human walk through every screen that could
possibly have changed — including two screens that must NOT have changed, as the control group.

## 9 · Acceptance criteria (mirrors spec §10, made checkable)

- [ ] Compile probe: `text-body|muted|subtle|link|heading|icon` + `border-default|strong|subtle|input` all emit; `text-on-action`, `bg-inverse`, `border-inverse`, `text-text-*` emit nothing / have no call sites.
- [ ] Collision + contrast vitests green and running in the default `npm test` suite.
- [ ] Hub: navy ScreenHeader anchor on BOTH door and home; zero grey-wash neutral tiles; avatar initials never black-on-navy (white or ink per fill).
- [ ] Forced-alarm E2E green: computed white-on-red ≥ 4.5, context flips alarm↔bold-navy.
- [ ] `git diff main -- hooks/useHACCPAlarm.ts lib/haccp-alarm-status.ts` empty.
- [ ] Specs 11/13/13-p1/16/29/30 green UNMODIFIED (no rule they assert changed).
- [ ] Focus ring orange-600 visible on cream and white; inputs/outline buttons ≥ 3:1.
- [ ] Cold-storage + process-room eyeballed (kit inheritance: tiles, fields, buttons).
- [ ] KDS and one legacy screen pixel-unchanged (control group).
- [ ] No new `package.json` entries; no vendor imports outside `lib/adapters/**` in the diff.

## 10 · Risk Assessment

| # | Category | Risk | Severity | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| R1 | Business-logic / safety | The hub header IS the food-safety panic light; repaint could sever or invert the `alarm.isAlarming` → red-surface wiring | **HIGH** | Alarm hook + status lib byte-identical (git-diff gate, step 9); flip becomes a single `surface` prop ternary — same boolean, same source; forced-alarm E2E asserts COMPUTED white-on-red + the calm counterpart; no new `fireAlarm()` caller (grep: call sites remain banner-tap + interval only) | **YES — mitigation is mandatory in-plan (steps 7-9); with it, no residual blocker** |
| R2 | Regression blast | Un-inerting flips paints on screens nobody eyeballs | MED | Scope PROVEN by grep + compile probe (§0): haccp ×4, /login, gallery, kit — enumerated sweep list incl. two must-not-change control screens (KDS, /orders); ANVIL browser-tap depth on the HACCP trio | no |
| R3 | Business-logic (UI) | Two colour utilities on one element after un-inerting → cascade-order lottery (`text-on-action` + `text-body` at page.tsx:763) | MED | The 5 dual-intent sites edited in step 3; `on-action` fully retired in step 6 with a nowhere-in-tree grep guard; collision vitest prevents the class from recurring | no |
| R4 | Test brittleness | Existing e2e specs assert current colours/selectors | LOW | Planning-time read of 11/13/16/29/30: they assert token VALUES this unit doesn't move and SELECTORS step 8 preserves; rule: tests change only where the spec changed the rule — expected test-file diff = 2 new + 1 extended, 0 modified assertions | no |
| R5 | Concurrency / race | — | NONE | Presentation-only; no shared state, no async flows added (route-interception is test-side) | no |
| R6 | Security | — | NONE | No auth/RLS/middleware/API change; XSS surface unchanged (no `dangerouslySetInnerHTML`, no free-text rendering added) | no |
| R7 | Data migration | — | NONE | No DB objects touched; no migration files | no |
| R8 | Launch blocker | Vercel preview smoke needs `--unprotected` (F-INFRA-02) | LOW | Known project-wide condition, runbook followed at Gate 4; not unit-specific | no |

**Headline:** one HIGH risk (R1, alarm parity) — fully mitigated *inside* the plan by the
byte-identical gate + forced-alarm E2E; it is a Gate-2 talking point, not an open blocker.
**🗣 In plain English:** the only thing here that could hurt someone is the overdue-checks
siren — so the plan welds its brain shut, changes only the lampshade, and adds a robot that
trips the alarm on every future test run and measures the actual red pixels.

## 11 · Hexagonal verdict (Gate-2 input)

- **Port used/added:** none — the unit never crosses the service boundary; it touches
  `app/**`, `components/**`, `tailwind.config.ts`, `app/tokens.css`, tests only. The one API
  the hub calls (`/api/haccp/today-status`) is consumed unchanged.
- **Adapter:** none touched, none added.
- **New dependencies:** none (`package.json` untouched; the "plugin" question resolved with
  Tailwind's built-in `textColor`/`borderColor` theme keys — zero new machinery).
- **Rip-out test:** **PASS (unaffected)** — replacing any vendor tomorrow still costs one
  adapter + one wiring line; this diff adds no vendor knowledge anywhere.
**🗣 In plain English:** no new sockets, no new plugs, no new boxes bought — this whole unit
lives in the paint layer, so the "swap any vendor in one move" guarantee is exactly as strong
after the merge as before it.

## 12 · Single PR justification

One PR. Phase 0 alone would ship a half-state (white-on-orange primary labels at 3.3, failing
the very law Phase 1 installs) and Phase 2 is the proof-of-consumption for Phase 1's contexts —
splitting creates two review passes over the same files with an illegal intermediate on `main`.
Commits stay phase-ordered (0 → 1 → 2) so the reviewer can replay the TDD sequence.
**🗣 In plain English:** shipping the bug-fix without the new rulebook would briefly make main
break the brand law on purpose — so the three phases travel together, in labelled steps.
