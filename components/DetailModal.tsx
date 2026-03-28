'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModalType = 'visit' | 'complaint' | 'discrepancy'

interface VisitDetail {
  id: string; createdAt: string; visitType: string; outcome: string
  pipelineStatus: string
  commitmentMade: boolean; commitmentDetail: string | null; notes: string | null
  customer: string | null; prospectName: string | null; prospectPostcode: string | null
  loggedBy: string
}
interface ComplaintDetail {
  id: string; createdAt: string; category: string; description: string
  receivedVia: string; status: string; resolutionNote: string | null
  resolvedAt: string | null; customer: string; loggedBy: string; resolvedBy: string | null
}
interface DiscrepancyDetail {
  id: string; createdAt: string; status: string; reason: string
  orderedQty: number | null; sentQty: number | null; unit: string; note: string | null
  customer: string; product: string; category: string | null; loggedBy: string
}

type Detail = VisitDetail | ComplaintDetail | DiscrepancyDetail

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtFull(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    })
  } catch { return iso }
}

function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-[#EDEAE1] last:border-0">
      <span className="text-[10px] font-bold tracking-widest uppercase text-[#16205B]/50">{label}</span>
      <span className={`text-sm text-gray-900 leading-relaxed ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function HighlightBox({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'green' | 'navy' }) {
  const styles = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    navy:  'bg-blue-50 border-blue-200 text-[#16205B]',
  }
  return (
    <div className={`rounded-xl border p-3 mb-3 ${styles[tone]}`}>
      <p className="text-[10px] font-bold tracking-widest uppercase mb-1 opacity-70">{label}</p>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  )
}

function OutcomePill({ value }: { value: string }) {
  const v = value.toLowerCase().replace(/ /g, '_')
  const s = v === 'positive' ? 'bg-green-100 text-green-700'
          : v === 'at_risk'  ? 'bg-amber-100 text-amber-700'
          : v === 'lost'     ? 'bg-red-100 text-red-700'
          : 'bg-[#EDEAE1] text-gray-700'
  return <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${s}`}>{cap(value)}</span>
}

// ─── Visit detail body ────────────────────────────────────────────────────────

const PIPELINE_BADGE: Record<string, string> = {
  'Logged':              'bg-gray-100 text-gray-500',
  'In Talks':            'bg-purple-50 text-purple-700',
  'Not Progressing':     'bg-red-50 text-red-600',
  'Trial Order Placed':  'bg-blue-50 text-blue-700',
  'Awaiting Feedback':   'bg-amber-50 text-amber-700',
  'Won':                 'bg-green-50 text-green-700',
  'Not Won':             'bg-gray-100 text-gray-500',
}
function PipelinePill({ status }: { status: string }) {
  const cls = PIPELINE_BADGE[status] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${cls}`}>
      {status}
    </span>
  )
}

function VisitBody({ d }: { d: VisitDetail }) {
  return (
    <>
      <div className="flex flex-col gap-2 mb-5">
        <h2 className="text-lg font-bold text-gray-900 truncate">
          {d.customer ?? d.prospectName ?? 'Unknown'}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <OutcomePill value={d.outcome} />
          <PipelinePill status={d.pipelineStatus} />
        </div>
      </div>

      {d.commitmentMade && d.commitmentDetail && (
        <HighlightBox label="Commitment made" value={d.commitmentDetail} tone="amber" />
      )}

      {d.notes && (
        <HighlightBox label="Notes" value={d.notes} tone="navy" />
      )}

      <div>
        <Row label="Visit type"  value={cap(d.visitType)} />
        <Row label="Logged by"   value={d.loggedBy} />
        <Row label="Date & time" value={fmtFull(d.createdAt)} />
        {d.customer   && <Row label="Customer"  value={d.customer} />}
        {d.prospectName && (
          <>
            <Row label="Prospect name" value={d.prospectName} />
            {d.prospectPostcode && <Row label="Postcode" value={d.prospectPostcode} />}
          </>
        )}
        <Row label="Commitment" value={d.commitmentMade ? 'Yes' : 'No'} />
        <Row label="Record ID"  value={d.id} mono />
      </div>
    </>
  )
}

// ─── Complaint detail body ────────────────────────────────────────────────────

function ComplaintBody({ d }: { d: ComplaintDetail }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-lg font-bold text-gray-900 flex-1 truncate">{d.customer}</h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          d.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        }`}>{cap(d.status)}</span>
      </div>

      <HighlightBox label="Description" value={d.description} tone="navy" />

      {d.status === 'resolved' && d.resolutionNote && (
        <HighlightBox label="Resolution" value={d.resolutionNote} tone="green" />
      )}

      <div>
        <Row label="Category"    value={cap(d.category)} />
        <Row label="Received via" value={cap(d.receivedVia)} />
        <Row label="Logged by"   value={d.loggedBy} />
        <Row label="Logged at"   value={fmtFull(d.createdAt)} />
        {d.resolvedBy && <Row label="Resolved by" value={d.resolvedBy} />}
        {d.resolvedAt && <Row label="Resolved at" value={fmtFull(d.resolvedAt)} />}
        <Row label="Record ID"   value={d.id} mono />
      </div>
    </>
  )
}

