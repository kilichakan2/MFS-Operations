import { describe, it, expect } from "vitest";
import {
  COLD_STORAGE_CAUSES,
  COLD_STORAGE_MIN_TEMP_C,
  COLD_STORAGE_MAX_TEMP_C,
  isColdStorageTempInRange,
} from "@/lib/domain/coldStorage";

describe("coldStorage — cause list (single source of truth)", () => {
  it("holds all 8 causes, including the two that used to be rejected", () => {
    expect(COLD_STORAGE_CAUSES).toEqual([
      "Door left open",
      "Unit overloaded",
      "Seal damaged",
      "Equipment failure",
      "Power interruption",
      "Defrost cycle — scheduled temperature rise",
      "High ambient room temperature",
      "Other",
    ]);
  });

  it("uses an em-dash (U+2014) in the defrost cause — must match byte-for-byte", () => {
    expect(COLD_STORAGE_CAUSES).toContain(
      "Defrost cycle — scheduled temperature rise",
    );
  });
});

describe("coldStorage — isColdStorageTempInRange (entry bound)", () => {
  it("bounds are −40 … +30 °C inclusive", () => {
    expect(COLD_STORAGE_MIN_TEMP_C).toBe(-40);
    expect(COLD_STORAGE_MAX_TEMP_C).toBe(30);
  });

  it("accepts the inclusive endpoints", () => {
    expect(isColdStorageTempInRange(-40)).toBe(true);
    expect(isColdStorageTempInRange(30)).toBe(true);
  });

  it("rejects values just past either endpoint", () => {
    expect(isColdStorageTempInRange(-40.1)).toBe(false);
    expect(isColdStorageTempInRange(30.1)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isColdStorageTempInRange(NaN)).toBe(false);
    expect(isColdStorageTempInRange(Infinity)).toBe(false);
    expect(isColdStorageTempInRange(-Infinity)).toBe(false);
  });

  it("still allows a genuine in-range deviation (classification is untouched)", () => {
    expect(isColdStorageTempInRange(12)).toBe(true); // chiller deviation, not impossible
    expect(isColdStorageTempInRange(-20)).toBe(true); // freezer pass
  });
});
