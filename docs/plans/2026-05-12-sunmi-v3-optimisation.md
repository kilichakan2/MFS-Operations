# Sunmi V3 Optimisation
**Created:** 2026-05-12
**Scope:** Sunmi V3 device only. iPad layout unchanged.

## Device context
Sunmi V3: 6.75" HD+ 720×1600px physical
CSS pixels: ~360–480px wide (Android DPR ~1.5–2.0)
Treated by browser as a large phone, not a tablet.

## Root cause analysis (full grill)

### Problem 1 — CRITICAL: Status sidebar (w-44 = 176px)
At 360px total width:
  tile area = 360 - 176(sidebar) - 32(padding) = 152px
  3 LargeTiles with gap-3 = (152 - 24) / 3 = 43px per tile
  43px wide tiles = COMPLETELY UNUSABLE. This is the #1 cause.

Fix: Convert sidebar to a collapsible compact strip below the HACCP header.
  Collapsed: shows time + date + completion % progress bar + overdue count badge
  Expanded: tap to open a bottom-sheet or inline panel with full CCP status
  Width freed: full 360px - 32px padding = 328px for tile grid

### Problem 2 — SmallTile grid: grid-cols-4
At 360px (no sidebar): (360 - 32 - 24) / 4 = 76px per tile
  Label text-[12px] + sub text-[10px] + icon 32px in 76px = severely cramped
  Touch targets ~40px height — below 44px minimum

Fix: grid-cols-2 base, md:grid-cols-4 at 640px+
  At 360px: (360 - 32 - 8) / 2 = 160px per tile — comfortable
  At 768px+ (iPad) (iPad): 4 columns restored — iPad unchanged

### Problem 3 — LargeTile rows (3 per row)
Without sidebar at 360px: (360 - 32 - 24) / 3 = 101px per tile
  Icon (36px) + label (text-sm) + sub (11px) + badge in 101px = cramped
  Not as critical as sidebar + SmallTile — usable but not great

Fix: flex-col on small screens, flex-row on sm:+
  Actually: keep 2 per row is better UX than 1 per row for HACCP tiles
  grid-cols-2 at base (was flex gap-3), md:flex md:gap-3 restored
  At 360px: (360 - 32 - 12) / 2 = 158px per tile — much better
  At 768px (md, iPad): back to flex 3-column — iPad unchanged

### Problem 4 — BottomNav text and icons
text-[9px] labels and w-5 h-5 icons — hard to read/tap on gloved hands
min-h-[48px] — adequate but could be larger

Fix: text-[10px], w-6 h-6 icons, min-h-[56px]

### Problem 5 — SmallTile touch target height
py-2.5 = ~10px padding each side → ~42px total height. Below 44px min.
Fix: py-3 = ~12px each side → ~46px total

### Problem 6 — HACCP header is custom (not AppHeader)
HACCP home uses its own header div, not AppHeader component.
No issues here — it's full width and fine.

## Files to change
1. app/haccp/page.tsx — sidebar → status strip, tile grid responsive
2. components/BottomNav.tsx — bigger icons, text, touch targets

## NOT changing
- AppHeader component (used by non-HACCP pages — fine on Sunmi)
- Any iPad-specific breakpoints (user confirmed iPad is fine)
- Login page (member cards at grid-cols-2 are fine at 360px)
- AuthKeypad (w-20 h-20 buttons are already good)
- Any non-HACCP page layouts

## Detailed changes

### 1. app/haccp/page.tsx

#### Status sidebar → Status strip

REMOVE: `<div className="w-44 flex-shrink-0 border-l ...">` sidebar block

ADD: StatusStrip component rendered between header and tile grid:

StatusStrip (collapsed by default):
  - Always visible, full width, below header
  - bg-slate-800, px-4 py-2
  - Left: clock (text-sm font-bold text-white) + date (text-[10px] text-slate-400)
  - Centre: progress bar (completion %) + "N/10 done" label
  - Right: overdue badge (red pill if any overdue) + chevron toggle button
  
