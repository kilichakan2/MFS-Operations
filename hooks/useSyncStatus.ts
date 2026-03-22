'use client'

/**
 * useSyncStatus
 *
 * Observes the local Dexie queue reactively using dexie-react-hooks.
 * Returns counts of pending and stuck (retries ≥ 3) records.
 *
 * Used by the SyncStatus component in AppHeader to give field workers
 * visibility into whether their submissions have reached the server.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { localDb }      from '@/lib/localDb'

const MAX_RETRIES = 3

export interface SyncStatusCounts {
  pending: number   // unsynced, still being retried (retries < MAX_RETRIES)
  stuck:   number   // unsynced, retries exhausted — waiting for reset on next triggerSync
  total:   number   // all unsynced
}

export function useSyncStatus(): SyncStatusCounts {
  const unsyncedRecords = useLiveQuery(
    () => localDb.queue.filter(r => !r.synced).toArray(),
    [],
    []
  )

  const pending = unsyncedRecords.filter(r => (r.retries ?? 0) < MAX_RETRIES).length
  const stuck   = unsyncedRecords.filter(r => (r.retries ?? 0) >= MAX_RETRIES).length

  return { pending, stuck, total: unsyncedRecords.length }
}
