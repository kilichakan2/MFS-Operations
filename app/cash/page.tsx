'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useCallback, useId } from 'react'
import RoleNav    from '@/components/RoleNav'
import AppHeader  from '@/components/AppHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashEntry {
  id: string; month_id: string; entry_date: string
  type: 'income' | 'expense'; category: string | null
  amount: number; description: string; reference: string | null
  attachment_path: string | null; attachment_name: string | null
  signed_url: string | null; created_at: string
  created_by_name: string; edited_by_name: string | null; edited_at: string | null
}

interface CashMonth {
  id: string; year: number; month: number
  opening_balance: number; is_locked: boolean; created_at: string
}

interface Summary { opening: number; total_income: number; total_expense: number; closing: number }

interface MonthData {
  exists: boolean; isFirst?: boolean; suggestedOpening?: number | null
  month?: CashMonth; entries?: CashEntry[]; summary?: Summary
}

interface ChequeRecord {
  id: string; date: string; amount: number
  cheque_number: string | null; notes: string | null
  created_at: string; confirmed_at: string | null
  customer: { id: string; name: string } | null
  driver:   { id: string; name: string } | null
  logged_by_name: string; confirmed_by_name: string | null
}

type Tab       = 'cash' | 'cheques'
type CheqFilter = 'all' | 'unconfirmed' | 'confirmed'

const EXPENSE_CATEGORIES = ['Fuel','Supplies','Wages','Petty cash','Equipment','Other']
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }
function firstWeekday(y: number, m: number) {
  const d = new Date(y, m - 1, 1).getDay()
  return d === 0 ? 6 : d - 1 // Mon=0
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <svg className="animate-spin w-6 h-6 text-[#16205B]/30" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path  className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )
}

