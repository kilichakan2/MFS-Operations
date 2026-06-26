/**
 * tests/unit/adapters/fake/Geocoder.test.ts
 *
 * F-20 PR1 — runs the shared Geocoder contract against the Fake in-memory
 * adapter. No network. The Fake is seeded so that:
 *   - "S3 8DG"  resolves exactly (approximate:false)
 *   - "S70 1KW" misses exactly but its outcode "S70" hits (approximate:true)
 *   - "ZZ9 9ZZ" misses both (→ null)
 */
import { geocoderContract } from "@/lib/ports/__contracts__/Geocoder.contract";
import { createFakeGeocoder } from "@/lib/adapters/fake";

geocoderContract(async () => {
  const geocoder = createFakeGeocoder({
    exact: {
      "S3 8DG": { lat: 53.38, lng: -1.47 },
    },
    outcodes: {
      S70: { lat: 53.55, lng: -1.48 },
    },
  });
  return {
    geocoder,
    exactHitPostcode: "S3 8DG",
    outcodeOnlyPostcode: "S70 1KW",
    doubleMissPostcode: "ZZ9 9ZZ",
    cleanup: async () => {},
  };
});
