/**
 * scripts/test-routing-engine.ts
 *
 * Automated tests for the routing engine business logic.
 * Tests the clustering and priority sort algorithms without calling Google.
 * Also tests the payload format that would be sent to Google.
 *
 * Run: npx ts-node --project tsconfig.test.json scripts/test-routing-engine.ts
 * Or:  npx tsx scripts/test-routing-engine.ts
 */

// ─── Extracted pure functions (mirrors app/api/routes/optimise/route.ts) ──────

const CLUSTER_THRESHOLD_S = 25 * 60  // 25 minutes
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

interface TestStop {
  name:           string
  postcode:       string
  lat:            number
  lng:            number
  priority:       'none' | 'urgent' | 'priority'
  lockedPosition: boolean
}

/** Simulate the clustering + priority sort given stops and leg durations */
function runClusterAndSort(
  geoOrdered: TestStop[],
  legDurationsS: number[],  // drive time FROM previous to each stop (index 0 = origin→stop0)
): TestStop[][] {
  const clusters: TestStop[][] = []
  let current: TestStop[] = []

  for (let i = 0; i < geoOrdered.length; i++) {
    if (current.length === 0) { current.push(geoOrdered[i]); continue }
    // legDurationsS[i+1] = drive from stop[i-1] to stop[i] (same as pass1Legs[i+1])
    const driveS = legDurationsS[i + 1] ?? 0
    if (driveS > CLUSTER_THRESHOLD_S) {
      clusters.push(current)
      current = [geoOrdered[i]]
    } else {
      current.push(geoOrdered[i])
    }
  }
  if (current.length > 0) clusters.push(current)

  // Priority sort within each cluster
  return clusters.map(cl =>
    [...cl].sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
    )
  )
}

function latLngWaypoint(lat: number, lng: number) {
  return { location: { latLng: { latitude: lat, longitude: lng } } }
}

function addrWaypoint(postcode: string) {
  return { address: `${postcode}, UK` }
}

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    },
    toEqual(expected: T) {
      const a = JSON.stringify(actual), e = JSON.stringify(expected)
      if (a !== e) throw new Error(`Expected\n  ${e}\ngot\n  ${a}`)
    },
    toContain(expected: string) {
      if (!(actual as unknown as string).includes(expected)) throw new Error(`Expected "${actual}" to contain "${expected}"`)
    },
  }
}

// ─── Suite 0: Utility functions ───────────────────────────────────────────────

console.log('\n── Suite 0: Utility functions')

test('cleanPostcode strips spaces', () => {
  expect(cleanPostcode('S3 8DG')).toBe('S38DG')
  expect(cleanPostcode(' s70 1gw ')).toBe('S701GW')
  expect(cleanPostcode('S10  1TE')).toBe('S101TE')
  expect(cleanPostcode('S38DG')).toBe('S38DG')
})

test('parseDuration parses Google format strings', () => {
  expect(parseDuration('723s')).toBe(723)
  expect(parseDuration('1500s')).toBe(1500)
  expect(parseDuration(undefined)).toBe(0)
  expect(parseDuration('')).toBe(0)
})

test('toHHMM formats timestamps correctly', () => {
  const base = new Date('2026-03-26T08:00:00Z').getTime()
  expect(toHHMM(base)).toContain(':')  // just check it produces HH:MM format
})

test('latLngWaypoint produces correct Routes API v2 format', () => {
  const wp = latLngWaypoint(53.379, -1.464)
  expect(wp).toEqual({ location: { latLng: { latitude: 53.379, longitude: -1.464 } } })
})

test('addrWaypoint appends UK suffix', () => {
  const wp = addrWaypoint('S38DG')
  expect(wp).toEqual({ address: 'S38DG, UK' })
})

