/**
 * lib/adapters/sunmi/index.ts
 *
 * Barrel for the Sunmi V3 native transport adapter (Printer port, ADR-0010).
 */
export {
  createSunmiPrinter,
  isSunmiNative,
  formatTempStatus,
  formatSpecies,
} from "./Printer";
