# ANVIL Clearance Certificate

Date: 2026-06-25
App: MFS-Operations
Branch: feat/f19-pr9a-cluster-f-foundation
PR: #76 — F-19 Cluster F, PR9a (introduce-only hexagonal foundation)

## Scope — what this certificate actually covers

This PR introduces 3 hexagons (ports + services + Supabase/Fake adapters + wiring
+ domain types) for 8 HACCP "docs & lookups" surfaces. It is **introduce-only**:
no `app/api/**` route is edited, no migration is added, no `package.json` change,
no eslint change. Nothing is wired into a live screen — the 3 new services have
**zero `app/` callers** (confirmed by code-critic at Gate 3 and by the diff here).

🗣 In plain English: new engine-room parts were added and left on the shelf. No
button, screen, route, or database changed. The only thing testable is the new
parts themselves on stand-in adapters — which is exactly what the unit layer does.

| Change / path                                            | Risk tier | Layers required | Layers run                |
| -------------------------------------------------------- | --------- | --------------- | ------------------------- |
| `lib/domain/Haccp*` (3 domain types)                     | Low       | Unit            | Unit ✓                    |
| `lib/ports/Haccp*Repository` (3 ports)                   | Low       | Unit            | Unit ✓ (via service tests) |
| `lib/services/Haccp*Service` (3 services)                | Low       | Unit            | Unit ✓ (26 tests on fakes) |
| `lib/adapters/{supabase,fake}/Haccp*Repository`          | Low       | Unit            | Unit ✓ (fakes drive services) |
| `lib/wiring/haccp.ts`                                     | Low       | Unit            | Unit ✓ (10 wiring tests)  |

**Not run under the efficiency dial:** Integration, DB/pgTAP, and E2E were
**N/A by design** — no route is wired, no migration or policy changed, and no
screen behaviour changed, so those layers have nothing to exercise. This matches
how the prior introduce-only foundations (PR5, PR7) were certified.
**Baseline characterisation pass?** No — diff-driven, full unit coverage of the new code.

## Test Results

| Layer                       | Status              | Notes                                                          |
| --------------------------- | ------------------- | -------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2346/2346 passed | 146 files; incl. 26 new HACCP service tests + 10 wiring tests  |
| Integration (Vitest)        | n/a — not required  | no `app/api/**` route wired in this PR; nothing to exercise    |
| Database (pgTAP / RLS)      | n/a — not required  | no migration, no policy change                                 |
| Edge Functions (Deno)       | n/a — not required  | no edge function touched                                       |
| Local full-stack rung       | n/a — not required  | unit-only matrix; no route/UI/DB blast radius                  |
| E2E (Playwright)            | n/a — not required  | no screen behaviour change                                     |
| Populated UI smoke          | n/a — not required  | no data-dependent view wired                                   |
| Breadth crawl               | n/a — not required  | no UI route changed                                            |
| Typecheck (`tsc --noEmit`)  | ✅ pass (exit 0)    | —                                                              |
| Lint (`next lint`)          | ✅ pass             | "No ESLint warnings or errors"                                 |

### Architecture rung (seam crossed — new ports introduced)

✅ Clean. The 3 new services are tested against **in-memory Fake adapters** (rung-3
port fakes), and **no vendor SDK** (`@supabase/*`, `@vercel/*`, `stripe`) is
imported anywhere under `lib/domain`, `lib/ports`, `lib/services`, or the service
tests. The seam is real — swapping the Supabase adapter for another vendor would
change one adapter + one wiring line, nothing in the domain.

🗣 In plain English: the new sockets accept a stand-in plug, proving they're genuine
swap points and not a vendor wired straight into the core.

## Introduce-only invariant — CONFIRMED

`git diff --name-only main...HEAD` contains ONLY `lib/**` and `tests/unit/**` files.
Forbidden-path scan returned NONE:

- `app/api/**` — none
- `supabase/migrations/**` — none
- `package.json` / lockfile — none
- `.eslintrc` / `eslint.config` — none

The matrix premise (unit-only by design) holds.

## Warnings (non-blocking)

None.

## Migration

None.
Rollback script: docs/anvil/2026-06-25-f19-pr9a-cluster-f-foundation-rollback.md
PITR confirmed: N/A — no migration, no data touched.

## Merge Sequence

No migration step. Standard:

1. Merge PR #76 → Vercel auto-deploys (no behaviour change shipped).
2. No production smoke required — no live route or screen changed.
3. Rollback if ever needed: `git revert -m 1 <merge-sha>` (see rollback notes).

## Manual smoke at merge

**Not required** — this PR ships no live route, screen, or schema change; the new
hexagons have zero `app/` callers. There is no runtime surface to hand-click.
Full unit coverage of the new code is green, typecheck and lint are green, and the
architecture seam is verified on fakes.

🗣 In plain English: nothing in the running app changed, so there's nothing to
click-test. The new parts are proven in isolation and stay dormant until a later
PR wires them into a screen — that wiring PR is where integration/E2E will apply.

## Verdict

✅ CLEARED FOR PRODUCTION
