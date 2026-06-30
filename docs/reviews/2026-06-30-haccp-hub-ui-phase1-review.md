# Code-critic review — HACCP hub UI Phase 1 rebuild

**Branch:** `feat/haccp-hub-ui-phase1` vs `main` (HEAD `2c723e3`) · **Date:** 2026-06-30 · **Phase:** FORGE Guard
**Verdict:** **NO BLOCKERS — hand to ANVIL.** (with the required F3 login E2E + HACCP exhaustive browser-tap matrix owed to ANVIL)

## Test / lint / type results
| Gate | Result |
|---|---|
| `tsc --noEmit` | clean (exit 0) |
| `eslint` (5 changed source files) | clean (exit 0) |
| `semantic-tokens-only` guard | 2/2 green |
| hubModel + alarm-exclusion + service + 3 component suites | 71/71 green |

## Safety-critical confirmations
- **Alarm parity — CONFIRMED 3 ways:** `lib/haccp-alarm-status.ts`, `hooks/useHACCPAlarm.ts`, `hooks/usePushNotifications.ts` are **byte-identical** (empty diff). `getOverdueItems` (`lib/haccp-alarm-status.ts:39`) has no `operational_overdue` field in its input shape — operational physically cannot enter the siren set. `tests/unit/haccp/alarm-excludes-operational.test.ts` pins the exclusion. Delta #4 is visual-only as specified.
- **Auth/login parity (F3) — CONFIRMED:** staff fetch `/api/auth/haccp-team`, `POST /api/auth/login` body `{name, credential}`, `mfs_haccp_session=1` cookie + `→/haccp`, wrong-PIN handling, and `mfs_role`/`mfs_name` home/door gating are all **identical** to `main`. Only presentation moved (full-screen `AuthKeypad` → `PinKeypad` in a centred `Modal`). ANVIL still owes the required live login E2E.
- **Progress calc (#3) — CORRECT:** `HaccpReportingService.ts:154-171` `total=8`, `done` over exactly the 8 distinct booleans (cold AM/PM, room AM/PM, diary opening/operational/closing, cleaning>0); no off-by-one, no double-count, response shape unchanged; no consumer keyed off literal `6`. Boundary tests cover 0/8, 1, cleaning, operational, 8/8.
- **Cross-layer consistency:** side-panel "X of 8" (`completed_checks`) and the F4 checklist (`hubModel.buildMandatorySet`) derive from the same raw booleans — cannot disagree.

## Depth verdicts (new/touched modules)
- `components/ui/StatusTile.tsx` → **DEEP** — intent-only interface hides 2 layouts, 5-state token map, tone wiring, stop-propagation help affordance; used 16×.
- `components/ui/ProgressRing.tsx` → **DEEP** — caller passes 0-100; ring owns clamp + conic-gradient-from-token + size map + centre label. Replaces the old `style={{width}}` leak.
- `components/ui/Banner.tsx` (`onClick` add) → sound additive enhancement, backward-compatible, mutually-exclusive with `onDismiss`.
- `app/haccp/hubModel.ts` → **DEEP / legitimate pure-logic extraction** — concentrates tile state machines, overdue-list builder, mandatory-8 set, SOP routing into deterministic pure functions. Deletion test: complexity concentrates here. Not a pass-through, not a speculative seam.
- Calc change stayed in the **service layer** (correct).
- **Hexagonal:** no new port, no new adapter, no new npm dep, no vendor import, no inward boundary breach. **Rip-out test PASS.**

## 🟡 Warnings (should fix, non-blocking)
- `components/ui/Banner.tsx:106-122` — on the `onClick` path the banner renders a plain `<button>` and **drops `role="alert"`** (the non-tappable danger path keeps it, `Banner.tsx:74`). The tappable overdue-alarm banner is no longer announced to screen readers. NOT a regression vs the old hand-rolled banner, and the alarm is still conveyed visually (red header + animated OVERDUE count) — but worth adding `role="alert"`/`aria-live` when `tone === 'danger'` on a safety surface. **→ FIXED in this branch (follow-up commit) before ANVIL.**

## 🔵 Architecture notes (follow-up, not blocking)
- `app/haccp/page.tsx:379-439` — header built **inline** (not via `AppHeader`, which hardcodes navy and can't express red-on-alarm). Built entirely from semantic tokens (zero hex/palette/inline-style verified) → token-compliant, not a hand-painted escape hatch. Deviation navy→`surface-raised`-turning-red preserves the red-alarm state. Future kit candidate: an alarm-capable header.
- `tests/unit/lint/semantic-tokens-only.test.ts:30` — the token guard scopes to `components/ui/**` only; it does NOT cover `app/haccp/page.tsx`. Page is clean today (grep-verified) but future edits could leak a raw colour without CI catching it. Consider widening to `app/haccp/**`. **→ logged BACKLOG.**
- `app/haccp/page.tsx` arbitrary Tailwind sizing literals (`text-[38px]`, `w-[326px]`, etc.) — layout not colour, not a token violation, borderline magic-number styling, harmless.
- `app/haccp/hubModel.ts:291` — `SOP_CONTENT.corrective_action` unused, carried verbatim from the live hub (also unused there). Pre-existing, harmless.
- `components/AuthKeypad.tsx` is NOT globally dead — still consumed by `app/login/page.tsx`. Leaving it is correct; the hub now uses `PinKeypad`.

## 🟢 Test quality
- Behaviour-through-public-interface; survives internal refactor. `hubModel.test.ts` asserts states/badges/lists; service tests inject `now` deterministically; alarm test pins the real `getOverdueItems` contract; 3 component suites assert semantic-token mapping + `axe` a11y. Strong, vertical-sliced.
- Minor gap: no test cross-checks UI `buildMandatorySet` "complete" count == service `completed_checks` for a **partial** fixture (all-8 covered). Low risk (same source booleans). **→ optional hardening, logged.**

## Delta-by-delta
1. Per-tile help — each tile → own key; 7 unauthored compliance tiles → neutral `SOP_PLACEHOLDER` (no invented text); People→People. ✅
2. "Online" dot dropped, no replacement. ✅
3. Honest 8. ✅
4. Operational surfaced (room tile + overdue list + mandatory set); alarm excluded. ✅
5. "Goods In" label only; route `/haccp/delivery` + table untouched. ✅
Gate-2: F1 admin→header button (admin-gated) · F2 `MfsLogo`+"Food Safety" · F3 migrated, logic preserved · F4 "Mandatory set · 8" present · F5 copy · i18n hardcoded EN — all honoured.
