/**
 * lib/adapters/xlsx/XlsxSpreadsheetExporter.ts
 *
 * F-19 PR7 — the xlsx adapter implementing the generic `SpreadsheetExporter`
 * port (lib/ports/SpreadsheetExporter.ts). The ONLY file in the app allowed to
 * import the `xlsx` vendor library (ADR-0003 FREEZE rule; the `.eslintrc.json`
 * vendor-confinement ban + allow-list entry land in this PR). The vendor types
 * (`XLSX.WorkBook` / `XLSX.WorkSheet`) never leak past this file — the port
 * speaks only `SheetSpec` / `Buffer`.
 *
 * Faithful to `app/api/haccp/audit/export/route.ts`: `book_new()` → per sheet
 * `aoa_to_sheet(rows)` + apply `columnWidths`→`!cols` → `book_append_sheet`,
 * then `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })`. Sheet order is
 * preserved. So when PR8 re-points the route through this adapter, the bytes are
 * identical.
 *
 * reason: xlsx@^0.18.5 is the spreadsheet writer (already in package.json,
 * previously imported directly in the export route — this PR confines it here).
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createXlsxSpreadsheetExporter()` factory (stateless).
 *   - `xlsxSpreadsheetExporter` singleton — barrel symmetry + wiring.
 */

import * as XLSX from "xlsx";
import type {
  SpreadsheetExporter,
  SheetSpec,
} from "@/lib/ports";

export function createXlsxSpreadsheetExporter(): SpreadsheetExporter {
  return {
    toXlsxBuffer(sheets: readonly SheetSpec[]): Buffer {
      const wb = XLSX.utils.book_new();
      for (const sheet of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(
          sheet.rows as unknown as (string | number | boolean | null)[][],
        );
        if (sheet.columnWidths) {
          ws["!cols"] = sheet.columnWidths.map((wch) => ({ wch }));
        }
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      }
      return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    },
  };
}

export const xlsxSpreadsheetExporter: SpreadsheetExporter =
  createXlsxSpreadsheetExporter();
