# FORGE Execution Plan — HACCP Hub (`/haccp`) UI Phase 1 rebuild

**Date:** 2026-06-30 · **Phase:** UI Phase 1, Tier A (ADR-0014) · **Screen:** `/haccp` kiosk hub
**Spec status:** requirements AUDITED + LOCKED 2026-06-30 (roadmap §9). Do NOT re-open.
**Build target:** `docs/design/2026-06-30-haccp-hub.dc.html` (design intent, not paste-source).

```
DOMAIN (HACCP reporting core)
  └─ HaccpReportingRepository (port) → [Supabase]  (adapter, UNTOUCHED)
       served by HaccpReportingService.getTodayStatus(now)  ← delta #3/#4 live HERE
  UI: app/haccp/page.tsx → components/ui/* (rebuild) + 2 NEW ui primitives
🗣 No new socket — one core calc fixed + the screen re-skinned onto the kit; vendor side never moves.
```

🗣 **In plain English:** We are re-skinning the food-safety kiosk landing page onto the shared
component kit, fixing one number the backend computes, and correctly wiring up help text + a hidden
mid-day overdue signal. Nothing about where data lives or which vendor stores it changes.

---

## 1 · Goal

Rebuild the `/haccp` kiosk hub so its visuals come entirely from `components/ui/` + the semantic
tokens in `app/tokens.css` (no hand-painted colours/widths), while preserving every existing
behaviour and applying exactly the five locked deltas. One backend correction (the honest progress
denominator) lives in the service layer; the rest is presentation.

🗣 **In plain English:** Same kiosk, same buttons, same alarms — but every colour and shape now comes
from the one design kit so a future restyle is "change the kit once". Plus five small, deliberate
fixes Hakan signed off.

---

## 2 · Domain terms (plain-English bridge)

- **Hub / kiosk landing** — the `/haccp` screen: a login door + a 16-tile launcher board.
  🗣 The home screen of the food-safety app; every tile is a doorway to a logging screen.
- **Tile state** — `complete | overdue | due | deviation | neutral`, a shared colour code.
  🗣 Traffic-light status per task — green done, red late, amber soon-due, red deviation, grey "no data yet".
- **today-status feed** — `GET /api/haccp/today-status`, polled every 5 min; drives all tile colours.
  🗣 The once-every-5-minutes heartbeat that tells each tile what colour to be.
- **Mandatory daily set** — the fixed checks that MUST happen every day: cold AM, cold PM, room AM,
  room PM, diary opening, diary **operational** (mid-day), diary closing, cleaning = **8** items.
  🗣 The 8 non-negotiable daily jobs. The progress bar should measure honesty against all 8, not 6.
- **Operational diary** — the mid-day diary phase (cutoff 13:00); already computed, shown nowhere.
  🗣 The lunchtime check the system already tracks but currently hides — delta #4 unhides it.
- **Port / adapter** — `HaccpReportingRepository` is the port (interface the app owns); the Supabase
  file is its adapter (the only place the DB SDK is touched). Both UNTOUCHED here.
  🗣 The socket and the plug — neither moves in this job.

---

## 3 · Compliance / regulatory flags

- This is a **HACCP food-safety surface** → the upgraded ANVIL browser-tap matrix applies
  (MEMORY: [[anvil-full-browser-taps]] — HACCP is explicitly a "press every button" section).
  🗣 Because it is food-safety, we test it hard — every screen state walked in a real browser.
- **No data is entered on this screen** — it is a status board + launcher. No CCP records are created
  or edited here, so no record-integrity / data-migration risk from the UI rebuild itself.
  🗣 You can't log anything here, only see status and jump elsewhere — so we can't corrupt a record.
- The **audio alarm + push** are safety-critical and MUST stay behaviour-identical (see Risk A1).
  🗣 The thing that screams when a check is late cannot get quieter or slower because of a re-skin.

---

## 4 · ADR alignment + conflicts

- **ADR-0014** (tiered design-system consumption): hub is **Tier A** → mockup-first (done), now FORGE
  builds to match. Rule 1 (compose only from `components/ui/` + tokens) and Rule 3 (missing pattern →
  add to `components/ui/` FIRST) both bind this plan. **No conflict** — followed in §7/§8.
  🗣 The rulebook says: build only from the kit; if the kit lacks a piece, add it to the kit first,
  never paint it on the page. We do exactly that (two new kit pieces, §8).