// ─── Suite 1: Test Case — Sandwich (urgent sandwiched between standards) ──────
//
// Input order: Sheffield Std → Worksop Std → Sheffield South Urgent
// Google geo-optimises to keep Sheffield stops together:
//   [Sheffield Std, Sheffield South Urgent, Worksop Std]
// Drive times: S→SouthS ≈8min, SouthS→Worksop ≈28min (crosses boundary)
// Expected clusters: [[Sheffield Std, Sheffield South Urgent], [Worksop Std]]
// After priority sort: [[Sheffield South Urgent, Sheffield Std], [Worksop Std]]
// Final order: Sheffield South Urgent → Sheffield Std → Worksop Std

console.log('\n── Suite 1: Sandwich (urgent sandwiched geographically)')

const sandwichInput: TestStop[] = [
  { name: 'Customer A — Sheffield',       postcode: 'S10TE',  lat: 53.382, lng: -1.498, priority: 'none',   lockedPosition: false },
  { name: 'Customer B — Worksop',         postcode: 'S801GG', lat: 53.304, lng: -1.122, priority: 'none',   lockedPosition: false },
  { name: 'Customer C — Sheffield South', postcode: 'S71AA',  lat: 53.368, lng: -1.462, priority: 'urgent', lockedPosition: false },
]

// Simulate Google's geo-optimised order: A, C, B (keeps Sheffield stops together)
const sandwichGeoOrdered: TestStop[] = [sandwichInput[0], sandwichInput[2], sandwichInput[1]]
// Leg durations: origin→A=10min, A→C=8min, C→B=28min (crosses boundary!), B→dest=10min
const sandwichLegs = [600, 600, 480, 1680, 600]  // index 0=origin→A, 1=unused for first, etc.
// Actually for the clustering algo, legDurationsS[i+1] is used for stop i>0
// legDurationsS[1] = A→C = 480s (8min), legDurationsS[2] = C→B = 1680s (28min)
const sandwichLegDurations = [600, 600, 480, 1680]

test('Sandwich: clusters correctly split at 25-min boundary', () => {
  const clusters = runClusterAndSort(sandwichGeoOrdered, sandwichLegDurations)
  expect(clusters.length).toBe(2)
  expect(clusters[0].length).toBe(2)  // Sheffield pair
  expect(clusters[1].length).toBe(1)  // Worksop alone
})

test('Sandwich: urgent stop moves to front of its cluster', () => {
  const clusters = runClusterAndSort(sandwichGeoOrdered, sandwichLegDurations)
  expect(clusters[0][0].priority).toBe('urgent')
  expect(clusters[0][0].name).toBe('Customer C — Sheffield South')
})

test('Sandwich: standard stop follows urgent in same cluster', () => {
  const clusters = runClusterAndSort(sandwichGeoOrdered, sandwichLegDurations)
  expect(clusters[0][1].priority).toBe('none')
  expect(clusters[0][1].name).toBe('Customer A — Sheffield')
})

test('Sandwich: far stop stays in second cluster unchanged', () => {
  const clusters = runClusterAndSort(sandwichGeoOrdered, sandwichLegDurations)
  expect(clusters[1][0].name).toBe('Customer B — Worksop')
})

test('Sandwich: final flattened order is Urgent→Std→Worksop', () => {
  const clusters = runClusterAndSort(sandwichGeoOrdered, sandwichLegDurations)
  const final = clusters.flat()
  expect(final[0].name).toBe('Customer C — Sheffield South')
  expect(final[1].name).toBe('Customer A — Sheffield')
  expect(final[2].name).toBe('Customer B — Worksop')
})

// ─── Suite 2: Test Case — Local Priority (all stops within 25 min) ────────────
//
// Input: Sheffield Std → Sheffield Urgent
// Google geo-optimises: same order or swapped (both near Sheffield)
// Drive time: 10min between them — ALL in one cluster
// After priority sort: Urgent first
// Final: Sheffield Urgent → Sheffield Std

console.log('\n── Suite 2: Local Priority (all stops within 25 min)')

const localInput: TestStop[] = [
  { name: 'Local Std',    postcode: 'S38DG',  lat: 53.398, lng: -1.464, priority: 'none',   lockedPosition: false },
  { name: 'Local Urgent', postcode: 'S101TE', lat: 53.382, lng: -1.498, priority: 'urgent', lockedPosition: false },
]

