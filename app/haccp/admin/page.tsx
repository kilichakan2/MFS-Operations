/**
 * app/haccp/admin/page.tsx
 * HACCP Admin — Corrective Action Verification Queue + Supplier Register
 * Admin only.
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

interface Supplier {
  id:               string
  name:             string
  active:           boolean
  position:         number
  address:          string | null
  contact_name:     string | null
  contact_phone:    string | null
  contact_email:    string | null
  fsa_approval_no:  string | null
  fsa_activities:   string | null
  label_code:       string | null
  cert_type:        string | null
  cert_expiry:      string | null  // ISO date
  products_supplied:string | null
  date_approved:    string | null  // ISO date
  categories:       string[]
  notes:            string | null
  created_at:       string
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

function fmtDateOnly(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function certExpiryStatus(expiry: string | null): 'ok' | 'soon' | 'expired' | 'none' {
  if (!expiry) return 'none'
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000
  if (days < 0)   return 'expired'
  if (days < 60)  return 'soon'
  return 'ok'
}

function ageLabel(iso: string): { text: string; tone: 'grey' | 'amber' | 'red' } {
  const hrs = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hrs < 24)  return { text: 'Today',             tone: 'grey'  }
  if (hrs < 48)  return { text: 'Yesterday',          tone: 'amber' }
  const days = Math.floor(hrs / 24)
  return { text: `${days} days ago`, tone: 'red' }
}

// ─── CA Card ─────────────────────────────────────────────────────────────────

function CACard({ ca, onVerify, verifying }: {
  ca:        CA
  onVerify:  (id: string) => void
  verifying: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const age = ageLabel(ca.submitted_at)
  const badgeClass = age.tone === 'red'   ? 'bg-red-100 text-red-600'
                   : age.tone === 'amber' ? 'bg-amber-100 text-amber-700'
                   :                        'bg-slate-100 text-slate-500'
  const borderClass = age.tone === 'red' ? 'border-red-200' : 'border-red-100'

  return (
    <div className={`bg-white rounded-xl overflow-hidden border ${borderClass}`}>
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
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
              {age.text}
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
  const [tab, setTab] = useState<'ca' | 'suppliers'>('ca')

  // ── CA state ─────────────────────────────────────────────────────────────────
  const [unresolved,  setUnresolved]  = useState<CA[]>([])
  const [resolved,    setResolved]    = useState<CA[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [verifying,   setVerifying]   = useState<string | null>(null)
  const [flash,       setFlash]       = useState('')
  const [showResolved,setShowResolved]= useState(false)

  // ── Supplier state ────────────────────────────────────────────────────────────
  const [suppliers,      setSuppliers]      = useState<Supplier[]>([])
  const [suppLoading,    setSuppLoading]    = useState(false)
  const [suppError,      setSuppError]      = useState('')
  const [editId,         setEditId]         = useState<string | null>(null)   // null = new
  const [showForm,       setShowForm]       = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [showInactive,   setShowInactive]   = useState(false)

  // Form fields
  const BLANK = {
    name: '', active: true, address: '', contact_name: '', contact_phone: '',
    contact_email: '', fsa_approval_no: '', fsa_activities: '', cert_type: '',
    cert_expiry: '', products_supplied: '', date_approved: '', notes: '', label_code: '',
  }
  const [form,           setForm]           = useState<typeof BLANK>(BLANK)
  const [editCategories, setEditCategories] = useState<string[]>([])

  function setF(k: keyof typeof BLANK, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const loadData = useCallback(() => {
    setLoading(true)
    fetch('/api/haccp/corrective-actions')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => { setUnresolved(d.unresolved ?? []); setResolved(d.resolved ?? []) })
      .catch(e => setError(`Could not load — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  const loadSuppliers = useCallback(() => {
    setSuppLoading(true)
    fetch('/api/haccp/admin/suppliers')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => setSuppliers(d.suppliers ?? []))
      .catch(e => setSuppError(`Could not load — ${e.message}`))
      .finally(() => setSuppLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (tab === 'suppliers') loadSuppliers() }, [tab, loadSuppliers])

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

  // ── Supplier handlers ──────────────────────────────────────────────────────

  function openNew() {
    setEditId(null)
    setForm(BLANK)
    setEditCategories([])
    setShowForm(true)
  }

  function openEdit(s: Supplier) {
    setEditId(s.id)
    setEditCategories(s.categories ?? [])
    setForm({
      name:             s.name,
      active:           s.active,
      address:          s.address          ?? '',
      contact_name:     s.contact_name     ?? '',
      contact_phone:    s.contact_phone    ?? '',
      contact_email:    s.contact_email    ?? '',
      fsa_approval_no:  s.fsa_approval_no  ?? '',
      fsa_activities:   s.fsa_activities   ?? '',
      cert_type:        s.cert_type        ?? '',
      cert_expiry:      s.cert_expiry      ?? '',
      products_supplied:s.products_supplied ?? '',
      date_approved:    s.date_approved    ?? '',
      notes:            s.notes            ?? '',
      label_code:       s.label_code       ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setSuppError('')
    try {
      const body = {
        ...form,
        categories:    editCategories,
        cert_expiry:   form.cert_expiry   || null,
        date_approved: form.date_approved || null,
        label_code:    form.label_code?.trim().toUpperCase().slice(0, 6) || null,
        ...(editId ? { id: editId } : {}),
      }
      const res = await fetch('/api/haccp/admin/suppliers', {
        method:  editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setSuppError(d.error ?? 'Save failed')
        return
      }
      setShowForm(false)
      loadSuppliers()
    } catch {
      setSuppError('Connection error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(s: Supplier) {
    await fetch('/api/haccp/admin/suppliers', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: s.id, active: !s.active }),
    })
    loadSuppliers()
  }

  const visibleSuppliers = suppliers.filter(s => showInactive || s.active)

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
          <h1 className="text-white text-lg font-bold leading-tight">HACCP Admin</h1>
          <p className="text-white/50 text-xs mt-0.5">Corrective actions &amp; supplier register</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-white flex-shrink-0">
        {([['ca', 'Corrective Actions', unresolved.length], ['suppliers', 'Suppliers', suppliers.filter(s => s.active).length]] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 text-xs font-bold transition-colors ${tab === key ? 'text-orange-600 border-b-2 border-orange-500' : 'text-slate-500'}`}>
            {label}
            {count > 0 && <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* ── CORRECTIVE ACTIONS TAB ─────────────────────────────────────── */}
        {tab === 'ca' && (<>

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
        {/* end CA tab */}
        </>)}

        {/* ── SUPPLIERS TAB ──────────────────────────────────────────────── */}
        {tab === 'suppliers' && (
          <div className="space-y-3">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Approved Supplier Register</p>
                <p className="text-slate-400 text-[10px] mt-0.5">{suppliers.filter(s => s.active).length} active · {suppliers.filter(s => !s.active).length} inactive</p>
              </div>
              <button onClick={openNew}
                className="bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-lg active:bg-orange-700">
                + Add supplier
              </button>
            </div>

            {suppError && <p className="text-red-600 text-xs">{suppError}</p>}

            {/* Show inactive toggle */}
            {suppliers.some(s => !s.active) && (
              <button onClick={() => setShowInactive(v => !v)}
                className="text-slate-400 text-xs flex items-center gap-1.5">
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${showInactive ? 'bg-slate-700 border-slate-700' : 'border-slate-400'}`}>
                  {showInactive && <svg viewBox="0 0 10 10" fill="white" className="w-2.5 h-2.5"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" fill="none"/></svg>}
                </span>
                Show inactive suppliers
              </button>
            )}

            {suppLoading ? (
              <p className="text-slate-400 text-sm py-4">Loading…</p>
            ) : visibleSuppliers.length === 0 ? (
              <div className="bg-slate-50 border border-blue-100 rounded-xl px-4 py-8 text-center">
                <p className="text-slate-400 text-sm">No suppliers yet — tap + Add supplier</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleSuppliers.map((s) => {
                  const expiryStatus = certExpiryStatus(s.cert_expiry)
                  return (
                    <div key={s.id} className={`bg-white border rounded-xl px-4 py-3 ${!s.active ? 'opacity-50 border-slate-200' : 'border-blue-100'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">

                          {/* Name + FSA badge */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-slate-900 font-semibold text-sm">{s.name}</p>
                            {s.fsa_approval_no && (
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">FSA {s.fsa_approval_no}</span>
                            )}
                            {!s.active && <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Inactive</span>}
                          </div>
                          {/* Category tags */}
                          {s.categories && s.categories.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {s.categories.map(c => (
                                <span key={c} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {c.replace('_', ' ')}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Products */}
                          {s.products_supplied && (
                            <p className="text-slate-500 text-xs mt-0.5 truncate">{s.products_supplied}</p>
                          )}

                          {/* Contact */}
                          {(s.contact_name || s.contact_phone) && (
                            <p className="text-slate-400 text-[10px] mt-0.5">
                              {[s.contact_name, s.contact_phone].filter(Boolean).join(' · ')}
                            </p>
                          )}

                          {/* Cert */}
                          {s.cert_type && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                expiryStatus === 'expired' ? 'bg-red-100 text-red-700' :
                                expiryStatus === 'soon'    ? 'bg-amber-100 text-amber-700' :
                                                             'bg-green-100 text-green-700'
                              }`}>
                                {s.cert_type}
                                {s.cert_expiry && ` · exp ${fmtDateOnly(s.cert_expiry)}`}
                                {expiryStatus === 'expired' && ' ⚠️'}
                                {expiryStatus === 'soon'    && ' ⏰'}
                              </span>
                            </div>
                          )}

                          {/* FSA activities */}
                          {s.fsa_activities && (
                            <p className="text-slate-400 text-[10px] mt-0.5">{s.fsa_activities}</p>
                          )}

                          {/* Notes */}
                          {s.notes && (
                            <p className="text-amber-700 text-[10px] mt-0.5 italic">{s.notes}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <button onClick={() => openEdit(s)}
                            className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            Edit
                          </button>
                          <button onClick={() => toggleActive(s)}
                            className={`text-[10px] font-bold px-2 py-1 rounded ${s.active ? 'text-red-600 bg-red-50' : 'text-green-700 bg-green-50'}`}>
                            {s.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ADD / EDIT SUPPLIER DRAWER ──────────────────────────────────── */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end">
            <div className="bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="font-bold text-slate-900">{editId ? 'Edit supplier' : 'Add supplier'}</p>
                <button onClick={() => setShowForm(false)} className="text-slate-400 text-2xl leading-none">×</button>
              </div>
              <div className="px-5 py-4 space-y-3">

                {/* Categories */}
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">Supplier categories</p>
                  <p className="text-slate-400 text-[10px] mb-2">Controls which Goods In deliveries this supplier appears in</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'lamb',            label: 'Lamb' },
                      { key: 'beef',            label: 'Beef' },
                      { key: 'offal',           label: 'Offal' },
                      { key: 'poultry',         label: 'Poultry' },
                      { key: 'dairy',           label: 'Dairy' },
                      { key: 'dry_goods',       label: 'Dry Goods' },
                      { key: 'chilled_other',   label: 'Chilled Other' },
                      { key: 'frozen',          label: 'Frozen' },
                      { key: 'frozen_beef_lamb',label: 'Frozen Beef/Lamb' },
                    ].map(({ key, label }) => (
                      <button key={key}
                        onClick={() => setEditCategories(prev =>
                          prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
                        )}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          editCategories.includes(key)
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-500 border-slate-200'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {[
                  { label: 'Supplier name *', key: 'name' as const, placeholder: 'e.g. Pickstock Foods Ltd' },
                  { label: 'Address', key: 'address' as const, placeholder: 'Site address' },
                  { label: 'FSA approval number', key: 'fsa_approval_no' as const, placeholder: 'e.g. 2095 or GB1234' },
                  { label: 'FSA approved activities', key: 'fsa_activities' as const, placeholder: 'e.g. Slaughterhouse (Red), Cutting Plant (Red)' },
                  { label: 'Products supplied', key: 'products_supplied' as const, placeholder: 'e.g. British lamb cuts, bone-in' },
                  { label: 'Certification type', key: 'cert_type' as const, placeholder: 'e.g. BRC, Red Tractor, SALSA' },
                  { label: 'Contact name', key: 'contact_name' as const, placeholder: '' },
                  { label: 'Contact phone', key: 'contact_phone' as const, placeholder: '' },
                  { label: 'Contact email', key: 'contact_email' as const, placeholder: '' },
                  { label: 'Notes', key: 'notes' as const, placeholder: 'Any additional notes' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <p className="text-xs font-bold text-slate-600 mb-1">{label}</p>
                    <input
                      value={form[key] as string}
                      onChange={e => setF(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                    />
                  </div>
                ))}

                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">Cert expiry date</p>
                  <input type="date" value={form.cert_expiry}
                    onChange={e => setF('cert_expiry', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">Date approved by MFS</p>
                  <input type="date" value={form.date_approved}
                    onChange={e => setF('date_approved', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">Label code <span className="text-slate-400 font-normal">(max 6 chars — shown on 58mm labels, e.g. KPK)</span></p>
                  <input value={form.label_code ?? ''} onChange={e => setF('label_code', e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="e.g. KPK"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 font-mono uppercase"
                  />
                </div>

                {suppError && <p className="text-red-600 text-xs">{suppError}</p>}

                <button onClick={handleSave} disabled={saving || !form.name.trim()}
                  className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-40 mt-2">
                  {saving ? 'Saving…' : editId ? 'Save changes' : 'Add supplier'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
