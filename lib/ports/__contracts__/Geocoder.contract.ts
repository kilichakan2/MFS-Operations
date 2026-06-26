/**
 * lib/ports/__contracts__/Geocoder.contract.ts
 *
 * Shared behavioural contract for the Geocoder port. Both implementations — the
 * postcodes.io real adapter (driven with a mocked `fetch`) and the Fake
 * in-memory adapter — pass the SAME suite. This is the single source of truth
 * for "what does a Geocoder promise", independent of vendor.
 *
 * Pattern (mirrors CustomersRepository.contract.ts): export one function
 * `geocoderContract(setup)`. The setup closure returns a per-case bundle naming
 * the postcodes the implementation has been arranged to answer for:
 *   - exactHitPostcode    → resolves exactly (approximate:false)
 *   - outcodeOnlyPostcode → exact misses, outcode hits (approximate:true)
 *   - doubleMissPostcode  → both miss (null)
 *
 * The contract imports ONLY the port type and Vitest primitives — no concrete
 * adapter, no SDK, no vendor row shape.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Geocoder } from "@/lib/ports";

export interface GeocoderContractSetup {
  geocoder: Geocoder;
  /** A postcode the implementation resolves EXACTLY (approximate:false). */
  exactHitPostcode: string;
  /** A postcode whose exact lookup misses but whose outcode hits (approximate:true). */
  outcodeOnlyPostcode: string;
  /** A postcode whose exact AND outcode lookups both miss (→ null). */
  doubleMissPostcode: string;
  cleanup: () => Promise<void>;
}

export function geocoderContract(
  setup: () => Promise<GeocoderContractSetup>,
): void {
  describe("Geocoder contract", () => {
    let ctx: GeocoderContractSetup;

    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    it("resolves an exact postcode with approximate:false", async () => {
      const res = await ctx.geocoder.geocode(ctx.exactHitPostcode);
      expect(res).not.toBeNull();
      if (res === null) throw new Error("expected a result");
      expect(typeof res.lat).toBe("number");
      expect(typeof res.lng).toBe("number");
      expect(res.approximate).toBe(false);
    });

    it("falls back to the outcode with approximate:true when the exact misses", async () => {
      const res = await ctx.geocoder.geocode(ctx.outcodeOnlyPostcode);
      expect(res).not.toBeNull();
      if (res === null) throw new Error("expected a result");
      expect(typeof res.lat).toBe("number");
      expect(typeof res.lng).toBe("number");
      expect(res.approximate).toBe(true);
    });

    it("returns null when both the exact postcode and its outcode miss", async () => {
      const res = await ctx.geocoder.geocode(ctx.doubleMissPostcode);
      expect(res).toBeNull();
    });

    it("geocodeMany returns a result per input keyed by the trimmed/upper-cased postcode", async () => {
      const inputs = [
        ctx.exactHitPostcode,
        ctx.outcodeOnlyPostcode,
        ctx.doubleMissPostcode,
      ];
      const map = await ctx.geocoder.geocodeMany(inputs);

      const exactKey = ctx.exactHitPostcode.trim().toUpperCase();
      const outcodeKey = ctx.outcodeOnlyPostcode.trim().toUpperCase();
      const missKey = ctx.doubleMissPostcode.trim().toUpperCase();

      expect(map.has(exactKey)).toBe(true);
      expect(map.has(outcodeKey)).toBe(true);
      expect(map.has(missKey)).toBe(true);

      const exact = map.get(exactKey);
      expect(exact).not.toBeNull();
      expect(exact?.approximate).toBe(false);

      const outcode = map.get(outcodeKey);
      expect(outcode).not.toBeNull();
      expect(outcode?.approximate).toBe(true);

      expect(map.get(missKey)).toBeNull();
    });
  });
}