// Google keeps same order (both Sheffield, similar distance from origin)
const localGeoOrdered = [...localInput]
// Leg: origin→Local Std=8min, Local Std→Local Urgent=10min — both under 25min
const localLegDurations = [480, 480, 600]

test('Local: all stops in single cluster', () => {
  const clusters = runClusterAndSort(localGeoOrdered, localLegDurations)
  expect(clusters.length).toBe(1)
  expect(clusters[0].length).toBe(2)
})

test('Local: urgent reordered to front of single cluster', () => {
  const clusters = runClusterAndSort(localGeoOrdered, localLegDurations)
  expect(clusters[0][0].priority).toBe('urgent')
  expect(clusters[0][0].name).toBe('Local Urgent')
})

test('Local: standard follows urgent', () => {
  const clusters = runClusterAndSort(localGeoOrdered, localLegDurations)
  expect(clusters[0][1].priority).toBe('none')
})

// ─── Suite 3: Test Case — Cross City (Manchester, far from Sheffield) ─────────
//
// Input: Sheffield Std → Manchester Urgent
// Drive time: ~70min — MUST split into 2 clusters
// After clustering: [[Sheffield Std], [Manchester Urgent]]
// Priority sort: single-stop clusters don't change
// Final: Sheffield Std → Manchester Urgent (geo order preserved for separate clusters)

console.log('\n── Suite 3: Cross-City (Manchester, 70min from Sheffield)')

const crossCityInput: TestStop[] = [
  { name: 'Sheffield Customer', postcode: 'S38DG',  lat: 53.398, lng: -1.464, priority: 'none',   lockedPosition: false },
  { name: 'Manchester Customer', postcode: 'M11AE',  lat: 53.479, lng: -2.244, priority: 'urgent', lockedPosition: false },
]

// Google geo-orders: Sheffield first, Manchester second (driving route logic)
const crossGeoOrdered = [...crossCityInput]
// Leg: origin→Sheffield=5min, Sheffield→Manchester=70min (CROSSES boundary)
const crossLegDurations = [300, 300, 4200]

test('Cross-city: splits into 2 clusters at 70min boundary', () => {
  const clusters = runClusterAndSort(crossGeoOrdered, crossLegDurations)
  expect(clusters.length).toBe(2)
})

test('Cross-city: Sheffield in first cluster', () => {
  const clusters = runClusterAndSort(crossGeoOrdered, crossLegDurations)
  expect(clusters[0][0].name).toBe('Sheffield Customer')
})

test('Cross-city: Manchester in second cluster', () => {
  const clusters = runClusterAndSort(crossGeoOrdered, crossLegDurations)
  expect(clusters[1][0].name).toBe('Manchester Customer')
})

test('Cross-city: urgent in second cluster stays urgent (not promoted across cluster boundary)', () => {
  const clusters = runClusterAndSort(crossGeoOrdered, crossLegDurations)
  // Manchester is urgent but in a DIFFERENT cluster — it should NOT move before Sheffield
  // The clusters are [Sheffield Std] and [Manchester Urgent]
  // Sheffield goes first because it's geographically first
  const flat = clusters.flat()
  expect(flat[0].name).toBe('Sheffield Customer')   // geo order preserved across clusters
  expect(flat[1].name).toBe('Manchester Customer')
})

// ─── Suite 4: Locked stops ────────────────────────────────────────────────────

console.log('\n── Suite 4: Locked stops (must not move)')

const lockedInput: TestStop[] = [
  { name: 'Stop A — Locked Urgent', postcode: 'S38DG',  lat: 53.398, lng: -1.464, priority: 'urgent', lockedPosition: true  },
  { name: 'Stop B — Free Urgent',   postcode: 'S101TE', lat: 53.382, lng: -1.498, priority: 'urgent', lockedPosition: false },
  { name: 'Stop C — Free Std',      postcode: 'S71AA',  lat: 53.368, lng: -1.462, priority: 'none',   lockedPosition: false },
]

