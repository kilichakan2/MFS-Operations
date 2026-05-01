'use client'
/**
 * app/haccp/recall/page.tsx
 *
 * SALSA 3.4 — Recall & Withdrawal Contact List
 *
 * Sections:
 *  1. Internal recall team       — editable (admin)
 *  2. Regulatory authorities     — editable (admin)
 *  3. Customer contacts          — static note (customer database)
 *  4. Supplier contacts          — live from haccp_suppliers, inline edit (admin)
 *  5. Other key contacts         — editable (admin)
 *  6. Recall action checklist    — static
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InternalContact {
  name:   string
  role:   string
  phone:  string
  mobile: string
}

interface RegulatoryContact {
  organisation:   string
  contact:        string
  phone:          string
  email:          string
  when_to_notify: string
}

interface OtherContact {
  organisation: string
  contact:      string
  purpose:      string
  phone:        string
  email:        string
}

interface RecallConfig {
  id:             string
  internal_team:  InternalContact[]
  regulatory:     RegulatoryContact[]
  other_contacts: OtherContact[]
  updated_at:     string
  updater:        { name: string } | null
}

interface Supplier {
  id:            string
  name:          string
  categories:    string[]
  contact_name:  string | null
  contact_phone: string | null
  contact_email: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  lamb: 'Lamb', beef: 'Beef', offal: 'Offal', poultry: 'Poultry',
  dairy: 'Dairy', dry_goods: 'Dry Goods', frozen: 'Frozen',
  frozen_beef_lamb: 'Frozen Beef/Lamb', chilled_other: 'Chilled Other',
}

const RECALL_CHECKLIST = [
  'STOP production/dispatch of affected product immediately',
  'IDENTIFY affected batches using Goods In traceability records',
  'QUARANTINE all affected stock on site',
  'NOTIFY HACCP Lead (Hakan Kilic) immediately',
  'CONTACT all customers who received affected product',
  'NOTIFY FSA by email if a public health risk exists',
  'NOTIFY SALSA within 3 working days (if approved)',
  'DOCUMENT all actions taken with times',
  'ARRANGE return/disposal of affected product',
  'INVESTIGATE root cause and implement corrective actions',
]

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ number, title, note }: { number: string; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {number}
      </span>
      <div>
        <p className="text-slate-900 font-bold text-sm">{title}</p>
        {note && <p className="text-slate-400 text-[10px] mt-0.5">{note}</p>}
      </div>
    </div>
  )
}

// ─── Field input ──────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
  type?:       string
}) {
  return (
    <div>
      <p className="text-slate-400 text-[10px] mb-0.5">{label}</p>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecallPage() {
  const [config,    setConfig]    = useState<RecallConfig | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading,   setLoading]   = useState(true)
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveErr,   setSaveErr]   = useState('')
  const [flash,     setFlash]     = useState('')

  // Edit state — mirrors config
  const [editTeam,       setEditTeam]       = useState<InternalContact[]>([])
  const [editRegulatory, setEditRegulatory] = useState<RegulatoryContact[]>([])
  const [editOther,      setEditOther]      = useState<OtherContact[]>([])

  // Supplier inline edit state
  const [editingSupplierId,    setEditingSupplierId]    = useState<string | null>(null)
  const [supplierEditName,     setSupplierEditName]     = useState('')
  const [supplierEditPhone,    setSupplierEditPhone]    = useState('')
  const [supplierEditEmail,    setSupplierEditEmail]    = useState('')
  const [supplierSaving,       setSupplierSaving]       = useState(false)
  const [supplierErr,          setSupplierErr]          = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const role = document.cookie.split(';').find(c => c.trim().startsWith('mfs_role='))?.split('=')[1]
    setIsAdmin(role === 'admin')
    fetch('/api/haccp/recall')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => {
        setConfig(d.config ?? null)
        setSuppliers(d.suppliers ?? [])
      })
      .catch(e => console.error('Recall load failed:', e))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit() {
    if (!config) return
    setEditTeam(config.internal_team.map(t => ({ ...t })))
    setEditRegulatory(config.regulatory.map(r => ({ ...r })))
    setEditOther(config.other_contacts.map(o => ({ ...o })))
    setEditing(true)
    setSaveErr('')
  }

  async function handleSave() {
    if (!config) return
    setSaving(true); setSaveErr('')
    try {
      const res = await fetch('/api/haccp/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:             config.id,
          internal_team:  editTeam,
          regulatory:     editRegulatory,
          other_contacts: editOther,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setSaveErr(d.error ?? 'Save failed'); return }
      setConfig(d.config)
      setEditing(false)
      setFlash('Saved')
      setTimeout(() => setFlash(''), 2500)
    } catch {
      setSaveErr('Connection error')
    } finally {
      setSaving(false)
    }
  }

  function openSupplierEdit(s: Supplier) {
    setEditingSupplierId(s.id)
    setSupplierEditName(s.contact_name ?? '')
    setSupplierEditPhone(s.contact_phone ?? '')
    setSupplierEditEmail(s.contact_email ?? '')
    setSupplierErr('')
  }

  async function saveSupplierContact() {
    if (!editingSupplierId) return
    setSupplierSaving(true); setSupplierErr('')
    try {
      const res = await fetch('/api/haccp/recall', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:            editingSupplierId,
          contact_name:  supplierEditName,
          contact_phone: supplierEditPhone,
          contact_email: supplierEditEmail,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setSupplierErr(d.error ?? 'Save failed'); return }
      setSuppliers(prev => prev.map(s =>
        s.id === editingSupplierId ? { ...s, ...d.supplier } : s
      ))
      setEditingSupplierId(null)
    } catch {
      setSupplierErr('Connection error')
    } finally {
      setSupplierSaving(false)
    }
  }

  // ── Helpers for edit arrays ────────────────────────────────────────────────

  function setTeamField(idx: number, field: keyof InternalContact, val: string) {
    setEditTeam(prev => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t))
  }

  function setRegField(idx: number, field: keyof RegulatoryContact, val: string) {
    setEditRegulatory(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  function setOtherField(idx: number, field: keyof OtherContact, val: string) {
    setEditOther(prev => prev.map((o, i) => i === idx ? { ...o, [field]: val } : o))
  }

  function addTeamMember() {
    setEditTeam(prev => [...prev, { name: '', role: '', phone: '', mobile: '' }])
  }

  function removeTeamMember(idx: number) {
    setEditTeam(prev => prev.filter((_, i) => i !== idx))
  }

  function addOtherContact() {
    setEditOther(prev => [...prev, { organisation: '', contact: '', purpose: '', phone: '', email: '' }])
  }

  function removeOtherContact(idx: number) {
    setEditOther(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <Link href="/haccp" className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </Link>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-base">Recall &amp; Withdrawal Contacts</p>
          <p className="text-slate-400 text-xs">SALSA 3.4 · RCL-001 V1.0</p>
        </div>
        {isAdmin && !editing && (
          <button onClick={openEdit}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
            Edit
          </button>
        )}
      </div>

      <div className="px-5 py-5 space-y-6 max-w-2xl mx-auto">

        {/* Flash */}
        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <p className="text-green-700 text-xs font-bold">✓ {flash}</p>
          </div>
        )}

        {/* ── SECTION 1: Internal recall team ─────────────────────────── */}
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100 bg-red-50">
            <SectionHeader number="1" title="Internal Recall Team"
              note="Contact in this order — HACCP Lead has decision-making authority" />
          </div>
          <div className="divide-y divide-slate-50">
            {(editing ? editTeam : config?.internal_team ?? []).map((t, i) => (
              <div key={i} className="px-4 py-3">
                {editing ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Contact {i + 1}</p>
                      {i > 0 && (
                        <button onClick={() => removeTeamMember(i)}
                          className="text-red-400 text-[10px] font-bold">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Name"  value={t.name}  onChange={v => setTeamField(i, 'name',  v)} />
                      <Field label="Role"  value={t.role}  onChange={v => setTeamField(i, 'role',  v)} />
                      <Field label="Phone" value={t.phone} onChange={v => setTeamField(i, 'phone', v)} placeholder="Office number" />
                      <Field label="Mobile" value={t.mobile} onChange={v => setTeamField(i, 'mobile', v)} placeholder="Mobile number" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-slate-900 font-semibold text-sm">{t.name || '—'}</p>
                      <p className="text-slate-500 text-xs">{t.role}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {t.phone  && <p className="text-slate-700 text-xs font-mono">{t.phone}</p>}
                      {t.mobile && <p className="text-slate-700 text-xs font-mono">{t.mobile}</p>}
                      {!t.phone && !t.mobile && (
                        <p className="text-amber-500 text-[10px] font-bold">⚠️ No number</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {editing && (
              <div className="px-4 py-3">
                <button onClick={addTeamMember}
                  className="text-slate-500 text-xs font-bold border border-dashed border-slate-300 rounded-lg px-3 py-2 w-full hover:border-slate-400">
                  + Add team member
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 2: Regulatory authorities ───────────────────────── */}
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100">
            <SectionHeader number="2" title="Regulatory Authorities" />
          </div>
          <div className="divide-y divide-slate-50">
            {(editing ? editRegulatory : config?.regulatory ?? []).map((r, i) => (
              <div key={i} className="px-4 py-3">
                {editing ? (
                  <div className="space-y-2">
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{r.organisation || `Authority ${i + 1}`}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Organisation" value={r.organisation} onChange={v => setRegField(i, 'organisation', v)} />
                      <Field label="Contact name" value={r.contact}      onChange={v => setRegField(i, 'contact',      v)} />
                      <Field label="Phone"        value={r.phone}        onChange={v => setRegField(i, 'phone',        v)} />
                      <Field label="Email"        value={r.email}        onChange={v => setRegField(i, 'email',        v)} type="email" />
                    </div>
                    <Field label="When to notify" value={r.when_to_notify} onChange={v => setRegField(i, 'when_to_notify', v)} />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-slate-900 font-semibold text-sm">{r.organisation}</p>
                        {r.contact && <p className="text-slate-500 text-xs">{r.contact}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {r.phone && <p className="text-slate-700 text-xs font-mono">{r.phone}</p>}
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="text-blue-600 text-xs underline">{r.email}</a>
                        )}
                      </div>
                    </div>
                    {r.when_to_notify && (
                      <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">{r.when_to_notify}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 3: Customer contacts ─────────────────────────────── */}
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100">
            <SectionHeader number="3" title="Customer Contacts"
              note="Maintained in the customer database" />
          </div>
          <div className="px-4 py-4">
            <p className="text-slate-600 text-sm">Current contact details for all active customers are maintained in the customer database.</p>
            <p className="text-slate-400 text-xs mt-1">In the event of a recall, contact all customers who received the affected batch number. Use the Goods In traceability records to identify affected deliveries.</p>
          </div>
        </div>

        {/* ── SECTION 4: Supplier contacts ─────────────────────────────── */}
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100">
            <SectionHeader number="4" title="Supplier Contacts"
              note="Live from supplier register — tap Edit to update contact details" />
          </div>
          {suppliers.length === 0 ? (
            <p className="px-4 py-4 text-slate-400 text-sm">No active suppliers found</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {suppliers.map(s => (
                <div key={s.id} className="px-4 py-3">
                  {editingSupplierId === s.id ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-slate-900 font-semibold text-sm">{s.name}</p>
                        <button onClick={() => setEditingSupplierId(null)}
                          className="text-slate-400 text-xs">Cancel</button>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <Field label="Contact name"  value={supplierEditName}  onChange={setSupplierEditName}  />
                        <Field label="Phone"         value={supplierEditPhone} onChange={setSupplierEditPhone} />
                        <Field label="Email"         value={supplierEditEmail} onChange={setSupplierEditEmail} type="email" />
                      </div>
                      {supplierErr && <p className="text-red-600 text-xs">{supplierErr}</p>}
                      <button onClick={saveSupplierContact} disabled={supplierSaving}
                        className="w-full bg-slate-900 text-white text-xs font-bold py-2.5 rounded-xl disabled:opacity-40">
                        {supplierSaving ? 'Saving…' : 'Save contact'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-slate-900 font-semibold text-sm">{s.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {s.categories.slice(0, 2).map(c => (
                              <span key={c} className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                {CATEGORY_LABELS[c] ?? c}
                              </span>
                            ))}
                          </div>
                        </div>
                        {s.contact_name  && <p className="text-slate-600 text-xs mt-0.5">{s.contact_name}</p>}
                        {s.contact_phone && <p className="text-slate-700 text-xs font-mono">{s.contact_phone}</p>}
                        {s.contact_email && (
                          <a href={`mailto:${s.contact_email}`} className="text-blue-600 text-xs underline">{s.contact_email}</a>
                        )}
                        {!s.contact_name && !s.contact_phone && !s.contact_email && (
                          <p className="text-amber-500 text-[10px] font-bold mt-0.5">⚠️ No contact on file</p>
                        )}
                      </div>
                      {isAdmin && (
                        <button onClick={() => openSupplierEdit(s)}
                          className="text-slate-400 text-[10px] font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 flex-shrink-0 hover:border-slate-400">
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── SECTION 5: Other key contacts ────────────────────────────── */}
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100">
            <SectionHeader number="5" title="Other Key Contacts" />
          </div>
          <div className="divide-y divide-slate-50">
            {(editing ? editOther : config?.other_contacts ?? []).map((o, i) => (
              <div key={i} className="px-4 py-3">
                {editing ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{o.organisation || `Contact ${i + 1}`}</p>
                      <button onClick={() => removeOtherContact(i)}
                        className="text-red-400 text-[10px] font-bold">Remove</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Organisation" value={o.organisation} onChange={v => setOtherField(i, 'organisation', v)} />
                      <Field label="Contact name" value={o.contact}      onChange={v => setOtherField(i, 'contact',      v)} />
                      <Field label="Phone"        value={o.phone}        onChange={v => setOtherField(i, 'phone',        v)} />
                      <Field label="Email"        value={o.email}        onChange={v => setOtherField(i, 'email',        v)} type="email" />
                    </div>
                    <Field label="Purpose" value={o.purpose} onChange={v => setOtherField(i, 'purpose', v)} />
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-slate-900 font-semibold text-sm">{o.organisation || '—'}</p>
                      {o.contact && <p className="text-slate-500 text-xs">{o.contact}</p>}
                      <p className="text-slate-400 text-[10px] mt-0.5">{o.purpose}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {o.phone && <p className="text-slate-700 text-xs font-mono">{o.phone}</p>}
                      {o.email && (
                        <a href={`mailto:${o.email}`} className="text-blue-600 text-xs underline">{o.email}</a>
                      )}
                      {!o.phone && !o.email && (
                        <p className="text-amber-500 text-[10px] font-bold">⚠️ No contact</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {editing && (
              <div className="px-4 py-3">
                <button onClick={addOtherContact}
                  className="text-slate-500 text-xs font-bold border border-dashed border-slate-300 rounded-lg px-3 py-2 w-full hover:border-slate-400">
                  + Add contact
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Save / cancel edit */}
        {editing && (
          <div className="flex gap-3">
            <button onClick={() => setEditing(false)}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
              {saving ? 'Saving…' : 'Save all changes'}
            </button>
          </div>
        )}
        {saveErr && <p className="text-red-600 text-xs text-center">{saveErr}</p>}

        {/* ── SECTION 6: Recall action checklist ──────────────────────── */}
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-200 bg-red-50">
            <SectionHeader number="6" title="Recall Action Checklist"
              note="Follow this sequence immediately on discovering a potential recall" />
          </div>
          <div className="px-4 py-3 space-y-2">
            {RECALL_CHECKLIST.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-slate-700 text-xs leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <p className="text-slate-400 text-[10px] border-t border-slate-100 pt-3 mt-1">
              RCL-001 V1.0 · This list must be reviewed every 6 months and updated whenever contacts change.
            </p>
          </div>
        </div>

        {/* Updated by */}
        {config?.updated_at && (
          <p className="text-slate-400 text-[10px] text-center pb-2">
            Last updated {new Date(config.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            {config.updater ? ` by ${config.updater.name}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
