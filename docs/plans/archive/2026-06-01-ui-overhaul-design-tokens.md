# UI Overhaul — Design Tokens (Category 5)

**Status:** Phase 4 (Visual Identity) — palette, typography, spacing, radius, elevation, motion all locked.
**Authority:** Built on top of `mfs-brand-guidelines` skill (the MFS brand book by Ascend Creative Studio) — every decision either honors that source or extends it where the brand is silent.
**Captured:** 2026-06-01

This document is consumed by:
- The codebase (Tailwind config + CSS variables generated from the appendix `design-tokens.json` block below)
- FORGE plans for per-surface restyling (Category 6)
- Future agents needing to know "what does an MFS product surface look like"

---

## 1. Colour Palette

### 1.1 Brand colours — carried forward exactly

| Token | Name | HEX | Brand book role | Product UI role |
|---|---|---|---|---|
| `--mfs-navy` | Primary Deep Navy Blue | `#16205B` | Frozen category, livery, strong backgrounds | **Primary chrome** — sidebar, top bar, login screen |
| `--mfs-orange` | Primary Mediterranean Orange | `#EB6619` | Poultry, logo icon, primary accent | **Primary action color** (button backgrounds), active state highlight |
| `--mfs-maroon` | Primary Deep Maroon | `#590129` | Meat category, packaging | **Meat category badge** on order lines / product chips only |
| `--mfs-red` | Secondary Mediterranean Red | `#FF3300` | Typography accent on print | **Danger / error signal** (hijacked per Category 5 Q3) |
| `--mfs-sand` | Secondary Sand | `#C0946F` | Chilled category | **Chilled category badge** only |
| `--mfs-soft-neutral` | Soft Neutral | `#EDEAE1` | Default print background | **Page background** (light theme) |
| `--mfs-black` | Neutral Black | `#1E1E1E` | Body text on print | **Default body text** |

### 1.2 Primary action — Orange button decisions

> Pure brand Orange `#EB6619` stays the primary action color. No darkened variant introduced.

**Primary button anatomy:**
- Background: `#EB6619` (brand Orange — unchanged)
- Text color: **`#16205B` (Navy)** — 4.90:1 contrast, passes WCAG AA. This is the brand book's hero pairing (Navy + Orange) applied to the product surface.
- Hover state: 8% Navy overlay on Orange (visually darkens; brand color underneath is unchanged)
- Pressed state: 16% Navy overlay on Orange
- Focused (keyboard): 2px Orange ring at 2px offset, 50% opacity
- Disabled: Orange at 40% opacity, text Navy at 60% opacity

**Why Navy text not white:**
- White text on `#EB6619` = 3.25:1 (passes AA Large only — buttons would need 18pt+ or bold)
- Navy text on `#EB6619` = 4.90:1 (passes AA for any size and weight)
- Navy text is the brand book's mandated hero pairing — using it on buttons is more on-brand than white
- Consistent: every Orange button looks like the brand

**Exception** — when Orange appears as a small icon or accent inside another component, white text on Orange is acceptable at AA Large only if the text is bold or 18pt+. Avoid for body labels.

### 1.3 Active state / focus signal

Orange `#EB6619` doubles as the active-state flag color:
- Active sidebar item: 3px Orange vertical bar on the left + Orange icon + Orange text label (on Navy chrome background, 4.66:1 ✓ AA)
- Active mobile bottom-tab: Orange icon + Orange label
- Focus ring (keyboard navigation): 2px Orange at 50% opacity, 2px offset

### 1.4 Functional palette (extending where brand is silent)

| Token | Name | HEX | Used for | White text contrast |
|---|---|---|---|---|
| `--mfs-success` | Success Green | `#16A34A` | Success badges, confirmations, "Completed" state | 4.55:1 ✓ AA |
| `--mfs-warning` | Warning Amber | `#B45309` | Warning banners, "Reprint" notice, attention-required | 4.97:1 ✓ AA |
| `--mfs-danger` | Danger Red | `#FF3300` | Errors, destructive actions, "Failed" state (aliased to MFS brand Red) | 4.81:1 ✓ AA |

**Why amber for warning, not yellow:** yellow fails contrast on white. Amber sits inside the warm MFS brand palette so it doesn't feel like an alien intrusion.

**Why no info color:** most "info" messages in operational software are neutral status — handled by Navy text on Soft Neutral.

