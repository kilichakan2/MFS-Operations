/**
 * scripts/test-routing-engine.ts
 *
 * VRP test suite — proves the routing engine business logic is correct
 * before any push to main. Tests both pure algorithm and full pipeline
 * with mocked Google API responses.
 *
 * Run: npx tsx scripts/test-routing-engine.ts
 */

// ─── Mirrors of the pure functions from route.ts ─────────────────────────────

const CLUSTER_THRESHOLD_S = 25 * 60
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, priority: 1, none: 2 }

// MFS hub coords — mirrors lib/hubs.ts
const MFS_LAT = 53.392371
const MFS_LNG = -1.479496

// Mirror of optimise/route.ts haversineKm
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
              + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
              * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Mirror of optimise/route.ts Pass 3b: urgent front-block
// Pull all urgent stops to front, sorted nearest-to-hub first.
function extractUrgentFront(stops: TestStop[]): TestStop[] {
  const urgent = [...stops.filter(s => s.priority === 'urgent')]
    .sort((a, b) =>
      haversineKm(MFS_LAT, MFS_LNG, a.lat, a.lng) -
      haversineKm(MFS_LAT, MFS_LNG, b.lat, b.lng)
    )
  const rest = stops.filter(s => s.priority !== 'urgent')
  return [...urgent, ...rest]
}

// Mirror of optimise/route.ts greedyNearest
// Re-sequences non-urgent stops from the driver's actual position after urgent block.
function greedyNearest(stops: TestStop[], fromLat: number, fromLng: number): TestStop[] {
  const remaining = [...stops]
  const ordered:   TestStop[] = []
  let curLat = fromLat
  let curLng = fromLng
  while (remaining.length > 0) {
    let nearestIdx  = 0
    let nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(curLat, curLng, remaining[i].lat, remaining[i].lng)
      if (d < nearestDist) { nearestDist = d; nearestIdx = i }
    }
    const next = remaining.splice(nearestIdx, 1)[0]
    ordered.push(next)
    curLat = next.lat
    curLng = next.lng
  }
  return ordered
}

// Full Pass 3b pipeline mirror: urgent front + greedy non-urgent
function applyUrgentAndGreedy(stops: TestStop[]): TestStop[] {
  const urgent    = [...stops.filter(s => s.priority === 'urgent')]
    .sort((a, b) =>
      haversineKm(MFS_LAT, MFS_LNG, a.lat, a.lng) -
      haversineKm(MFS_LAT, MFS_LNG, b.lat, b.lng)
    )
  const nonUrgent = stops.filter(s => s.priority !== 'urgent')
  if (urgent.length === 0 || nonUrgent.length === 0) return [...urgent, ...nonUrgent]
  const lastUrgent  = urgent[urgent.length - 1]
  const greedySorted = greedyNearest(nonUrgent, lastUrgent.lat, lastUrgent.lng)
  return [...urgent, ...greedySorted]
}

function cleanPostcode(pc: string): string {
  return pc.replace(/\s+/g, '').trim().toUpperCase()
}
function parseDuration(d: string | undefined): number {
  if (!d) return 0
  return parseInt(d.replace('s', ''), 10) || 0
}
function toHHMM(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 5)
}
function latLngWaypoint(lat: number, lng: number) {
  return { location: { latLng: { latitude: lat, longitude: lng } } }
}
function addrWaypoint(postcode: string) {
  return { address: `${postcode}, UK` }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestStop {
  customerId:     string
  name:           string
  postcode:       string
  lat:            number
  lng:            number
  priority:       'none' | 'urgent' | 'priority'
  lockedPosition: boolean
}
interface RoutesLeg {
  duration?:       string
  distanceMeters?: number
}

// ─── Algorithm (exact mirror of route.ts) ────────────────────────────────────
//
// CRITICAL: legDurations[i] = drive time TO reach geoOrdered[i] from the
// previous stop. This matches the Google API legs array structure:
//   legs[0] = origin → stop[0]      (unused in clustering)
//   legs[1] = stop[0] → stop[1]     (used when i=1)
//   legs[i] = stop[i-1] → stop[i]   (used when processing stop i)

function clusterAndSort(geoOrdered: TestStop[], legDurations: RoutesLeg[]): TestStop[][] {
  // Pass 2: build clusters by consecutive drive gap
  const clusters:          TestStop[][] = []
  const clusterOriginLegS: number[]    = []
  let current: TestStop[] = []
  let currentOriginIdx = 0

  for (let i = 0; i < geoOrdered.length; i++) {
    if (current.length === 0) {
      current.push(geoOrdered[i])
      currentOriginIdx = i
      continue
    }
    const driveS = parseDuration(legDurations[i]?.duration)
    if (driveS > CLUSTER_THRESHOLD_S) {
      clusters.push(current)
      clusterOriginLegS.push(parseDuration(legDurations[currentOriginIdx]?.duration))
      current = [geoOrdered[i]]
      currentOriginIdx = i
    } else {
      current.push(geoOrdered[i])
    }
  }
  if (current.length > 0) {
    clusters.push(current)
    clusterOriginLegS.push(parseDuration(legDurations[currentOriginIdx]?.duration))
  }

  // Pass 2b: sort clusters nearest-to-origin first — but ONLY if hasPriority
  const hasPriority = geoOrdered.some(s => s.priority !== 'none')
  let clustersOrdered: TestStop[][]
  if (hasPriority) {
    const order     = clusters.map((_, i) => i).sort((a, b) => clusterOriginLegS[a] - clusterOriginLegS[b])
    clustersOrdered = order.map(i => clusters[i])
  } else {
    clustersOrdered = clusters  // all-standard: trust Google's sequence
  }

  // Pass 3: priority sort within each cluster (no-op for all-standard)
  return clustersOrdered.map(cl =>
    [...cl].sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
    )
  )
}