// ─── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({ entry, isAdmin, onDelete, onEdit }: {
  entry: CashEntry; isAdmin: boolean
  onDelete: (id: string) => void
  onEdit:   (entry: CashEntry) => void
}) {
  const isIncome = entry.type === 'income'
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className={`mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
        isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {isIncome ? 'IN' : 'OUT'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{entry.description}</p>
        <p className="text-[11px] text-gray-400">
          {fmtDate(entry.entry_date)}
          {entry.category && <> · {entry.category}</>}
          {entry.reference && <> · #{entry.reference}</>}
          {' · '}{entry.created_by_name}
        </p>
        {entry.signed_url && (
          <a href={entry.signed_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#16205B] hover:text-[#EB6619] mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h5.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 11.5 14h-8A1.5 1.5 0 0 1 2 12.5v-9Z"/>
            </svg>
            {entry.attachment_name ?? 'Attachment'}
          </a>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-sm font-bold ${isIncome ? 'text-green-700' : 'text-red-600'}`}>
          {isIncome ? '+' : '-'}{fmt(entry.amount)}
        </span>
        {isAdmin && (
          <div className="flex gap-0.5">
            <button type="button" onClick={() => onEdit(entry)}
              className="p-1 rounded text-gray-400 hover:text-[#16205B] hover:bg-gray-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 13.25H2.75a.75.75 0 0 1 0-1.5h2a.75.75 0 0 1 0 1.5Z"/>
              </svg>
            </button>
            <button type="button" onClick={() => onDelete(entry.id)}
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Entry form ───────────────────────────────────────────────────────────

function AddEntryForm({ type, monthId, onSaved, onCancel }: {
  type: 'income' | 'expense'; monthId: string
  onSaved: (entry: CashEntry) => void; onCancel: () => void
}) {
  const id = useId()
  const [date,        setDate]        = useState(todayISO())
  const [amount,      setAmount]      = useState('')
  const [desc,        setDesc]        = useState('')
  const [category,    setCategory]    = useState(EXPENSE_CATEGORIES[0])
  const [reference,   setReference]   = useState('')
  const [file,        setFile]        = useState<File | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit() {
    if (!amount || !desc.trim()) { setError('Amount and description required'); return }
    setSaving(true); setError('')
    try {
      let attachment_path: string | null = null
      let attachment_name: string | null = null
      if (file) {
        const fd = new FormData(); fd.append('file', file)
        const up = await fetch('/api/cash/upload', { method: 'POST', body: fd })
        if (!up.ok) { const d = await up.json(); setError(d.error ?? 'Upload failed'); return }
        const ud = await up.json()
        attachment_path = ud.path; attachment_name = ud.name
      }
      const res = await fetch('/api/cash/entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month_id: monthId, entry_date: date, type,
          category: type === 'expense' ? category : null,
          amount: parseFloat(amount), description: desc.trim(),
          reference: reference.trim() || null, attachment_path, attachment_name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      onSaved(data.entry)
    } catch { setError('Network error') }
    finally   { setSaving(false) }
  }

  const isIncome = type === 'income'
  return (
    <div className={`mt-3 p-3 rounded-xl border-2 ${isIncome ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
      <p className="text-xs font-bold text-gray-700 mb-2">
        {isIncome ? '+ Add Income' : '- Add Expense'}
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Amount £</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
          </div>
        </div>
        {type === 'expense' && (
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[10px] text-gray-500 font-semibold uppercase">Description</label>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description"
            className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">
              {isIncome ? 'Invoice ref' : 'Receipt ref'} <span className="font-normal normal-case">(opt)</span>
            </label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. INV-001"
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">
              {isIncome ? 'Invoice' : 'Receipt'} <span className="font-normal normal-case">(opt)</span>
            </label>
            <label className="flex items-center gap-1.5 h-9 px-2 rounded-lg border border-gray-200 cursor-pointer hover:border-[#EB6619] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h5.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 11.5 14h-8A1.5 1.5 0 0 1 2 12.5v-9Z"/>
              </svg>
              <span className="text-xs text-gray-500 truncate">{file ? file.name : 'Upload'}</span>
              <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                onChange={e => setFile(e.target.files?.[0] ?? null)}/>
            </label>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={handleSubmit} disabled={saving}
            className={`flex-1 h-9 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] ${
              isIncome ? 'bg-green-600 disabled:bg-green-300' : 'bg-[#16205B] disabled:opacity-40'
            }`}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancel}
            className="h-9 px-4 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Entry form (admin only) ────────────────────────────────────────────

function EditEntryForm({ entry, onSaved, onCancel }: {
  entry:    CashEntry
  onSaved:  (updated: Partial<CashEntry> & { id: string }) => void
  onCancel: () => void
}) {
  const [amount,    setAmount]    = useState(String(entry.amount))
  const [desc,      setDesc]      = useState(entry.description)
  const [category,  setCategory]  = useState(entry.category ?? EXPENSE_CATEGORIES[0])
  const [reference, setReference] = useState(entry.reference ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  async function handleSave() {
    if (!amount || !desc.trim()) { setError('Amount and description required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/cash/entry/${entry.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:      parseFloat(amount),
          description: desc.trim(),
          category:    entry.type === 'expense' ? category : null,
          reference:   reference.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      onSaved({ id: entry.id, amount: parseFloat(amount), description: desc.trim(),
        category: entry.type === 'expense' ? category : null,
        reference: reference.trim() || null,
        edited_at: data.entry?.edited_at ?? new Date().toISOString(),
      })
    } catch { setError('Network error') }
    finally   { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 font-semibold uppercase">Amount £</label>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
        </div>
        {entry.type === 'expense' && (
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold uppercase">Description</label>
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
          className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold uppercase">Reference <span className="font-normal normal-case">(opt)</span></label>
        <input type="text" value={reference} onChange={e => setReference(e.target.value)}
          className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-1 h-9 rounded-xl bg-[#16205B] text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98]">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel}
          className="h-9 px-4 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Cash Tab ─────────────────────────────────────────────────────────────────

function CashTab({ role }: { role: string }) {
  const now   = new Date()
  const [year,       setYear]       = useState(now.getFullYear())
  const [month,      setMonth]      = useState(now.getMonth() + 1)
  const [monthData,  setMonthData]  = useState<MonthData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [selectedDay, setDay]       = useState<number | null>(null)
  const [addType,    setAddType]    = useState<'income'|'expense'|null>(null)
  const [openBal,    setOpenBal]    = useState('')
  const [creating,   setCreating]   = useState(false)
  const [locking,    setLocking]    = useState(false)
  const [editEntry,  setEditEntry]  = useState<CashEntry | null>(null)
  const isAdmin = role === 'admin'

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const loadMonth = useCallback(async () => {
    setLoading(true); setDay(null); setAddType(null)
    try {
      const res = await fetch(`/api/cash/month?year=${year}&month=${month}`)
      const data = await res.json()
      setMonthData(data)
    } catch { setMonthData(null) }
    finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { loadMonth() }, [loadMonth])

  function navigate(dir: -1 | 1) {
    let m = month + dir, y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    // Don't allow future months
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return
    setMonth(m); setYear(y)
  }

  async function createMonth() {
    if (!isAdmin) return
    const body: Record<string, unknown> = { year, month }
    if (monthData?.isFirst) {
      if (!openBal || isNaN(parseFloat(openBal))) return
      body.opening_balance = parseFloat(openBal)
    }
    setCreating(true)
    try {
      const res  = await fetch('/api/cash/month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.ok) setMonthData({ exists: true, month: data.month, entries: [], summary: data.summary })
    } finally { setCreating(false) }
  }

  async function toggleLock() {
    if (!monthData?.month || !isAdmin) return
    setLocking(true)
    try {
      const res = await fetch(`/api/cash/month/${monthData.month.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: !monthData.month.is_locked }),
      })
      if (res.ok) {
        const data = await res.json()
        setMonthData(prev => prev ? { ...prev, month: data.month } : prev)
      }
    } finally { setLocking(false) }
  }

  async function deleteEntry(id: string) {
    if (!window.confirm('Delete this entry?')) return
    const res = await fetch(`/api/cash/entry/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMonthData(prev => {
        if (!prev?.entries) return prev
        const entries  = prev.entries.filter(e => e.id !== id)
        const totalIn  = entries.filter(e => e.type === 'income').reduce((s, e)  => s + e.amount, 0)
        const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
        const opening  = prev.summary?.opening ?? 0
        return { ...prev, entries, summary: { opening, total_income: totalIn, total_expense: totalOut, closing: opening + totalIn - totalOut } }
      })
    }
  }

  function onEntrySaved(entry: CashEntry) {
    setAddType(null)
    setMonthData(prev => {
      if (!prev?.entries) return prev
      const entries  = [...prev.entries, entry].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))
      const totalIn  = entries.filter(e => e.type === 'income').reduce((s, e)  => s + e.amount, 0)
      const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
      const opening  = prev.summary?.opening ?? 0
      return { ...prev, entries, summary: { opening, total_income: totalIn, total_expense: totalOut, closing: opening + totalIn - totalOut } }
    })
  }

  // Calendar data
  const totalDays  = daysInMonth(year, month)
  const firstDay   = firstWeekday(year, month)
  const summary    = monthData?.summary

  const entriesByDay = useMemo(() => {
    const map = new Map<number, CashEntry[]>()
    for (const e of monthData?.entries ?? []) {
      const d = parseInt(e.entry_date.slice(8, 10), 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(e)
    }
    return map
  }, [monthData?.entries])

  const dailyNet = useMemo(() => {
    const map = new Map<number, number>()
    for (const [d, entries] of entriesByDay) {
      map.set(d, entries.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0))
    }
    return map
  }, [entriesByDay])

  const canAdd = monthData?.exists && !monthData.month?.is_locked && (isAdmin || isCurrentMonth)
  const dayEntries = selectedDay ? (entriesByDay.get(selectedDay) ?? []) : []
  const todayDay   = isCurrentMonth ? now.getDate() : null

  const isFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)

  return (
    <div className="pb-28">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#EDEAE1]">
        <button type="button" onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 0 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd"/>
          </svg>
        </button>
        <span className="text-sm font-bold text-[#16205B]">{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" onClick={() => navigate(1)} disabled={isFutureMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="max-w-lg mx-auto px-3 py-3 space-y-3">

          {/* Summary bar */}
          {monthData?.exists && summary && (
            <div className="bg-[#16205B] rounded-2xl p-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Opening',  value: summary.opening,       colour: 'text-white/60' },
                  { label: 'Income',   value: summary.total_income,  colour: 'text-green-400' },
                  { label: 'Expense',  value: summary.total_expense, colour: 'text-red-400' },
                  { label: 'Closing',  value: summary.closing,       colour: summary.closing >= 0 ? 'text-[#EB6619]' : 'text-red-400' },
                ].map(({ label, value, colour }) => (
                  <div key={label}>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{label}</p>
                    <p className={`text-lg font-bold leading-tight ${colour}`}>{fmt(value)}</p>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                  <button type="button" onClick={toggleLock} disabled={locking}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors">
                    {monthData.month?.is_locked
                      ? <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd"/></svg> Unlock month</>
                      : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M11.5 1A3.5 3.5 0 0 0 8 4.5V7H3.5A1.5 1.5 0 0 0 2 8.5v5A1.5 1.5 0 0 0 3.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 10.5 7h-1V4.5a2 2 0 1 1 4 0v1a.75.75 0 0 0 1.5 0v-1A3.5 3.5 0 0 0 11.5 1Z"/></svg> Lock month</>
                    }
                  </button>
                  <a href={`/api/cash/export?type=cash&year=${year}&month=${month}`}
                    className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/></svg>
                    Export CSV
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Month not started */}
          {!monthData?.exists && !isAdmin && (
            <div className="bg-white rounded-2xl border border-[#EDEAE1] p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">Month not yet started</p>
              <p className="text-xs text-gray-400 mt-1">Waiting for admin to set opening balance</p>
            </div>
          )}

          {/* Admin: start month */}
          {!monthData?.exists && isAdmin && (
            <div className="bg-white rounded-2xl border border-[#EDEAE1] p-4">
              <p className="text-sm font-bold text-[#16205B] mb-3">
                {monthData?.isFirst ? 'Set opening balance to start' : `Start ${MONTH_NAMES[month-1]} ${year}`}
              </p>
              {monthData?.isFirst ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 font-semibold">Opening Balance £</label>
                    <input type="number" min="0" step="0.01" value={openBal} onChange={e => setOpenBal(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] mt-1"/>
                  </div>
                  <button type="button" onClick={createMonth} disabled={creating || !openBal}
                    className="w-full h-10 rounded-xl bg-[#16205B] text-white text-sm font-bold disabled:opacity-40">
                    {creating ? 'Creating…' : 'Start Cash Reconciliation'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Opening balance will auto-carry from {MONTH_NAMES[month === 1 ? 11 : month - 2]} closing balance
                    {monthData?.suggestedOpening != null && `: ${fmt(monthData.suggestedOpening)}`}
                  </p>
                  <button type="button" onClick={createMonth} disabled={creating}
                    className="w-full h-10 rounded-xl bg-[#16205B] text-white text-sm font-bold disabled:opacity-40">
                    {creating ? 'Creating…' : `Start ${MONTH_NAMES[month-1]}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Calendar */}
          {monthData?.exists && (
            <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-[#EDEAE1]">
                {['M','T','W','T','F','S','S'].map((d, i) => (
                  <div key={i} className="py-1.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">{d}</div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} className="h-14 border-b border-r border-gray-50 last:border-r-0"/>
                ))}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1
                  const net = dailyNet.get(day)
                  const count = entriesByDay.get(day)?.length ?? 0
                  const isToday    = day === todayDay
                  const isSelected = day === selectedDay
                  const colPos = (firstDay + i) % 7
                  return (
                    <button key={day} type="button"
                      onClick={() => { setDay(selectedDay === day ? null : day); setAddType(null) }}
                      className={[
                        'h-14 flex flex-col items-center justify-start pt-1.5 gap-0.5 border-b border-r border-gray-50 last:border-r-0 transition-colors',
                        colPos === 6 ? 'border-r-0' : '',
                        isSelected ? 'bg-[#16205B]/5' : 'hover:bg-gray-50',
                      ].join(' ')}>
                      <span className={`text-xs font-bold leading-none w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-[#EB6619] text-white' :
                        isSelected ? 'text-[#16205B]' : 'text-gray-600'
                      }`}>{day}</span>
                      {net != null && (
                        <span className={`text-[9px] font-bold leading-none ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {net >= 0 ? '+' : ''}{fmt(net)}
                        </span>
                      )}
                      {count > 0 && net == null && (
                        <span className="w-1 h-1 rounded-full bg-gray-300"/>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Day panel */}
          {selectedDay && monthData?.exists && (
            <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EDEAE1] flex items-center justify-between">
                <p className="text-sm font-bold text-[#16205B]">
                  {selectedDay} {MONTH_NAMES[month-1]} {year}
                </p>
                {monthData.month?.is_locked && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">🔒 Locked</span>
                )}
              </div>
              <div className="px-4 py-2">
                {dayEntries.length === 0 && !addType && (
                  <p className="text-xs text-gray-400 py-3 text-center">No entries for this day</p>
                )}
                {dayEntries.map(e => (
                  <EntryRow key={e.id} entry={e} isAdmin={isAdmin}
                    onDelete={deleteEntry}
                    onEdit={setEditEntry}
                  />
                ))}
                {addType && monthData.month && (
                  <AddEntryForm type={addType} monthId={monthData.month.id}
                    onSaved={onEntrySaved} onCancel={() => setAddType(null)}/>
                )}
                {canAdd && !addType && (
                  <div className="flex gap-2 pt-2 pb-1">
                    <button type="button" onClick={() => setAddType('income')}
                      className="flex-1 h-9 rounded-xl border-2 border-green-200 text-green-700 text-xs font-bold hover:bg-green-50 transition-colors">
                      + Income
                    </button>
                    <button type="button" onClick={() => setAddType('expense')}
                      className="flex-1 h-9 rounded-xl border-2 border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors">
                      - Expense
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Admin edit entry modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={e => e.target === e.currentTarget && setEditEntry(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl">
            <p className="text-sm font-bold text-[#16205B] mb-4">Edit Entry</p>
            <EditEntryForm
              entry={editEntry}
              onSaved={(updated) => {
                setEditEntry(null)
                setMonthData(prev => {
                  if (!prev?.entries) return prev
                  const entries  = prev.entries.map(e => e.id === updated.id ? { ...e, ...updated } : e)
                  const totalIn  = entries.filter(e => e.type === 'income').reduce((s, e)  => s + e.amount, 0)
                  const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
                  const opening  = prev.summary?.opening ?? 0
                  return { ...prev, entries, summary: { opening, total_income: totalIn, total_expense: totalOut, closing: opening + totalIn - totalOut } }
                })
              }}
              onCancel={() => setEditEntry(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Cheques Tab ──────────────────────────────────────────────────────────────

function ChequesTab({ role }: { role: string }) {
  const [cheques,        setCheques]        = useState<ChequeRecord[]>([])
  const [loading,        setLoading]        = useState(true)
  const [filter,         setFilter]         = useState<CheqFilter>('unconfirmed')
  const [showForm,       setShowForm]       = useState(false)
  const [customers,      setCustomers]      = useState<{ id: string; name: string }[]>([])
  const [drivers,        setDrivers]        = useState<{ id: string; name: string }[]>([])
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [pendingCount,   setPendingCount]   = useState(0)
  const isAdmin = role === 'admin'

  // Form state
  const [fDate,    setFDate]    = useState(todayISO())
  const [fCust,    setFCust]    = useState('')
  const [fAmount,  setFAmount]  = useState('')
  const [fDriver,  setFDriver]  = useState('')
  const [fCheqNo,  setFCheqNo]  = useState('')
  const [fNotes,   setFNotes]   = useState('')

  async function loadCheques() {
    setLoading(true)
    try {
      const [listRes, pendingRes] = await Promise.all([
        fetch(`/api/cash/cheques?status=${filter}`),
        fetch('/api/cash/cheques?status=unconfirmed'),
      ])
      const data    = await listRes.json()
      const pending = await pendingRes.json()
      setCheques(Array.isArray(data) ? data : [])
      setPendingCount(Array.isArray(pending) ? pending.length : 0)
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    const [custRes, drvRes] = await Promise.all([
      fetch('/api/routes/customers'),
      fetch('/api/routes/users'),
    ])
    const custs = await custRes.json().catch(() => [])
    const drvs  = await drvRes.json().catch(() => [])
    setCustomers(Array.isArray(custs) ? custs.map((c: Record<string,unknown>) => ({ id: String(c.id), name: String(c.name) })) : [])
    setDrivers(Array.isArray(drvs) ? drvs.filter((u: Record<string,unknown>) => u.role === 'driver').map((u: Record<string,unknown>) => ({ id: String(u.id), name: String(u.name) })) : [])
  }

  useEffect(() => { loadCheques() }, [filter]) // eslint-disable-line
  useEffect(() => { loadRefs() }, [])

  async function confirm(id: string) {
    const res = await fetch(`/api/cash/cheques/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    })
    if (res.ok) loadCheques()
  }

  async function deleteCheque(id: string) {
    if (!window.confirm('Delete this cheque record?')) return
    const res = await fetch(`/api/cash/cheques/${id}`, { method: 'DELETE' })
    if (res.ok) setCheques(prev => prev.filter(c => c.id !== id))
  }

  async function submitCheque() {
    if (!fDate || !fCust || !fAmount || !fDriver) { setError('All fields required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/cash/cheques', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: fDate, customer_id: fCust, amount: parseFloat(fAmount),
          driver_id: fDriver, cheque_number: fCheqNo || null, notes: fNotes || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setShowForm(false)
      setFDate(todayISO()); setFCust(''); setFAmount(''); setFDriver(''); setFCheqNo(''); setFNotes('')
      loadCheques()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div className="pb-28 max-w-lg mx-auto px-3 py-3 space-y-3">

      {/* Header actions */}
      <div className="flex items-center gap-2">
        <div className="flex bg-white rounded-xl border border-[#EDEAE1] p-0.5 gap-0.5">
          {(['unconfirmed', 'all', 'confirmed'] as CheqFilter[]).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f ? 'bg-[#16205B] text-white' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f === 'unconfirmed' ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` : f === 'all' ? 'All' : 'Confirmed'}
            </button>
          ))}
        </div>
        {isAdmin && (
          <a href={`/api/cash/export?type=cheques&from=${new Date().toISOString().slice(0,7)}-01&to=${todayISO()}`}
            className="ml-auto p-2 rounded-xl border border-[#EDEAE1] bg-white text-gray-400 hover:text-[#16205B] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/>
            </svg>
          </a>
        )}
        <button type="button" onClick={() => setShowForm(v => !v)}
          className="h-9 px-4 rounded-xl bg-[#16205B] text-white text-xs font-bold hover:bg-[#1e2d6b] transition-colors">
          {showForm ? 'Cancel' : '+ Log Cheque'}
        </button>
      </div>

      {/* Log cheque form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-[#EDEAE1] p-4 space-y-3">
          <p className="text-sm font-bold text-[#16205B]">Log Cheque Received</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 font-semibold uppercase">Date</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-semibold uppercase">Amount £</label>
              <input type="number" min="0.01" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} placeholder="0.00"
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Customer</label>
            <select value={fCust} onChange={e => setFCust(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Driver who collected</label>
            <select value={fDriver} onChange={e => setFDriver(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
              <option value="">Select driver…</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 font-semibold uppercase">Cheque no. <span className="font-normal normal-case">(opt)</span></label>
              <input type="text" value={fCheqNo} onChange={e => setFCheqNo(e.target.value)} placeholder="e.g. 001234"
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-semibold uppercase">Notes <span className="font-normal normal-case">(opt)</span></label>
              <input type="text" value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Any notes"
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="button" onClick={submitCheque} disabled={saving}
            className="w-full h-10 rounded-xl bg-[#16205B] text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98]">
            {saving ? 'Saving…' : 'Log Cheque'}
          </button>
        </div>
      )}

      {/* Cheque list */}
      {loading ? <Spinner /> : cheques.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EDEAE1] p-6 text-center">
          <p className="text-sm text-gray-400">
            {filter === 'unconfirmed' ? 'No pending cheques' : filter === 'confirmed' ? 'No confirmed cheques' : 'No cheques logged'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cheques.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-[#EDEAE1] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base font-bold text-[#16205B]">{fmt(c.amount)}</span>
                    {c.cheque_number && (
                      <span className="text-[10px] text-gray-400 font-mono">#{c.cheque_number}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.customer?.name ?? '—'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {fmtDate(c.date)} · Driver: {c.driver?.name ?? '—'} · Logged by {c.logged_by_name}
                  </p>
                  {c.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{c.notes}</p>}
                </div>
                {isAdmin && (
                  <button type="button" onClick={() => deleteCheque(c.id)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Confirmation */}
              <div className="mt-3 pt-3 border-t border-gray-50">
                {c.confirmed_at ? (
                  <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/>
                    </svg>
                    Confirmed by {c.confirmed_by_name} · {fmtTime(c.confirmed_at)}
                  </p>
                ) : (
                  <button type="button" onClick={() => confirm(c.id)}
                    className="w-full h-9 rounded-xl border-2 border-[#16205B]/20 text-[#16205B] text-xs font-bold hover:bg-[#16205B]/5 transition-colors flex items-center justify-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/>
                    </svg>
                    Confirm receipt of cheque
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CashPage() {
  const [tab,  setTab]  = useState<Tab>('cash')
  const [role, setRole] = useState('')

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)
    setRole(match?.[1] ?? '')
  }, [])

  return (
    <div className="min-h-screen bg-[#EDEAE1]">
      <AppHeader title="Cash & Cheques" />

      {/* Tab bar */}
      <div className="bg-white border-b border-[#EDEAE1]">
        <div className="max-w-lg mx-auto flex">
          {([['cash','💷 Cash'],['cheques','📋 Cheques']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={[
                'flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors border-b-2',
                tab === t ? 'border-[#EB6619] text-[#EB6619]' : 'border-transparent text-gray-400 hover:text-gray-600',
              ].join(' ')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'cash'    && <CashTab    role={role} />}
      {tab === 'cheques' && <ChequesTab role={role} />}

      <RoleNav />
    </div>
  )
}