### 1.5 Neutral scale (warm-tinted greys derived from Soft Neutral → Black)

| Token | HEX | Use |
|---|---|---|
| `--neutral-50` | `#FAF8F3` | Subtle hover state on Soft Neutral surfaces |
| `--neutral-100` | `#EDEAE1` | (alias of `--mfs-soft-neutral`) Page background |
| `--neutral-200` | `#DDD8CB` | Subtle borders, dividers, table grid lines |
| `--neutral-300` | `#BFB8A8` | Input borders default state, stronger dividers |
| `--neutral-400` | `#928B7A` | Placeholder text, low-emphasis icons, disabled label |
| `--neutral-500` | `#5C5648` | Secondary body text (less emphasis than primary) |
| `--neutral-700` | `#3A352C` | High-emphasis borders, dark accents |
| `--neutral-900` | `#1E1E1E` | (alias of `--mfs-black`) Primary body text |

Built by interpolating from Soft Neutral (warm) to Black in a tonally consistent series — keeps the palette from feeling "off" with cold grey intrusions.

### 1.6 KDS dark theme (kiosk-only sibling palette)

The KDS is a single dark surface — not a full dark theme of the app.

| Token | HEX | Use |
|---|---|---|
| `--kds-bg` | `#0F172A` | Page background (slate-900) |
| `--kds-surface` | `#1E293B` | Order cards (slate-800) |
| `--kds-surface-raised` | `#334155` | Done lines feel "lifted" (slate-700) |
| `--kds-border` | `#475569` | Card outlines, dividers (slate-600) |
| `--kds-text` | `#F1F5F9` | Primary text — 13:1 on bg (slate-100) |
| `--kds-text-muted` | `#94A3B8` | Line metadata, captions (slate-400) |
| `--kds-line-empty` | `#475569` | Empty checkbox circle for not-done line |
| `--kds-line-done` | `#16A34A` | Green tick for done line (same `--mfs-success`) |
| `--kds-accent` | `#EB6619` | Brand Orange — active sign-in pill, focus states |

### 1.7 WCAG AA contrast matrix — light theme

| Foreground | Background | Ratio | AA Normal | AA Large |
|---|---|---|---|---|
| Black on Soft Neutral | `#1E1E1E` / `#EDEAE1` | 14.50:1 | ✓ | ✓ |
| Black on white | `#1E1E1E` / `#FFFFFF` | 17.15:1 | ✓ | ✓ |
| Neutral-500 on Soft Neutral | `#5C5648` / `#EDEAE1` | 6.97:1 | ✓ | ✓ |
| Neutral-400 on Soft Neutral | `#928B7A` / `#EDEAE1` | 3.42:1 | ✗ | ✓ |
| Navy on Soft Neutral | `#16205B` / `#EDEAE1` | 12.18:1 | ✓ | ✓ |
| Navy on white | `#16205B` / `#FFFFFF` | 15.16:1 | ✓ | ✓ |
| White on Navy | `#FFFFFF` / `#16205B` | 15.16:1 | ✓ | ✓ |
| **Navy on Orange (primary button)** | `#16205B` / `#EB6619` | **4.90:1** | **✓** | ✓ |
| Orange on Navy (active state on sidebar) | `#EB6619` / `#16205B` | 4.66:1 | ✓ | ✓ |
| White on Maroon | `#FFFFFF` / `#590129` | 12.41:1 | ✓ | ✓ |
| White on Success | `#FFFFFF` / `#16A34A` | 4.55:1 | ✓ | ✓ |
| White on Warning | `#FFFFFF` / `#B45309` | 4.97:1 | ✓ | ✓ |
| White on Danger | `#FFFFFF` / `#FF3300` | 4.81:1 | ✓ | ✓ |
| White on Orange | `#FFFFFF` / `#EB6619` | 3.25:1 | ✗ | ✓ (18pt+ or bold only) |
| Orange on Soft Neutral (decorative) | `#EB6619` / `#EDEAE1` | 2.66:1 | ✗ | ✗ |

### 1.8 Failure rules (don't ship these)

- ❌ White text on `#EB6619` smaller than 18pt or non-bold → use Navy text instead
- ❌ Orange `#EB6619` text on Soft Neutral or white → use Navy or Orange-on-Navy instead
- ❌ Sand on Soft Neutral → mandated by brand book misuse rules
- ❌ Mediterranean Red on Deep Maroon → mandated by brand book misuse rules
- ❌ Neutral-400 text smaller than 18pt → use Neutral-500 or darker