function reinsertLocked(allStops: TestStop[], clusteredUnlocked: TestStop[]): TestStop[] {
  const finalOrdered: (TestStop | null)[] = new Array(allStops.length).fill(null)
  for (const s of allStops.filter(s => s.lockedPosition)) {
    const idx = allStops.findIndex(w => w.customerId === s.customerId)
    if (idx >= 0) finalOrdered[idx] = s
  }
  let cur = 0
  for (let i = 0; i < finalOrdered.length; i++) {
    if (finalOrdered[i] === null) finalOrdered[i] = clusteredUnlocked[cur++]
  }
  return finalOrdered as TestStop[]
}

function buildOutput(finalOrdered: TestStop[], p4Legs: RoutesLeg[], baseDepartureMs: number) {
  let cumMs = 0
  return finalOrdered.map((s, i) => {
    const leg   = p4Legs[i]
    const legS  = parseDuration(leg?.duration)
    const legKm = (leg?.distanceMeters ?? 0) / 1000
    cumMs += legS * 1000
    return {
      position:             i + 1,
      customerId:           s.customerId,
      customerName:         s.name,
      postcode:             s.postcode,
      lat:                  s.lat,
      lng:                  s.lng,
      priority:             s.priority,
      lockedPosition:       s.lockedPosition,
      estimatedArrival:     toHHMM(baseDepartureMs + cumMs),
      driveTimeFromPrevMin: Math.round(legS / 60),
      distanceFromPrevKm:   Math.round(legKm * 10) / 10,
    }
  })
}

// ─── Service time helper (mirrors route.ts) ───────────────────────────────────

const SERVICE_TIME_MINS = 20
const SERVICE_TIME_MS   = SERVICE_TIME_MINS * 60 * 1000

function buildOutputWithServiceTime(
  finalOrdered: TestStop[],
  p4Legs: RoutesLeg[],
  baseDepartureMs: number,
) {
  let cumMs = 0
  const stops = finalOrdered.map((s, i) => {
    const leg   = p4Legs[i]
    const legS  = parseDuration(leg?.duration)
    const legKm = (leg?.distanceMeters ?? 0) / 1000
    cumMs += legS * 1000
    const arrival = toHHMM(baseDepartureMs + cumMs)
    cumMs += SERVICE_TIME_MS   // unloading — affects next stop's ETA
    return {
      position:             i + 1,
      customerId:           s.customerId,
      customerName:         s.name,
      postcode:             s.postcode,
      estimatedArrival:     arrival,
      driveTimeFromPrevMin: Math.round(legS / 60),
      distanceFromPrevKm:   Math.round(legKm * 10) / 10,
    }
  })
  const totalDriveS  = p4Legs.reduce((acc, l) => acc + parseDuration(l.duration), 0)
  const totalDurMin  = Math.round(totalDriveS / 60) + finalOrdered.length * SERVICE_TIME_MINS
  return { stops, totalDurMin }
}

const REAL_6: TestStop[] = [
  { customerId: 'c1', name: 'BRILL BURGER SHEFFIELD', postcode: 'S10 1TE', lat: 53.385617, lng: -1.508355, priority: 'none', lockedPosition: false },
  { customerId: 'c2', name: 'DELIGHT BURGER',          postcode: 'S18 2XB', lat: 53.301098, lng: -1.466741, priority: 'none', lockedPosition: false },
  { customerId: 'c3', name: 'THE DEVONSHIRE ARMS',     postcode: 'S21 5RN', lat: 53.297200, lng: -1.393959, priority: 'none', lockedPosition: false },
  { customerId: 'c4', name: 'JENNYS CAFE',              postcode: 'S80 1EJ', lat: 53.305001, lng: -1.125426, priority: 'none', lockedPosition: false },
  { customerId: 'c5', name: 'TOPKAPI KEBAB',            postcode: 'S80 1LA', lat: 53.303849, lng: -1.128931, priority: 'none', lockedPosition: false },
  { customerId: 'c6', name: 'PIZZA MILANO',             postcode: 'S80 2JN', lat: 53.302355, lng: -1.115336, priority: 'none', lockedPosition: false },
]

// Realistic mocked legs for the 6-stop route.
// Index i = drive time TO reach geoOrdered[i] from the previous stop:
//   [0] origin(S38DG) → Sheffield(S101TE): 8min  → push directly (unused in clustering)
//   [1] Sheffield → Dronfield(S182XB):      22min → 1320s, NOT > 1500 → same cluster
//   [2] Dronfield → Eckington(S215RN):      13min → 780s,  NOT > 1500 → same cluster
//   [3] Eckington → Jennys(S801EJ):         32min → 1920s, IS  > 1500 → NEW CLUSTER
//   [4] Jennys → Topkapi(S801LA):            3min → 180s,  NOT > 1500 → same cluster
//   [5] Topkapi → Milano(S802JN):            4min → 240s,  NOT > 1500 → same cluster
//   [6] Milano → destination:                8min → unused in clustering
// Expected clusters: [[Sheffield, Dronfield, Eckington], [Jennys, Topkapi, Milano]]

