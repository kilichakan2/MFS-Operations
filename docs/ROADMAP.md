# MFS Operations — Roadmap

Single source of truth for what's been agreed to ship, what's in flight, and what's parked. Every plan in `docs/plans/` is referenced here. Updated every session.

## Working conventions

- **One feature per branch.** Naming: `feat/<name>` for features, `fix/<name>` for fixes, `chore/<name>` for housekeeping.
- **Large features** get a long-lived integration branch (e.g. `feat/order-pipeline`) with sub-branches feeding into it via small PRs; merge into `main` as one PR when the whole feature is proven.
- **FORGE skill** runs the build loop: grill → plan → implement → code-critic, with three human gates. Used for everything non-trivial.
- **ANVIL skill** runs production-readiness tests after FORGE clears, before merge to main.
- **Plans live in `docs/plans/`** with date-prefixed filenames. ADRs live in `docs/adr/`.

## Status legend
- 🧪 **In test** — merged to main, awaiting verification on real device(s)
- 📝 **Planning** — plan being grilled / written but no code yet
- 🛠️ **In progress** — branch open, code being written
- 📋 **Backlog** — agreed scope, not yet started
- 🔬 **Discovery** — known need, scope not yet clear (needs a discovery pass before planning)
- ⏸️ **Blocked** — waiting on a decision, hardware, third party, etc.

## Size legend
- **S** — under half a session
- **M** — half a day to one session
- **L** — multiple sessions
- **XL** — multi-week, almost certainly multiple sub-branches

---

## Current state

| # | Status | Item | Category | Size | Plan |
|---|---|---|---|---|---|
| 1 | 🧪 | Print button bottom-strip pattern | `app-ui` | M | [`docs/plans/2026-05-14-print-button-bottom-strip.md`](plans/2026-05-14-print-button-bottom-strip.md) |
| 2 | 📋 | Van tracking via open-source GPS | `infra-hardware` | M-L | _(not yet written — next up)_ |
| 3 | 📋 | Order pipeline + KDS production-room display | `app-feature` | XL | _(not yet written)_ |
| 4 | 📋 | PWA icon mismatch (Capacitor default → MFS logo on V3) | `sunmi-hardware` | S | _(not yet written)_ |
| 5 | 📋 | Silent V3 printing for mince + meat prep | `sunmi-hardware` | M | _(not yet written)_ |
| 6 | 🔬 | V3 mobile formatting overhaul | `sunmi-hardware` | L | _(needs discovery pass first)_ |

---

## 1. 🧪 Print button bottom-strip pattern

**Plan:** `docs/plans/2026-05-14-print-button-bottom-strip.md`
**Merged:** `443afd4` on main
**Awaiting:** Hakan's on-device verification of the new 48px orange/blue print strip on iPad and V3.

Checklist (see plan for full version):
- iPad: Goods In + Mince tiles show new strip, tap-target feels comfortable, row doesn't expand when buttons are tapped, mince modal shows simplified single-column use-by-date selector
- V3 APK: same as iPad, plus V3 still prints silently to thermal on delivery 58mm
- Category badge moved to row 1 of delivery card

---

## 2. 📋 Van tracking via open-source GPS

**Why:** Currently no real-time visibility on where the delivery fleet is. Lost time when staff phone drivers asking "where are you", customers chase ETAs through dispatch, no playback for disputes ("driver says they delivered at 11am, customer says they didn't").

**Initial scope (subject to grilling):**
- Pick an open-source tracking platform. Leading candidate: Traccar (self-hostable, MIT licence, supports 200+ device protocols).
- Pick hardware per van. Two paths: dedicated GPS units (£20-40 each, OBD or hardwired, no monthly fees) or repurposed Android phone with a Traccar client app (cheaper if phones available, more variables).
- Stand up a Traccar server (small DigitalOcean droplet, ~£5/month, or alongside existing infra).
- Build a "Fleet" page in mfsops.com showing live van positions on a map, plus per-van trip history.
- Integrate with delivery records — link each delivery to the GPS trail for that vehicle that day, enabling proof-of-delivery timestamps.

**Open questions before planning:**
- How many vans? (Drives hardware quantity and server sizing.)
- Are drivers using personal phones or work phones? (Determines whether phone-as-tracker is viable.)
- Privacy/employment-law angle — drivers need to be informed in writing that vehicles are tracked. Worth a quick chat to the legal-advisor skill before we deploy.
- Self-host vs Traccar's hosted offering? Self-host is free, hosted is ~£8/device/month but zero infra burden.
- Do we want live customer-facing ETAs ("your driver is 20 minutes away") or is this internal-only for now?