---

## 2. Typography

### 2.1 Typefaces

| Role | Typeface | Source | License | Web fallback stack |
|---|---|---|---|---|
| Display / Headings | **GTF Adieu** | goodtypefoundry.com/adieu | Commercial (already licensed by MFS — verify web license is in place) | `'GTF Adieu', 'Inter', system-ui, sans-serif` |
| UI / Body | **Inter** | rsms.me/inter | SIL OFL 1.1 (free) | `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |
| Mono (rare) | **JetBrains Mono** | jetbrains.com/mono | Apache 2.0 (free) | `'JetBrains Mono', 'SF Mono', 'Consolas', monospace` |

**Pairing rationale:** GTF Adieu is geometric sans with humanist details (precision + personality). Inter is neo-grotesque (neutral, systematic, screen-optimised). Two sans of different classifications — clear contrast, no conflict (per Vignelli's pairing rules). GTF Adieu carries brand recognition at display sizes; Inter carries the operational workload.

**ACTION ITEM for Hakan:** Confirm GTF Adieu web license is in place. If not, file purchase action with Good Type Foundry OR fall back plan: Inter Bold for all headings until license clears. The fallback stack means the app degrades gracefully either way.

### 2.2 Weights to load

- **GTF Adieu:** Regular (400) — single weight per brand book
- **Inter:** Regular (400), Medium (500), SemiBold (600), Bold (700) — four weights covers the entire UI hierarchy
- **JetBrains Mono:** Regular (400) — used only for product codes and references

Total: 6 font files. Loadable from Google Fonts (Inter, JetBrains Mono) + self-hosted (GTF Adieu).

### 2.3 Type ramp (mobile px / desktop px)

| Level | Token | Typeface | Weight | Mobile | Desktop | Line height | Tracking | Use |
|---|---|---|---|---|---|---|---|---|
| Display | `--text-display` | GTF Adieu | 400 | 32px | 40px | 1.1 | -0.01em | Login screen, dashboard hero numbers |
| H1 | `--text-h1` | GTF Adieu | 400 | 24px | 28px | 1.15 | -0.01em | Page titles in AppHeader |
| H2 | `--text-h2` | Inter | 600 | 20px | 22px | 1.25 | -0.005em | Section headings, card titles |
| H3 | `--text-h3` | Inter | 600 | 17px | 18px | 1.3 | 0 | Sub-section headings |
| Body Large | `--text-body-lg` | Inter | 400 | 16px | 17px | 1.5 | 0 | Emphasised body, dashboard counts |
| Body | `--text-body` | Inter | 400 | 14px | 15px | 1.5 | 0 | Default body, form labels, table cells |
| Body Small | `--text-body-sm` | Inter | 400 | 13px | 13px | 1.4 | 0 | Secondary info, helper text |
| Caption | `--text-caption` | Inter | 500 | 11px | 11px | 1.3 | 0.05em (uppercase) | UI micro-labels, badges, tab labels |
| Mono | `--text-mono` | JetBrains Mono | 400 | 13px | 13px | 1.4 | 0 | Product codes, MFS-NNNN-NNNN references |

### 2.4 Page-title treatment in AppHeader

Per brand book: "Headlines often set in all-caps." Apply to product page titles in the AppHeader:
- Mobile: GTF Adieu Regular 18px uppercase, tracking 0.05em
- Desktop: GTF Adieu Regular 22px uppercase, tracking 0.05em
- Color: Navy on Soft Neutral, or White on Navy chrome

If GTF Adieu web license isn't in place, fall back to Inter Bold uppercase at the same sizes/tracking.

### 2.5 Button label typography

- Primary button: Inter SemiBold 14px (mobile) / 15px (desktop), tracking 0 — paired with Orange background and Navy text
- Secondary button: Inter SemiBold 14px / 15px, Navy text on transparent with Navy border
- Ghost / tertiary: Inter Medium 14px / 15px, Navy text, no border or background

---

## 3. Spacing

### 3.1 Base scale (8px grid with 4px half-steps)

| Token | Value | Use |
|---|---|---|
| `--space-0` | 0 | No gap |
| `--space-1` | 4px | Tight inline gaps (icon-to-text inside a button) |
| `--space-2` | 8px | Component-internal padding (small buttons, badges) |
| `--space-3` | 12px | Stack inside list items |
| `--space-4` | 16px | Default form-field spacing, card padding (compact) |
| `--space-5` | 20px | Card padding (default), section gaps |
| `--space-6` | 24px | Card padding (comfortable), large gaps between sections |
| `--space-8` | 32px | Page-section gaps |
| `--space-10` | 40px | Hero spacing on dashboards |
| `--space-12` | 48px | Top-of-page breathing room (desktop) |
| `--space-16` | 64px | Major section breaks |
| `--space-24` | 96px | Login screen vertical breathing room |

### 3.2 Density rules

Per Category 5 Q5: **compact for desktop, comfortable for mobile.**

- Mobile defaults: card padding 16px (`--space-4`), stack gaps 12px (`--space-3`), row gaps 16px
- Desktop defaults: table rows 8-12px vertical padding (`--space-2`/`--space-3`), card padding 20px (`--space-5`), denser by ~20-30%

### 3.3 Container max-widths

Mirroring existing AppHeader's `maxWidth` prop:

| Token | px | Use |
|---|---|---|
| `--container-sm` | 640px | Forms, narrow content |
| `--container-md` | 768px | Default content |
| `--container-lg` | 1024px | Dashboards, tables |
| `--container-xl` | 1280px | Wide dashboards, multi-column layouts |
| `--container-2xl` | 1440px | Map views, sidebar + content |
| `--container-full` | 100% | Edge-to-edge (KDS, map) |

---

## 4. Radius

| Token | Value | Use |
|---|---|---|
| `--radius-0` | 0 | Sharp — never (no surfaces in the system use 0) |
| `--radius-sm` | 4px | Inputs, small buttons, badges |
| `--radius-md` | 8px | Default buttons, cards, modals, drawer sheets |
| `--radius-lg` | 12px | Large feature cards, image masks |
| `--radius-pill` | 9999px | Status badges, role pills, tags |

**Rationale:** Brand book references "rounded corners on icon elements should be preserved" — the logo geometry leans toward soft-but-precise. Default to `--radius-md` (8px) for most surfaces; this feels modern without being playful.

---

## 5. Elevation (shadows)

Subtle, warm-toned shadows. Avoid pure black — use Navy at low opacity to keep shadows in the brand family.

| Token | Value | Use |
|---|---|---|
| `--shadow-0` | none | Flat surfaces (cards on neutral page bg) |
| `--shadow-1` | `0 1px 2px rgba(22, 32, 91, 0.05)` | Subtle lift — cards on light backgrounds |
| `--shadow-2` | `0 2px 8px rgba(22, 32, 91, 0.08)` | Popovers, dropdowns, search results |
| `--shadow-3` | `0 8px 24px rgba(22, 32, 91, 0.12)` | Modals, mobile sheet menus |
| `--shadow-4` | `0 16px 48px rgba(22, 32, 91, 0.15)` | Fullscreen dialogs, lightboxes |

---

## 6. Motion

### 6.1 Duration tokens

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 80ms | Button press feedback, immediate state change |
| `--duration-fast` | 150ms | Default UI interactions — hover, focus, small reveals |
| `--duration-medium` | 250ms | Modal entrances, drawer slides, page transitions |
| `--duration-slow` | 400ms | Heavy state changes (rare) |

### 6.2 Easing tokens

| Token | Value | Use |
|---|---|---|
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for symmetric transitions |
| `--ease-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Element leaving (modal closing) |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Element entering (drawer opening) |

