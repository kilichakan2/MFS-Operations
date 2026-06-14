/**
 * lib/ports/LLMExtractor.ts
 *
 * The LLMExtractor port — the app's own socket for "turn this pasted text into
 * mapped customer or product rows" (F-12). The AI vendor (currently Anthropic)
 * plugs in behind it via an adapter; the import screen and route never see the
 * vendor.
 *
 * Two methods, not one generic extract(entity, rawText): the two entity types
 * return different row shapes (customer rows have only `name`; product rows have
 * name/category/code/box_size), so two methods give each its own precise return
 * type with no union-narrowing at the call site. Scoped to exactly today's two
 * entity types — no speculative generic seam (ADR-0002 / CLAUDE.md "no
 * speculative generality").
 *
 * Pure TypeScript: no vendor import, no framework import. Vendor types
 * (`Anthropic.*`) never appear here — they stay inside the adapter, which maps
 * them into the lib/domain types below.
 */

import type { CustomerExtraction, ProductExtraction } from "@/lib/domain";

export interface LLMExtractor {
  /**
   * Extract mapped CUSTOMER rows from raw pasted text.
   * @throws LLMExtractionError when the model returns no structured data
   *         (the route maps this to a 502).
   */
  extractCustomers(rawText: string): Promise<CustomerExtraction>;

  /**
   * Extract mapped PRODUCT rows from raw pasted text.
   * @throws LLMExtractionError when the model returns no structured data
   *         (the route maps this to a 502).
   */
  extractProducts(rawText: string): Promise<ProductExtraction>;
}

/**
 * Typed domain error — thrown by an adapter when the model returns no
 * structured data. Part of the port contract (carries no vendor shape): the
 * route catches this one label and returns the same 502 message users see
 * today. The default message is shorter than the route's user-facing 502 text
 * (`… — please try again`); the route supplies the full 502 string.
 */
export class LLMExtractionError extends Error {
  constructor(message = "AI did not return structured data") {
    super(message);
    this.name = "LLMExtractionError";
  }
}
