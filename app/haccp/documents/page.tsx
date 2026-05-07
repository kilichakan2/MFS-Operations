/**
 * app/haccp/documents/page.tsx
 *
 * Document Control Register — replaces paper MFS_Document_Control_Register_V1_0.docx
 * Single source of truth for all MFS HACCP documentation.
 */

'use client'

import { useState, useEffect } from 'react'

interface HaccpDoc {
  doc_ref:       string
  title:         string
  version:       string
  category:      string
  register_type: string[]
  description:   string
  purpose:       string
  linked_docs:   string[]
  status:        string
  updated_at:    string
  review_due:    string
  owner:         string
}

const CATEGORY_LABELS: Record<string, string> = {
  handbook_policy:   'Handbook / Policy',
  monitoring_forms:  'Monitoring Forms',
  corrective_actions:'Corrective Actions',
  mince_meat_prep:   'Mince & Meat Prep',
  health_monitoring: 'Health Monitoring',
  training:          'Training',
  salsa:             'SALSA Compliance',
  allergen:          'Allergen Management',
  food_fraud:        'Food Fraud',
  food_defence:      'Food Defence',
  haccp_system:      'HACCP System',
}

const CATEGORY_COLOUR: Record<string, string> = {
  handbook_policy:   'bg-amber-50 text-[#EB6619]',
  monitoring_forms:  'bg-teal-50 text-teal-600',
  corrective_actions:'bg-red-50 text-red-600',
  mince_meat_prep:   'bg-pink-100 text-pink-600',
  health_monitoring: 'bg-blue-50 text-blue-600',
  training:          'bg-slate-100 text-slate-500',
  salsa:             'bg-purple-50 text-purple-700',
  allergen:          'bg-green-50 text-green-700',
  food_fraud:        'bg-orange-50 text-orange-700',
  food_defence:      'bg-red-50 text-red-700',
  haccp_system:      'bg-indigo-50 text-indigo-700',
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
  const [activeTab,  setActiveTab]  = useState<'all' | 'fsa' | 'salsa'>('all')
  // Search
  const [searchQ,    setSearchQ]    = useState('')
  const [searching,  setSearching]  = useState(false)
  const [results,    setResults]    = useState<{sop_ref:string;title:string;source_doc:string;section_key:string|null;snippet:string}[]>([])
  const searchTimer = useState<ReturnType<typeof setTimeout> | null>(null)

  function runSearch(q: string) {
    setSearchQ(q)
    if (searchTimer[0]) clearTimeout(searchTimer[0])
    if (q.trim().length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/haccp/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    searchTimer[0] = t
  }

  useEffect(() => {
    fetch('/api/haccp/documents')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setDocs)
      .catch((e) => setError(`Could not load register — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  const filteredDocs = activeTab === 'all' ? docs : docs.filter(d => d.register_type?.includes(activeTab))
  const overdue = filteredDocs.filter((d) => reviewStatus(d.review_due) === 'overdue')
  const soon    = filteredDocs.filter((d) => reviewStatus(d.review_due) === 'soon')

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-700 bg-[#1E293B]">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">MFS Global Ltd</p>
          <h1 className="text-slate-900 text-lg font-bold leading-tight">Document Control Register</h1>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-[10px]">Register V1.0</p>
          <p className="text-slate-400 text-[10px]">Owner: Hakan Kilic</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 text-slate-400 text-sm mt-16">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading register…
        </div>
      ) : error ? (
        <p className="text-red-600 text-sm text-center mt-12 px-6">{error}</p>
      ) : (
        <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto">

          {/* Search bar */}
          <div className="relative mb-2">
            <div className="flex items-center gap-3 bg-slate-50 border border-blue-100 rounded-2xl px-4 py-3">
              {searching ? (
                <svg className="animate-spin w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              ) : (
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              )}
              <input
                type="text"
                value={searchQ}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Search all documents…"
                className="flex-1 bg-transparent text-white text-sm placeholder-slate-400 focus:outline-none"
              />
              {searchQ && (
                <button onClick={() => { setSearchQ(''); setResults([]) }}
                  className="text-slate-400 hover:text-slate-500 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            {/* Search results dropdown */}
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-300 rounded-2xl overflow-hidden z-20 shadow-xl">
                {results.map((r) => (
                  <button key={r.sop_ref}
                    onClick={() => { window.location.href = `/haccp/documents/${r.source_doc.split('/')[0].toLowerCase()}` }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-all border-b border-blue-100 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[#EB6619] text-[10px] font-bold">{r.source_doc}</span>
                      {r.section_key && <span className="text-slate-300 text-[10px]">· {r.section_key.replace(/_/g,' ')}</span>}
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: r.snippet.replace(/<mark>/g,'<mark class="bg-amber-100 text-[#EB6619] rounded px-0.5">') }} />
                  </button>
                ))}
              </div>
            )}
            {searchQ.trim().length >= 2 && !searching && results.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-300 rounded-2xl px-4 py-3 z-20">
                <p className="text-slate-400 text-sm">No results for "{searchQ}"</p>
              </div>
            )}
          </div>

          {/* Review alerts */}
          {(overdue.length > 0 || soon.length > 0) && (
            <div className="space-y-2 mb-2">
              {overdue.map((d) => (
                <div key={d.doc_ref} className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                  <p className="text-red-600 text-sm"><span className="font-bold">{d.doc_ref}</span> — review overdue since {fmtDate(d.review_due)}</p>
                </div>
              ))}
              {soon.map((d) => (
                <div key={d.doc_ref} className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-[#EB6619] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
                  <p className="text-amber-700 text-sm"><span className="font-bold">{d.doc_ref}</span> — review due {fmtDate(d.review_due)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Register tabs */}
          <div className="flex gap-2 pb-1">
            {(['all', 'fsa', 'salsa'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-500'
                }`}>
                {tab === 'all' ? `All (${docs.length})` : tab === 'fsa' ? `FSA (${docs.filter(d => d.register_type?.includes('fsa')).length})` : `SALSA (${docs.filter(d => d.register_type?.includes('salsa')).length})`}
              </button>
            ))}
          </div>

          {/* Document list */}
          {filteredDocs.map((doc) => {
            const rs      = reviewStatus(doc.review_due)
            const isOpen  = expanded === doc.doc_ref

            return (
              <div key={doc.doc_ref}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  rs === 'overdue' ? 'border-red-300 bg-red-50' :
                  rs === 'soon'    ? 'border-amber-300 bg-white' :
                                     'border-blue-200 bg-white'
                }`}>

                {/* Row — always visible */}
                <button className="w-full text-left px-4 py-4 flex items-center gap-3"
                  onClick={() => setExpanded(isOpen ? null : doc.doc_ref)}>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-900 font-bold text-sm">{doc.doc_ref}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOUR[doc.category] ?? 'bg-slate-100 text-slate-400'}`}>
                        {CATEGORY_LABELS[doc.category] ?? doc.category}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm mt-0.5 truncate">{doc.title}</p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-slate-400 text-xs font-bold">{doc.version}</p>
                    <p className={`text-[10px] mt-0.5 ${
                      rs === 'overdue' ? 'text-red-600' :
                      rs === 'soon'    ? 'text-[#EB6619]' :
                                         'text-slate-400'
                    }`}>
                      Review {fmtDate(doc.review_due)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); window.location.href = `/haccp/documents/${doc.doc_ref.toLowerCase()}` }}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl text-[#EB6619] text-[11px] font-bold transition-all active:scale-95 flex-shrink-0">
                      Read
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 border-t border-blue-100 space-y-3">
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Last updated</p>
                        <p className="text-slate-600 text-sm">{fmtDate(doc.updated_at)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Status</p>
                        <p className="text-slate-600 text-sm capitalize">{doc.status}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Document owner</p>
                        <p className="text-slate-600 text-sm">{doc.owner}</p>
                      </div>
                      {doc.linked_docs.length > 0 && (
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Linked documents</p>
                          <p className="text-slate-600 text-sm">{doc.linked_docs.join(', ')}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Description</p>
                      <p className="text-slate-600 text-sm leading-relaxed">{doc.description}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Purpose / Use</p>
                      <p className="text-slate-600 text-sm leading-relaxed">{doc.purpose}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer note */}
          <div className="mt-4 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-slate-400 text-xs leading-relaxed">
              This register supersedes the paper Document Control Register (MFS_Document_Control_Register_V1_0.docx). Retain previous versions for minimum 2 years. Update whenever documents are created, revised, or superseded.
            </p>
          </div>

        </div>
      )}

    </div>
  )
}