/**
 * app/haccp/audit/page.tsx
 *
 * HACCP Audit View — admin only
 *
 * Structure:
 * - Date range filter (7d / 30d / 90d)  — global, applies to all sections
 * - Collapsible coverage heatmap         — day-by-day compliance grid
 * - Section tabs                         — one per HACCP area
 * - Master "Export All (XLSX)" button    — downloads all sections as one file
 *
 * Built section by section:
 * ✅ Section 1: Deliveries
 * 🔜 Sections 2–11: Coming
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DatePreset = '7d' | '30d' | '90d'

interface CA {
  id:                            string
  ccp_ref:                       string
  deviation_description:         string
  action_taken:                  string
  product_disposition:           string | null
  recurrence_prevention:         string | null
  management_verification_required: boolean
  resolved:                      boolean
  verified_at:                   string | null
}

interface DeliveryRow {
  id:                          string
  date:                        string
  time_of_delivery:            string | null
  supplier:                    string
  product:                     string
  species:                     string | null
  product_category:            string
  temperature_c:               number
  temp_status:                 string
  covered_contaminated:        string
  contamination_notes:         string | null
  contamination_type:          string | null
  corrective_action_required:  boolean
  batch_number:                string | null
  delivery_number:             number | null
  born_in:                     string | null
  reared_in:                   string | null
  slaughter_site:              string | null
  cut_site:                    string | null
  notes:                       string | null
  submitted_by_name:           string
  ca:                          CA | null
}

interface DeliverySummary {
  total: number; pass: number; urgent: number
  fail: number;  ca_count: number; unresolved: number
}

interface HeatmapDay {
  has_records: boolean
  has_deviations: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short',
  })
}

function fmtTime(t: string | null) {
  if (!t) return '—'
  return t.slice(0, 5)
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 || d.getDay() === 6
}

function getDaysInRange(from: string, to: string): string[] {
  const days: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    days.push(cur.toLocaleDateString('en-CA'))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function presetToRange(preset: DatePreset): { from: string; to: string } {
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return { from: daysAgoStr(days), to: todayStr() }
}

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Status badges ────────────────────────────────────────────────────────────

function TempBadge({ status }: { status: string }) {
  const cls = status === 'pass'   ? 'bg-green-100 text-green-700'
            : status === 'urgent' ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
  const lbl = status === 'pass' ? 'Pass' : status === 'urgent' ? 'Urgent' : 'Fail'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
}

function CABadge({ ca }: { ca: CA | null }) {
  if (!ca) return <span className="text-[10px] text-slate-300">—</span>
  if (!ca.resolved) return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ Unresolved</span>
  )
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ Resolved</span>
  )
}

function ContamBadge({ val }: { val: string }) {
  const isIssue = val !== 'covered_not_contaminated'
  const lbl = val === 'covered_not_contaminated' ? 'Clean'
            : val === 'uncovered_not_contaminated' ? 'Uncovered'
            : 'Issue'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
      isIssue ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
    }`}>{lbl}</span>
  )
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

const HEATMAP_SECTIONS = [
  { key: 'deliveries', label: 'CCP1 Deliveries', variable: true },
  { key: 'cold_am',    label: 'CCP2 Cold AM',    variable: false },
  { key: 'cold_pm',    label: 'CCP2 Cold PM',    variable: false },
  { key: 'room_am',    label: 'CCP3 Room AM',    variable: false },
  { key: 'room_pm',    label: 'CCP3 Room PM',    variable: false },
  { key: 'diary_open',        label: 'Diary Opening',     variable: false },
  { key: 'diary_operational', label: 'Diary Operational', variable: false },
  { key: 'diary_close',       label: 'Diary Closing',     variable: false },
  { key: 'cleaning',   label: 'Cleaning',         variable: false },
  { key: 'mince',      label: 'Mince/Prep',       variable: true  },
  { key: 'calibration', label: 'Calibration',      variable: true  },
]

function HeatCell({ date, section, heatmapData }: {
  date: string
  section: { key: string; variable: boolean }
  heatmapData: Record<string, Record<string, HeatmapDay>>
}) {
  const weekend   = isWeekend(date)
  const dayData   = heatmapData[section.key]?.[date]
  const hasRecord = dayData?.has_records ?? false
  const hasDev    = dayData?.has_deviations ?? false

  if (weekend) return <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200 flex-shrink-0" title="Weekend" />

  let cls = 'bg-slate-50 border-slate-200' // none / not built yet
  let title = 'No data'

  if (section.variable) {
    // Variable frequency (deliveries, mince, calibration) — no record = grey, not red
    if (hasRecord && hasDev)  { cls = 'bg-amber-200 border-amber-300'; title = 'Deviations' }
    else if (hasRecord)       { cls = 'bg-green-200 border-green-300'; title = 'All pass' }
    else                      { cls = 'bg-slate-100 border-slate-200'; title = 'None logged' }
  } else {
    // Expected Mon–Fri — no record is a gap (red)
    if (hasRecord && hasDev)  { cls = 'bg-amber-200 border-amber-300'; title = 'Deviation' }
    else if (hasRecord)       { cls = 'bg-green-200 border-green-300'; title = 'All pass' }
    else                      { cls = 'bg-red-100 border-red-200'; title = 'Gap — no record' }
  }

  return <div className={`w-6 h-6 rounded border flex-shrink-0 ${cls}`} title={`${fmtDateShort(date)}: ${title}`} />
}

function Heatmap({ from, to, heatmapData }: {
  from: string; to: string
  heatmapData: Record<string, Record<string, HeatmapDay>>
}) {
  const days = getDaysInRange(from, to)

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${days.length * 28 + 140}px` }}>
        {/* Day headers */}
        <div className="flex items-center mb-1">
          <div className="w-36 flex-shrink-0" />
          {days.map((d) => (
            <div key={d} className={`w-6 flex-shrink-0 text-center ${isWeekend(d) ? 'opacity-30' : ''}`}>
              <span className="text-[8px] text-slate-400 leading-none">
                {new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
        {/* Month markers */}
        <div className="flex items-center mb-2">
          <div className="w-36 flex-shrink-0" />
          {days.map((d, i) => {
            const isFirst = i === 0 || d.slice(5, 7) !== days[i - 1].slice(5, 7)
            return (
              <div key={d} className="w-6 flex-shrink-0 text-center">
                {isFirst && <span className="text-[8px] text-slate-400 font-bold">
                  {new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}
                </span>}
              </div>
            )
          })}
        </div>
        {/* Section rows */}
        {HEATMAP_SECTIONS.map((section) => (
          <div key={section.key} className="flex items-center mb-1">
            <div className="w-36 flex-shrink-0 pr-2">
              <span className="text-[10px] text-slate-500 font-medium truncate block">{section.label}</span>
            </div>
            {days.map((d) => (
              <div key={d} className="w-6 flex-shrink-0 flex items-center justify-center">
                <HeatCell date={d} section={section} heatmapData={heatmapData} />
              </div>
            ))}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 ml-36">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-200 border border-green-300" />
            <span className="text-[10px] text-slate-500">Pass</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-200 border border-amber-300" />
            <span className="text-[10px] text-slate-500">Deviation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-200 border border-red-300" />
            <span className="text-[10px] text-slate-500">Gap</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
            <span className="text-[10px] text-slate-500">None / Weekend</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Delivery row ─────────────────────────────────────────────────────────────

function DeliveryTableRow({ row }: { row: DeliveryRow }) {
  const [expanded, setExpanded] = useState(false)

  const rowColour = row.temp_status === 'fail' || (row.ca && !row.ca.resolved)
    ? 'bg-red-50 border-red-100'
    : row.temp_status === 'urgent' || (row.covered_contaminated !== 'covered_not_contaminated')
    ? 'bg-amber-50 border-amber-100'
    : 'bg-white border-slate-100'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded((p) => !p)}>
        <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap font-medium">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtTime(row.time_of_delivery)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-700 max-w-32 truncate">{row.supplier}</td>
        <td className="px-3 py-2.5 text-xs text-slate-700 max-w-36 truncate">
          {row.product}{row.species ? ` (${row.species})` : ''}
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <span className={`font-mono font-bold ${
            row.temp_status === 'fail'   ? 'text-red-600'
          : row.temp_status === 'urgent' ? 'text-amber-600'
          : 'text-green-700'
          }`}>{row.temperature_c}°C</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap"><TempBadge status={row.temp_status} /></td>
        <td className="px-3 py-2.5 whitespace-nowrap"><ContamBadge val={row.covered_contaminated} /></td>
        <td className="px-3 py-2.5 whitespace-nowrap"><CABadge ca={row.ca} /></td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={9} className="px-4 pb-4 pt-1">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs ml-2">
              {/* Traceability */}
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Traceability</p>
                <div className="space-y-0.5">
                  {row.batch_number    && <p className="text-slate-600">Batch: <span className="font-mono font-bold text-slate-800">{row.batch_number}</span></p>}
                  {row.delivery_number && <p className="text-slate-600">Delivery #: {row.delivery_number}</p>}
                  {row.born_in         && <p className="text-slate-600">Born in: {row.born_in}</p>}
                  {row.reared_in       && <p className="text-slate-600">Reared in: {row.reared_in}</p>}
                  {row.slaughter_site  && <p className="text-slate-600">Slaughter: {row.slaughter_site}</p>}
                  {row.cut_site        && <p className="text-slate-600">Cut: {row.cut_site}</p>}
                </div>
              </div>
              {/* Notes */}
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Notes</p>
                <div className="space-y-0.5">
                  {row.contamination_notes && <p className="text-slate-600">Contamination: {row.contamination_notes}</p>}
                  {row.contamination_type  && <p className="text-slate-600">Type: {row.contamination_type}</p>}
                  {row.notes               && <p className="text-slate-600">{row.notes}</p>}
                  <p className="text-slate-400 text-[10px] mt-1">Submitted by: {row.submitted_by_name}</p>
                </div>
              </div>
              {/* CA detail */}
              {row.ca && (
                <div className="col-span-2 mt-1">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Corrective Action — {row.ca.ccp_ref}</p>
                  <div className={`rounded-xl px-4 py-3 border space-y-1.5 ${
                    row.ca.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Deviation:</span> {row.ca.deviation_description}</p>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Action taken:</span> {row.ca.action_taken}</p>
                    {row.ca.product_disposition && (
                      <p className="text-slate-700"><span className="font-bold text-slate-500">Disposition:</span> {row.ca.product_disposition}</p>
                    )}
                    {row.ca.recurrence_prevention && (
                      <p className="text-slate-700"><span className="font-bold text-slate-500">Prevention:</span> {row.ca.recurrence_prevention}</p>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      {row.ca.management_verification_required && (
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Mgmt verification required</span>
                      )}
                      {row.ca.resolved
                        ? <span className="text-[10px] font-bold bg-green-200 text-green-700 px-2 py-0.5 rounded-full">✓ Resolved {row.ca.verified_at ? fmtDate(row.ca.verified_at.slice(0, 10)) : ''}</span>
                        : <span className="text-[10px] font-bold bg-red-200 text-red-700 px-2 py-0.5 rounded-full">⚠ Unresolved — action required</span>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Deliveries section ───────────────────────────────────────────────────────

function DeliveriesSection({ from, to, onHeatmapData }: {
  from: string; to: string
  onHeatmapData: (updates: Record<string, Record<string, HeatmapDay>>) => void
}) {
  const [rows,     setRows]     = useState<DeliveryRow[]>([])
  const [summary,  setSummary]  = useState<DeliverySummary | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/haccp/audit?section=deliveries&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setRows(d.rows ?? [])
        setSummary(d.summary ?? null)
        onHeatmapData(d.heatmap ?? { deliveries: {} })
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to, onHeatmapData])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    const headers = [
      'Date', 'Time', 'Supplier', 'Product', 'Species', 'Category',
      'Temp °C', 'Status', 'Contamination', 'Batch No', 'Delivery No',
      'Born in', 'Reared in', 'Slaughter site', 'Cut site', 'Notes',
      'Submitted by', 'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
    ]
    const csvRows = rows.map((r) => [
      r.date, r.time_of_delivery ?? '', r.supplier, r.product, r.species ?? '',
      r.product_category, r.temperature_c, r.temp_status, r.covered_contaminated,
      r.batch_number ?? '', r.delivery_number ?? '', r.born_in ?? '', r.reared_in ?? '',
      r.slaughter_site ?? '', r.cut_site ?? '', r.notes ?? '', r.submitted_by_name,
      r.ca ? 'Yes' : 'No',
      r.ca ? (r.ca.resolved ? 'Yes' : 'No') : '',
      r.ca?.deviation_description ?? '', r.ca?.action_taken ?? '', r.ca?.product_disposition ?? '',
    ])
    downloadCSV(`MFS_Deliveries_${from}_to_${to}.csv`, headers, csvRows)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>Loading deliveries…
    </div>
  )

  if (error) return <p className="text-red-600 text-sm py-4">{error}</p>

  return (
    <div className="space-y-4">
      {/* Summary bar + CSV export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {summary && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total', val: summary.total,      cls: 'bg-slate-100 text-slate-700' },
              { label: 'Pass',  val: summary.pass,       cls: 'bg-green-100 text-green-700' },
              { label: 'Urgent',val: summary.urgent,     cls: 'bg-amber-100 text-amber-700' },
              { label: 'Fail',  val: summary.fail,       cls: 'bg-red-100 text-red-700' },
              { label: 'CAs',   val: summary.ca_count,   cls: 'bg-blue-100 text-blue-700' },
              { label: 'Unresolved', val: summary.unresolved, cls: summary.unresolved > 0 ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-100 text-slate-500' },
            ].map((s) => (
              <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
          <p className="text-slate-400 text-sm">No deliveries in this date range</p>
        </div>
      ) : (
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: '700px' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Date','Time','Supplier','Product','Temp','Status','Contam','CA',''].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <DeliveryTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Cold Storage section ─────────────────────────────────────────────────────

interface ColdStorageRow {
  id:                         string
  date:                       string
  session:                    string
  temperature_c:              number
  temp_status:                string
  comments:                   string | null
  corrective_action_required: boolean
  submitted_by_name:          string
  unit:                       { name: string; unit_type: string; target_temp_c: number; max_temp_c: number } | null
  ca:                         CA | null
}

interface ColdStorageSummary {
  total: number; pass: number; amber: number
  critical: number; ca_count: number; unresolved: number
}

function ColdTempBadge({ status }: { status: string }) {
  const cls = status === 'pass'     ? 'bg-green-100 text-green-700'
            : status === 'amber'    ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
  const lbl = status === 'pass' ? 'Pass' : status === 'amber' ? 'Amber' : 'Critical'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
}

function ColdStorageTableRow({ row }: { row: ColdStorageRow }) {
  const [expanded, setExpanded] = useState(false)

  const rowColour = row.temp_status === 'critical' || (row.ca && !row.ca.resolved)
    ? 'bg-red-50 border-red-100'
    : row.temp_status === 'amber'
    ? 'bg-amber-50 border-amber-100'
    : 'bg-white border-slate-100'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded((p) => !p)}>
        <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap font-medium">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.session === 'AM' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
            {row.session}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-700 max-w-32 truncate">{row.unit?.name ?? '—'}</td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <span className={`font-mono font-bold ${
            row.temp_status === 'critical' ? 'text-red-600'
          : row.temp_status === 'amber'    ? 'text-amber-600'
          : 'text-green-700'
          }`}>{row.temperature_c}°C</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap"><ColdTempBadge status={row.temp_status} /></td>
        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-28 truncate">{row.comments ?? '—'}</td>
        <td className="px-3 py-2.5 whitespace-nowrap"><CABadge ca={row.ca} /></td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={8} className="px-4 pb-4 pt-1">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs ml-2">
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Unit details</p>
                <div className="space-y-0.5">
                  {row.unit && <>
                    <p className="text-slate-600">Type: {row.unit.unit_type}</p>
                    <p className="text-slate-600">Target: <span className="font-mono font-bold">{row.unit.target_temp_c}°C</span></p>
                    <p className="text-slate-600">Max: <span className="font-mono font-bold">{row.unit.max_temp_c}°C</span></p>
                  </>}
                  <p className="text-slate-400 text-[10px] mt-1">Submitted by: {row.submitted_by_name}</p>
                </div>
              </div>
              {row.comments && (
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Comments</p>
                  <p className="text-slate-600">{row.comments}</p>
                </div>
              )}
              {row.ca && (
                <div className="col-span-2 mt-1">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Corrective Action — {row.ca.ccp_ref}</p>
                  <div className={`rounded-xl px-4 py-3 border space-y-1.5 ${row.ca.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Deviation:</span> {row.ca.deviation_description}</p>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Action taken:</span> {row.ca.action_taken}</p>
                    {row.ca.product_disposition && <p className="text-slate-700"><span className="font-bold text-slate-500">Disposition:</span> {row.ca.product_disposition}</p>}
                    <div className="flex items-center gap-2 pt-0.5">
                      {row.ca.management_verification_required && (
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Mgmt verification required</span>
                      )}
                      {row.ca.resolved
                        ? <span className="text-[10px] font-bold bg-green-200 text-green-700 px-2 py-0.5 rounded-full">✓ Resolved</span>
                        : <span className="text-[10px] font-bold bg-red-200 text-red-700 px-2 py-0.5 rounded-full">⚠ Unresolved</span>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ColdStorageSection({ from, to, onHeatmapData }: {
  from: string; to: string
  onHeatmapData: (updates: Record<string, Record<string, HeatmapDay>>) => void
}) {
  const [rows,    setRows]    = useState<ColdStorageRow[]>([])
  const [summary, setSummary] = useState<ColdStorageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/haccp/audit?section=cold_storage&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return }
        setRows(d.rows ?? [])
        setSummary(d.summary ?? null)
        onHeatmapData(d.heatmap ?? { cold_am: {}, cold_pm: {} })
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to, onHeatmapData])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    const headers = [
      'Date', 'Session', 'Unit', 'Unit Type', 'Target Temp °C', 'Max Temp °C',
      'Temp °C', 'Status', 'Comments', 'Submitted by',
      'CA logged', 'CA resolved', 'CA deviation', 'CA action taken', 'CA disposition',
    ]
    const csvRows = rows.map((r) => [
      r.date, r.session, r.unit?.name ?? '', r.unit?.unit_type ?? '',
      r.unit?.target_temp_c ?? '', r.unit?.max_temp_c ?? '',
      r.temperature_c, r.temp_status, r.comments ?? '', r.submitted_by_name,
      r.ca ? 'Yes' : 'No',
      r.ca ? (r.ca.resolved ? 'Yes' : 'No') : '',
      r.ca?.deviation_description ?? '', r.ca?.action_taken ?? '', r.ca?.product_disposition ?? '',
    ])
    downloadCSV(`MFS_ColdStorage_${from}_to_${to}.csv`, headers, csvRows)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>Loading cold storage…
    </div>
  )

  if (error) return <p className="text-red-600 text-sm py-4">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {summary && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total',      val: summary.total,      cls: 'bg-slate-100 text-slate-700' },
              { label: 'Pass',       val: summary.pass,       cls: 'bg-green-100 text-green-700' },
              { label: 'Amber',      val: summary.amber,      cls: 'bg-amber-100 text-amber-700' },
              { label: 'Critical',   val: summary.critical,   cls: 'bg-red-100 text-red-700' },
              { label: 'CAs',        val: summary.ca_count,   cls: 'bg-blue-100 text-blue-700' },
              { label: 'Unresolved', val: summary.unresolved, cls: summary.unresolved > 0 ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-100 text-slate-500' },
            ].map((s) => (
              <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
          <p className="text-slate-400 text-sm">No cold storage records in this date range</p>
        </div>
      ) : (
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: '620px' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Date','Session','Unit','Temp','Status','Comments','CA',''].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <ColdStorageTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Process Room section ─────────────────────────────────────────────────────

const CHECK_LABELS: Record<string, string> = {
  ppe: 'PPE worn correctly', health: 'Health declaration confirmed',
  no_food: 'No food or drink in area', hairnets: 'Hair nets in place',
  handwash: 'Hands washed before entry', plasters: 'All cuts covered with blue plasters',
  jewellery: 'No jewellery worn', room_temp: 'Room temperature checked',
  steriliser: 'Steriliser checked (≥82°C)', handwashing: 'Hand washing facilities available',
  hygiene: 'Personal hygiene maintained', cleaning: 'Equipment cleaned between products',
  equipment: 'Equipment in good condition', temp_limits: 'Temperature limits maintained',
  contamination: 'No cross-contamination observed',
  waste: 'Waste disposed correctly', secured: 'Area secured',
  equip_clean: 'All equipment cleaned', product_chilled: 'All products in cold storage',
  steriliser_clean: 'Steriliser cleaned and stored',
}

interface ProcessTempRow {
  id: string; date: string; session: string
  product_temp_c: number; room_temp_c: number
  product_within_limit: boolean; room_within_limit: boolean; within_limits: boolean
  corrective_action_required: boolean; submitted_by_name: string; ca: CA | null
}

interface DiaryRow {
  id: string; date: string; phase: string
  check_results: Record<string, boolean>
  issues: boolean; what_did_you_do: string | null
  submitted_by_name: string; ca: CA | null
}

function PhaseBadge({ phase }: { phase: string }) {
  const cls = phase === 'opening'     ? 'bg-blue-100 text-blue-700'
            : phase === 'operational' ? 'bg-purple-100 text-purple-700'
            : 'bg-slate-100 text-slate-600'
  const lbl = phase === 'opening' ? 'Opening' : phase === 'operational' ? 'Operational' : 'Closing'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
}

function ProcessTempTableRow({ row }: { row: ProcessTempRow }) {
  const [expanded, setExpanded] = useState(false)
  const rowColour = !row.within_limits || (row.ca && !row.ca.resolved)
    ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded(p => !p)}>
        <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.session === 'AM' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{row.session}</span>
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <span className={`font-mono font-bold ${!row.product_within_limit ? 'text-red-600' : 'text-green-700'}`}>{row.product_temp_c}°C</span>
          <span className={`ml-1 text-[10px] ${!row.product_within_limit ? 'text-red-500' : 'text-green-500'}`}>{row.product_within_limit ? '✓' : '✗'}</span>
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <span className={`font-mono font-bold ${!row.room_within_limit ? 'text-red-600' : 'text-green-700'}`}>{row.room_temp_c}°C</span>
          <span className={`ml-1 text-[10px] ${!row.room_within_limit ? 'text-red-500' : 'text-green-500'}`}>{row.room_within_limit ? '✓' : '✗'}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.within_limits ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {row.within_limits ? 'Pass' : 'Fail'}
          </span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap"><CABadge ca={row.ca} /></td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={7} className="px-4 pb-3 pt-1">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs ml-2">
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Limits</p>
                <p className="text-slate-600">Product: ≤4°C · Room: ≤12°C</p>
                <p className="text-slate-400 text-[10px] mt-1">Submitted by: {row.submitted_by_name}</p>
              </div>
              {row.ca && (
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">CA — {row.ca.ccp_ref}</p>
                  <div className={`rounded-xl px-3 py-2 border ${row.ca.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-slate-700 text-xs">{row.ca.deviation_description}</p>
                    <p className="text-slate-600 text-xs mt-1">Action: {row.ca.action_taken}</p>
                    {row.ca.product_disposition && <p className="text-slate-600 text-xs">Disposition: {row.ca.product_disposition}</p>}
                    <p className={`text-[10px] font-bold mt-1 ${row.ca.resolved ? 'text-green-600' : 'text-red-600'}`}>
                      {row.ca.resolved ? '✓ Resolved' : '⚠ Unresolved'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function DiaryTableRow({ row }: { row: DiaryRow }) {
  const [expanded, setExpanded] = useState(false)
  const checks = row.check_results ?? {}
  const vals = Object.values(checks)
  const passed = vals.filter(Boolean).length
  const rowColour = row.issues && !row.what_did_you_do?.trim()
    ? 'bg-red-50 border-red-100'
    : row.issues ? 'bg-amber-50 border-amber-100'
    : 'bg-white border-slate-100'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded(p => !p)}>
        <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5"><PhaseBadge phase={row.phase} /></td>
        <td className="px-3 py-2.5">
          <span className={`text-xs font-bold ${passed < vals.length ? 'text-red-600' : 'text-green-700'}`}>{passed}/{vals.length}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.issues ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
            {row.issues ? 'Yes' : 'No'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-40 truncate">{row.what_did_you_do ?? '—'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-400">{row.submitted_by_name}</td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={7} className="px-4 pb-3 pt-1">
            <div className="ml-2 space-y-1">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Check breakdown</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(checks).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${val ? 'text-green-500' : 'text-red-500'}`}>{val ? '✓' : '✗'}</span>
                    <span className={`text-xs ${val ? 'text-slate-600' : 'text-red-700 font-semibold'}`}>{CHECK_LABELS[key] ?? key}</span>
                  </div>
                ))}
              </div>
              {row.what_did_you_do && (
                <p className="text-slate-600 text-xs mt-2 pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-500">Action taken: </span>{row.what_did_you_do}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ProcessRoomSection({ from, to, onHeatmapData }: {
  from: string; to: string
  onHeatmapData: (updates: Record<string, Record<string, HeatmapDay>>) => void
}) {
  const [subTab,       setSubTab]       = useState<'temps' | 'diary'>('temps')
  const [tempRows,     setTempRows]     = useState<ProcessTempRow[]>([])
  const [diaryRows,    setDiaryRows]    = useState<DiaryRow[]>([])
  const [tempSummary,  setTempSummary]  = useState<{ total:number; pass:number; fail:number; ca_count:number; unresolved:number } | null>(null)
  const [diarySummary, setDiarySummary] = useState<{ total:number; with_issues:number; opening:number; operational:number; closing:number } | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/haccp/audit?section=process_room&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setTempRows(d.tempRows ?? [])
        setDiaryRows(d.diaryRows ?? [])
        setTempSummary(d.tempSummary ?? null)
        setDiarySummary(d.diarySummary ?? null)
        onHeatmapData(d.heatmap ?? {})
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to, onHeatmapData])

  useEffect(() => { load() }, [load])

  function exportTempCSV() {
    const headers = ['Date','Session','Product Temp °C','Room Temp °C','Product Pass','Room Pass','Overall','CA logged','CA resolved','CA deviation','CA action taken','CA disposition','Submitted by']
    const rows = tempRows.map(r => [r.date, r.session, r.product_temp_c, r.room_temp_c, r.product_within_limit?'Yes':'No', r.room_within_limit?'Yes':'No', r.within_limits?'Pass':'Fail', r.ca?'Yes':'No', r.ca?(r.ca.resolved?'Yes':'No'):'', r.ca?.deviation_description??'', r.ca?.action_taken??'', r.ca?.product_disposition??'', r.submitted_by_name])
    downloadCSV(`MFS_ProcessRoom_Temps_${from}_to_${to}.csv`, headers, rows)
  }

  function exportDiaryCSV() {
    const headers = ['Date','Phase','Checks Passed','Total Checks','Issues','Action Taken','Submitted by']
    const rows = diaryRows.map(r => {
      const vals = Object.values(r.check_results ?? {})
      return [r.date, r.phase, vals.filter(Boolean).length, vals.length, r.issues?'Yes':'No', r.what_did_you_do??'', r.submitted_by_name]
    })
    downloadCSV(`MFS_ProcessRoom_Diary_${from}_to_${to}.csv`, headers, rows)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
      Loading process room…
    </div>
  )
  if (error) return <p className="text-red-600 text-sm py-4">{error}</p>

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {(['temps', 'diary'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${subTab === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'}`}>
            {t === 'temps' ? 'Temperatures' : 'Daily Diary'}
          </button>
        ))}
      </div>

      {subTab === 'temps' && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {tempSummary && (
              <div className="flex items-center gap-3 flex-wrap">
                {[
                  { label: 'Total', val: tempSummary.total, cls: 'bg-slate-100 text-slate-700' },
                  { label: 'Pass',  val: tempSummary.pass,  cls: 'bg-green-100 text-green-700' },
                  { label: 'Fail',  val: tempSummary.fail,  cls: 'bg-red-100 text-red-700' },
                  { label: 'CAs',   val: tempSummary.ca_count, cls: 'bg-blue-100 text-blue-700' },
                  { label: 'Unresolved', val: tempSummary.unresolved, cls: tempSummary.unresolved > 0 ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-100 text-slate-500' },
                ].map(s => (
                  <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                    <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={exportTempCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV
            </button>
          </div>
          {tempRows.length === 0 ? (
            <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center"><p className="text-slate-400 text-sm">No temperature records in this date range</p></div>
          ) : (
            <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" style={{ minWidth: '580px' }}>
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    {['Date','Session','Product','Room','Overall','CA',''].map(h => (
                      <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{tempRows.map(r => <ProcessTempTableRow key={r.id} row={r} />)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {subTab === 'diary' && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {diarySummary && (
              <div className="flex items-center gap-3 flex-wrap">
                {[
                  { label: 'Total',       val: diarySummary.total,       cls: 'bg-slate-100 text-slate-700' },
                  { label: 'Issues',      val: diarySummary.with_issues, cls: diarySummary.with_issues > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500' },
                  { label: 'Opening',     val: diarySummary.opening,     cls: 'bg-blue-100 text-blue-700' },
                  { label: 'Operational', val: diarySummary.operational, cls: 'bg-purple-100 text-purple-700' },
                  { label: 'Closing',     val: diarySummary.closing,     cls: 'bg-slate-100 text-slate-600' },
                ].map(s => (
                  <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                    <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={exportDiaryCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV
            </button>
          </div>
          {diaryRows.length === 0 ? (
            <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center"><p className="text-slate-400 text-sm">No diary entries in this date range</p></div>
          ) : (
            <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" style={{ minWidth: '520px' }}>
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    {['Date','Phase','Checks','Issues','Action','By',''].map(h => (
                      <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{diaryRows.map(r => <DiaryTableRow key={r.id} row={r} />)}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Cleaning section ─────────────────────────────────────────────────────────

interface CleaningRow {
  id:               string
  date:             string
  time_of_clean:    string | null
  what_was_cleaned: string
  issues:           boolean
  what_did_you_do:  string | null
  sanitiser_temp_c: number | null
  verified_by:      string | null
  submitted_by_name:string
  ca:               CA | null
}

interface CleaningSummary {
  total: number; no_issues: number; with_issues: number
  sanitiser_fail: number; ca_count: number; unresolved: number
}

function SanitiserBadge({ temp }: { temp: number | null }) {
  if (temp === null) return <span className="text-[10px] text-slate-300">—</span>
  const pass = temp >= 82
  return (
    <span className={`text-xs font-mono font-bold ${pass ? 'text-green-700' : 'text-red-600'}`}>
      {temp}°C {pass ? '✓' : '✗'}
    </span>
  )
}

function formatCleanedItems(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function truncateCleaned(raw: string, max = 3): string {
  const items = formatCleanedItems(raw)
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} +${items.length - max} more`
}

function CleaningTableRow({ row }: { row: CleaningRow }) {
  const [expanded, setExpanded] = useState(false)
  const rowColour =
    (row.ca && !row.ca.resolved) || (row.issues && !row.what_did_you_do?.trim())
      ? 'bg-red-50 border-red-100'
      : row.issues ? 'bg-amber-50 border-amber-100'
      : 'bg-white border-slate-100'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded(p => !p)}>
        <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtTime(row.time_of_clean)}</td>
        <td className="px-3 py-2.5 whitespace-nowrap"><SanitiserBadge temp={row.sanitiser_temp_c} /></td>
        <td className="px-3 py-2.5 text-xs text-slate-600 max-w-48 truncate">{truncateCleaned(row.what_was_cleaned)}</td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.issues ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
            {row.issues ? 'Yes' : 'No'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-36 truncate">{row.what_did_you_do ?? '—'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{row.verified_by ?? '—'}</td>
        <td className="px-3 py-2.5 whitespace-nowrap"><CABadge ca={row.ca} /></td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={9} className="px-4 pb-3 pt-1">
            <div className="ml-2 space-y-3">
              {/* Full items list */}
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">Items cleaned</p>
                <div className="flex flex-wrap gap-1.5">
                  {formatCleanedItems(row.what_was_cleaned).map((item, i) => (
                    <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{item}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-6 text-xs">
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Sanitiser temp</p>
                  {row.sanitiser_temp_c !== null ? (
                    <p className={`font-mono font-bold ${row.sanitiser_temp_c >= 82 ? 'text-green-700' : 'text-red-600'}`}>
                      {row.sanitiser_temp_c}°C {row.sanitiser_temp_c >= 82 ? '✓' : '✗ (limit ≥82°C)'}
                    </p>
                  ) : <p className="text-slate-400">Not recorded</p>}
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Verified by</p>
                  <p className="text-slate-600">{row.verified_by ?? '—'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Submitted by</p>
                  <p className="text-slate-600">{row.submitted_by_name}</p>
                </div>
              </div>
              {row.what_did_you_do && (
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Action taken</p>
                  <p className="text-slate-700 text-xs">{row.what_did_you_do}</p>
                </div>
              )}
              {row.ca && (
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">CA — {row.ca.ccp_ref}</p>
                  <div className={`rounded-xl px-3 py-2.5 border text-xs space-y-1 ${row.ca.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Deviation:</span> {row.ca.deviation_description}</p>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Action:</span> {row.ca.action_taken}</p>
                    {row.ca.product_disposition && <p className="text-slate-700"><span className="font-bold text-slate-500">Disposition:</span> {row.ca.product_disposition}</p>}
                    <p className={`text-[10px] font-bold ${row.ca.resolved ? 'text-green-600' : 'text-red-600'}`}>
                      {row.ca.resolved ? '✓ Resolved' : '⚠ Unresolved — action required'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CleaningSection({ from, to, onHeatmapData }: {
  from: string; to: string
  onHeatmapData: (updates: Record<string, Record<string, HeatmapDay>>) => void
}) {
  const [rows,    setRows]    = useState<CleaningRow[]>([])
  const [summary, setSummary] = useState<CleaningSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/haccp/audit?section=cleaning&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.rows ?? [])
        setSummary(d.summary ?? null)
        onHeatmapData(d.heatmap ?? { cleaning: {} })
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to, onHeatmapData])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    const headers = ['Date','Time','What was cleaned','Sanitiser °C','Sanitiser pass','Issues','Action taken','Verified by','CA logged','CA resolved','CA deviation','CA action taken']
    const csvRows = rows.map(r => {
      const temp = r.sanitiser_temp_c
      return [
        r.date, fmtTime(r.time_of_clean), r.what_was_cleaned,
        temp ?? '', temp !== null ? (temp >= 82 ? 'Yes' : 'No') : '',
        r.issues ? 'Yes' : 'No', r.what_did_you_do ?? '', r.verified_by ?? '',
        r.ca ? 'Yes' : 'No', r.ca ? (r.ca.resolved ? 'Yes' : 'No') : '',
        r.ca?.deviation_description ?? '', r.ca?.action_taken ?? '',
      ]
    })
    downloadCSV(`MFS_Cleaning_${from}_to_${to}.csv`, headers, csvRows)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
      Loading cleaning records…
    </div>
  )
  if (error) return <p className="text-red-600 text-sm py-4">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {summary && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total',          val: summary.total,          cls: 'bg-slate-100 text-slate-700' },
              { label: 'No issues',      val: summary.no_issues,      cls: 'bg-green-100 text-green-700' },
              { label: 'Issues',         val: summary.with_issues,    cls: summary.with_issues > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500' },
              { label: 'Sanitiser fail', val: summary.sanitiser_fail, cls: summary.sanitiser_fail > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500' },
              { label: 'CAs',            val: summary.ca_count,       cls: 'bg-blue-100 text-blue-700' },
              { label: 'Unresolved',     val: summary.unresolved,     cls: summary.unresolved > 0 ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-100 text-slate-500' },
            ].map(s => (
              <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
          <p className="text-slate-400 text-sm">No cleaning records in this date range</p>
        </div>
      ) : (
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: '680px' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Date','Time','Sanitiser','What cleaned','Issues','Action','Verified','CA',''].map(h => (
                    <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => <CleaningTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Calibration section ──────────────────────────────────────────────────────

interface CalibrationRow {
  id:                    string
  date:                  string
  time_of_check:         string | null
  thermometer_id:        string
  calibration_mode:      string
  ice_water_result_c:    number | null
  ice_water_pass:        boolean | null
  boiling_water_result_c:number | null
  boiling_water_pass:    boolean | null
  action_taken:          string | null
  cert_reference:        string | null
  purchase_date:         string | null
  verified_by:           string | null
  submitted_by_name:     string
  ca:                    CA | null
}

interface CalibrationSummary {
  total: number; manual: number; certified: number
  pass: number; fail: number; ca_count: number; unresolved: number
}

function CalibResultCell({ val, pass }: { val: number | null; pass: boolean | null }) {
  if (val === null) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span className={`text-xs font-mono font-bold ${pass ? 'text-green-700' : 'text-red-600'}`}>
      {val}°C {pass ? '✓' : '✗'}
    </span>
  )
}

function CalibrationTableRow({ row }: { row: CalibrationRow }) {
  const [expanded, setExpanded] = useState(false)
  const isCertified = row.calibration_mode === 'certified_probe'
  const hasFailure  = !isCertified && (row.ice_water_pass === false || row.boiling_water_pass === false)
  const rowColour   = (hasFailure || (row.ca && !row.ca.resolved))
    ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'

  const overallLabel = isCertified ? 'Certified ✓'
    : (row.ice_water_pass && row.boiling_water_pass) ? 'Pass' : 'Fail'
  const overallCls = isCertified ? 'bg-blue-100 text-blue-700'
    : (row.ice_water_pass && row.boiling_water_pass)
      ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded(p => !p)}>
        <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtTime(row.time_of_check)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-700 max-w-28 truncate font-medium">{row.thermometer_id}</td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCertified ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {isCertified ? 'Certified' : 'Manual'}
          </span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {isCertified
            ? <span className="text-slate-400 text-xs italic">n/a</span>
            : <CalibResultCell val={row.ice_water_result_c} pass={row.ice_water_pass} />
          }
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {isCertified
            ? <span className="text-slate-400 text-xs italic">n/a</span>
            : <CalibResultCell val={row.boiling_water_result_c} pass={row.boiling_water_pass} />
          }
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${overallCls}`}>{overallLabel}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap"><CABadge ca={row.ca} /></td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={9} className="px-4 pb-3 pt-1">
            <div className="ml-2 space-y-2 text-xs">
              {isCertified ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-blue-800 text-[10px] font-bold uppercase tracking-widest">Certified probe — manufacturer calibration</p>
                  <p className="text-slate-700">No manual ice/boiling water test required — calibration is certified by the manufacturer to a traceable standard.</p>
                  {row.cert_reference && <p className="text-slate-700"><span className="font-bold text-slate-500">Cert reference:</span> <span className="font-mono">{row.cert_reference}</span></p>}
                  {row.purchase_date  && <p className="text-slate-700"><span className="font-bold text-slate-500">Purchase date:</span> {fmtDate(row.purchase_date)}</p>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Test limits</p>
                    <p className="text-slate-600">Ice water: 0°C ±1°C</p>
                    <p className="text-slate-600">Boiling water: 100°C ±1°C</p>
                  </div>
                  {row.action_taken && (
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Action taken</p>
                      <p className="text-slate-700">{row.action_taken}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-4 text-xs pt-1">
                {row.verified_by && <p className="text-slate-500">Verified by: <span className="font-medium text-slate-700">{row.verified_by}</span></p>}
                <p className="text-slate-400">Submitted by: {row.submitted_by_name}</p>
              </div>
              {row.ca && (
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">CA — {row.ca.ccp_ref}</p>
                  <div className={`rounded-xl px-3 py-2.5 border space-y-1 ${row.ca.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Deviation:</span> {row.ca.deviation_description}</p>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Action:</span> {row.ca.action_taken}</p>
                    <p className={`text-[10px] font-bold ${row.ca.resolved ? 'text-green-600' : 'text-red-600'}`}>
                      {row.ca.resolved ? '✓ Resolved' : '⚠ Unresolved'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CalibrationSection({ from, to, onHeatmapData }: {
  from: string; to: string
  onHeatmapData: (updates: Record<string, Record<string, HeatmapDay>>) => void
}) {
  const [rows,    setRows]    = useState<CalibrationRow[]>([])
  const [summary, setSummary] = useState<CalibrationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/haccp/audit?section=calibration&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.rows ?? [])
        setSummary(d.summary ?? null)
        onHeatmapData(d.heatmap ?? { calibration: {} })
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to, onHeatmapData])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    const headers = ['Date','Time','Probe ID','Mode','Ice water °C','Ice pass','Boiling water °C','Boiling pass','Overall','Cert reference','Purchase date','Action taken','Verified by','CA logged','CA resolved','CA deviation','CA action taken']
    const csvRows = rows.map(r => {
      const isCert = r.calibration_mode === 'certified_probe'
      const overall = isCert ? 'Certified' : (r.ice_water_pass && r.boiling_water_pass ? 'Pass' : 'Fail')
      return [
        r.date, fmtTime(r.time_of_check), r.thermometer_id, r.calibration_mode,
        r.ice_water_result_c ?? '', r.ice_water_pass !== null ? (r.ice_water_pass ? 'Yes' : 'No') : '',
        r.boiling_water_result_c ?? '', r.boiling_water_pass !== null ? (r.boiling_water_pass ? 'Yes' : 'No') : '',
        overall, r.cert_reference ?? '', r.purchase_date ?? '',
        r.action_taken ?? '', r.verified_by ?? '',
        r.ca ? 'Yes' : 'No', r.ca ? (r.ca.resolved ? 'Yes' : 'No') : '',
        r.ca?.deviation_description ?? '', r.ca?.action_taken ?? '',
      ]
    })
    downloadCSV(`MFS_Calibration_${from}_to_${to}.csv`, headers, csvRows)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
      Loading calibration records…
    </div>
  )
  if (error) return <p className="text-red-600 text-sm py-4">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {summary && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total',       val: summary.total,      cls: 'bg-slate-100 text-slate-700' },
              { label: 'Manual pass', val: summary.pass,       cls: 'bg-green-100 text-green-700' },
              { label: 'Manual fail', val: summary.fail,       cls: summary.fail > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500' },
              { label: 'Certified',   val: summary.certified,  cls: 'bg-blue-100 text-blue-700' },
              { label: 'CAs',         val: summary.ca_count,   cls: 'bg-blue-100 text-blue-700' },
              { label: 'Unresolved',  val: summary.unresolved, cls: summary.unresolved > 0 ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-100 text-slate-500' },
            ].map(s => (
              <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
          <p className="text-slate-400 text-sm">No calibration records in this date range</p>
        </div>
      ) : (
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: '700px' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Date','Time','Probe','Mode','Ice','Boiling','Overall','CA',''].map(h => (
                    <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => <CalibrationTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Mince & Prep section ─────────────────────────────────────────────────────

interface MinceRow {
  id:                     string
  date:                   string
  time_of_production:     string | null
  batch_code:             string
  product_species:        string
  output_mode:            string
  kill_date:              string | null
  days_from_kill:         number | null
  kill_date_within_limit: boolean
  input_temp_c:           number
  output_temp_c:          number
  input_temp_pass:        boolean
  output_temp_pass:       boolean
  corrective_action:      string | null
  source_batch_numbers:   string[] | null
  submitted_by_name:      string
  ca:                     CA | null
}

interface MinceSummary {
  total: number; all_pass: number; temp_fails: number
  kill_fails: number; with_ca_note: number; linked_cas: number; unresolved: number
}

function MinceTableRow({ row }: { row: MinceRow }) {
  const [expanded, setExpanded] = useState(false)
  const allPass  = row.input_temp_pass && row.output_temp_pass && row.kill_date_within_limit
  const rowColour = (!allPass || (row.ca && !row.ca.resolved))
    ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'

  const overallLabel = allPass ? 'Pass'
    : [!row.input_temp_pass && 'Input', !row.output_temp_pass && 'Output', !row.kill_date_within_limit && 'Kill']
        .filter(Boolean).join(', ') + ' fail'

  return (
    <>
      <tr className={`border-b ${rowColour} cursor-pointer`} onClick={() => setExpanded(p => !p)}>
        <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{fmtDateShort(row.date)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtTime(row.time_of_production)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-700 capitalize">{row.product_species}</td>
        <td className="px-3 py-2.5 text-xs font-mono text-slate-600 max-w-32 truncate">{row.batch_code}</td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <span className={`font-mono font-bold ${!row.input_temp_pass ? 'text-red-600' : 'text-green-700'}`}>{row.input_temp_c}°C</span>
          <span className={`ml-1 text-[10px] ${!row.input_temp_pass ? 'text-red-500' : 'text-green-500'}`}>{row.input_temp_pass ? '✓' : '✗'}</span>
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <span className={`font-mono font-bold ${!row.output_temp_pass ? 'text-red-600' : 'text-green-700'}`}>{row.output_temp_c}°C</span>
          <span className={`ml-1 text-[10px] ${!row.output_temp_pass ? 'text-red-500' : 'text-green-500'}`}>{row.output_temp_pass ? '✓' : '✗'}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${allPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {overallLabel}
          </span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap"><CABadge ca={row.ca} /></td>
        <td className="px-3 py-2.5">
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColour}`}>
          <td colSpan={9} className="px-4 pb-3 pt-1">
            <div className="ml-2 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Batch details</p>
                <p className="text-slate-600">Mode: <span className="font-medium capitalize">{row.output_mode}</span></p>
                {row.kill_date && <p className="text-slate-600">Kill date: {fmtDate(row.kill_date)}</p>}
                {row.days_from_kill !== null && (
                  <p className={`${!row.kill_date_within_limit ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                    Days from kill: {row.days_from_kill} {row.kill_date_within_limit ? '✓' : '✗ (exceeds limit)'}
                  </p>
                )}
                {row.source_batch_numbers && row.source_batch_numbers.length > 0 && (
                  <p className="text-slate-600">Source batches: <span className="font-mono">{row.source_batch_numbers.join(', ')}</span></p>
                )}
                <p className="text-slate-400 text-[10px] mt-1">Submitted by: {row.submitted_by_name}</p>
              </div>
              {row.corrective_action && (
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Corrective action note</p>
                  <p className="text-slate-700">{row.corrective_action}</p>
                </div>
              )}
              {row.ca && (
                <div className="col-span-2">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Linked CA — {row.ca.ccp_ref}</p>
                  <div className={`rounded-xl px-3 py-2.5 border text-xs space-y-1 ${row.ca.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Deviation:</span> {row.ca.deviation_description}</p>
                    <p className="text-slate-700"><span className="font-bold text-slate-500">Action:</span> {row.ca.action_taken}</p>
                    {row.ca.product_disposition && <p className="text-slate-700"><span className="font-bold text-slate-500">Disposition:</span> {row.ca.product_disposition}</p>}
                    <p className={`text-[10px] font-bold ${row.ca.resolved ? 'text-green-600' : 'text-red-600'}`}>
                      {row.ca.resolved ? '✓ Resolved' : '⚠ Unresolved'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function MinceSection({ from, to, onHeatmapData }: {
  from: string; to: string
  onHeatmapData: (updates: Record<string, Record<string, HeatmapDay>>) => void
}) {
  const [rows,    setRows]    = useState<MinceRow[]>([])
  const [summary, setSummary] = useState<MinceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/haccp/audit?section=mince&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.rows ?? [])
        setSummary(d.summary ?? null)
        onHeatmapData(d.heatmap ?? { mince: {} })
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [from, to, onHeatmapData])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    const headers = ['Date','Time','Species','Batch code','Mode','Input temp °C','Input pass','Output temp °C','Output pass','Kill date','Days from kill','Kill limit pass','CA note','Source batches','Linked CA','CA resolved']
    const csvRows = rows.map(r => [
      r.date, fmtTime(r.time_of_production), r.product_species, r.batch_code, r.output_mode,
      r.input_temp_c, r.input_temp_pass ? 'Yes' : 'No',
      r.output_temp_c, r.output_temp_pass ? 'Yes' : 'No',
      r.kill_date ?? '', r.days_from_kill ?? '', r.kill_date_within_limit ? 'Yes' : 'No',
      r.corrective_action ?? '', (r.source_batch_numbers ?? []).join(', '),
      r.ca ? 'Yes' : 'No', r.ca ? (r.ca.resolved ? 'Yes' : 'No') : '',
    ])
    downloadCSV(`MFS_Mince_${from}_to_${to}.csv`, headers, csvRows)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
      Loading mince & prep records…
    </div>
  )
  if (error) return <p className="text-red-600 text-sm py-4">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {summary && (
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total',       val: summary.total,       cls: 'bg-slate-100 text-slate-700' },
              { label: 'All pass',    val: summary.all_pass,    cls: 'bg-green-100 text-green-700' },
              { label: 'Temp fails',  val: summary.temp_fails,  cls: summary.temp_fails > 0  ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500' },
              { label: 'Kill fails',  val: summary.kill_fails,  cls: summary.kill_fails > 0  ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500' },
              { label: 'CA notes',    val: summary.with_ca_note,cls: summary.with_ca_note > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500' },
              { label: 'Unresolved',  val: summary.unresolved,  cls: summary.unresolved > 0  ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-100 text-slate-500' },
            ].map(s => (
              <div key={s.label} className={`px-3 py-1.5 rounded-xl text-xs ${s.cls}`}>
                <span className="opacity-70">{s.label}: </span><span className="font-bold">{s.val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
          <p className="text-slate-400 text-sm">No mince & prep records in this date range</p>
        </div>
      ) : (
        <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: '680px' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Date','Time','Species','Batch','Input','Output','Overall','CA',''].map(h => (
                    <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => <MinceTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Placeholder section ──────────────────────────────────────────────────────

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div className="bg-white border border-blue-100 rounded-xl px-4 py-10 text-center">
      <p className="text-slate-300 text-sm">{label} — coming soon</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'deliveries',    label: 'Deliveries',    sub: 'CCP 1' },
  { key: 'cold_storage',  label: 'Cold Storage',  sub: 'CCP 2' },
  { key: 'process_room',  label: 'Process Room',  sub: 'CCP 3' },
  { key: 'cleaning',      label: 'Cleaning',      sub: 'SOP 2' },
  { key: 'calibration',   label: 'Calibration',   sub: 'SOP 3' },
  { key: 'mince',         label: 'Mince & Prep',  sub: 'CCP-M' },
  { key: 'returns',       label: 'Returns',        sub: 'SOP 12' },
  { key: 'ccas',          label: 'Corrective Actions', sub: 'All' },
  { key: 'reviews',       label: 'Reviews',        sub: 'W+M' },
  { key: 'health',        label: 'Health',         sub: 'SOP 8' },
  { key: 'training',      label: 'Training',       sub: 'FIR' },
] as const

type SectionKey = typeof SECTIONS[number]['key']

export default function AuditPage() {
  const [preset,       setPreset]       = useState<DatePreset>('30d')
  const [{ from, to }, setRange]        = useState(presetToRange('30d'))
  const [section,      setSection]      = useState<SectionKey>('deliveries')
  const [heatmapOpen,  setHeatmapOpen]  = useState(true)
  const [exporting,    setExporting]    = useState(false)
  const [heatmapData,  setHeatmapData]  = useState<Record<string, Record<string, HeatmapDay>>>({})
  const [heatmapReady, setHeatmapReady] = useState(false)

  // Pre-fetch ALL sections' heatmap data on load — so the heatmap is fully
  // populated immediately, regardless of which section tab is active.
  const fetchHeatmap = useCallback((fromDate: string, toDate: string) => {
    setHeatmapReady(false)
    fetch(`/api/haccp/audit/heatmap?from=${fromDate}&to=${toDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setHeatmapData(d)
      })
      .catch(() => {})
      .finally(() => setHeatmapReady(true))
  }, [])

  // Fetch heatmap on mount and whenever date range changes
  useEffect(() => { fetchHeatmap(from, to) }, [from, to, fetchHeatmap])

  function selectPreset(p: DatePreset) {
    const range = presetToRange(p)
    setPreset(p)
    setRange(range)
    // heatmap useEffect watches [from, to] so it will auto-refetch
  }

  // Generic stable heatmap callback — all sections pass pre-keyed updates
  // e.g. { deliveries: { date: {...} } } or { cold_am: {...}, cold_pm: {...} }
  const handleSectionHeatmapData = useCallback((updates: Record<string, Record<string, HeatmapDay>>) => {
    setHeatmapData((prev) => ({ ...prev, ...updates }))
  }, []) // stable — empty deps, never recreated

  async function exportAll() {
    setExporting(true)
    try {
      const url = `/api/haccp/audit/export?from=${from}&to=${to}`
      const res = await fetch(url)
      if (!res.ok) { alert('Export failed'); return }
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = `MFS_HACCP_Audit_${from}_to_${to}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { alert('Export failed — try again') }
    finally { setExporting(false) }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-[#1E293B] flex-shrink-0">
        <button onClick={() => { window.location.href = '/haccp' }}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/18 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">HACCP Record Audit</p>
          <h1 className="text-white text-lg font-bold leading-tight">Audit View</h1>
        </div>
        {/* Export All button */}
        <button onClick={exportAll} disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex-shrink-0">
          {exporting
            ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          }
          Export All (XLSX)
        </button>
      </div>

      {/* Date filter */}
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3 flex-wrap">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Date range:</p>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button key={p} onClick={() => selectPreset(p)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                preset === p ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}>
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
        <p className="text-slate-400 text-xs ml-2">{fmtDate(from)} — {fmtDate(to)}</p>
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* Collapsible heatmap */}
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
          <button onClick={() => setHeatmapOpen((p) => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <div>
              <p className="text-slate-900 text-sm font-bold">Coverage heatmap</p>
              <p className="text-slate-400 text-xs mt-0.5">{fmtDate(from)} — {fmtDate(to)} · {getDaysInRange(from, to).length} days</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">
                {heatmapOpen ? 'Collapse' : 'Expand'}
              </span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${heatmapOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </button>
          {heatmapOpen && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <Heatmap from={from} to={to} heatmapData={heatmapData} />
            </div>
          )}
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`flex-shrink-0 py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all ${
                section === s.key
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}>
              <span>{s.label}</span>
              <span className={`ml-1 text-[9px] ${section === s.key ? 'text-orange-400' : 'text-slate-400'}`}>{s.sub}</span>
            </button>
          ))}
        </div>

        {/* Section content */}
        {section === 'deliveries' && (
          <DeliveriesSection
            from={from} to={to}
            onHeatmapData={handleSectionHeatmapData}
          />
        )}
        {section === 'cold_storage'  && <ColdStorageSection from={from} to={to} onHeatmapData={handleSectionHeatmapData} />}
        {section === 'process_room'  && <ProcessRoomSection from={from} to={to} onHeatmapData={handleSectionHeatmapData} />}
        {section === 'cleaning'      && <CleaningSection from={from} to={to} onHeatmapData={handleSectionHeatmapData} />}
        {section === 'calibration'   && <CalibrationSection from={from} to={to} onHeatmapData={handleSectionHeatmapData} />}
        {section === 'mince'         && <MinceSection from={from} to={to} onHeatmapData={handleSectionHeatmapData} />}
        {section === 'returns'       && <PlaceholderSection label="Product Returns" />}
        {section === 'ccas'          && <PlaceholderSection label="Corrective Actions" />}
        {section === 'reviews'       && <PlaceholderSection label="Reviews" />}
        {section === 'health'        && <PlaceholderSection label="Health & People" />}
        {section === 'training'      && <PlaceholderSection label="Training" />}

      </div>
    </div>
  )
}
