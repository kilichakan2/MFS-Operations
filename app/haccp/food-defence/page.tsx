'use client'
/**
 * app/haccp/food-defence/page.tsx
 * SALSA 4.2.3 / BSD 4.4 — Food Defence Plan
 * Three views: list, detail, edit
 * Every save inserts a new row — history preserved forever
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['In place', 'Partial', 'Not in place'] as const
type Status = typeof STATUS_OPTIONS[number]

const STATUS_STYLE: Record<Status, string> = {
  'In place':     'bg-green-100 text-green-700',
  'Partial':      'bg-amber-100 text-amber-700',
  'Not in place': 'bg-red-100 text-red-700',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember     { role: string; name: string; responsibility: string }
interface PhysicalControl { control: string; description: string; status: Status }
interface CyberControl   { control: string; requirement: string; status: Status }
interface BackupSystem   { system: string; method: string; frequency: string; last_recovery_test: string | null }
interface EmergencyContact { contact: string; number: string }

interface Plan {
  id:                 string
  version:            string
  issue_date:         string
  next_review_date:   string
  team:               TeamMember[]
  physical_perimeter: PhysicalControl[]
  physical_internal:  PhysicalControl[]
  cyber_controls:     CyberControl[]
  backup_recovery:    BackupSystem[]
  emergency_contacts: EmergencyContact[]
  personnel_notes:    string | null
  goods_notes:        string | null
  incident_notes:     string | null
  created_at:         string
  preparer:           { name: string } | null
  approver:           { name: string } | null
}

interface User { id: string; name: string }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function isOverdue(d: string) { return new Date(d) < new Date() }

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2 mt-4">{label}</p>
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[status]}`}>{status}</span>
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditForm({ base, users, onSaved, onCancel }: {
  base: Plan | null; users: User[]
  onSaved: () => void; onCancel: () => void
}) {
  const [version,    setVersion]    = useState(base?.version ?? '')
  const [issueDate,  setIssueDate]  = useState(base?.issue_date ?? '')
  const [reviewDate, setReviewDate] = useState(base?.next_review_date ?? '')
  const [team,       setTeam]       = useState<TeamMember[]>(base?.team ?? [{ role: '', name: '', responsibility: '' }])
  const [perimeter,  setPerimeter]  = useState<PhysicalControl[]>(base?.physical_perimeter ?? [])
  const [internal,   setInternal]   = useState<PhysicalControl[]>(base?.physical_internal ?? [])
  const [cyber,      setCyber]      = useState<CyberControl[]>(base?.cyber_controls ?? [])
  const [backups,    setBackups]    = useState<BackupSystem[]>(base?.backup_recovery ?? [])
  const [contacts,   setContacts]   = useState<EmergencyContact[]>(base?.emergency_contacts ?? [])
  const [personnelNotes, setPersonnelNotes] = useState(base?.personnel_notes ?? '')
  const [goodsNotes,     setGoodsNotes]     = useState(base?.goods_notes ?? '')
  const [incidentNotes,  setIncidentNotes]  = useState(base?.incident_notes ?? '')
  const [preparedBy, setPreparedBy] = useState(
    base?.preparer ? (users.find(u => u.name === base.preparer?.name)?.id ?? '') : ''
  )
  const [approvedBy, setApprovedBy] = useState(
    base?.approver ? (users.find(u => u.name === base.approver?.name)?.id ?? '') : ''
  )
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  // Generic row updaters
  function updateRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number, field: keyof T, value: unknown) {
    setter(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  function addRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, blank: T) {
    setter(prev => [...prev, blank])
  }
  function removeRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number) {
    setter(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/haccp/food-defence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version, issue_date: issueDate, next_review_date: reviewDate,
          team, physical_perimeter: perimeter, physical_internal: internal,
          cyber_controls: cyber, backup_recovery: backups, emergency_contacts: contacts,
          personnel_notes: personnelNotes || null,
          goods_notes: goodsNotes || null,
          incident_notes: incidentNotes || null,
          prepared_by: preparedBy || null,
          approved_by: approvedBy || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Save failed'); return }
      onSaved()
    } catch { setErr('Connection error') }
    finally { setSaving(false) }
  }

  const inputCls  = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400'
  const selectCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400'
  const labelCls  = 'text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1'

  function RowHeader({ label, onAdd, onRemove, showRemove }: {
    label: string; onAdd?: () => void; onRemove?: () => void; showRemove?: boolean
  }) {
    return (
      <div className="flex items-center justify-between mb-1">
        <p className="text-slate-600 text-xs font-bold">{label}</p>
        <div className="flex gap-2">
          {showRemove && <button onClick={onRemove} className="text-red-400 text-[10px]">Remove</button>}
          {onAdd && <button onClick={onAdd} className="text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg px-2 py-1">+ Add row</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <button onClick={onCancel} className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="text-slate-900 font-bold text-base flex-1">New version based on {base?.version ?? '—'}</p>
      </div>

      <div className="px-5 py-5 space-y-4 max-w-lg mx-auto">

        {/* Version + dates */}
        <div className="grid grid-cols-3 gap-3">
          <div><p className={labelCls}>Version *</p>
            <input value={version} onChange={e => setVersion(e.target.value)} placeholder="V1.1" className={inputCls}/></div>
          <div><p className={labelCls}>Issue date *</p>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls}/></div>
          <div><p className={labelCls}>Next review *</p>
            <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} className={inputCls}/></div>
        </div>

        {/* Food defence team */}
        <div>
          <RowHeader label="Food defence team" onAdd={() => addRow(setTeam, { role: '', name: '', responsibility: '' })} />
          <div className="space-y-3">
            {team.map((t, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                <RowHeader label={`Member ${i + 1}`} onRemove={() => removeRow(setTeam, i)} showRemove={team.length > 1} />
                <div><p className={labelCls}>Role</p>
                  <input value={t.role} onChange={e => updateRow(setTeam, i, 'role', e.target.value)} placeholder="e.g. Food Defence Coordinator" className={inputCls}/></div>
                <div><p className={labelCls}>Name</p>
                  <input value={t.name} onChange={e => updateRow(setTeam, i, 'name', e.target.value)} placeholder="Full name" className={inputCls}/></div>
                <div><p className={labelCls}>Responsibility</p>
                  <input value={t.responsibility} onChange={e => updateRow(setTeam, i, 'responsibility', e.target.value)} placeholder="e.g. Overall food defence management" className={inputCls}/></div>
              </div>
            ))}
          </div>
        </div>

        {/* Physical — perimeter */}
        <div>
          <RowHeader label="Physical security — perimeter"
            onAdd={() => addRow(setPerimeter, { control: '', description: '', status: 'In place' })} />
          <div className="space-y-3">
            {perimeter.map((p, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                <RowHeader label={`Control ${i + 1}`} onRemove={() => removeRow(setPerimeter, i)} showRemove={perimeter.length > 1} />
                <div className="grid grid-cols-2 gap-2">
                  <div><p className={labelCls}>Control</p>
                    <input value={p.control} onChange={e => updateRow(setPerimeter, i, 'control', e.target.value)} placeholder="e.g. CCTV" className={inputCls}/></div>
                  <div><p className={labelCls}>Status</p>
                    <select value={p.status} onChange={e => updateRow(setPerimeter, i, 'status', e.target.value)} className={selectCls}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                </div>
                <div><p className={labelCls}>Description</p>
                  <input value={p.description} onChange={e => updateRow(setPerimeter, i, 'description', e.target.value)} placeholder="Description of control" className={inputCls}/></div>
              </div>
            ))}
          </div>
        </div>

        {/* Physical — internal */}
        <div>
          <RowHeader label="Physical security — internal"
            onAdd={() => addRow(setInternal, { control: '', description: '', status: 'In place' })} />
          <div className="space-y-3">
            {internal.map((p, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                <RowHeader label={`Control ${i + 1}`} onRemove={() => removeRow(setInternal, i)} showRemove={internal.length > 1} />
                <div className="grid grid-cols-2 gap-2">
                  <div><p className={labelCls}>Control</p>
                    <input value={p.control} onChange={e => updateRow(setInternal, i, 'control', e.target.value)} placeholder="e.g. Production Access" className={inputCls}/></div>
                  <div><p className={labelCls}>Status</p>
                    <select value={p.status} onChange={e => updateRow(setInternal, i, 'status', e.target.value)} className={selectCls}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                </div>
                <div><p className={labelCls}>Description</p>
                  <input value={p.description} onChange={e => updateRow(setInternal, i, 'description', e.target.value)} placeholder="Description of control" className={inputCls}/></div>
              </div>
            ))}
          </div>
        </div>

        {/* Cyber controls */}
        <div>
          <RowHeader label="Cyber security controls"
            onAdd={() => addRow(setCyber, { control: '', requirement: '', status: 'In place' })} />
          <div className="space-y-3">
            {cyber.map((c, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                <RowHeader label={`Control ${i + 1}`} onRemove={() => removeRow(setCyber, i)} showRemove={cyber.length > 1} />
                <div className="grid grid-cols-2 gap-2">
                  <div><p className={labelCls}>Control</p>
                    <input value={c.control} onChange={e => updateRow(setCyber, i, 'control', e.target.value)} placeholder="e.g. Passwords" className={inputCls}/></div>
                  <div><p className={labelCls}>Status</p>
                    <select value={c.status} onChange={e => updateRow(setCyber, i, 'status', e.target.value)} className={selectCls}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                </div>
                <div><p className={labelCls}>Requirement</p>
                  <input value={c.requirement} onChange={e => updateRow(setCyber, i, 'requirement', e.target.value)} placeholder="e.g. Unique, strong passwords; changed periodically" className={inputCls}/></div>
              </div>
            ))}
          </div>
        </div>

        {/* Backup & recovery */}
        <div>
          <RowHeader label="Backup & recovery"
            onAdd={() => addRow(setBackups, { system: '', method: '', frequency: '', last_recovery_test: null } as BackupSystem)} />
          <div className="space-y-3">
            {backups.map((b, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                <RowHeader label={`System ${i + 1}`} onRemove={() => removeRow(setBackups, i)} showRemove={backups.length > 1} />
                <div className="grid grid-cols-2 gap-2">
                  <div><p className={labelCls}>System</p>
                    <input value={b.system} onChange={e => updateRow(setBackups, i, 'system', e.target.value)} placeholder="e.g. HACCP Records" className={inputCls}/></div>
                  <div><p className={labelCls}>Method</p>
                    <input value={b.method} onChange={e => updateRow(setBackups, i, 'method', e.target.value)} placeholder="e.g. Cloud / External drive" className={inputCls}/></div>
                  <div><p className={labelCls}>Frequency</p>
                    <input value={b.frequency} onChange={e => updateRow(setBackups, i, 'frequency', e.target.value)} placeholder="e.g. Weekly" className={inputCls}/></div>
                  <div><p className={labelCls}>Last recovery test</p>
                    <input type="date" value={b.last_recovery_test ?? ''} onChange={e => updateRow(setBackups, i, 'last_recovery_test', e.target.value || null)} className={inputCls}/></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency contacts */}
        <div>
          <RowHeader label="Emergency contacts"
            onAdd={() => addRow(setContacts, { contact: '', number: '' })} />
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-slate-600 text-xs font-bold flex-1">Contact {i + 1}</p>
                  {contacts.length > 1 && <button onClick={() => removeRow(setContacts, i)} className="text-red-400 text-[10px]">Remove</button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className={labelCls}>Contact</p>
                    <input value={c.contact} onChange={e => updateRow(setContacts, i, 'contact', e.target.value)} placeholder="e.g. Local Authority EHO" className={inputCls}/></div>
                  <div><p className={labelCls}>Number</p>
                    <input value={c.number} onChange={e => updateRow(setContacts, i, 'number', e.target.value)} placeholder="Phone number" className={inputCls}/></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div><p className={labelCls}>Personnel security notes</p>
          <textarea value={personnelNotes} onChange={e => setPersonnelNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'}/></div>
        <div><p className={labelCls}>Goods receipt & dispatch notes</p>
          <textarea value={goodsNotes} onChange={e => setGoodsNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'}/></div>
        <div><p className={labelCls}>Incident response notes (additions to standard procedure)</p>
          <textarea value={incidentNotes} onChange={e => setIncidentNotes(e.target.value)} rows={2} className={inputCls + ' resize-none'}/></div>

        {/* Sign-off */}
        <div className="grid grid-cols-2 gap-3">
          <div><p className={labelCls}>Prepared by</p>
            <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)} className={selectCls}>
              <option value="">— Select —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
          <div><p className={labelCls}>Approved by</p>
            <select value={approvedBy} onChange={e => setApprovedBy(e.target.value)} className={selectCls}>
              <option value="">— Select —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></div>
        </div>

        {err && <p className="text-red-600 text-xs">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving || !version.trim() || !issueDate || !reviewDate}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
            {saving ? 'Saving…' : 'Save new version'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({ plan, isLatest, isAdmin, users, onBack, onEdit }: {
  plan: Plan; isLatest: boolean; isAdmin: boolean; users: User[]
  onBack: () => void; onEdit: (base: Plan) => void
}) {
  const overdue = isLatest && isOverdue(plan.next_review_date)

  function ControlRow({ control, description, status }: { control: string; description: string; status: Status }) {
    return (
      <div className="flex items-start justify-between gap-3 py-2 border-t border-slate-50 first:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 text-xs font-semibold">{control}</p>
          {description && <p className="text-slate-500 text-[10px] mt-0.5">{description}</p>}
        </div>
        <StatusBadge status={status as Status} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-base">MFS-FDP-001 · {plan.version}</p>
          <p className="text-slate-400 text-xs">{isLatest ? 'Current version' : 'Historical version'} · SALSA 4.2.3</p>
        </div>
        {isAdmin && (
          <button onClick={() => onEdit(plan)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Edit</button>
        )}
      </div>

      <div className="px-5 py-5 space-y-3">
        {overdue && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-700 text-xs font-bold">⚠ Review overdue — due {fmtDate(plan.next_review_date)}</p>
          </div>
        )}

        {/* Metadata */}
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-3 grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-slate-400">Version</p><p className="font-semibold">{plan.version}</p></div>
          <div><p className="text-slate-400">Issue date</p><p className="font-semibold">{fmtDate(plan.issue_date)}</p></div>
          <div><p className="text-slate-400">Next review</p><p className="font-semibold">{fmtDate(plan.next_review_date)}</p></div>
          <div><p className="text-slate-400">Saved</p><p className="font-semibold">{fmtDate(plan.created_at)}</p></div>
          <div><p className="text-slate-400">Prepared by</p><p className="font-semibold">{plan.preparer?.name ?? '—'}</p></div>
          <div><p className="text-slate-400">Approved by</p><p className="font-semibold">{plan.approver?.name ?? '—'}</p></div>
        </div>

        {/* Food defence team */}
        {plan.team.length > 0 && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Food defence team</p>
            {plan.team.map((t, i) => (
              <div key={i} className="py-2 border-t border-slate-50 first:border-0">
                <p className="text-slate-800 text-xs font-semibold">{t.role}</p>
                <p className="text-slate-700 text-xs">{t.name}</p>
                <p className="text-slate-400 text-[10px]">{t.responsibility}</p>
              </div>
            ))}
          </div>
        )}

        {/* Physical — perimeter */}
        {plan.physical_perimeter.length > 0 && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Physical security — perimeter</p>
            {plan.physical_perimeter.map((c, i) => (
              <ControlRow key={i} control={c.control} description={c.description} status={c.status as Status} />
            ))}
          </div>
        )}

        {/* Physical — internal */}
        {plan.physical_internal.length > 0 && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Physical security — internal</p>
            {plan.physical_internal.map((c, i) => (
              <ControlRow key={i} control={c.control} description={c.description} status={c.status as Status} />
            ))}
          </div>
        )}

        {/* Visitor management note */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-blue-800 text-xs font-bold">Visitor management</p>
          <p className="text-blue-600 text-xs mt-0.5">Visitor log maintained digitally — recorded in the People tile (health declarations, sign-in/out, company and reason).</p>
        </div>

        {/* Cyber controls */}
        {plan.cyber_controls.length > 0 && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Cyber security controls</p>
            {plan.cyber_controls.map((c, i) => (
              <div key={i} className="py-2 border-t border-slate-50 first:border-0 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 text-xs font-semibold">{c.control}</p>
                  {c.requirement && <p className="text-slate-500 text-[10px] mt-0.5">{c.requirement}</p>}
                </div>
                <StatusBadge status={c.status as Status} />
              </div>
            ))}
          </div>
        )}

        {/* Backup & recovery */}
        {plan.backup_recovery.length > 0 && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Backup & recovery</p>
            {plan.backup_recovery.map((b, i) => (
              <div key={i} className="py-2 border-t border-slate-50 first:border-0 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <p className="font-semibold text-slate-800 col-span-2">{b.system}</p>
                <div><p className="text-slate-400 text-[10px]">Method</p><p>{b.method}</p></div>
                <div><p className="text-slate-400 text-[10px]">Frequency</p><p>{b.frequency}</p></div>
                <div className="col-span-2"><p className="text-slate-400 text-[10px]">Last recovery test</p>
                  <p className={b.last_recovery_test ? '' : 'text-amber-600'}>{b.last_recovery_test ? fmtDate(b.last_recovery_test) : 'Not yet tested'}</p></div>
              </div>
            ))}
          </div>
        )}

        {/* Notes sections */}
        {[
          { label: 'Personnel security', value: plan.personnel_notes },
          { label: 'Goods receipt & dispatch', value: plan.goods_notes },
          { label: 'Incident response notes', value: plan.incident_notes },
        ].filter(s => s.value).map(({ label, value }) => (
          <div key={label} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
            <p className="text-slate-700 text-xs whitespace-pre-line">{value}</p>
          </div>
        ))}

        {/* Emergency contacts */}
        {plan.emergency_contacts.length > 0 && (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Emergency contacts</p>
            {plan.emergency_contacts.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-t border-slate-50 first:border-0">
                <p className="text-slate-700 text-xs">{c.contact}</p>
                <p className="text-slate-900 text-xs font-semibold">{c.number || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FoodDefencePage() {
  const [plans,    setPlans]    = useState<Plan[]>([])
  const [users,    setUsers]    = useState<User[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [selected, setSelected] = useState<Plan | null>(null)
  const [editBase, setEditBase] = useState<Plan | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const role = document.cookie.split(';').find(c => c.trim().startsWith('mfs_role='))?.split('=')[1]
    setIsAdmin(role === 'admin')
    try {
      const [pr, ur] = await Promise.all([
        fetch('/api/haccp/food-defence').then(r => r.json()),
        fetch('/api/haccp/users').then(r => r.json()),
      ])
      setPlans(pr.plans ?? [])
      setUsers(ur.users ?? [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (editBase !== null) return (
    <EditForm base={editBase} users={users}
      onSaved={async () => { setEditBase(null); setSelected(null); await load() }}
      onCancel={() => setEditBase(null)} />
  )

  if (selected) {
    const isLatest = plans[0]?.id === selected.id
    return (
      <DetailView plan={selected} isLatest={isLatest} isAdmin={isAdmin} users={users}
        onBack={() => setSelected(null)}
        onEdit={base => setEditBase(base)} />
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  )

  const latest  = plans[0] ?? null
  const history = plans.slice(1)
  const overdue = latest && isOverdue(latest.next_review_date)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <Link href="/haccp" className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-base">Food Defence Plan</p>
          <p className="text-slate-400 text-xs">MFS-FDP-001 · SALSA 4.2.3</p>
        </div>
        {isAdmin && (
          <button onClick={() => setEditBase(latest)}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
            + New version
          </button>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">
        {latest ? (
          <>
            {overdue && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-red-700 text-xs font-bold">⚠ Review overdue — due {fmtDate(latest.next_review_date)}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Current version</p>
              <button onClick={() => setSelected(latest)}
                className="w-full bg-white border border-blue-100 rounded-xl px-4 py-4 text-left active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-slate-900 font-bold">{latest.version}</p>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Current</span>
                      {overdue && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Review due</span>}
                    </div>
                    <p className="text-slate-400 text-xs">Issued {fmtDate(latest.issue_date)} · Next review {fmtDate(latest.next_review_date)}</p>
                    {(latest.preparer || latest.approver) && (
                      <p className="text-slate-400 text-[10px] mt-0.5">
                        {latest.preparer && `Prepared: ${latest.preparer.name}`}
                        {latest.preparer && latest.approver && ' · '}
                        {latest.approver && `Approved: ${latest.approver.name}`}
                      </p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </button>
            </div>
            {history.length > 0 && (
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Version history</p>
                <div className="space-y-2">
                  {history.map(p => (
                    <button key={p.id} onClick={() => setSelected(p)}
                      className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-left flex items-center justify-between gap-3 active:scale-[0.99]">
                      <div>
                        <p className="text-slate-700 font-semibold text-sm">{p.version}</p>
                        <p className="text-slate-400 text-xs">Issued {fmtDate(p.issue_date)} · Saved {fmtDate(p.created_at)}</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
            <p className="text-slate-400 text-sm">No plan on file</p>
            {isAdmin && <p className="text-slate-400 text-xs mt-1">Tap + New version to create one</p>}
          </div>
        )}
      </div>
    </div>
  )
}