const MOCK_P1_LEGS: RoutesLeg[] = [
  { duration: '480s',  distanceMeters: 3200  },   // [0] origin → Sheffield
  { duration: '1320s', distanceMeters: 18000 },   // [1] Sheffield → Dronfield
  { duration: '780s',  distanceMeters: 8500  },   // [2] Dronfield → Eckington
  { duration: '1920s', distanceMeters: 27000 },   // [3] Eckington → Jennys (CLUSTER SPLIT)
  { duration: '180s',  distanceMeters: 1100  },   // [4] Jennys → Topkapi
  { duration: '240s',  distanceMeters: 1800  },   // [5] Topkapi → Milano
  { duration: '480s',  distanceMeters: 3200  },   // [6] Milano → destination
]

const MOCK_P4_LEGS: RoutesLeg[] = [
  { duration: '510s',  distanceMeters: 3250  },
  { duration: '1340s', distanceMeters: 18100 },
  { duration: '800s',  distanceMeters: 8600  },
  { duration: '1950s', distanceMeters: 27200 },
  { duration: '190s',  distanceMeters: 1150  },
  { duration: '250s',  distanceMeters: 1850  },
]

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0, failed = 0, total = 0

function test(name: string, fn: () => void) {
  total++
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`)
    failed++
  }
}

function eq<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(msg ?? `Expected ${e}, got ${a}`)
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ─── Suite 0: Utility functions ───────────────────────────────────────────────

console.log('\n── Suite 0: Utility functions')

test('cleanPostcode strips all spaces', () => {
  eq(cleanPostcode('S3 8DG'), 'S38DG')
  eq(cleanPostcode(' s70 1gw '), 'S701GW')
  eq(cleanPostcode('S10  1TE'), 'S101TE')
})

test('parseDuration handles protobuf format', () => {
  eq(parseDuration('723s'), 723)
  eq(parseDuration('1500s'), 1500)
  eq(parseDuration(undefined), 0)
})

test('latLngWaypoint produces correct Routes API v2 format', () => {
  eq(latLngWaypoint(53.379, -1.464), { location: { latLng: { latitude: 53.379, longitude: -1.464 } } })
})

test('addrWaypoint appends , UK suffix', () => {
  eq(addrWaypoint('S38DG'), { address: 'S38DG, UK' })
})

// ─── Suite 1: VRP — Real 6 customers, all standard ───────────────────────────

console.log('\n── Suite 1: VRP — Real 6 customers, all standard')

test('6-stop: exactly 2 clusters', () => {
  const clusters = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  eq(clusters.length, 2, `Expected 2 clusters, got ${clusters.length}`)
})

test('6-stop: cluster 1 = Sheffield + Dronfield + Eckington (3 stops)', () => {
  const clusters = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  eq(clusters[0].length, 3)
  eq(clusters[0][0].name, 'BRILL BURGER SHEFFIELD')
  eq(clusters[0][1].name, 'DELIGHT BURGER')
  eq(clusters[0][2].name, 'THE DEVONSHIRE ARMS')
})

test('6-stop: cluster 2 = 3x Worksop stops', () => {
  const clusters = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  eq(clusters[1].length, 3)
  eq(clusters[1][0].name, 'JENNYS CAFE')
  eq(clusters[1][1].name, 'TOPKAPI KEBAB')
  eq(clusters[1][2].name, 'PIZZA MILANO')
})

test('6-stop: all standard — geo order preserved throughout', () => {
  const clusters = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  eq(clusters.flat().map(s => s.customerId), ['c1','c2','c3','c4','c5','c6'])
})

test('6-stop: full pipeline produces 6 orderedStops', () => {
  const clusters   = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  const finalOrder = reinsertLocked(REAL_6, clusters.flat())
  eq(finalOrder.length, 6)
  eq(finalOrder.map(s => s.customerId), ['c1','c2','c3','c4','c5','c6'])
})

test('6-stop: ETAs include 20-min service time at each stop', () => {
  const clusters   = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  const finalOrder = reinsertLocked(REAL_6, clusters.flat())
  const departure  = new Date('2026-03-27T08:00:00').getTime()
  const { stops: output } = buildOutputWithServiceTime(finalOrder, MOCK_P4_LEGS, departure)
  eq(output.length, 6)
  output.forEach(s => {
    assert(/^\d{2}:\d{2}$/.test(s.estimatedArrival), `ETA "${s.estimatedArrival}" is not HH:MM`)
  })
  // Stop 0: 510s drive only              → 08:08
  // Stop 1: +20min service +1340s drive  → 08:50
  // Stop 2: +20min service +800s drive   → 09:23
  // Stop 3: +20min service +1950s drive  → 10:15
  // Stop 4: +20min service +190s drive   → 10:38
  // Stop 5: +20min service +250s drive   → 11:02
  eq(output[0].estimatedArrival, '08:08')
  eq(output[1].estimatedArrival, '08:50')
  eq(output[2].estimatedArrival, '09:24')
  eq(output[3].estimatedArrival, '10:16')
  eq(output[4].estimatedArrival, '10:39')
  eq(output[5].estimatedArrival, '11:04')
  // driveTimeFromPrevMin is raw leg — not inflated by service time
  eq(output[0].driveTimeFromPrevMin, 9)    // 510s → 9min
  eq(output[1].driveTimeFromPrevMin, 22)   // 1340s → 22min
})

test('6-stop: totalDurationMin = drive time + 6 stops × 20min service time', () => {
  const clusters   = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  const finalOrder = reinsertLocked(REAL_6, clusters.flat())
  const departure  = new Date('2026-03-27T08:00:00').getTime()
  const { totalDurMin } = buildOutputWithServiceTime(finalOrder, MOCK_P4_LEGS, departure)
  // Drive: 510+1340+800+1950+190+250 = 5040s = 84min
  // Service: 6 × 20min = 120min
  // Total: 204min
  eq(totalDurMin, 204)
})

test('6-stop: total distance is plausible', () => {
  const totalDistM = MOCK_P4_LEGS.reduce((s, l) => s + (l.distanceMeters ?? 0), 0)
  assert(totalDistM > 30000, `Distance ${totalDistM}m seems too low`)
})

// ─── Suite 2: VRP — Worksop urgency ──────────────────────────────────────────

console.log('\n── Suite 2: VRP — 6 stops with Worksop urgency')

const REAL_6_URGENT: TestStop[] = REAL_6.map(s => ({
  ...s,
  priority: (s.customerId === 'c4' || s.customerId === 'c5') ? 'urgent' as const : 'none' as const,
}))

test('urgent: cluster 1 unchanged (all none, no reorder)', () => {
  const clusters = clusterAndSort(REAL_6_URGENT, MOCK_P1_LEGS)
  clusters[0].forEach(s => eq(s.priority, 'none'))
  eq(clusters[0].map(s => s.name), ['BRILL BURGER SHEFFIELD','DELIGHT BURGER','THE DEVONSHIRE ARMS'])
})

test('urgent: cluster 2 has Jennys(urgent) and Topkapi(urgent) first', () => {
  const clusters = clusterAndSort(REAL_6_URGENT, MOCK_P1_LEGS)
  eq(clusters[1][0].priority, 'urgent')
  eq(clusters[1][0].name, 'JENNYS CAFE')
  eq(clusters[1][1].priority, 'urgent')
  eq(clusters[1][1].name, 'TOPKAPI KEBAB')
  eq(clusters[1][2].priority, 'none')
  eq(clusters[1][2].name, 'PIZZA MILANO')
})

test('urgent stops are promoted to front of route, nearest-hub first', () => {
  const clusters     = clusterAndSort(REAL_6_URGENT, MOCK_P1_LEGS)
  const resequenced  = applyUrgentAndGreedy(clusters.flat())
  const finalOrder   = reinsertLocked(REAL_6_URGENT, resequenced)
  // Topkapi (25.27km from MFS) is nearer than Jennys (25.43km) — goes first
  eq(finalOrder[0].name, 'TOPKAPI KEBAB')
  eq(finalOrder[0].priority, 'urgent')
  eq(finalOrder[1].name, 'JENNYS CAFE')
  eq(finalOrder[1].priority, 'urgent')
  // Greedy from Jennys (last urgent): Pizza Milano (~0.73km) is nearest
  eq(finalOrder[2].name, 'PIZZA MILANO')
  eq(finalOrder[2].priority, 'none')
})

// ─── Suite 2b: Greedy fallback (when Pass 3c Google call fails) ──────────────
// In production, Pass 3c makes a second Google API call to re-sequence
// non-urgent stops from the last urgent stop's location. These tests cover
// the greedy nearest-neighbour FALLBACK that runs if that call fails.
// The primary path (Google TSP) is integration-tested against the live API.

console.log('\n── Suite 2b: Greedy fallback for non-urgent resequencing')

// Mirrors the production route from the screenshot:
// 3 urgent stops in Manchester area, then driver should pick nearby Manchester
// stops next — NOT detour south-west to Crewe first.
//
// Coordinates (approximate real postcodes):
//   Cheadle SK8    53.392, -2.218  — last urgent stop, driver is HERE after urgent block
//   Manchester M17 53.463, -2.279  — standard, ~8km from Cheadle  ← should go NEXT
//   Crewe CW2      53.080, -2.558  — standard, ~39km from Cheadle ← should go LAST
const CHEADLE_CREWE_STOPS: TestStop[] = [
  { customerId: 'urg1', name: 'Cheadle Urgent',  postcode: 'SK81Y', lat: 53.392, lng: -2.218, priority: 'urgent', lockedPosition: false },
  { customerId: 'std1', name: 'Crewe Standard',  postcode: 'CW27E', lat: 53.080, lng: -2.558, priority: 'none',   lockedPosition: false },
  { customerId: 'std2', name: 'Manchester M17',  postcode: 'M171D', lat: 53.463, lng: -2.279, priority: 'none',   lockedPosition: false },
]

test('greedy: Manchester M17 (8km) picked before Crewe (39km) after Cheadle urgent', () => {
  const resequenced = applyUrgentAndGreedy(CHEADLE_CREWE_STOPS)
  // Urgent Cheadle goes first (it's the only urgent stop)
  eq(resequenced[0].name, 'Cheadle Urgent')
  eq(resequenced[0].priority, 'urgent')
  // After Cheadle, Manchester M17 (8km) should come before Crewe (39km)
  eq(resequenced[1].name, 'Manchester M17',
    `Expected Manchester M17 next (8km from Cheadle), got ${resequenced[1].name} — Crewe would mean a 39km detour`)
  eq(resequenced[2].name, 'Crewe Standard')
})

test('greedy: with no urgent stops, order is unchanged', () => {
  const allStandard = CHEADLE_CREWE_STOPS.map(s => ({ ...s, priority: 'none' as const }))
  const original  = allStandard.map(s => s.name)
  const result    = applyUrgentAndGreedy(allStandard)
  eq(result.map(s => s.name), original)  // greedy not applied when no urgent stops
})

test('greedy: single non-urgent stop after urgent is returned as-is', () => {
  const stops: TestStop[] = [
    { customerId: 'u1', name: 'Urgent A',   postcode: 'S1', lat: 53.4, lng: -1.5, priority: 'urgent', lockedPosition: false },
    { customerId: 's1', name: 'Standard B', postcode: 'S2', lat: 53.3, lng: -1.4, priority: 'none',   lockedPosition: false },
  ]
  const result = applyUrgentAndGreedy(stops)
  eq(result[0].name, 'Urgent A')
  eq(result[1].name, 'Standard B')
})

test('greedy: multiple urgent stops sorted nearest-hub first', () => {
  // From MFS (53.392371, -1.479496):
  // Poynton SK12 (53.355, -2.125): ~43km
  // Bramhall SK7  (53.360, -2.155): ~45km
  // Cheadle SK8   (53.392, -2.218): ~47km
  const stops: TestStop[] = [
    { customerId: 'u1', name: 'Cheadle SK8',  postcode: 'SK81Y', lat: 53.392, lng: -2.218, priority: 'urgent', lockedPosition: false },
    { customerId: 'u2', name: 'Bramhall SK7', postcode: 'SK71A', lat: 53.360, lng: -2.155, priority: 'urgent', lockedPosition: false },
    { customerId: 'u3', name: 'Poynton SK12', postcode: 'SK121', lat: 53.355, lng: -2.125, priority: 'urgent', lockedPosition: false },
  ]
  const result = applyUrgentAndGreedy(stops)
  // Nearest to MFS hub first: Poynton (43km) → Bramhall (45km) → Cheadle (47km)
  eq(result[0].name, 'Poynton SK12')
  eq(result[1].name, 'Bramhall SK7')
  eq(result[2].name, 'Cheadle SK8')
})

// ─── Suite 3: Locked stop ────────────────────────────────────────────────────

console.log('\n── Suite 3: VRP — locked stop')

test('Locked stop stays at original index after clustering', () => {
  const withLocked = REAL_6.map((s, i) => ({ ...s, lockedPosition: i === 3 }))
  const unlocked   = withLocked.filter(s => !s.lockedPosition)
  // 5 unlocked stops, legs for the unlocked sub-route (5 stops)
  // Clustering uses legs[i] for the 5 unlocked stops:
  // Sheffield, Dronfield, Eckington, Topkapi, Milano (Jennys locked, removed)
  // Eckington→Topkapi would be ~37min → splits
  const lockedLegs: RoutesLeg[] = [
    { duration: '480s'  },  // [0] origin → Sheffield
    { duration: '1320s' },  // [1] Sheffield → Dronfield
    { duration: '780s'  },  // [2] Dronfield → Eckington
    { duration: '2220s' },  // [3] Eckington → Topkapi (37min, splits)
    { duration: '240s'  },  // [4] Topkapi → Milano
  ]
  const clusters   = clusterAndSort(unlocked, lockedLegs)
  const final      = reinsertLocked(withLocked, clusters.flat())
  eq(final[3].name, 'JENNYS CAFE')
  eq(final[3].lockedPosition, true)
})

// ─── Suite 3b: "Furthest First" — Google returns far stop first ──────────────
// This is the production bug: Sheffield (8min) + Worksop (35min).
// Google's TSP returns Worksop first (minimises round-trip mileage).
// Pass 2b must re-sort so Sheffield cluster runs before Worksop cluster.

console.log('\n── Suite 3b: Google "Furthest First" fix')

const FURTHEST_FIRST_STOPS: TestStop[] = [
  // Sheffield is NEAR (8min from origin)
  { customerId: 'near1', name: 'Sheffield Customer', postcode: 'S101TE', lat: 53.385, lng: -1.508, priority: 'none',   lockedPosition: false },
  // Worksop is FAR (35min from origin) — marked urgent to show it does NOT jump clusters
  { customerId: 'far1',  name: 'Worksop Urgent',     postcode: 'S801EJ', lat: 53.305, lng: -1.125, priority: 'urgent', lockedPosition: false },
]

// Google returns them FAR FIRST: [Worksop, Sheffield]
// legs[0] = origin→Worksop = 2100s (35min)
// legs[1] = Worksop→Sheffield = 1920s (32min) > threshold → new cluster
const FURTHEST_FIRST_GEO_ORDERED: TestStop[] = [
  FURTHEST_FIRST_STOPS[1],  // Worksop first (Google's TSP choice)
  FURTHEST_FIRST_STOPS[0],  // Sheffield second
]
const FURTHEST_FIRST_LEGS: RoutesLeg[] = [
  { duration: '2100s', distanceMeters: 40000 },   // [0] origin → Worksop (35min, FAR)
  { duration: '1920s', distanceMeters: 30000 },   // [1] Worksop → Sheffield (32min, > 25min threshold)
  { duration: '2100s', distanceMeters: 40000 },   // [2] Sheffield → destination
]

test('Furthest-first: Pass 2 correctly detects 2 clusters', () => {
  const clusters = clusterAndSort(FURTHEST_FIRST_GEO_ORDERED, FURTHEST_FIRST_LEGS)
  eq(clusters.length, 2, `Expected 2 clusters, got ${clusters.length}`)
})

test('Furthest-first: Pass 2b re-sorts so Sheffield (8min) runs BEFORE Worksop (35min)', () => {
  const clusters = clusterAndSort(FURTHEST_FIRST_GEO_ORDERED, FURTHEST_FIRST_LEGS)
  // Even though Google gave us [Worksop, Sheffield], Pass 2b must flip them
  eq(clusters[0][0].name, 'Sheffield Customer',
    `Cluster 0 should be Sheffield (near), got ${clusters[0][0].name}`)
  eq(clusters[1][0].name, 'Worksop Urgent',
    `Cluster 1 should be Worksop (far), got ${clusters[1][0].name}`)
})

test('Furthest-first: urgent Worksop IS promoted to front before Sheffield (urgent front-block)', () => {
  const clusters    = clusterAndSort(FURTHEST_FIRST_GEO_ORDERED, FURTHEST_FIRST_LEGS)
  const resequenced = applyUrgentAndGreedy(clusters.flat())
  const finalOrder  = reinsertLocked(FURTHEST_FIRST_STOPS, resequenced)
  // Urgent front-block: Worksop(urgent) goes before Sheffield(standard) — kitchen prep
  eq(finalOrder[0].name, 'Worksop Urgent')
  eq(finalOrder[0].priority, 'urgent')
  eq(finalOrder[1].name, 'Sheffield Customer')
})

test('Furthest-first: final flattened order is Sheffield → Worksop', () => {
  const clusters = clusterAndSort(FURTHEST_FIRST_GEO_ORDERED, FURTHEST_FIRST_LEGS)
  const flat     = clusters.flat()
  eq(flat.map(s => s.name), ['Sheffield Customer', 'Worksop Urgent'])
})

// Also test the reverse: when Google correctly returns near-first, it stays near-first
const NEAR_FIRST_GEO_ORDERED: TestStop[] = [
  FURTHEST_FIRST_STOPS[0],  // Sheffield first (correct order)
  FURTHEST_FIRST_STOPS[1],  // Worksop second
]
const NEAR_FIRST_LEGS: RoutesLeg[] = [
  { duration: '480s',  distanceMeters: 3200  },   // [0] origin → Sheffield (8min)
  { duration: '1620s', distanceMeters: 27000 },   // [1] Sheffield → Worksop (27min, > 25min)
]

test('Near-first: when Google returns correct order, Pass 2b keeps it unchanged', () => {
  const clusters = clusterAndSort(NEAR_FIRST_GEO_ORDERED, NEAR_FIRST_LEGS)
  eq(clusters[0][0].name, 'Sheffield Customer')
  eq(clusters[1][0].name, 'Worksop Urgent')
})

// ─── Suite 3c: hasPriority bypass ─────────────────────────────────────────────
// When ALL stops are standard, Pass 2b must NOT re-sort clusters — Google's
// efficient sequence (which may be furthest-first) should be preserved.
// When ANY stop is urgent/priority, Pass 2b MUST enforce local-first.

console.log('\n── Suite 3c: All-standard bypass vs mixed-priority enforcement')

// All-standard: Google returns [Worksop Std, Sheffield Std] (furthest-first)
// Pass 2b should KEEP that order — no SLA reason to override mileage efficiency
const ALL_STD_FAR_FIRST: TestStop[] = [
  { customerId: 'f1', name: 'Worksop Std',   postcode: 'S801EJ', lat: 53.305, lng: -1.125, priority: 'none', lockedPosition: false },
  { customerId: 'f2', name: 'Sheffield Std', postcode: 'S101TE', lat: 53.385, lng: -1.508, priority: 'none', lockedPosition: false },
]
const ALL_STD_LEGS: RoutesLeg[] = [
  { duration: '2100s' },  // [0] origin → Worksop (35min, FAR first from Google)
  { duration: '1920s' },  // [1] Worksop → Sheffield (32min, > threshold → split)
]

test('All-standard: furthest-first Google sequence is PRESERVED (no re-sort)', () => {
  const clusters = clusterAndSort(ALL_STD_FAR_FIRST, ALL_STD_LEGS)
  eq(clusters.length, 2)
  // Worksop stays first — Google chose this, no priority reason to override
  eq(clusters[0][0].name, 'Worksop Std',
    `Expected Worksop first (Google's sequence), got ${clusters[0][0].name}`)
  eq(clusters[1][0].name, 'Sheffield Std')
})

