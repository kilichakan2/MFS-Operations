'use client'
/**
 * app/haccp/product-specs/page.tsx
 * BSD 1.6.2 — Product Specifications
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const ALLERGENS = [
  'Mustard','Celery','Sulphites','Gluten','Milk/Dairy',
  'Soya','Eggs','Peanuts','Tree nuts','Crustaceans',
  'Molluscs','Fish','Lupin','Sesame',
]
const PACKAGING_OPTIONS = ['Vacuum packed','MAP (Modified Atmosphere)','Tray','Flow wrap','Bulk','Other']
const STORAGE_TEMP_OPTIONS = [
  { label:'≤1°C', value:1 },{ label:'≤3°C', value:3 },{ label:'≤5°C', value:5 },
  { label:'≤8°C', value:8 },{ label:'≤-18°C', value:-18 },{ label:'Other', value:null },
]

interface ProductSpec {
  id:string; product_name:string; description:string|null
  ingredients:string|null; allergens:string[]|null; allergen_notes:string|null
  portion_weight_g:number|null; storage_temp_c:number|null
  shelf_life_chilled_days:number|null; shelf_life_frozen_days:number|null
  packaging_type:string|null; micro_limits:string|null
  version:string; reviewed_at:string|null; review_due:boolean
  reviewer:{name:string}|null; updated_at:string
}
interface User { id:string; name:string; role:string }
interface FormState {
  product_name:string; description:string; ingredients:string
  allergens:string[]; allergen_notes:string
  portion_weight_g:string; storage_temp_label:string; storage_temp_other:string
  shelf_life_chilled_days:string; shelf_life_frozen_days:string
  packaging_type:string; micro_limits:string
  version:string; reviewed_at:string; reviewed_by:string
}
const EMPTY:FormState = {
  product_name:'',description:'',ingredients:'',allergens:[],allergen_notes:'',
  portion_weight_g:'',storage_temp_label:'',storage_temp_other:'',
  shelf_life_chilled_days:'',shelf_life_frozen_days:'',
  packaging_type:'',micro_limits:'',version:'V1.0',reviewed_at:'',reviewed_by:'',
}

function fmtDate(iso:string|null){
  if(!iso)return'—'
  return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
}
function tempLabel(v:number|null){
  if(v===null)return''
  const o=STORAGE_TEMP_OPTIONS.find(x=>x.value===v)
  return o?o.label:`≤${v}°C`
}

export default function ProductSpecsPage(){
  const [specs,setSpecs]=useState<ProductSpec[]>([])
  const [users,setUsers]=useState<User[]>([])
  const [loading,setLoading]=useState(true)
  const [isAdmin,setIsAdmin]=useState(false)
  const [selected,setSelected]=useState<ProductSpec|null>(null)
  const [editing,setEditing]=useState(false)
  const [adding,setAdding]=useState(false)
  const [form,setForm]=useState<FormState>({...EMPTY})
  const [saving,setSaving]=useState(false)
  const [saveErr,setSaveErr]=useState('')
  const [deleting,setDeleting]=useState(false)
  const [confirmDelete,setConfirmDelete]=useState(false)

  async function handleDelete(){
    if(!selected)return
    setDeleting(true)
    try{
      const res=await fetch('/api/haccp/product-specs',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,active:false})})
      if(!res.ok){setDeleting(false);return}
      setConfirmDelete(false);setSelected(null);await load()
    }catch{setDeleting(false)}
  }

  const sf=(k:keyof FormState,v:string|string[])=>setForm(p=>({...p,[k]:v}))
  const toggleA=(a:string)=>sf('allergens',form.allergens.includes(a)?form.allergens.filter(x=>x!==a):[...form.allergens,a])

  const load=useCallback(async()=>{
    setLoading(true)
    const role=document.cookie.split(';').find(c=>c.trim().startsWith('mfs_role='))?.split('=')[1]
    setIsAdmin(role==='admin')
    try{
      const[sr,ur]=await Promise.all([
        fetch('/api/haccp/product-specs').then(r=>r.json()),
        fetch('/api/haccp/users').then(r=>r.json()),
      ])
      setSpecs(sr.specs??[])
      setUsers(ur.users??[])
    }catch(e){console.error(e)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{load()},[load])

  function getTempC():number|null{
    if(!form.storage_temp_label)return null
    if(form.storage_temp_label==='Other')return form.storage_temp_other?Number(form.storage_temp_other):null
    const o=STORAGE_TEMP_OPTIONS.find(x=>x.label===form.storage_temp_label)
    return o?o.value:null
  }

  function openEdit(s:ProductSpec){
    const to=STORAGE_TEMP_OPTIONS.find(x=>x.value===s.storage_temp_c)
    setForm({
      product_name:s.product_name, description:s.description??'', ingredients:s.ingredients??'',
      allergens:s.allergens??[], allergen_notes:s.allergen_notes??'',
      portion_weight_g:s.portion_weight_g?.toString()??'',
      storage_temp_label:to?to.label:(s.storage_temp_c!==null?'Other':''),
      storage_temp_other:!to&&s.storage_temp_c!==null?s.storage_temp_c.toString():'',
      shelf_life_chilled_days:s.shelf_life_chilled_days?.toString()??'',
      shelf_life_frozen_days:s.shelf_life_frozen_days?.toString()??'',
      packaging_type:s.packaging_type??'', micro_limits:s.micro_limits??'',
      version:s.version, reviewed_at:s.reviewed_at??'',
      reviewed_by:s.reviewer?(users.find(u=>u.name===s.reviewer?.name)?.id??''):'',
    })
    setEditing(true);setSaveErr('')
  }

  async function handleSave(){
    setSaving(true);setSaveErr('')
    const p={
      product_name:form.product_name, description:form.description||null,
      ingredients:form.ingredients||null,
      allergens:form.allergens.length>0?form.allergens:null,
      allergen_notes:form.allergen_notes||null,
      portion_weight_g:form.portion_weight_g?Number(form.portion_weight_g):null,
      storage_temp_c:getTempC(),
      shelf_life_chilled_days:form.shelf_life_chilled_days?Number(form.shelf_life_chilled_days):null,
      shelf_life_frozen_days:form.shelf_life_frozen_days?Number(form.shelf_life_frozen_days):null,
      packaging_type:form.packaging_type||null, micro_limits:form.micro_limits||null,
      version:form.version||'V1.0', reviewed_at:form.reviewed_at||null,
      reviewed_by:form.reviewed_by||null,
    }
    try{
      const res=adding
        ?await fetch('/api/haccp/product-specs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})
        :await fetch('/api/haccp/product-specs',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected!.id,...p})})
      const d=await res.json()
      if(!res.ok){setSaveErr(d.error??'Save failed');return}
      setEditing(false);setAdding(false);setSelected(null);await load()
    }catch{setSaveErr('Connection error')}
    finally{setSaving(false)}
  }

  const inputCls='w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400'
  const selectCls='w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400'
  const labelCls='text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1'

  if(editing||adding)return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <button onClick={()=>{setEditing(false);setAdding(false)}} className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="text-slate-900 font-bold text-base flex-1">{adding?'New product spec':`Edit — ${selected?.product_name}`}</p>
      </div>
      <div className="px-5 py-5 space-y-4 max-w-lg mx-auto">

        <div><p className={labelCls}>Product name *</p>
          <input value={form.product_name} onChange={e=>sf('product_name',e.target.value)} placeholder="e.g. MFS Burger Patty 125g" className={selectCls.replace('py-2.5','py-2')+' text-sm'}/></div>

        <div><p className={labelCls}>Description / intended use</p>
          <textarea value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="e.g. Fresh beef burger patty for catering" rows={2} className={inputCls+' resize-none'}/></div>

        <div><p className={labelCls}>Ingredients</p>
          <textarea value={form.ingredients} onChange={e=>sf('ingredients',e.target.value)} placeholder="Beef (95%), salt, cracked black pepper…" rows={3} className={inputCls+' resize-none'}/></div>

        <div>
          <p className={labelCls}>Allergens — tap to select (contains)</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map(a=>(
              <button key={a} onClick={()=>toggleA(a)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.allergens.includes(a)?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-600 border-slate-300'}`}>
                {a}
              </button>
            ))}
          </div>
          {form.allergens.length===0&&<p className="text-slate-400 text-[10px] mt-1.5">None selected — no regulated allergens</p>}
          <div className="mt-2">
            <p className="text-slate-400 text-[10px] mb-1">May contain / cross-contamination notes</p>
            <input value={form.allergen_notes} onChange={e=>sf('allergen_notes',e.target.value)} placeholder="e.g. May contain: Gluten (shared equipment)" className={inputCls}/>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><p className={labelCls}>Portion weight (g)</p>
            <input type="number" value={form.portion_weight_g} onChange={e=>sf('portion_weight_g',e.target.value)} placeholder="125" className={inputCls}/></div>
          <div><p className={labelCls}>Shelf life chilled (days)</p>
            <input type="number" value={form.shelf_life_chilled_days} onChange={e=>sf('shelf_life_chilled_days',e.target.value)} placeholder="5" className={inputCls}/></div>
          <div><p className={labelCls}>Shelf life frozen (days)</p>
            <input type="number" value={form.shelf_life_frozen_days} onChange={e=>sf('shelf_life_frozen_days',e.target.value)} placeholder="90" className={inputCls}/></div>
        </div>

        <div><p className={labelCls}>Storage temperature</p>
          <select value={form.storage_temp_label} onChange={e=>sf('storage_temp_label',e.target.value)} className={selectCls}>
            <option value="">— Select —</option>
            {STORAGE_TEMP_OPTIONS.map(o=><option key={o.label} value={o.label}>{o.label}</option>)}
          </select>
          {form.storage_temp_label==='Other'&&(
            <input type="number" value={form.storage_temp_other} onChange={e=>sf('storage_temp_other',e.target.value)} placeholder="Enter °C e.g. -15" className={inputCls+' mt-2'}/>
          )}
        </div>

        <div><p className={labelCls}>Packaging type</p>
          <select value={form.packaging_type} onChange={e=>sf('packaging_type',e.target.value)} className={selectCls}>
            <option value="">— Select —</option>
            {PACKAGING_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div><p className={labelCls}>Microbiological limits (optional)</p>
          <textarea value={form.micro_limits} onChange={e=>sf('micro_limits',e.target.value)} placeholder="e.g. TVC <10⁶ cfu/g" rows={2} className={inputCls+' resize-none'}/></div>

        <div className="grid grid-cols-2 gap-3">
          <div><p className={labelCls}>Version</p>
            <input value={form.version} onChange={e=>sf('version',e.target.value)} placeholder="V1.0" className={inputCls}/></div>
          <div><p className={labelCls}>Review date</p>
            <input type="date" value={form.reviewed_at} onChange={e=>sf('reviewed_at',e.target.value)} className={inputCls}/></div>
        </div>

        <div><p className={labelCls}>Reviewed by</p>
          <select value={form.reviewed_by} onChange={e=>sf('reviewed_by',e.target.value)} className={selectCls}>
            <option value="">— Select reviewer —</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {saveErr&&<p className="text-red-600 text-xs">{saveErr}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={()=>{setEditing(false);setAdding(false)}} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Cancel</button>
          <button onClick={handleSave} disabled={saving||!form.product_name.trim()} className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
            {saving?'Saving…':'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  if(selected){const s=selected;return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <button onClick={()=>setSelected(null)} className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="flex-1"><p className="text-slate-900 font-bold text-base">{s.product_name}</p>
          <p className="text-slate-400 text-xs">{s.version} · BSD 1.6.2</p></div>
        {isAdmin&&(
          <div className="flex items-center gap-2">
            <button onClick={()=>{openEdit(s)}} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Edit</button>
            <button onClick={()=>setConfirmDelete(true)} className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold">Delete</button>
          </div>
        )}
      </div>
      <div className="px-5 py-5 space-y-3">
        {confirmDelete&&(
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4">
            <p className="text-red-800 text-sm font-bold mb-1">Delete {s.product_name}?</p>
            <p className="text-red-600 text-xs mb-3">Removes it from the spec register. Record kept for audit purposes.</p>
            <div className="flex gap-2">
              <button onClick={()=>setConfirmDelete(false)} className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40">
                {deleting?'Deleting…':'Confirm delete'}
              </button>
            </div>
          </div>
        )}
        {s.review_due&&<div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-amber-700 text-xs font-bold">⚠ Review due — {s.reviewed_at?'last reviewed '+fmtDate(s.reviewed_at):'never reviewed'}</p></div>}
        {[{label:'Description / intended use',value:s.description},{label:'Ingredients',value:s.ingredients},{label:'Micro limits',value:s.micro_limits}]
          .filter(x=>x.value).map(({label,value})=>(
          <div key={label} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
            <p className="text-slate-800 text-sm whitespace-pre-line">{value}</p>
          </div>
        ))}
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Allergens</p>
          {s.allergens?.length?<div className="flex flex-wrap gap-1.5 mb-1.5">{s.allergens.map(a=><span key={a} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white">{a}</span>)}</div>
            :<p className="text-slate-500 text-xs mb-1">No regulated allergens declared</p>}
          {s.allergen_notes&&<p className="text-slate-500 text-xs">{s.allergen_notes}</p>}
        </div>
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-3 grid grid-cols-2 gap-3">
          {[{label:'Portion weight',value:s.portion_weight_g?`${s.portion_weight_g}g`:null},
            {label:'Storage temp',value:s.storage_temp_c!==null?tempLabel(s.storage_temp_c):null},
            {label:'Shelf life chilled',value:s.shelf_life_chilled_days?`${s.shelf_life_chilled_days} days`:null},
            {label:'Shelf life frozen',value:s.shelf_life_frozen_days?`${s.shelf_life_frozen_days} days`:null},
            {label:'Packaging',value:s.packaging_type},
          ].map(({label,value})=>(
            <div key={label}><p className="text-slate-400 text-[10px]">{label}</p><p className="text-slate-800 text-sm font-semibold">{value??'—'}</p></div>
          ))}
        </div>
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Document control</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-slate-400">Version</p><p className="font-semibold">{s.version}</p></div>
            <div><p className="text-slate-400">Last reviewed</p><p className="font-semibold">{fmtDate(s.reviewed_at)}</p></div>
            <div><p className="text-slate-400">Reviewed by</p><p className="font-semibold">{s.reviewer?.name??'—'}</p></div>
            <div><p className="text-slate-400">Last updated</p><p className="font-semibold">{fmtDate(s.updated_at)}</p></div>
          </div>
        </div>
      </div>
    </div>
  )}

  if(loading)return<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400 text-sm">Loading…</p></div>

  return(
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-blue-100 px-5 py-4 flex items-center gap-3">
        <Link href="/haccp" className="text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className="flex-1"><p className="text-slate-900 font-bold text-base">Product Specifications</p>
          <p className="text-slate-400 text-xs">BSD 1.6.2 · {specs.length} spec{specs.length!==1?'s':''} on file</p></div>
        {isAdmin&&<button onClick={()=>{setAdding(true);setSaveErr('');setForm({...EMPTY})}} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">+ Add spec</button>}
      </div>
      <div className="px-5 py-5 space-y-3">
        {specs.length===0?(
          <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
            <p className="text-slate-400 text-sm">No product specs on file</p>
            {isAdmin&&<p className="text-slate-400 text-xs mt-1">Tap + Add spec to create the first one</p>}
          </div>
        ):specs.map(s=>(
          <button key={s.id} onClick={()=>setSelected(s)}
            className="w-full bg-white border border-blue-100 rounded-xl px-4 py-3 text-left flex items-center justify-between gap-3 active:scale-[0.99]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-slate-900 font-bold text-sm">{s.product_name}</p>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{s.version}</span>
                {s.review_due&&<span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Review due</span>}
              </div>
              {s.allergens?.length?(
                <div className="flex flex-wrap gap-1 mt-1">
                  {s.allergens.map(a=><span key={a} className="text-[9px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded">{a}</span>)}
                </div>
              ):<p className="text-slate-400 text-[10px] mt-0.5">No allergens declared</p>}
              <p className="text-slate-400 text-[10px] mt-0.5">
                {s.reviewed_at?`Reviewed ${fmtDate(s.reviewed_at)}`:'Never reviewed'}
                {s.reviewer?` · ${s.reviewer.name}`:''}
              </p>
            </div>
            <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
        <p className="text-slate-400 text-[10px] text-center pt-2">BSD 1.6.2 — Specifications must be reviewed at least annually</p>
      </div>
    </div>
  )
}
