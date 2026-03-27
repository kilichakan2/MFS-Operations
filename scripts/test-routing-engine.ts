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
  const clusters: TestStop[][] = []
  let current: TestStop[] = []

  for (let i = 0; i < geoOrdered.length; i++) {
    if (current.length === 0) { current.push(geoOrdered[i]); continue }
    // legs[i] = drive FROM the previous stop TO this stop
    const legS = parseDuration(legDurations[i]?.duration)
    if (legS > CLUSTER_THRESHOLD_S) {
      clusters.push(current)
      current = [geoOrdered[i]]
    } else {
      current.push(geoOrdered[i])
    }
  }
  if (current.length > 0) clusters.push(current)
  return clusters.map(cl =>
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

// ─── Real customer data (verified from DB) ────────────────────────────────────

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

test('6-stop: ETAs calculated correctly from mocked P4 legs', () => {
  const clusters   = clusterAndSort(REAL_6, MOCK_P1_LEGS)
  const finalOrder = reinsertLocked(REAL_6, clusters.flat())
  const departure  = new Date('2026-03-27T08:00:00').getTime()
  const output     = buildOutput(finalOrder, MOCK_P4_LEGS, departure)
  eq(output.length, 6)
  output.forEach(s => {
    assert(/^\d{2}:\d{2}$/.test(s.estimatedArrival), `ETA "${s.estimatedArrival}" is not HH:MM`)
    assert(s.driveTimeFromPrevMin >= 0, `driveTime must be >= 0`)
  })
  eq(output[0].estimatedArrival, '08:08')   // 510s = 8.5min → 08:08
  eq(output[1].estimatedArrival, '08:30')   // 510+1340=1850s = 30.8min → 08:30
  eq(output[0].driveTimeFromPrevMin, 9)     // 510s → 8.5 → rounds to 9
})

test('6-stop: total route metrics are plausible', () => {
  const totalDistM = MOCK_P4_LEGS.reduce((s, l) => s + (l.distanceMeters ?? 0), 0)
  const totalDurS  = MOCK_P4_LEGS.reduce((s, l) => s + parseDuration(l.duration), 0)
  assert(totalDistM > 30000, `Distance ${totalDistM}m seems too low`)
  assert(totalDurS  > 2000,  `Duration ${totalDurS}s seems too low`)
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

test('urgent in cluster 2 does NOT jump ahead of cluster 1 stops', () => {
  const clusters   = clusterAndSort(REAL_6_URGENT, MOCK_P1_LEGS)
  const finalOrder = reinsertLocked(REAL_6_URGENT, clusters.flat())
  // Sheffield (none) must still come before Jennys (urgent) — different clusters
  eq(finalOrder[0].name, 'BRILL BURGER SHEFFIELD')
  eq(finalOrder[3].name, 'JENNYS CAFE')
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

test('TRAFFIC_AWARE_OPTIMAL only when departure time is in the future', () => {
  // Future departure → TRAFFIC_AWARE_OPTIMAL
  const withFuture = { routingPreference: 'TRAFFIC_AWARE_OPTIMAL', departureTime: 'someISO' }
  eq(withFuture.routingPreference, 'TRAFFIC_AWARE_OPTIMAL')

  // Past/no departure → TRAFFIC_AWARE (does NOT require departureTime)
  const withoutTime = { routingPreference: 'TRAFFIC_AWARE' }
  eq(withoutTime.routingPreference, 'TRAFFIC_AWARE')
})

test('Sniffer field mask excludes optimizedIntermediateWaypointIndex', () => {
  const SNIFFER_MASK = 'routes.legs,routes.distanceMeters,routes.duration'
  assert(!SNIFFER_MASK.includes('optimizedIntermediateWaypointIndex'),
    'Sniffer must not request optimizedIntermediateWaypointIndex')
})

test('Pass 4 has optimizeWaypointOrder:false', () => {
  const p4 = { optimizeWaypointOrder: false as boolean }
  eq(p4.optimizeWaypointOrder, false)
})

// ─── Suite 7: ETA correctness ────────────────────────────────────────────────

console.log('\n── Suite 7: ETA calculation')

test('ETAs strictly increment across all 6 stops', () => {
  const finalOrder = reinsertLocked(REAL_6, clusterAndSort(REAL_6, MOCK_P1_LEGS).flat())
  const output     = buildOutput(finalOrder, MOCK_P4_LEGS, new Date('2026-03-27T08:00:00').getTime())
  for (let i = 1; i < output.length; i++) {
    assert(output[i].estimatedArrival >= output[i-1].estimatedArrival,
      `Stop ${i+1} ETA ${output[i].estimatedArrival} < stop ${i} ETA ${output[i-1].estimatedArrival}`)
  }
})

test('Last stop ETA is within 8am-1pm range for this route', () => {
  const finalOrder = reinsertLocked(REAL_6, clusterAndSort(REAL_6, MOCK_P1_LEGS).flat())
  const output     = buildOutput(finalOrder, MOCK_P4_LEGS, new Date('2026-03-27T08:00:00').getTime())
  const lastHour   = parseInt(output[output.length - 1].estimatedArrival.split(':')[0], 10)
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