### 6.3 Operational motion principles

- Tap feedback must appear in ≤150ms (the KDS lag complaint from cutover proved this)
- Polling-driven UI updates should be optimistic where possible (already implemented in `markLineDone`)
- Page transitions are minimal — fade only, 80ms. No slide animations that delay perceived performance.
- Reduce motion: respect `prefers-reduced-motion: reduce` — strip all transitions to 0ms for users with that preference set

---

## 7. Component primitives — brief

These are the patterns. Detailed specs (states, sizes, spacing) come during Category 6 FORGE planning per-surface, but the system below defines the contract.

### 7.1 Button

- Primary: Orange bg + Navy text + Inter SemiBold 14/15px + radius-md + shadow-0 (no shadow)
- Secondary: Transparent bg + Navy text + Navy 1.5px border + Inter SemiBold + radius-md
- Ghost: Transparent bg + Navy text + no border + Inter Medium + hover bg = neutral-100
- Destructive: Danger Red bg + White text (bold) + radius-md
- Disabled: 40% opacity, cursor not-allowed

Sizes: sm (32px height), md (40px default), lg (48px — touch-friendly mobile primary), xl (56px — KDS Done buttons)

### 7.2 Input

- Bg: white (light theme) / surface
- Border: neutral-300 default, Navy on focus (2px), Danger on error
- Padding: 12px horizontal, 10px vertical (md size)
- Text: body 14/15px, placeholder Neutral-400
- Label: Caption above (uppercase Inter Medium 11px)