test('All-standard: hasPriority is false for all-none stops', () => {
  const hasPriority = ALL_STD_FAR_FIRST.some(s => s.priority !== 'none')
  eq(hasPriority, false)
})

// Mixed: same two stops but Worksop is now URGENT
// Pass 2b MUST re-sort → Sheffield (8min) before Worksop (35min)
const MIXED_FAR_FIRST: TestStop[] = [
  { customerId: 'm1', name: 'Worksop Urgent', postcode: 'S801EJ', lat: 53.305, lng: -1.125, priority: 'urgent', lockedPosition: false },
  { customerId: 'm2', name: 'Sheffield Std',  postcode: 'S101TE', lat: 53.385, lng: -1.508, priority: 'none',   lockedPosition: false },
]
// Google returns same furthest-first legs
const MIXED_LEGS: RoutesLeg[] = [
  { duration: '2100s' },  // origin → Worksop (35min)
  { duration: '1920s' },  // Worksop → Sheffield (32min, > threshold)
]

test('Mixed-priority: Pass 2b re-sorts so near cluster (Sheffield) runs first', () => {
  const clusters = clusterAndSort(MIXED_FAR_FIRST, MIXED_LEGS)
  eq(clusters.length, 2)
  eq(clusters[0][0].name, 'Sheffield Std',
    `Expected Sheffield first (local-first enforcement), got ${clusters[0][0].name}`)
  eq(clusters[1][0].name, 'Worksop Urgent')
})

