# Claude Design prompt — HACCP Hub (`/haccp`)

> UI Phase 1, Tier A (novel kiosk layout). Paste the block below into Claude Design.
> Functional surface = this session's read-only requirements audit (2026-06-30), cross-checked
> against `docs/ui-current-state.md` §4 HACCP. The 5 locked deltas are baked into "What's changing".

---

## PROMPT (paste into Claude Design)

Use the **MFS Operations Design System** already set up in Claude Design (project "MFS OPS NEW").
Do not invent or restate colours, type, or tokens — pull them from that system. Design **one
screen: the HACCP hub** (`/haccp`), the landing screen of the food-safety kiosk.

### Context — what this screen is
A wall-mounted / handheld **kiosk landing page** for a butchery's food-safety (HACCP) operation.
Runs on three device classes: **iPad** (primary, landscape), **phone**, and a **Sunmi handheld**
(small, portrait). No standard app navigation — it is its own full-screen surface. It is a
**status board + launcher**: no data is entered here; every tile launches a sub-screen where the
actual logging happens. It must be glanceable from across a room and operable with gloved taps.

### What already exists (preserve ALL of it — do not drop or restyle away)

**A. Two screen states**
1. **Login door** — shown when no one is signed in: a grid of **staff name cards**; tapping a card
   opens a **PIN keypad** (phone-unlock style); correct PIN → home. Also: a **"Visitor sign-in"**
   button and a **"Back to main app"** button. States: loading ("Loading…"), empty ("No staff found").
2. **Home (the hub)** — the tile board, shown once signed in.

**B. Home header bar**
- **Documents** button (→ document register).
- **User chip**: staff initials + name + **Sign out**.
- **Admin strip** (admin role only): an "Admin panel" entry, visually distinct (currently an
  orange accent strip).

**C. The tile board — 16 launcher tiles in tiers**
Every tile shows: an icon, a **name**, and a **live one-line status** that is **colour-coded** by a
shared tile-state system — **complete (green) / overdue (red) / due (amber) / deviation / neutral**.
Each tile also has a **help "?" affordance** that opens a slide-up SOP panel.
- **Primary (large) tiles:** Cold Storage · Process Room · Goods In · Mince/Prep · Product Return · Cleaning
- **Secondary (small) tiles:** Calibration · Reviews · People · Training · Allergens · Recall Contacts ·
  Product Specs · Food Fraud · Food Defence · **Audit (admin-only)**
- Tile status examples that must be expressible: "AM done · PM overdue", a count ("3 logged"),
  "last logged 14:30", "Review due", "Deviation", or neutral "—" before data loads.

**D. Status surfaces (the overdue picture)**
- A **progress indicator** ("today's checks: X of Y done", with a %).
- An **overdue list** — the running list of what is late right now.
- Responsive split: on **phone/Sunmi**, a **collapsible top status strip** (tap to expand/collapse);
  on **iPad+**, a **fixed right-hand side panel** showing the same status + a **live clock** (date/time).

**E. Safety behaviours (must remain first-class)**
- **Audio alarm banner** — when a critical check goes overdue, the header turns red and pulses and an
  escalating alarm sounds; the banner is **tappable** (a tap is required to start audio on iOS).
- **Push-notification banner** — an "Enable alarms" prompt; once enabled, a small "alarms active" strip.

**F. Help panels** — a slide-up SOP overlay per tile, closeable.

**G. States to design** — loading (tiles render neutral until the status feed resolves; no full-screen
spinner on home), the door's loading/empty states, alarm-active vs calm, and the responsive
strip-vs-side-panel swap. Popups use an in-flow overlay (not OS-fixed) so they behave on all three devices.

### What's changing (the only deltas — everything else stays)
1. **Per-tile help shows the RIGHT text.** Today 8 tiles wrongly open the same "People" SOP. Each tile's
   "?" must open **its own** SOP text. (Mapping help to the formal HACCP policy documents is a separate
   future workstream — for now just show each tile's own existing guidance, correctly routed.)
2. **Remove the fake "Online" dot.** The current static green "Online" light is not wired to anything —
   delete it. Do not design a connectivity indicator in its place (the hub has no offline cache).
3. **Honest progress.** The "X of Y done" count must reflect the **full set of fixed daily mandatory
   checks** — Cold AM, Cold PM, Room AM, Room PM, Diary opening, Diary operational (mid-day), Diary
   closing, Cleaning — **not** the old partial count of 6. Design the progress element for this fuller set.
4. **Surface the mid-day diary.** The **"operational" (mid-day) diary** overdue signal must appear in the
   diary/Process-Room tile status AND in the overdue list, alongside opening and closing (today it is
   hidden). Three diary phases now visible: opening · operational · closing.
5. **Rename "Delivery" → "Goods In".** The tile and any heading read **"Goods In"**. (Label only — the
   underlying screen is unchanged.)

### Hard constraints
- **Reuse the design system's existing components** (tiles/cards, buttons, banners, status badges,
  keypad, overlays/sheets). New components require a one-line justification; prefer composing what exists.
- **Match the existing kiosk interaction patterns** — big gloved-finger tap targets, tap-to-expand status,
  tap-to-start-alarm, slide-up help. Optimise for iPad landscape first, then phone, then the small Sunmi
  portrait screen — the tile board must reflow gracefully across all three.
- **Status is conveyed by the system's semantic status colours** (complete/overdue/due/deviation/neutral) —
  a tile's colour and one-liner are the whole point of the screen; keep them unmistakable at a glance.
- This screen contains **no printed labels** — label artwork is server-side print HTML, out of scope here.
- **Do not drop or restyle anything in the "What already exists" list unless a delta above explicitly
  calls for it.**
