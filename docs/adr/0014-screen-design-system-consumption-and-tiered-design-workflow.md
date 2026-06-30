# 0014 — How screens consume the design system + the tiered design workflow

## Status

Accepted (ratified by Hakan 2026-06-30, UI Phase 1)

## Context

Phase 0 of the UI overhaul built the design-system code layer: `components/ui/`
(the reusable component library) + semantic tokens (`app/tokens.css`) + the
`semantic-tokens-only` / no-style-leaking-props ESLint rules (decisions #16/#17,
ADR-0009). Phase 1 now migrates ~46 existing screens (~22 of them HACCP) onto that
system, section by section, behind a per-section requirements-audit-first gate.

At the start of Phase 1 a process question surfaced that governs every one of those
screens: **how, exactly, does a screen "use" the design system, and must every screen
be visually mocked up before it's built?** Phase 0 produced the components but never
wrote down the per-screen workflow. Without a rule we'd either (a) mock up all 46
screens (most are standard forms/lists where a mockup just re-draws what the components
already dictate — wasted effort and slow), or (b) mock up none and risk novel screens
(kiosk boards, dashboards, maps) being designed ad-hoc in code. Neither is right.

The professional model separates two guarantees that are easily conflated:

- **Code consumption** — whether a screen is *assembled from* the system's components and
  tokens. This is an architectural invariant, enforced by tooling, true for every screen.
- **Design process** — whether a screen needs a visual mockup *before* it's built. This is
  risk-based: only screens that make a layout/interaction decision the system doesn't
  already determine earn a mockup.

This ADR codifies both so the rule is the same for all Phase 1 screens (and beyond).

## Decision

### Rule 1 — Code consumption (always, no exceptions)

Every screen in `app/**` / `components/**` is composed **only** from `components/ui/`
components and semantic tokens. No hand-rolled UI primitives, no hardcoded colours/fonts/
spacing/radii, no style-leaking props (`className`/inline `style`/raw widths) passed into a
`components/ui/` component — screens pass **semantic intent only** (decision #17). This is
enforced by the existing ESLint rules + the token rip-out test ("change the single token
source → every screen repaints, zero per-page edits"). Not a per-screen choice; an invariant.

### Rule 2 — Design process (tiered by novelty)

A screen gets a visual mockup **first** only when it makes a layout or interaction decision
the design system does not already determine. The Tier test, one line:

> **"Does this screen decide something visual the design system hasn't already decided?"**

- **Tier A — novel layout/interaction** → produce a visual mockup in Claude Design, get
  Hakan's approval, **then** FORGE builds to match. (Examples: the `/haccp` kiosk hub tile
  board, the KDS board, the `/map` view, admin dashboards.)
- **Tier B — standard composition** → no mockup; FORGE builds straight onto the components
  per the locked requirements, and the live preview is judged. (Examples: the HACCP
  data-entry/log forms — cold-storage, process-room, the review forms; standard CRUD
  list/detail screens.)

The tier is recorded per screen in the Phase-1 screen table of the UI roadmap
(`docs/plans/2026-06-28-ui-overhaul-roadmap.md` §5).

### Rule 3 — Component gaps

If building a screen reveals a pattern the system lacks, the missing pattern is added to
`components/ui/` **first** (it joins the "design now, build later" component list, roadmap §5),
then consumed. A gap is never solved locally on the screen. This keeps the system the single
source of truth and prevents per-screen divergence.

### Ordering vs the existing gate

This ADR slots *inside* the existing per-section loop, after the requirements-audit gate:
**(a) requirements audit FIRST → lock → (b) decide Tier A/B and design accordingly → (c)
test to depth.** It does not replace any gate; it makes step (b) explicit.

## Consequences

### Easier

- One written rule for all ~46 screens — no per-screen debate about "should we mock this up".
- Fast path for the majority (standard forms/lists go straight to build), mockup effort spent
  only where there's a real visual decision.
- The final token-binding audit (roadmap §8) becomes a confirmation, not a cleanup, because
  Rule 1 forbids style ever reaching a screen.

### Harder

- Someone must make the Tier A/B call per screen at step (b). The one-line test makes it
  cheap, and it's recorded in the roadmap, but it is a judgement, not a mechanical check.
- Tier A screens carry a Claude Design round-trip (brand prompt → generate → approve) before
  build — deliberately slower for the screens that warrant it.

### Neutral

- No code change in this ADR — it is process/architecture policy. Rule 1 is already
  tool-enforced from Phase 0; this ADR records the policy and adds Rules 2–3.
- First application: the `/haccp` hub is Tier A (novel kiosk layout) → visual mockup first.
  The HACCP core-CCP log forms that follow are expected Tier B.
