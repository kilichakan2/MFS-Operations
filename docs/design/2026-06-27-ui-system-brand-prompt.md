# MFS-Operations — UI System Design Prompt (for Claude Design)

> **Paste this whole document into Claude Design.** It is the functional brief for a
> from-scratch, properly-architected UI **design system** for the MFS-Operations app —
> not a screen-by-screen restyle.
>
> **Brand source.** The MFS brand system — colours, fonts, type scale, spacing values,
> brand strategy — **already lives in Claude Design under the MFS brand**. Use that brand
> as the single source of truth for every visual value. This brief deliberately carries
> **no** hex codes, font names, or raw values: its job is to make the system *functionally
> complete* (which components, which states, which formats), so nothing the app already
> does gets dropped or reinvented. Where a value is needed, take it from the MFS brand,
> not from here.
>
> 🗣 In plain English: this is the "what the system must cover" list. The "what it looks
> like" comes from the MFS brand you already hold in Claude Design.

---

## 1 · What we're building

One disciplined, reusable design system for MFS-Operations — a warehouse/sales/food-safety
operations app (Next.js + React, Tailwind v3, TypeScript). The same system is intended to be
**reused across several future apps**, so design it as a coherent *family*, not a one-app kit.

The current app already has brand token *values* but: (a) they're duplicated in two files,
(b) there is **no semantic layer** (colours are named by hue, not purpose), (c) there is **no
shared component library** — every screen hand-rolls its own buttons, inputs, badges and modals,
producing ~664 hand-typed hex codes and ~1,070 raw-palette classes across ~50 files. This system
replaces all of that.

**Design goals**
1. A two-tier token system with a **semantic layer** components bind to.
2. One coherent, comprehensive component family (designed now, built in waves).
3. **First-class multi-format support** — handheld, phone, tablet/kiosk, desktop, PWA, Android webview.
4. Light **and** a unified dark theme from day one.
5. Accessibility (WCAG AA) baked into the system, not bolted onto screens.

---

## 2 · Token architecture (two-tier, semantic-first)

**Tier 1 — Primitive tokens.** Raw values from the MFS brand: full colour ramps, the spacing
scale, the type scale, radii, shadows, motion. These are the brand's vocabulary. Components
**never** reference these directly.

**Tier 2 — Semantic tokens.** Named by **intent**, mapping to primitives. Components reference
**these only**. Design at least these semantic groups (extend as needed):

- **Action:** `action.primary`, `action.secondary`, `action.ghost`, `action.danger`
  (+ hover / active / disabled states for each).
- **Surface:** `surface.base`, `surface.raised`, `surface.sunken`, `surface.overlay`,
  `surface.inverse`.
- **Text:** `text.body`, `text.muted`, `text.subtle`, `text.inverse`, `text.onAction`,
  `text.link`.
