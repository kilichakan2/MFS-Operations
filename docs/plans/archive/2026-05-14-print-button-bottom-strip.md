# Print Button Bottom-Strip Pattern
**Created:** 2026-05-14
**Scope:** Task 1 of four follow-up tasks. Tasks 2-4 (PWA icon mismatch, Sunmi silent printing for mince/prep, V3 mobile formatting overhaul) are out of scope and will be separate plans.

## Goal
Replace the small inline print buttons on delivery and mince rows with full-width 48px-tall buttons in a bottom strip on every card. Every print-capable card must show the same `[100mm] [58mm]` pair, same colours, same dimensions — visual consistency across the app. WCAG AAA tap-target floor (44px) cleared with margin.

## Why this plan exists
Staff print labels primarily from the **collapsed** row view (cards aren't usually expanded). Current button sizes:

| Location | Padding | Font | Approx height | Issue |
|---|---|---|---|---|
| Delivery row (collapsed) | `px-2 py-1` | `text-[10px]` | ~22px | Smaller than a fingernail; mis-taps frequent |
| Delivery detail header (expanded) | `px-2.5 py-1.5` | `text-[10px]` | ~26px | Same problem when row is open |
| Mince row (collapsed) | `px-2.5 py-1` | `text-[10px]` | ~22px | Single "Print" button — also too small, and inconsistent (one button vs delivery's two) |

WCAG 2.5.5 AAA recommends 44 CSS px minimum; current sizes are roughly half that. On a 5″ V3 held with a gloved hand the buttons are barely identifiable, never mind hittable.

## Design decision: bottom-strip pattern (Option D)
Rather than enlarge buttons inline (which forces them to fight every other element in the row's right column — time, status badge, chevron), give every print-capable card a dedicated 48px strip at the bottom, divider above, two buttons 50/50 width. Same component reused in three places.

```
┌──────────────────────────────────────────────┐
│ [LAMB] [Mon 12] [#234] Supplier        14:32 │  ← top metadata row (with category badge moved here)
│ Lean lamb shoulder                    [Pass] │
│ GI-1205-LAMB-001                         ›  │
│ Slaughter: GB4456  Born: GB · Reared: IE     │
│ ─────────────────────────────────────────── │  ← border-t separator
│  [   🖨  100mm   ]  [   🖨  58mm   ]        │  ← print strip
└──────────────────────────────────────────────┘
```

**Tap target:** 48px × ~150px = ~7200 px² vs current ~880 px². ~8× the area.

## Mince row flow change (consequence of C1 "two buttons everywhere")
Mince currently has ONE "Print" button on the row that opens a modal where staff pick `[use-by-date × size]` from a 10-button grid. To match the rule "every print section has 100mm + 58mm", the row gets two buttons, and the modal collapses to a single column of 5 use-by-date buttons (size is already chosen on the row, so the modal asks one question instead of two).

New mince flow:
1. Tap `[100mm]` or `[58mm]` on a mince row → modal opens
2. Modal title shows the chosen size ("Print 100mm label" or "Print 58mm label")
3. Modal shows 5 use-by-date options (Fresh 7/10/14 days, Frozen 3/6 months)
4. Tap one → label prints in the pre-selected size, modal closes

State change: `printTarget` gains a `width: '100mm' | '58mm'` field. Modal reads this and skips the size grid.

## Files to change
| File | Change |
|---|---|
| `components/PrintLabelStrip.tsx` | **New.** Shared component, 48px bottom strip with 100mm + 58mm buttons. Props: `on100mm: () => void`, `on58mm: () => void`. Includes `border-t` divider, full-width container, `onPointerDown` with `stopPropagation` + `preventDefault` to avoid the parent card's expand behaviour |
| `app/haccp/delivery/page.tsx` | (a) Collapsed row: remove old inline button pair in right column; add `<PrintLabelStrip>` below the card body. (b) Open detail header: remove old inline button pair next to batch number; add `<PrintLabelStrip>` below the batch reference block. (c) Move category badge from row 2 (inline before product) to row 1 (alongside date/delivery-number badges) |
| `app/haccp/mince/page.tsx` | (a) Row: replace single "Print" button with `<PrintLabelStrip>`. (b) `printTarget` state: add `width: '100mm' \| '58mm'` field. (c) Modal: collapse 10-button grid to single column of 5 use-by-date options; modal title reflects chosen size |
| `tests/unit/printStrip.test.tsx` *(if testable)* OR no new tests | See test plan below |

## Steps

Vertical slices. Each ends with green tests + clean commit.

- [x] **1. Create `components/PrintLabelStrip.tsx`** as a pure presentation component. No business logic, no fetch, no state — just renders two buttons with the agreed sizing, calls the prop callbacks on tap. Default export. TypeScript-strict props.
- [x] **2. Replace delivery COLLAPSED row buttons with `<PrintLabelStrip>`.** Remove the existing button pair from lines ~1686-1718. Add `<PrintLabelStrip>` at the bottom of the row card (after the `flex items-start justify-between` block closes). Wire `on100mm` to `printLabelInApp(...)` with `width=100mm`, `on58mm` to `handlePrint58(d)`. Verify `stopPropagation` keeps the card's expand-on-tap behaviour from triggering when buttons are tapped.
- [x] **3. Move category badge in delivery row** from row 2 (`<span>` inline before product name) to row 1 (alongside date/delivery-number badges). Row 2 becomes pure product description.
- [x] **4. Replace delivery OPEN DETAIL header buttons with `<PrintLabelStrip>`.** Remove buttons from lines ~764-789. Restructure batch reference block: batch number on its own line, `<PrintLabelStrip>` below as a separate strip.
- [x] **5. Run `npm run test`** — expect 989/989 passing (no logic change, JSX shape only).
- [x] **6. Run `npx tsc --noEmit`** — clean on touched files.
- [x] **7. Commit `refactor(haccp): bottom-strip print buttons on delivery`** — Phase 1 of the work. Delivery alone is shippable; mince is a separate concern.
- [x] **8. Replace mince ROW button** with `<PrintLabelStrip>`. `on100mm` and `on58mm` callbacks call `setPrintTarget({ id, batchCode, outputMode, width: '100mm' })` or `'58mm'` respectively.
- [x] **9. Update `printTarget` state shape** to include `width: '100mm' | '58mm'`. TypeScript will catch every read site; fix each.
- [x] **10. Collapse the mince print modal** to a single-column 5-button use-by-date selector. Each button uses the width from `printTarget.width`. Modal title becomes "Print {width} label" so the user knows what they selected. Cancel button stays.
- [x] **11. Run `npm run test`** — expect 989/989 still passing.
- [x] **12. Run `npx tsc --noEmit`** — clean on `app/haccp/mince/page.tsx`.
- [x] **13. Commit `refactor(haccp): bottom-strip print buttons on mince + simplified modal`** — Phase 2.
- [x] **14. Tick all done steps in plan, commit, code-critic, push.**

## Test plan

**Unit tests** — minimal new tests, because the change is JSX shape, not behaviour:
- `<PrintLabelStrip>` is a pure presentation component. The only meaningful behaviour to test is "tapping the 100mm button calls `on100mm`, tapping 58mm calls `on58mm`" — which would test that JSX handlers wire up correctly. That's testing the framework, not our code. **No new tests.**
- The `formatBornLine` / `formatTempStatus` / etc. helpers already tested in `labelPrinting.test.ts` are unchanged.

**Existing tests** — must stay green:
- `npm run test` — 989/989 passing as before.

**Manual smoke (Phase 1 — delivery):**
- iPad / browser: open Goods In, tap a collapsed delivery row's `[100mm]` → label prints via iframe → card does NOT expand. Tap row body itself → card expands.
- iPad / browser: in the expanded detail view, tap the new bottom-strip `[100mm]` → label prints. Tap `[58mm]` → label prints.
- V3 (silent path): tap collapsed row `[58mm]` → label prints silently on V3 thermal, card does NOT expand. `[100mm]` falls through to iframe AirPrint (as today).
- Category badge: appears on row 1 alongside date/number, NOT on row 2.

**Manual smoke (Phase 2 — mince):**
- iPad / browser: tap `[100mm]` on a mince row → modal opens, title says "Print 100mm label", shows 5 use-by-date buttons. Tap "Fresh 14 days" → label prints at 100mm with 14-day use-by.
- Same with `[58mm]` — modal title says "Print 58mm label", same 5 options, prints at 58mm.
- Cancel button still closes modal without printing.

## Acceptance criteria
- [ ] `npm run test` shows 989 passing (unchanged).
- [ ] `npx tsc --noEmit` shows no new errors in `app/haccp/delivery/page.tsx`, `app/haccp/mince/page.tsx`, `components/PrintLabelStrip.tsx`.
- [ ] Eslint clean on touched files.
- [ ] No regressions on iPad — both pages render and print as before.
- [ ] All 6 button locations (2 in delivery row, 2 in delivery detail, 2 on mince row + 5 in modal — wait, 6 locations counts the 100/58 pairs as one each = 4 PrintLabelStrip instances + 1 mince modal) use the unified strip pattern.
- [ ] Tap targets measure ≥44px tall on actual device (visual check on V3).
- [ ] V3 silent print path still works for delivery 58mm.

## Compliance
**NO** — pure UI layout change. No HACCP form, training document version, temperature limit, label content, batch code format, or legislation reference is touched. The same labels print to the same printers via the same code paths; only the JSX that triggers the print is changing.

`docs/DOCUMENT_CONTROL.md` is NOT updated.

## ADR conflicts
**None.** ADR-0001 (Sunmi JavaScript interface) is untouched — `handlePrint58` and the bridge it calls are unchanged. We're only changing the JSX wrappers around those calls.

## Risks and open questions
- **Component extraction earns its keep:** `<PrintLabelStrip>` is used in three places (delivery row, delivery detail header, mince row). Deletion test passes — without it, identical 48px+icon+border-t markup gets duplicated 3×. Genuine reusable component.
- **Mince row's modal flow change is a real UX shift,** not just styling. Staff who learned the old "tap Print → see grid → pick" flow have to learn "tap size → pick use-by-date". Mitigation: modal title clearly states the size chosen, and the simpler single-column layout is faster to scan. If feedback comes back negative, revert is one commit.
- **Mince 58mm path on V3** still uses iframe (`printLabelInApp`), not silent Sunmi. Task 3 (separate plan) will add `printMinceSunmi()` using the existing `MFSSunmiPrint` bridge. Until then, 58mm mince on V3 = AirPrint-like dialog. Acceptable — same behaviour as today, just with a bigger button.
- **`onPointerDown` vs `onClick`:** All current print buttons use `onPointerDown` with `e.preventDefault()`. The `<PrintLabelStrip>` must do the same — `onClick` lags ~300ms on touchscreens and on V3 specifically the event-fire timing is critical for the bridge to receive the call without iframe interference. The collapsed delivery row also has `onClick={e => e.stopPropagation()}` which I'll preserve.
- **iPad regression risk:** The strip pattern looks denser on iPad than on V3 (same 48px, bigger relative screen). User has confirmed acceptable in Q4 grill. No responsive variant.
- **Phase 1 / Phase 2 split:** Delivery (Phase 1) is shippable on its own — staff can use mfsops.com on iPad and V3 with bigger delivery buttons immediately. Mince Phase 2 follows in same branch but a separate commit so it's revertable independently if the modal flow needs adjustment.

## Follow-ups (NOT in this plan's scope)
- Task 2: PWA icon mismatch — Capacitor placeholder icons on V3 vs proper MFS logo on iPad PWA. Separate plan, Android-only changes.
- Task 3: Silent V3 printing for mince/prep — new Java bridge methods (`printMinceLabel`, `printPrepLabel`), new label templates in JS. ADR-0001's print-only constraint is satisfied. Separate plan.
- Task 4: V3 mobile formatting overhaul — major UX project. Needs discovery: screenshots, what's broken, prioritisation. Separate plan, last.
