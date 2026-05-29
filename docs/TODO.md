# MFS Operations — Open Tasks

Working list of tasks to come back to. Updated as we go.

---

## To verify on device (just shipped, awaiting smoke test)

### Print button bottom-strip pattern
**Status:** Merged to main (`443afd4`), Vercel deployed.
**Awaiting:** Hakan's on-device verification.

What to check:
- iPad: Goods In + Mince tiles show new 48px orange/blue print strip at the bottom of each card. Tap-target feels comfortable.
- iPad: tapping print buttons does NOT expand the row card.
- iPad: tapping row body DOES expand the card; inside, batch reference block has the same big strip.
- iPad: Mince row blue/orange opens simplified single-column modal titled "Print 100mm / 58mm label".
- V3 APK: same as iPad. The blue 58mm button on delivery still prints silently to V3 thermal (bridge contract untouched).
- V3 APK: V3 needs close-and-reopen (or pull-to-refresh) to pick up the new JS.
- Category badge (LAMB / BEEF etc.) moved to row 1 of delivery card, alongside date and delivery number.

Plan: `docs/plans/2026-05-14-print-button-bottom-strip.md`

---

## Backlog — confirmed but not started

### Task 2 — PWA icon mismatch on V3
**Why:** The MFS Operations app icon on the V3's app drawer is the Capacitor default placeholder. The PWA icon on iPad is the proper MFS logo. They should match.

**Scope:** Android-only — `android/app/src/main/res/mipmap-*/ic_launcher*.png` files need replacing with the proper MFS icon, sized for each density bucket (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).

**Open question before planning:** Source icon. Either (a) extract from `public/icons/icon-512.png` and accept lossy upscale to 1024×1024 for adaptive icons, or (b) use a higher-resolution master if one exists. Hakan to confirm which.

**Risk:** Low. Pure asset swap. Will need a fresh APK build + sideload on V3 to take effect.

---

### Task 3 — Silent V3 printing for mince and meat prep
**Why:** Delivery prints silently to V3 thermal today. Mince and prep still go through the iframe AirPrint dialog on V3 even though both share the same thermal printer. Inconsistent UX, slower workflow.

**Scope:**
- Add `printMinceLabel(...)` and `printPrepLabel(...)` `@JavascriptInterface` methods to `SunmiPrintBridge.java`
- Add `printMinceSunmi()` and `printPrepSunmi()` helpers in `lib/printing/sunmi.ts`, mirroring the existing `printDeliverySunmi()` shape
- Update mince row + meat-prep row to check `isSunmiNative()` and route to the bridge instead of the iframe
- Requires APK rebuild + sideload (new Java methods = new bridge contract)

**ADR-0001 constraint:** Both methods print-only, no new attack surface. Compliant.

**Estimate:** Half a day. Plan + ~6 commits, mirrors the delivery work.

---

### Task 4 — V3 mobile formatting overhaul
**Why:** General UX on the V3's 5″ screen is still bad. Layouts designed for iPad, font sizes too small in places, touch targets inconsistent.

**Scope:** Unknown until we do discovery. Likely candidates:
- Tile grid on home screen (currently dense on V3)
- Form inputs sized for keyboard not for stylus/finger
- Bottom-nav sizing
- Modal heights on small screens
- Header height eating too much vertical space

**Before planning:** Need a discovery pass — screenshots from V3 of every page staff actually use, prioritised list of pain points. This is the biggest of the four tasks and should be done last.

**Risk:** Medium-high. Touches many pages, easy to regress iPad layout. Each page should be its own plan-implement-critic cycle, not a single mega-PR.

---

## Notes for next session
- Pick up TODO order from top: verify the strip pattern works on device → Task 2 → Task 3 → Task 4.
- Task 4 needs a discovery pass before any plan can be written.