- **Border:** `border.default`, `border.strong`, `border.focus`, `border.subtle`.
- **Status** (these replace the app's current raw amber/green/red usage):
  `status.success`, `status.warning`, `status.error`, `status.info`, plus the domain
  statuses the app actually shows — `status.open`, `status.resolved`, `status.due`,
  `status.overdue`, `status.deviation`, `status.neutral`. Each needs a **fill**, a **soft
  background**, a **text/contrast** pairing, and a **border** variant.
- **Sync** (offline indicator — currently raw `bg-amber-400` / `bg-red-400`):
  `sync.syncing`, `sync.stuck`, `sync.clear`.
- **Focus ring:** a single `focus.ring` token used by every interactive component.

**Theming.** Define the **same semantic names** for **light** and a **unified dark** theme.
The dark theme must fold today's two divergent dark contexts into one skin: the KDS kitchen
display (`mfs-kds-*` tokens) and the HACCP kiosk (raw `slate-*`). Both light and dark are
first-class; a component looks correct in either by binding to semantic names only.

**Contrast is a property of the system.** Bake WCAG AA-safe pairings into the token set
(text-on-surface, text-on-action, status text-on-soft-bg) in **both** themes, so contrast is
decided once and inherited everywhere.

> **THE ONE HARD RULE:** components reference **semantic tokens only** — never a raw hex,
> never even a primitive. If this leaks, re-theming silently breaks. Treat it as an
> architectural rule (lint-enforced on new/touched code).

**Implementation notes for the build (not for Claude Design to decide, just context):**
single source of truth is **CSS custom properties**; **Tailwind v3** reads from those vars
(no Tailwind v4). This collapses today's double-declaration.

🗣 In plain English: two layers. The bottom layer is the brand's actual colours/sizes. The top
layer gives them *jobs* ("this is the primary button colour", "this is the error colour"). Every
component only ever asks for a job, never a specific colour — so re-skinning is changing the
bottom layer once.

---

## 3 · Multi-format & responsive (first-class requirement)

The system must work, and be designed, across **all** of these — not desktop-first with phone
as an afterthought:

| Format | Context | Key constraints |
|--------|---------|-----------------|
| **Small Android handheld** | Sunmi V3 (~5", warehouse, label printing) | tiny viewport, gloved/quick taps, often one-handed |
| **Phones** | iPhone + Android, ~360–430px | bottom-reachable actions, notch/safe-area |
| **Tablets / kiosk** | HACCP butcher kiosk + iPad, ~768–1024px, **touch, often landscape** | large touch targets, glanceable, stationary |
| **Desktop monitors** | 1280–1920px+, mouse | denser data, tables, hover affordances |
| **PWA standalone** | installed app | safe-area insets, no browser chrome |
| **Capacitor Android webview** | wrapped APK | must behave identically to PWA |

**Requirements**
- A **proper multi-step breakpoint scale.** Today the app crudely switches on a single `md`
  (768px) line — explicitly insufficient. Design at least: handheld / phone / tablet / desktop /
  wide, with sensible component behaviour at each.
- **Fluid layouts** — components reflow, not just hide/show at one breakpoint.
- **Touch targets ≥ 44–48px** in any touch context; provide a **touch equivalent for every
  hover-only affordance** (e.g. the desktop sidebar's hover-peek needs a tap path).
- **Safe-area-inset** (notch / home-indicator) support baked into chrome (header, bottom nav).
- **Orientation handling** — kiosk/tablet is frequently landscape.
- **Density modes** — the same component should be comfortable on a kiosk tablet *and* dense on
  a desktop data table.

🗣 In plain English: the system has to look right on a 5-inch warehouse scanner, a phone, a
butcher's wall tablet, and a big office monitor — and as an installed app. Every button must be
thumb-sized where fingers are used, and anything that only works on mouse-hover needs a tap version.

---

## 4 · Component catalogue

Design the **entire family below in one coherent sitting** so spacing, radius, focus rings and
states match across all of it. The **BUILD** column is for the engineering team's sequencing only
— **design all of them now** regardless of build tier (Hakan's call: comprehensive coverage,
"safer to have it there").

For **every** component specify: **purpose · prop/variant API · all states
(default / hover / focus / active / disabled / loading / error / empty / selected as applicable) ·
light + dark appearance · responsive & touch behaviour · required accessibility.**

**Accessibility per component (must be testable):** keyboard navigation, focus management
(traps for overlays, restore on close), correct ARIA roles/labels, a **visible focus ring**
(the `focus.ring` token), and contrast-safe states in both themes. Behaviour comes from **Radix
Primitives** under the hood; the design defines the visual skin and states.

### 4.1 · Grounded primitives — every one already exists by hand in the app

**Inputs**

| Component | Spec highlights | BUILD |
|-----------|-----------------|-------|
| **Button** | `variant=primary\|secondary\|ghost\|danger`, `size=sm\|md\|lg`, `loading`, `disabled`, leading/trailing icon slots, full-width option | Phase 0 |
| **IconButton** | icon-only button, required `aria-label`, same variants/sizes, ≥44px touch | Phase 0 |
| **TextField** | label, hint, error, prefix/suffix, sizes; states incl. error + disabled | Phase 0 |
| **Textarea** | auto-grow option, char count, error state | Phase 0 |
| **Select** | native-feel dropdown on Radix; keyboard + type-ahead; mobile-friendly | Phase 0 |
| **Checkbox / Radio** | grouped, label, indeterminate (checkbox), disabled | Phase 0 |
| **Toggle / Switch** | on/off, label, disabled; used for flags/settings | Phase 0 |
| **PIN Keypad** | 4-digit entry, filling dots, haptic vibrate, auto-submit on 4th digit, physical-keyboard fallback, error pulse, "Verifying…" state. Used by `/login` and the `/haccp` kiosk door | Phase 0 |
| **Picker (searchable)** | slide-up bottom-sheet selector, fuzzy search, selected tick, empty state, optional footer action ("+ New prospect"). Used for customer/prospect/product selection | Phase 0 |
| **FileUpload / Dropzone** | drag + tap-to-pick, progress, file list, errors. Used by cash uploads + documents | section-driven |
| **FormField wrapper** | consistent label + hint + error layout that wraps any input; ties error to input via ARIA | Phase 0 |

**Containers / layout**

| Component | Spec highlights | BUILD |
|-----------|-----------------|-------|
| **Card** | base + **link variant** (whole card tappable → navigates); padding/density options | Phase 0 |
| **KpiTile** | left accent stripe, large display value, sub-label, tap affordance (always navigable) | Phase 0 |
| **ListRow** | mobile stacked row, optional accent dot, trailing meta/action | Phase 0 |
| **Table** | `RowHead` + `TableRow` with custom column widths; **responsive: desktop table ↔ mobile cards**; sortable-ready | Phase 0 |
| **SectionLabel** | uppercase, tracked, muted caption | Phase 0 |
| **PageHeading** | eyebrow-style heading (the app deliberately avoids a big H1 in places) | Phase 0 |
| **CardHead** | icon + uppercase title + optional count pill | Phase 0 |
| **Tabs / SegmentedControl** | pill segmented control (e.g. range tabs today/week/month/quarter; filter chips All/Open/Resolved); keyboard arrow nav | Phase 0 |
| **Accordion / Collapsible** | expand/collapse sections (HACCP forms, long lists) | section-driven |

**Feedback / overlay**

| Component | Spec highlights | BUILD |
|-----------|-----------------|-------|
| **Modal / Dialog** | **centred AND bottom-sheet variants**; focus trap, ESC + backdrop close, scroll lock; loading/error/loaded body states | Phase 0 |
| **Banner / Alert** | `info\|warning\|error\|success`; inline or full-width; dismissible option. Generalises EditLockBanner, OrderCutoverBanner, OrderPipelinePausedNotice | Phase 0 |
| **Toast / Snackbar** | transient feedback, queue, auto-dismiss, action slot; a11y live-region | section-driven |
| **Spinner** | sizes, inline + block; accessible busy label | Phase 0 |
| **Skeleton** | shimmer placeholders for cards/rows/tiles | section-driven |
| **EmptyState** | icon + message + optional action; the "nothing to surface" state | Phase 0 |
| **Badge / Pill** | small count/label chips; variants | Phase 0 |
| **StatusPill** | semantic status chips bound to `status.*`: open/resolved/due/**overdue**/**deviation**/neutral/success/warning/error. Dot + label form. Covers HACCP tile states too | Phase 0 |
| **SyncDot** | offline indicator: **syncing** (pulse), **stuck** (≥3 retries ring), **clear** (hidden). Must bind to `sync.*` tokens — currently raw amber/red. Critical: signals data-loss risk to staff | Phase 0 |
| **ProgressBar** | determinate + indeterminate; HACCP progress, uploads | section-driven |
| **Tooltip** | hover + focus + long-press (touch); never the only way to convey info | section-driven |
| **Popover / DropdownMenu** | menu surface for the header 3-dot menu + desktop avatar menu; keyboard nav, focus return | Phase 0 |
| **Avatar** | initials/photo, sizes; used in desktop account menu | section-driven |

**Navigation chrome** (all **role-aware** — see cross-cutting §6)

| Component | Spec highlights | BUILD |
|-----------|-----------------|-------|
| **AppHeader** | mobile variant (logo + SyncDot + per-page actions + 3-dot menu) and desktop variant (wordmark + page title + actions + SyncDot + EN/TR pill + account menu); safe-area aware | Phase 0 |
| **BottomNav** | mobile bottom tab bar, 3–4 tabs + "More"; active state; safe-area | Phase 0 |
| **MoreDrawer** | slide-up bottom sheet for overflow tabs; backdrop/ESC/drag-handle close; "desktop-only" marker on items | Phase 0 |
| **DesktopSidebar** | left rail collapsed↔expanded with hover-peek **and a tap/pin path**; active item accent bar | Phase 0 |
| **NavItem primitives** | shared item rendering for all three nav surfaces; active/badge states | Phase 0 |

### 4.2 · Specialised surfaces — design the visual language now, build when the section comes

| Surface | Notes | BUILD |
|---------|-------|-------|
| **HACCP TileState tile** | kiosk grid tile with states complete / overdue / due / deviation / neutral; large touch target, glanceable | section-driven |
| **Map shell** | vendor-neutral wrapper around quarantined Leaflet (the only place the map vendor lives). **Restyle the surrounding page/controls**, but the map interior largely can't be tokenised (vendor CSS, inline-styled popups, raw-hex pins). Known deferred "Map container already initialized" re-mount bug — be aware | section-driven |
| **Print / label layouts** | separate **print render paths**, not on-screen pages: PrintLabelStrip (100mm AirPrint + 58mm Sunmi silent), orders picking-list print, PDF (jsPDF) + Excel (xlsx) exports. Design print-specific layout rules | section-driven |

### 4.3 · Speculative set — DESIGN now, **BUILD-ON-DEMAND** (no code until a real screen needs it)

Hakan explicitly wants these designed for coherence and future safety. **None are evidenced by
current screens** — flag each as build-on-demand so no speculative code is written or maintained
until a consumer exists:

Date picker · Date-range picker with presets · Calendar / scheduler view · Command palette ·
Rich-text / notes editor · Carousel · Stepper / Wizard · Data-grid (sort/filter/pagination) ·
Kanban / board · Timeline · Notification center · Combobox / multi-select · Slider · Rating ·
Tree view · Breadcrumb · Pagination.

🗣 In plain English: we're drawing these so that *if* a future screen needs a date picker or a
wizard, it already matches the family — but we won't write the code until something actually uses
it. Designing them is cheap; maintaining unused code is not.

---

## 5 · Cross-cutting concerns the design MUST preserve

These are app-wide behaviours that live in the seams and are easy to break in a redesign:

- **PWA / offline.** The **SyncDot** (header) and **RecentActivity** ("my activity today")
  list are how staff know whether their taps reached the server. Both must survive the redesign
  — dropping them would silently hide data-loss risk. PwaGuard bounces a backgrounded standalone
  app back to a sensible page. Design installed/offline states explicitly.
- **Android / Capacitor + Sunmi printing.** App ships as an Android APK; label printing is
  device-native (Sunmi V3) via the two-button PrintLabelStrip. Must look/behave right in the
  Android webview.
- **PIN keypad paradigm.** Sign-in is a 4-digit PIN pad (phone-unlock style), not a password
  field — a first-class component, used in two places.
- **Leaflet maps.** Quarantined behind adapters; restyle around them, accept limited interior
  theming.
- **Print / PDF / Excel surfaces.** Have their own layout rules; do not style as web pages.
- **EN / TR internationalisation.** App supports English + Turkish via a `t()` function with a
  header toggle. Coverage is partial (many hardcoded strings). **All new text must route through
  `t()`**, and a per-section translation audit is planned — design with variable-length strings
  in mind (Turkish runs longer).

🗣 In plain English: keep the offline "did my tap save?" signals, the PIN login, the Sunmi label
buttons, the maps, the print/export views, and the English/Turkish toggle. A pretty redesign that
quietly drops any of these would break real warehouse/food-safety workflows.

---

## 6 · Open items for Claude Design to settle

1. **The real display font.** Today `GTF Adieu` is declared but the font file was never shipped
   (license pending) — it silently falls back to Inter. Meanwhile headings actually render in
   **Plus Jakarta Sans**, wired in via raw CSS outside the token system. So the token name does
   **not** match what's on screen. **What is the intended MFS display/heading font?** Please
   resolve from the MFS brand and define the type system around the real answer (including a
   defined fallback if the licensed font isn't yet available).
2. **The spacing scale.** An owned spacing scale (`--mfs-space-*`, 8px grid + 4px half-steps)
   exists but is **unused** — screens use Tailwind's default spacing instead. Decide: adopt the
   owned scale as the system's spacing ruler (and wire it in), or formally standardise on
   Tailwind's default scale. Either is fine — pick one and make it the single ruler.

---

## 7 · Constraints (non-negotiable)

- **TypeScript strict.**
- **Semantic tokens only** in components — no raw hex, no primitives (lint-enforced on new/touched code).
- **One component library** — no per-screen forks of buttons/inputs/etc.
- **WCAG AA minimum**, contrast baked into token pairings in both themes.
- **Multi-format first-class** — handheld / phone / tablet-kiosk / desktop / PWA / Android webview.
- **Accessibility via Radix Primitives** behaviour; shadcn used only as a recoloured copy-in
  reference, never bulk-imported; every component re-pointed to semantic tokens.
- **No AI references** in commits, PRs, or code.
- **Brand values come from the MFS brand in Claude Design** — this brief defines function, not look.

---

*Deliverable wanted from Claude Design: the MFS-branded design system covering the full catalogue
above, in light + dark, across all formats, with the two open items resolved.*
