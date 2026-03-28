'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, useId, useEffect, useRef, useMemo } from 'react'
import BottomSheetSelector from '@/components/BottomSheetSelector'
import RoleNav             from '@/components/RoleNav'
import { useLanguage }     from '@/lib/LanguageContext'
import AppHeader           from '@/components/AppHeader'
import { useCustomers }    from '@/hooks/useReferenceData'
import { localDb, syncReferenceData } from '@/lib/localDb'
import { triggerSync }     from '@/lib/syncEngine'
import type { SelectableItem }  from '@/components/BottomSheetSelector'
import type { TodayVisit }      from '@/app/api/screen3/today/route'

// ─── Pipeline configuration ────────────────────────────────────────────────────

// Linear main path (left to right)
const PIPELINE_LINEAR = ['Logged', 'In Talks', 'Trial Order Placed', 'Awaiting Feedback', 'Won'] as const
type LinearStage = typeof PIPELINE_LINEAR[number]

// Translation key maps — DB values → translation keys for display
const STAGE_TR_KEY: Record<string, string> = {
  'Logged':             'stageLogged',
  'In Talks':           'stageInTalks',
  'Trial Order Placed': 'stageTrialFull',
  'Awaiting Feedback':  'stageFeedbackFull',
  'Won':                'stageWon',
  'Not Progressing':    'stageNotProgressing',
  'Not Won':            'stageNotWon',
}
// Short keys for stepper nodes
const STAGE_TR_SHORT_KEY: Record<string, string> = {
  'Logged':             'stageLogged',
  'In Talks':           'stageInTalks',
  'Trial Order Placed': 'stageTrial',
  'Awaiting Feedback':  'stageFeedback',
  'Won':                'stageWon',
}

// Off-ramp statuses — not on the linear path
const PIPELINE_OFF_RAMPS = ['Not Progressing', 'Not Won'] as const

// "Next logical step" on the linear path — returns null for terminal/off-ramp states
function getNextStep(current: string): string | null {
  const idx = PIPELINE_LINEAR.indexOf(current as LinearStage)
  if (idx === -1 || idx === PIPELINE_LINEAR.length - 1) return null
  return PIPELINE_LINEAR[idx + 1]
}

// True if current status is a terminal state (no next step button shown)
function isTerminal(status: string): boolean {
  return status === 'Won' || status === 'Not Won' || status === 'Not Progressing'
}

// Colour map for pipeline badges (card + stepper + DetailModal)
const PIPELINE_BADGE: Record<string, string> = {
  'Logged':              'bg-gray-100 text-gray-500 border-gray-200',
  'In Talks':            'bg-teal-50 text-teal-800 border-teal-200',
  'Not Progressing':     'bg-red-50 text-red-600 border-red-200',
  'Trial Order Placed':  'bg-blue-50 text-blue-700 border-blue-200',
  'Awaiting Feedback':   'bg-amber-50 text-amber-700 border-amber-200',
  'Won':                 'bg-green-50 text-green-700 border-green-200',
  'Not Won':             'bg-gray-100 text-gray-500 border-gray-200',
}

function getClientRole(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)
  return match?.[1] ?? ''
}

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitType    = 'routine'|'new_pitch'|'complaint_followup'|'delivery_issue'
type Outcome      = 'positive'|'neutral'|'at_risk'|'lost'
type CustomerMode = 'existing'|'prospect'
type TimeChip     = 'today'|'yesterday'|'this_week'|'this_month'|'all_time'

interface FormState {
  customerMode:     CustomerMode
  customer:         SelectableItem | null
  prospectName:     string
  prospectPostcode: string
  visitType:        VisitType | null
  outcome:          Outcome | null
  commitmentMade:   boolean
  commitmentDetail: string
  notes:            string
}
const EMPTY_FORM: FormState = {
  customerMode:'existing', customer:null, prospectName:'', prospectPostcode:'',
  visitType:null, outcome:null, commitmentMade:false, commitmentDetail:'', notes:'',
}

interface PendingItem {
  localId:string; name:string; visitType:string; outcome:string; createdAt:number; isPending:true
  customerId:string|null; prospectName:string|null; prospectPostcode:string|null
  commitmentMade:boolean; commitmentDetail:string|null; notes:string|null
}
interface ValidationErrors { customer?:string; prospectPostcode?:string; visitType?:string; outcome?:string; commitmentDetail?:string }

// ─── Config ───────────────────────────────────────────────────────────────────

function VISIT_TYPES(t:(k:string)=>string) { return [
  { value:'routine',            label:t('routine')           },
  { value:'new_pitch',          label:t('newPitch')          },
  { value:'complaint_followup', label:t('complaintFollowup') },
  { value:'delivery_issue',     label:t('deliveryIssue')     },
]}
function OUTCOMES(t:(k:string)=>string) { return [
  { value:'positive', label:t('positive'), active:'bg-[#16205B] text-white shadow-md'  },
  { value:'neutral',  label:t('neutral'),  active:'bg-[#5F5E5A] text-white shadow-md'  },
  { value:'at_risk',  label:t('atRisk'),   active:'bg-[#BA7517] text-white shadow-md'  },
  { value:'lost',     label:t('lost'),     active:'bg-[#A32D2D] text-white shadow-md'  },
]}

