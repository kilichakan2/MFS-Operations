# Code Review — Light Design-System Refresh · Unit 1 (PR #110)

**Date:** 2026-07-01
**Branch:** `feat/light-design-refresh-unit1` → `main`
**Reviewer:** code-critic (FORGE Guard phase)
**Verdict:** ✅ **SHIP-READY — no blockers.** Hand to ANVIL.

## Scope
Skin-only LIGHT-theme colour-token refresh. Repoint error/danger/deviation/overdue/sync-stuck
onto brand red `#FF3300` family; remove HACCP dark opt-in; add kit `ScreenHeader` (bold navy) +
`ghost-inverse` button variant; swap cold-storage + process-room headers; add token-purity guard;
green/amber caging rule in CLAUDE.md. No DB, no vendor, no new dependency.

## Test & lint (verified by reviewer, not taken on trust)
- `vitest --project unit` → **200 files, 2879 passing**.
- `vitest tests/unit/lint/` → **127 passing** (incl. new `haccp-screens-token-pure.test.ts`).
- New guard in isolation → **4/4** (incl. "not vacuously true" fixture).
- `tsc --noEmit` → clean. `next lint` → clean.
- Integration / pgTAP / E2E → NOT RUN (need Docker+Supabase) → ANVIL's job.

## Findings (all 🔵 follow-up / 🟢 note — none blocking)

**1. Brand pairing — PASS.** `cold-storage/page.tsx:511-526` & `process-room/page.tsx:704-719`:
both header buttons flipped `secondary`(navy) → `ghost-inverse`. `ScreenHeader.tsx` = navy bg +
white title + orange eyebrow + white chevron — all readable on navy. Focus ring inherited (orange).

**2. Red remap — COMPLETE, no leak.** `tokens.css:42,47,50,58,91`: all semantic red mappings +
`--mfs-danger-rgb` (→`214 42 0`) repointed to `--mfs-red-*`. Only surviving `--scarlet-*` uses are
the primitive defs + the **dark** block's `--action-danger` — so keeping scarlet is correct, not
dead code. Implementer correctly updated `--mfs-danger-rgb` (else low-opacity danger = scarlet while
solid = brand red → two reds).

**3. ThemeLock deletion — SAFE.** No live import remains (only a prose comment in `layout.tsx:8`).
No other route/overlay relied on HACCP forcing `data-theme="dark"` on the document root; portals now
inherit the light default with no shim. Only other `data-theme` writer = dev gallery.

**4. Token-purity guard — HAS TEETH.** `haccp-screens-token-pure.test.ts:151-176`: red-green fixtures
prove each matcher fires on real violations (raw hex, stock palette, `-mfs-*` primitive,
`data-theme="dark"`, `variant="secondary"`) and passes on `ghost-inverse`.

**5. `ghost-inverse` variant — CORRECT.** `Button.tsx:47-51` / `IconButton.tsx:32-38` byte-identical.
`color-mix` hover is token-derived; disabled `opacity-50`; focus ring inherited. 🟢 No `active:` state
— but sibling `ghost` also omits it (consistent within family).

**6. Blast radius — GLOBAL (intended).** Red remap lives in light `:root` → changes danger/error/
deviation/overdue/sync-stuck on EVERY light screen (complaints, dispatch, pricing, delivery), not
just HACCP. Scarlet `#c8102e` → brand red `#d62a00`. 🔵 ANVIL: eyeball one non-HACCP danger surface.
🔵 `--status-deviation-*` and `--status-error-*` now resolve to identical values (per spec — single
brand red for every wrong state); intended, not a regression.

## Depth verdicts
- `ScreenHeader.tsx` → **DEEP ✅** (small interface hides brand pairing + a11y back button; 2 callers; not a pass-through/speculative seam).
- `ghost-inverse` → N/A (variant branch, not a module).
- token-purity guard → **DEEP ✅** for a guard (real teeth).

## Architecture — PASS
No new dependency; no `app/**`/`components/**` → `lib/adapters/**` import; kit-only rule respected
(header in `components/ui/` + barrel-exported `index.ts:126-127`); rip-out test N/A.

## 🟢 Optional follow-ups (non-blocking)
- Guard's `SCREENS` is a hardcoded 3-file list — `/haccp/delivery` (queued) won't be guarded until added; consider globbing `app/haccp/**/page.tsx` later.
- `NAVY_ON_NAVY` blacklists `secondary`/bare-`ghost` but doesn't whitelist — a `neutral`/`danger` button in a ScreenHeader slot would pass yet may be off-brand on navy (no such case today).
- `tokens.css:44,50` — `#f3b6a6` reused inline for 4 red borders/disabled; could become a `--mfs-red-200` primitive later.

## ANVIL focus (handoff)
1. **Both HACCP screen BODIES now render light** (diff shows header swap only, but the whole screen flips dark→light) — full browser-tap visual pass on the prod-build preview.
2. **One non-HACCP danger surface** (delete button / error banner / overdue badge) — confirm the global red hue shift reads well + AA.
3. Standard integration/pgTAP(N/A)/E2E ladder.

---

## Delta re-review (fix commits) — 2026-07-01

**Trigger:** ANVIL caught `text-inverse` as an inert Tailwind class → dark text on the navy header/alarm-red banner. Fix commits `07abce6` (config alias) + `36d2c91` (E2E committed).

**Verdict: ✅ SHIP-READY — no blockers.**

- **Config fix** (`tailwind.config.ts:87`): added top-level `colors.inverse: 'var(--text-inverse)'` → compiles `text-inverse` (+ unused `bg-inverse`/`border-inverse`). Collision-free (distinct from `surface.inverse`→`bg-surface-inverse` and `text.inverse`→`text-text-inverse`).
- **Independent audit of all 12 `text-inverse` usages:** every one renders on a dark/coloured surface (navy `bg-surface-inverse` header/sidebar/nav, or red `bg-status-error-fill` hub alarm gated on `isAlarming`). **Zero on a light surface → no white-on-white.** ghost-inverse only used inside `ScreenHeader` actions (navy), lint-guarded.
- **KDS dark not regressed:** fix changes whether the utility compiles, not token values; under `[data-theme="dark"]` `--text-inverse`=ink-900 → correct dark ink on light inverse surface.
- **Hub alarm:** white text only appears while the bar is red (gated) — no light-state leak.
- **Committed E2E** (`_theme.ts`, specs 13/16/29): legitimate live-DOM colour probes with a real WCAG contrast impl + negative guards asserting retired scarlet/pink are absent — not rubber-stamps.
- **Suite:** unit 2879/2879, lint 127/127 (incl. token-purity 4/4), tsc clean, next lint clean.

🔵 Follow-up (non-blocking): `bg-inverse`/`border-inverse` now compile to the *text* token (unused today); consider not emitting them later.