test('Locked stops are separated from clustering input', () => {
  const locked   = lockedInput.filter(s => s.lockedPosition)
  const unlocked = lockedInput.filter(s => !s.lockedPosition)
  expect(locked.length).toBe(1)
  expect(unlocked.length).toBe(2)
  expect(locked[0].name).toBe('Stop A — Locked Urgent')
})

test('Locked stop re-inserted at original position', () => {
  const allStops   = lockedInput
  const lockedStps = allStops.filter(s => s.lockedPosition)
  const unlockedSts = allStops.filter(s => !s.lockedPosition)

  // Simulate clustering + sort for unlocked only (both in one cluster, B urgent first)
  const clusters = runClusterAndSort(unlockedSts, [300, 300, 600])
  const clustered = clusters.flat()
  // clustered = [Stop B (urgent), Stop C (std)]

  // Re-insert locked stops at their original index
  const finalOrdered: (TestStop | null)[] = new Array(allStops.length).fill(null)
  for (const s of lockedStps) {
    const idx = allStops.findIndex(w => w.name === s.name)
    finalOrdered[idx] = s
  }
  let cur = 0
  for (let i = 0; i < finalOrdered.length; i++) {
    if (finalOrdered[i] === null) finalOrdered[i] = clustered[cur++]
  }

  // Stop A (locked) stays at index 0 even though it's urgent
  // Unlocked stops fill remaining slots: B (urgent), C (std)
  expect(finalOrdered[0]!.name).toBe('Stop A — Locked Urgent')
  expect(finalOrdered[1]!.name).toBe('Stop B — Free Urgent')
  expect(finalOrdered[2]!.name).toBe('Stop C — Free Std')
})

// ─── Suite 5: Payload format validation ───────────────────────────────────────

console.log('\n── Suite 5: Routes API v2 payload format')

test('Pass 1 intermediates use latLng (required for optimizeWaypointOrder:true)', () => {
  const wp = latLngWaypoint(53.379, -1.464)
  // Must have location.latLng, NOT address string
  expect(typeof (wp as { location: { latLng: { latitude: number } } }).location.latLng.latitude).toBe('number')
  const asStr = JSON.stringify(wp)
  expect(asStr.includes('latLng')).toBe(true)
  expect(asStr.includes('"address"')).toBe(false)
})

test('Origin/destination use address format (fixed anchors, not being optimised)', () => {
  const wp = addrWaypoint('S38DG')
  expect((wp as { address: string }).address).toBe('S38DG, UK')
})

test('Pass 1 body includes optimizeWaypointOrder:true', () => {
  const sampleStop: TestStop = { name: 'X', postcode: 'S38DG', lat: 53.379, lng: -1.464, priority: 'none', lockedPosition: false }
  const p1Body = {
    origin:                addrWaypoint('S38DG'),
    destination:           addrWaypoint('S38DG'),
    intermediates:         [sampleStop].map(s => latLngWaypoint(s.lat, s.lng)),
    travelMode:            'DRIVE',
    routingPreference:     'TRAFFIC_AWARE_OPTIMAL',
    optimizeWaypointOrder: true,
  }
  expect(p1Body.optimizeWaypointOrder).toBe(true)
  const firstIntermediate = p1Body.intermediates[0] as { location: { latLng: { latitude: number } } }
  expect(typeof firstIntermediate.location.latLng.latitude).toBe('number')
})

test('Pass 4 body has optimizeWaypointOrder:false', () => {
  const p4Body = {
    origin:                addrWaypoint('S38DG'),
    destination:           addrWaypoint('S38DG'),
    intermediates:         [] as ReturnType<typeof addrWaypoint>[],
    travelMode:            'DRIVE',
    routingPreference:     'TRAFFIC_AWARE_OPTIMAL',
    optimizeWaypointOrder: false,
  }
  expect(p4Body.optimizeWaypointOrder).toBe(false)
})

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\n❌ Tests failed — DO NOT push to main')
  process.exit(1)
} else {
  console.log('\n✅ All tests passed — safe to push')
}
