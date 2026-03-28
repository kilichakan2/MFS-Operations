'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, useId, useEffect, useMemo } from 'react'
import BottomSheetSelector from '@/components/BottomSheetSelector'
import RoleNav             from '@/components/RoleNav'
import { useLanguage }     from '@/lib/LanguageContext'
import AppHeader           from '@/components/AppHeader'
import { useCustomers }    from '@/hooks/useReferenceData'
import { localDb, syncReferenceData } from '@/lib/localDb'
import { triggerSync }     from '@/lib/syncEngine'
import type { SelectableItem } from '@/components/BottomSheetSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category    = 'weight'|'quality'|'delivery'|'missing_item'|'pricing'|'service'|'other'
type ReceivedVia = 'phone'|'in_person'|'whatsapp'|'email'|'other'
type Status      = 'open'|'resolved'
type TimeChip    = 'today'|'yesterday'|'this_week'|'this_month'|'all_time'

interface FormState {
  customer:       SelectableItem | null
  category:       Category | null
  description:    string
  receivedVia:    ReceivedVia | null
  status:         Status | null
  resolutionNote: string
}
const EMPTY_FORM: FormState = {
  customer: null, category: null, description: '',
  receivedVia: null, status: null, resolutionNote: '',
}

interface ComplaintRow {
  id:          string
  createdAt:   string
  category:    string
  description: string
  customer:    string
  loggedBy:    string
  status:      Status
  resolutionNote?: string | null
  resolvedBy?:     string | null
  resolvedAt?:     string | null
}

