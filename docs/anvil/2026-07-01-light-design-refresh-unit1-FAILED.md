# ANVIL Failure Record — ❌ NOT CLEARED

Date: 2026-07-01
App: MFS-Operations
Branch: `feat/light-design-refresh-unit1`
PR: #110 — feat: light design-system refresh — Unit 1 (tokens · dark-removal · ScreenHeader · 2 CCP screens)
Preview tested: https://mfs-operations-miuosytt5-hakan-kilics-projects-2c54f03f.vercel.app (dpl_AnNAo76kriUHBjNMVNuSUyD3Wnwr, commit e0d13b7 — prod build)
Status: **❌ NOT CLEARED** — a real code bug blocks clearance.

> 🗣 In plain English: everything about the paint job is right except one thing — the
> title and buttons on the navy bar at the top of both check-in screens are rendering
> in dark text on the dark-navy bar, so they're basically invisible. That's a real
> code/config defect, not a bad test, so it goes back to the builder, not to me.

---

## Scope — what this covers

Skin-only LIGHT-theme colour refresh, Unit 1 (split scope — the hub `app/haccp/page.tsx`
and its alarm-red header are NOT in this unit). No DB, migration, RLS, edge function,
vendor, or new dependency. Files: `app/tokens.css`, `app/haccp/layout.tsx`,
`app/haccp/ThemeLock.tsx` (deleted), `app/haccp/cold-storage/page.tsx`,
`app/haccp/process-room/page.tsx`, `components/ui/ScreenHeader.tsx`,
`components/ui/Button.tsx`, `components/ui/IconButton.tsx`, `components/ui/index.ts`,
`CLAUDE.md`, `tests/unit/lint/haccp-screens-token-pure.test.ts`.

