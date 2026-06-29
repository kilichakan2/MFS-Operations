# Guard Review — PR #94 · UI Phase 0b · Wave 1 (Forms)

**Date:** 2026-06-29 · **Reviewer:** code-critic (FORGE Guard) · **Branch:** feat/ui-0b-wave1-forms · **Base:** main
**Verdict: SHIP — no blockers. Handed to ANVIL.**

Presentation-only wave: 11 new form components in `components/ui/` + `index.ts` barrel, a dev-only `/dev/ui`
gallery, 11 jsdom component tests, 1 density-vars token guard. **27 files, 2684 insertions, 0 modifications**
vs the true merge-base `0f0f4cc`. Hexagonal rip-out test N/A (no port/adapter/vendor seam introduced).

## Rule-by-rule (6 non-negotiables) — ALL PASS

| # | Rule | Result | Evidence |
|---|------|--------|----------|
| 1 | Additive only — zero existing-file edits | ✅ PASS | diff vs merge-base `0f0f4cc` = 27 files, 0 modified/deleted. AuthKeypad/BottomSheetSelector/primitives.tsx untouched. |
| 2 | Presentation layer only | ✅ PASS | All paths under components/ui, app/dev/ui, tests. No `lib/adapters`/`@supabase`/`@/lib` imports; no middleware/api/.github/auth/RLS. |
| 3 | Semantic tokens only | ✅ PASS | No hex/rgb()/font-family in new files. `font-display`/`font-text` are Tailwind→var(--font-*) aliases. `semantic-tokens-only.test.ts` globs `components/ui/**` (verified non-vacuous) and is GREEN. |
| 4 | No new dependency | ✅ PASS | package.json + lockfile not in diff. Radix pre-existing (ADR-0009). Icons = caller ReactNode props; no icon lib. |
| 5 | No AI references | ✅ PASS | grep across code/comments/12 commit msgs for claude/AI/co-authored/openai/anthropic = none. |
| 6 | Gallery production-gating | ✅ PASS | `app/dev/ui/page.tsx:13` `if (NODE_ENV==='production') notFound()`. Not linked from any nav. |

**Diff red-herring noted:** a naive `git diff --diff-filter=MDR main` shows 2 doc files as modified — that's
because `main` advanced by `82f2cc5` (added the Wave-1 plan + roadmap gate) after the branch was cut, not
this branch's doing. Against merge-base `0f0f4cc` the branch is purely additive. Optional pre-merge rebase
would make the PR diff read clean; changes nothing functionally.

## Tests / type / lint (run by the critic, not trusted from implementer)
- Affected-area suite (tests/component/ui + density-vars + semantic-tokens-only + token-resolve): **92/92 passing, 14/14 files** (2.15s).
- `tsc --noEmit`: clean (exit 0).
- `next lint`: No ESLint warnings or errors.
- Benign jsdom noise only (HTMLCanvasElement getContext from axe internals).

## Depth verdicts
- **FormField — DEEP.** Small interface; hides useId + cloneElement ARIA-id injection (id/aria-describedby/aria-invalid/role=alert).
- **PinKeypad — DEEP.** Hides auto-submit timer, ref double-fire guard, error pulse, physical-keyboard fallback, vibrate, reset.
- **Picker — DEEP.** Wraps Radix Dialog + owns two-pass fuzzy search + empty state + footer action.
- **Button/IconButton — DEEP-ish.** Variant/size token maps, loading→aria-busy+click-block, ≥44px tap floor.
- **Select/Checkbox/Radio/Toggle — justified thin Radix wrappers (🔵).** Add token layer + stable owned interface; sanctioned a11y choice (ADR-0009), not a speculative seam.
- **TextField/Textarea — DEEP-ish.** Affix layout, controlled/uncontrolled counter, error-border + aria-invalid forwarding.
- No PASS-THROUGH or SPECULATIVE SEAM introduced. No depth blocker.

## 🟢 Good
- `FormField.tsx:45-51` preserves caller-supplied `id` (`children.props.id ?? controlId`); only forces aria-invalid when error set. Pinned by `FormField.test.tsx:68`.
- `PinKeypad.tsx:151-204` ref-not-state double-submit guard (`submittingRef`); `PinKeypad.test.tsx:25` asserts onComplete fires exactly once (catches the race if guard removed).
- `IconButton.tsx:9,12` requires `aria-label` at the type level — a11y by construction.
- Checkbox/Radio/Toggle tests assert the Radix a11y contract (aria-checked="mixed", roving focus, role="switch"), not just render.
- ARIA labels parametrised via optional `labels` props defaulting to English — resolves the bilingual-SR flag without forcing i18n into primitives.

## 🔵 Nice-to-have (non-blocking follow-ups)
- `IconButton.tsx:36-39` — `danger` variant hover bg == base bg → no visible hover change. Cosmetic.
- `PinKeypad.tsx:187-194` — physical-keyboard listener bound to `window` (matches AuthKeypad). If multiple keypads mount (gallery = up to 4 panels), a keystroke fills all. Fine for real screens (one at a time); expected in the gallery visual smoke.
- A few tests use `expect(screen.getByText(...)).toBeDefined()` — getBy* already throws; `.toBeDefined()` is redundant. Prefer `toBeInTheDocument()`.

## 🟡 / 🔴 — None.

## For ANVIL
Right-sizing pre-justified (plan §9): **component (jsdom) lane + 1 static token guard only** — no E2E/
integration/pgTAP/migration/PITR (no DB/API/auth). One manual add: **visual smoke at `/dev/ui`** across the
four theme×density panels (multi-keypad keystroke mirroring is expected, not a defect).
