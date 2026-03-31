# MFS Operations — Route Optimisation Changelog

**App:** mfsops.com  
**Engine:** `app/api/routes/optimise/route.ts`  
**Tests:** `scripts/test-routing-engine.ts` (42 routing + 25 unit tests)

---

## Algorithm Overview

The optimiser runs a multi-pass pipeline against the Google Routes API to produce a route that respects MFS business rules: urgent stops first, priority stops early in their cluster, locked stops immovable, and non-urgent stops resequenced from the driver's actual mid-route position.

```
Pass 1  → Google TSP (geographic spine)
Pass 2  → Cluster stops ≤25 min apart
Pass 2b → Sort clusters nearest-to-hub first (priority/urgent routes only)
Pass 3  → Within-cluster: urgent > priority > none
Pass 3b → Urgent front-block: extract ALL urgent stops to front
Pass 3c → Non-urgent resequencing: second Google TSP from last urgent stop
Pass 4  → Final ETAs: Google computeRoutes (no reorder, TRAFFIC_AWARE_OPTIMAL)
```

---

## Iteration Log

---

### v1 — Initial Build
**Commit range:** pre-history (before git shallow clone)

**What was built:**
- Route planner UI at `/routes` — create routes, add stops, drag-reorder
- Google Routes API integration (Pass 1 geographic spine with `optimizeWaypointOrder: true`)
- Stop management: customers pulled from Supabase, postcode geocoding, lat/lng stored
- Priority flags per stop: `none` | `priority` | `urgent`
- Locked position toggle — pins a stop to its current position, optimiser cannot move it
- Pass 4 ETA calculation using `computeRoutes` without reorder
- Driver view at `/driver` — assigned route, stops in order, tap to mark visited

**State at end:** Single Google TSP call, no business-rule ordering, 15-minute service time per stop.

---

### v2 — Service Time 15 min → 20 min
**Commit:** `9cdd4c6`

**Problem:** 15 minutes per stop was too tight for MFS deliveries.

**Fix:** Updated `SERVICE_TIME_MINS` from 15 to 20 in all 4 locations:
- `app/api/routes/optimise/route.ts` (source of truth)
- `app/driver/page.tsx` (shift summary display)
- `app/routes/page.tsx` (route planner display)
- `scripts/test-routing-engine.ts` (all ETA assertions updated)

**ETA impact (6-stop example, 08:00 departure, 84 min drive):**
```
Was: total shift 174 min (84 drive + 90 service)
Now: total shift 204 min (84 drive + 120 service)
```

**Tests updated:** 37/37 → all green.

---

### v3 — Urgent Front-Block (Pass 3b)
**Commit:** `aa63fda`

**Problem:** Urgent stops were being delivered mid-route. A far-cluster urgent stop (e.g. Cheadle SK8 on a Sheffield-origin route) stayed in cluster 2, arriving hours into the shift — too late for kitchen prep.

**Root cause:** Clustering placed urgent stops with their geographic neighbours. Priority sorting worked _within_ clusters but couldn't move urgent stops out of a distant cluster.

**Fix — Pass 3b:**
After all clustering and within-cluster sorting (Passes 1–3), ALL urgent unlocked stops are extracted and promoted to a fixed front-block, sorted nearest-to-hub first using haversine distance. Non-urgent stops follow in their existing order.

**Result (Sheffield origin example):**
```
Before: Crewe(std) → Cheadle(urgent) → Bramhall(urgent) → Poynton(urgent) → ...
After:  Poynton(urgent, 43km) → Bramhall(urgent, 45km) → Cheadle(urgent, 47km) → ...
```

`haversineKm()` helper added — used for urgent sorting and later greedy resequencing.

**Tests added:** Urgent front-block ordering, multi-cluster scenarios.

---

### v4 — Greedy Nearest-Neighbour Resequencing (Pass 3b → greedy)
**Commit:** `a8ba40e`

**Problem:** After extracting urgent stops to the front, the driver ends at a specific mid-route location — NOT Sheffield. The remaining non-urgent stops kept their original Google loop order (designed for a Sheffield-origin loop), causing detours.

**Example:** Driver ends urgent block at Cheadle SK8. Remaining Google loop order: Crewe (39 km south-west) → Manchester M17 (back north). Driver was spending ~1 hour extra backtracking.

**Root cause:** Extracting urgent stops breaks the loop topology. Google planned Crewe after Cheadle because in the full 10-stop loop that leg was efficient. Once Cheadle becomes the _end_ of the urgent block rather than a mid-loop stop, the loop order is invalid.

**Fix — `greedyNearest()` function:**
After the urgent front-block is built, if urgent stops exist, re-sequence the remaining non-urgent stops using nearest-neighbour greedy from the last urgent stop's coordinates.

```typescript
function greedyNearest(origin: { lat; lng }, stops: WorkingStop[]): WorkingStop[]
// At each step, picks the stop closest (haversine) to the current position.
```

**Tests added:** Greedy resequencing from arbitrary origin, comparison vs original loop order.

---

