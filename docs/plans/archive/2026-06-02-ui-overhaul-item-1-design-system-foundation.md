# UI Overhaul — Item 1: Design System Foundation

**Status:** READY TO BUILD (FORGE Frame escalated to human-locked spec; this is the Order phase output).
**Captured:** 2026-06-02
**Workflow flavour:** B (tooling — zero visible UI change).

---

## 1. Goal

Make the locked design tokens consumable by the codebase via Tailwind utilities and CSS variables, with zero visible UI change, as the foundation for UI overhaul items 2–7.

---

## 2. Source spec

The **truth** is the locked spec captured in the FORGE Order brief on 2026-06-02 (this file's calling prompt — human-authored after 6 grill corrections + 3 surgical corrections + final escalation). The plan below is a direct projection of that spec; nothing is added, abstracted, or "improved".

Wider context (read-only — do NOT modify):
- `docs/plans/2026-06-01-ui-overhaul-design-tokens.md` — Category 5 token catalogue (Appendix Section 8 = `design-tokens.json`).
- `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md` — Categories 1–4 locked decisions.
- `docs/plans/2026-06-01-ui-overhaul-execution-plan.md` — Item 1's place in the 7-item sequence (this PR is Item 1).

---

## 3. Branch

`feat/ui-overhaul-01-design-tokens`

Cut from `main` (currently at `f884196`).

---

## 4. Files to change — exactly 4

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `tailwind.config.ts` | Populate the empty `theme.extend` with colors, fontFamily, fontSize, maxWidth, borderRadius, boxShadow, transitionDuration, transitionTimingFunction. Existing structure (`content`, `plugins`) untouched. |
| MODIFY | `app/globals.css` | Add `@font-face` for GTF Adieu, extend `:root` with the full token CSS-var set, add `@media (min-width: 768px)` responsive type overrides. **Preserve every existing rule.** |
| CREATE | `tests/unit/design-system/tokens-tailwind.test.ts` | Import the Tailwind config and assert one token per namespace + assert non-extension of spacing/fontWeight/zIndex. |
| CREATE | `tests/unit/design-system/tokens-css.test.ts` | `fs.readFileSync` `app/globals.css`, regex-assert one CSS var per namespace + preservation of existing rules + responsive block + @font-face. |

**Do NOT touch any other file.** No pages, no components, no `app/layout.tsx`, no docs.

---

## 5. Existing-state ground truth (verified before writing this plan)

`tailwind.config.ts` current shape:

```ts
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
}
```

`theme.extend` is currently `{}`. Item 1 fills it. Nothing else in the file changes.

`app/globals.css` current rules that MUST be preserved verbatim:

- `@tailwind base; @tailwind components; @tailwind utilities;` (lines 1–3)
- The existing `:root` block with `--mfs-navy / --mfs-orange / --mfs-maroon / --mfs-sand / --mfs-neutral / --mfs-black` (lines 6–13). The new token vars in §6.2 may *duplicate* `--mfs-navy`, `--mfs-orange`, `--mfs-maroon`, `--mfs-sand`, `--mfs-black` (same values) — that is fine and intentional. `--mfs-neutral: #EDEAE1` MUST remain because `body { background-color: var(--mfs-neutral) }` depends on it.
- `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');` (line 16) — Plus Jakarta + Inter both stay.
- `* { -webkit-tap-highlight-color: transparent; }` (line 19)
- `body { overscroll-behavior … font-family: 'Inter' … color: var(--mfs-black) }` (lines 21–26)
- `h1, h2, h3, .font-display { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }` (lines 29–32) — `.font-display` class stays mapped to Plus Jakarta.

Vitest config (`vitest.config.ts`):
- `environment: 'node'` — no jsdom, no DOM globals. Tests must be node-pure.
- `include: ['tests/unit/**/*.test.ts']` — the new test files at `tests/unit/design-system/*.test.ts` will be picked up automatically.
- Alias `@` → repo root.

Stack confirmation: Tailwind `^3.3.0`, Vitest `^4.1.2`. Node-env. No new deps needed.

---

## 6. Exact content to write

### 6.1 `tailwind.config.ts`

Replace `theme: { extend: {} }` with `theme: { extend: { … } }` populated with **only** these eight keys, values verbatim from the locked spec:

- `colors` — 28 entries (`mfs-navy` through `mfs-kds-accent`)
- `fontFamily` — `mfs-display`, `mfs-body`, `mfs-mono`
- `fontSize` — `display`, `h1`, `h2`, `h3`, `body-lg`, `body`, `body-sm`, `caption`, `mono` (each is `[var(--…-size), { lineHeight, letterSpacing }]`)
- `maxWidth` — `mfs-sm`, `mfs-md`, `mfs-lg`, `mfs-xl`, `mfs-2xl`, `mfs-full`
- `borderRadius` — `mfs-sm`, `mfs-md`, `mfs-lg`, `mfs-pill`
- `boxShadow` — `mfs-0` through `mfs-4`
- `transitionDuration` — `instant`, `fast`, `medium`, `slow`
- `transitionTimingFunction` — `standard`, `accelerate`, `decelerate`

**DO NOT add** `spacing`, `fontWeight`, `zIndex`, `screens`, or anything else. Tailwind defaults stand untouched.

### 6.2 `app/globals.css`

Append (do not replace) the following blocks in order. **Preserve every existing line above.**

1. `@font-face { font-family: 'GTF Adieu'; … src: url('/fonts/gtf-adieu/GTFAdieu-Regular.woff2') format('woff2'); }` — with the TODO comment about license-pending fallback to Inter via the `font-mfs-display` stack.
2. A **new** `:root` block (additive — it sits alongside the existing one; CSS coalesces them) holding the full token catalogue: brand colors, functional palette, neutral scale, KDS dark theme, spacing scale, container widths, radii, shadows, motion durations, motion easings, font weights, and the type ramp (mobile defaults). Type-ramp vars are **unprefixed** (e.g. `--text-display-size`) because the Tailwind `fontSize` map references them directly.
3. `@media (min-width: 768px) { :root { --text-display-size: 40px; --text-h1-size: 28px; --text-h2-size: 22px; --text-h3-size: 18px; --text-body-lg-size: 17px; --text-body-size: 15px; } }` — exactly 6 overrides.

All values verbatim from the locked spec. No additions.

### 6.3 `tests/unit/design-system/tokens-tailwind.test.ts`

Node-pure. Imports `tailwind.config.ts` via the `@/tailwind.config` alias (or relative path `../../../tailwind.config`). Asserts:

| Assertion | Expected |
|-----------|----------|
| `colors['mfs-navy']` | `'#16205B'` |
| `colors['mfs-orange']` | `'#EB6619'` |
| `colors['mfs-success']` | `'#16A34A'` |
| `colors['mfs-neutral-500']` | `'#5C5648'` |
| `colors['mfs-kds-bg']` | `'#0F172A'` |
| `fontFamily['mfs-display']` | Array containing `'GTF Adieu'` |
| `fontFamily['mfs-body']` | Array containing `'Inter'` |
| `fontSize['display']` | Tuple; first element is a `var(--…)` string |
| `maxWidth['mfs-2xl']` | `'1440px'` |
| `borderRadius['mfs-md']` | `'8px'` |
| `boxShadow['mfs-2']` | `'0 2px 8px rgba(22, 32, 91, 0.08)'` |
| `transitionDuration['fast']` | `'150ms'` |
| `transitionTimingFunction['standard']` | `'cubic-bezier(0.4, 0, 0.2, 1)'` |
| `theme.extend.spacing` | `undefined` |
| `theme.extend.fontWeight` | `undefined` |
| `theme.extend.zIndex` | `undefined` |

No other assertions. No new dependencies.

### 6.4 `tests/unit/design-system/tokens-css.test.ts`

Node-pure. Reads `app/globals.css` via `fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')`. Regex-asserts:

Token presence (one per namespace):
- `/--mfs-navy:\s*#16205B/`
- `/--mfs-orange:\s*#EB6619/`
- `/--mfs-success:\s*#16A34A/`
- `/--mfs-neutral-500:\s*#5C5648/`
- `/--mfs-kds-bg:\s*#0F172A/`
- `/--mfs-space-4:\s*16px/`
- `/--mfs-container-2xl:\s*1440px/`
- `/--mfs-radius-md:\s*8px/`
- `/--mfs-shadow-2:\s*0 1px 2px rgba\(22, 32, 91, 0\.05\)|--mfs-shadow-2:\s*0 2px 8px rgba\(22, 32, 91, 0\.08\)/`
- `/--mfs-duration-fast:\s*150ms/`
- `/--mfs-ease-standard:\s*cubic-bezier/`
- `/--text-display-size:\s*32px/`

Existing-rule preservation:
- `/--mfs-neutral:\s*#EDEAE1/` (body background dependency)
- `/Plus Jakarta/i` (existing `@import` retained)

Structural blocks:
- `/@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[\s\S]*?--text-display-size:\s*40px[\s\S]*?\}/`
- `/@font-face\s*\{[\s\S]*?GTF Adieu[\s\S]*?\}/`

No other assertions.

---

## 7. Build sequence — TDD red → green → refactor

Five atomic commits. The test suite stays at **≥1129 passing** throughout (existing tests untouched; new tests pass once their corresponding source change lands in the same commit).

### Step 1 — Branch + scaffold test dir (chore)
- [ ] 1.1 `git checkout -b feat/ui-overhaul-01-design-tokens`
- [ ] 1.2 `mkdir -p tests/unit/design-system`
- **Commit:** `chore(design-system): scaffold design-system test directory`
- **Test state:** unchanged (no new test files yet); ≥1129 green.

### Step 2 — RED → GREEN: Tailwind config tokens
- [ ] 2.1 Create `tests/unit/design-system/tokens-tailwind.test.ts` with all assertions from §6.3. Run `npx vitest run tests/unit/design-system/tokens-tailwind.test.ts` — **expect RED** (every assertion fails because `theme.extend` is `{}`).
- [ ] 2.2 Modify `tailwind.config.ts` per §6.1 — populate `theme.extend` with the eight keys exactly as the locked spec dictates. Do NOT touch `content` or `plugins`.
- [ ] 2.3 Run `npx vitest run tests/unit/design-system/tokens-tailwind.test.ts` — **expect GREEN**.
- [ ] 2.4 Run `npx tsc --noEmit` — must be clean.
- **Commit:** `feat(design-system): extend tailwind theme with mfs design tokens`
- **Test state:** new test green; existing tests still ≥1129 green.

### Step 3 — RED → GREEN: globals.css CSS variables + @font-face + responsive block
- [ ] 3.1 Create `tests/unit/design-system/tokens-css.test.ts` with all assertions from §6.4. Run `npx vitest run tests/unit/design-system/tokens-css.test.ts` — **expect RED** for the new-token / @font-face / @media assertions; **expect GREEN already** for the `--mfs-neutral` and `Plus Jakarta` preservation assertions (those rules already exist).
- [ ] 3.2 Modify `app/globals.css` per §6.2:
  - Append `@font-face` for GTF Adieu (with license-pending TODO comment, src points at `/fonts/gtf-adieu/GTFAdieu-Regular.woff2`).
  - Append a **new** `:root { … }` block with every CSS var listed in the locked spec.
  - Append `@media (min-width: 768px) { :root { … } }` with the 6 type-size overrides.
  - **Do NOT remove, reorder, or modify any existing rule.** The existing `:root` (6 brand vars including `--mfs-neutral`), the `@import` for Plus Jakarta + Inter, the `*` tap-highlight rule, the `body` rule, and the `h1, h2, h3, .font-display` rule all stay verbatim.
- [ ] 3.3 Run `npx vitest run tests/unit/design-system/tokens-css.test.ts` — **expect GREEN**.
- [ ] 3.4 Run `npx tsc --noEmit` — must be clean.
- **Commit:** `feat(design-system): add mfs token css variables and responsive type ramp`

### Step 4 — Full suite green
- [ ] 4.1 Run `npm run test` — entire suite must pass; count must remain ≥1129.
- [ ] 4.2 Run `npx tsc --noEmit` — clean.
- [ ] 4.3 Run `npm run lint` — clean (no new lint errors introduced).
- **No commit** unless a previously-untracked formatting fix is needed; in that case `chore(design-system): lint`.

### Step 5 — Manual smoke (the two acceptance "sanity checks")
- [ ] 5.1 `npm run dev`. Open any existing page (e.g. `/orders`). Confirm **NO visible change** vs `main`. Background still cream `#EDEAE1`, headings still Plus Jakarta, body still Inter. Nothing should look different — this is tooling only.
- [ ] 5.2 In DevTools console on a running page:
  - `getComputedStyle(document.documentElement).getPropertyValue('--mfs-orange').trim()` → must equal `'#EB6619'`.
  - Add `<div className="bg-mfs-navy text-mfs-soft-neutral p-4">test</div>` temporarily (or just visually inspect via the React DevTools "edit-in-place" trick) — should render with navy background + cream text. **Revert any inspection-only edits before commit.**
- [ ] 5.3 Open PR via `gh pr create` against `main`. Title: `feat(ui-overhaul): item 1 — design-system foundation (tokens only, no UI change)`.

---

## 8. Test plan

Two new test files. No existing test changes. No new dependencies.

### `tests/unit/design-system/tokens-tailwind.test.ts`
- Imports the Tailwind config file (default export). Uses string equality / `Array.includes` / `typeof` checks.
- 13 token-value assertions + 3 non-extension assertions (§6.3).
- Runs in node env. No DOM. Vitest picks it up automatically via the `tests/unit/**/*.test.ts` glob.

### `tests/unit/design-system/tokens-css.test.ts`
- Reads `app/globals.css` via `fs.readFileSync`. Uses `RegExp.prototype.test`.
- 12 token regex assertions + 2 preservation assertions + 2 structural-block assertions (§6.4).
- Runs in node env. No DOM. Auto-picked-up.

**Coverage layer:** L1 unit only. No L2 (no DB), no L3 (no API routes), no L4 (no UI).

---

## 9. Acceptance criteria (verbatim from locked spec)

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test` — all existing tests still green (≥1129)
- [ ] Both new design-system tests green
- [ ] `npm run dev` — opens cleanly, **NO visible change** vs current main
- [ ] Sanity check: `<div className="bg-mfs-navy text-mfs-soft-neutral">` renders with navy bg + cream text
- [ ] Sanity check: `getComputedStyle(document.documentElement).getPropertyValue('--mfs-orange').trim() === '#EB6619'`

---

## 10. Out of scope — DO NOT (verbatim from locked spec)

- DO NOT change any existing UI
- DO NOT touch any page or component files
- DO NOT touch `app/layout.tsx`
- DO NOT refactor any existing tailwind classes in code
- DO NOT remove anything from `globals.css` (preserve Plus Jakarta `@import`, `--mfs-neutral` var, `.font-display` class, all existing rules)
- DO NOT add new dependencies (no jsdom, no @testing-library/react)
- DO NOT add `zIndex` tokens
- DO NOT add `fontWeight` extension
- DO NOT add `spacing` extension
- DO NOT add tests beyond the two listed
- DO NOT add new docs (the `design-tokens.md` already exists; do not create more)

---

## 11. Risks & open questions

- **GTF Adieu license pending.** The `@font-face` references `/public/fonts/gtf-adieu/GTFAdieu-Regular.woff2`, which does not exist yet. Per the locked spec, this is **intentional** — the font stack falls back to Inter via `font-mfs-display`. Browsers will log a 404 for the missing woff2 in the network tab; this is expected and documented inside the TODO comment in `globals.css`. **Not a blocker.**
- **Duplicate `--mfs-navy` / `--mfs-orange` / `--mfs-maroon` / `--mfs-sand` / `--mfs-black` vars** between the existing `:root` (lines 6–13) and the new token `:root`. CSS coalesces multiple `:root` blocks and the values are identical, so this is a no-op at runtime but worth knowing if a future cleanup pass dedupes them.
- **Tailwind v3.3 + arbitrary-value font-size tuples with `var(…)`**: supported since 3.0. No risk on this stack.
- **If `tailwind.config.ts` somehow gets a different existing shape than verified in §5**, STOP and report. Do not improvise.

---

## 12. Rollback

`git checkout main && git branch -D feat/ui-overhaul-01-design-tokens` (pre-merge) or `git revert <merge-sha>` (post-merge). Zero data impact, zero migration impact — this PR only touches config + CSS + new test files.

---

## 13. Handoff

Plan written: `docs/plans/2026-06-02-ui-overhaul-item-1-design-system-foundation.md`

Next: FORGE Gate 2 (plan approval). On approval, implementer executes Steps 1–5 above.