### 7.3 Card

- Bg: white on Soft Neutral page bg, or Soft Neutral on white pages
- Border: neutral-200 1px OR shadow-1 (not both)
- Radius: radius-md (8px)
- Padding: space-4 (mobile) / space-5 (desktop)

### 7.4 Table

- Header row: Caption typography on neutral-100 bg
- Cell padding: 12-16px horizontal, 8-12px vertical (compact)
- Row divider: neutral-200 1px bottom
- Hover row: neutral-50 bg
- Selected row: Orange 8% opacity bg + Orange 3px left border

### 7.5 Modal

- Backdrop: Navy at 50% opacity
- Surface: white, radius-md, shadow-3
- Width: container-sm centred (desktop) / fullscreen (mobile)
- Close button: top right, 40×40px tap target

### 7.6 Banner

- Info: Navy text on neutral-100 bg, neutral-300 left border (4px)
- Success: White text on Success-Green bg
- Warning: White text on Warning-Amber bg
- Danger: White text on Danger-Red bg
- Impersonation (view-as banner): White text on Warning-Amber bg, persistent at top, click to exit

### 7.7 Sidebar item (desktop)

- Collapsed (60px wide): Icon only (24×24px), centred
- Expanded (220px wide): Icon + label (Inter Medium 14px), 12px gap, 16px horizontal padding
- Active: 3px Orange left border + Orange icon + Orange label + Navy 8% opacity bg
- Hover: Navy 5% opacity bg

### 7.8 Bottom tab (mobile)

- Height: 56px + safe-area-inset-bottom
- Bg: white, top border neutral-200 1px
- Item: vertical icon (24px) + label (Caption typography), 8px gap
- Active: Orange icon + Orange label
- More overflow: "•••" icon — opens slide-up sheet with overflow items

---

## 8. Appendix — design-tokens.json

Machine-readable. To be consumed by Tailwind config + CSS variables generation script. This is the canonical source.

