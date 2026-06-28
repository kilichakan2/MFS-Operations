# 0009 — UI accessibility via Radix Primitives + the component-test stack

## Status

Proposed (raised by grill on 2026-06-28 — awaiting planner/human acceptance)

## Context

The from-scratch UI design-system rebuild (roadmap `docs/plans/2026-06-28-ui-overhaul-roadmap.md`)
builds a core component library — buttons, fields, dropdowns, dialogs, tabs, popovers, nav — that
must meet WCAG-AA: full keyboard operability, correct focus management (focus traps, restore-on-close),
and complete ARIA wiring. Hand-rolling that behaviour per component is the classic source of subtle,
hard-to-test accessibility bugs.

Two build-vs-buy decisions follow from that:

1. **The accessibility engine** behind interactive components — build it ourselves, or adopt a
   headless primitive library (Radix Primitives vs Headless UI vs React Aria).
2. **The test stack** that proves the components are accessible — today the repo has Vitest +
   Playwright but no in-process DOM testing or automated a11y assertions, so component-level
   keyboard/focus/ARIA/contrast cannot be verified at the unit layer.

Both are new `package.json` entries, which the project's dependency-justification rule requires be
recorded.

## Decision

**Adopt Radix Primitives** as the single accessibility engine for the new component library (one
new runtime dependency). Components own all visual styling via semantic tokens; Radix owns only the
unstyled behaviour (keyboard interaction, focus management, ARIA).

**Buy the component-test stack** as dev-only dependencies: `jsdom` (in-process DOM),
`@testing-library/react` + `@testing-library/user-event` (render + real user-interaction
simulation), and `vitest-axe` (automated WCAG assertions). These are test-only, in the same exempt
category as `fake-indexeddb`.

**Architecture classification:** Radix is a *presentation library*, not an external *service*. It is
in the same class as `recharts` / `lucide-react`, which ADR-0008-era work (F-27) deliberately did
**not** fence behind a port — the hexagonal "hide the vendor behind an owned port/adapter" rule
applies to swappable services (database, auth, payments), not UI toolkits. Radix may therefore be
imported directly in `components/**`; it does not require an owned wrapper or a `lib/adapters/`
entry. This ADR is its written justification.

## Consequences

**Easier:**
- Every interactive component inherits correct, tested keyboard/focus/ARIA behaviour instead of
  re-implementing it per component.
- Component a11y becomes verifiable at the unit layer (`vitest-axe` + Testing Library), so
  accessibility regressions are caught before E2E.
- One vendor for all primitives — consistent interaction patterns across the library.

**Harder:**
- Radix threads through every interactive component once the 0b core library is built, so it is
  expensive to replace later — this is the reversibility cost the decision accepts deliberately.
- Adds four dev dependencies to the test toolchain (maintenance + install surface), justified by the
  accessibility guarantee they enforce.

**Boundaries:**
- Radix is added in Phase 0a but used by zero components until 0b — installing it early is plumbing,
  not adoption.
- Radix carries no visual opinion; all appearance stays in the semantic-token layer, preserving the
  two-tier token rule (ADR-/roadmap decision: components bind to semantic tokens only).
