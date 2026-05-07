/**
 * app/haccp/documents/[ref]/page.tsx
 *
 * Dedicated document reader page.
 * - Markdown rendered with proper headings, bold, bullets
 * - Auto-generated contents table with anchor jump links
 * - Back button to /haccp/documents
 * - Form documents (MF-001, MMP-MF-001, HM-001) show link tiles instead of full text
 */

'use client'

import { useState, useEffect, useRef, use }  from 'react'
import ReactMarkdown                          from 'react-markdown'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SopEntry {
  sop_ref:     string
  title:       string
  content_md:  string
  version:     string
  source_doc:  string
}

interface TocItem {
  level:  number
  text:   string
  anchor: string
}

// ─── Documents that are forms — show links to app sections instead ────────────

const FORM_DOCS: Record<string, { label: string; description: string; links: { label: string; href: string; desc: string }[] }> = {
  'MF-001': {
    label: 'HACCP Checklists & Monitoring Forms',
    description: 'These forms are built into the HACCP system. Use the links below to go directly to each form.',
    links: [
      { label: 'Cold Storage temperatures (CCP 2)',        href: '/haccp/cold-storage',    desc: 'AM + PM readings for all 5 units — Form 2' },
      { label: 'Process Room temperatures (CCP 3)',        href: '/haccp/process-room',    desc: 'Product + room temp check — Form 3' },
      { label: 'Daily Diary (SOP 1)',                      href: '/haccp/process-room',    desc: 'Opening, operational, closing checks — Form 4' },
      { label: 'Cleaning Diary (SOP 2)',                   href: '/haccp/cleaning',        desc: 'Log each cleaning event — Form 5' },
      { label: 'Delivery Intake (CCP 1)',                  href: '/haccp/delivery',        desc: 'Receipt temperature check — Form 1' },
      { label: 'Product Return (SOP 12)',                  href: '/haccp/product-return',  desc: 'RC01–RC08 return codes — Form 6' },
      { label: 'Thermometer Calibration (SOP 3)',          href: '/haccp/calibration',     desc: 'Monthly ice + boiling water test — Form 7' },
      { label: 'Weekly Review',                            href: '/haccp/reviews',         desc: 'Weekly office review — Form 8' },
      { label: 'Monthly Review',                           href: '/haccp/reviews',         desc: 'Monthly HACCP review — Form 9' },
    ],
  },
  'MMP-MF-001': {
    label: 'Mince & Meat Preparations Monitoring Forms',
    description: 'These forms are built into the Mince / Prep section of the HACCP system.',
    links: [
      { label: 'Mincing Production Log',    href: '/haccp/mince', desc: 'Kill date, input/output temps — Form 10' },
      { label: 'Meat Prep Production Log',  href: '/haccp/mince', desc: 'Input/output temps, allergen check — Form 11' },
      { label: 'Time Separation Log',       href: '/haccp/mince', desc: 'Plain → clean → allergen sequence — Form 12' },
      { label: 'Allergen Training Record',  href: '/haccp/mince', desc: 'Annual training sign-off — Form 13' },
    ],
  },
  'HM-001': {
    label: 'MFS Health Monitoring Forms',
    description: 'These forms are in the People section of the HACCP system.',
    links: [
      { label: 'Staff Health Declaration', href: '/haccp/people', desc: 'Before first shift — Form 15' },
      { label: 'Return to Work Certificate', href: '/haccp/people', desc: 'After illness absence — Form 16' },
      { label: 'Visitors Questionnaire', href: '/haccp/people', desc: 'Every visitor to production — Form 17' },
    ],
  },
  'MFS-FFRA-001': {
    label: 'Food Fraud Risk Assessment',
    description: 'The food fraud vulnerability assessment is maintained as a live record in the HACCP system.',
    links: [
      { label: 'Food Fraud Risk Assessment', href: '/haccp/food-fraud', desc: 'View current assessment and version history — MFS-FFRA-001' },
    ],
  },
  'MFS-FDP-001': {
    label: 'Food Defence Plan',
    description: 'The food defence plan is maintained as a live record in the HACCP system.',
    links: [
      { label: 'Food Defence Plan', href: '/haccp/food-defence', desc: 'View current plan and version history — MFS-FDP-001' },
    ],
  },
  'MFS-ASR-001': {
    label: 'Annual Food Safety Systems Review',
    description: 'The annual systems review is completed and managed digitally in the HACCP system.',
    links: [
      { label: 'Annual Systems Review', href: '/haccp/annual-review', desc: 'View current and past reviews — MFS-ASR-001' },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function buildToc(entries: SopEntry[]): TocItem[] {
  const toc: TocItem[] = []
  const seen = new Map<string, number>()

  for (const entry of entries) {
    const lines = entry.content_md.split('\n')
    for (const line of lines) {
      const h2 = line.match(/^## (.+)/)
      const h3 = line.match(/^### (.+)/)
      const match = h2 ?? h3
      if (!match) continue
      const level  = h2 ? 2 : 3
      const text   = match[1].trim()
      const base   = slugify(text)
      const count  = (seen.get(base) ?? 0)
      const anchor = count === 0 ? base : `${base}-${count}`
      seen.set(base, count + 1)
      toc.push({ level, text, anchor })
    }
  }
  return toc
}

// ─── Markdown component — renders with IDs on headings for TOC links ─────────

function DocMarkdown({ content }: { content: string }) {
  const seen = useRef(new Map<string, number>())

  // Reset seen headings on each render of a new doc
  useEffect(() => { seen.current = new Map() }, [content])

  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => {
          const text   = String(children)
          const base   = slugify(text)
          const count  = seen.current.get(base) ?? 0
          const id     = count === 0 ? base : `${base}-${count}`
          seen.current.set(base, count + 1)
          return <h2 id={id} className="text-slate-900 text-lg font-bold mt-8 mb-3 pb-2 border-b border-blue-100">{children}</h2>
        },
        h3: ({ children }) => {
          const text   = String(children)
          const base   = slugify(text)
          const count  = seen.current.get(base) ?? 0
          const id     = count === 0 ? base : `${base}-${count}`
          seen.current.set(base, count + 1)
          return <h3 id={id} className="text-[#EB6619] text-base font-bold mt-6 mb-2">{children}</h3>
        },
        h4: ({ children }) => <h4 className="text-slate-700 text-sm font-bold mt-4 mb-1">{children}</h4>,
        p:  ({ children }) => <p className="text-slate-600 text-sm leading-relaxed mb-3">{children}</p>,
        ul: ({ children }) => <ul className="text-slate-600 text-sm leading-relaxed mb-3 space-y-1 ml-4">{children}</ul>,
        ol: ({ children }) => <ol className="text-slate-600 text-sm leading-relaxed mb-3 space-y-1 ml-4 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="text-slate-600 text-sm before:content-['•'] before:text-[#EB6619] before:mr-2">{children}</li>,
        strong: ({ children }) => <strong className="text-slate-900 font-semibold">{children}</strong>,
        hr: () => <hr className="border-slate-200 my-6" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[#EB6619] pl-4 my-3 text-slate-500 text-sm italic">{children}</blockquote>
        ),
        code: ({ children }) => (
          <code className="bg-slate-100 text-[#EB6619] text-xs px-1.5 py-0.5 rounded">{children}</code>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="text-left text-slate-400 text-xs uppercase tracking-widest font-bold px-3 py-2 border-b border-slate-300">{children}</th>,
        td: ({ children }) => <td className="text-slate-600 text-sm px-3 py-2 border-b border-blue-100">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Form document — shows links instead of text ─────────────────────────────

function FormDocView({ docRef }: { docRef: string }) {
  const def = FORM_DOCS[docRef]
  if (!def) return null

  return (
    <div className="space-y-4 px-5 py-6">
      <p className="text-slate-400 text-sm leading-relaxed">{def.description}</p>
      <div className="space-y-3">
        {def.links.map((link) => (
          <button key={link.href + link.label}
            onClick={() => { window.location.href = link.href }}
            className="w-full text-left bg-white hover:bg-slate-50 border border-blue-100 hover:border-amber-300 rounded-2xl px-5 py-4 transition-all active:scale-[0.98] flex items-center justify-between gap-4">
            <div>
              <p className="text-slate-900 font-semibold text-sm">{link.label}</p>
              <p className="text-slate-400 text-xs mt-0.5">{link.desc}</p>
            </div>
            <svg className="w-5 h-5 text-[#EB6619] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params)
  const docRef  = decodeURIComponent(ref).toUpperCase()

  // Read ?from= query param for smart back navigation
  const [backHref, setBackHref] = useState('/haccp/documents')
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from')
    if (from && from.startsWith('/haccp')) setBackHref(from)
  }, [])

  const [entries, setEntries]   = useState<SopEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState('')
  const [showToc, setShowToc]   = useState(false)
  const isFormDoc = docRef in FORM_DOCS

  useEffect(() => {
    if (isFormDoc) { setLoading(false); return }

    fetch(`/api/haccp/handbook?doc=${docRef}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d)  => setEntries(d.entries ?? []))
      .catch((e) => setError(`Could not load document — ${e.message}`))
      .finally(()=> setLoading(false))
  }, [docRef, isFormDoc])

  const toc = buildToc(entries)

  // Title — from first entry or form doc label
  const docTitle = isFormDoc
    ? FORM_DOCS[docRef].label
    : entries[0]?.title?.replace(/— Part \d|— Full Document/g, '').trim() ?? docRef

  // Source label
  const sourceLabel = isFormDoc ? docRef : entries[0]?.source_doc ?? ''
  const versionLabel = entries[0]?.version ?? ''

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B] flex-shrink-0">
        <button onClick={() => { window.location.href = backHref }}
          className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[#EB6619] text-[10px] font-bold tracking-widest uppercase">{sourceLabel}</span>
            {versionLabel && <>
              <span className="text-slate-300 text-[10px]">·</span>
              <span className="text-slate-400 text-[10px]">{versionLabel}</span>
            </>}
          </div>
          <h1 className="text-white font-bold text-base leading-tight mt-0.5 truncate">{docTitle}</h1>
        </div>
        {/* Contents button — only for text docs with headings */}
        {!isFormDoc && toc.length > 0 && (
          <button onClick={() => setShowToc(true)}
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded-xl px-3 py-2 text-slate-500 hover:text-white transition-all text-xs font-bold flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
            </svg>
            Contents
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-3 text-slate-400 text-sm mt-20">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Loading…
          </div>
        ) : error ? (
          <p className="text-red-600 text-sm text-center mt-12 px-6">{error}</p>
        ) : isFormDoc ? (
          <FormDocView docRef={docRef} />
        ) : entries.length === 0 ? (
          <p className="text-slate-400 text-sm text-center mt-12 px-6">No content found for {docRef}.</p>
        ) : (
          <div className="px-5 py-6 max-w-3xl">
            {entries.map((entry, i) => (
              <div key={entry.sop_ref}>
                {/* Part divider for multi-part docs */}
                {entries.length > 1 && (
                  <div className="flex items-center gap-3 mb-6 mt-2">
                    <div className="flex-1 h-px bg-slate-50"/>
                    <span className="text-slate-300 text-[10px] uppercase tracking-widest">{entry.title}</span>
                    <div className="flex-1 h-px bg-slate-50"/>
                  </div>
                )}
                <DocMarkdown content={entry.content_md} />
                {i < entries.length - 1 && <div className="my-8 h-px bg-slate-50"/>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table of contents overlay */}
      {showToc && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-end" style={{position:'fixed'}}>
          <div className="bg-white rounded-t-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-blue-100 flex-shrink-0">
              <h3 className="text-slate-900 font-bold text-lg">Contents</h3>
              <button onClick={() => setShowToc(false)}
                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-95">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-1">
              {toc.map((item) => (
                <button key={item.anchor}
                  onClick={() => {
                    setShowToc(false)
                    setTimeout(() => {
                      document.getElementById(item.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 150)
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 transition-all ${
                    item.level === 2 ? 'text-slate-900 font-semibold text-sm' : 'text-slate-500 text-sm pl-8'
                  }`}>
                  {item.level === 3 && <span className="text-[#EB6619] mr-2">›</span>}
                  {item.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
