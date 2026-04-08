'use client'

/**
 * components/MapTabContent.tsx
 *
 * Admin-only map tab shown inside the Routes page.
 * Fetches all geocoded customers and visits from /api/map/data
 * and renders them on a Leaflet map via MapView.
 *
 * Extracted from app/routes/page.tsx to keep that file manageable.
 */

import React           from 'react'
import dynamic         from 'next/dynamic'
import DetailModal     from '@/components/DetailModal'
import type { MapCustomer, MapVisit } from '@/app/api/map/data/route'

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#EDEAE1]">
      <div className="w-8 h-8 border-[3px] border-[#16205B]/20 border-t-[#16205B] rounded-full animate-spin" />
    </div>
  ),
})

export default function MapTabContent() {
  const [customers, setCustomers] = React.useState<MapCustomer[]>([])
  const [visits,    setVisits]    = React.useState<MapVisit[]>([])
  const [loading,   setLoading]   = React.useState(true)
  const [modalId,   setModalId]   = React.useState<string | null>(null)
  const [mapError,  setMapError]  = React.useState('')

  React.useEffect(() => {
    fetch('/api/map/data?layer=all')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then(d => { setCustomers(d.customers ?? []); setVisits(d.visits ?? []) })
      .catch(e => setMapError(`Failed to load map data (${e.message})`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-[3px] border-[#16205B]/20 border-t-[#16205B] rounded-full animate-spin"/>
    </div>
  )
  if (mapError) return (
    <div className="flex-1 flex items-center justify-center text-red-500 text-sm">{mapError}</div>
  )

  return (
    <div className="flex-1 min-h-0 relative">
      <MapView
        customers={customers}
        visits={visits}
        layer="all"
        onVisitClick={(id) => setModalId(id)}
      />
      {modalId && (
        <DetailModal
          id={modalId}
          type="visit"
          onClose={() => setModalId(null)}
        />
      )}
    </div>
  )
}
