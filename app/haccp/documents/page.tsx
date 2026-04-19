/**
 * app/haccp/documents/page.tsx
 *
 * Document Control Register — replaces paper MFS_Document_Control_Register_V1_0.docx
 * Single source of truth for all MFS HACCP documentation.
 */

'use client'

import { useState, useEffect } from 'react'

interface HaccpDoc {
  doc_ref:     string
  title:       string
  version:     string
  category:    string
  description: string
  purpose:     string
  linked_docs: string[]
  status:      string
  updated_at:  string
  review_due:  string
  owner:       string
}

const CATEGORY_LABELS: Record<string, string> = {
  handbook_policy:   'Handbook / Policy',
  monitoring_forms:  'Monitoring Forms',
  corrective_actions:'Corrective Actions',
  mince_meat_prep:   'Mince & Meat Prep',
  health_monitoring: 'Health Monitoring',
  training:          'Training',
}

const CATEGORY_COLOUR: Record<string, string> = {
  handbook_policy:   'bg-[#EB6619]/20 text-[#EB6619]',
  monitoring_forms:  'bg-[#1D9E75]/20 text-[#5DCAA5]',
  corrective_actions:'bg-[#E24B4A]/20 text-[#F09595]',
  mince_meat_prep:   'bg-[#590129]/40 text-[#ED93B1]',
  health_monitoring: 'bg-[#378ADD]/20 text-[#85B7EB]',
  training:          'bg-white/12 text-white/60',
}

