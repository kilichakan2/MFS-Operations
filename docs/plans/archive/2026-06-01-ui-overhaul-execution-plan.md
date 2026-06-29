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

## 2. Per-pattern iterative workflow

The build progresses **one pattern (or item) at a time**, with explicit gates between Claude (this assistant), Hakan, Claude Design (the product), and Claude Code (on the Mac). Every visible surface gets a Claude Design mock before FORGE writes any code — otherwise FORGE's implementer makes design decisions on the fly and surfaces drift apart.

### Two kinds of work item

| Type | Description | Claude Design step | Items |
|---|---|---|---|
| **Tooling-only** | No visible UI change — config, redirects, build tooling | Skipped | Item 1, Item 4 |
| **Pattern-mocked** | Visible UI surface or pattern — needs a mock as anchor | Required | Items 2, 3, 5a, 5b, 5c, 6 (per pattern), 7 |

### Full iterative loop (pattern-mocked items)

```
Step 1  Claude         → generates ONE Claude Design prompt
                          (via brand-prompt skill + design tokens + content brief)

Step 2  Hakan          → reviews & approves the prompt in chat
                          OR pushes back, Claude revises

Step 3  Hakan          → copies prompt into Claude Design (the product)
                          generates mock, iterates inside Claude Design
                          if needed, picks one

Step 4  Hakan          → returns to chat, shows Claude the chosen mock
                          (screenshot, link, or description)

Step 5  Hakan + Claude → confirm together that the mock is right
                          OR Hakan tweaks Claude Design output and loops

Step 6  Claude         → generates the Claude Code /forge prompt
                          referencing both the design tokens AND the mock

Step 7  Hakan          → pastes /forge prompt into Claude Code on Mac
                          attaches the mock as reference

Step 8  Claude Code    → runs FORGE (frame → order → render → guard)
                          with Hakan gating each phase

Step 9  Claude Code    → runs ANVIL (light — L1 + L4 default)

Step 10 Hakan          → reviews PR, merges → Vercel auto-deploys

Step 11 Hakan          → returns to chat, confirms surface is live
                          OR reports any issues for next-pattern adjustment

Step 12 Move on to next pattern
```

### Truncated loop (tooling-only items)

```
Step 1  Claude         → generates Claude Code /forge prompt directly
                          (skip Claude Design — nothing to mock)

Step 2  Hakan          → pastes into Claude Code on Mac

Step 3  Claude Code    → runs FORGE + ANVIL

Step 4  Hakan          → merges PR, returns to chat with result

Step 5  Move on to next item
```

### Gates and approvals

- **Hakan approves the Claude Design prompt** before going to the product (Step 2)
- **Hakan approves the mock** before Claude generates the FORGE prompt (Step 5)
- **FORGE's own gates** fire inside Claude Code (after Frame, after Order, after Render+Guard)
- **Hakan reviews + merges PR** (Step 10)
- **No pattern advances** without all gates passing

### Why "one pattern at a time" and not "10 mocks upfront"

Trade-off:
- **Batched upfront** — generates all mocks early, fewer chat round-trips. Risk: a decision in pattern 1 (e.g. how cards look) doesn't propagate to pattern 5 because the mocks were locked before pattern 5 was reviewed.
- **Iterative (locked)** — slower per pattern but every pattern's mock can incorporate learnings from the previous one. The first one or two patterns set the visual language; later patterns inherit it. Higher consistency.

Hakan chose iterative.

### Pattern catalogue (referenced as Items 5–6 progress)

These are the visual patterns that get mocks. Some are reused across multiple surfaces.

| Pattern | Reused by surfaces |
|---|---|
| Mobile chrome (4-tab + More drawer) | All mobile surfaces |
| Desktop chrome (sidebar + top bar) | All desktop surfaces |
| Dashboard composition | /dashboard/admin, /dashboard/office, /dashboard/warehouse |
| List + filters | /orders, /complaints, /visits, /pricing, /runs, /admin/audit |
| Multi-step form | /orders/new, /complaints (new), /visits (new) |
| Detail view | /orders/[id], /complaints/[id], /visits/[id] |
| Admin CRUD table | /admin/users, /admin/customers, /admin/products |
| Map view | /map, /routes, /driver |
| Login + brand moment | /login |
| Banner + dropdown (view-as) | Admin chrome only (Item 7) |

Mock once per pattern; reuse across all surfaces sharing that pattern. Estimated total mocks needed: ~10.

---

## 3. Locked execution decisions

