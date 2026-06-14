/**
 * lib/adapters/fake/LLMExtractor.ts
 *
 * Deterministic no-network Fake for the LLMExtractor port (F-12). No SDK
 * import — pure JavaScript. Used by route/use-case unit tests to exercise the
 * dispatch and error paths without hitting the real Anthropic API (which is
 * non-deterministic, costs money, and needs a live key — a deliberate test
 * boundary).
 *
 * Boundary discipline (ADR-0002): this file imports zero vendor SDKs and
 * returns DOMAIN types only. Same shape as the other fakes in this folder.
 *
 * Construction:
 *   - `createFakeLLMExtractor(seed?)` factory — `seed.throwOnExtract` makes both
 *     methods throw LLMExtractionError so the 502 path can be tested.
 *   - `fakeLLMExtractor` singleton — for symmetry with the other barrels.
 */

import type { CustomerExtraction, ProductExtraction } from "@/lib/domain";
import { LLMExtractionError, type LLMExtractor } from "@/lib/ports";

export interface FakeLLMExtractorSeed {
  /** When true, both methods throw LLMExtractionError (exercises the 502 path). */
  throwOnExtract?: boolean;
}

export function createFakeLLMExtractor(
  seed?: FakeLLMExtractorSeed,
): LLMExtractor {
  return {
    async extractCustomers(rawText: string): Promise<CustomerExtraction> {
      if (seed?.throwOnExtract) throw new LLMExtractionError();
      return {
        clean_rows: [{ name: rawText.trim() }],
        flagged_rows: [],
      };
    },

    async extractProducts(rawText: string): Promise<ProductExtraction> {
      if (seed?.throwOnExtract) throw new LLMExtractionError();
      return {
        clean_rows: [
          {
            name: rawText.trim(),
            category: "none",
            code: "none",
            box_size: "none",
          },
        ],
        flagged_rows: [],
      };
    },
  };
}

export const fakeLLMExtractor: LLMExtractor = createFakeLLMExtractor();
