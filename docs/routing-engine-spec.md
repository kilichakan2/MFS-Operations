# MFS Route Planner — Routing Engine Specification

## 0. Infrastructure & Security
- **API Key Variable:** `process.env.GOOGLE_MAPS_API_KEY` (Vercel env var, same key used by legacy Directions API)
- **Auth header:** `X-Goog-Api-Key: <key>` — never hardcoded, never exposed to client
- **Endpoint:** `https://routes.googleapis.com/directions/v2:computeRoutes`
- **Field mask:** `X-Goog-FieldMask: routes.optimizedIntermediateWaypointIndex,routes.legs,routes.distanceMeters,routes.duration`

---

## 1. Fixed Anchors

| Point | Postcode | Raw (no spaces) |
|---|---|---|
| MFS Sheffield (origin) | S3 8DG | S38DG |
| Ozmen John Street (alt destination) | S2 4QT | S24QT |

All postcodes sent to Google are stripped of whitespace and uppercased: `'S70 1GW' → 'S70GW'`.

---

## 2. Algorithm Overview — Four Passes

```
INPUT: stops[] with { customerId, postcode, priority, lockedPosition }

Pass 1 ─ Geographic spine      →  Google's optimal visit order (TSP)
Pass 2 ─ Cluster by drive time →  Group stops ≤25 min apart
Pass 3 ─ Priority sort         →  Within each cluster: Urgent > Priority > Standard
Pass 4 ─ Final ETAs            →  Reconfirm route with locked order, get real arrival times

OUTPUT: orderedStops[] with position + estimatedArrival + drive times
```

---

## 3. Pass 1 — Geographic Spine

**Call:** `POST computeRoutes` with `optimizeWaypointOrder: true`

```json
{
  "origin":      { "address": "S38DG, UK" },
  "destination": { "address": "S38DG, UK" },
  "intermediates": [
    { "address": "S701GW, UK" },
    { "address": "S24QT, UK" }
  ],
  "travelMode":          "DRIVE",
  "routingPreference":   "TRAFFIC_AWARE_OPTIMAL",
  "optimizeWaypointOrder": true,
  "departureTime":       "2026-03-26T08:00:00Z"
}
```

**Departure time rule:** If the requested departure is in the past, omit `departureTime` entirely — Google defaults to current time with live traffic.

**Output:** `routes[0].optimizedIntermediateWaypointIndex` — e.g. `[2, 0, 1]` means Google recommends visiting stop[2] first, then stop[0], then stop[1]. Also captures per-leg `duration` (string, e.g. `"723s"`) and `distanceMeters`.

**Locked stops:** Locked stops are excluded from Pass 1. Their positions are reserved as slots and merged back after Pass 3.

---

## 4. Pass 2 — Cluster by 25-Minute Boundary

Walk through the Google-optimised sequence. Track cumulative drive time between each consecutive pair of stops using the leg durations from Pass 1.

**Cluster boundary rule:** If the drive time from stop N to stop N+1 > **25 minutes (1500 seconds)**, start a new cluster.

```
Example:
  Stop A → Stop B: 12 min  → same cluster
  Stop B → Stop C: 8 min   → same cluster
  Stop C → Stop D: 31 min  → NEW cluster
  Stop D → Stop E: 6 min   → same cluster (second cluster)

Clusters: [[A, B, C], [D, E]]
```

---

## 5. Pass 3 — Priority Sort Within Clusters

Within each cluster, sort by priority. **Locked stops do not move.**

Priority order (ascending position number = earlier in cluster):
1. `urgent`   — customer flagged low stock / time-critical
2. `priority` — customer requested early delivery
3. `none`     — standard stop

```
Cluster before: [Standard, Urgent, Priority, Standard]
Cluster after:  [Urgent, Priority, Standard, Standard]
```

---

## 6. Pass 4 — Final ETAs

**Call:** `POST computeRoutes` with `optimizeWaypointOrder: false`

Send the full stop list in the clustered + prioritised order from Pass 3. Google returns accurate ETAs and leg details for this exact sequence.

Parse per-stop estimated arrival:
```
departure_ms + sum(leg.duration for all preceding legs)
```

---

## 7. Response Shape (unchanged — frontend contract)

```ts
{
  orderedStops: Array<{
    position:             number        // 1-based
    customerId:           string
    customerName:         string
    postcode:             string | null
    lat:                  number | null
    lng:                  number | null
    priority:             'none' | 'urgent' | 'priority'
    lockedPosition:       boolean
    priorityNote:         string | null
    estimatedArrival:     string        // "HH:MM"
    driveTimeFromPrevMin: number
    distanceFromPrevKm:   number
  }>
  totalDistanceKm:  number
  totalDurationMin: number
  googleMapsUrl:    string              // deep link for driver's phone
}
```

---

## 8. Error Handling

| Condition | Action |
|---|---|
| `RESOURCE_EXHAUSTED` | Return 429 with quota message |
| `INVALID_ARGUMENT` | Run per-stop sniffer, return `brokenPostcodes[]` |
| Missing postcode on any stop | Reject 422 before calling Google |
| Departure in the past | Omit `departureTime` (use live traffic) |
| API key missing | Return 500 immediately |
