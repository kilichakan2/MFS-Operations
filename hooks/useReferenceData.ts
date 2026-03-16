/**
 * hooks/useReferenceData.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads customers and products from the local Dexie database.
 * Uses Dexie's useLiveQuery so the component re-renders automatically
 * if a background sync updates the tables while the screen is open.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useLiveQuery }       from 'dexie-react-hooks'
import { localDb }            from '@/lib/localDb'
import type { SelectableItem } from '@/components/BottomSheetSelector'

export function useCustomers(): SelectableItem[] {
  const rows = useLiveQuery(
    () => localDb.customers.orderBy('name').toArray(),
    [],
    []
  )
  return rows.map((r) => ({ id: r.id, label: r.name }))
}

export function useProducts(): SelectableItem[] {
  const rows = useLiveQuery(
    () => localDb.products.orderBy('name').toArray(),
    [],
    []
  )
  return rows.map((r) => ({
    id:       r.id,
    label:    r.name,
    sublabel: r.category ?? undefined,
  }))
}