- **ADR-0002 / CLAUDE.md hexagonal**: the one backend change stays in `lib/services/` (correct layer),
  no new vendor import, no adapter edit. **No conflict.**
  🗣 The number-fix lives in the business-logic layer where it belongs, not near the database.
- **Decision #17** (no style-leaking props) and **#19** (printed labels are server-side, out of scope):
  honoured — no `className`/inline-`style`/raw-hex on `components/ui/` consumption; this screen renders
  no labels. **No conflict.**
- **No ADR is contradicted by this plan.**

---

## 5 · Design-export vs PRESERVE — STOP-and-FLAG items (conductor must resolve)

The design comp is **intent, not literal code**. Where it drops or contradicts a PRESERVE item, I am
flagging rather than silently following. **These need a conductor/Hakan decision before/at build:**

- **F1 — Admin affordance moved from an orange STRIP to a header button.** PRESERVE list says
  "admin strip + admin-only Audit tile". The design relocates the admin entry into the header
  (admin-only "Admin panel" button) and drops the full-width orange strip. **Capability is preserved**
  (admin-only access to `/haccp/admin` + admin-only Audit tile both kept); only the **presentation**
  changes. → **Confirm**: accept the header-button presentation, or keep an orange strip?
  🗣 Admin can still get in and still sees the Audit tile — but the loud orange bar becomes a quiet
  header button. Need a yes/no on dropping the bar.
- **F2 — Header wordmark.** Design uses a star icon + "Food Safety" wordmark; the live hub + brand use
  `components/MfsLogo` ("Used in header, login, HACCP" per ui-current-state §3). → **Recommend keeping
  `MfsLogo`** as the brand mark and treating "Food Safety" as a heading string, not replacing the logo.
  🗣 Keep the real MFS logo; "Food Safety" is just a title beside it.
- **F3 — Login PIN interaction.** Design shows a **centred PIN modal**; the live door swaps the whole
  screen for the bespoke `components/AuthKeypad`. The kit has `components/ui/PinKeypad`. → **Decision:**
  (a) keep `AuthKeypad` as-is (lower risk, but bespoke = not design-system, soft Rule-1 miss), or
  (b) migrate to `PinKeypad` inside a `Modal` (design-aligned, but re-tests the auth gate).
  **Recommend (b)** with a full login E2E, but FLAG because the login flow is the kiosk's front door.
  🗣 Two ways to do the PIN pad: reuse the old one (safe) or move to the kit's pad in a popup (cleaner,
  but we must re-prove login works). Recommend the kit version, carefully tested.
- **F4 — Side-panel "Mandatory set · 8" itemised list (NEW in design).** The design adds a per-item
  list of the 8 mandatory checks with a status word each — this is **additive UI** that directly serves
  deltas #3/#4 (all 8 booleans already exist in today-status). **Not a conflict**, but it is **new
  scope** vs the current side panel. → **Confirm include** (recommended — it makes the honest-8 visible)
  or simplify to just the ring + overdue list.
  🗣 The design shows a neat checklist of all 8 daily jobs in the side panel. Data's already there; it's
  a nice addition but it's new — confirm we want it.
