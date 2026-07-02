# Guard review — PR #111 `feat/colour-pairing-unit2` (colour-pairing system · Unit 2)

**Date:** 2026-07-01 · **Reviewer:** code-critic (FORGE Guard) · **Verdict:** **NO BLOCKERS — hand to ANVIL**, with 5 🟡 routed back to Render as a fix pass.
**Diff:** 9 commits vs main; tokens.css · tailwind.config.ts · components/ui (14 files) · app/haccp/page.tsx · tests (2 new suites + pins + E2E spec 31).
**Spec:** docs/plans/2026-07-01-colour-pairing-system-unit2.md · **Plan:** …-EXECUTION.md

## Hard criteria (verified by reviewer, not from PR body)
- **(a) Alarm brain byte-identical — PASS.** `git diff main...feat/colour-pairing-unit2 -- hooks/useHACCPAlarm.ts lib/haccp-alarm-status.ts` empty.
- **(b) No new alarm signal — PASS.** `fireAlarm()` call sites unchanged (banner tap `app/haccp/page.tsx:442` + hook interval); repaint only swaps which `data-surface` the same `alarm.isAlarming` boolean selects.
- **(c) Green/amber caging — PASS.** Zero added lines reference success/warning/green/amber; new chrome is navy + alarm red only.
- **(d) Boundaries — PASS.** No new packages; forbidden paths untouched; imports via `@/components/ui` barrel (ADR-0014).

## Test/lint runs (executed by reviewer)
`npx vitest run` 239 files, **3188/3188** · `npx tsc --noEmit` clean · `next lint` clean · E2E deferred to ANVIL.

## 🔴 Blockers — none

## 🟡 Warnings (→ Render fix pass)
1. **`app/haccp/page.tsx:398-405` — orange Admin button on the red alarm surface.** Fill-vs-surface 1.54:1; spec §4 red-600 row marks orange ✗✕. Plan reasoned only about the navy state. Fix: render Admin `ghost-inverse` while `alarm.isAlarming` (one ternary).
2. **`components/ui/ScreenHeader.tsx:68` — lost `<header>` landmark.** Kit renders a `<div>`; hub (both states) + LoginDoor now have no banner landmark (also why E2E spec 31 targets a div). Fix in kit (`<header>` or `as` prop); every HACCP screen regains it; E2E selector can return to `header[data-surface=…]`.
3. **`app/haccp/page.tsx:17` — dead `MfsIcon` import + undocumented brand-mark removal** from both hub headers (side-effect of adopting kit ScreenHeader, which has no logo slot). Mechanical part: remove import. Decision part: escalated to Hakan (restore via kit logo slot vs accept, consistent with cold-storage/process-room).
4. **`tests/unit/design/contrast-pairings.test.ts:56-81` — hex ground truth is a copy, not a check.** Layer-2's 22 constants mirror tokens.css but nothing pins them to the live declarations; a future token nudge keeps both layers green while real contrast breaks. Fix: assert each Tier-1 constant equals its live tokens.css value (file already parses tokens.css for layer 1).
5. **`tests/unit/lint/tailwind-namespace-collision.test.ts:66-77` — collision ban has a side door.** Compares fontSize keys vs `extend.textColor` only; keys under `extend.colors` also generate `text-*` utilities and would recreate F-TD-40 unguarded. Fix: add fontSize-vs-flattened-`extend.colors` comparison.

## 🔵 Notes
6. `tokens.css:127-133` — `--surface-accent-fg` has no `:root` default (only inside the 4 context blocks); declare orange-600 default so out-of-context use fails safe.
7. `border-strong` borderColor utility now has zero call sites (the 3 survivors are `bg-border-strong`, different namespace, correctly preserved) yet stays in the contract at a known-failing 1.8:1 — document decorative-only or drop from the borderColor contract.
8. `[data-surface="bold-maroon"]` reserved with no consumer — spec §5.9 explicitly pre-drills it; noted, not blocked.
9. `app/dev/ui/GalleryFrame.tsx:45` — lost the inert-era 15px from `text-body`; dev gallery only, eyeball at ANVIL.
10. `Checkbox.tsx:77` / `Toggle.tsx:43` — reuse `--action-secondary-fg` as white tick/knob on orange fill (legal at icon bar, 3.3); works but misleading vocabulary — comment or dedicated icon-fg token.

## Depth verdicts
- `ScreenHeader` `surface` prop → **DEEP** (one prop hides fill/context/accent/transition; both values consumed today; deletion test passes).
- tokens.css surface-context blocks → **DEEP** (small declarative surface, big behaviour: black-on-navy unrepresentable) — with the #8 maroon reservation.
- New test suites → real guards (WCAG maths verified correct: sRGB linearisation, 0.03928 threshold, 0.05 offsets, 21:1 sanity pin; negative fixtures genuinely below bars — spot-recomputed white-on-red-600 5.01, orange-on-cream 2.7), subject to #4/#5 strengthening.
- **No PASS-THROUGH or SPECULATIVE SEAM introduced.**

## Micro-decisions audit (all four verified at commit level)
(i) six §7 tokens into `bcc228d` — sound (no consumer at that commit; keeps token-resolve guard green). (ii) `text-on-action` migrations + grep guard together in `c17b726` — tree-consistent; dark-block orphan carve-out separately pinned. (iii) div selector — works, but is the symptom of #2. (iv) PIN-dot→`border-input` correct; Picker-unchanged justified; "3 not 9" honest counting (`bg-border-strong` namespace).

## Additional reviewer verification
All 51 surviving bare `text-body` sites are colour-intent (each has an explicit size class or is size-irrelevant); `extend.borderColor`/`textColor` merge preserves inherited fallbacks (`border-status-*`, `text-status-*-text` compile); portal-rendered Modal/Picker content resolves `:root` light values outside contexts; `data-surface` beats inherited `[data-theme="dark"]` by proximity + stylesheet-order tiebreak.

## Commit hygiene
Genuine red-green vertical slices: `36f7511`→`bcc228d`, `cd7dd13`→`e227e09`, `3ea84de`→`5033446`. No AI references found in code/commits/PR body.

## Routing
🟡 #1–#5 + mechanical part of #3 + cheap 🔵 #6/#7/#10 → Render fix pass (same branch/PR). #3 decision part → Hakan. #9 + judgment eyeballs (dormant-dot on white neutral card; OVERDUE pill position; logo absence; green/amber caging) → ANVIL browser-tap list.
