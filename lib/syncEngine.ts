/**
 * lib/syncEngine.ts
 *
 * Reads all unsynced records from the local Dexie queue and POSTs them
 * to their corresponding API sync endpoint. On 201 success, marks the
 * record as synced so it is not retried. On failure, increments the
 * retry counter and stores the error message.
 *
 * Design decisions:
 * - Sequential, not parallel — avoids race conditions and rate limits
 * - Fire-and-forget from the caller's perspective — triggerSync() returns
 *   immediately; the caller does not need to await it
 * - Max 3 retries — records that fail 3+ times are left in the queue
 *   with their error logged; they won't be retried until the app restarts
 * - The session cookie is sent automatically by fetch() since this runs
 *   in the browser; middleware attaches x-mfs-user-id to the request
 */

import { localDb } from '@/lib/localDb'

const ENDPOINT: Record<string, string> = {
  screen1: '/api/screen1/sync',
  screen2: '/api/screen2/sync',
  screen3:         '/api/screen3/sync',
  screen2_resolve: '/api/screen2/resolve',
}

const MAX_RETRIES = 3

let syncInProgress = false

/**
 * triggerSync()
 *
 * Called after every successful form submission on Screens 1, 2, and 3.
 * Reads all unsynced, non-exhausted records from the queue and attempts
 * to push them to Supabase.
 *
 * Guards against overlapping calls — if a sync is already running,
 * this call is a no-op.
 */
export async function triggerSync(): Promise<void> {
  if (syncInProgress) return
  if (typeof window === 'undefined') return
  if (!navigator.onLine) return

  syncInProgress = true

  try {
    // Fetch all records that haven't been synced and haven't exceeded retry limit
    const pending = (await localDb.queue.toArray())
      .filter(r => !r.synced && (r.retries ?? 0) < MAX_RETRIES)

    if (pending.length === 0) return

    console.log(`[syncEngine] ${pending.length} record(s) to sync`)

    for (const record of pending) {
      const endpoint = ENDPOINT[record.screen]
      if (!endpoint) {
        console.warn(`[syncEngine] Unknown screen: ${record.screen}`)
        continue
      }

      try {
        const res = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(record.payload),
        })

        if (res.status === 201) {
          // Success — mark as synced
          await localDb.queue.update(record.localId, { synced: true })
          console.log(`[syncEngine] ✓ Synced ${record.localId} (${record.screen})`)
        } else {
          // Server rejected — increment retries and store reason
          let errorMsg = `HTTP ${res.status}`
          try {
            const body = await res.json()
            errorMsg = body.error ?? errorMsg
          } catch { /* ignore parse failure */ }

          await localDb.queue.update(record.localId, {
            retries:   (record.retries ?? 0) + 1,
            syncError: errorMsg,
          })
          console.warn(`[syncEngine] ✗ Failed ${record.localId}: ${errorMsg}`)
        }
      } catch (networkErr) {
        // Network error — increment retries
        const msg = networkErr instanceof Error ? networkErr.message : String(networkErr)
        await localDb.queue.update(record.localId, {
          retries:   (record.retries ?? 0) + 1,
          syncError: `Network error: ${msg}`,
        })
        console.warn(`[syncEngine] ✗ Network error for ${record.localId}:`, msg)
      }
    }
  } catch (err) {
    console.error('[syncEngine] Unexpected error:', err)
  } finally {
    syncInProgress = false
  }
}