## Per-layer results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 3138/3138 | full suite on branch; incl. new `haccp-screens-token-pure` 4/4 |
| Lint guards | ✅ (within unit) | `semantic-tokens-only`, `reusable-visual-in-kit`, token-purity all green |
| Integration (Vitest, local Supabase Docker rung) | ✅ 554/554 | 44 files; global token remap regressed no API/route/DB behaviour |
| DB / RLS / pgTAP | n/a — not required | no schema / policy / data change in this diff |
| Edge Functions (Deno) | n/a — not required | none touched |
| E2E — preview `@critical` (prod build) | 🔴 FAIL | 91 passed · 2 real-bug fails (13, 16) · 1 environmental (25) · 1 flaky (04, passed on retry) |
| Populated UI smoke / breadth (existing HACCP flows) | ✅ | happy / deviation / CCA / quick-ref / handbook / back all pass on the LIGHT theme |
| Non-HACCP danger surface (matrix #4, spec 29 on `/complaints`) | ✅ | global danger/error/overdue/sync-stuck resolve to brand red; red-on-red-soft AA pass |

## The blocker (real code bug — do NOT fix in test)

**🔴 BLOCKER — `text-inverse` (and the whole `colors.text.*` utility group) is inert; the
navy ScreenHeader renders dark text on navy (illegible, WCAG-AA fail ≈1.2:1).**

- **Where:** `components/ui/ScreenHeader.tsx` (title `<h1 className="text-inverse …">` line 80;
  inverse back chevron line 65) and the `ghost-inverse` Button/IconButton variant
  (`components/ui/Button.tsx:48-52`, `components/ui/IconButton.tsx`) — all rely on the class
  `text-inverse`. Root of the defect: `tailwind.config.ts` — the color group is named `text`
  (`colors.text.inverse: 'var(--text-inverse)'`, ~line 24), so the *only* valid Tailwind text
  utility for that key is `text-text-inverse`. The literal class `text-inverse` therefore
  generates **no `color` rule at all**.
- **Live-DOM evidence (prod-build preview):**
  - Header title `<h1 class="text-inverse …">` → computed `color: rgb(30,30,30)` (`--mfs-ink-900`).
  - "Quick ref" ghost-inverse button → computed `color: rgb(30,30,30)`.
  - Header background → `rgb(22,32,91)` (navy). Contrast ≈ **1.2:1** (AA needs 4.5:1) → illegible.
  - Control: sibling eyebrow `text-action-primary` (color key `action-primary`, a valid
    utility) → `rgb(235,102,25)` orange, correct. This isolates the fault to the `text` group
    naming, not specificity or a stale deploy.
  - `--text-inverse` itself resolves to `rgb(255,255,255)` (white) — the token is right; the
    utility that should apply it never runs.
  - Deployed CSS bundle (`/_next/static/css/09983caf86ba6176.css`) contains **no `.text-inverse`
    rule** (and no `.text-text-inverse`).
- **Why it slipped past earlier gates:** on the OLD dark HACCP theme the default body text was
  already light, so the inert `text-inverse` was masked (light-on-dark looked fine). Flipping to
  the light theme with a navy header *island* is the first time the app needs `text-inverse` to
  actually emit white — exposing the latent utility-naming bug. The token-purity lint checks for
  raw hex/stock palette, not for whether a semantic utility compiles, so it passed.
- **Blast radius:** `text-inverse` is used across the kit (`AppHeader`, `DesktopSidebar`,
  `NavItem`, `MfsIcon`, the hub `app/haccp/page.tsx`). The fix (make `text-inverse` a real
  utility) is global — it will start emitting white on every inverse surface. FORGE must re-verify
  the KDS dark kiosk (`[data-theme="dark"]`, where `--text-inverse` = ink-900 is intentional) does
  not regress, and the hub header, when ANVIL is re-entered.

**Suggested fix (FORGE):** add a `textColor` mapping in `tailwind.config.ts` so `text-inverse`,
`text-body`, `text-muted`, `text-subtle`, `text-on-action`, `text-link` are valid text utilities
(e.g. `theme.extend.textColor = { inverse: 'var(--text-inverse)', body: 'var(--text-body)', … }`),
OR rename the `text` color group so `text-<shade>` resolves. Then re-run the full ANVIL ladder.

## Non-blocking findings

- **🟡 Environmental — spec `25-haccp-reviews › weekly` failed on the preview.** Known
  F-INFRA-08 once-per-period gremlin on the never-reset shared preview DB ("Weekly review
  submitted" toast never appears because the weekly slot was already consumed). Unrelated to this
  colour diff: no API/DB/logic changed, and the 554/554 local integration run (incl. HACCP
  reporting) is green. Not a blocker from this diff.
- **🟡 Flaky — spec `04-kds-line-undo` reopen-warning.** Failed once, passed on retry #1. Pre-existing
  KDS flake, unrelated to this diff.

## What was tried

- **Loop 0 (Nail):** diagnosed the CI red — the pre-existing `13-…-phase1.spec.ts:163` asserted the
  OLD dark theme (`data-theme="dark"`, dark bg, zero light surfaces). Correctly reclassified as a
  **stale/broken test** (its failure *confirms* the screen went light). Rewrote it + added a
  process-room light-render test (spec 16) + a non-HACCP brand-red test (spec 29) + shared probe
  helper (`tests/e2e/_theme.ts`). These assert the LIGHT intent from the approved matrix.
- **Loop 1 (Verify):** unit ✅, integration ✅, preview E2E → the new light-render tests failed on
  assertion (c) (inverse header text). Ran two targeted DOM probes against the live preview to
  distinguish test-bug vs code-bug; confirmed at the rendered-DOM AND built-CSS level that
  `text-inverse` is inert. Classified as a real code bug → stop, do not fix product code.

## Root-cause hypothesis (one sentence)

The kit writes the class `text-inverse`, but because the Tailwind color group is named `text`
(`colors.text.inverse`), the only compiled utility is `text-text-inverse`, so `text-inverse` emits
no `color` rule and the navy ScreenHeader's title/back/actions inherit the dark body text —
illegible on navy and failing WCAG-AA.

## Suggested eject route

**/rerender** (fix in place — Tailwind config/utility wiring; not a plan or spec defect), then
re-enter ANVIL and re-run the full ladder (the fix is global — re-verify the KDS dark kiosk and the
kit headers).

## Rollback

No DB, no migration → nothing to roll back at the data layer. PR #110 is not merged; "rollback" =
do not merge (or `git revert` the squash-merge commit if it lands). PITR: N/A.

## Verdict

❌ NOT CLEARED — 1 real code blocker (illegible inverse header text). No clearance certificate issued.
