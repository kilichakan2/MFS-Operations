# UI System Rebuild — Process & Workflow

> **Live tracker is `docs/plans/2026-06-28-ui-overhaul-roadmap.md`** — status, decisions, design
> handover, and every screen live there. THIS doc is the stable *process contract* (the gates).
> The precise per-phase execution plan is written by FORGE's planner at Gate 1, and must honour
> the gates below. Companion artifacts: `docs/ui-current-state.md` (inventory) and
> `docs/design/2026-06-27-ui-system-brand-prompt.md` (Claude Design brief).
>
> **Current status (2026-06-28):** design delivered + reviewed (STRONG); next is FORGE Phase 0.

## Isolation & branching

- All work happens in the **`worktree-ui-system-rebuild`** git worktree
  (`.claude/worktrees/ui-system-rebuild`), based off certified `main`. Fully isolated from the
  parallel terminal sealing `main` (Day-16: CI, Vercel protection, closing audit).
- **Never commit to `main`. Never merge to `main`** until Hakan confirms the other terminal's
  closing audit has certified a stable `main` and merging is unlocked.
- Presentation layer only: `app/**` + `components/**`. Do NOT edit `lib/ports/**`,
  `lib/adapters/**`, `lib/wiring/**` (import existing wiring singletons only), `middleware.ts`,
  auth/RLS, `app/api/**` route auth, `.github/**`, or Vercel settings. New service/port/adapter =
  STOP and coordinate with Hakan first.

## The lane

`ui-cartographer` ✓ → `brand-prompt` ✓ → **Claude Design** (in progress, Hakan-driven) →
`FORGE` (planner writes the execution plan, builds) → `ANVIL` (test gate).

## Phase 0 — design-system foundation FIRST

Build before any screen is rebuilt:

1. Two-tier tokens (primitive → **semantic**), single source of truth in **CSS variables**,
   Tailwind v3 reads them. Light + unified dark (folds KDS + HACCP dark contexts).
2. Headless behaviour via **Radix Primitives** (single a11y vendor; justified). shadcn used only
   as a recoloured copy-in reference, never bulk-imported.
3. The core component library — **semantic tokens only** (lint-enforced on new/touched code).
   Absorbs the existing `app/dashboard/admin/_components/primitives.tsx`.
4. **Test the foundation:** token compilation + per-component behaviour/a11y via the bought stack
   (`jsdom` + `@testing-library/react` + `user-event` + `vitest-axe`) — keyboard nav, focus, ARIA,
   visible focus, contrast-safe states. Prove the deep module once.

Design scope is comprehensive (full ~30 grounded catalogue + speculative set), but **build in
tiers**: Phase 0 = core kit; speculative components are designed-only, **build-on-demand**.

## Phase 1+ — section by section, one at a time (HARD per-section gate)

For EACH section/screen, in this order — **confirm with Hakan before the next; never batch:**

- **(a) Requirements audit FIRST** — walk the section, document what it does, every business rule,
  every edge case/state. Confirm it has the correct info. **Proactively suggest NEW business logic
  worth adding** (with rationale) — the rebuild is a chance to correct/extend behaviour, not a
  silent like-for-like port. **Lock requirements before any UI is touched.**
- **(b) Redesign** the section's UI on the new system.
- **(c) Test** to the right depth — every rule captured or added in (a) gets a test that locks it;
  critical flows get E2E. Suite green before the section is "done".

## Testing approach

Belt-and-braces where risk is real; TDD red-green-refactor; tests at the right layer (unit for
logic, integration where parts connect, component + a11y for UI, E2E for critical flows). Build on
the existing repo test setup, not a parallel one. Right-size to blast radius. Include at least one
**Android-webview smoke** for the rebuild (the app ships as a Capacitor APK; web-only E2E is not
enough). Suite must pass before any section is considered done.

## Cross-cutting concerns to preserve (see inventory §6)

PWA/offline (SyncDot + RecentActivity), Android/Capacitor + Sunmi printing, PIN keypad, Leaflet
maps (quarantined), print/PDF/Excel surfaces, EN/TR i18n (route new text through `t()`;
per-section translation audit folded into step (a)), role-gated rendering (6 roles).

## Open items for Claude Design

1. The real display font (GTF Adieu declared-but-unshipped → Inter; headings actually render
   Plus Jakarta Sans via raw CSS). Brand must state the true intended font.
2. Spacing scale: adopt the owned `--mfs-space-*` ruler, or standardise on Tailwind's. Pick one.

## Constraints

TypeScript strict · semantic tokens only in components · one library, no per-screen forks ·
WCAG AA minimum · no new vendor SDK in the UI (Lego rule) · no AI references in commits/PRs/code ·
brand values come from the MFS brand in Claude Design.
