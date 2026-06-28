# ANVIL Clearance Certificate (DRAFT)

Date: 2026-06-28
App: MFS Operations
Branch: feat/ui-phase-0a-foundation
PR: none (branch NOT pushed; isolated `worktree-ui-system-rebuild`; does NOT merge to `main` until the whole UI overhaul is done AND Hakan unlocks)

## Verdict

⏳ **PENDING — NOT YET CLEARED**

All re-confirm rungs (unit, component, guards, typecheck, build) are green, the
database/security rungs are justifiably N/A, and the live **visual smoke proves the
foundation renders correctly with the new tokens live**. The one outstanding rung is
the **E2E `@critical` suite**: it ran 62/75, and all 13 failures are traced to the
**test environment** (a dirty shared local DB + the dev-server Leaflet double-mount) —
**none are attributable to the Phase 0a change**. A definitive all-green E2E needs a
fresh `npm run db:reset` on the shared local Supabase instance, which the runner did NOT
perform (a second terminal shares that instance; reseeding it is the conductor's call).

🗣 In plain English: every desk-check passes and the screens visibly wear the new brand
paint and fonts with no breakage. The only thing not fully green is the big browser
regression suite — and the reason is the shared test database was left messy by earlier
runs and maps don't mount on the dev server, NOT anything this branch did. To turn it
fully green someone needs to wipe-and-reseed the shared local DB (which would disturb the
other terminal), so that decision is handed up to the conductor.

## Conductor decision (2026-06-28) — DEFER the clean-DB E2E to merge-time

Hakan's call: **accept PENDING; do NOT `db:reset` now.** Rationale — (1) the branch is not
merging today (merge gated until Hakan opens the window), so a fully-CLEARED cert isn't
required yet; (2) the foundation is already strongly proven (green build/tsc/unit/component
+ a live 6-screen prod-build visual smoke) and all 13 E2E failures are conclusively
environmental, with the new tokens visibly live in the failing DOM; (3) the parallel
terminal (main seal) is now DONE, so the shared local DB is free — the clean-DB run is a
cheap, unblocked step best done at the merge window.

**Exact step that flips this cert PENDING → CLEARED (the 0a pre-merge gate):**
`npm run db:reset` (DB now ours alone) → `npx playwright test --project=chromium --grep @critical`
against a production build → confirm 75/75 green → update this cert to CLEARED. Then proceed
with the merge handover (docs/plan refresh + terminal-1 handover prompt).

---

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `app/tokens.css` (new two-tier token layer), `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx` (Adieu+Inter via next/font; Plus Jakarta retired) | Low (presentation-only) | Unit, component, guards, tsc, build, visual smoke, E2E functional regression | Unit ✓, component ✓, guards ✓, tsc ✓, build ✓, visual smoke ✓, E2E **partial (62/75)** |
| `vitest.config.ts` (unit/component lane split), `tests/component/**` (jsdom+RTL+axe stack), `tests/unit/design-system/**`, `tests/unit/lint/**`, `tests/unit/tokens/**` (guards) | Low | Unit + component | ✓ |
| `package.json` / `package-lock.json` (radix-ui runtime dep + 4 test devDeps) | Low | Build + vendor-fence guard | ✓ |
| docs/* , public/fonts/adieu/* | None | — | n/a |

**Not run under the efficiency dial:** Integration, pgTAP/RLS, Edge (Deno) — deliberately
N/A: the diff contains **no migration, no API/route, no service/adapter, no RLS policy**
change (`git diff main...HEAD -- supabase/**` and `app/api/**`, `lib/**` are empty of
functional change). PITR N/A — no destructive migration, nothing to restore.

**Baseline characterisation pass?** No — diff-driven, presentation-only.

🗣 The skipped rungs aren't laziness: there's no database structure, server route, or
security rule in this change for them to test, so running them would only produce
empty/vacuous passes.

---

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest, `--project unit`) | ✅ 2710/2710 | `npx vitest run --project unit` — 186 files |
| Component (Vitest jsdom, `--project component`) | ✅ 4/4 | render + click + keyboard-Enter + axe (no a11y violations) |
| Guards (token-resolve, semantic-tokens-only, vendor-fence) | ✅ 12/12 | `npx vitest run tests/unit/tokens/token-resolve.test.ts tests/unit/lint/semantic-tokens-only.test.ts tests/unit/lint/vendor-fence-complete.test.ts` |
| Typecheck | ✅ clean (exit 0) | `npx tsc --noEmit` |
| Build | ✅ green (exit 0) | `npx next build` (also produced the prod build used for the visual smoke) |
| Integration (Vitest, real DB) | ⏭️ n/a — not required | no API/DB/service change |
| Database (pgTAP / RLS) | ⏭️ n/a — not required | no migration, no policy change |
| Edge Functions (Deno) | ⏭️ n/a — not required | none touched |
| Local full-stack rung | ✅ partial | Supabase CLI adapter (local stack already up, seeded); used for the E2E + visual smoke below |
| Visual smoke (live, prod build) | ✅ populated | 6 screens — tokens proven LIVE (see below) |
| E2E (`@critical`, Playwright, local) | ⚠️ **62/75 — 13 env failures** | `npx playwright test --project=chromium --grep @critical` — all 13 traced to environment, none to this change (see below) |
| Breadth crawl | ⏭️ not run | covered for this CSS-only change by the visual smoke (6 representative screens) + the 62 passing `@critical` specs; full crawl deferred to the conductor's clean-env re-run |

### Visual smoke — tokens proven LIVE (production build, local Supabase)

Ran a chromium script against a **production build** (`next build && next start`, port 3000)
wired to local Supabase. Per-screen: rendered (non-blank), computed colour/font reflect
NEW token values, console-error count captured.

| Screen | Render | New `--mfs-orange-500` | body bg = `--surface-base` | font | console errors |
| --- | --- | --- | --- | --- | --- |
| `/login` (light, public) | ✅ 136 chars | `#EB6619` ✓ | `rgb(237,234,225)` = `#EDEAE1` ✓ | Inter ✓ | 0 |
| `/orders/new` (sales) | ✅ | `#EB6619` ✓ | ✓ | Inter ✓ | 0 |
| `/haccp` home (office) | ✅ | `#EB6619` ✓ | ✓ | Inter ✓ | 0 |
| `/haccp/cold-storage` CCP (office) | ✅ renders | `#EB6619` ✓ | ✓ | Inter ✓ | 2 (harness 401 — see note) |
| `/dashboard/admin` (admin) | ✅ 581 chars | n/a probe | `rgb(237,234,225)` ✓ | Inter ✓ | 0 |
| `/map` (admin) | ✅ leaflet mounts (1 container, 24 tile/marker/pane nodes) | `#EB6619` ✓ | ✓ | Inter ✓ | **0, no "Map container already initialized"** |
| `/kds` (light PIN gate) | ✅ 84 chars | — | light | Inter ✓ | 0 |

- `--font-display` resolves to `"adieu","adieu Fallback",Inter,system-ui,sans-serif`;
  `--font-text` to `"Inter","Inter Fallback"` — Adieu+Inter wired through next/font;
  **Plus Jakarta Sans retired** (absent from every computed font stack).
- The cold-storage 2 console errors were a **401 from the smoke harness** (it used a
  generic `office` team-login that the cold-storage API rejects) — an auth/role mismatch
  in the probe, **not** a paint/render fault; the screen itself rendered with live tokens.
- **Dark theme + compact density:** the `[data-theme="dark"]` and `[data-density="compact"]`
  token blocks exist in `app/tokens.css` but are referenced by **no** `app/`, `components/`,
  or `lib/` code yet (grep-confirmed) — by design, they are scaffolding for Phase 0b
  components to opt into. There is therefore no live dark/compact screen in 0a; their
  correctness is a **static** guarantee, pinned by the `token-resolve` unit test
  ("defines the dark theme + compact density override blocks").

🗣 Plain English: on real screens in a real browser, the new orange, the new background,
and the Adieu+Inter fonts are all genuinely applied — proof `tokens.css` is live, not
stale. The old Plus Jakarta font is gone. Dark mode and compact mode are built and verified
on paper but no screen is switched onto them yet — that's Phase 0b's job.

### E2E `@critical` — the 13 failures, fully traced (none are this change)

`npx playwright test --project=chromium --grep @critical` → **62 passed, 13 failed** (incl. all
20+ stateless HACCP/admin/dashboard/complaints render screens passing). Root cause of each
failure, confirmed by re-running the order pipeline against the **production build** and by
querying the local DB directly:

| Failing specs | Root cause | Evidence | This change? |
| --- | --- | --- | --- |
| `05-routes-planner-map`, `06-map-view-markers` | Dev-server React-StrictMode **Leaflet double-mount** (documented in the stack reference) | Only these 2 carried the Next.js dev "1 Issue" overlay; under a **production build** `/map` mounts clean (1 container, 24 nodes, **0** console errors, no "already initialized") | No |
| `01-order-place` (×2) | **Dirty shared DB**: a stray `ANVIL-TEST-product-f20pr2` row from a prior F-20 integration run makes the product picker match 2 elements → Playwright strict-mode violation | Re-run error: `strict mode violation … resolved to 2 elements: ANVIL-TEST-product / ANVIL-TEST-product-f20pr2 10`; failing button's own classes carry the NEW tokens (`border-[#EDEAE1]`, `ring-[#EB6619]`) | No |
| `02-picking-list-print` (×3), `03-kds-butcher-flow`, `04-kds-line-undo` (×3) | **Cascade** from `01` — no order created ⇒ nothing to print ⇒ empty KDS board | KDS snapshot reads "No orders to cut. Cards appear here when the office prints a picking sheet." | No |
| `13-haccp-cold-storage` (×2) | **Dirty shared DB**: a stray `ANVIL-TEST-chiller` (6th unit) leaves the cold-storage form incomplete → submit button stays `disabled` | DB query: 6 units vs the seed's 5; submit button resolved `disabled` with class `bg-[#EB6619]` (new orange) | No |

The order/print/KDS/cold-storage specs explicitly require a **fresh `npm run db:reset`**
(spec header, `01-order-place.spec.ts:22-26`). The shared local instance had **not** been
freshly reset (it carried stray `ANVIL-TEST-*` artifacts from earlier integration runs). The
runner did **not** reset it, to avoid disturbing the second terminal sharing that instance.

🗣 Plain English: the suite is mostly green; the failures are the test kitchen being left
messy by previous cooks (extra test rows that confuse "pick the one named X") plus maps
disliking the dev server. The new paint is visibly present in the very buttons that failed.
A clean wipe-and-reseed of the shared DB would clear all of it — that wipe is the conductor's
call because another terminal is using the same DB.

## Warnings (non-blocking)

- 🟡 The shared local Supabase carries stray `ANVIL-TEST-*` fixtures (extra product + extra
  cold-storage unit) from prior integration runs — fixture pollution, not a code defect.
  A `db:reset` clears it.

## Real-code bugs found

**None.** No failure is attributable to the Phase 0a diff. No FORGE eject recommended.

## Migration

None. No `supabase/migrations/**` change in the diff.
Rollback script: N/A — no migration.
PITR confirmed: N/A — no destructive migration, nothing to restore.

## Merge Sequence

N/A for this run — branch is NOT to be pushed/PR'd/merged. It stays on the isolated
`worktree-ui-system-rebuild` branch and merges to `main` only after the whole UI overhaul is
complete AND Hakan unlocks (per the Phase 0a plan: "no live app to protect").

## Manual smoke at merge

**Still advised / outstanding** — the one unproven required check is a clean-environment E2E
`@critical` run. Everything else (build, tsc, unit, component, guards, live visual smoke,
map-mount-under-prod-build) is proven. Outstanding item for the conductor:

- Run `npm run db:reset` (clean the shared local instance, with the second terminal's
  agreement) **then** re-run `@critical` against a **production build** — OR accept the
  reduced matrix for this CSS-only, unmerged-foundation branch given: build+tsc green, the
  visual smoke proves tokens live with no blank screens, and every E2E failure is traced to
  the environment with the new tokens visibly live in the failing DOM.

🗣 Plain English: one box is still unticked — the full browser regression on a clean
database. The conductor decides whether to do that clean reseed (which touches the shared
DB) or to accept that, for a paint-only change that nobody ships yet, the proof already in
hand is enough.

---

## Commands run (for reproducibility)

```
npx vitest run --project unit                 # 2710/2710
npx vitest run --project component            # 4/4
npx vitest run tests/unit/tokens/token-resolve.test.ts \
               tests/unit/lint/semantic-tokens-only.test.ts \
               tests/unit/lint/vendor-fence-complete.test.ts   # 12/12
npx tsc --noEmit                              # exit 0
npx next build                                # exit 0
npx playwright test --project=chromium --grep @critical        # 62/75 (13 env failures)
# + production-build visual smoke (6 screens) and /map mount probe (admin)
```
