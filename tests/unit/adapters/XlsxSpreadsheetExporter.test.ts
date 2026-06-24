/**
 * tests/unit/adapters/XlsxSpreadsheetExporter.test.ts
 *
 * F-19 PR7 — round-trip pin for the xlsx adapter (the one allowed `xlsx`
 * importer). Feeds SheetSpecs in, reads the buffer back, and asserts sheet
 * names, sheet ORDER, and cell values survive. Asserts column widths are
 * applied (buffer differs when widths supplied).
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { createXlsxSpreadsheetExporter } from "@/lib/adapters/xlsx";
import type { SheetSpec } from "@/lib/ports";

const exporter = createXlsxSpreadsheetExporter();

describe("XlsxSpreadsheetExporter.toXlsxBuffer", () => {
  it("round-trips sheet names, order and cell values", () => {
    const sheets: SheetSpec[] = [
      {
        name: "Alpha",
        rows: [
          ["H1", "H2", "H3"],
          ["a", 1, true],
          ["b", 2, null],
        ],
        columnWidths: [10, 5, 8],
      },
      {
        name: "Beta",
        rows: [
          ["X", "Y"],
          [42, "hello"],
        ],
      },
      { name: "Gamma", rows: [["only"]] },
    ];

    const buf = exporter.toXlsxBuffer(sheets);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);

    const wb = XLSX.read(buf, { type: "buffer" });
    // names + order preserved
    expect(wb.SheetNames).toEqual(["Alpha", "Beta", "Gamma"]);

    // cell values survive (sheet_to_json with header:1 gives array-of-arrays)
    const alpha = XLSX.utils.sheet_to_json(wb.Sheets["Alpha"], {
      header: 1,
    }) as unknown[][];
    expect(alpha[0]).toEqual(["H1", "H2", "H3"]);
    expect(alpha[1]).toEqual(["a", 1, true]);
    // null cell → the row is shorter (xlsx omits empty trailing cells)
    expect(alpha[2][0]).toBe("b");
    expect(alpha[2][1]).toBe(2);

    const beta = XLSX.utils.sheet_to_json(wb.Sheets["Beta"], {
      header: 1,
    }) as unknown[][];
    expect(beta[0]).toEqual(["X", "Y"]);
    expect(beta[1]).toEqual([42, "hello"]);
  });

  it("applies column widths (buffer differs when widths supplied)", () => {
    const base: SheetSpec[] = [
      { name: "S1", rows: [["a", "b"], [1, 2]] },
    ];
    const widened: SheetSpec[] = [
      { name: "S1", rows: [["a", "b"], [1, 2]], columnWidths: [40, 40] },
    ];
    const noWidth = exporter.toXlsxBuffer(base);
    const withWidth = exporter.toXlsxBuffer(widened);
    // The !cols metadata lands in the workbook XML → the bytes differ.
    expect(withWidth.equals(noWidth)).toBe(false);
  });

  it("preserves an empty workbook → empty sheet list when no rows", () => {
    const buf = exporter.toXlsxBuffer([{ name: "Empty", rows: [[]] }]);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Empty"]);
  });
});
