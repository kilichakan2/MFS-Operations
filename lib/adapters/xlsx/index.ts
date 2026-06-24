/**
 * lib/adapters/xlsx/index.ts
 *
 * Barrel re-export for the xlsx adapter package. Import surface:
 *   import {
 *     createXlsxSpreadsheetExporter,
 *     xlsxSpreadsheetExporter,
 *   } from '@/lib/adapters/xlsx'
 *
 * Both the factory and the pre-wired singleton are exported. Wiring imports the
 * singleton; tests import the factory. This file does NOT re-export any `xlsx`
 * type — vendor types stop at the adapter file (ADR-0002 line 27).
 */
export {
  createXlsxSpreadsheetExporter,
  xlsxSpreadsheetExporter,
} from "./XlsxSpreadsheetExporter";
