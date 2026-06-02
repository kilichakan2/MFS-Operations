# UI Overhaul — Locked Decisions (Categories 1–4)

**Owner:** Hakan Kilic
**Status:** Categories 1–4 locked. Category 5 (design tokens) and Category 6 (execution sequencing) pending.
**Last updated:** 2026-06-01 (late evening — discovery session post-cutover)

This document captures every decision locked during the UI overhaul planning conversation. Each category was worked through with explicit Hakan input — these are not assumptions or my recommendations carried over silently. Use this as the source of truth for:
- `graphic-designer-agent` to consume when generating the design system (Category 5)
- FORGE plans (Category 6) to scope per-surface work against
- ANVIL specs to assert behavioural correctness against new navigation rules
- Future Hakan if the overhaul is paused and resumed

---

## Category 1 — Scope

**In scope:**
- Group A — Order pipeline (just shipped): `/orders`, `/orders/new`, `/orders/[id]`, `/orders/[id]/edit`, `/kds`
- Group B — Operations day-to-day: `/screen1`, `/complaints`, `/compliments`, `/visits`, `/routes`, `/runs`, `/cash`, `/pricing`
- Group C — Admin/management: `/screen4`, `/screen5`, `/screen6`, `/driver`, `/api/admin` dashboards

**Out of scope (leave alone):**
- Group D — HACCP (`/haccp/*`) — recently audited and tuned for iPad use in the process room. Risk of breaking compliance work outweighs visual consistency benefit. Revisit in a future phase if needed.
- Group E — Other Hakan apps (Brill Burger, MFS Credit Control, GetPriced) — separate Vercel projects, separate codebases, not part of mfsops.com.

---

## Category 2 — Brand language

**Decision: Option 2 — MFS brand as launchpad, product language layered on top.**

- Use existing MFS brand colors as the starting palette
- Add a functional secondary palette (success / warning / danger / info) properly chosen for high-contrast operational readability — these don't currently exist in MFS brand because brand colors were defined for print/proposal materials
- Brand serifs reserved for headers
- Body text uses a system sans-serif optimised for screens (warehouse 6am, driver in van, butcher next to carcass)
- Brand presence at chrome edges: header logo, primary action color, login screen, key brand moments
- Everything else is product UI, not brand UI

The `graphic-designer-agent` skill will translate this into actual design tokens in Category 5. The existing `mfs-brand-guidelines` skill is read-only reference material for what's already defined.

---

## Category 3 — Information Architecture per role

### URL renames

| Current | New |
|---|---|
| `/screen1` | `/dispatch` |
| `/screen4` | `/dashboard/admin` (rename, no redirect — content stays) |
| `/screen5` | `/admin` (with sub-routes) |
| `/screen6` | `/map` |

`/admin` sub-routes (replacing in-page tabs):
- `/admin/users`
- `/admin/customers`
- `/admin/products`
- `/admin/export`
- `/admin/permissions`
- `/admin/audit`

Reasoning: in-page tabs aren't deep-linkable. Sub-routes are.

### Dashboards — three separate URLs (not one role-aware route)

- `/dashboard/admin` — existing /screen4 content moved here (renamed)
- `/dashboard/office` — NEW
- `/dashboard/warehouse` — NEW (must render well on phone as well as desktop)

Hakan's reasoning for separate URLs: "they don't remember to enter URLs anyway — they all login and navigate from home so sharing one URL was a bit stupid." Each dashboard is its own page; admin's view-as-role toggle navigates between them.

### Per-role landing matrix

| Role | Mobile lands | Desktop lands | Reasoning |
|---|---|---|---|
| Sales | `/orders` (filtered to own orders) | `/orders` (filtered to own orders) | Their book of orders at-a-glance + "+ Place new order" one tap away |
| Office | `/dispatch` | `/dashboard/office` | Mobile = working surface, desktop = glance dashboard |
| Warehouse | `/dispatch` | `/dashboard/warehouse` | Same pattern as office |
| Admin | `/dashboard/admin` | `/dashboard/admin` | Glance view both ways |
| Driver | `/driver` | `/driver` | Manifest is the job, no dashboard needed |
| Butcher | KDS only (iPad) | n/a | Out of scope — kiosk pattern |

Mobile vs desktop detected by viewport width on first render (<768px = mobile). Same user on phone and laptop lands differently — industry standard.

### Top 3 actions per role

| Role | Action 1 | Action 2 | Action 3 |
|---|---|---|---|
| Sales | Place order | Log visit | Log complaint |
| Office | Cash | Dispatch | Complaints |
| Warehouse | Dispatch | Complaints | Routes/Runs (both important) |
| Admin | Glance dashboard | Drill into outliers | Manage users/customers/products |
| Driver | View today's route | Log complaint | (phase 2: place emergency order) |

### Dashboard content briefs

These are the content shapes confirmed by Hakan for the new dashboards. Final layout and component design comes out of Category 5.

**`/dashboard/office`** (desktop-primary)
- Today's orders by state (placed / printed / completed counts)
- Open complaints to resolve
- Cash recon status (yesterday's drawer, unbanked cheques, this week's deposits)
- Today's dispatch summary

**`/dashboard/warehouse`** (mobile + desktop — both important)
- Today's printed orders ready to pick
- Today's routes & runs (driver assignments + stops)
- Recent goods-in dispatch entries
- Open complaints filtered to damage/receipt issues

