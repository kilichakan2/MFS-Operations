/**
 * lib/ports/SpreadsheetExporter.ts
 *
 * F-19 PR7 — a GENERIC spreadsheet-export port the app owns. Zero HACCP/domain
 * vocabulary: it speaks only "named sheets, each a grid of cells, → an xlsx
 * buffer". Reusable for any future export. Pure TypeScript: no framework import,
 * no vendor SDK. The xlsx detail (`!cols`, `book_append_sheet`, `XLSX.write`)
 * lives entirely behind the adapter (lib/adapters/xlsx/).
 */

/** A single cell — the primitives a spreadsheet stores. */
export type SheetCell = string | number | boolean | null;

export interface SheetSpec {
  /** Becomes the worksheet tab name. */
  readonly name: string;
  /** Row 0 = headers, by the caller's convention. Array-of-arrays. */
  readonly rows: ReadonlyArray<ReadonlyArray<SheetCell>>;
  /**
   * Optional column widths in xlsx "wch" character units. Vendor-neutral: the
   * adapter maps these to the xlsx `!cols` detail. Omit to let the vendor
   * default.
   */
  readonly columnWidths?: readonly number[];
}

export interface SpreadsheetExporter {
  /**
   * Build a single workbook from an ordered list of named sheets and return the
   * binary xlsx buffer. Pure: no I/O, no download, no filesystem. Sheet order is
   * preserved. Lets a vendor error bubble; callers wrap.
   */
  toXlsxBuffer(sheets: readonly SheetSpec[]): Buffer;
}
