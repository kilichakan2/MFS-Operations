# ANVIL Clearance Certificate — fast-lane fix

Date: 2026-06-30
App: MFS-Operations (Next.js + Supabase + Capacitor)
Branch: fprod04-prep-traceability-chain
PR: #104 — feat(fprod04): chain BLS traceability through source batches + Born/Reared as codes

## Scope

Two changes to `app/api/labels/route.ts` (regulated dispatch labels):

1. **Traceability chaining (correctness).** Prep/mince labels printed blank Born in /
   Slaughtered in / Cut in when a run was sourced from another BATCH (e.g. a burger built
   from `MINCE-3006-BEEF-1`) rather than from deliveries directly — the label read only the
   directly-linked `source_delivery_ids` (empty). New `resolveDeliveryIds()` follows each
   source batch back to its underlying goods-in deliveries: `MINCE-`/`PREP-` batches resolve
   via their own source rows (PREP recurses one level, depth-bounded against cycles), any
   other code is a goods-in delivery `batch_number`. Both the mince and prep branches use it.

2. **Born in / Reared in as country CODES** (GB, AU) instead of full names, so each stays one
   line on the dense prep label and matches the Slaughtered/Cut lines. Goods-in delivery
   label unchanged (still full names — different label, on-site not dispatch).

🗣 A burger made from a tub of mince still traces back to where the beef was born and
slaughtered — that lives on the deliveries that fed the mince, two steps back. The label now
follows that chain. And the country lines print as short codes so the dense prep sticker fits.

## Risk tier

Low–Medium — regulated label content, but additive resolution logic with a depth guard; no
schema change, no new dependency, no auth/RLS change. Fast lane (no human matrix gate); cert issued.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Type check (tsc) | ✅ clean (exit 0) | |
| Lint (next lint) | ✅ clean | unused `COUNTRY_NAMES` import removed. |
| Unit (Vitest oracle) | ✅ 81/81 | `labelPrinting.test.ts` — renderers print `origins`/`reared_in` as-is, so codes flow through unchanged. |
| Live prod DB verification (Supabase MCP) | ✅ | `PREP-3006-IMPVAC-1` → `MINCE-3006-BEEF-1` → its 3 deliveries → origins GB, AU; slaughter GB2095, AUS7; cut GB2095, AUS7. Chain resolves correctly. |
| E2E @critical (CI smoke) | ✅ 78/78 | Run `28446615006`, 4m43s. First attempt failed at the cred-sync readiness gate (preview not wired yet — infra timing, not code); preview branch reached ACTIVE_HEALTHY → reran SAME head → green. |
| Integration (Vitest) | ⏸ updated, not run | `tests/integration/labels.test.ts` origin assertion updated to codes (`["GB","IE"]`). Still run-suspended (Docker down); not in the `smoke` check. |
| Migration / RLS / PITR | n/a | No schema change. |

## Secondary findings (follow-ups, not fixed here)

1. Extend the integration suite with a prep-from-mince-BATCH chain case (the exact scenario
   this fixes). Not in `smoke`; couldn't run locally (Docker down). Backlog.
2. The native bridge `printLabel` catch swallows exceptions (a render error fails silently).
   Robustness gap — backlog.

## Verdict

CLEARED FOR PRODUCTION

Server-side change to the regulated dispatch-label route, verified against the live production
database, type-check, lint, and 81 oracle tests, with a green @critical preview smoke. No
schema/RLS/PITR. Reprint the prep label on the V3 after deploy to confirm the chained origins
render and fit (the prep label is dense — a further native trim may follow).
