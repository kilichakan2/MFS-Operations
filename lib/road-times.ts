/**
 * lib/road-times.ts
 *
 * Road-time cache lookup for the exactTSP function.
 *
 * Returns road travel time in seconds from the pre-computed
 * customer_road_times table, with haversine fallback if a pair
 * is not yet cached.
 *
 * Hub sentinel UUIDs (no FK to customers — stored in hub_sentinels):
 *   MFS Sheffield S3 8DG  → MFS_HUB_ID
 *   Ozmen John Street S2 4QT → OZMEN_HUB_ID
 */

import { createClient } from '@supabase/supabase-js'

export const MFS_HUB_ID   = '00000000-0000-0000-0000-000000000001'
export const OZMEN_HUB_ID = '00000000-0000-0000-0000-000000000002'

// ─── Type ─────────────────────────────────────────────────────────────────────

export interface RoadTimeMatrix {
  /** duration_s between any (fromId, toId) pair. Null = not cached. */
  get(fromId: string, toId: string): number | null
}

// ─── Batch load ───────────────────────────────────────────────────────────────
//
// Load all relevant pairs for a set of stop IDs + hub in one Supabase query.
// Called once per optimise request, before exactTSP runs.
//
export async function loadRoadTimes(
  stopIds: string[],
  hubId:   string,
): Promise<RoadTimeMatrix> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const allIds = [...new Set([...stopIds, hubId])]

  const { data, error } = await supabase
    .from('customer_road_times')
    .select('from_id, to_id, duration_s')
    .in('from_id', allIds)
    .in('to_id',   allIds)

  if (error) {
    console.warn('[road-times] Failed to load cache — will use haversine fallback:', error.message)
    return { get: () => null }
  }

  const map = new Map<string, number>()
  for (const row of (data ?? [])) {
    map.set(`${row.from_id}:${row.to_id}`, row.duration_s)
  }

  const hitCount  = data?.length ?? 0
  const pairCount = allIds.length * allIds.length
  console.log(`[road-times] Loaded ${hitCount}/${pairCount} cached pairs`)

  return { get: (from, to) => map.get(`${from}:${to}`) ?? null }
}
