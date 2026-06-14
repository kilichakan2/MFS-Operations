# ANVIL Clearance Certificate

Date: 2026-06-14
App: MFS-Operations
Branch: f-12-llmextractor-port
PR: #37 (base main)

## Scope — what this certificate actually covers

F-12 is a **pure relocation, zero behaviour change**: the Anthropic AI call was
moved out of `app/api/admin/import/route.ts` into an `LLMExtractor` port
(`lib/ports/LLMExtractor.ts`), a `lib/adapters/anthropic/` adapter, a Fake
adapter (`lib/adapters/fake/LLMExtractor.ts`), and a composition root
(`lib/wiring/llm.ts`). Model `claude-sonnet-4-6`, forced tool-use, and both
entity types are unchanged. Non-destructive: NO DB migration, NO schema change.

🗣 In plain English: the AI call now lives behind a swappable socket (port) with
a real Anthropic plug and a pretend stand-in plug. What it does is identical; only
where the code sits changed. So this cert proves nothing broke, not that anything new works.

| Change / path                                   | Risk tier | Layers required                  | Layers run                       |
| ----------------------------------------------- | --------- | -------------------------------- | -------------------------------- |
| `lib/ports/LLMExtractor.ts` (new port)          | Medium    | Unit + architecture (seam)       | Unit ✅ + architecture rung ✅    |
| `lib/adapters/anthropic/LLMExtractor.ts` (adapter) | Medium | Unit (mocked SDK)                | Unit ✅                          |
| `lib/adapters/fake/LLMExtractor.ts` (fake)      | Low       | Unit                             | Unit ✅                          |
| `lib/wiring/llm.ts` (composition root)          | Low       | Unit / typecheck                 | Typecheck ✅ + Unit ✅           |
| `app/api/admin/import/route.ts` (route swap)    | Medium    | Unit (route, Fake adapter)       | Unit ✅                          |
| `.eslintrc.json` (forbid @anthropic-ai outside adapter) | Medium | Lint + lint-pin tests        | Lint ✅ + Unit lint-pin ✅       |
| Import flow regression (real DB)                | Medium    | Integration (regression only)    | Integration ✅ 122/122          |
| Critical paths (order/print/KDS)                | Critical  | E2E @critical on preview         | E2E ✅ 8/8 @critical             |

**Not run under the efficiency dial / deliberate scope boundaries:**
- **No test hits the real Anthropic API** — non-deterministic, costs money, needs
  a live key. Route + integration use the **Fake** adapter; the real adapter is
  unit-tested against a **mocked SDK**. This is intentional and approved at Gate 3.
  🗣 We never call the real AI in tests: it's slow, costs money, and gives a
  different answer each time. We test the wiring with a stand-in instead.
- **No new F-12 integration tests** — the integration layer is a regression-only
  re-run (122 baseline). F-12 adds no real-DB behaviour, so no new integration
  test was warranted.
- **DB/RLS (pgTAP):** N/A — no schema change.
- **Edge functions:** N/A — none in this change.

**Baseline characterisation pass?** No — this is a diff-driven matrix on a
focused relocation PR.

**Architecture rung (seam crossed):** ✅ The touched port (`LLMExtractor`) has a
domain/route-facing test running on an in-memory **Fake** adapter (no real SDK,
no network). No vendor SDK (`@anthropic-ai/sdk`) is imported outside
`lib/adapters/anthropic/` — enforced by ESLint (lint ✅) and pinned by
`tests/unit/lint/no-adapter-imports.test.ts`. The seam is real, not welded shut.

## Test Results

| Layer                 | Status              | Notes                                                                 |
| --------------------- | ------------------- | --------------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1581/1581 passed | incl. 49 new F-12 tests (port/adapter/fake/route/lint). Baseline held. |
| Integration (Vitest)  | ✅ 122/122 passed   | real local Supabase; regression only. DB-identity sentinel passed.    |
| Typecheck (tsc)       | ✅ 0 errors         | STRICT. Baseline 0 held.                                              |
| Lint (ESLint)         | ✅ 0 errors         | STRICT. Vendor-SDK guard for `@anthropic-ai/sdk` active. Baseline 0 held. |
| Database (pgTAP)      | n/a — not required  | No schema change.                                                     |
| Edge Functions (Deno) | n/a — not required  | None in this change.                                                  |
| E2E (Playwright)      | ✅ 8/8 @critical    | chromium, against PR #37 Vercel preview. DB-probe confirmed preview DB. |

Preview deployment smoked: `dpl_8Z2rC8CEtuC71VMhLZUFZ5RaGALU` (state READY),
commit `2eade22`, URL
`https://mfs-operations-nbqdrkry0-hakan-kilics-projects-2c54f03f.vercel.app`
(branch alias `mfs-operations-git-f-12-l-f46f35-hakan-kilics-projects-2c54f03f.vercel.app`).

Iterations used: **0** — every layer passed on the first run. No test fixes made.

## Warnings (non-blocking)

- **F-TD-17 (known):** a WebKit/Mobile-Safari-only flake on 2 @critical specs is a
  harness issue, not the app. Chromium-only smokes never block ship. Not observed
  in this run (chromium 8/8 clean).

## Migration

**None.**
Rollback note: docs/anvil/2026-06-14-f-12-llmextractor-port-rollback.md
(code-only revert of PR #37; no data/migration to roll back).
PITR: **N/A — non-destructive** (no schema change, no data touched).

## Merge Sequence

1. No migration to push — skip `supabase db push`.
2. Merge PR #37 → Vercel auto-deploys.
3. Smoke test: 3 @critical Playwright paths against the production URL post-merge.

## Verdict

✅ CLEARED FOR PRODUCTION

(Conductor handles the Lock gate / ship with Hakan — the runner does not ship.)