### v5 — Route Key Colour Fixes + Debug Report (Copy Route Info)
**Commit:** `14693ad`

**What was built:**
- `?` help button on route map opens a help panel
- "Copy route info" button inside the panel builds a plain-text debug report from live component state and copies to clipboard
- Report includes: route header, summary (stop count, urgent/priority/locked counts, driving/unloading time, total shift, distance km+mi), stop-by-stop order with arrival/departure times and drive time from previous stop, algorithm info (which passes ran)
- Route key colours fixed (priority/urgent visual indicators on stop cards)

**Fix in this commit:** `?? p.assignedTo || 'Unassigned'` syntax error — nullish coalescing mixed with logical OR requires parentheses. Fixed to `(p.users.find(...)?.name ?? p.assignedTo) || 'Unassigned'`.

---

### v6 — Pass 3c: Second Google TSP for Non-Urgent Resequencing
**Commit:** `4e1c057`

**Problem:** Greedy nearest-neighbour (v4) fixed the backtrack in most cases but produced suboptimal results when clusters were geographically disconnected.

**Root cause confirmed by coordinate audit:**  
SK9 1DR (Konak Cafe) geocoded at `lat=53.327` — south of Cheadle (53.393). From SK9, haversine distances: SK11=10.2 km vs M17=16.7 km. Greedy correctly picked SK11 (nearer), continued south through Congleton and Crewe, then backtracked 43.4 km north-west to Warrington, then 28 km north-east to M17 Trafford. Classic greedy trap: locally optimal at every step, globally suboptimal.

**Fix — Pass 3c (replaces greedy as primary path):**  
When urgent stops exist AND non-urgent stops ≥ 2:
1. Make a second Google Routes API call with:
   - `origin` = last urgent stop coordinates
   - `optimizeWaypointOrder: true`
   - `routingPreference: TRAFFIC_AWARE`
2. Extract the reordered intermediate indices
3. Greedy remains as fallback if Pass 3c API call fails

**Verification:**  
Full TSP enumeration (7! = 5040 permutations) confirmed the resulting route is **rank 6/5040 (top 0.1%)** — only 4.3 km haversine off the theoretical optimum (~8–10 km road on a 283 km route). The route is correct and near-optimal.

**Tests added:** 42 routing tests total — enumeration verification, Pass 3c scenarios.

---

### v7 — Debug Label Fix
**Commit:** `4066d4f`

**Problem:** Algorithm info section still showed "Greedy resequence: YES" after Pass 3c replaced greedy as the primary path.

**Fix:** Updated label to "Non-urgent resequence (Pass 3c)" to accurately describe what ran.

---

### v8 — Return Time on Route Summary
**Commit:** `f3c6505`

**What was built:**  
"🏠 Back at MFS" (or "Back at Ozmen") with exact return time shown in the route summary panel.