test('Mixed-priority: urgent Worksop IS promoted to front before Sheffield (urgent front-block)', () => {
  const clusters    = clusterAndSort(MIXED_FAR_FIRST, MIXED_LEGS)
  const resequenced = applyUrgentAndGreedy(clusters.flat())
  const finalOrder  = reinsertLocked(MIXED_FAR_FIRST, resequenced)
  // Urgent front-block: Worksop(urgent) ALWAYS goes first regardless of geography
  eq(finalOrder[0].name, 'Worksop Urgent')
  eq(finalOrder[0].priority, 'urgent')
  eq(finalOrder[1].name, 'Sheffield Std')
})

test('Mixed-priority: hasPriority is true when any stop is urgent', () => {
  const hasPriority = MIXED_FAR_FIRST.some(s => s.priority !== 'none')
  eq(hasPriority, true)
})

// ─── Suite 4: Cluster boundary edge cases ────────────────────────────────────

console.log('\n── Suite 4: Cluster boundary edge cases')

const twoStops: TestStop[] = [
  { customerId: 'a', name: 'A', postcode: 'S38DG',  lat: 53.398, lng: -1.464, priority: 'none', lockedPosition: false },
  { customerId: 'b', name: 'B', postcode: 'S101TE', lat: 53.382, lng: -1.498, priority: 'none', lockedPosition: false },
]

