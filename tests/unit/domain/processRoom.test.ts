import { describe, it, expect } from "vitest";
import {
  PROCESS_ROOM_CAUSES,
  PROCESS_ROOM_MIN_TEMP_C,
  PROCESS_ROOM_MAX_TEMP_C,
  isProcessRoomTempInRange,
  processRoomBand,
} from "@/lib/domain/processRoom";

describe("processRoom — cause list (single source of truth)", () => {
  it("holds all 7 CCP-3 causes in order", () => {
    expect(PROCESS_ROOM_CAUSES).toEqual([
      "A/C or cooling failure",
      "Doors left open",
      "Product held in room too long",
      "Batch too large",
      "Equipment failure",
      "Power interruption",
      "Other",
    ]);
  });
});

describe("processRoom — isProcessRoomTempInRange (entry bound)", () => {
  it("bounds are −50 … +50 °C inclusive", () => {
    expect(PROCESS_ROOM_MIN_TEMP_C).toBe(-50);
    expect(PROCESS_ROOM_MAX_TEMP_C).toBe(50);
  });

  it("accepts the inclusive endpoints", () => {
    expect(isProcessRoomTempInRange(-50)).toBe(true);
    expect(isProcessRoomTempInRange(50)).toBe(true);
  });

  it("rejects values just past either endpoint", () => {
    expect(isProcessRoomTempInRange(-51)).toBe(false);
    expect(isProcessRoomTempInRange(51)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isProcessRoomTempInRange(NaN)).toBe(false);
    expect(isProcessRoomTempInRange(Infinity)).toBe(false);
    expect(isProcessRoomTempInRange(-Infinity)).toBe(false);
  });
});

describe("processRoom — processRoomBand (shared traffic-light rule)", () => {
  it("classifies the Product core point (target 4 / max 7)", () => {
    expect(processRoomBand(3, 4, 7)).toBe("pass");
    expect(processRoomBand(4, 4, 7)).toBe("pass");
    expect(processRoomBand(5, 4, 7)).toBe("amber");
    expect(processRoomBand(7, 4, 7)).toBe("amber");
    expect(processRoomBand(7.1, 4, 7)).toBe("critical");
  });

  it("classifies the Room ambient point (target 12 / max 15)", () => {
    expect(processRoomBand(12, 12, 15)).toBe("pass");
    expect(processRoomBand(13, 12, 15)).toBe("amber");
    expect(processRoomBand(15, 12, 15)).toBe("amber");
    expect(processRoomBand(16, 12, 15)).toBe("critical");
  });
});
