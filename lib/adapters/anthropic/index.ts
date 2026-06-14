/**
 * lib/adapters/anthropic/index.ts
 *
 * Barrel re-export for the Anthropic adapter package. Import surface:
 *   import { createAnthropicLLMExtractor } from '@/lib/adapters/anthropic'
 *
 * Factory only — the ready-to-use singleton lives in `lib/wiring/llm.ts`
 * (F-TD-11 rule: adapters/services export factories, composition roots export
 * singletons).
 */

export { createAnthropicLLMExtractor } from "./LLMExtractor";