function reviewStatus(reviewDue: string): 'ok' | 'soon' | 'overdue' {
  const due  = new Date(reviewDue)
  const now  = new Date()
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 0)   return 'overdue'
  if (diff < 60)  return 'soon'
  return 'ok'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DocumentRegisterPage() {
  const [docs,       setDocs]       = useState<HaccpDoc[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  // Document reader
  const [reading,    setReading]    = useState<HaccpDoc | null>(null)
  const [readEntries,setReadEntries]= useState<{sop_ref:string;title:string;content_md:string;version:string;source_doc:string}[]>([])
  const [readLoading,setReadLoading]= useState(false)
  const [readError,  setReadError]  = useState('')

  function openReader(doc: HaccpDoc) {
    setReading(doc)
    setReadEntries([])
    setReadError('')
    setReadLoading(true)
    fetch(`/api/haccp/handbook?doc=${doc.doc_ref}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setReadEntries(d.entries ?? []))
      .catch((e) => setReadError(`Could not load content — ${e.message}`))
      .finally(() => setReadLoading(false))
  }

  useEffect(() => {
    fetch('/api/haccp/documents')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setDocs)
      .catch((e) => setError(`Could not load register — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  const overdue = docs.filter((d) => reviewStatus(d.review_due) === 'overdue')
  const soon    = docs.filter((d) => reviewStatus(d.review_due) === 'soon')

  return (
    <div className="min-h-screen bg-[#16205B] flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-white/10">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="text-white/50 hover:text-white/80 transition-colors flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">MFS Global Ltd</p>
          <h1 className="text-white text-lg font-bold leading-tight">Document Control Register</h1>
        </div>
        <div className="text-right">
          <p className="text-white/30 text-[10px]">Register V1.0</p>
          <p className="text-white/30 text-[10px]">Owner: Hakan Kilic</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 text-white/40 text-sm mt-16">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading register…
        </div>
      ) : error ? (
        <p className="text-[#F09595] text-sm text-center mt-12 px-6">{error}</p>
      ) : (
        <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto">

          {/* Review alerts */}
          {(overdue.length > 0 || soon.length > 0) && (
            <div className="space-y-2 mb-2">
              {overdue.map((d) => (
                <div key={d.doc_ref} className="flex items-center gap-3 bg-[#E24B4A]/12 border border-[#E24B4A]/40 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-[#F09595] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                  <p className="text-[#F09595] text-sm"><span className="font-bold">{d.doc_ref}</span> — review overdue since {fmtDate(d.review_due)}</p>
                </div>
              ))}
              {soon.map((d) => (
                <div key={d.doc_ref} className="flex items-center gap-3 bg-[#EB6619]/12 border border-[#EB6619]/35 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-[#EB6619] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
                  <p className="text-[#EB6619] text-sm"><span className="font-bold">{d.doc_ref}</span> — review due {fmtDate(d.review_due)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Document list */}
          {docs.map((doc) => {
            const rs      = reviewStatus(doc.review_due)
            const isOpen  = expanded === doc.doc_ref

            return (
              <div key={doc.doc_ref}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  rs === 'overdue' ? 'border-[#E24B4A]/40 bg-[#E24B4A]/8' :
                  rs === 'soon'    ? 'border-[#EB6619]/35 bg-white/5' :
                                     'border-white/10 bg-white/5'
                }`}>

                {/* Row — always visible */}
                <button className="w-full text-left px-4 py-4 flex items-center gap-3"
                  onClick={() => setExpanded(isOpen ? null : doc.doc_ref)}>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{doc.doc_ref}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOUR[doc.category] ?? 'bg-white/10 text-white/50'}`}>
                        {CATEGORY_LABELS[doc.category] ?? doc.category}
                      </span>
                    </div>
                    <p className="text-white/70 text-sm mt-0.5 truncate">{doc.title}</p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-white/50 text-xs font-bold">{doc.version}</p>
                    <p className={`text-[10px] mt-0.5 ${
                      rs === 'overdue' ? 'text-[#F09595]' :
                      rs === 'soon'    ? 'text-[#EB6619]' :
                                         'text-white/30'
                    }`}>
                      Review {fmtDate(doc.review_due)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); openReader(doc) }}
                      className="px-3 py-1.5 bg-[#EB6619]/15 hover:bg-[#EB6619]/28 border border-[#EB6619]/35 rounded-xl text-[#EB6619] text-[11px] font-bold transition-all active:scale-95 flex-shrink-0">
                      Read
                    </button>
                    <svg className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/8 space-y-3">
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div>
                        <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">Last updated</p>
                        <p className="text-white/70 text-sm">{fmtDate(doc.updated_at)}</p>
                      </div>
                      <div>
                        <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">Status</p>
                        <p className="text-white/70 text-sm capitalize">{doc.status}</p>
                      </div>
                      <div>
                        <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">Document owner</p>
                        <p className="text-white/70 text-sm">{doc.owner}</p>
                      </div>
                      {doc.linked_docs.length > 0 && (
                        <div>
                          <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">Linked documents</p>
                          <p className="text-white/70 text-sm">{doc.linked_docs.join(', ')}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">Description</p>
                      <p className="text-white/65 text-sm leading-relaxed">{doc.description}</p>
                    </div>
                    <div>
                      <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">Purpose / Use</p>
                      <p className="text-white/65 text-sm leading-relaxed">{doc.purpose}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer note */}
          <div className="mt-4 px-4 py-3 bg-white/4 rounded-xl border border-white/8">
            <p className="text-white/30 text-xs leading-relaxed">
              This register supersedes the paper Document Control Register (MFS_Document_Control_Register_V1_0.docx). Retain previous versions for minimum 2 years. Update whenever documents are created, revised, or superseded.
            </p>
          </div>

        </div>
      )}

      {/* Document reader panel */}
      {reading && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-[#0f1840] rounded-t-3xl w-full max-h-[90vh] flex flex-col">

            {/* Reader header */}
            <div className="flex items-start justify-between p-6 pb-4 border-b border-white/10 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">{reading.doc_ref}</span>
                  <span className="text-white/25 text-[10px]">·</span>
                  <span className="text-white/35 text-[10px]">{reading.version}</span>
                </div>
                <h3 className="text-white font-bold text-base leading-tight">{reading.title}</h3>
              </div>
              <button onClick={() => setReading(null)}
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Reader content */}
            <div className="overflow-y-auto p-6 pt-4 space-y-6">
              {readLoading && (
                <div className="flex items-center gap-3 text-white/40 text-sm py-8 justify-center">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  Loading document…
                </div>
              )}
              {readError && <p className="text-[#F09595] text-sm">{readError}</p>}
              {!readLoading && !readError && readEntries.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-white/40 text-sm">Full document content not yet added to the system.</p>
                  <p className="text-white/25 text-xs mt-2">Key SOP sections for this document will be added in a future update.</p>
                </div>
              )}
              {readEntries.map((entry, i) => (
                <div key={entry.sop_ref}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">{entry.sop_ref}</span>
                    <span className="text-white/20 text-[10px]">·</span>
                    <span className="text-white/30 text-[10px]">{entry.source_doc} {entry.version}</span>
                  </div>
                  <h4 className="text-white font-semibold text-sm mb-3">{entry.title}</h4>
                  <div className="text-white/65 text-sm leading-relaxed whitespace-pre-line">{entry.content_md}</div>
                  {i < readEntries.length - 1 && <div className="mt-6 h-px bg-white/8"/>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
