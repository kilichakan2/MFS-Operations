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
| 2 | ⏸️ | Van tracking — Phase 0 hardware in transit | `infra-hardware` | M-L | _(spec locked below; planner runs when hardware arrives)_ |
| 3 | 📝 | Order pipeline + KDS production-room display | `app-feature` | XL | _(grilling now — see item below)_ |
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

## 2. ⏸️ Van tracking via open-source GPS

**Status:** Spec locked at FORGE Gate 1 (Frame phase complete). Phase 0 hardware ordered and in transit. Resumes when hardware arrives. No software work to do until then.

### What was decided (Gate 1 deliverable)

**Architecture:** Dedicated OBD trackers report to a self-hosted Traccar server. mfsops.com PWA reads Traccar's REST API to render live positions inside the **existing Map / Routes section** (not a new "Fleet" page). When a driver taps "delivered" in the PWA on their phone, we capture the live GPS coord from Traccar for that vehicle at that moment as proof-of-delivery.

**Decisions made and the reasoning:**

| Decision | Choice | Why |
|---|---|---|
| Tracking method | Dedicated OBD plug-in trackers, not PWA-based phone tracking | Background tracking on iOS basically doesn't work; Android is fragile. PWA phone tracking would go dark unpredictably. Hardware trackers are the standard answer for fleet-grade reliability. |
| Hardware | Teltonika FMC003 (4G LTE Cat 1, OBD plug-and-play) | Currently in Traccar 6.11's natively supported device list (`teltonika` protocol, port 5027). 4G futureproof to 2030+. Plug into OBD port, no install, no hardwiring. Hakan ruled out hardwired alternatives. |
| Fleet size | 6 vehicles — 3 vans + 3 sales rep cars | Confirmed |
| Tracker stack — why not Teltonika FMC001 | FMC001 is **End-of-Life** — end of production Dec 2023, end of support Dec 2025. Buying it in 2026 means firmware updates have already stopped. Rejected. |
| Tracker stack — why not Teltonika FMB003 | FMB003 is 2G-only. UK 2G stays alive to ~2030–2033 for IoT, so usable, but FMC003 is the cleaner future-proof answer. FMB003 is the fallback if FMC003 stock fails. |
| SIM | 1NCE Lifetime IoT — €12 one-time per SIM for 10 years, 500 MB + 250 SMS, supports 2G/3G/4G/LTE-M/NB-IoT, UK coverage confirmed | Pay once, forget. Zero monthly admin. Decade horizon. |
| Server hosting | Hetzner Cloud CX21, ~£4-5/month, EU/UK datacentre | Decided over self-hosted Beelink mini-PC in office. Easier remote debugging, professional uptime, snapshots one click. Migrate to office Beelink later is trivial (Traccar's database is plain Postgres). |
| Phase 0 strategy | Buy 1 tracker, 1 SIM, prove the stack end-to-end before committing to fleet rollout | Validates "Traccar supports FMC003" against an actual device rather than a documentation page. Wrong hardware bought in bulk costs 6× more than wrong hardware bought in singles. |
| Driver consent / privacy | Hakan handles employee sign-off in writing before any tracker goes live in a vehicle being driven by someone other than him | Required for UK GDPR + employment law. |
| Tracking categories captured | Live position + proof-of-delivery + driver behaviour + history | All four use cases enabled by FMC003's standard feature set. |
| Customer-facing ETAs | **NOT** in scope at launch — internal only | Phase 2 (customer-facing portal/SMS) can come later. |

### Phase 0 — hardware proof-of-concept (ordered, in transit)

**What's been bought:** 1 × Teltonika FMC003 from shop.thetechnologydoctors.co.uk (authorised UK Teltonika reseller, Hertfordshire-based, real registered business).

**What still needs ordering when the tracker arrives:**
- 1 × 1NCE Lifetime IoT SIM (€12, from 1nce.com direct)
- 1 × Hetzner CX21 cloud droplet (£4/month, signed up at hetzner.com)

**Phase 0 acceptance criteria — what we're proving:**
- [ ] FMC003 receives power from OBD port, boots, connects to mobile network
- [ ] Tracker reports to Traccar server (correct port + protocol decoded)
- [ ] Position is accurate within ~10m, updates at configurable interval
- [ ] Speed, heading, ignition on/off, voltage all decoded into Traccar
- [ ] Trip detection fires when vehicle starts/stops
- [ ] Hard braking / harsh acceleration events captured
- [ ] Traccar REST API gives the shape of data the mfsops.com integration will need
- [ ] OBD unplug detection fires (so we know if someone yanks it)
- [ ] Driven in real conditions for 2–3 days in Hakan's own car, not stationary on a desk

If all eight items pass → proceed to Phase 1 (build the integration in mfsops.com) → then Phase 2 (buy 5 more FMC003s + 5 more SIMs, sign driver consents, deploy to remaining vehicles).

If anything fails → diagnose. If the failure is fundamental to the FMC003-Traccar combination (e.g. unsupported variant, firmware issue Traccar can't decode), pivot to **Teltonika FMB003 (2G fallback)** from wifi-stock.co.uk or LinITX before committing to a fleet rollout.

### Open questions parked until Phase 1 planning kicks off
- Exact poll interval / data plan sizing (depends on how 1NCE's 500 MB/year holds up in real use — Phase 0 will reveal this)
- Whether to hard-code Traccar API base URL in `mfsops.com` env vars or hold it in Supabase config table
- Driver privacy notice wording (Hakan owns this — legal-advisor skill can draft if helpful when fleet rollout is imminent)

### Sub-branches (when Phase 1 starts)
Likely structure when the integration work begins:
- `feat/van-tracking-traccar-server` — server provision, install scripts, secrets
- `feat/van-tracking-map-integration` — read Traccar's REST API into the existing Map / Routes section
- `feat/van-tracking-pod-link` — capture GPS coord when driver taps "delivered"

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

Updated pick-up order: **3 first** (order pipeline + KDS — grilling starting now), parallel verification of item 1 (print strip on V3 device when Hakan gets to it), then resume item 2 (van tracking Phase 0) when the FMC003 arrives, then 4 → 5 → 6.

Van tracking is parked ⏸️ on hardware arrival — no software work to do until the FMC003 is in hand. The full Phase 0 acceptance protocol is captured in item 2 above so we can pick up exactly where we left off.

Next session: continue grilling order/KDS toward FORGE Gate 1.