- **F5 — Door/header copy changes** ("Tap your name to sign in", "A 4-digit PIN keeps every record
  signed to you", "MFS Sheffield · S3 8DG") vs current copy. Cosmetic; the **Visitor sign-in** and
  **Back to main app** buttons are preserved. → Accept as cosmetic copy refresh (low risk).

**Deltas the design HONOURS correctly (no conflict):** #1 per-tile help, #2 no "Online" dot,
#3 honest 8-set progress, #4 operational diary in overdue list + side panel, #5 "Goods In" label.

---

## 6 · i18n concern (explicit)

**Finding:** the live hub is **100% hardcoded English** — `app/haccp/page.tsx` does NOT import
`LanguageContext`/`useLanguage`, and `lib/translations.ts` has **no HACCP keys** (only `delivery`/
`deliveryIssue`, which belong to the dispatch domain). So "the project convention" (EN/TR via `t()`)
is **not how this screen works today**.

🗣 **In plain English:** The rest of the app can flip to Turkish; this kiosk screen never could — it's
English-only and always has been. There are zero Turkish translations for any HACCP hub text.

**Recommendation (FLAG for conductor):** match the prevailing pattern OF THIS SCREEN — keep the five
deltas' new/changed strings ("Goods In", "Operational (mid-day) diary", the per-tile SOP text) as
**hardcoded English**, consistent with the other ~40 strings on the same screen. **Routing the whole
hub through `t()` is a separate, un-audited workstream** (it needs a full TR translation pass for the
HACCP suite and was not in the locked requirements). Log "i18n the HACCP kiosk (EN/TR)" as a new
BACKLOG item rather than expanding this PR's scope. If Hakan wants the hub i18n'd now, that is a
deliberate scope increase to confirm — do not do it silently.
🗣 Don't half-translate one screen. Keep new text English like everything else here, and put "translate
the kiosk" on the backlog as its own job.

---

## 7 · Exact files to change

**Backend (one service calc — delta #3):**
- `lib/services/HaccpReportingService.ts` — `getTodayStatus(now)`, lines ~154-162 + ~256-257
  (`total = 6` → 8; recompute `done` over the 8-set). **No new read** — `data.cleaning`, `data.diary`
  (incl. `operational` phase) are already fetched. No port/adapter/route/type change.
  🗣 The single backend edit: count 8 jobs, not 6, and include cleaning + the mid-day check in "done".

**Tests for the backend change (oracle updates + new):**
- `tests/unit/services/HaccpReportingService.test.ts` — update the two pinned assertions
  (`total_checks` 6→8 at ~line 64; recompute `completed_checks` at ~line 184) + add 8-set boundary
  cases (see §9). These existing assertions are the parity oracle.
  🗣 The existing tests hardcode "6" and "4"; we correct them to the honest numbers and add new ones.

**UI rebuild (delta #1, #2, #4, #5 + full re-skin):**
- `app/haccp/page.tsx` — the whole hub rebuilt onto `components/ui/`:
  - `HomeScreen` tile board → consume new `StatusTile` (§8); fix per-tile help routing (delta #1);
    add `operational` to room tile state/badge + the `overdue[]` list builder (delta #4); rename
    "Delivery" → "Goods In" label (delta #5); delete the "Online" dot block (delta #2, lines ~695-701).
  - `HelpPanel` → `components/ui/Modal` (`variant="sheet"`); move `SOP_CONTENT` mapping so each of the
    8 currently-mis-routed tiles opens its OWN entry (delta #1).
  - Header/banners/door → `components/ui/{AppHeader, Banner, Modal, PinKeypad?, Badge, StatusPill}`.
  - `StatusStrip` (phone) + iPad side panel → new `ProgressRing` (§8) + Banner/StatusPill.
  🗣 The big file gets rebuilt out of kit parts; the four UI-side deltas land in the same pass.
- `app/haccp/layout.tsx` — review only (full-screen kiosk shell); likely token-swap of the bg, no
  structural change.

**New design-system components (ADR-0014 Rule 3 — add to `components/ui/` FIRST):** see §8.

**Untouched (confirm byte-identical behaviour):**
- `app/api/haccp/today-status/route.ts` (thin doorman) · `lib/adapters/supabase/HaccpReportingRepository.ts`
  · `lib/ports/*` · `lib/haccp-alarm-status.ts` · `hooks/useHACCPAlarm.ts` · `hooks/usePushNotifications.ts`
  · the cron alarm + `getAlarmOverdueStatus`. The TodayStatus **shape** does not change.
  🗣 The data pipe, the database plug, and the alarm brain are all left exactly as they are.

---

## 8 · Component gaps — NEW `components/ui/` primitives (justified)

Per ADR-0014 Rule 3 + Decision #17, a pattern the kit lacks is added to the kit, never hand-painted.

1. **`StatusTile`** (new) — the launcher tile: leading icon + label + a status dot + one-line status +
   a help "?" affordance + a large tap target, driven by semantic props (`accent`/state,
   `size: 'large' | 'small'`, `icon`, `label`, `statusLine`, `onTap`, `onHelp`). The kit's `KpiTile`
   is a **KPI display** (value + label + accent stripe) — NOT a tappable launcher with a help button,
   so this is a genuine gap. **Justification:** it is the entire screen (16 instances) and recurs in
   every HACCP section; Decision #17 forbids painting it per-screen.
   🗣 The coloured tappable tile with a "?" is the heart of the screen and doesn't exist in the kit yet —
   so it becomes a proper kit part, reused 16 times.
2. **`ProgressRing`** (new) — circular "X of Y / %" indicator used in both the phone strip and the iPad
   side panel; takes `value` (0-100) + `accent` and **owns the fill internally** (the screen passes a
   number, not a width). No progress primitive exists in the kit today (the live hub hand-rolls a
   `style={{ width }}` bar — exactly the style-leak Decision #17 bans). **Justification:** required for
   the honest-progress display; recurs; must not leak `style`.
   🗣 The little progress dial — the screen tells it "8 of 8", the dial draws itself; the page never
   touches raw widths.
3. **`Banner` enhancement (small)** — the alarm banner must be **tappable as a whole** (iOS needs a
   direct gesture to start audio). `components/ui/Banner` is a non-interactive `<div>`. Add an optional
   `onClick` (when set, the root becomes a `<button>`) OR an `action` slot. **Justification:** preserves
   the tap-to-sound-alarm behaviour without hand-painting a bespoke banner. FLAG: small change to a
   shipped kit component — keep additive + backward-compatible.
   🗣 The red alarm bar has to be a button you can tap to make sound; the kit's bar isn't tappable yet,
   so add an optional tap to it (without breaking its other uses).

All three are first-party additions to `components/ui/` — **no npm dependency added.**

---

## 9 · TDD test plan (each delta → a testable assertion)

**Delta #3 — honest progress (unit, `HaccpReportingService.test.ts`, inject `now`):**
- `total_checks` is **8** at every clock value (was 6). (update ~line 64)
- With cold AM only done → `completed_checks` = 1; with the full fixture (cold AM, room AM, room PM,
  diary opening + operational) → recompute (≥5, +1 if cleaning logged). (update ~line 184)
- Boundary: nothing done, 08:00 → `completed_checks` 0, `total_checks` 8.
- Cleaning counts toward `completed_checks` when `cleaning.length > 0`; operational counts when
  `diary` includes `operational`.
🗣 Prove the denominator is 8 and that cleaning + the mid-day check now move the number.

**Delta #4 — surface operational overdue (unit + UI):**
- Unit (service, already passes): `daily_diary.operational_overdue` true after 13:00 when not done
  (existing test ~line 78 already asserts this — confirms data is present).
- UI (page logic): the `overdue[]` builder pushes `"Process Room Operational checks"` when
  `operational_overdue` (extract the builder to a pure helper so it is unit-testable, or assert via
  the rendered overdue list in the browser walk). Room tile badge surfaces "Operational overdue" at
  correct priority.
- **Guard rail (must-not-change):** `lib/haccp-alarm-status.ts` `getOverdueItems` is UNCHANGED →
  operational is **visual-only**, NOT an audio-alarm trigger (matches today's alarm design). A test/
  assertion pins that the alarm's overdue set still excludes operational.
🗣 Show the lunchtime overdue in the list and tile — but do NOT let it start the siren (the siren's
job list stays exactly as it was).

**Delta #1 — per-tile help routing (unit on the mapping):**
- Assert each of the 8 currently-mis-routed tiles (People[ok], Training, Allergens, Recall,
  Product Specs, Food Fraud, Food Defence, Audit) resolves to its OWN `SOP_CONTENT` key — NOT
  `'people'`. **Gap note:** only `people` has an existing `SOP_CONTENT` entry; Training/Allergens/
  Recall/Product-Specs/Food-Fraud/Food-Defence/Audit have **no entry yet**. Per the locked spec, do
  NOT invent policy text — for tiles without an entry, route the "?" to a minimal honest placeholder
  ("Guidance for this section is being added" / hide the "?") and log the real policy-doc mapping as
  the separate future workstream. The design's `help` map provides short "current kiosk text" intros
  for cold/room/goods/mince/cleaning/calibration — those may seed entries that exist; do NOT fabricate
  for the compliance tiles. → **Confirm placeholder vs hide-"?" for tiles lacking SOP text.**
🗣 Wire each "?" to its own text. Several compliance tiles have no text yet — don't make any up; show a
neutral placeholder (or hide the "?") and book the real policy-doc job separately.

**Delta #2 — no "Online" dot:** assert the rendered hub contains no static "Online" indicator
(string + element absent). 🗣 Prove the fake green light is gone.

**Delta #5 — "Goods In" rename:** assert the tile label/heading reads "Goods In"; assert the route is
still `/haccp/delivery` (unchanged `onTap` target) and no reference to table `haccp_deliveries` changed.
🗣 Label says "Goods In"; the link still goes to the same place; nothing underneath renamed.

**Preserved-behaviour regression (the bulk of ANVIL):** login door → PIN → home; 16 tiles + routes +
order; live tile colours off the poll; audio alarm + red pulsing header + tap-to-sound; push banner +
"alarms active" strip; overdue list; phone-strip vs iPad-side-panel responsive swap; live clock; help
sheets; admin strip/Audit tile (per F1 decision); Documents; user chip + Sign out; cookie home/door
gating. 🗣 Everything on the PRESERVE list gets walked and must behave identically.

---

## 10 · Sequence of work

1. **Backend first (delta #3)** — change `total`/`done` in `getTodayStatus`; update the two oracle
   assertions + add 8-set cases; `tsc` + unit green. Smallest, safest, independently shippable.
2. **Add the 3 kit pieces** (`StatusTile`, `ProgressRing`, `Banner.onClick`) to `components/ui/` with
   their own unit/render tests + token-only styling; export from `components/ui/index.ts`.
3. **Rebuild `page.tsx` onto the kit** — header/banners/door/tiles/strip/side-panel/help, applying
   deltas #1/#2/#4/#5 in the same pass. Resolve F1–F5 with the conductor BEFORE this step.
4. **Lint/token audit** — confirm zero `className`/inline-`style`/raw-hex leaking into kit components
   (Decision #17 ESLint rules must stay green).
5. **ANVIL** (§11).
🗣 Fix the number, build the missing kit parts, then re-skin the page, then prove no style leaked, then
test hard.

---

## 11 · Recommended ANVIL test matrix

- **Unit:** `HaccpReportingService` (8-set + boundaries) · the overdue-list helper · the SOP-routing
  map · `StatusTile`/`ProgressRing` render · `Banner` onClick. 🗣 Logic + new kit parts in isolation.
- **Lint/static:** `tsc` 0 · `next lint` clean · the no-style-leak ESLint rules green on `page.tsx`.
- **Integration:** `today-status` route still returns the same SHAPE (now with values 8/n) — the
  existing `tests/integration/haccpReportingRoutes.test.ts` should pass with the denominator updated.
- **E2E / browser-tap (HACCP = exhaustive, [[anvil-full-browser-taps]]):** on the prod-build preview,
  walk **every state**: door (loading/empty/staff) → PIN (correct/incorrect) → home; iPad landscape +
  phone + Sunmi portrait reflow; each tile colour state; alarm-active (red pulse + tap-to-sound) vs
  calm; push enable → active strip; help sheet per tile (correct text / placeholder); admin vs staff;
  Documents; sign out; cookie gating. 🗣 Press every button on every device size — it's food-safety.
- **No DB/RLS/pgTAP, no PITR:** no migration, no schema/RLS touch, no new table. 🗣 Database untouched →
  those rungs don't apply.

---

## 12 · Risk Assessment (mandatory)

### A · Business-logic flaws
- **A1 — Audio alarm / push behaviour drift (HIGH, must-fix-if-broken).** The re-skin must not change
  WHEN the alarm fires, the escalation, the red-pulse, or the iOS tap-to-start-audio gesture. The
  alarm reads `useHACCPAlarm(status)` off the SAME overdue booleans → keep them intact; do NOT route
  delta #4's operational signal into `getOverdueItems`. **Mitigation:** leave `lib/haccp-alarm-status.ts`
  + `hooks/*` byte-identical; pin a test that the alarm overdue set excludes operational; browser-walk
  the alarm state on the preview. **Must-fix gate:** alarm regression blocks ship.
  🗣 The siren is the whole point of this screen — if the re-skin makes it quieter, slower, or adds the
  wrong trigger, we don't ship. We keep its brain untouched and test it live.
- **A2 — Honest-progress miscount (MEDIUM).** Wrong `done` logic (e.g. forgetting cleaning, or
  double-counting) makes the % lie — the opposite of the delta's intent. **Mitigation:** deterministic
  unit tests with injected `now` over explicit fixtures; the 8 items enumerated in §2.
  🗣 If we miscount the 8 jobs the bar lies again — pinned by exact tests.
- **A3 — Help mis-routing regression / fabricated policy text (MEDIUM, scope-discipline).** Routing a
  tile to a non-existent or invented SOP entry. **Mitigation:** map only to existing entries; neutral
  placeholder (or hidden "?") for tiles lacking text; the real policy-doc mapping is explicitly a
  separate workstream. **FLAG F-help** (placeholder vs hide) for the conductor.
  🗣 Don't invent compliance guidance — show a neutral placeholder where text doesn't exist yet.

### B · Concurrency / race conditions
- **B1 — Poll vs render (LOW).** The 5-min poll + live clock already exist; the rebuild reuses the
  same `useEffect`/`setInterval`. No new shared mutable state. **Mitigation:** preserve the existing
  fetch/interval lifecycle; no parallel writers (read-only screen).
  🗣 The screen only reads, on a timer that already works — no new race introduced.
- No multi-user write contention: **no material risk** (screen creates/edits no records).

### C · Security
- **C1 — Auth/role gating (MEDIUM).** Cookie-based home/door gating + admin-only Audit/Admin must stay
  enforced (don't render admin affordances for non-admins). The `today-status` route's role check
  (`x-mfs-user-role` ∈ warehouse/butcher/admin) is server-side and UNTOUCHED. **Mitigation:** preserve
  the `userRole==='admin'` guards in the UI; route guard unchanged; E2E walks admin vs staff.
  🗣 Admin-only buttons must stay admin-only; the real lock is on the server and we don't touch it.
- **C2 — No new free-text/XSS surface (LOW).** Unlike the label work, this screen renders no
  user-supplied free text into HTML. **No material risk.** 🗣 Nothing user-typed gets injected here.

### D · Data migration
- **No migration, no schema change, no RLS change, no table touched.** `total_checks`/`completed_checks`
  are existing response fields; only their computed VALUES change. **No material risk in this category.**
  🗣 No database surgery at all — we just compute a number more honestly.

### E · Launch blockers
- **E1 — today-status consumer break (MEDIUM→LOW).** Confirm nothing keys off the literal value `6`.
  Consumers: `page.tsx` (renders pct + "X of Y" — intended to change), `useHACCPAlarm` (reads overdue
  booleans, NOT the total — unaffected). **Mitigation:** grep for `total_checks`/`=== 6`; shape
  unchanged so no field-missing break. 🗣 The only thing that "sees" the number is the bar itself — fine.
- **E2 — Login-flow regression from AuthKeypad→PinKeypad migration (MEDIUM, conditional on F3).** If we
  migrate the keypad, the kiosk front door is in scope. **Mitigation:** full login E2E (correct +
  incorrect PIN, back, cancel) on the preview; or choose F3 option (a) to de-risk. **FLAG F3.**
  🗣 If we swap the PIN pad we must re-prove people can actually log in — or keep the old pad to be safe.
- **E3 — Style-leak ESLint failure (LOW).** A stray `className`/hex on a kit component fails the
  Decision-#17 rules. **Mitigation:** the two new primitives own all appearance; lint gate in §11.
  🗣 If we paint on the page instead of the kit, the linter stops us — by design.

### Must-fix summary
- **No unconditional must-fix risk blocks Gate 2 in the plan itself.** The single hard gate is
  behavioural: **A1 (alarm/push parity) is a must-fix at ship** — an alarm regression blocks. The
  conditional risks (F3 login migration, F-help placeholder) are **decisions for the conductor/Hakan**,
  not plan defects. Resolve F1–F5 + the i18n recommendation (§6) before the Render step.
  🗣 Nothing in the plan is broken-by-design. The one non-negotiable is: the alarm must behave
  identically. A few choices (PIN pad, admin strip, placeholder text) need a quick yes/no first.

---

## 13 · Hexagonal verdict (populates Gate 2)

- **Port used:** `HaccpReportingRepository` (existing) — consumed by `HaccpReportingService`. **No new
  port.** The `today-status` route + the port interface are untouched.
- **Adapter:** `lib/adapters/supabase/HaccpReportingRepository.ts` (existing) — **UNTOUCHED** (the
  cleaning + diary-operational reads it already returns cover delta #3/#4; no new query).
- **New dependencies:** **NONE.** `StatusTile`, `ProgressRing`, and the `Banner.onClick` enhancement are
  first-party `components/ui/` additions, not npm packages — no `package.json` entry, nothing to wrap.
- **Rip-out test:** **PASS.** Replacing the Supabase HACCP reporting adapter tomorrow is still "one new
  adapter + one wiring line" — this change does not touch the vendor boundary, add a vendor import, or
  move logic across the port. The backend edit stays inside `lib/services/`; the UI edits stay inside
  `app/` + `components/ui/`.
- **Headline:** *No new seam — a UI rebuild onto the existing component kit + one service-layer
  progress-calc correction. No new port, no new adapter, no new dependency, rip-out test PASS.*
  🗣 We changed one number in the business layer and re-skinned a page. The plug-and-socket wiring to
  the database never moved, so swapping the vendor later still costs one plug.

---

## 14 · Acceptance criteria

- [ ] `getTodayStatus` returns `total_checks === 8`; `completed_checks` counts the 8-set (cold AM/PM,
      room AM/PM, diary opening/operational/closing, cleaning); unit tests green.
- [ ] Each tile's "?" opens its OWN SOP text (or a neutral placeholder where none exists); no tile
      still opens "People" by default except People itself.
- [ ] The static "Online" dot is gone; no connectivity indicator replaces it.
- [ ] Operational (mid-day) diary overdue appears in the Process-Room tile status AND the overdue list;
      the audio alarm's trigger set is unchanged (operational NOT added to it).
- [ ] The tile reads "Goods In"; route stays `/haccp/delivery`; table `haccp_deliveries` untouched.
- [ ] All PRESERVE behaviours verified identical on the prod-build preview across iPad/phone/Sunmi.
- [ ] Zero style-leak: every visual comes from `components/ui/` + tokens; Decision-#17 ESLint green.
- [ ] today-status response SHAPE unchanged; no consumer breaks.
- [ ] F1–F5 + i18n recommendation resolved with the conductor/Hakan before Render.
🗣 Tick-list a human can walk: the number is honest, help is right, the fake light is gone, the mid-day
check shows (but doesn't add to the siren), "Goods In" reads right, everything else still works, and no
colour was painted on the page by hand.

## Gate 2 decisions — LOCKED 2026-06-30 (resolve all conditionals above)

These supersede every open question / conditional in the plan body. Build to these.

- **F1 — Admin (FOLLOW DESIGN):** orange admin *strip* → header *button*. Admin-only access + the
  admin-only Audit tile preserved.
- **F2 — Wordmark (FOLLOW PLANNER REC):** keep the real `MfsLogo` component + "Food Safety" as a
  heading. Do NOT hand-draw a star wordmark.
- **F3 — PIN keypad (MIGRATE):** rebuild the login door to the centred-modal design using the kit
  `PinKeypad`. **The kiosk login front door is now IN SCOPE** → a full login E2E (staff card → PIN →
  home, plus wrong-PIN error) is REQUIRED in ANVIL. Preserve the exact auth logic (`POST /api/auth/login`,
  sets `mfs_haccp_session`, the cookie-based home/door gating) — only the presentation changes.
- **F4 — 8-check checklist (INCLUDE):** build the new "Mandatory set · 8" side-panel checklist
  (lists the 8 daily mandatory checks with done/overdue ticks) as designed. Additive; data already
  fetched. Must stay consistent with the honest `total_checks === 8` (delta #3) — same 8 items.
- **F5 — Door/header copy refresh (FOLLOW DESIGN):** cosmetic copy per the export.
- **i18n (HARDCODED EN + BACKLOG):** new/changed strings stay hardcoded English to match the existing
  screen. Do NOT wire `t()`. Logged as BACKLOG **F-UI-I18N-01** (translate the HACCP kiosk) as its own
  audited task. No `t()` scope creep in this unit.