const TYPE_COLOUR: Record<string,string> = { routine:'#16205B', new_pitch:'#EB6619', complaint_followup:'#DC2626', delivery_issue:'#D97706' }
const TYPE_LABEL:  Record<string,string> = { routine:'Routine', new_pitch:'New Pitch', complaint_followup:'Complaint F/U', delivery_issue:'Delivery Issue' }
const OUT_COLOUR:  Record<string,string> = { positive:'#15803D', neutral:'#6B7280', at_risk:'#B45309', lost:'#B91C1C' }
const OUT_LABEL:   Record<string,string> = { positive:'Positive', neutral:'Neutral',  at_risk:'At Risk',  lost:'Lost' }

// ─── Date helpers (same en-CA pattern throughout the codebase) ────────────────

function todayStr()  { return new Date().toLocaleDateString('en-CA') }
function addDaysStr(dateStr:string, days:number) {
  const d=new Date(dateStr+'T12:00:00'); d.setDate(d.getDate()+days); return d.toLocaleDateString('en-CA')
}
function getMondayStr(dateStr:string) {
  const d=new Date(dateStr+'T12:00:00'); const day=d.getDay(); d.setDate(d.getDate()-((day+6)%7)); return d.toLocaleDateString('en-CA')
}
function getFirstOfMonthStr(dateStr:string) { return dateStr.slice(0,8)+'01' }
function chipToRange(chip:TimeChip): { from:string; to:string }|null {
  const today=todayStr()
  switch(chip) {
    case 'today':      return { from:today, to:today }
    case 'yesterday':  return { from:addDaysStr(today,-1), to:addDaysStr(today,-1) }
    case 'this_week':  return { from:getMondayStr(today), to:today }
    case 'this_month': return { from:getFirstOfMonthStr(today), to:today }
    case 'all_time':   return null
  }
}
function inRange(isoDate:string, range:{from:string;to:string}|null): boolean {
  if(!range) return true; const d=isoDate.slice(0,10); return d>=range.from && d<=range.to
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vibrate(pattern:number|number[]) {
  if(typeof window!=='undefined'&&window.navigator?.vibrate) window.navigator.vibrate(pattern)
}
function fmtTime(v:string|number):string {
  const d=typeof v==='number'?new Date(v):new Date(v)
  return d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})
}
function fmtDate(iso:string) {
  try { return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Europe/London'}) } catch { return '' }
}
function validate(form:FormState):ValidationErrors {
  const e:ValidationErrors={}
  if(form.customerMode==='existing'&&!form.customer) e.customer='Select a customer'
  if(form.customerMode==='prospect'&&!form.prospectName.trim()) e.customer='Enter the prospect name'
  if(form.customerMode==='prospect'&&form.prospectName.trim().length>0&&form.prospectName.trim().length<3) e.customer='Name must be at least 3 characters'
  if(form.customerMode==='prospect'&&!form.prospectPostcode.trim()) e.prospectPostcode='Enter a postcode (e.g. S10 1TE)'
  if(!form.visitType) e.visitType='Select a visit type'
  if(!form.outcome)   e.outcome='Select an outcome'
  if(form.commitmentMade&&!form.commitmentDetail.trim()) e.commitmentDetail='Describe the commitment made'
  return e
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Label({children}:{children:React.ReactNode}) {
  return <p className="text-xs font-bold tracking-widest uppercase text-[#16205B]/50 mb-2 px-1">{children}</p>
}
function FieldError({message}:{message?:string}) {
  if(!message) return null
  return <p className="text-red-500 text-xs mt-1.5 px-1 font-medium" role="alert">{message}</p>
}
function SelectorButton({label,placeholder,onClick,error}:{label?:string;placeholder:string;onClick:()=>void;error?:string}) {
  return (
    <div>
      <button type="button" onClick={onClick} aria-haspopup="dialog"
        className={['w-full min-h-[56px] flex items-center justify-between px-4 rounded-xl border-2 text-left transition-colors duration-100 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
          error?'border-red-400 bg-red-50':label?'border-[#16205B] bg-white':'border-[#16205B]/20 bg-white'].join(' ')}>
        <span className={label?'text-base font-semibold text-gray-900':'text-base text-gray-500'}>{label??placeholder}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 ml-2 text-gray-400">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
        </svg>
      </button>
      <FieldError message={error}/>
    </div>
  )
}
function SuccessBanner({visible,isUpdate}:{visible:boolean;isUpdate:boolean}) {
  return (
    <div aria-live="polite" aria-atomic="true"
      className={['fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 bg-[#16205B] text-white rounded-full shadow-xl text-sm font-semibold transition-all duration-300',
        visible?'opacity-100 translate-y-0 scale-100':'opacity-0 -translate-y-2 scale-95 pointer-events-none'].join(' ')}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#EB6619]">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
      </svg>
      {isUpdate?'Updated':'Logged'}
    </div>
  )
}

// ─── Search bar + Time chips ──────────────────────────────────────────────────

function SearchBar({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  const { t } = useLanguage()
  return (
    <div className="sticky top-0 z-10 bg-[#EDEAE1] px-4 pt-3 pb-2">
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#16205B]/30 pointer-events-none">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd"/>
        </svg>
        <input type="search" value={value} onChange={e=>onChange(e.target.value)}
          placeholder={t('searchByCustomer')}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#16205B]/10 bg-white text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#EB6619] transition-colors"/>
      </div>
    </div>
  )
}

type TimeChipConfig = { id:TimeChip; key:string }
const TIME_CHIP_CONFIGS: TimeChipConfig[] = [
  {id:'today',      key:'chipToday'},
  {id:'yesterday',  key:'chipYesterday'},
  {id:'this_week',  key:'chipThisWeek'},
  {id:'this_month', key:'chipThisMonth'},
  {id:'all_time',   key:'chipAllTime'},
]
function TimeChips({active,onChange}:{active:TimeChip;onChange:(c:TimeChip)=>void}) {
  const { t } = useLanguage()
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3" style={{scrollbarWidth:'none'}}>
      {TIME_CHIP_CONFIGS.map(cfg=>(
        <button key={cfg.id} type="button" onClick={()=>onChange(cfg.id)}
          className={['flex-shrink-0 h-7 px-3 rounded-full text-xs font-bold transition-all',
            active===cfg.id?'bg-[#16205B] text-white shadow-sm':'bg-white text-[#16205B]/60 border border-[#16205B]/10'].join(' ')}>
          {t(cfg.key as Parameters<typeof t>[0])}
        </button>
      ))}
    </div>
  )
}

// ─── Visit card ───────────────────────────────────────────────────────────────

function OutcomeBadge({outcome}:{outcome:string}) {
  const colour=OUT_COLOUR[outcome]??'#6B7280'
  const label=OUT_LABEL[outcome]??outcome
  const bgMap: Record<string,string> = {
    positive:'bg-green-50 border-green-200 text-green-700',
    neutral: 'bg-gray-100 border-gray-200 text-gray-600',
    at_risk: 'bg-amber-50 border-amber-200 text-amber-700',
    lost:    'bg-red-50  border-red-200  text-red-700',
  }
  return (
    <span className={['inline-flex items-center text-[10px] font-bold rounded-full px-2 py-0.5 border', bgMap[outcome]??'bg-gray-100 border-gray-200 text-gray-600'].join(' ')}
      style={{color:colour}}>
      {label}
    </span>
  )
}

// Static pipeline badge — used on terminal/pending states
function PipelineBadge({status}:{status:string}) {
  return (
    <span className={['inline-flex items-center text-[10px] font-bold rounded-full px-2 py-0.5 border whitespace-nowrap', PIPELINE_BADGE[status]??'bg-gray-100 text-gray-500 border-gray-200'].join(' ')}>
      {status}
    </span>
  )
}

function VisitCard({visit, onEdit, onDelete, onStatusUpdate}:{
  visit:TodayVisit|PendingItem; onEdit:()=>void; onDelete:()=>void
  onStatusUpdate?:(id:string, status:string)=>void
}) {
  const isPending     = 'isPending' in visit
  const name          = isPending ? (visit as PendingItem).name : ((visit as TodayVisit).customer_name||(visit as TodayVisit).prospect_name||'Unknown')
  const outcome       = isPending ? (visit as PendingItem).outcome : (visit as TodayVisit).outcome
  const vtype         = isPending ? (visit as PendingItem).visitType : (visit as TodayVisit).visit_type
  const notes         = isPending ? (visit as PendingItem).notes : (visit as TodayVisit).notes
  const commitment    = isPending ? (visit as PendingItem).commitmentDetail : (visit as TodayVisit).commitment_detail
  const createdAt     = isPending ? (visit as PendingItem).createdAt : (visit as TodayVisit).created_at
  const pipelineStatus = (!isPending && (visit as TodayVisit).pipeline_status) ? (visit as TodayVisit).pipeline_status : 'Logged'
  const loggedBy      = (!isPending && (visit as TodayVisit).logged_by_name) ? (visit as TodayVisit).logged_by_name : null
  const typeColour    = TYPE_COLOUR[vtype]??'#6B7280'
  const isManager     = typeof document !== 'undefined' && (getClientRole() === 'admin' || getClientRole() === 'office')
  const { t }         = useLanguage()

  const [showSheet,      setShowSheet]      = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  async function handlePipelineUpdate(newStatus: string) {
    if (isPending || !onStatusUpdate) return
    if (newStatus === pipelineStatus) { setShowSheet(false); return }
    setUpdatingStatus(true)
    setShowSheet(false)
    try {
      const res = await fetch('/api/screen3/visit', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id: (visit as TodayVisit).id, pipeline_status: newStatus }),
      })
      if (res.ok) onStatusUpdate((visit as TodayVisit).id, newStatus)
    } catch(e) { console.error('Pipeline status update failed:', e) }
    finally { setUpdatingStatus(false) }
  }

  const nextStep = isPending ? null : getNextStep(pipelineStatus)
  const terminal = isPending ? false : isTerminal(pipelineStatus)

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#EDEAE1] overflow-hidden">
        {/* Tappable body — opens stepper sheet */}
        <button type="button" onClick={() => !isPending && setShowSheet(true)}
          className="w-full text-left px-4 pt-3 pb-2 block active:bg-gray-50 transition-colors">
          {/* Top row: name + outcome badge */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-bold text-[#16205B] text-sm leading-tight">{name}</p>
            <OutcomeBadge outcome={outcome}/>
          </div>
          {/* Sub row: type + time + pending badge */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{background:typeColour}}/>
            <span className="text-[11px] font-semibold" style={{color:typeColour}}>{TYPE_LABEL[vtype]??vtype}</span>
            <span className="text-gray-300 text-xs">·</span>
            <span className="text-[11px] text-gray-400">{fmtTime(createdAt)}</span>
            {isPending && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 ml-1">
                <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"/>{t('pendingLabel')}
              </span>
            )}
          </div>
          {notes && <p className="text-[11px] text-gray-400 italic line-clamp-1 mb-1">{notes}</p>}
          {commitment && <p className="text-[11px] text-[#EB6619] font-medium line-clamp-1">💬 {commitment}</p>}
          {/* Pipeline status badge — always visible for synced visits so colour reflects current stage */}
          {!isPending && pipelineStatus && (
            <div className="mt-1.5"><PipelineBadge status={pipelineStatus}/></div>
          )}
          {/* Admin/office: who logged it */}
          {isManager && loggedBy && (
            <p className="text-[10px] text-gray-400 mt-1">{t('loggedByPrefix')} <span className="font-medium text-gray-500">{loggedBy}</span></p>
          )}
        </button>

        {/* Quick action — "Next Step" button for linear stages */}
        {!isPending && !terminal && nextStep && (
          <div className="px-3 pb-3">
            <button type="button"
              onClick={e => { e.stopPropagation(); handlePipelineUpdate(nextStep) }}
              disabled={updatingStatus}
              className={[
                'w-full h-10 rounded-xl flex items-center justify-center gap-2',
                'text-xs font-bold transition-all active:scale-[0.98]',
                'bg-[#16205B]/5 hover:bg-[#16205B]/10 text-[#16205B] border border-[#16205B]/10',
                'disabled:opacity-40',
              ].join(' ')}>
              {updatingStatus ? (
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                  <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd"/>
                </svg>
              )}
              {updatingStatus ? t('updatingStatus') : `${t('moveTo')} ${nextStep ? t(STAGE_TR_KEY[nextStep] as Parameters<typeof t>[0]) : ''}`}
            </button>
          </div>
        )}

        {/* Edit + delete always at bottom */}
        <div className="flex items-center border-t border-[#EDEAE1]">
          <button type="button" onClick={onEdit} aria-label="Edit visit"
            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#16205B]/40 hover:text-[#16205B] hover:bg-[#EDEAE1] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
            </svg>
            {t('editAction')}
          </button>
          <div className="w-px h-5 bg-[#EDEAE1]"/>
          <button type="button" onClick={onDelete} aria-label="Delete visit"
            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#16205B]/40 hover:text-red-600 hover:bg-red-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd"/>
            </svg>
            {t('deleteAction')}
          </button>
        </div>
      </div>

      {/* Pipeline stepper — centered modal (avoids browser URL bar on mobile) */}
      {showSheet && !isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowSheet(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e=>e.stopPropagation()}>
            {/* Header drag bar */}
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1"/>
            <p className="text-sm font-bold text-[#16205B] px-5 pt-2 pb-0.5">{t('pipelineStatus')}</p>
            <p className="text-xs text-gray-400 px-5 pb-4 truncate">{name}</p>

            {/* Visual horizontal stepper */}
            <div className="px-4 pb-4">
              <div className="flex items-start justify-between gap-0">
                {PIPELINE_LINEAR.map((stage, idx) => {
                  const linearIdx   = PIPELINE_LINEAR.indexOf(pipelineStatus as LinearStage)
                  const isActive    = pipelineStatus === stage
                  const isPast      = linearIdx > idx
                  const isFuture    = linearIdx < idx
                  const isLast      = idx === PIPELINE_LINEAR.length - 1
                  const dotClass    = isActive ? 'bg-[#16205B] ring-4 ring-[#16205B]/10 scale-110'
                                    : isPast   ? 'bg-[#16205B]/70'
                                               : 'bg-gray-200'
                  const lineClass   = isPast ? 'bg-[#16205B]/70' : 'bg-gray-200'
                  return (
                    <div key={stage} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex items-center">
                        <button type="button" onClick={() => handlePipelineUpdate(stage)}
                          className={['w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all', dotClass].join(' ')}
                          title={stage}>
                          {isActive && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="white" className="w-3 h-3">
                              <path fillRule="evenodd" d="M10.22 2.97a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.97 1.97 4.97-4.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd"/>
                            </svg>
                          )}
                          {isPast && !isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white"/>
                          )}
                        </button>
                        {!isLast && (
                          <div className={['h-0.5 flex-1 mx-0.5 transition-colors', lineClass].join(' ')}/>
                        )}
                      </div>
                      <p className={['text-[9px] font-semibold mt-1.5 text-center leading-tight',
                        isActive ? 'text-[#16205B]' : isPast ? 'text-[#16205B]/60' : 'text-gray-400'].join(' ')}>
                        {t(STAGE_TR_SHORT_KEY[stage] as Parameters<typeof t>[0])}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Off-ramp buttons */}
            <div className="px-4 pb-6 space-y-2 border-t border-[#EDEAE1] pt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t('offRamps')}</p>
              {PIPELINE_OFF_RAMPS.map(s => {
                const isCurrent = pipelineStatus === s
                return (
                  <button key={s} type="button" onClick={() => handlePipelineUpdate(s)}
                    className={['w-full h-11 rounded-xl text-sm font-bold border-2 transition-all',
                      isCurrent
                        ? 'bg-[#16205B] text-white border-[#16205B]'
                        : s === 'Not Progressing'
                          ? 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100'
                          : 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100'
                    ].join(' ')}>
                    {isCurrent ? `✓ ${t(STAGE_TR_KEY[s] as Parameters<typeof t>[0])}` : t(STAGE_TR_KEY[s] as Parameters<typeof t>[0])}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── My Visits tab ────────────────────────────────────────────────────────────

function MyVisitsTab({
  syncedVisits, pendingItems, onEdit, onDelete, onStatusUpdate,
}: {
  syncedVisits:TodayVisit[]; pendingItems:PendingItem[]
  onEdit:(v:TodayVisit|PendingItem)=>void; onDelete:(v:TodayVisit|PendingItem)=>void
  onStatusUpdate:(id:string, status:string)=>void
}) {
  const { t }            = useLanguage()
  const [search, setSearch] = useState('')
  const [chip,   setChip]   = useState<TimeChip>('today')

  const range = chipToRange(chip)

  const allVisits = useMemo(() => {
    const synced = syncedVisits
      .filter(v => inRange(v.created_at, range))
      .filter(v => !search || (v.customer_name??v.prospect_name??'').toLowerCase().includes(search.toLowerCase()))
    const pending = pendingItems
      .filter(p => inRange(new Date(p.createdAt).toISOString(), range))
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    return { synced, pending, total: synced.length + pending.length }
  }, [syncedVisits, pendingItems, range, search, chip]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pb-24">
      <SearchBar value={search} onChange={setSearch}/>
      <TimeChips active={chip} onChange={setChip}/>
      {allVisits.total === 0 ? (
        <div className="flex flex-col items-center py-16 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-[#16205B]/5 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#16205B" strokeWidth="1.5" className="w-6 h-6 opacity-20">
              <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {search ? `${t('noVisitsLogged')}: "${search}"` : t('noVisitsLogged')}
          </p>
          <p className="text-xs text-gray-400 mt-1">{t('tryDifferentVisit')}</p>
        </div>
      ) : (
        <div className="max-w-lg mx-auto px-4 space-y-3">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-1">
            {allVisits.total} visit{allVisits.total!==1?'s':''}
            {allVisits.pending.length>0 && ` (${allVisits.pending.length} pending sync)`}
          </p>
          {allVisits.pending.map(p=><VisitCard key={p.localId} visit={p} onEdit={()=>onEdit(p)} onDelete={()=>onDelete(p)}/>)}
          {allVisits.synced.map(v=><VisitCard key={v.id} visit={v} onEdit={()=>onEdit(v)} onDelete={()=>onDelete(v)} onStatusUpdate={onStatusUpdate}/>)}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VisitsPage() {
  const { t }      = useLanguage()
  const visitTypes = VISIT_TYPES(t)
  const outcomes   = OUTCOMES(t)
  const formId     = useId()
  const formRef    = useRef<HTMLDivElement>(null)

  useEffect(()=>{ syncReferenceData().catch(console.error) },[])
  const customers = useCustomers()

  const [activeTab,    setActiveTab]    = useState<'log'|'my'>('log')
  const [form,         setForm]         = useState<FormState>(EMPTY_FORM)
  const [errors,       setErrors]       = useState<ValidationErrors>({})
  const [sheetOpen,    setSheetOpen]    = useState(false)
  const [showSuccess,  setShowSuccess]  = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId,    setEditingId]    = useState<string|null>(null)
  const [editingLocalId, setEditingLocalId] = useState<string|null>(null)
  const [syncedVisits, setSyncedVisits] = useState<TodayVisit[]>([])
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [deleteTarget, setDeleteTarget] = useState<TodayVisit|PendingItem|null>(null)

  // Optimistic pipeline status update — replaces the status on the card immediately
  const handleStatusUpdate = useCallback((id: string, status: string) => {
    setSyncedVisits(prev => prev.map(v => v.id === id ? { ...v, pipeline_status: status } : v))
  }, [])

  const refreshFeed = useCallback(async()=>{
    try{ const r=await fetch('/api/screen3/today'); if(r.ok){const d=await r.json(); setSyncedVisits(d.visits??[])} }
    catch{}
  },[])

  const refreshPending = useCallback(async()=>{
    const start=new Date(); start.setHours(0,0,0,0)
    const q=await localDb.queue.filter(r=>r.screen==='screen3'&&!r.synced&&r.createdAt>=start.getTime()).toArray()
    setPendingItems(q.map(r=>{
      const p=r.payload as Record<string,unknown>
      return{
        localId:r.localId, name:!p.customer_id?String(p.prospect_name??'Unknown prospect'):'Syncing…',
        visitType:String(p.visit_type??''), outcome:String(p.outcome??''),
        createdAt:r.createdAt, isPending:true as const,
        customerId:p.customer_id as string|null, prospectName:p.prospect_name as string|null,
        prospectPostcode:p.prospect_postcode as string|null, commitmentMade:Boolean(p.commitment_made),
        commitmentDetail:p.commitment_detail as string|null, notes:p.notes as string|null,
      }
    }))
  },[])

  useEffect(()=>{ refreshFeed(); refreshPending() },[refreshFeed,refreshPending])

  const set=useCallback(<K extends keyof FormState>(key:K,value:FormState[K])=>{
    setForm(p=>({...p,[key]:value})); setErrors(p=>({...p,[key]:undefined}))
  },[])
  const switchMode=useCallback((mode:CustomerMode)=>{
    setForm(p=>({...p,customerMode:mode,customer:null,prospectName:'',prospectPostcode:''}))
    setErrors(p=>({...p,customer:undefined}))
  },[])
  const setCommitment=useCallback((made:boolean)=>{
    setForm(p=>({...p,commitmentMade:made,commitmentDetail:made?p.commitmentDetail:''}))
    setErrors(p=>({...p,commitmentDetail:undefined}))
  },[])

  const handleEdit=useCallback((visit:TodayVisit|PendingItem)=>{
    let f:FormState
    if('isPending' in visit){
      f={customerMode:visit.customerId?'existing':'prospect',
        customer:null, prospectName:visit.prospectName??'', prospectPostcode:visit.prospectPostcode??'',
        visitType:visit.visitType as VisitType??null, outcome:visit.outcome as Outcome??null,
        commitmentMade:visit.commitmentMade, commitmentDetail:visit.commitmentDetail??'', notes:visit.notes??''}
      setEditingLocalId(visit.localId); setEditingId(null)
    } else {
      const existingCustomer = visit.customer_id&&visit.customer_name ? {id:visit.customer_id,label:visit.customer_name} : null
      f={customerMode:visit.customer_id?'existing':'prospect', customer:existingCustomer,
        prospectName:visit.prospect_name??'', prospectPostcode:visit.prospect_postcode??'',
        visitType:visit.visit_type as VisitType, outcome:visit.outcome as Outcome,
        commitmentMade:visit.commitment_made, commitmentDetail:visit.commitment_detail??'', notes:visit.notes??''}
      setEditingId(visit.id); setEditingLocalId(null)
    }
    setForm(f); setErrors({})
    setActiveTab('log')
    setTimeout(()=>formRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50)
  },[])

  const cancelEdit=useCallback(()=>{ setForm(EMPTY_FORM); setErrors({}); setEditingId(null); setEditingLocalId(null) },[])

  const handleSubmit=useCallback(async()=>{
    const errs=validate(form)
    if(Object.keys(errs).length>0){setErrors(errs); window.scrollTo({top:0,behavior:'smooth'}); return}
    vibrate(50)
    setIsSubmitting(true)
    const isDbRecord=editingId!==null
    try{
      if(editingLocalId) await localDb.queue.where('localId').equals(editingLocalId).delete()
      const recordId=editingId??editingLocalId??crypto.randomUUID()
      await localDb.queue.put({
        localId:recordId, screen:'screen3',
        payload:{
          id:recordId, _upsert:isDbRecord,
          customer_id:form.customerMode==='existing'?form.customer?.id??null:null,
          prospect_name:form.customerMode==='prospect'?form.prospectName.trim():null,
          prospect_postcode:form.customerMode==='prospect'?form.prospectPostcode.trim()||null:null,
          visit_type:form.visitType!, outcome:form.outcome!,
          commitment_made:form.commitmentMade,
          commitment_detail:form.commitmentMade?form.commitmentDetail.trim():null,
          notes:form.notes.trim()||null,
        },
        createdAt:Date.now(), synced:false, retries:0,
      })
      setForm(EMPTY_FORM); setErrors({}); setEditingId(null); setEditingLocalId(null)
      setShowSuccess(true); setTimeout(()=>setShowSuccess(false),2000)
      triggerSync()
      setTimeout(()=>{ refreshFeed(); refreshPending() },1500)
    } catch(err){ console.error('Failed to write to local queue:',err) }
    finally{ setIsSubmitting(false) }
  },[form,editingId,editingLocalId,refreshFeed,refreshPending])

  const handleDeleteConfirm=useCallback(async()=>{
    if(!deleteTarget) return
    vibrate([50,100,50])
    const target=deleteTarget; setDeleteTarget(null)
    try{
      if('isPending' in target){
        await localDb.queue.where('localId').equals(target.localId).delete()
        await refreshPending()
      } else {
        await fetch(`/api/screen3/visit?id=${target.id}`,{method:'DELETE'})
        await localDb.queue.where('localId').equals(target.id).delete().catch(()=>{})
        await refreshFeed(); await refreshPending()
      }
    } catch(err){ console.error('Delete failed:',err) }
  },[deleteTarget,refreshFeed,refreshPending])

  const isProspectMode=form.customerMode==='prospect'
  const isEditing=editingId!==null||editingLocalId!==null

  return (
    <>
      <SuccessBanner visible={showSuccess} isUpdate={isEditing}/>

      {sheetOpen&&(
        <BottomSheetSelector
          title={t('selectCustomer')} items={customers} selectedId={form.customer?.id}
          searchPlaceholder={t('searchCustomers')}
          onSelect={item=>{set('customer',item);setSheetOpen(false)}}
          onDismiss={()=>setSheetOpen(false)}/>
      )}

      {/* Delete confirm modal */}
      {deleteTarget&&(
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40" onClick={()=>setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e=>e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900">Delete visit?</p>
            <p className="text-sm text-gray-500">{'isPending' in deleteTarget?'This pending visit will be removed.':'This visit will be permanently deleted.'}</p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={()=>setDeleteTarget(null)}
                className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600">Cancel</button>
              <button type="button" onClick={handleDeleteConfirm}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-[#EDEAE1]">
        <AppHeader title={t('visitLog')} maxWidth="lg"/>

        {/* Tab switcher */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-lg mx-auto flex">
            {([['log',t('logNew')],['my',t('myVisits')]] as ['log'|'my', string][]).map(([tab,label])=>(
              <button key={tab} type="button" onClick={()=>setActiveTab(tab)}
                className={['flex-1 py-3.5 text-sm font-semibold border-b-2 transition-colors',
                  activeTab===tab?'border-[#EB6619] text-[#EB6619]':'border-transparent text-gray-400 hover:text-gray-600'].join(' ')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab==='my' && (
          <MyVisitsTab
            syncedVisits={syncedVisits} pendingItems={pendingItems}
            onEdit={handleEdit} onDelete={v=>setDeleteTarget(v)} onStatusUpdate={handleStatusUpdate}/>
        )}

        {activeTab==='log' && (
          <main className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6" id={formId} ref={formRef}>

            {isEditing&&(
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#EB6619]/10 border border-[#EB6619]/20 rounded-xl">
                <span className="text-xs font-semibold text-[#EB6619]">✏ Editing visit</span>
                <button type="button" onClick={cancelEdit} className="text-xs text-[#EB6619]/70 hover:text-[#EB6619] underline">Cancel</button>
              </div>
            )}

            {/* Customer mode toggle */}
            <section>
              <Label>{t('customer')}</Label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(['existing','prospect'] as CustomerMode[]).map(mode=>(
                  <button key={mode} type="button" onClick={()=>switchMode(mode)}
                    className={['h-10 rounded-xl text-sm font-bold transition-all',
                      form.customerMode===mode?'bg-[#16205B] text-white shadow-sm':'bg-white text-gray-500 border-2 border-gray-200'].join(' ')}>
                    {mode==='existing'?t('existingCustomer'):t('newProspect')}
                  </button>
                ))}
              </div>
              {!isProspectMode ? (
                <SelectorButton label={form.customer?.label} placeholder={t('selectCustomer')}
                  onClick={()=>setSheetOpen(true)} error={errors.customer}/>
              ) : (
                <div className="space-y-3">
                  <div>
                    <input type="text" placeholder={t('prospectNameField')} value={form.prospectName} autoFocus
                      onChange={e=>{set('prospectName',e.target.value);setErrors(p=>({...p,customer:undefined}))}}
                      aria-label="Prospect name"
                      className={['w-full h-[56px] rounded-xl px-4 text-base text-gray-900 placeholder:text-gray-400 border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                        errors.customer?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
                    <FieldError message={errors.customer}/>
                  </div>
                  <div>
                    <input type="text" placeholder={t('prospectPostcode')} value={form.prospectPostcode} maxLength={10}
                      onChange={e=>{set('prospectPostcode',e.target.value);setErrors(p=>({...p,prospectPostcode:undefined}))}}
                      aria-label="Prospect postcode"
                      className={['w-full h-[56px] rounded-xl px-4 text-base text-gray-900 placeholder:text-gray-400 border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                        errors.prospectPostcode?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
                    <FieldError message={errors.prospectPostcode}/>
                    <p className="text-xs text-gray-400 px-1 mt-1">{t('postcodeHint')}</p>
                  </div>
                </div>
              )}
            </section>

            {/* Visit type */}
            <section>
              <Label>{t('visitType')}</Label>
              <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Visit type">
                {visitTypes.map(({value,label})=>(
                  <button key={value} type="button" onClick={()=>set('visitType',value as VisitType)} aria-pressed={form.visitType===value}
                    className={['min-h-[56px] rounded-xl px-3 py-3 text-sm font-bold text-center leading-tight transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      form.visitType===value?'bg-[#590129] text-white shadow-md':'bg-white text-gray-600 border-2 border-gray-200'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
              <FieldError message={errors.visitType}/>
            </section>

            {/* Outcome */}
            <section>
              <Label>{t('outcome')}</Label>
              <div className="grid grid-cols-2 gap-2.5" role="group" aria-label={t('visitOutcome')}>
                {outcomes.map(({value,label,active})=>(
                  <button key={value} type="button" onClick={()=>set('outcome',value as Outcome)} aria-pressed={form.outcome===value}
                    className={['min-h-[56px] rounded-xl px-3 py-3 text-sm font-bold text-center leading-tight transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      form.outcome===value?active:'bg-white text-gray-600 border-2 border-gray-200'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
              <FieldError message={errors.outcome}/>
              {(form.outcome==='at_risk'||form.outcome==='lost')&&(
                <div className={['mt-2.5 px-4 py-2.5 rounded-xl text-xs font-medium',
                  form.outcome==='lost'?'bg-red-50 text-red-700 border border-red-200':'bg-amber-50 text-amber-800 border border-amber-200'].join(' ')}>
                  {form.outcome==='lost'?'This account will be flagged on the management dashboard immediately.':'Management will be alerted to this account on the dashboard.'}
                </div>
              )}
            </section>

            {/* Commitment */}
            <section>
              <Label>{t('commitmentMade')}</Label>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('commitmentMade')}>
                {([{value:true,label:t('yes')},{value:false,label:t('no')}] as const).map(({value,label})=>(
                  <button key={String(value)} type="button" onClick={()=>setCommitment(value)} aria-pressed={form.commitmentMade===value}
                    className={['h-[72px] rounded-2xl text-base font-bold transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      form.commitmentMade===value&&value===true?'bg-[#EB6619] text-white shadow-md':form.commitmentMade===value&&value===false?'bg-[#16205B] text-white shadow-md':'bg-white text-gray-500 border-2 border-gray-200'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className={['transition-all duration-200 overflow-hidden',form.commitmentMade?'opacity-100 scale-100 mt-3':'opacity-0 pointer-events-none scale-95 h-0 !mt-0'].join(' ')} aria-hidden={!form.commitmentMade}>
                <textarea rows={2} placeholder={t('commitmentPrompt')} value={form.commitmentDetail} maxLength={300}
                  onChange={e=>set('commitmentDetail',e.target.value)} tabIndex={form.commitmentMade?0:-1} aria-label="Commitment detail"
                  className={['w-full rounded-xl px-4 py-3 resize-none text-base text-gray-900 placeholder:text-gray-400 leading-relaxed border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                    errors.commitmentDetail?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
                <FieldError message={errors.commitmentDetail}/>
              </div>
            </section>

            {/* Notes */}
            <section>
              <Label>{t('notesOptional')}</Label>
              <textarea rows={2} placeholder={t('notesPrompt')} value={form.notes} maxLength={400}
                onChange={e=>set('notes',e.target.value)} aria-label="Additional notes"
                className="w-full rounded-xl px-4 py-3 resize-none text-base text-gray-900 placeholder:text-gray-400 leading-relaxed border-2 border-gray-200 bg-white focus:outline-none focus:border-[#EB6619] transition-colors"/>
            </section>

            {/* Submit */}
            <section>
              <button type="button" onClick={handleSubmit} disabled={isSubmitting}
                className={['w-full h-16 rounded-2xl text-white text-lg font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                  isSubmitting?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-[#EB6619] active:scale-[0.98] active:bg-[#c95510] shadow-lg shadow-orange-200'].join(' ')}>
                {isSubmitting?t('saving'):isEditing?t('updateVisit'):t('logVisit')}
              </button>
            </section>

          </main>
        )}
      </div>
      <RoleNav/>
    </>
  )
}
