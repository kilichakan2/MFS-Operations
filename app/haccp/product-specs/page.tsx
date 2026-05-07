'use client'
/**
 * app/haccp/product-specs/page.tsx
 *
 * BSD 1.6.2 — Product Specifications
 * Staff: view all specs
 * Admin: add / edit specs
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSpec {
  id:                      string
  product_name:            string
  description:             string | null
  ingredients:             string | null
  allergens:               string | null
  portion_weight_g:        number | null
  storage_temp_c:          number | null
  shelf_life_chilled_days: number | null
  shelf_life_frozen_days:  number | null
  packaging_type:          string | null
  micro_limits:            string | null
  version:                 string
  reviewed_at:             string | null
  review_due:              boolean
  reviewer:                { name: string } | null
  creator:                 { name: string } | null
  updated_at:              string
}

interface User { id: string; name: string }

const EMPTY_FORM = {
  product_name: '', description: '', ingredients: '', allergens: '',
  portion_weight_g: '', storage_temp_c: '',
  shelf_life_chilled_days: '', shelf_life_frozen_days: '',
  packaging_type: '', micro_limits: '', version: 'V1.0',
  reviewed_at: '', reviewed_by: '',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Field({ label, value, onChange, placeholder, type = 'text', rows }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; rows?: number
}) {
  return (
    <div>
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
      {rows ? (
        <textarea value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={rows}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 resize-none" />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400" />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductSpecsPage() {
  const [specs,      setSpecs]      = useState<ProductSpec[]>([])
  const [users,      setUsers]      = useState<User[]>([])
  const [loading,    setLoading]    = useState(true)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [selected,   setSelected]   = useState<ProductSpec | null>(null)
  const [editing,    setEditing]    = useState(false)
  const [adding,     setAdding]     = useState(false)
  const [form,       setForm]       = useState({ ...EMPTY_FORM })
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState('')

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    const role = document.cookie.split(';').find(c => c.trim().startsWith('mfs_role='))?.split('=')[1]
    setIsAdmin(role === 'admin')
    try {
      const [specsRes, usersRes] = await Promise.all([
        fetch('/api/haccp/product-specs').then(r => r.json()),
        fetch('/api/haccp/people').then(r => r.json()),
      ])
      setSpecs(specsRes.specs ?? [])
      const priority = ['Hakan', 'Ege']
      const all: User[] = usersRes.team ?? usersRes.users ?? []
      all.sort((a, b) => {
        const ai = priority.indexOf(a.name), bi = priority.indexOf(b.name)
        if (ai >= 0 && bi >= 0) return ai - bi
        if (ai >= 0) return -1; if (bi >= 0) return 1
        return a.name.localeCompare(b.name)
      })
      setUsers(all)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(s: ProductSpec) {
    setForm({
      product_name:            s.product_name,
      description:             s.description             ?? '',
      ingredients:             s.ingredients             ?? '',
      allergens:               s.allergens               ?? '',
      portion_weight_g:        s.portion_weight_g?.toString() ?? '',
      storage_temp_c:          s.storage_temp_c?.toString()   ?? '',
      shelf_life_chilled_days: s.shelf_life_chilled_days?.toString() ?? '',
      shelf_life_frozen_days:  s.shelf_life_frozen_days?.toString()  ?? '',
      packaging_type:          s.packaging_type          ?? '',
      micro_limits:            s.micro_limits            ?? '',
      version:                 s.version,
      reviewed_at:             s.reviewed_at             ?? '',
      reviewed_by:             s.reviewer ? (users.find(u => u.name === s.reviewer?.name)?.id ?? '') : '',
    })
    setEditing(true)
    setSaveErr('')
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setAdding(true)
    setSaveErr('')
  }

  async function handleSave() {
    setSaving(true); setSaveErr('')
    const payload = {
      product_name:            form.product_name,
      description:             form.description             || null,
      ingredients:             form.ingredients             || null,
      allergens:               form.allergens               || null,
      portion_weight_g:        form.portion_weight_g        ? Number(form.portion_weight_g) : null,
      storage_temp_c:          form.storage_temp_c          ? Number(form.storage_temp_c)   : null,
      shelf_life_chilled_days: form.shelf_life_chilled_days ? Number(form.shelf_life_chilled_days) : null,
      shelf_life_frozen_days:  form.shelf_life_frozen_days  ? Number(form.shelf_life_frozen_days)  : null,
      packaging_type:          form.packaging_type          || null,
      micro_limits:            form.micro_limits            || null,
      version:                 form.version                 || 'V1.0',
      reviewed_at:             form.reviewed_at             || null,
      reviewed_by:             form.reviewed_by             || null,
    }
    try {
      let res, d
      if (adding) {
        res = await fetch('/api/haccp/product-specs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        d   = await res.json()
      } else {
        res = await fetch('/api/haccp/product-specs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected!.id, ...payload }) })
        d   = await res.json()
      }
      if (!res.ok) { setSaveErr(d.error ?? 'Save failed'); return }
      setEditing(false); setAdding(false); setSelected(null)
      await load()
    } catch { setSaveErr('Connection error') }
    finally { setSaving(false) }
  }

  // ── Form view ───────────────────────────────────────────────────────────────

  if (editing || adding) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
          <button onClick={() => { setEditing(false); setAdding(false) }} className="text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <p className="text-slate-900 font-bold text-base flex-1">{adding ? 'New product spec' : `Edit — ${selected?.product_name}`}</p>
        </div>
        <div className="px-5 py-5 space-y-3 max-w-lg mx-auto">
          <Field label="Product name *"   value={form.product_name}   onChange={v => setF('product_name', v)} placeholder="e.g. MFS Burger Patty 125g" />
          <Field label="Description / intended use" value={form.description} onChange={v => setF('description', v)} placeholder="e.g. Fresh beef burger patty for catering" rows={2} />
          <Field label="Ingredients"      value={form.ingredients}    onChange={v => setF('ingredients', v)}    placeholder="Beef (95%), salt, pepper…" rows={3} />
          <Field label="Allergens"        value={form.allergens}      onChange={v => setF('allergens', v)}      placeholder="Contains: Milk. May contain: Gluten" rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Portion weight (g)"    value={form.portion_weight_g}        onChange={v => setF('portion_weight_g', v)}        placeholder="125" type="number" />
            <Field label="Storage temp (°C)"     value={form.storage_temp_c}          onChange={v => setF('storage_temp_c', v)}          placeholder="5" type="number" />
            <Field label="Shelf life chilled (days)" value={form.shelf_life_chilled_days} onChange={v => setF('shelf_life_chilled_days', v)} placeholder="5" type="number" />
            <Field label="Shelf life frozen (days)"  value={form.shelf_life_frozen_days}  onChange={v => setF('shelf_life_frozen_days', v)}  placeholder="90" type="number" />
          </div>
          <Field label="Packaging type"   value={form.packaging_type}  onChange={v => setF('packaging_type', v)}  placeholder="Vacuum packed · MAP · Tray" />
          <Field label="Micro limits (optional)" value={form.micro_limits} onChange={v => setF('micro_limits', v)} placeholder="e.g. TVC <10⁶ cfu/g at end of shelf life" rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version" value={form.version} onChange={v => setF('version', v)} placeholder="V1.0" />
            <Field label="Review date" value={form.reviewed_at} onChange={v => setF('reviewed_at', v)} type="date" />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Reviewed by</p>
            <select value={form.reviewed_by} onChange={e => setF('reviewed_by', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400">
              <option value="">— Select reviewer —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {saveErr && <p className="text-red-600 text-xs">{saveErr}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setEditing(false); setAdding(false) }}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.product_name.trim()}
              className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Detail view ─────────────────────────────────────────────────────────────

  if (selected) {
    const s = selected
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex-1">
            <p className="text-slate-900 font-bold text-base">{s.product_name}</p>
            <p className="text-slate-400 text-xs">{s.version} · BSD 1.6.2</p>
          </div>
          {isAdmin && (
            <button onClick={() => openEdit(s)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Edit</button>
          )}
        </div>
        <div className="px-5 py-5 space-y-3">
          {s.review_due && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-700 text-xs font-bold">⚠ Review due — {s.reviewed_at ? 'last reviewed ' + fmtDate(s.reviewed_at) : 'never reviewed'}</p>
            </div>
          )}
          {[
            { label: 'Description / intended use', value: s.description },
            { label: 'Ingredients',                value: s.ingredients },
            { label: 'Allergens',                  value: s.allergens },
            { label: 'Packaging',                  value: s.packaging_type },
            { label: 'Micro limits',               value: s.micro_limits },
          ].map(({ label, value }) => value ? (
            <div key={label} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
              <p className="text-slate-800 text-sm whitespace-pre-line">{value}</p>
            </div>
          ) : null)}
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3 grid grid-cols-2 gap-3">
            {[
              { label: 'Portion weight',    value: s.portion_weight_g        ? `${s.portion_weight_g}g` : null },
              { label: 'Storage temp',      value: s.storage_temp_c          ? `≤${s.storage_temp_c}°C` : null },
              { label: 'Shelf life chilled', value: s.shelf_life_chilled_days ? `${s.shelf_life_chilled_days} days` : null },
              { label: 'Shelf life frozen',  value: s.shelf_life_frozen_days  ? `${s.shelf_life_frozen_days} days` : null },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-slate-400 text-[10px]">{label}</p>
                <p className="text-slate-800 text-sm font-semibold">{value ?? '—'}</p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Document control</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-slate-400">Version</p><p className="font-semibold">{s.version}</p></div>
              <div><p className="text-slate-400">Last reviewed</p><p className="font-semibold">{fmtDate(s.reviewed_at)}</p></div>
              <div><p className="text-slate-400">Reviewed by</p><p className="font-semibold">{s.reviewer?.name ?? '—'}</p></div>
              <div><p className="text-slate-400">Last updated</p><p className="font-semibold">{fmtDate(s.updated_at)}</p></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────────

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400 text-sm">Loading…</p></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <Link href="/haccp" className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className="flex-1">
          <p className="text-slate-900 font-bold text-base">Product Specifications</p>
          <p className="text-slate-400 text-xs">BSD 1.6.2 · {specs.length} spec{specs.length !== 1 ? 's' : ''} on file</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">+ Add spec</button>
        )}
      </div>

      <div className="px-5 py-5 space-y-3">
        {specs.length === 0 ? (
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
            <p className="text-slate-400 text-sm">No product specs on file</p>
            {isAdmin && <p className="text-slate-400 text-xs mt-1">Tap + Add spec to create the first one</p>}
          </div>
        ) : (
          specs.map(s => (
            <button key={s.id} onClick={() => setSelected(s)}
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-left flex items-center justify-between gap-3 active:scale-[0.99]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-slate-900 font-bold text-sm">{s.product_name}</p>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{s.version}</span>
                  {s.review_due && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Review due</span>
                  )}
                </div>
                {s.allergens && <p className="text-slate-500 text-[10px] mt-0.5 truncate">{s.allergens}</p>}
                <p className="text-slate-400 text-[10px]">
                  {s.reviewed_at ? `Reviewed ${fmtDate(s.reviewed_at)}` : 'Never reviewed'}
                  {s.reviewer ? ` · ${s.reviewer.name}` : ''}
                </p>
              </div>
              <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))
        )}

        <p className="text-slate-400 text-[10px] text-center pt-2">BSD 1.6.2 — Specifications must be reviewed at least annually</p>
      </div>
    </div>
  )
}
