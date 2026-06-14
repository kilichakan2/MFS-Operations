/**
 * lib/wiring/llm.ts — composition root for the LLMExtractor port (F-12)
 *
 * The ONE business-layer file where the LLMExtractor port is bolted to its
 * concrete Anthropic adapter (same F-TD-11 rule as the other wiring files: only
 * composition roots import from `@/lib/adapters/*`).
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the AI vendor =
 * one new adapter folder (`lib/adapters/<vendor>/`) + one edit to THIS file.
 * The route, the port, the domain types, the UI and every test using the Fake
 * never change.
 *
 * This file is a parts list, not logic. `getApiKey` is lazy — the env var is
 * read per call inside the adapter, never at import — so importing this module
 * triggers no network and reads no key at startup.
 */
import { createAnthropicLLMExtractor } from "@/lib/adapters/anthropic";
import type { LLMExtractor } from "@/lib/ports";

export const llmExtractor: LLMExtractor = createAnthropicLLMExtractor({
  getApiKey: () => process.env.ANTHROPIC_API_KEY,
});