interface ValidationErrors {
  customer?: string; category?: string; description?: string
  receivedVia?: string; status?: string; resolutionNote?: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

function CATEGORIES(t: (k:string)=>string) {
  return [
    { value:'weight',       label:t('weight')       },
    { value:'quality',      label:t('quality')      },
    { value:'delivery',     label:t('delivery')     },
    { value:'missing_item', label:t('missingItem')  },
    { value:'pricing',      label:t('pricing')      },
    { value:'service',      label:t('service')      },
    { value:'other',        label:t('other')        },
  ]
}
function RECEIVED_VIA(t: (k:string)=>string) {
  return [
    { value:'phone',      label:t('phone')    },
    { value:'in_person',  label:t('inPerson') },
    { value:'whatsapp',   label:t('whatsapp') },
    { value:'email',      label:t('email')    },
    { value:'other',      label:t('other')    },
  ]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr()  { return new Date().toLocaleDateString('en-CA') }
function addDaysStr(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}
function getMondayStr(dateStr: string) {
  const d   = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d.toLocaleDateString('en-CA')
}
function getFirstOfMonthStr(dateStr: string) {
  return dateStr.slice(0, 8) + '01'
}
function chipToRange(chip: TimeChip): { from: string; to: string } | null {
  const today = todayStr()
  switch (chip) {
    case 'today':      return { from: today, to: today }
    case 'yesterday':  return { from: addDaysStr(today, -1), to: addDaysStr(today, -1) }
    case 'this_week':  return { from: getMondayStr(today), to: today }
    case 'this_month': return { from: getFirstOfMonthStr(today), to: today }
    case 'all_time':   return null
  }
}
function inRange(isoDate: string, range: { from:string; to:string } | null): boolean {
  if (!range) return true
  const d = isoDate.slice(0, 10)
  return d >= range.from && d <= range.to
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold tracking-widest uppercase text-[#16205B]/50 mb-2 px-1">{children}</p>
}
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-red-500 text-xs mt-1.5 px-1 font-medium" role="alert">{message}</p>
}
function SelectorButton({ label, placeholder, onClick, error }: {
  label?: string; placeholder: string; onClick: ()=>void; error?: string
}) {
  return (
    <div>
      <button type="button" onClick={onClick} aria-haspopup="dialog"
        className={['w-full min-h-[56px] flex items-center justify-between px-4 rounded-xl border-2 text-left transition-colors duration-100 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
          error ? 'border-red-400 bg-red-50' : label ? 'border-[#16205B] bg-white' : 'border-[#16205B]/20 bg-white'].join(' ')}>
        <span className={label ? 'text-base font-semibold text-gray-900' : 'text-base text-gray-500'}>{label ?? placeholder}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 ml-2 text-gray-400">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
        </svg>
      </button>
      <FieldError message={error} />
    </div>
  )
}
function OptionButton<T extends string>({ value, label, selected, onPress, activeColour='maroon' }: {
  value: T; label: string; selected: boolean; onPress: (v:T)=>void; activeColour?: 'maroon'|'navy'
}) {
  return (
    <button type="button" onClick={()=>onPress(value)} aria-pressed={selected}
      className={['min-h-[52px] rounded-xl px-3 py-3 text-sm font-bold text-center leading-tight transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
        selected ? `${activeColour==='navy'?'bg-[#16205B]':'bg-[#590129]'} text-white shadow-md` : 'bg-white text-gray-600 border-2 border-gray-200'].join(' ')}>
      {label}
    </button>
  )
}
function SuccessBanner({ visible }: { visible: boolean }) {
  return (
    <div aria-live="polite" aria-atomic="true"
      className={['fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 bg-[#16205B] text-white rounded-full shadow-xl text-sm font-semibold transition-all duration-300',
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'].join(' ')}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#EB6619]">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
      </svg>
      Logged
    </div>
  )
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange }: { value: string; onChange: (v:string)=>void }) {
  const { t } = useLanguage()
  return (
    <div className="sticky top-0 z-10 bg-[#EDEAE1] px-4 pt-3 pb-2">
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#16205B]/30 pointer-events-none">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
        </svg>
        <input type="search" value={value} onChange={e=>onChange(e.target.value)}
          placeholder="Search by customer…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#16205B]/10 bg-white text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#EB6619] transition-colors"/>
      </div>
    </div>
  )
}

// ─── Time chips ───────────────────────────────────────────────────────────────

type TimeChipConfig = { id: TimeChip; key: string }
const TIME_CHIP_CONFIGS: TimeChipConfig[] = [
  { id:'today',      key:'chipToday'     },
  { id:'yesterday',  key:'chipYesterday' },
  { id:'this_week',  key:'chipThisWeek'  },
  { id:'this_month', key:'chipThisMonth' },
  { id:'all_time',   key:'chipAllTime'   },
]

function TimeChips({ active, onChange }: { active: TimeChip; onChange: (c:TimeChip)=>void }) {
  const { t } = useLanguage()
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none" style={{ scrollbarWidth:'none' }}>
      {TIME_CHIP_CONFIGS.map(cfg => (
        <button key={cfg.id} type="button" onClick={()=>onChange(cfg.id)}
          className={['flex-shrink-0 h-7 px-3 rounded-full text-xs font-bold transition-all',
            active===cfg.id ? 'bg-[#16205B] text-white shadow-sm' : 'bg-white text-[#16205B]/60 border border-[#16205B]/10'].join(' ')}>
          {t(cfg.key as Parameters<typeof t>[0])}
        </button>
      ))}
    </div>
  )
}

// ─── Complaint card ───────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'Europe/London' })
  } catch { return '' }
}

function StatusBadge({ status }: { status: Status }) {
  return status === 'open'
    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">🟡 Open</span>
    : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✅ Resolved</span>
}

