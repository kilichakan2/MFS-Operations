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
  customer_name: string | null
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
  created_at: string; banked: boolean; banked_at: string | null
  customer: { id: string; name: string } | null
  customer_name: string | null
  driver:   { id: string; name: string } | null
  logged_by_name: string; banked_by_name: string | null
}

type Tab        = 'cash' | 'cheques'
type CheqFilter = 'all' | 'not_banked' | 'banked'

const EXPENSE_CATEGORIES = ['Fuel','Supplies','Wages','Petty cash','Equipment','Other']
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function todayISO() { return new Date().toISOString().slice(0, 10) }

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

// ─── Add Entry form ───────────────────────────────────────────────────────────

function AddEntryForm({ type, monthId, onSaved, onCancel, customers }: {
  type: 'income' | 'expense'; monthId: string
  onSaved: (entry: CashEntry) => void; onCancel: () => void
  customers: { id: string; name: string }[]
}) {
  const [date,        setDate]        = useState(todayISO())
  const [amount,      setAmount]      = useState('')
  const [desc,        setDesc]        = useState('')
  const [category,    setCategory]    = useState(EXPENSE_CATEGORIES[0])
  const [reference,   setReference]   = useState('')
  const [customerId,  setCustomerId]  = useState('')
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
          customer_id: (type === 'income' && customerId) ? customerId : null,
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
    <div className={`p-3 rounded-xl border-2 ${isIncome ? 'border-green-200 bg-green-50/50' : 'border-orange-200 bg-orange-50/30'}`}>
      <p className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
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
        {type === 'income' && customers.length > 0 && (
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">Customer <span className="font-normal normal-case">(opt)</span></label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
              <option value="">No specific customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[10px] text-gray-500 font-semibold uppercase">Description</label>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this for?"
            className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase">
              Ref <span className="font-normal normal-case">(opt)</span>
            </label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="INV-001"
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
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [monthData, setMonthData] = useState<MonthData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [addType,   setAddType]   = useState<'income'|'expense'|null>(null)
  const [openBal,   setOpenBal]   = useState('')
  const [creating,  setCreating]  = useState(false)
  const [locking,   setLocking]   = useState(false)
  const [editEntry, setEditEntry] = useState<CashEntry | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const isAdmin = role === 'admin'

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  // Admin can navigate one month ahead (to set up next month)
  // Office is capped at current month
  const maxFutureMonths = isAdmin ? 1 : 0
  const limitDate = new Date(now.getFullYear(), now.getMonth() + maxFutureMonths + 1, 1)
  const viewDate  = new Date(year, month - 1, 1)
  const isFutureMonth = viewDate >= limitDate

  const loadMonth = useCallback(async () => {
    setLoading(true); setAddType(null)
    try {
      const res  = await fetch(`/api/cash/month?year=${year}&month=${month}`)
      const data = await res.json()
      setMonthData(data)
    } catch { setMonthData(null) }
    finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { loadMonth() }, [loadMonth])

  useEffect(() => {
    fetch('/api/routes/customers')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.customers ?? [])
        setCustomers(list.map((c: Record<string,unknown>) => ({ id: String(c.id), name: String(c.name) })))
      })
      .catch(() => {})
  }, [])

  function navigate(dir: -1 | 1) {
    let m = month + dir, y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    const _limit = new Date(now.getFullYear(), now.getMonth() + maxFutureMonths + 1, 1)
    if (new Date(y, m - 1, 1) >= _limit) return
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
      const res  = await fetch(`/api/cash/month/${monthData.month.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: !monthData.month.is_locked }),
      })
      if (res.ok) { const d = await res.json(); setMonthData(prev => prev ? { ...prev, month: d.month } : prev) }
    } finally { setLocking(false) }
  }

  async function deleteEntry(id: string) {
    if (!window.confirm('Delete this entry?')) return
    const res = await fetch(`/api/cash/entry/${id}`, { method: 'DELETE' })
    if (res.ok) recomputeAfterDelete(id)
  }

  function recomputeAfterDelete(id: string) {
    setMonthData(prev => {
      if (!prev?.entries) return prev
      const entries  = prev.entries.filter(e => e.id !== id)
      return recalc(prev, entries)
    })
  }

  function onEntrySaved(entry: CashEntry) {
    setAddType(null)
    setMonthData(prev => {
      if (!prev?.entries) return prev
      const entries = [...prev.entries, entry].sort((a, b) =>
        a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))
      return recalc(prev, entries)
    })
  }

  function recalc(prev: MonthData, entries: CashEntry[]): MonthData {
    const totalIn  = entries.filter(e => e.type === 'income').reduce((s, e)  => s + e.amount, 0)
    const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    const opening  = prev.summary?.opening ?? 0
    return { ...prev, entries, summary: { opening, total_income: totalIn, total_expense: totalOut, closing: opening + totalIn - totalOut } }
  }

  const canAdd = monthData?.exists && !monthData.month?.is_locked && (isAdmin || isCurrentMonth)
  const summary = monthData?.summary

  // Compute running balance for each entry (always oldest→newest)
  const entriesWithBalance = useMemo(() => {
    const entries = [...(monthData?.entries ?? [])].sort((a, b) =>
      a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))
    let bal = summary?.opening ?? 0
    return entries.map(e => {
      bal += e.type === 'income' ? e.amount : -e.amount
      return { ...e, runningBalance: bal }
    })
  }, [monthData?.entries, summary?.opening])

  // Office: newest first. Admin: oldest first.
  const displayEntries = useMemo(() =>
    isAdmin ? entriesWithBalance : [...entriesWithBalance].reverse(),
    [entriesWithBalance, isAdmin])

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
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Opening',  value: summary.opening,       colour: 'text-white/60' },
                  { label: 'In',       value: summary.total_income,  colour: 'text-green-400' },
                  { label: 'Out',      value: summary.total_expense, colour: 'text-red-400' },
                  { label: 'Balance',  value: summary.closing,       colour: summary.closing >= 0 ? 'text-[#EB6619]' : 'text-red-400' },
                ].map(({ label, value, colour }) => (
                  <div key={label}>
                    <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">{label}</p>
                    <p className={`text-sm font-bold leading-tight ${colour}`}>{fmt(value)}</p>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
                  <button type="button" onClick={toggleLock} disabled={locking}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors">
                    {monthData.month?.is_locked
                      ? <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd"/></svg> Unlock</>
                      : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M11.5 1A3.5 3.5 0 0 0 8 4.5V7H3.5A1.5 1.5 0 0 0 2 8.5v5A1.5 1.5 0 0 0 3.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 10.5 7h-1V4.5a2 2 0 1 1 4 0v1a.75.75 0 0 0 1.5 0v-1A3.5 3.5 0 0 0 11.5 1Z"/></svg> Lock</>
                    }
                  </button>
                  {monthData.month?.is_locked && (
                    <span className="text-[10px] text-amber-400 font-semibold">🔒 Locked — no new entries</span>
                  )}
                  <a href={`/api/cash/export?type=cash&year=${year}&month=${month}`}
                    className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/></svg>
                    Export CSV
                  </a>
                </div>
              )}
              {!isAdmin && monthData.month?.is_locked && (
                <p className="mt-3 pt-3 border-t border-white/10 text-[10px] text-amber-400 font-semibold">🔒 This month is locked</p>
              )}
            </div>
          )}

          {/* Month not started — office view */}
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
                    Opening balance carries forward from {MONTH_NAMES[month === 1 ? 11 : month - 2]}
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

          {/* Add entry buttons + form — always visible at top when canAdd */}
          {canAdd && !addType && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setAddType('income')}
                className="flex-1 h-10 rounded-xl border-2 border-green-200 bg-white text-green-700 text-sm font-bold hover:bg-green-50 transition-colors flex items-center justify-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/></svg>
                Add Income
              </button>
              <button type="button" onClick={() => setAddType('expense')}
                className="flex-1 h-10 rounded-xl border-2 border-red-200 bg-white text-red-600 text-sm font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M3.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"/></svg>
                Add Expense
              </button>
            </div>
          )}

          {addType && monthData?.month && (
            <AddEntryForm type={addType} monthId={monthData.month.id} customers={customers}
              onSaved={onEntrySaved} onCancel={() => setAddType(null)}/>
          )}

          {/* Statement */}
          {monthData?.exists && (
            <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">

              {/* Admin: opening balance at top (oldest first) */}
              {isAdmin && summary && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-[#EDEAE1]">
                  <span className="text-xs font-semibold text-gray-500">Opening balance</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(summary.opening)}</span>
                </div>
              )}

              {displayEntries.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No entries yet — add income or expenses above</p>
              ) : (
                displayEntries.map((entry) => {
                  const isIncome = entry.type === 'income'
                  return (
                    <div key={entry.id} className="border-b border-gray-50 last:border-0 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                      <div className="flex items-start gap-3">
                        {/* IN/OUT badge */}
                        <span className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {isIncome ? 'IN' : 'OUT'}
                        </span>

                        {/* Description + meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{entry.description}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-[11px] text-gray-400">{fmtDate(entry.entry_date)}</span>
                            {entry.customer_name && (
                              <span className="text-[10px] font-semibold text-[#16205B]/70">{entry.customer_name}</span>
                            )}
                            {entry.category && (
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-px rounded font-medium">{entry.category}</span>
                            )}
                            {entry.reference && (
                              <span className="text-[10px] text-gray-400">#{entry.reference}</span>
                            )}
                            {entry.signed_url && (
                              <a href={entry.signed_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-[#16205B] hover:text-[#EB6619] flex items-center gap-0.5">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5">
                                  <path d="M2 2.5A.5.5 0 0 1 2.5 2h4.379a.5.5 0 0 1 .354.146l2.621 2.621A.5.5 0 0 1 10 5.121V9.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-7Z"/>
                                </svg>
                                {entry.attachment_name ?? 'Attachment'}
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Amount + running balance */}
                        <div className="text-right flex-shrink-0 min-w-[80px]">
                          <p className={`text-sm font-bold ${isIncome ? 'text-green-700' : 'text-red-600'}`}>
                            {isIncome ? '+' : '-'}{fmt(entry.amount)}
                          </p>
                          <p className="text-[11px] text-gray-400 font-medium">{fmt((entry as CashEntry & { runningBalance: number }).runningBalance)}</p>
                        </div>

                        {/* Admin controls */}
                        {isAdmin && (
                          <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                            <button type="button" onClick={() => setEditEntry(entry)}
                              className="p-1 rounded text-gray-300 hover:text-[#16205B] hover:bg-gray-100 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 13.25H2.75a.75.75 0 0 1 0-1.5h2a.75.75 0 0 1 0 1.5Z"/>
                              </svg>
                            </button>
                            <button type="button" onClick={() => deleteEntry(entry.id)}
                              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}

              {/* Office: opening balance at bottom (newest first) */}
              {!isAdmin && summary && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-[#EDEAE1]">
                  <span className="text-xs font-semibold text-gray-500">Opening balance</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(summary.opening)}</span>
                </div>
              )}

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
                  const entries = prev.entries.map(e => e.id === updated.id ? { ...e, ...updated } : e)
                  return recalc(prev, entries)
                })
              }}
              onCancel={() => setEditEntry(null)}
            />
          </div>
        </div>
      )}
    </div>
  )

  // Nested helper so it has access to summary
  function recalc(prev: MonthData, entries: CashEntry[]): MonthData {
    const totalIn  = entries.filter(e => e.type === 'income').reduce((s, e)  => s + e.amount, 0)
    const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    const opening  = prev.summary?.opening ?? 0
    return { ...prev, entries, summary: { opening, total_income: totalIn, total_expense: totalOut, closing: opening + totalIn - totalOut } }
  }
}

// ─── Cheques Tab ──────────────────────────────────────────────────────────────

function ChequesTab({ role }: { role: string }) {
  const [cheques,       setCheques]       = useState<ChequeRecord[]>([])
  const [loading,       setLoading]       = useState(true)
  const [filter,        setFilter]        = useState<CheqFilter>('not_banked')
  const [showForm,      setShowForm]      = useState(false)
  const [customers,     setCustomers]     = useState<{ id: string; name: string }[]>([])
  const [drivers,       setDrivers]       = useState<{ id: string; name: string }[]>([])
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [notBankedCount, setNotBankedCount] = useState(0)
  const isAdmin = role === 'admin'

  // Form state
  const [fDate,       setFDate]       = useState(todayISO())
  const [fCustId,     setFCustId]     = useState('')
  const [fCustManual, setFCustManual] = useState('')
  const [useManual,   setUseManual]   = useState(false)
  const [fAmount,     setFAmount]     = useState('')
  const [fDriver,     setFDriver]     = useState('')
  const [fCheqNo,     setFCheqNo]     = useState('')
  const [fNotes,      setFNotes]      = useState('')

  async function loadCheques() {
    setLoading(true)
    try {
      const [listRes, countRes] = await Promise.all([
        fetch(`/api/cash/cheques?status=${filter}`),
        fetch('/api/cash/cheques?status=not_banked'),
      ])
      const listData  = await listRes.json()
      const countData = await countRes.json()
      setCheques(Array.isArray(listData) ? listData : [])
      setNotBankedCount(Array.isArray(countData) ? countData.length : 0)
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    try {
      const [custRes, drvRes] = await Promise.all([
        fetch('/api/routes/customers'),
        fetch('/api/routes/users'),
      ])
      const custData = await custRes.json().catch(() => ({}))
      const drvData  = await drvRes.json().catch(() => ({}))

      // Both APIs return wrapped objects: { customers: [...] } and { users: [...] }
      const custList = Array.isArray(custData) ? custData : (custData.customers ?? [])
      const drvList  = Array.isArray(drvData)  ? drvData  : (drvData.users  ?? [])

      setCustomers(custList.map((c: Record<string,unknown>) => ({ id: String(c.id), name: String(c.name) })))
      setDrivers(drvList
        .filter((u: Record<string,unknown>) => u.role === 'driver')
        .map((u: Record<string,unknown>) => ({ id: String(u.id), name: String(u.name) })))
    } catch { /* refs optional */ }
  }

  useEffect(() => { loadCheques() }, [filter]) // eslint-disable-line
  useEffect(() => { loadRefs() }, [])

  async function markBanked(id: string) {
    const res = await fetch(`/api/cash/cheques/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bank' }),
    })
    if (res.ok) loadCheques()
  }

  async function deleteCheque(id: string) {
    if (!window.confirm('Delete this cheque record?')) return
    const res = await fetch(`/api/cash/cheques/${id}`, { method: 'DELETE' })
    if (res.ok) setCheques(prev => prev.filter(c => c.id !== id))
  }

  async function submitCheque() {
    const custId   = useManual ? null : fCustId
    const custName = useManual ? fCustManual.trim() : null

    if (!fDate || (!custId && !custName) || !fAmount || !fDriver) {
      setError('Date, customer, amount and driver are required')
      return
    }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/cash/cheques', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:          fDate,
          customer_id:   custId   || undefined,
          customer_name: custName || undefined,
          amount:        parseFloat(fAmount),
          driver_id:     fDriver,
          cheque_number: fCheqNo  || null,
          notes:         fNotes   || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setShowForm(false)
      setFDate(todayISO()); setFCustId(''); setFCustManual(''); setUseManual(false)
      setFAmount(''); setFDriver(''); setFCheqNo(''); setFNotes('')
      loadCheques()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  function custDisplay(c: ChequeRecord) {
    return c.customer?.name ?? c.customer_name ?? '—'
  }

  return (
    <div className="pb-28 max-w-lg mx-auto px-3 py-3 space-y-3">

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex bg-white rounded-xl border border-[#EDEAE1] p-0.5 gap-0.5">
          {(['not_banked','all','banked'] as CheqFilter[]).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f ? 'bg-[#16205B] text-white' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f === 'not_banked' ? `Not Banked${notBankedCount > 0 ? ` (${notBankedCount})` : ''}` : f === 'all' ? 'All' : 'Banked'}
            </button>
          ))}
        </div>
        {isAdmin && (
          <a href={`/api/cash/export?type=cheques&from=${new Date().toISOString().slice(0,7)}-01&to=${todayISO()}`}
            className="p-2 rounded-xl border border-[#EDEAE1] bg-white text-gray-400 hover:text-[#16205B] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/>
            </svg>
          </a>
        )}
        <button type="button" onClick={() => setShowForm(v => !v)}
          className="h-9 px-4 rounded-xl bg-[#16205B] text-white text-xs font-bold hover:bg-[#1e2d6b] transition-colors ml-auto">
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

          {/* Customer — dropdown or manual */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500 font-semibold uppercase">Customer</label>
              <button type="button" onClick={() => { setUseManual(v => !v); setFCustId(''); setFCustManual('') }}
                className="text-[10px] text-[#EB6619] font-semibold hover:underline">
                {useManual ? '← Back to list' : 'Not in list? Enter manually'}
              </button>
            </div>
            {useManual ? (
              <input type="text" value={fCustManual} onChange={e => setFCustManual(e.target.value)}
                placeholder="Type customer name…"
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"/>
            ) : (
              <select value={fCustId} onChange={e => setFCustId(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Driver */}
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
            {filter === 'not_banked' ? 'No unbanked cheques' : filter === 'banked' ? 'No banked cheques' : 'No cheques logged'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cheques.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-[#EDEAE1] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base font-bold text-[#16205B]">{fmt(c.amount)}</span>
                    {c.cheque_number && (
                      <span className="text-[10px] text-gray-400 font-mono">#{c.cheque_number}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">{custDisplay(c)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {fmtDate(c.date)} · Driver: {c.driver?.name ?? '—'} · Logged by {c.logged_by_name}
                  </p>
                  {c.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{c.notes}</p>}
                </div>
                {isAdmin && (
                  <button type="button" onClick={() => deleteCheque(c.id)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50">
                {c.banked ? (
                  <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/>
                    </svg>
                    Banked by {c.banked_by_name} · {c.banked_at ? fmtTime(c.banked_at) : ''}
                  </p>
                ) : (
                  <button type="button" onClick={() => markBanked(c.id)}
                    className="w-full h-9 rounded-xl border-2 border-[#16205B]/20 text-[#16205B] text-xs font-bold hover:bg-[#16205B]/5 transition-colors flex items-center justify-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/>
                    </svg>
                    Mark as banked
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