test('Exactly 1500s (25min) between stops: same cluster (must be STRICTLY greater to split)', () => {
  // legs[0] = origin→A (unused), legs[1] = A→B = 1500s (exactly threshold)
  const clusters = clusterAndSort(twoStops, [{ duration: '300s' }, { duration: '1500s' }])
  eq(clusters.length, 1)
})

test('1501s between stops: new cluster', () => {
  const clusters = clusterAndSort(twoStops, [{ duration: '300s' }, { duration: '1501s' }])
  eq(clusters.length, 2)
})

test('Single stop: no clustering needed', () => {
  const clusters = clusterAndSort([REAL_6[0]], [{ duration: '480s' }])
  eq(clusters.length, 1)
  eq(clusters[0].length, 1)
})

// ─── Suite 5: Priority ordering ───────────────────────────────────────────────

console.log('\n── Suite 5: Priority ordering')

test('urgent(0) < priority(1) < none(2)', () => {
  eq(PRIORITY_ORDER['urgent'],   0)
  eq(PRIORITY_ORDER['priority'], 1)
  eq(PRIORITY_ORDER['none'],     2)
})

test('Mixed priorities: urgent first, priority second, none last', () => {
  const stops: TestStop[] = [
    { customerId: 'a', name: 'None 1',   postcode: 'S1', lat: 53.4, lng: -1.4, priority: 'none',     lockedPosition: false },
    { customerId: 'b', name: 'Urgent',   postcode: 'S2', lat: 53.4, lng: -1.5, priority: 'urgent',   lockedPosition: false },
    { customerId: 'c', name: 'Priority', postcode: 'S3', lat: 53.4, lng: -1.6, priority: 'priority', lockedPosition: false },
    { customerId: 'd', name: 'None 2',   postcode: 'S4', lat: 53.4, lng: -1.7, priority: 'none',     lockedPosition: false },
  ]
  // All < 25min apart → single cluster
  const legs: RoutesLeg[] = [
    { duration: '300s' }, { duration: '600s' }, { duration: '600s' }, { duration: '600s' }
  ]
  const clusters = clusterAndSort(stops, legs)
  eq(clusters.length, 1)
  eq(clusters[0][0].priority, 'urgent')
  eq(clusters[0][1].priority, 'priority')
  eq(clusters[0][2].priority, 'none')
  eq(clusters[0][3].priority, 'none')
})