**Risk:** Medium. Hardware + new server infra + privacy implications + a new page in the app. Two-week effort if we do it properly.

---

## 3. 📋 Order pipeline + KDS production-room display

**Why:** Meat orders currently arrive via WhatsApp. Production room operates from screenshots, drivers chase clarifications, orders get missed in long WhatsApp threads, no audit trail. Largest workflow problem in the business.

**Initial scope (subject to extensive grilling — this is XL):**

Three connected pieces, likely four sub-branches off a long-lived `feat/order-pipeline` integration branch:

1. **Order capture** — sales reps log new orders in mfsops.com: customer, items (with the existing product catalogue), quantities, delivery date, notes. Replaces "type into WhatsApp".

2. **KDS production-room display** — a dedicated touchscreen in the cutting room showing the live order queue, prioritised by delivery date and progress. Cards transition through states: `received → in_cutting → packed → ready → dispatched`. Staff tap to advance state. This is the kitchen-display-system pattern — order changes appear in real time across the screen via Supabase realtime.

3. **Customer notifications** — replicates the WhatsApp confirmation habit, so customers still get the ping they're used to. Order received → confirmation. Ready → "your order is being dispatched" message. Out for delivery → ETA. Done via WhatsApp Business templates (we already have the infrastructure on the credit control app) or email.

4. **Audit + reporting** — every state transition logged with timestamp and operator. Daily/weekly reports for production efficiency. Disputes ("customer says order was wrong") become traceable.

**Open questions — extensive, will be addressed in grilling:**
- What's in the order? Just SKU + qty, or per-item notes (cut style, butchery preferences)?
- Multi-customer route batching — one order per customer, or one delivery containing multiple orders for the route?
- Modifications mid-process — what if customer phones at 9am to add an item to an 11am cut?
- KDS hardware — touchscreen monitor + PC, or a tablet on a stand, or another V3-style Android device?
- Who can capture orders? Just sales reps, or can the customer self-serve via a portal? (Latter is a much bigger feature.)
- Replacing WhatsApp fully or running both in parallel for a few weeks?

**Risk:** High. Replaces a 100+ customer-touching workflow. Mistakes cost real money. Must run alongside WhatsApp for a parallel period before cutover. Likely multi-week with several plans.

---

## 4. 📋 PWA icon mismatch

**Why:** The MFS Operations app icon on the V3's app drawer is the Capacitor default placeholder. The PWA icon on iPad is the proper MFS logo. Inconsistent and unprofessional.

**Scope:** Replace `android/app/src/main/res/mipmap-*/ic_launcher*.png` with the proper MFS icon, sized for each density bucket (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi).

**Open question:** Source icon — extract from `public/icons/icon-512.png` (lossy upscale to 1024×1024) or use a higher-res master if one exists.

**Risk:** Very low. Pure asset swap. APK rebuild + sideload to take effect.

---

## 5. 📋 Silent V3 printing for mince and meat prep

**Why:** Delivery prints silently to V3 thermal today. Mince and prep still go through the iframe AirPrint dialog. Inconsistent UX, slower workflow.

**Scope:**
- Add `printMinceLabel(...)` and `printPrepLabel(...)` `@JavascriptInterface` methods to `SunmiPrintBridge.java`
- Add `printMinceSunmi()` and `printPrepSunmi()` helpers in `lib/printing/sunmi.ts`, mirroring `printDeliverySunmi()`
- Update mince row + meat-prep row to check `isSunmiNative()` and route to the bridge instead of the iframe
- Requires APK rebuild + sideload (new Java methods = new bridge contract)

**ADR-0001 constraint:** Both methods stay print-only. Compliant.

**Risk:** Low. Mirrors work already proven for delivery (commit `f884196`).

---

## 6. 🔬 V3 mobile formatting overhaul

**Why:** General UX on the V3's 5″ screen is still bad. Layouts designed for iPad, font sizes too small in places, touch targets inconsistent.

**Scope unknown** — needs discovery first. Likely candidates: tile grid on home screen, form inputs sized for keyboard not finger, bottom-nav, modal heights, header eating vertical space.

**Before planning:** Discovery pass. Screenshots from V3 of every page staff actually use, prioritised list of pain points. Each page becomes its own plan-implement-critic cycle, not a single mega-PR.

**Risk:** Medium-high. Touches many pages, easy to regress iPad. Belongs last in the order — do the focused items first (2, 4, 5), then this with full context.

---

## Pick-up order

Hakan's chosen pick-up order: **2 first** (van tracking), then 1 verification, then 4, then 5, then 3, then 6.

Next session: grill van tracking. The open questions listed under item 2 will be the first pass.
