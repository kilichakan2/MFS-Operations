/**
 * app/haccp/admin/page.tsx
 * HACCP Admin — Corrective Action Verification Queue
 * Admin only. Sign off deviations that require management verification.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CA {
  id:                    string
  submitted_at:          string
  verified_at?:          string
  ccp_ref:               string
  deviation_description: string
  action_taken:          string
  product_disposition?:  string
  recurrence_prevention?:string
  source_table:          string
  users:                 { name: string } | null
  verifier?:             { name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CCP_LABELS: Record<string, string> = {
  'CCP1':           'CCP1 — Goods In',
  'CCP2':           'CCP2 — Cold Storage',
  'CCP3':           'CCP3 — Process Room',
  'CCP-M1':         'CCP-M — Mince Input',
  'CCP-MP1':        'CCP-M — Prep Input',
  'SOP2':           'SOP2 — Cleaning',
  'SOP3':           'SOP3 — Calibration',
  'SOP12':          'SOP12 — Product Return',
  'WEEKLY-REVIEW':  'Weekly Review',
  'MONTHLY-REVIEW': 'Monthly Review',
}

const SOURCE_LABELS: Record<string, string> = {
  'haccp_deliveries':       'Goods In',
  'haccp_cold_storage_temps':'Cold Storage',
  'haccp_processing_temps': 'Process Room',
  'haccp_mince_log':        'Mince',
  'haccp_meatprep_log':     'Meat Prep',
  'haccp_cleaning_log':     'Cleaning',
  'haccp_calibration_log':  'Calibration',
  'haccp_returns':          'Product Return',
  'haccp_weekly_review':    'Weekly Review',
  'haccp_monthly_review':   'Monthly Review',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── CA Card ─────────────────────────────────────────────────────────────────

function CACard({ ca, onVerify, verifying }: {
  ca:        CA
  onVerify:  (id: string) => void
  verifying: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white border border-red-100 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-orange-600 text-[10px] font-bold tracking-widest uppercase">
              {CCP_LABELS[ca.ccp_ref] ?? ca.ccp_ref}
            </span>
            <span className="text-slate-300 text-[10px]">·</span>
            <span className="text-slate-400 text-[10px]">
              {SOURCE_LABELS[ca.source_table] ?? ca.source_table}
            </span>
          </div>
          <p className="text-slate-800 text-sm font-medium leading-snug">
            {ca.deviation_description}
          </p>
          <p className="text-slate-400 text-[10px] mt-1">
            {ca.users?.name ?? '—'} · {fmtDate(ca.submitted_at)}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50">
          {ca.action_taken && (
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Action taken</p>
              <p className="text-slate-700 text-xs leading-relaxed">{ca.action_taken}</p>
            </div>
          )}
          {ca.recurrence_prevention && (
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Recurrence prevention</p>
              <p className="text-slate-700 text-xs leading-relaxed">{ca.recurrence_prevention}</p>
            </div>
          )}
          {ca.product_disposition && (
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Product disposition</p>
              <p className="text-slate-700 text-xs">{ca.product_disposition}</p>
            </div>
          )}
        </div>
      )}

      {/* Sign off button */}
      <div className="px-4 py-3 border-t border-slate-100">
        <button
          onClick={() => onVerify(ca.id)}
          disabled={verifying}
          className="w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          {verifying
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Signing off…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Sign off — verified by management</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCCAPage() {
  const [unresolved,  setUnresolved]  = useState<CA[]>([])
  const [resolved,    setResolved]    = useState<CA[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [verifying,   setVerifying]   = useState<string | null>(null)
  const [flash,       setFlash]       = useState('')
  const [showResolved,setShowResolved]= useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    fetch('/api/haccp/corrective-actions')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => { setUnresolved(d.unresolved ?? []); setResolved(d.resolved ?? []) })
      .catch(e => setError(`Could not load — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleVerify(id: string) {
    setVerifying(id)
    try {
      const res = await fetch(`/api/haccp/corrective-actions/${id}`, { method: 'PATCH' })
      if (res.ok) {
        setFlash('Signed off successfully')
        setTimeout(() => setFlash(''), 2500)
        loadData()
      } else {
        const d = await res.json()
        setError(d.error ?? 'Failed to sign off')
      }
    } catch {
      setError('Connection error — try again')
    } finally {
      setVerifying(null)
    }
  }

  // Group unresolved by CCP ref
  const groups = unresolved.reduce((acc, ca) => {
    const key = ca.ccp_ref
    if (!acc[key]) acc[key] = []
    acc[key].push(ca)
    return acc
  }, {} as Record<string, CA[]>)

  // Sort groups — WEEKLY/MONTHLY-REVIEW last, food safety first
  const PRIORITY = ['CCP1','CCP2','CCP3','CCP-M1','CCP-MP1','SOP3','SOP12','SOP2','WEEKLY-REVIEW','MONTHLY-REVIEW']
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = PRIORITY.indexOf(a); const bi = PRIORITY.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1; if (bi === -1) return -1
    return ai - bi
  })

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B] flex-shrink-0">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">Admin</p>
          <h1 className="text-white text-lg font-bold leading-tight">Corrective Action Sign-off</h1>
        </div>
        {unresolved.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
            {unresolved.length} pending
          </span>
        )}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* Flash */}
        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <p className="text-green-700 font-bold text-sm">{flash}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 text-slate-400 text-sm py-8 justify-center">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Loading…
          </div>
        ) : (
          <>
            {/* ── Unresolved ──────────────────────────────────────── */}
            {unresolved.length === 0 ? (
              <div className="bg-white border border-blue-100 rounded-2xl px-6 py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-slate-900 font-bold text-base mb-1">All clear</p>
                <p className="text-slate-400 text-sm">No corrective actions awaiting sign-off</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                  <p className="text-amber-800 text-xs leading-relaxed">
                    These deviations were flagged as requiring management sign-off. Review each one, confirm the action taken is appropriate, then sign off.
                  </p>
                </div>

                {sortedKeys.map(ccp => (
                  <div key={ccp}>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                      {CCP_LABELS[ccp] ?? ccp} · {groups[ccp].length} pending
                    </p>
                    <div className="space-y-2">
                      {groups[ccp].map(ca => (
                        <CACard
                          key={ca.id}
                          ca={ca}
                          onVerify={handleVerify}
                          verifying={verifying === ca.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ── Resolved history ─────────────────────────────────── */}
            {resolved.length > 0 && (
              <div>
                <button
                  onClick={() => setShowResolved(s => !s)}
                  className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest mb-2"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${showResolved ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 5l7 7-7 7"/></svg>
                  Recently signed off ({resolved.length})
                </button>

                {showResolved && (
                  <div className="space-y-2">
                    {resolved.map(ca => (
                      <div key={ca.id} className="bg-white border border-green-100 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-slate-400 text-[10px] font-bold">{CCP_LABELS[ca.ccp_ref] ?? ca.ccp_ref}</span>
                            </div>
                            <p className="text-slate-700 text-xs leading-snug">{ca.deviation_description}</p>
                            <p className="text-slate-400 text-[10px] mt-1">
                              Raised by {ca.users?.name ?? '—'} · {fmtDateShort(ca.submitted_at)}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Signed off</span>
                            <p className="text-slate-400 text-[10px] mt-1">
                              {ca.verifier?.name ?? '—'} · {ca.verified_at ? fmtDateShort(ca.verified_at) : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
