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
    sublabel: r.box_size ? `${r.box_size}${r.category ? ` · ${r.category}` : ''}` : (r.category ?? undefined),
  }))
}

export interface ProductDetail {
  id:       string
  name:     string
  category: string | null
  box_size: string | null
  code:     string | null
}

export function useProductsWithDetail(): ProductDetail[] {
  const rows = useLiveQuery(
    () => localDb.products.orderBy('name').toArray(),
    [],
    []
  )
  return rows.map((r) => ({
    id:       r.id,
    name:     r.name,
    category: r.category,
    box_size: r.box_size,
    code:     r.code,
  }))
}