// ─── Discrepancy detail body ──────────────────────────────────────────────────

function DiscrepancyBody({ d }: { d: DiscrepancyDetail }) {
  const shortfall = d.orderedQty != null && d.sentQty != null
    ? d.orderedQty - d.sentQty : null

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-lg font-bold text-gray-900 flex-1 truncate">{d.customer}</h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          d.status === 'not_sent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
        }`}>{d.status === 'not_sent' ? 'NOT SENT' : 'SHORT'}</span>
      </div>

      {shortfall != null && shortfall > 0 && (
        <HighlightBox
          label="Shortfall"
          value={`${shortfall} ${d.unit} short — ordered ${d.orderedQty}, sent ${d.sentQty}`}
          tone="amber"
        />
      )}

      {d.note && <HighlightBox label="Note" value={d.note} tone="navy" />}

      <div>
        <Row label="Product"     value={d.product} />
        {d.category && <Row label="Category" value={cap(d.category)} />}
        <Row label="Reason"      value={cap(d.reason)} />
        <Row label="Status"      value={cap(d.status)} />
        {d.orderedQty != null && <Row label="Ordered"  value={`${d.orderedQty} ${d.unit}`} />}
        {d.sentQty    != null && <Row label="Sent"     value={`${d.sentQty} ${d.unit}`} />}
        <Row label="Logged by"   value={d.loggedBy} />
        <Row label="Logged at"   value={fmtFull(d.createdAt)} />
        <Row label="Record ID"   value={d.id} mono />
      </div>
    </>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ModalType, string> = {
  visit:        'Visit Detail',
  complaint:    'Complaint Detail',
  discrepancy:  'Discrepancy Detail',
}

export default function DetailModal({
  type,
  id,
  onClose,
}: {
  type:    ModalType
  id:      string
  onClose: () => void
}) {
  const [detail,  setDetail]  = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const fetchDetail = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/detail/${type}?id=${encodeURIComponent(id)}`)
      if (!res.ok) { setError(`Failed to load (${res.status})`); return }
      setDetail(await res.json())
    } catch { setError('Network error') }
    finally   { setLoading(false) }
  }, [type, id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col z-10">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDEAE1] flex-shrink-0">
          <p className="text-xs font-bold tracking-widest uppercase text-[#16205B]/50">
            {TYPE_LABELS[type]}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-[#EDEAE1] hover:bg-[#dedad0] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]"
            aria-label="Close"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-500">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin w-6 h-6 text-[#16205B]/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            </div>
          )}

          {!loading && error && (
            <div className="py-10 text-center">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button type="button" onClick={fetchDetail}
                className="text-xs font-bold text-[#EB6619] hover:underline">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {type === 'visit'        && <VisitBody       d={detail as VisitDetail}       />}
              {type === 'complaint'    && <ComplaintBody   d={detail as ComplaintDetail}   />}
              {type === 'discrepancy'  && <DiscrepancyBody d={detail as DiscrepancyDetail} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
