# UI Overhaul — Category 6: Execution Plan

**Status:** All planning categories (1–6) LOCKED. Building can start.
**Prerequisite reading:** `2026-06-01-ui-overhaul-locked-decisions.md` (Categories 1–4), `2026-06-01-ui-overhaul-design-tokens.md` (Category 5 — design system).
**Captured:** 2026-06-01

This is the "how to actually run the project" guide. It defines the build sequence, the per-surface workflow, the skills involved, and the gates. After this is merged, no more planning conversations needed — Claude Code + the skills do the work.

---

## 1. The build sequence (locked)

Seven items, in order. Each item is one or more PRs. Each PR is its own FORGE+ANVIL cycle. Do not parallelise — item N depends on item N−1's foundations.

### Item 1 — Design system foundation
Tailwind config + CSS variables generated from `docs/plans/2026-06-01-ui-overhaul-design-tokens.md` Appendix Section 8 (the `design-tokens.json` block).
**Visible to users:** No. Foundation only.
**Workflow flavour:** B (existing restyle — there's no design to mock; it's tooling).
**Dependencies:** None. Start here.

### Item 2 — Mobile nav refactor
Replace current `RoleNav.tsx` + `BottomNav.tsx` with the locked pattern: top 4 tabs visible + "More" overflow drawer. Update each role's nav matrix to include the new surfaces (Orders, Dashboards). Honour the "Desktop" badge on routes/runs.
**Visible to users:** Yes — every mobile user sees the new nav after this lands.
**Workflow flavour:** B.
**Dependencies:** Item 1 (tokens) must be in place.

### Item 3 — Desktop sidebar
New left-sidebar nav (collapsible) + top bar pattern. Replace the inconsistent desktop nav fallback that the mobile-tab strip provides today. Phase out `DesktopRouteNav.tsx`.
**Visible to users:** Yes — every desktop user.
**Workflow flavour:** B.
**Dependencies:** Item 1, Item 2 (nav matrices already updated for mobile = same matrix used here).

### Item 4 — URL renames + redirects
`/screen1 → /dispatch`, `/screen4 → /dashboard/admin`, `/screen5 → /admin` (with sub-routes for users/customers/products/export/permissions/audit), `/screen6 → /map`. Add 301 redirects from old paths so existing bookmarks don't break. Update middleware permissions + ROLE_HOME entries.
**Visible to users:** Yes — URLs in the address bar change. No visual change.
**Workflow flavour:** B.
**Dependencies:** None on Items 1–3. Could land in parallel with Item 1 technically, but cleaner to land after the nav work so all the nav buttons already point at the new URLs.

### Item 5 — Three dashboards (in this sub-order)
**5a. /dashboard/admin** — restyle existing /screen4 content per design tokens. No content changes — same charts, same data shapes. Just new visual treatment.
**5b. /dashboard/office** — NEW surface. Content brief in Category 1–4 doc Section 3 ("Dashboard content briefs").
**5c. /dashboard/warehouse** — NEW surface. Content brief in Category 1–4 doc Section 3. Must render well on mobile AND desktop (Hakan note: both equally important for warehouse).

**Visible to users:** Yes — admin gets restyle, office + warehouse get entirely new surfaces.
**Workflow flavour:** **5a = B** (restyle existing). **5b and 5c = A** (new surfaces — Claude Design mocks needed).
**Dependencies:** Item 1 (tokens). Item 4 (URLs in place for dashboards).

### Item 6 — Per-surface restyle of remaining pages
All other operational surfaces:
- /orders, /orders/new, /orders/[id], /orders/[id]/edit
- /dispatch (formerly /screen1)
- /complaints, /compliments
- /visits
- /cash
- /pricing
- /routes, /runs
- /driver
- /admin/users, /admin/customers, /admin/products, /admin/export, /admin/permissions, /admin/audit
- /map (formerly /screen6)
- /login

**Visible to users:** Yes — every surface refreshed.
**Workflow flavour:** B for all of these. They exist, they work, we apply tokens and patterns.
**Dependencies:** Items 1–5.

### Item 7 — View-as-role admin feature
Persistent banner, role switcher in user menu, permission impersonation per Category 1–4 doc Section 3.
**Visible to users:** Admin only.
**Workflow flavour:** B (new feature on the admin dashboard surface, but the surface itself has been restyled in Item 5a — so this just adds the toggle).
**Dependencies:** Item 5a.

### Out of scope
- HACCP (`/haccp/*`) — not touched by this overhaul.
- KDS (`/kds`) — no nav entry per locked decision. Visual style already established; not part of this restyle pass.

---

## 2. Per-surface workflow — Flavour A (NEW surfaces — dashboards)

This is the workflow for **net-new visual surfaces** that don't have a current version. Used by Items 5b and 5c.