**Calculation:** `departureTime + totalDurationMin`  
`totalDurationMin` already includes the drive from the last stop back to the hub (Google's Pass 4 routes all the way to destination), so no extra calculation needed.

**Display:** Styled in MFS orange (`#EB6619`) below the Total Shift line.

**Example:** Depart 10:00, 9h 23m total → Back at MFS 19:23.

---

## Constants

| Constant | Value | Notes |
|----------|-------|-------|
| `SERVICE_TIME_MINS` | 20 | Unloading time per stop |
| `CLUSTER_GAP_S` | 1500 (25 min) | Max drive gap within a cluster |
| Pass 1 routing | `TRAFFIC_AWARE` | Required for TSP |
| Pass 3c routing | `TRAFFIC_AWARE` | Non-urgent TSP from last urgent stop |
| Pass 4 routing | `TRAFFIC_AWARE_OPTIMAL` | Final ETAs (most accurate) |

---

## Test Suite

**File:** `scripts/test-routing-engine.ts`  
**Run:** `npx tsx scripts/test-routing-engine.ts`  
**Coverage:** 42 routing tests + 25 unit tests = 67 total

**What's tested:**
- Pass 2 cluster formation (gap boundary, multi-cluster)
- Pass 2b cluster ordering (priority routes re-sorted near→far, standard routes kept)
- Pass 3 within-cluster priority sorting
- Pass 3b urgent front-block extraction and haversine ordering
- Greedy nearest-neighbour from arbitrary origin
- Locked stop reinsertion at correct positions
- ETA calculation with service time
- TSP enumeration — confirms live route is near-optimal
- Edge cases: single stop, all urgent, all locked, mixed priority

---

## Known Behaviours / Trade-offs

**Haversine vs road distance for urgent sorting:**  
Urgent stops are sorted nearest-to-hub by haversine (straight-line). This is fast and accurate enough for the scale of MFS routes (~50 km radius). Road distance would require additional API calls.

**Pass 3c is Google TSP, not exact TSP:**  
Google's `optimizeWaypointOrder` uses an approximate TSP algorithm. For ≤10 non-urgent stops (typical MFS route), the result is near-optimal (confirmed by enumeration above).

**Greedy fallback:**  
If the Pass 3c API call fails (timeout, quota), greedy nearest-neighbour is used. Greedy can produce suboptimal results when clusters are geographically disconnected (see v6 above), but is always a valid route.

**Locked stops bypass all sorting:**  
Locked stops are extracted before all passes and reinserted at their original positions after the optimiser runs. They are invisible to all sorting passes.

---

---

### v9 — Remove Destination from Pass 3c (One-Way Sweep Fix) ⚠️ superseded by v10
**Commit:** `pending` → updated on push

**Problem identified by:** Daz (warehouse/supply chain) — noticed Route A (1 urgent) was slower than Route B (4 urgent) for the same 8 stops (Jihad Leeds run, 31/03/2026).

**Root cause:**
Pass 3c included `destination: MFS hub` in the Google TSP body. This made Google plan a **closed loop**: last urgent stop → non-urgent stops → return to Sheffield. Closed-loop TSP is geometrically correct for minimising total distance on a round trip, but it biases the algorithm toward reaching the farthest stop first — which is wasteful for shift time when the driver is already near the hub.

**Concrete example:**
- Only urgent stop: MAVI RUYA (S7 Sheffield) — very close to hub
- Pass 3c origin: S7, destination: S3 Sheffield
- Google's closed-loop response: go to IZGARA Garforth (LS25, 65 min away) first, then sweep back through Harrogate/Leeds/Wakefield
- Result: 65-minute dead leg at stop 2, total 4h 37m driving

**Daz's workaround:** Marking WF1/LS27 stops as urgent shifted Pass 3c origin to south Leeds (LS27). From there, Google's loop TSP happened to produce the right sweep anyway. Saved 26 minutes (4h 37m → 4h 11m) despite 12.5 km more distance.

**Fix:** Remove `destination` from Pass 3c body entirely. Google now plans `origin=last urgent → non-urgent stops` as a one-way sweep. Pass 4 handles all return routing and ETAs independently — it was always doing this anyway.

**Change:** 1 line removed from `p3cBody` in `app/api/routes/optimise/route.ts`. All other passes untouched.

**Rollback:** `git revert HEAD && git push` — instant, no DB changes.

---


---

### v10 — Exact Haversine TSP replaces Google TSP in Pass 3c
**Commit:** `pending`

**Problem identified by:** Hakan — manual route (Izgara locked last) consistently beat the app's automated result on both time and distance, which should not be possible if the algorithm is finding the optimal sequence.

**Root cause:** Google's `optimizeWaypointOrder` in Pass 3c is an approximation heuristic, not an exact solver. It produced inconsistent results across runs (identical stops, different dates → different orderings), and on the April 1st Leeds run produced 240km vs the 207.5km achievable manually. No approximation algorithm can guarantee the best result.

**Fix — `exactTSP()` function (Heap's algorithm):**
Enumerates every permutation of non-urgent stops and returns the ordering with the minimum total haversine chain distance.

Scoring function:
```
origin (last urgent stop) → stop[0] → stop[1] → ... → stop[N-1] → hub (MFS/Ozmen)
```

Including the return-to-hub leg is the key improvement over v9 — it naturally scores "on-the-way-home" stops (like Garforth LS25 for Leeds runs) lower when placed last, because the hub-return leg is short from Garforth. No manual lock required.

**Cap:** ≤10 non-urgent stops → exactTSP (10! = 3,628,800 permutations, ~800ms worst case). 11+ → greedy nearest-neighbour fallback.

**Proven correct:** Every new test cross-validates exactTSP against a brute-force reference that independently enumerates all permutations. The costs match to 3 decimal places on every test case.

**Side effect — saves one Google API call per route optimisation:** Pass 3c previously made a second Google Routes API call. That call is eliminated — exactTSP is pure maths, no network round trip.

**Limitation acknowledged:** haversine ≠ road time. The brute-force proof on the Jihad Leeds coordinates showed haversine-optimal puts Izgara first (not last), because Garforth is geographically close to Sheffield on a straight line even though road geometry favours it last. The next iteration (v11) will replace haversine with a pre-computed road-time matrix cached in Supabase.

**Tests added:** 8 new exactTSP tests including:
- Jihad Leeds brute-force correctness proof
- Harrogate cluster adjacency (HG1 stops always consecutive)
- 2-stop, 3-stop, 5-stop brute-force cross-validation
- Edge cases: single stop, empty stops
- Cap logic: ≤10 exact, 11+ greedy

**Rollback:** `git revert HEAD + push` — no DB changes.

## What's Next (Pending)

- **v11 — Road-time matrix cache (Supabase):** Pre-compute road times for all customer pairs via Google Distance Matrix API (one-time ~4p cost), store in `customer_road_times` table. exactTSP will use real road times instead of haversine. New customer trigger recomputes their pairs on add/geocode. Weekly cron refresh. This will make Garforth-last automatic on Leeds runs without any manual lock.


- **Postcode geocoding gaps** — some customers have postcodes but no `lat/lng`; `sniffBrokenPostcodes()` identifies these; full geocoding backfill pending
- **Multi-day / multi-driver** — current engine is single-driver single-day