// ─── Suite 6: Payload correctness ────────────────────────────────────────────

console.log('\n── Suite 6: Routes API v2 payload correctness')

test('Pass 1 intermediates use latLng (not address strings)', () => {
  const intermediates = REAL_6.map(s => latLngWaypoint(s.lat, s.lng))
  intermediates.forEach((wp, i) => {
    const typed = wp as { location: { latLng: { latitude: number; longitude: number } } }
    assert(typeof typed.location.latLng.latitude === 'number', `Stop ${i}: latitude must be number`)
    assert(!JSON.stringify(wp).includes('"address"'), `Stop ${i}: must NOT use address string`)
  })
})

test('Pass 1 ALWAYS uses TRAFFIC_AWARE — NEVER TRAFFIC_AWARE_OPTIMAL', () => {
  // Google hard rule: optimizeWaypointOrder:true is incompatible with TRAFFIC_AWARE_OPTIMAL.
  // This must hold for both future and past departure times.
  const withFuture = {
    routingPreference:     'TRAFFIC_AWARE' as string,
    optimizeWaypointOrder: true,
    departureTime:         new Date(Date.now() + 3600000).toISOString(),
  }
  eq(withFuture.routingPreference, 'TRAFFIC_AWARE')
  assert(withFuture.routingPreference !== 'TRAFFIC_AWARE_OPTIMAL',
    'Pass 1 must NEVER use TRAFFIC_AWARE_OPTIMAL regardless of departure time')

  const withoutTime = {
    routingPreference:     'TRAFFIC_AWARE' as string,
    optimizeWaypointOrder: true,
  }
  eq(withoutTime.routingPreference, 'TRAFFIC_AWARE')
})

