# Code-critic review — F-12 LLMExtractor port + Anthropic adapter

- **Date:** 2026-06-14
- **Branch:** f-12-llmextractor-port
- **Reviewer:** code-critic subagent (FORGE Guard)
- **Verdict:** **SHIP** — no blockers, no warnings, no architecture follow-ups. Hand to ANVIL.

## What F-12 is

Pure relocation, zero behaviour change. Moves the Anthropic AI call out of
`app/api/admin/import/route.ts` (which imported `@anthropic-ai/sdk` directly — a
hexagonal breach) into a new `LLMExtractor` port + `lib/adapters/anthropic/`
adapter + `lib/wiring/llm.ts`, with a `Fake` adapter for tests. The AI itself is
unchanged: model `claude-sonnet-4-6`, max_tokens 4096, forced tool-use, both
entity types (customers + products), output `{clean_rows, flagged_rows}`, and the
"no tool_use block → 502 same message" path.

## Findings (graded)

No 🔴 blockers. No 🟡 should-fix. No 🔵 nice-to-have. All checks 🟢.

### 🟢 Behaviour preservation (highest-priority check) — PASS
- Both system prompts + both tool schemas **BYTE-IDENTICAL** to main's route, verified
  by mechanical diff (main route lines 20–136 vs `lib/adapters/anthropic/LLMExtractor.ts:38–173`;
  only delta = the `export ` prefix + the legitimately-moved route tail).
- Model call frozen: `model: 'claude-sonnet-4-6'`, `max_tokens: 4096`,
  `tool_choice: { type: 'tool', name: tool.name }`, user template
  `Map the following ${entityLabel} data:\n\n${rawText.trim()}` — all verbatim
  (`LLMExtractor.ts:206-216`).
- Trim semantics identical: route guards `raw_text?.trim()` (`route.ts:38`); model-input
  `.trim()` moved into the adapter at the same point (`LLMExtractor.ts:214`).
- 502 path preserved: no tool_use block → same two `console.error` lines →
  `LLMExtractionError` (`LLMExtractor.ts:222-226`) → route returns 502 with exact
  `"AI did not return structured data — please try again"` (`route.ts:53-57`).
- Array-guarding preserved: missing rows → `[]` + same `console.warn` (`LLMExtractor.ts:234-258`).

### 🟢 Hexagonal architecture — PASS
- `@anthropic-ai/sdk` imported in exactly one file: `lib/adapters/anthropic/LLMExtractor.ts:26`.
- No vendor-type leak: `Anthropic.Tool` / `Anthropic.ToolUseBlock` only inside the adapter;
  port + domain import nothing from `lib/adapters`.
- Route imports the wired singleton (`import { llmExtractor } from '@/lib/wiring/llm'`,
  `route.ts:21`), not the adapter.
- Rip-out test holds: swap vendor = 1 new adapter folder + 1 edit to `lib/wiring/llm.ts:20`.
- No new dependency — `package.json`/lock unchanged; `@anthropic-ai/sdk@0.39.0` already present.

### 🟢 Port depth — DEEP (not speculative)
- `LLMExtractor` (`lib/ports/LLMExtractor.ts`): two narrow methods hide the SDK client,
  two 50+-line prompts, two tool schemas, forced tool-use, parse, array-guard, typed error.
  Small interface, large hidden mass — passes the deletion test.
- Correctly scoped to today's two entity types; a generic `extract<T>(schema)` was explicitly
  rejected (`LLMExtractor.ts:14-17`) — avoids the speculative-seam trap. Single real adapter +
  a Fake = inverse-error exemption (proven seam in waiting), not flagged.

### 🟢 Lint guard integrity — PASS (restate-not-merge trap avoided)
- Both `paths` blocks edited: global (`.eslintrc.json:16-19`) AND services/usecases override
  (`.eslintrc.json:51-54`); adapter folder whitelisted in the override (`.eslintrc.json:29`).
- Forbidden message byte-identical across `.eslintrc.json` (both occurrences) and both mirror
  tests (`no-supabase-sdk.test.ts:50-53`, `no-adapter-imports.test.ts:60-63`):
  `"Use the LLMExtractor port via @/lib/wiring/llm. @anthropic-ai/sdk may only be imported inside lib/adapters/anthropic/. See ADR-0002 / F-12."`
- Disk-loading pin asserts the message against the shipped config — real drift-catcher.

### 🟢 Test quality — strong
- Adapter test asserts call params (model/tokens/prompt-per-entity/tool-per-entity/forced
  tool_choice/user template), parse → domain types, no-tool error path (both console.error
  lines), array-guarding, lazy/memoized key reading.
- Route test covers 401/400×3 guards, dispatch routing, 200 pass-through, 502 mapping with
  exact message, 500 fall-through; mocks the wiring singleton at the real seam.
- Fake deterministic; `throwOnExtract` seed exercises the 502 path.
- Deliberate scope boundary observed: no test hits the real Anthropic API (non-deterministic,
  costs money, needs a live key) — intentional, not a gap.

### 🟢 Security / env / secrets — PASS
- API key read lazily via `getApiKey: () => process.env.ANTHROPIC_API_KEY` (`lib/wiring/llm.ts:20`),
  built once on first call. Key never logged (error path logs only `stop_reason` + `message.content`);
  `LLMExtractionError` carries no key/payload; 502 body is a fixed string.
- Auth guard (`x-mfs-user-id` → 401) unchanged.

## Build / test results

| Check | Baseline | Result |
|---|---|---|
| `tsc --noEmit` | 0 | 0 errors ✅ |
| `next lint` | 0 | 0 warnings/errors ✅ |
| unit suite | 1552 | 1581 passed / 81 files ✅ (+29) |
| F-12 affected tests | — | 49/49 passed ✅ |
