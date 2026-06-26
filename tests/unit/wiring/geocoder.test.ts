/**
 * tests/unit/wiring/geocoder.test.ts
 *
 * F-20 PR1 — pins the Geocoder composition root. The wiring is a parts list: it
 * bolts the postcodes.io adapter into the Geocoder port and exports a ready
 * singleton. The vendor lookup is lazy (a `fetch` INSIDE geocode/geocodeMany,
 * per call), so importing this module — and constructing the singleton — must
 * trigger NO network call.
 *
 * Global `fetch` is spied so we can assert the vendor is never touched at
 * import/wiring time (the lazy posture that keeps a network round-trip out of
 * module load — mirrors lib/wiring/llm.ts and lib/wiring/pdf.ts).
 */
import { describe, it, expect, vi } from "vitest";

describe("lib/wiring/geocoder — composition root", () => {
  it("imports without hitting the network (side-effect free)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const mod = await import("@/lib/wiring/geocoder");
    expect(mod.geocoder).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("exports a Geocoder singleton with geocode + geocodeMany", async () => {
    const { geocoder } = await import("@/lib/wiring/geocoder");
    expect(typeof geocoder.geocode).toBe("function");
    expect(typeof geocoder.geocodeMany).toBe("function");
  });
});