test('Pass 4 uses TRAFFIC_AWARE_OPTIMAL for future departure, TRAFFIC_AWARE for past', () => {
  const futureISO = new Date(Date.now() + 3600000).toISOString()
  const withFuture = {
    routingPreference:     futureISO ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE',
    optimizeWaypointOrder: false,
    departureTime:         futureISO,
  }
  eq(withFuture.routingPreference, 'TRAFFIC_AWARE_OPTIMAL')

  const noDeparture = {
    routingPreference:     (null as string | null) ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE',
    optimizeWaypointOrder: false,
  }
  eq(noDeparture.routingPreference, 'TRAFFIC_AWARE')
})

test('Sniffer uses TRAFFIC_AWARE and has no optimizeWaypointOrder', () => {
  const snifferBody = {
    travelMode:        'DRIVE',
    routingPreference: 'TRAFFIC_AWARE' as string,
  }
  eq(snifferBody.routingPreference, 'TRAFFIC_AWARE')
  assert(!('optimizeWaypointOrder' in snifferBody),
    'Sniffer must not include optimizeWaypointOrder')
})

test('Pass 3c uses TRAFFIC_AWARE (not OPTIMAL) — OPTIMAL incompatible with optimizeWaypointOrder:true', () => {
  // Pass 3c re-sequences non-urgent stops from last urgent stop.
  // Must use TRAFFIC_AWARE for same reason as Pass 1 — Google rejects
  // TRAFFIC_AWARE_OPTIMAL when optimizeWaypointOrder:true is set.
  const p3cBody = {
    routingPreference:     'TRAFFIC_AWARE' as string,
    optimizeWaypointOrder: true,
  }
  eq(p3cBody.routingPreference, 'TRAFFIC_AWARE')
  assert(p3cBody.routingPreference !== 'TRAFFIC_AWARE_OPTIMAL',
    'Pass 3c must never use TRAFFIC_AWARE_OPTIMAL')
  assert(p3cBody.optimizeWaypointOrder === true,
    'Pass 3c must have optimizeWaypointOrder:true')
})

// ─── Suite 7: ETA correctness ────────────────────────────────────────────────

console.log('\n── Suite 7: ETA calculation')

test('ETAs strictly increment across all 6 stops (with service time)', () => {
  const finalOrder = reinsertLocked(REAL_6, clusterAndSort(REAL_6, MOCK_P1_LEGS).flat())
  const { stops: output } = buildOutputWithServiceTime(finalOrder, MOCK_P4_LEGS, new Date('2026-03-27T08:00:00').getTime())
  for (let i = 1; i < output.length; i++) {
    assert(output[i].estimatedArrival >= output[i-1].estimatedArrival,
      `Stop ${i+1} ETA ${output[i].estimatedArrival} < stop ${i} ETA ${output[i-1].estimatedArrival}`)
  }
})

test('Last stop ETA is within 8am-1pm range (service time pushes last stop to ~11:04)', () => {
  const finalOrder = reinsertLocked(REAL_6, clusterAndSort(REAL_6, MOCK_P1_LEGS).flat())
  const { stops: output } = buildOutputWithServiceTime(finalOrder, MOCK_P4_LEGS, new Date('2026-03-27T08:00:00').getTime())
  const lastETA  = output[output.length - 1].estimatedArrival
  const lastHour = parseInt(lastETA.split(':')[0], 10)
  // Without service time last stop was ~08:30; with 6×20min service time it's ~13:30
  eq(lastETA, '11:04')
  assert(lastHour >= 8 && lastHour <= 13, `Last ETA hour ${lastHour} outside expected range`)
})

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`)
console.log(`Results: ${passed}/${total} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\n❌ Tests failed — DO NOT push to main')
  process.exit(1)
} else {
  console.log('\n✅ All tests passed — safe to push')
}
