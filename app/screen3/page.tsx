'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, useId, useEffect, useRef } from 'react'
import BottomSheetSelector              from '@/components/BottomSheetSelector'
import RoleNav from '@/components/RoleNav'
import { useLanguage } from '@/lib/LanguageContext'
import AppHeader                            from '@/components/AppHeader'
import { useCustomers }                 from '@/hooks/useReferenceData'
import { localDb, syncReferenceData }   from '@/lib/localDb'
import { triggerSync }                   from '@/lib/syncEngine'
import type { SelectableItem }          from '@/components/BottomSheetSelector'
import type { TodayVisit }             from '@/app/api/screen3/today/route'

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitType  = 'routine' | 'new_pitch' | 'complaint_followup' | 'delivery_issue'
type Outcome    = 'positive' | 'neutral' | 'at_risk' | 'lost'
type CustomerMode = 'existing' | 'prospect'

interface FormState {
  customerMode:      CustomerMode
  customer:          SelectableItem | null
  prospectName:      string
  prospectPostcode:  string
  visitType:         VisitType | null
  outcome:           Outcome | null
  commitmentMade:    boolean
  commitmentDetail:  string
  notes:             string
}

const EMPTY_FORM: FormState = {
  customerMode:     'existing',
  customer:         null,
  prospectName:     '',
  prospectPostcode: '',
  visitType:        null,
  outcome:          null,
  commitmentMade:   false,
  commitmentDetail: '',
  notes:            '',
}

function VISIT_TYPES(t: (k: string) => string) { return [
  { value: 'routine',            label: t('routine')           },
  { value: 'new_pitch',          label: t('newPitch')          },
  { value: 'complaint_followup', label: t('complaintFollowup') },
  { value: 'delivery_issue',     label: t('deliveryIssue')     },
]}
function OUTCOMES(t: (k: string) => string) { return [
  { value: 'positive', label: t('positive'), active: 'bg-[#16205B] text-white shadow-md' },
  { value: 'neutral',  label: t('neutral'),  active: 'bg-[#5F5E5A] text-white shadow-md' },
  { value: 'at_risk',  label: t('atRisk'),   active: 'bg-[#BA7517] text-white shadow-md' },
  { value: 'lost',     label: t('lost'),     active: 'bg-[#A32D2D] text-white shadow-md' },
]}

const TYPE_COLOUR: Record<string,string> = { routine:'#16205B', new_pitch:'#EB6619', complaint_followup:'#DC2626', delivery_issue:'#D97706' }
const TYPE_LABEL:  Record<string,string> = { routine:'Routine', new_pitch:'New pitch', complaint_followup:'Complaint f/u', delivery_issue:'Delivery issue' }
const OUT_COLOUR:  Record<string,string> = { positive:'#15803D', neutral:'#6B7280', at_risk:'#B45309', lost:'#B91C1C' }
const OUT_LABEL:   Record<string,string> = { positive:'Positive', neutral:'Neutral', at_risk:'At risk', lost:'Lost' }

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors { customer?:string; prospectPostcode?:string; visitType?:string; outcome?:string; commitmentDetail?:string }

function validate(form: FormState): ValidationErrors {
  const e: ValidationErrors = {}
  if (form.customerMode==='existing' && !form.customer) e.customer='Select a customer'
  if (form.customerMode==='prospect' && !form.prospectName.trim()) e.customer='Enter the prospect name'
  if (form.customerMode==='prospect' && form.prospectName.trim().length>0 && form.prospectName.trim().length<3) e.customer='Name must be at least 3 characters'
  if (form.customerMode==='prospect' && !form.prospectPostcode.trim()) e.prospectPostcode='Enter a postcode (e.g. S10 1TE)'
  if (!form.visitType) e.visitType='Select a visit type'
  if (!form.outcome)   e.outcome='Select an outcome'
  if (form.commitmentMade && !form.commitmentDetail.trim()) e.commitmentDetail='Describe the commitment made'
  return e
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold tracking-widest uppercase text-[#16205B]/50 mb-2 px-1">{children}</p>
}
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-red-500 text-xs mt-1.5 px-1 font-medium" role="alert">{message}</p>
}
function SelectorButton({ label, placeholder, onClick, error }: { label?:string; placeholder:string; onClick:()=>void; error?:string }) {
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

function SuccessBanner({ visible, isUpdate }: { visible:boolean; isUpdate:boolean }) {
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

function DeleteModal({ onConfirm, onCancel }: { onConfirm:()=>void; onCancel:()=>void }) {
  return (
    <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel}/>
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-0 sm:mx-4 p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-600">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-gray-900">Permanently delete this visit?</p>
            <p className="text-sm text-gray-500 mt-0.5">This cannot be undone.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button type="button" onClick={onCancel} className="h-12 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-12 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors">Yes, delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ visits, pendingCount }: { visits:TodayVisit[]; pendingCount:number }) {
  const total     = visits.length + pendingCount
  const prospects = visits.filter(v=>!v.customer_id).length
  const compFu    = visits.filter(v=>v.visit_type==='complaint_followup').length
  return (
    <div className="bg-white border-b border-[#EDEAE1] px-4 py-2 flex items-center divide-x divide-[#EDEAE1]">
      <StatPill value={total}     label="Today"/>
      <StatPill value={prospects} label="Prospects"/>
      <StatPill value={compFu}    label="Complaint f/u"/>
      {pendingCount>0 && (
        <div className="flex-1 flex items-center justify-end pl-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"/>
            {pendingCount} pending
          </span>
        </div>
      )}
    </div>
  )
}
function StatPill({ value, label }: { value:number; label:string }) {
  return (
    <div className="flex-1 flex flex-col items-center py-0.5 px-2">
      <span className="text-base font-bold text-[#16205B] leading-tight">{value}</span>
      <span className="text-[9px] font-semibold text-[#16205B]/40 leading-tight text-center uppercase tracking-wide">{label}</span>
    </div>
  )
}

// ─── Activity list ────────────────────────────────────────────────────────────

interface PendingItem {
  localId:string; name:string; visitType:string; outcome:string; createdAt:number; isPending:true
  customerId:string|null; prospectName:string|null; prospectPostcode:string|null
  commitmentMade:boolean; commitmentDetail:string|null; notes:string|null
}

function fmtTime(v:string|number):string {
  const d=typeof v==='number'?new Date(v):new Date(v)
  return d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})
}