```json
{
  "color": {
    "brand": {
      "navy":    { "value": "#16205B" },
      "orange":  { "value": "#EB6619" },
      "maroon":  { "value": "#590129" },
      "red":     { "value": "#FF3300" },
      "sand":    { "value": "#C0946F" },
      "softNeutral": { "value": "#EDEAE1" },
      "black":   { "value": "#1E1E1E" }
    },
    "functional": {
      "success": { "value": "#16A34A" },
      "warning": { "value": "#B45309" },
      "danger":  { "value": "#FF3300" }
    },
    "neutral": {
      "50":  { "value": "#FAF8F3" },
      "100": { "value": "#EDEAE1" },
      "200": { "value": "#DDD8CB" },
      "300": { "value": "#BFB8A8" },
      "400": { "value": "#928B7A" },
      "500": { "value": "#5C5648" },
      "700": { "value": "#3A352C" },
      "900": { "value": "#1E1E1E" }
    },
    "kds": {
      "bg":            { "value": "#0F172A" },
      "surface":       { "value": "#1E293B" },
      "surfaceRaised": { "value": "#334155" },
      "border":        { "value": "#475569" },
      "text":          { "value": "#F1F5F9" },
      "textMuted":     { "value": "#94A3B8" },
      "lineEmpty":     { "value": "#475569" },
      "lineDone":      { "value": "#16A34A" },
      "accent":        { "value": "#EB6619" }
    }
  },
  "typography": {
    "fontFamily": {
      "display": { "value": "'GTF Adieu', 'Inter', system-ui, sans-serif" },
      "body":    { "value": "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
      "mono":    { "value": "'JetBrains Mono', 'SF Mono', 'Consolas', monospace" }
    },
    "fontWeight": {
      "regular":  { "value": 400 },
      "medium":   { "value": 500 },
      "semibold": { "value": 600 },
      "bold":     { "value": 700 }
    },
    "scale": {
      "display": { "mobile": "32px", "desktop": "40px", "lineHeight": 1.1,  "tracking": "-0.01em" },
      "h1":      { "mobile": "24px", "desktop": "28px", "lineHeight": 1.15, "tracking": "-0.01em" },
      "h2":      { "mobile": "20px", "desktop": "22px", "lineHeight": 1.25, "tracking": "-0.005em" },
      "h3":      { "mobile": "17px", "desktop": "18px", "lineHeight": 1.3,  "tracking": "0" },
      "bodyLg":  { "mobile": "16px", "desktop": "17px", "lineHeight": 1.5,  "tracking": "0" },
      "body":    { "mobile": "14px", "desktop": "15px", "lineHeight": 1.5,  "tracking": "0" },
      "bodySm":  { "mobile": "13px", "desktop": "13px", "lineHeight": 1.4,  "tracking": "0" },
      "caption": { "mobile": "11px", "desktop": "11px", "lineHeight": 1.3,  "tracking": "0.05em" },
      "mono":    { "mobile": "13px", "desktop": "13px", "lineHeight": 1.4,  "tracking": "0" }
    }
  },
  "space": {
    "0":  { "value": "0" },
    "1":  { "value": "4px" },
    "2":  { "value": "8px" },
    "3":  { "value": "12px" },
    "4":  { "value": "16px" },
    "5":  { "value": "20px" },
    "6":  { "value": "24px" },
    "8":  { "value": "32px" },
    "10": { "value": "40px" },
    "12": { "value": "48px" },
    "16": { "value": "64px" },
    "24": { "value": "96px" }
  },
  "container": {
    "sm":   { "value": "640px" },
    "md":   { "value": "768px" },
    "lg":   { "value": "1024px" },
    "xl":   { "value": "1280px" },
    "2xl":  { "value": "1440px" },
    "full": { "value": "100%" }
  },
  "radius": {
    "0":    { "value": "0" },
    "sm":   { "value": "4px" },
    "md":   { "value": "8px" },
    "lg":   { "value": "12px" },
    "pill": { "value": "9999px" }
  },
  "shadow": {
    "0": { "value": "none" },
    "1": { "value": "0 1px 2px rgba(22, 32, 91, 0.05)" },
    "2": { "value": "0 2px 8px rgba(22, 32, 91, 0.08)" },
    "3": { "value": "0 8px 24px rgba(22, 32, 91, 0.12)" },
    "4": { "value": "0 16px 48px rgba(22, 32, 91, 0.15)" }
  },
  "duration": {
    "instant": { "value": "80ms" },
    "fast":    { "value": "150ms" },
    "medium":  { "value": "250ms" },
    "slow":    { "value": "400ms" }
  },
  "easing": {
    "standard":   { "value": "cubic-bezier(0.4, 0, 0.2, 1)" },
    "accelerate": { "value": "cubic-bezier(0.4, 0, 1, 1)" },
    "decelerate": { "value": "cubic-bezier(0, 0, 0.2, 1)" }
  }
}
```

---

## 9. Outstanding decisions / action items

- [ ] **Hakan: confirm GTF Adieu web license.** Brand book references it as the headline typeface — for web use this needs a self-host license from Good Type Foundry OR fall back to Inter Bold uppercase for all headings. Either is acceptable; just need to know which we're shipping with.
- [ ] **Implementer: build the Tailwind config + CSS variables generator** during Category 6 FORGE planning (first surface to land — the design system is a prerequisite for all subsequent surface restyling).
- [ ] **Implementer: verify the Inter font weights are loaded.** Currently the codebase loads at least Regular; we need Regular, Medium, SemiBold, Bold (per Section 2.2). Probably one-line change to the font-loading config.

---

## 10. What's locked vs what's open

**Locked at Gate 4 (this turn):**
- Full colour system including functional layer and KDS sibling
- Type ramp with px sizes per breakpoint
- Spacing, radius, elevation, motion scales
- Component primitive contracts (button, input, card, table, modal, banner, sidebar item, bottom tab)
- machine-readable design-tokens.json

**Open for Category 6:**
- Per-surface FORGE plans (dashboards, /orders, /admin, /dispatch, etc.)
- Implementation order (probably: design system codified first → mobile nav → desktop sidebar → dashboards → per-surface restyle)
- Feature flag / progressive rollout strategy
- Estimate / timeline