function ComplaintCard({ complaint, onResolve }: {
  complaint: ComplaintRow
  onResolve: (id:string, note:string) => void
}) {
  const { t }                     = useLanguage()
  const [expanded, setExpanded]   = useState(false)
  const [note,     setNote]       = useState('')
  const [saving,   setSaving]     = useState(false)

  async function handleResolve() {
    if (!note.trim()) return
    setSaving(true)
    await onResolve(complaint.id, note.trim())
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">
      <div className="px-4 py-3">
        {/* Top row: customer + badge */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-[#16205B] text-sm leading-tight">{complaint.customer}</p>
          <StatusBadge status={complaint.status} />
        </div>
        {/* Sub row */}
        <p className="text-[11px] text-gray-400 mb-1">
          <span className="capitalize">{complaint.category.replace(/_/g,' ')}</span>
          {' · '}{fmtDate(complaint.createdAt)}
          {' · by '}<span className="font-medium text-gray-500">{complaint.loggedBy}</span>
        </p>
        {/* Description */}
        <p className="text-xs text-gray-600 line-clamp-2">{complaint.description}</p>
        {/* Resolved note if present */}
        {complaint.status === 'resolved' && complaint.resolutionNote && (
          <p className="text-[11px] text-green-700 mt-1.5 italic line-clamp-1">✓ {complaint.resolutionNote}</p>
        )}
        {/* Resolve button for open complaints */}
        {complaint.status === 'open' && (
          <button type="button" onClick={()=>setExpanded(e=>!e)}
            className="mt-2 text-xs font-semibold text-[#EB6619] flex items-center gap-1">
            {t('resolveAction')}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
              className={['w-3 h-3 transition-transform', expanded?'rotate-180':''].join(' ')}>
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </div>
      {/* Inline resolution form */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
          <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} maxLength={500}
            placeholder="Describe how this was resolved…"
            className="w-full rounded-xl px-3 py-2 text-sm resize-none border-2 border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:border-[#EB6619] transition-colors"/>
          <button type="button" onClick={handleResolve} disabled={!note.trim()||saving}
            className={['w-full h-9 rounded-xl text-sm font-bold',
              !note.trim()||saving ? 'bg-gray-100 text-gray-400' : 'bg-[#16205B] text-white active:scale-[0.98]'].join(' ')}>
            {saving ? t('saving') : t('markResolved')}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── All Complaints tab ───────────────────────────────────────────────────────

function AllComplaintsTab() {
  const [complaints,   setComplaints]   = useState<ComplaintRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  const [chip,         setChip]         = useState<TimeChip>('today')
  const [resolvedIds,  setResolvedIds]  = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/screen2/open')
      if (!res.ok) { setError('Failed to load complaints'); return }
      const rows = await res.json() as {
        id:string; createdAt:string; category:string; description:string
        customer:string; loggedBy:string; status?:Status
        resolutionNote?:string|null; resolvedBy?:string|null; resolvedAt?:string|null
      }[]
      setComplaints(rows.map(r => ({ ...r, status: r.status ?? 'open' })))
    } catch { setError('Network error') }
    finally   { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleResolve(id: string, note: string) {
    try {
      const { localDb } = await import('@/lib/localDb')
      const { triggerSync } = await import('@/lib/syncEngine')
      await localDb.queue.add({
        localId: crypto.randomUUID(), screen: 'screen2_resolve',
        payload: { complaint_id: id, resolution_note: note },
        createdAt: Date.now(), synced: false, retries: 0,
      })
      setResolvedIds(prev => new Set([...prev, id]))
      triggerSync()
    } catch (err) { console.error('resolve queue error:', err) }
  }

  const range = chipToRange(chip)
  const visible = useMemo(() => complaints
    .filter(c => !resolvedIds.has(c.id))
    .filter(c => inRange(c.createdAt, range))
    .filter(c => !search.trim() || c.customer.toLowerCase().includes(search.toLowerCase())),
    [complaints, resolvedIds, range, search, chip] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div className="pb-24">
      <SearchBar value={search} onChange={setSearch} />
      <TimeChips active={chip} onChange={setChip} />

      {loading && (
        <div className="flex justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-[#16205B]/30" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      )}
      {!loading && error && (
        <div className="mx-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-sm font-semibold text-red-600">Retry</button>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-green-600">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {search ? `${t('nothingHere')}: "${search}"` : t('nothingHere')}
          </p>
          <p className="text-xs text-gray-400 mt-1">{t('tryDifferentFilter')}</p>
        </div>
      )}
      {!loading && !error && visible.length > 0 && (
        <div className="max-w-lg mx-auto px-4 space-y-3">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-1">
            {visible.length} complaint{visible.length!==1?'s':''}
          </p>
          {visible.map(c => (
            <ComplaintCard key={c.id} complaint={c} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Log New form (unchanged logic, same API) ─────────────────────────────────

function validate(form: FormState): ValidationErrors {
  const e: ValidationErrors = {}
  if (!form.customer)                            e.customer    = 'Select a customer'
  if (!form.category)                            e.category    = 'Select a category'
  if (!form.description||form.description.trim().length<5) e.description = 'Enter a description (min. 5 characters)'
  if (!form.receivedVia)                         e.receivedVia = 'Select how it was received'
  if (!form.status)                              e.status      = 'Select a status'
  if (form.status==='resolved'&&!form.resolutionNote.trim()) e.resolutionNote = 'Enter how this was resolved'
  return e
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplaintsPage() {
  const { t }       = useLanguage()
  const categories  = CATEGORIES(t)
  const receivedVia = RECEIVED_VIA(t)
  const formId      = useId()
  useEffect(() => { syncReferenceData().catch(console.error) }, [])

  const [activeTab,    setActiveTab]    = useState<'log'|'all'>('log')
  const customers   = useCustomers()
  const [form,      setForm]     = useState<FormState>(EMPTY_FORM)
  const [errors,    setErrors]   = useState<ValidationErrors>({})
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [showSuccess, setShowSuccess]   = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = useCallback(<K extends keyof FormState>(key:K, value:FormState[K]) => {
    setForm(prev=>({...prev,[key]:value})); setErrors(prev=>({...prev,[key]:undefined}))
  }, [])
  const setStatus = useCallback((status:Status) => {
    setForm(prev=>({...prev,status,resolutionNote:status==='open'?'':prev.resolutionNote}))
    setErrors(prev=>({...prev,status:undefined,resolutionNote:undefined}))
  }, [])

  const handleSubmit = useCallback(async () => {
    const errs = validate(form)
    if (Object.keys(errs).length>0) { setErrors(errs); window.scrollTo({top:0,behavior:'smooth'}); return }
    setIsSubmitting(true)
    try {
      const localId2 = crypto.randomUUID()
      await localDb.queue.add({
        localId: localId2, screen: 'screen2',
        payload: {
          id: localId2, customer_id: form.customer!.id, category: form.category!,
          description: form.description.trim(), received_via: form.receivedVia!,
          status: form.status!,
          resolution_note: form.status==='resolved' ? form.resolutionNote.trim() : null,
        },
        createdAt: Date.now(), synced: false, retries: 0,
      })
      setForm(EMPTY_FORM); setErrors({})
      setShowSuccess(true); setTimeout(()=>setShowSuccess(false), 2000)
      triggerSync()
    } catch(err) { console.error('Failed to write to local queue:', err) }
    finally { setIsSubmitting(false) }
  }, [form])

  return (
    <>
      <SuccessBanner visible={showSuccess} />
      {sheetOpen && (
        <BottomSheetSelector
          title={t('selectCustomer')} items={customers} selectedId={form.customer?.id}
          searchPlaceholder={t('searchCustomers')}
          onSelect={item=>{set('customer',item);setSheetOpen(false)}}
          onDismiss={()=>setSheetOpen(false)}/>
      )}
      <div className="min-h-screen bg-[#EDEAE1]">
        <AppHeader title={t('complaintLog')} maxWidth="lg" />

        {/* Tab switcher */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-lg mx-auto flex">
            {([['log',t('logNew')],['all',t('allComplaints')]] as ['log'|'all', string][]).map(([tab,label])=>(
              <button key={tab} type="button" onClick={()=>setActiveTab(tab)}
                className={['flex-1 py-3.5 text-sm font-semibold border-b-2 transition-colors',
                  activeTab===tab ? 'border-[#EB6619] text-[#EB6619]' : 'border-transparent text-gray-400 hover:text-gray-600'].join(' ')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab==='all' && <AllComplaintsTab />}

        {activeTab==='log' && (
          <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6" id={formId}>

            <section>
              <Label>{t('customer')}</Label>
              <SelectorButton label={form.customer?.label} placeholder={t('selectCustomer')}
                onClick={()=>setSheetOpen(true)} error={errors.customer}/>
            </section>

            <section>
              <Label>{t('complaintCat')}</Label>
              <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Complaint category">
                {categories.slice(0,6).map(({value,label})=>(
                  <OptionButton key={value} value={value} label={label}
                    selected={form.category===value} onPress={v=>set('category',v)} activeColour="maroon"/>
                ))}
                <div className="col-span-3">
                  <OptionButton value="other" label={t('other')}
                    selected={form.category==='other'} onPress={v=>set('category',v)} activeColour="maroon"/>
                </div>
              </div>
              <FieldError message={errors.category}/>
            </section>

            <section>
              <Label>{t('description')}</Label>
              <textarea rows={3} placeholder={t('complaintDesc')} value={form.description}
                onChange={e=>set('description',e.target.value)} maxLength={500} aria-label="Complaint description"
                className={['w-full rounded-xl px-4 py-3 resize-none text-base text-gray-900 placeholder:text-gray-400 leading-relaxed border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                  errors.description?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
              <div className="flex items-start justify-between mt-1 px-1">
                <FieldError message={errors.description}/>
                <span className="text-xs text-gray-500 ml-auto flex-shrink-0">{form.description.length}/500</span>
              </div>
            </section>

            <section>
              <Label>{t('receivedVia')}</Label>
              <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="How complaint was received">
                {receivedVia.map(({value,label})=>(
                  <OptionButton key={value} value={value} label={label}
                    selected={form.receivedVia===value} onPress={v=>set('receivedVia',v)} activeColour="navy"/>
                ))}
              </div>
              <FieldError message={errors.receivedVia}/>
            </section>

            <section>
              <Label>{t('status')}</Label>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Complaint status">
                {(['open','resolved'] as Status[]).map(value=>(
                  <button key={value} type="button" onClick={()=>setStatus(value)} aria-pressed={form.status===value}
                    className={['h-[72px] rounded-2xl text-base font-bold transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      form.status===value ? (value==='open'?'bg-[#590129] text-white shadow-md':'bg-[#16205B] text-white shadow-md') : 'bg-white text-gray-500 border-2 border-gray-200'].join(' ')}>
                    {value==='open'?'Open':'Resolved'}
                  </button>
                ))}
              </div>
              <FieldError message={errors.status}/>
            </section>

            <section className={['transition-all duration-200 overflow-hidden',
              form.status==='resolved' ? 'opacity-100 scale-100' : 'opacity-0 pointer-events-none scale-95 h-0 !mt-0'].join(' ')}
              aria-hidden={form.status!=='resolved'}>
              <Label>{t('resolutionNote')}</Label>
              <textarea rows={3} placeholder={t('resolvePrompt')} value={form.resolutionNote}
                onChange={e=>set('resolutionNote',e.target.value)} maxLength={500}
                tabIndex={form.status!=='resolved'?-1:0} aria-label="Resolution note"
                className={['w-full rounded-xl px-4 py-3 resize-none text-base text-gray-900 placeholder:text-gray-400 leading-relaxed border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                  errors.resolutionNote?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
              <FieldError message={errors.resolutionNote}/>
            </section>

            <section className="pb-10">
              <button type="button" onClick={handleSubmit} disabled={isSubmitting}
                className={['w-full h-16 rounded-2xl text-white text-lg font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                  isSubmitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[#EB6619] active:scale-[0.98] active:bg-[#c95510] shadow-lg shadow-orange-200'].join(' ')}>
                {isSubmitting ? t('saving') : t('logComplaint')}
              </button>
            </section>
          </main>
        )}
      </div>
      <RoleNav />
    </>
  )
}