function ActivityList({ synced, pending, onEdit, onDelete }:{
  synced:TodayVisit[]; pending:PendingItem[]
  onEdit:(v:TodayVisit|PendingItem)=>void; onDelete:(v:TodayVisit|PendingItem)=>void
}) {
  if(synced.length+pending.length===0)
    return <div className="py-6 text-center"><p className="text-sm text-[#16205B]/40 font-medium">No visits logged today</p></div>
  return (
    <div className="space-y-2">
      {pending.map(p=><ActivityItem key={p.localId} name={p.name} time={fmtTime(p.createdAt)} visitType={p.visitType} outcome={p.outcome} isPending onEdit={()=>onEdit(p)} onDelete={()=>onDelete(p)}/>)}
      {synced.map(v=><ActivityItem key={v.id} name={v.customer_name??v.prospect_name??'Unknown'} time={fmtTime(v.created_at)} visitType={v.visit_type} outcome={v.outcome} notes={v.notes??undefined} onEdit={()=>onEdit(v)} onDelete={()=>onDelete(v)}/>)}
    </div>
  )
}

function ActivityItem({ name, time, visitType, outcome, notes, isPending, onEdit, onDelete }:{
  name:string; time:string; visitType:string; outcome:string; notes?:string; isPending?:boolean; onEdit:()=>void; onDelete:()=>void
}) {
  const c=TYPE_COLOUR[visitType]??'#6B7280'
  return (
    <div className="bg-white rounded-xl border border-[#16205B]/8 px-3 py-2.5 flex items-center gap-3">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:c}}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
          {isPending&&(
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
              <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"/>Pending sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-semibold" style={{color:c}}>{TYPE_LABEL[visitType]??visitType}</span>
          <span className="text-[#16205B]/20 text-xs">·</span>
          <span className="text-[11px] font-medium" style={{color:OUT_COLOUR[outcome]??'#6B7280'}}>{OUT_LABEL[outcome]??outcome}</span>
          <span className="text-[#16205B]/20 text-xs">·</span>
          <span className="text-[11px] text-gray-400">{time}</span>
        </div>
        {notes&&<p className="text-[11px] text-gray-400/80 mt-0.5 line-clamp-1 italic">{notes}</p>}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button type="button" onClick={onEdit} aria-label="Edit visit"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#16205B]/30 hover:text-[#16205B] hover:bg-[#EDEAE1] transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
          </svg>
        </button>
        <button type="button" onClick={onDelete} aria-label="Delete visit"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#16205B]/30 hover:text-red-600 hover:bg-red-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Screen3Page() {
  const { t } = useLanguage()
  const visitTypes = VISIT_TYPES(t)
  const outcomes   = OUTCOMES(t)
  const formId     = useId()
  const formRef    = useRef<HTMLDivElement>(null)

  useEffect(()=>{ syncReferenceData().catch(console.error) },[])
  const customers = useCustomers()

  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors]       = useState<ValidationErrors>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showSuccess, setShowSuccess]   = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId]         = useState<string|null>(null)
  const [editingLocalId, setEditingLocalId] = useState<string|null>(null)
  const [syncedVisits, setSyncedVisits]   = useState<TodayVisit[]>([])
  const [pendingItems, setPendingItems]   = useState<PendingItem[]>([])
  const [feedLoading, setFeedLoading]     = useState(true)
  const [deleteTarget, setDeleteTarget]   = useState<TodayVisit|PendingItem|null>(null)

  const refreshFeed = useCallback(async()=>{
    setFeedLoading(true)
    try{ const r=await fetch('/api/screen3/today'); if(r.ok){const d=await r.json(); setSyncedVisits(d.visits??[])} }
    catch{}finally{ setFeedLoading(false) }
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
      // Pending item — customer name not available, can only prefill prospect or blank existing
      f={customerMode:visit.customerId?'existing':'prospect',
        customer:null, // can't reconstruct SelectableItem without a name from queue
        prospectName:visit.prospectName??'',prospectPostcode:visit.prospectPostcode??'',
        visitType:visit.visitType as VisitType??null,outcome:visit.outcome as Outcome??null,
        commitmentMade:visit.commitmentMade,commitmentDetail:visit.commitmentDetail??'',notes:visit.notes??''}
      setEditingLocalId(visit.localId); setEditingId(null)
    } else {
      // Synced item — reconstruct SelectableItem from customer_id + customer_name
      const existingCustomer = visit.customer_id && visit.customer_name
        ? { id: visit.customer_id, label: visit.customer_name }
        : null
      f={customerMode:visit.customer_id?'existing':'prospect',
        customer:existingCustomer,
        prospectName:visit.prospect_name??'',prospectPostcode:visit.prospect_postcode??'',
        visitType:visit.visit_type as VisitType,outcome:visit.outcome as Outcome,
        commitmentMade:visit.commitment_made,commitmentDetail:visit.commitment_detail??'',notes:visit.notes??''}
      setEditingId(visit.id); setEditingLocalId(null)
    }
    setForm(f); setErrors({})
    setTimeout(()=>formRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50)
  },[])

  const cancelEdit=useCallback(()=>{
    setForm(EMPTY_FORM); setErrors({}); setEditingId(null); setEditingLocalId(null)
  },[])

  const handleSubmit=useCallback(async()=>{
    const errs=validate(form)
    if(Object.keys(errs).length>0){ setErrors(errs); window.scrollTo({top:0,behavior:'smooth'}); return }
    setIsSubmitting(true)
    const isDbRecord=editingId!==null
    try{
      if(editingLocalId) await localDb.queue.where('localId').equals(editingLocalId).delete()
      const recordId=editingId??editingLocalId??crypto.randomUUID()
      console.log('[screen3] queueing visit:', { recordId, isUpsert: isDbRecord, customer_id: form.customerMode==='existing'?form.customer?.id:null, visitType: form.visitType, outcome: form.outcome })
      // put() = insert-or-replace; critical for edits — add() throws ConstraintError
      // if the original synced visit still has the same localId in the queue
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
      {deleteTarget&&<DeleteModal onConfirm={handleDeleteConfirm} onCancel={()=>setDeleteTarget(null)}/>}
      {sheetOpen&&(
        <BottomSheetSelector title={t('selectCustomer')} items={customers} selectedId={form.customer?.id}
          searchPlaceholder={t('searchCustomers')}
          onSelect={(item)=>{ set('customer',item); setSheetOpen(false) }}
          onDismiss={()=>setSheetOpen(false)}
          footerAction={{label:'+ '+t('newProspect'),onPress:()=>switchMode('prospect')}}/>
      )}
      <div className="min-h-screen bg-[#EDEAE1]">
        <AppHeader title={t('visitLog')} maxWidth="lg"/>
        <ProgressBar visits={syncedVisits} pendingCount={pendingItems.length}/>

        <main className="max-w-lg mx-auto px-4 py-6 pb-28 space-y-6" id={formId}>
          <div ref={formRef}/>

          {/* Edit banner */}
          {isEditing&&(
            <div className="flex items-center justify-between bg-[#EB6619]/10 border border-[#EB6619]/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#EB6619]">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
                </svg>
                <span className="text-sm font-semibold text-[#EB6619]">Editing visit</span>
              </div>
              <button type="button" onClick={cancelEdit} className="text-xs font-bold text-[#EB6619]/70 hover:text-[#EB6619] px-2 py-1 rounded-lg">Cancel</button>
            </div>
          )}

          {/* Customer / Prospect */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <Label>{isProspectMode?t('newProspect'):t('existingCustomer')}</Label>
              <button type="button" onClick={()=>switchMode(isProspectMode?'existing':'prospect')}
                className={['text-xs font-bold px-4 py-2.5 rounded-full border-2 min-h-[44px] flex items-center transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
                  isProspectMode?'border-[#EB6619] text-[#EB6619] bg-orange-50':'border-gray-300 text-gray-400 bg-white'].join(' ')}>
                {isProspectMode?'← '+t('existingCustomer'):'+ '+t('newProspect')}
              </button>
            </div>
            {!isProspectMode&&<SelectorButton label={form.customer?.label} placeholder={t('selectCustomer')} onClick={()=>setSheetOpen(true)} error={errors.customer}/>}
            {isProspectMode&&(
              <div className="space-y-3">
                <div>
                  <input type="text" placeholder={t('prospectNameField')} value={form.prospectName} autoFocus
                    onChange={(e)=>{ set('prospectName',e.target.value); setErrors(p=>({...p,customer:undefined})) }}
                    aria-label="Prospect name"
                    className={['w-full h-[56px] rounded-xl px-4 text-base text-gray-900 placeholder:text-gray-400 border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                      errors.customer?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
                  <FieldError message={errors.customer}/>
                </div>
                <div>
                  <input type="text" placeholder={t('prospectPostcode')} value={form.prospectPostcode} maxLength={10}
                    onChange={(e)=>{ set('prospectPostcode',e.target.value); setErrors(p=>({...p,prospectPostcode:undefined})) }}
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
              {visitTypes.map(({value,label})=>{
                const isActive=form.visitType===value
                return(
                  <button key={value} type="button" onClick={()=>set('visitType',value as VisitType)} aria-pressed={isActive}
                    className={['min-h-[56px] rounded-xl px-3 py-3 text-sm font-bold text-center leading-tight transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive?'bg-[#590129] text-white shadow-md':'bg-white text-gray-600 border-2 border-gray-200'].join(' ')}>
                    {label}
                  </button>
                )
              })}
            </div>
            <FieldError message={errors.visitType}/>
          </section>

          {/* Outcome */}
          <section>
            <Label>{t('outcome')}</Label>
            <div className="grid grid-cols-2 gap-2.5" role="group" aria-label={t('visitOutcome')}>
              {outcomes.map(({value,label,active})=>{
                const isActive=form.outcome===value
                return(
                  <button key={value} type="button" onClick={()=>set('outcome',value as Outcome)} aria-pressed={isActive}
                    className={['min-h-[56px] rounded-xl px-3 py-3 text-sm font-bold text-center leading-tight transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive?active:'bg-white text-gray-600 border-2 border-gray-200'].join(' ')}>
                    {label}
                  </button>
                )
              })}
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
              {([{value:true,label:t('yes')},{value:false,label:t('no')}] as const).map(({value,label})=>{
                const isActive=form.commitmentMade===value
                return(
                  <button key={String(value)} type="button" onClick={()=>setCommitment(value)} aria-pressed={isActive}
                    className={['h-[72px] rounded-2xl text-base font-bold transition-all duration-100 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#EB6619]',
                      isActive&&value===true?'bg-[#EB6619] text-white shadow-md':isActive&&value===false?'bg-[#16205B] text-white shadow-md':'bg-white text-gray-500 border-2 border-gray-200'].join(' ')}>
                    {label}
                  </button>
                )
              })}
            </div>
            <div className={['transition-all duration-200 overflow-hidden',form.commitmentMade?'opacity-100 scale-100 mt-3':'opacity-0 pointer-events-none scale-95 h-0 !mt-0'].join(' ')} aria-hidden={!form.commitmentMade}>
              <textarea rows={2} placeholder={t('commitmentPrompt')} value={form.commitmentDetail} maxLength={300}
                onChange={(e)=>set('commitmentDetail',e.target.value)} aria-label="Commitment detail" tabIndex={form.commitmentMade?0:-1}
                className={['w-full rounded-xl px-4 py-3 resize-none text-base text-gray-900 placeholder:text-gray-400 leading-relaxed border-2 bg-white focus:outline-none focus:border-[#EB6619] transition-colors',
                  errors.commitmentDetail?'border-red-400 bg-red-50':'border-gray-200'].join(' ')}/>
              <FieldError message={errors.commitmentDetail}/>
            </div>
          </section>

          {/* Notes */}
          <section>
            <Label>{t('notesOptional')}</Label>
            <textarea rows={2} placeholder={t('notesPrompt')} value={form.notes} maxLength={400} aria-label="Additional notes"
              onChange={(e)=>set('notes',e.target.value)}
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

          {/* Today's Activity */}
          <section className="pb-4">
            <div className="flex items-center justify-between mb-3">
              <Label>{t('myActivityToday')}</Label>
              {feedLoading&&<span className="text-[10px] text-[#16205B]/40 font-medium animate-pulse">Loading…</span>}
            </div>
            <ActivityList synced={syncedVisits} pending={pendingItems} onEdit={handleEdit} onDelete={(v)=>setDeleteTarget(v)}/>
          </section>

        </main>
      </div>
      <RoleNav/>
    </>
  )
}
