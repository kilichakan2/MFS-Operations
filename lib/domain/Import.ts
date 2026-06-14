/**
 * lib/domain/Import.ts
 *
 * Owned types for AI-extracted import rows. Pure TypeScript — no framework
 * import, no vendor import. These are the app's OWN shape; the Anthropic
 * adapter maps the vendor's tool_use.input into these before returning.
 * The wire shape returned by /api/admin/import is { clean_rows, flagged_rows }
 * — identical to today; these types just name it.
 */

/** A successfully-mapped customer row. */
export interface CustomerCleanRow {
  name: string;
}

/** A successfully-mapped product row. Sentinel "none" preserved verbatim
 *  (the confirm route converts "none" → null before insert — unchanged). */
export interface ProductCleanRow {
  name: string;
  category: string;
  code: string;
  box_size: string;
}

/** A row the model could not map / wants reviewed. Same shape for both
 *  entity types (matches both tool schemas' flagged_rows.items). */
export interface FlaggedRow {
  row: number;
  raw: string;
  reason: string;
}

export interface CustomerExtraction {
  clean_rows: CustomerCleanRow[];
  flagged_rows: FlaggedRow[];
}

export interface ProductExtraction {
  clean_rows: ProductCleanRow[];
  flagged_rows: FlaggedRow[];
}