### Step 1 — Generate Claude Design prompt
**Who:** Claude (this assistant), via `brand-prompt` skill.
**Input:** The locked design tokens doc + the dashboard's content brief from the Categories 1–4 doc + Hakan's verbal sketches if any.
**Output:** A precise, structured prompt formatted for Claude Design's input box. Includes: surface intent, content blocks, role context (desktop-primary or both), brand constraints (Navy chrome + Orange accents + functional palette + type ramp from tokens), responsive notes.

### Step 2 — Generate visual mocks
**Who:** Hakan.
**Action:** Open Claude Design (the product, claude.ai/design or similar), paste the prompt, generate mocks. Iterate via Claude Design's own loop if the first output isn't right.
**Output:** One chosen mock (screenshot or shareable link).

### Step 3 — Take it to Claude Code
**Who:** Hakan.
**Action:** Open Claude Code on Mac. Type:
```
/forge build /dashboard/office following the attached mock 
and docs/plans/2026-06-01-ui-overhaul-design-tokens.md. 
Content brief in docs/plans/2026-06-01-ui-overhaul-locked-decisions.md 
section 3.
```
Drag the mock screenshot into the chat or paste the link.

### Step 4 — FORGE runs (frame → order → render → guard)
**Who:** Claude Code + skills.
**Gates:**
- After Frame: Hakan approves the spec (what's being built)
- After Order: Hakan approves the plan (how it's being built)
- After Render+Guard: Hakan reviews PR
**Output:** Working code in a feature branch with the surface built.

### Step 5 — ANVIL runs (light)
**Who:** Claude Code + skills.
**Layers:** L1 unit (touched files), L4 E2E (new surface gets new spec). L2 pgTAP and L3 integration only if data layer touched (dashboards generally read existing endpoints, so usually skipped).
**Output:** Test report + green flag, or a list of fixes needed.

### Step 6 — Merge + deploy
**Who:** Hakan via Claude Code.
**Action:** Merge PR → main. Vercel auto-deploys.

---

## 3. Per-surface workflow — Flavour B (EXISTING restyle)

Used by Items 1, 2, 3, 4, 5a, 6, 7.

### Step 1 — Take it straight to Claude Code
No Claude Design step. Surface already exists. Hakan opens Claude Code, types something like:
```
/forge restyle /complaints per docs/plans/2026-06-01-ui-overhaul-design-tokens.md.
Mobile-first. Preserve all current functionality. 
Apply the new design tokens, the bottom tab + More drawer nav for mobile, 
and the sidebar nav for desktop.
```

### Step 2 — FORGE runs
Same as Flavour A Step 4. Same gates.

### Step 3 — ANVIL runs (light)
Same as Flavour A Step 5. Usually just L4 E2E to confirm the surface still works.

### Step 4 — Merge + deploy
Same as Flavour A Step 6.

---

## 4. Locked execution decisions

| Decision | Locked answer |
|---|---|
| **Sequence** | Items 1–7 in order. Sub-items 5a → 5b → 5c. Do not parallelise. |
| **Cutover model** | Hard-cutover. Each PR ships as it lands. No `UI_V2_ENABLED` feature flag. |
| **ANVIL coverage** | Per-surface, light. L1 + L4 by default; L2/L3 added only if data layer touched. |
| **Visual regression** | Add 1-2 visual assertions per restyled surface (e.g., header is present, primary action button visible, key data renders). Don't pixel-diff — that's brittle. |
| **PR size** | Each item = 1 PR. Item 5 splits into 3 PRs (5a, 5b, 5c). Item 6 splits into ~15 PRs (one per surface). Total: ~22 PRs across the overhaul. |
| **Reviewer** | Hakan reviews every PR before merge. |

---

## 5. Skills usage matrix

| Skill | When used | Who invokes |
|---|---|---|
| `mfs-brand-guidelines` | Reference, read-only | Implicit (already consumed by design tokens) |
| `graphic-designer-agent` | Already used for Category 5 — re-invoke only if tokens need extending | Claude (this assistant) |
| `brand-prompt` | Generating Claude Design prompts for Items 5b and 5c | Claude (this assistant) |
| Claude Design (product) | Visual mocks for 5b and 5c | Hakan |
| `frontend-design` | Informs implementer code patterns inside FORGE | Claude Code (auto) |
| `grill` | Phase 1 of FORGE ("Frame") | Claude Code (auto) |
| `planner` | Phase 2 of FORGE ("Order") | Claude Code (auto) |
| `implementer` | Phase 3 of FORGE ("Render") | Claude Code (auto) |
| `code-critic` | Phase 4 of FORGE ("Guard") | Claude Code (auto) |
| `forge` | Orchestrates the four FORGE phases with gates | Claude Code (auto on `/forge` command) |
| `anvil` | Post-FORGE production readiness check | Claude Code (auto on `/anvil` or as part of forge wrap-up) |

---

## 6. How to start (tomorrow, or whenever Hakan picks this up)

### First session — Item 1 (design system foundation)

1. Open Claude Code on Mac.
2. Type:
   ```
   /forge build the design system foundation. 
   Read docs/plans/2026-06-01-ui-overhaul-design-tokens.md Appendix Section 8 
   (the design-tokens.json block). Generate:
     - tailwind.config.ts updates exposing every token as a Tailwind utility
     - app/globals.css (or new file) with CSS variables for every token
     - typography.css with @font-face for GTF Adieu + Inter loading
   Do not change any UI yet — this is foundation only. 
   No visible change should result from this PR.
   ```
3. Walk through FORGE gates.
4. Run ANVIL (light — L1 only; tokens don't have runtime behaviour).
5. Merge PR.

### Second session — Item 2 (mobile nav)

1. Open Claude Code:
   ```
   /forge refactor mobile navigation. 
   Replace RoleNav.tsx + BottomNav.tsx with the new pattern: 
   top 4 tabs + "More" overflow drawer. 
   Use the role nav matrices in docs/plans/2026-06-01-ui-overhaul-locked-decisions.md 
   section 4 ("Nav patterns"). 
   Apply tokens from docs/plans/2026-06-01-ui-overhaul-design-tokens.md.
   Visible on mobile only; desktop nav addressed in Item 3.
   ```
2. FORGE → ANVIL → merge.

### Continue through Items 3, 4, 5a, 5b...

When you reach Item 5b (the first NEW dashboard — `/dashboard/office`):
- Come back to me in chat
- I'll generate the Claude Design prompt via `brand-prompt` skill
- You copy → Claude Design → mock → back to Claude Code

Repeat for 5c, then Item 6 surfaces one by one, then Item 7.

---

## 7. Estimate

Rough time investment, assuming you (Hakan) sit alongside Claude Code for each PR:

| Item | PRs | Approx time |
|---|---|---|
| 1. Design system foundation | 1 | 1 day |
| 2. Mobile nav | 1 | 1 day |
| 3. Desktop sidebar | 1 | 1 day |
| 4. URL renames | 1 | 0.5 day |
| 5a. /dashboard/admin restyle | 1 | 1 day |
| 5b. /dashboard/office (new) | 1 + Claude Design prompt round | 1.5 days |
| 5c. /dashboard/warehouse (new) | 1 + Claude Design prompt round | 1.5 days |
| 6. Per-surface restyle | ~15 PRs | 6–10 days |
| 7. View-as-role admin | 1 | 1 day |
| **Total** | **~22 PRs** | **14–18 working days** |

This assumes:
- One PR per day cadence at the heavier items (dashboards, complex surfaces)
- Two PRs per day on the lighter items (simple surfaces in Item 6)
- Hakan available to gate-approve and merge same day
- No major architectural surprises mid-build (ANVIL catches these early)

Risk multipliers:
- If GTF Adieu web license needs sorting → +0.5 day (fall back to Inter Bold is one-line change)
- If the brand-prompt skill produces poor Claude Design prompts on first try → iterate, +0.5 day per dashboard
- If a surface restyle reveals deeper structural issues → triage in chat, possibly defer the surface to a follow-up phase

---

## 8. What's NOT in this overhaul

Bookmarking for future phases:

- **HACCP visual consistency** — out of scope per Category 1. May revisit once the main app is in v2 and HACCP feels visually disconnected.
- **Brill Burger, MFS Credit Control, GetPriced** — separate codebases, separate brand applications, separate projects.
- **Order pipeline phase 2 backlog items** — see `docs/backlog/2026-06-01-order-pipeline-phase2.md`. Should land BEFORE this UI overhaul completes, ideally before Item 5 (dashboards) which depend on phase 2's permission widening.
- **Internationalization beyond current English/Turkish toggle** — current state preserved, not extended.
- **Theme toggle (user-preference light/dark elsewhere)** — KDS dark stays kiosk-only per Category 5 Q4.
- **Custom font self-hosting for GTF Adieu** — depends on license; flagged as outstanding action item.

---

## 9. Done state

The overhaul is "done" when:
- All 7 items have merged PRs
- All ~22 PRs have passed ANVIL light at minimum
- Hakan's staff have used the new UI for at least one week without major complaint
- Phase 2 backlog (separate) has either merged before this overhaul completes OR is queued behind it with no conflict

There's no separate "v2 launch event." Hard-cutover means staff see incremental visual improvements over ~3 weeks and the change feels gradual.

---

## 10. Decision log

All planning decisions across Categories 1–6 are now locked. No further planning conversations needed. If any decision needs revisiting once building starts, update the relevant doc:
- Categories 1–4 decisions: `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md`
- Category 5 (design tokens): `docs/plans/2026-06-01-ui-overhaul-design-tokens.md`
- Category 6 (execution): this file

Three docs. Single source of truth.