| Decision | Locked answer |
|---|---|
| **Sequence** | Items 1–7 in order. Sub-items 5a → 5b → 5c. Do not parallelise. |
| **Cutover model** | Hard-cutover. Each PR ships as it lands. No `UI_V2_ENABLED` feature flag. |
| **ANVIL coverage** | Per-surface, light. L1 + L4 by default; L2/L3 added only if data layer touched. |
| **Visual regression** | Add 1-2 visual assertions per restyled surface (e.g., header is present, primary action button visible, key data renders). Don't pixel-diff — that's brittle. |
| **PR size** | Each item = 1 PR. Item 5 splits into 3 PRs (5a, 5b, 5c). Item 6 splits into ~15 PRs (one per surface). Total: ~22 PRs across the overhaul. |
| **Reviewer** | Hakan reviews every PR before merge. |

---

## 4. Skills usage matrix

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

## 5. How to start (tomorrow, or whenever Hakan picks this up)

### Standard pattern — every item

Hakan opens a chat session with Claude. Says "ready for Item N" or similar. Claude generates the appropriate prompt (Claude Design prompt OR Claude Code FORGE prompt depending on item type). Hakan executes externally. Hakan returns to chat with the result. Move to next item.

### First session — Item 1 (design system foundation)

Tooling-only — no Claude Design step.

1. Open Claude Code on Mac.
2. Hakan asks Claude in chat: "ready for Item 1, give me the FORGE prompt."
3. Claude generates the prompt (no mock needed for this one).
4. Hakan pastes into Claude Code.
5. Walk through FORGE gates.
6. Run ANVIL (light — L1 only).
7. Merge PR.
8. Return to chat with the merge confirmation.

### Second session — Item 2 (mobile nav refactor)

Pattern-mocked — needs the **Mobile Chrome** pattern mock.

1. Hakan asks Claude in chat: "ready for Item 2, give me the Claude Design prompt for the mobile chrome pattern."
2. Claude generates the Claude Design prompt referencing locked design tokens.
3. Hakan reviews + approves the prompt.
4. Hakan opens Claude Design (product), pastes prompt, generates mock.
5. Hakan returns to chat with the mock.
6. Claude + Hakan confirm the mock is right (iterate if not).
7. Claude generates the Claude Code FORGE prompt referencing the mock.
8. Hakan pastes into Claude Code, attaches mock, runs FORGE.
9. ANVIL light.
10. Merge.
11. Return to chat to confirm + start Item 3.

### Items 3 onwards

Same loop as Item 2. Per-pattern. Claude is in the loop for **every item that needs a mock** — items 2, 3, 5a, 5b, 5c, and each pattern within Item 6 + Item 7. Tooling-only items (Item 1, Item 4) skip the mock step.

---

## 6. Estimate

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

## 7. What's NOT in this overhaul

Bookmarking for future phases:

- **HACCP visual consistency** — out of scope per Category 1. May revisit once the main app is in v2 and HACCP feels visually disconnected.
- **Brill Burger, MFS Credit Control, GetPriced** — separate codebases, separate brand applications, separate projects.
- **Order pipeline phase 2 backlog items** — see `docs/backlog/2026-06-01-order-pipeline-phase2.md`. Should land BEFORE this UI overhaul completes, ideally before Item 5 (dashboards) which depend on phase 2's permission widening.
- **Internationalization beyond current English/Turkish toggle** — current state preserved, not extended.
- **Theme toggle (user-preference light/dark elsewhere)** — KDS dark stays kiosk-only per Category 5 Q4.
- **Custom font self-hosting for GTF Adieu** — depends on license; flagged as outstanding action item.

---

## 8. Done state

The overhaul is "done" when:
- All 7 items have merged PRs
- All ~22 PRs have passed ANVIL light at minimum
- Hakan's staff have used the new UI for at least one week without major complaint
- Phase 2 backlog (separate) has either merged before this overhaul completes OR is queued behind it with no conflict

There's no separate "v2 launch event." Hard-cutover means staff see incremental visual improvements over ~3 weeks and the change feels gradual.

---

## 9. Decision log

All planning decisions across Categories 1–6 are now locked. No further planning conversations needed. If any decision needs revisiting once building starts, update the relevant doc:
- Categories 1–4 decisions: `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md`
- Category 5 (design tokens): `docs/plans/2026-06-01-ui-overhaul-design-tokens.md`
- Category 6 (execution): this file

Three docs. Single source of truth.
