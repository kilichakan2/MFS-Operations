'use client'

/**
 * RecentActivity
 *
 * Shows the last 5 submissions logged today by the current user on this screen.
 * Reads entirely from the local Dexie queue — no network call, works offline.
 * Updates reactively via useLiveQuery whenever a new record is queued.
 *
 * Name resolution: joins with localDb.customers and localDb.products so we
 * show "Al Turka" instead of a UUID.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { localDb }      from '@/lib/localDb'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString('en-GB', {
      hour:     '2-digit',
      minute:   '2-digit',
      timeZone: 'Europe/London',
    })
  } catch { return '' }
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Main component ────────────────────────────────────────────────────────────

interface RecentActivityProps {
  screen: 'screen1' | 'screen2' | 'screen3'
}

export default function RecentActivity({ screen }: RecentActivityProps) {
  const today = todayMidnight()

  // Live query: today's records for this screen, newest first, max 5
  const items = useLiveQuery(
    async () => {
      const records = await localDb.queue
        .where('screen').equals(screen)
        .and(r => r.createdAt >= today)
        .reverse()
        .limit(5)
        .toArray()

      if (records.length === 0) return []

      // Pre-load all relevant customers + products for name resolution
      const customerIds = [...new Set(
        records.map(r => r.payload.customer_id as string).filter(Boolean)
      )]
      const productIds = [...new Set(
        records.map(r => r.payload.product_id  as string).filter(Boolean)
      )]

      const [customers, products] = await Promise.all([
        customerIds.length > 0
          ? localDb.customers.where('id').anyOf(customerIds).toArray()
          : Promise.resolve([]),
        productIds.length > 0
          ? localDb.products.where('id').anyOf(productIds).toArray()
          : Promise.resolve([]),
      ])

      const custMap = Object.fromEntries(customers.map(c => [c.id, c.name]))
      const prodMap = Object.fromEntries(products.map(p => [p.id, p.name]))

      return records.map(r => ({ ...r, custMap, prodMap }))
    },
    [screen, today],
    []
  )

  if (!items || items.length === 0) return null

  return (
    <section className="max-w-lg mx-auto px-4 pt-2 pb-4">
      {/* Divider */}
      <div className="h-px bg-gray-100 mb-4" />

      <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-2.5">
        My activity today
      </p>

      <div className="space-y-2">
        {items.map((item) => {
          const { localId, payload, createdAt, synced, custMap, prodMap } = item as typeof item & {
            custMap: Record<string, string>
            prodMap: Record<string, string>
          }
          const time = fmtTime(createdAt)

          // ── Screen 1: Discrepancy ───────────────────────────────────────────
          if (screen === 'screen1') {
            const customer = custMap[payload.customer_id as string] ?? 'Unknown'
            const product  = prodMap[payload.product_id  as string] ?? 'Unknown'
            const status   = payload.status as string
            const oQty     = payload.ordered_qty as number | null
            const sQty     = payload.sent_qty    as number | null
            const reason   = titleCase(String(payload.reason ?? ''))

            return (
              <div key={localId} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{customer}</p>
                  <p className="text-xs text-gray-400 truncate">{product} · {reason}</p>
                  {status === 'short' && oQty != null && sQty != null && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">
                      Ordered {oQty} · Sent {sQty}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    status === 'not_sent'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {status === 'not_sent' ? 'NOT SENT' : 'SHORT'}
                  </span>
                  <SyncDot synced={synced} time={time} />
                </div>
              </div>
            )
          }

          // ── Screen 2: Complaint ─────────────────────────────────────────────
          if (screen === 'screen2') {
            const customer = custMap[payload.customer_id as string] ?? 'Unknown'
            const category = titleCase(String(payload.category ?? ''))
            const status   = payload.status as string

            return (
              <div key={localId} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{customer}</p>
                  <p className="text-xs text-gray-400 truncate">{category}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    status === 'open'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {status === 'open' ? 'OPEN' : 'RESOLVED'}
                  </span>
                  <SyncDot synced={synced} time={time} />
                </div>
              </div>
            )
          }

          // ── Screen 3: Visit ─────────────────────────────────────────────────
          if (screen === 'screen3') {
            const customerName = payload.customer_id
              ? (custMap[payload.customer_id as string] ?? 'Unknown')
              : String(payload.prospect_name ?? 'Prospect')
            const visitType = titleCase(String(payload.visit_type ?? ''))
            const outcome   = payload.outcome as string

            const outcomeStyle =
              outcome === 'positive' ? 'bg-green-100 text-green-700'
              : outcome === 'at_risk' ? 'bg-amber-100 text-amber-700'
              : outcome === 'lost'    ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-600'

            return (
              <div key={localId} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{customerName}</p>
                  <p className="text-xs text-gray-400 truncate">{visitType}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${outcomeStyle}`}>
                    {titleCase(outcome)}
                  </span>
                  <SyncDot synced={synced} time={time} />
                </div>
              </div>
            )
          }

          return null
        })}
      </div>
    </section>
  )
}

// ── Sync dot — shows time and sync state ──────────────────────────────────────
function SyncDot({ synced, time }: { synced: boolean; time: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${synced ? 'bg-green-400' : 'bg-amber-400'}`} />
      <span className="text-[10px] text-gray-300">{time}</span>
    </span>
  )
}
