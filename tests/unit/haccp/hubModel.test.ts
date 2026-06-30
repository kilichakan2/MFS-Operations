import { describe, it, expect } from "vitest";
import {
  type TodayStatus,
  progressPct,
  roomState,
  roomBadge,
  buildOverdueList,
  buildMandatorySet,
  helpForTile,
  SOP_CONTENT,
  SOP_PLACEHOLDER,
} from "@/app/haccp/hubModel";

// A fully-undone, nothing-overdue status; tweak per case.
function status(over: DeepPartial<TodayStatus> = {}): TodayStatus {
  const base: TodayStatus = {
    cold_storage: { am_done: false, pm_done: false, am_overdue: false, pm_overdue: false },
    processing_room: { am_done: false, pm_done: false, am_overdue: false, pm_overdue: false },
    daily_diary: {
      opening: false,
      operational: false,
      closing: false,
      opening_overdue: false,
      operational_overdue: false,
      closing_overdue: false,
    },
    cleaning: { count_today: 0, has_issues_today: false, overdue: false, last_logged_at: null },
    deliveries: { count_today: 0, deviations: 0 },
    mince_runs: { count_today: 0, has_deviations: false },
    product_returns: { count_today: 0, has_safety_returns: false },
    calibration_due: false,
    calibration_done: false,
    calibration_pass: false,
    weekly_review_due: false,
    weekly_review_overdue: false,
    monthly_review_due: false,
    monthly_review_overdue: false,
    training_overdue: 0,
    training_due_soon: 0,
    total_checks: 8,
    completed_checks: 0,
  };
  return merge(base, over);
}

// minimal deep-merge for fixtures
type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };
function merge<T>(a: T, b: DeepPartial<T>): T {
  const out = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(b as object)) {
    const bv = (b as Record<string, unknown>)[k];
    const av = (a as Record<string, unknown>)[k];
    out[k] =
      bv && typeof bv === "object" && !Array.isArray(bv) && av && typeof av === "object"
        ? merge(av, bv as DeepPartial<typeof av>)
        : bv;
  }
  return out as T;
}

describe("progressPct", () => {
  it("is 0 when status is null", () => {
    expect(progressPct(null)).toBe(0);
  });
  it("computes completed/total as a rounded percentage", () => {
    expect(progressPct(status({ completed_checks: 6, total_checks: 8 }))).toBe(75);
  });
});

describe("delta #4 — room tile surfaces operational (mid-day) overdue", () => {
  it("roomState is overdue when only operational is overdue", () => {
    expect(roomState(status({ daily_diary: { operational_overdue: true } }))).toBe("overdue");
  });

  it("roomBadge reads 'Operational overdue' for a mid-day miss", () => {
    expect(roomBadge(status({ daily_diary: { operational_overdue: true } }))).toBe(
      "Operational overdue",
    );
  });

  it("operational does NOT block 'complete' (complete never required it)", () => {
    const s = status({
      processing_room: { am_done: true, pm_done: true },
      daily_diary: { opening: true, closing: true, operational: false },
    });
    expect(roomState(s)).toBe("complete");
  });
});

describe("buildOverdueList", () => {
  it("returns [] for null status", () => {
    expect(buildOverdueList(null)).toEqual([]);
  });

  it("includes the operational (mid-day) diary when overdue", () => {
    const list = buildOverdueList(status({ daily_diary: { operational_overdue: true } }));
    expect(list).toContain("Process Room Operational checks");
  });

  it("keeps opening, operational and closing in chronological order", () => {
    const list = buildOverdueList(
      status({
        daily_diary: {
          opening_overdue: true,
          operational_overdue: true,
          closing_overdue: true,
        },
      }),
    );
    expect(list).toEqual([
      "Process Room Opening checks",
      "Process Room Operational checks",
      "Process Room Closing checks",
    ]);
  });
});

describe("buildMandatorySet — the honest 8", () => {
  it("always lists exactly 8 items, operational included", () => {
    const set = buildMandatorySet(status());
    expect(set).toHaveLength(8);
    expect(set.map((m) => m.label)).toContain("Diary — Operational");
  });

  it("count of 'complete' equals completed_checks semantics (all 8 done)", () => {
    const s = status({
      cold_storage: { am_done: true, pm_done: true },
      processing_room: { am_done: true, pm_done: true },
      daily_diary: { opening: true, operational: true, closing: true },
      cleaning: { count_today: 2 },
    });
    const set = buildMandatorySet(s);
    expect(set.filter((m) => m.state === "complete")).toHaveLength(8);
  });

  it("marks overdue and pending correctly", () => {
    const s = status({
      cold_storage: { am_done: true, pm_overdue: true },
      daily_diary: { operational_overdue: true },
    });
    const set = buildMandatorySet(s);
    const byLabel = Object.fromEntries(set.map((m) => [m.label, m.state]));
    expect(byLabel["Cold store — AM"]).toBe("complete");
    expect(byLabel["Cold store — PM"]).toBe("overdue");
    expect(byLabel["Diary — Operational"]).toBe("overdue");
    expect(byLabel["Process room — AM"]).toBe("pending");
  });
});

describe("delta #1 — per-tile help routing (never the People default)", () => {
  const authored = [
    "cold_storage",
    "processing_room",
    "delivery",
    "mince",
    "product_return",
    "cleaning",
    "calibration",
    "reviews",
    "people",
  ];

  it("each authored tile resolves to its OWN entry", () => {
    for (const key of authored) {
      expect(helpForTile(key)).toBe(SOP_CONTENT[key]);
    }
  });

  it("only the People tile resolves to the People entry", () => {
    for (const key of authored) {
      if (key === "people") continue;
      expect(helpForTile(key)).not.toBe(SOP_CONTENT.people);
    }
  });

  const placeholderTiles = [
    "training",
    "allergens",
    "recall",
    "product-specs",
    "food-fraud",
    "food-defence",
    "audit",
  ];

  it("compliance tiles without authored text get the neutral placeholder", () => {
    for (const key of placeholderTiles) {
      expect(helpForTile(key)).toBe(SOP_PLACEHOLDER);
      // the placeholder must not be the People SOP (no mis-route, no invented policy)
      expect(helpForTile(key)).not.toBe(SOP_CONTENT.people);
    }
  });
});