**`/dashboard/admin`** (existing /screen4 — restyle, don't restructure)
- Open complaints (48h)
- At-risk accounts
- Unreviewed commitments
- This-week visits by rep
- This-week complaint categories
- Hunter/farmer ratios
- Prospects this week
- Average resolution hours
- Total complaints this week
- Charts: pie/bar/etc via Recharts (already wired)

### View-as-role (admin only)

Admin can impersonate any other role to debug "I can't see X" reports without logging in as them. Mechanics:
- Selector lives in the user menu (top-right)
- While active, a persistent banner at the top of every page reads "Viewing as Office (click to exit)"
- Banner is impossible to miss — prevents accidental decisions while impersonating
- Banner exit returns admin to their normal view

### KDS

`/kds` is the kiosk URL only — no nav button anywhere. The production-room iPad is bookmarked to this URL and stays on it. Not part of any role's day-to-day nav.

---

## Category 4 — Navigation patterns per device

### Mobile (sales, warehouse field, driver, office on phone)

**Pattern: bottom tab strip with top 4 items + "More" overflow drawer**

- Top 4 most-used items always visible at the bottom of the screen
- "•••" (More) button slides up a sheet with overflow nav items
- Icons + short labels (matching current `BottomNav` design pattern)
- Active item highlighted in primary brand color
- Safe-area inset respected (iOS home-bar)
- Hardware-compositing layer to keep iOS touch routing reliable (already implemented)

Example breakdowns:

- **Sales** — Visible: Orders, Visits, Complaints, More. In drawer: Pricing, Compliments, Routes (desktop badge), Runs
- **Office** — Visible: Dispatch, Cash, Complaints, More. In drawer: Pricing, Compliments, Routes (desktop badge), Runs, Dashboard
- **Warehouse** — Visible: Dispatch, Complaints, Routes, More. In drawer: Compliments, Runs, Dashboard
- **Admin** — Visible: Dashboard, Complaints, Pricing, More. In drawer: Cash, Compliments, Routes, Runs, Admin, Map, View-as

### Desktop (office, admin, warehouse desk users)

**Pattern: collapsible left sidebar + top bar**

Left sidebar (nav):
- Collapsed by default — icons only, ~60px wide
- Expands on hover or click to show labels (~220px wide)
- Active item highlighted with subtle bar + color shift
- Items in same per-role order as mobile (consistency)
- No badge counts (those live on dashboards)

Top bar:
- MFS logo (left)
- Page title or breadcrumb (middle)
- Right: sync dot, view-as-role selector (admin only), user menu (logout, language toggle), maybe global search later

### "Desktop badge" pattern

Currently in `RoleNav.tsx`, items like `/routes` and `/runs` carry a `badge: 'Desktop'` sub-label that renders below the icon — honest UX disclaimer that the surface is mobile-functional but better on desktop. Keep this pattern in the overhaul.

### View-as-role placement

Dropdown in the top-bar user menu (admin only). When activated:
- Persistent banner at top of every page: "Viewing as Office (click to exit)"
- Banner background uses warning color from the new functional palette
- Click banner anywhere = exit impersonation, return to admin view

### Badge counts on nav

**None.** Counts belong on dashboards (which everyone now gets). Keeps the nav visually quiet and avoids the per-page-load polling cost.

---

## Cross-cutting notes (not formally categorised yet)

### Existing nav components to reuse / evolve

- `AppHeader` (components/AppHeader.tsx) — already handles logo + title + sync dot + three-dot menu. Will get top-bar treatment for desktop in the overhaul.
- `BottomNav` (components/BottomNav.tsx) — primitive bottom tab strip, ready to extend with "More" drawer behaviour.
- `RoleNav` (components/RoleNav.tsx) — role-aware wrapper around BottomNav. Will need updating for new nav matrix + "More" overflow logic.
- `DesktopRouteNav` (components/DesktopRouteNav.tsx) — desktop-specific in-flow nav currently only used on /routes and /runs. The desktop sidebar pattern will likely replace this.

### What needs to land before the overhaul builds

The phase 2 order-pipeline backlog items (see `docs/backlog/2026-06-01-order-pipeline-phase2.md`) reshape permissions and visibility. Specifically:
- Item 4 — anyone can place an order (driver enters /orders/new)
- Item 1 — KDS shows all today/tomorrow orders + filter buttons (KDS UI changes)
- Item 2 — anyone can print picking list (permission widening)
- Item 3 — meat-only product catalog (data layer, mostly invisible to UI)

Recommendation: land phase 2 first, then UI overhaul builds against the final permissions/data shape. Avoids rework.

---

## What's NOT decided yet

### Category 5 — Design tokens (next)

The `graphic-designer-agent` skill will discover and lock:
- Color scales (brand + functional)
- Type ramp (font families, sizes, weights, line heights)
- Spacing scale
- Radii
- Shadows
- Motion / transitions
- Component primitives (button, input, card, modal, table, etc.)
- Output: a `design-tokens.json` (or equivalent) consumed by the codebase via Tailwind config + CSS variables

### Category 6 — Execution sequencing

Open questions for later:
- Surface-by-surface FORGE+ANVIL or one big rebuild?
- Order: nav-system first, dashboards next, then per-surface restyling? Or surface-by-surface complete?
- How to handle in-flight users during cutover — feature flag, gradual rollout, or hard switch?
- Estimate / timeline

This document gets extended with Category 5 + 6 outputs as those are locked.
