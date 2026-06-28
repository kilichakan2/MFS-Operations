# Code-critic review — UI Phase 0a (design-system foundation)

- **Date:** 2026-06-28
- **Branch:** `feat/ui-phase-0a-foundation` (9 commits `b43142a`→`ca8a4ea`, base `worktree-ui-system-rebuild`)
- **Phase:** FORGE Guard
- **Verdict:** ✅ **NO BLOCKERS — hand to ANVIL**

## Observed results (reviewer ran them, did not trust the report)
- Unit lane: **2710/2710 pass** (186 files) — `vitest run --project unit`
- Component lane (jsdom): **4/4 pass** — real render + click + keyboard-Enter + axe
- New guards: token-resolve **7/7**, semantic-tokens-only **2/2**, vendor-fence **3/3**
- `tsc --noEmit`: exit 0, clean
- AI references: none in commits or diff

## Highest-value risk verifications
- **R2 — build-safety colour inventory (PASS).** Independently grepped every colour/shadow/radius/font utility used across `app/` + `components/` and cross-checked each against the new `tailwind.config.ts`. Every `mfs-*` utility in use resolves; no `mfs-neutral-600/800` gaps. `slate-*` utilities resolve via Tailwind's default palette (`theme.extend` preserves it). No dynamically-constructed `bg-mfs-${...}` classes that could evade the content scan.
- **R1 — alpha/opacity modifiers (PASS).** The 4 in-use modifiers (`bg-mfs-navy/50`, `text-mfs-navy/40`, `bg-mfs-danger/10`, `border-mfs-danger/30`) are all in channel form `rgb(var(--…-rgb) / <alpha-value>)` with correct channel values: `--mfs-navy-rgb: 22 32 91` (#16205B), `--mfs-danger-rgb: 200 16 46` (#c8102e scarlet-600).
- **R3 — token fidelity (PASS).** `app/tokens.css` reproduces `docs/design/phase0a-foundation-tokens.reference.css` verbatim for every primitive/semantic/dark/compact value (diff-confirmed). Only deviations are the 3 documented ones (font vars → next/font; legacy alias block; two `-rgb` channel companions). No drifted hexes.

## Hexagonal / architecture contract
- No `lib/adapters/**` import added in `app/**` or `components/**`.
- `radix-ui` correctly allow-listed in `tests/unit/lint/vendor-fence-complete.test.ts:52`, justified by ADR-0009 (presentation library, same class as recharts/lucide). Imported by **zero** components in 0a.
- No writes to `lib/ports|adapters|wiring/**`, `middleware.ts`, `app/api/**`, auth/RLS, `.github/**`, migrations — verified clean.
- All 5 new deps justified in ADR-0009 (radix-ui runtime; jsdom/RTL/user-event/@testing-library/dom/vitest-axe test-only, exempt like fake-indexeddb).
- Depth rubric: no domain modules/ports/services introduced — out of scope for DEEP/SHALLOW/PASS-THROUGH; no speculative seam.

## 🟢 Test-quality notes
- `tests/unit/lint/semantic-tokens-only.test.ts:90` — strong guard with a proven-negative (`bg-blue-500`, `#abc`, `bg-mfs-navy` all trip; clean sample doesn't). Scoped to `components/ui/**`, pins the rule for 0b.
- `tests/component/throwaway.test.tsx` — genuinely behavioural (render + real click + keyboard Enter + axe through public DOM).
- Oracle deletion justified — `tokens-css.test.ts`/`tokens-tailwind.test.ts` asserted retired pre-rebuild values (Plus Jakarta, GTF Adieu @font-face, old hexes); superseded by `token-resolve.test.ts`. Pinned a superseded design, not lost behaviour.

## 🟡 / 🔵 Non-blocking follow-ups
- **(suggestion) `tests/unit/tokens/token-resolve.test.ts:34`** — `LEGACY_COLOR_NAMES` is a hand-maintained list (copied from plan §5), not derived from a live content-grep. Guards the known names well; a future screen using a legacy name absent from the array would slip past this test (Tailwind silently drops it). Reviewer hand-verified current usage is fully covered. Consider deriving the inventory from a content scan so the guard self-updates. → tracked as a 0b/Phase-1 hardening item.
- **(🔵 informational)** Legacy `mfs-*` utility names are re-pointed at the NEW brand tokens, so the **48 existing un-migrated screens visually adopt the new palette immediately at 0a** (e.g. `mfs-success` #16A34A → green-600 #2f7d52). By design (the whole point of the rebuild) — ANVIL's visual sweep must expect this and not flag it as a regression.
- **(🔵 informational)** jsdom emits a benign `HTMLCanvasElement.getContext() not implemented` warning during the axe run. Harmless.

## Ship-readiness
NO BLOCKERS — clean foundation, fully within the presentation layer, all guards green and proven-negative, hexagonal contract intact. ANVIL should confirm the intentional legacy-screen colour shift during any visual sweep.