StatusStrip (expanded, tap to toggle):
  - Grows inline to show CCP status rows
  - Each CCP row: name + status dot + reading
  - Same data as the old sidebar panel

State: const [stripOpen, setStripOpen] = useState(false)

#### LargeTile rows
Current: <div className="flex gap-3 flex-shrink-0"> with 3 flex-1 children

Change to: <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-shrink-0">
  At 360px: 2 columns = (360-32-12)/2 = 158px each ✓
  At 768px+ (iPad): 3 columns = restored ✓ (iPad unchanged)
  
Note: 6 LargeTiles across 2 rows → now could be 3 rows of 2 on phone.
That's fine — they scroll. Better usable than cramped.

#### SmallTile grid
Current: <div className="grid grid-cols-4 gap-2 flex-shrink-0">
Change to: <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-shrink-0">

#### SmallTile touch target
Current: py-2.5
Change to: py-3

#### LargeTile tileClasses
Current: 'rounded-2xl p-4 flex flex-col gap-2.5 ...'
No change needed — p-4 is fine at 158px width

#### Main layout container
Current: <div className="flex flex-1 overflow-hidden">
  with tile grid flex-1 and sidebar w-44
Change to: <div className="flex-1 overflow-hidden">
  (no sidebar = no need for flex row container)
  Tile grid becomes: <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto pb-20">
  pb-20 for BottomNav clearance

### 2. components/BottomNav.tsx
Icon: w-5 h-5 → w-6 h-6
Label: text-[9px] → text-[10px]
Min height: min-h-[48px] → min-h-[56px]
Padding: py-1.5 → py-2

## StatusStrip data needed
The strip needs these values from existing HomeScreen state:
  - now (clock — already computed)
  - pct (completion % — already computed in sidebar)
  - overdue array (already computed)
  - s?.cold_storage, s?.daily_diary etc. for expanded view

All data already exists in HomeScreen state. StatusStrip receives it as props.

## Layout after changes (360px Sunmi V3)
Header: ~48px
StatusStrip collapsed: ~36px
LargeTile row 1 (2 tiles): ~120px
LargeTile row 2 (2 tiles): ~120px
LargeTile row 3 (2 tiles): ~120px
Divider: ~1px
SmallTile grid (2 cols): ~N rows × 46px each
BottomNav: ~56px
Total: fits in 1600px height with room to scroll

## Tests
- npm run test 975 must still pass
- No unit test changes needed

## Manual smoke tests (on Sunmi V3 device)
- [ ] HACCP home loads — all 6 large tiles visible in 2-col grid
- [ ] All LargeTiles tappable — navigate to correct page
- [ ] SmallTiles in 2-col grid — all labels readable
- [ ] All SmallTiles tappable
- [ ] Status strip collapsed — shows time, date, progress, overdue count
- [ ] Tap status strip → expands to show CCP status
- [ ] BottomNav labels readable, icons clear
- [ ] BottomNav items tappable
- [ ] No layout on iPad changed (test on browser at 768px width)

## Risks
- StatusStrip data extraction: pct and overdue are computed deep in HomeScreen.
  Must pass as props to StatusStrip or compute inline. Prefer props.
- LargeTile grid-cols-2: CSS grid replaces flex. tileClasses includes flex-1
  which is for flex containers. Must remove flex-1 from LargeTile when inside grid.
  The tile already has flex flex-col inside — that stays. flex-1 on the tile
  itself is only needed in flex parent context. In grid context it has no effect
  (safe to leave or remove).
- SmallTile grid-cols-2 at phone: 10+ SmallTiles = 5+ rows. More scrolling.
  Acceptable trade-off for usability.
- BottomNav height change: pages with pb-[X] for BottomNav clearance may need
  updating. Current clearance is typically pb-20 (80px) or pb-24 (96px).
  Increasing BottomNav to 56px is within existing clearance. No page changes needed.
