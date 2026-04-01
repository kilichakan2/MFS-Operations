'use client'

/**
 * components/RunsContent.tsx
 *
 * Extracted body of the Runs tab — used inside the Routes page tabbed view.
 * No AppHeader or RoleNav — those are provided by the parent page.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface RunRow {
  id:                 string
  name:               string | null
  planned_date:       string
  departure_time:     string
  status:             'draft' | 'active' | 'completed'
  end_point:          string
  total_distance_km:  number | null
  total_duration_min: number | null
  stop_count:         number
  assignee:           { id: string; name: string } | null
}

const STATUS_STYLES: Record<string, { label: string; pill: string }> = {
  draft:     { label: 'Draft',     pill: 'bg-gray-100 text-gray-500' },
  active:    { label: 'Active',    pill: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Completed', pill: 'bg-green-50 text-green-700' },
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
function fmtTime(t: string) { return t.slice(0, 5) }
function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}
function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d.toLocaleDateString('en-CA')
}
function formatWeekLabel(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00'), t = new Date(to + 'T12:00:00')
  if (f.getMonth() === t.getMonth())
    return `${f.toLocaleDateString('en-GB', { day: 'numeric' })}–${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  return `${f.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function RunsContent() {
  const today     = new Date().toLocaleDateString('en-CA')
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(today))
  const weekEnd   = addDays(weekStart, 6)
  const [runs,    setRuns]    = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [patching,      setPatching]      = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/admin/runs?from=${weekStart}&to=${weekEnd}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setRuns(data.runs ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  async function patchStatus(id: string, status: 'completed' | 'active') {
    setPatching(id)
    try {
      const res = await fetch(`/api/admin/runs/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) setRuns(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } finally { setPatching(null) }
  }

  async function deleteRun(id: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/runs/${id}`, { method: 'DELETE' })
      if (res.ok) setRuns(prev => prev.filter(r => r.id !== id))
      setConfirmDelete(null)
    } finally { setDeleting(false) }
  }

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto w-full pb-8">

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="w-9 h-9 rounded-xl bg-white border border-[#EDEAE1] flex items-center justify-center text-[#16205B] hover:border-[#16205B]/30 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd"/>
          </svg>
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-[#16205B]">{formatWeekLabel(weekStart, weekEnd)}</p>
          <p className="text-[10px] text-gray-400">{runs.length} route{runs.length !== 1 ? 's' : ''}</p>
        </div>
        <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="w-9 h-9 rounded-xl bg-white border border-[#EDEAE1] flex items-center justify-center text-[#16205B] hover:border-[#16205B]/30 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>

      {error   && <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}
      {loading && (
        <div className="flex justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-[#16205B]/30" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      )}
      {!loading && runs.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-[#16205B] font-semibold text-sm mb-1">No routes this week</p>
          <p className="text-gray-400 text-xs">Plan routes in the Route Optimiser tab.</p>
        </div>
      )}

      {!loading && runs.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-2xl border border-[#EDEAE1]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EDEAE1]">
                  {['Date', 'Driver', 'Route', 'Stops', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-[#16205B]/40 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDEAE1]">
                {runs.map(run => {
                  const s = STATUS_STYLES[run.status]
                  const isBusy = patching === run.id
                  return (
                    <tr key={run.id} className={run.status === 'completed' ? 'opacity-60' : ''}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#16205B]">{fmtDate(run.planned_date)}</p>
                        <p className="text-[10px] text-gray-400">{fmtTime(run.departure_time)}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{run.assignee?.name ?? <span className="text-gray-300 italic">Unassigned</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">{run.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#16205B]">{run.stop_count}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${s.pill}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap w-px">
                        {confirmDelete === run.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-red-600 font-semibold">Delete?</span>
                            <button type="button" onClick={() => deleteRun(run.id)} disabled={deleting}
                              className="h-7 px-2 rounded-lg bg-red-600 text-white text-[10px] font-bold disabled:opacity-40">{deleting ? '…' : 'Yes'}</button>
                            <button type="button" onClick={() => setConfirmDelete(null)}
                              className="h-7 px-2 rounded-lg border border-[#EDEAE1] text-[10px] text-gray-500">No</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {run.status !== 'completed' ? (
                              <button type="button" onClick={() => patchStatus(run.id, 'completed')} disabled={isBusy}
                                className="h-7 px-3 rounded-lg bg-[#16205B] text-white text-[10px] font-bold disabled:opacity-40">
                                {isBusy ? '…' : 'Complete'}
                              </button>
                            ) : (
                              <button type="button" onClick={() => patchStatus(run.id, 'active')} disabled={isBusy}
                                className="h-7 px-3 rounded-lg border border-[#EDEAE1] text-[#16205B]/50 text-[10px] font-bold disabled:opacity-40">
                                {isBusy ? '…' : 'Reopen'}
                              </button>
                            )}
                            <Link href={`/routes?editId=${run.id}&tab=optimiser`}
                              className="h-7 px-3 rounded-lg border border-[#EDEAE1] text-[#16205B]/60 text-[10px] font-bold hover:border-[#EB6619] hover:text-[#EB6619] transition-colors flex items-center">Edit</Link>
                            <button type="button" onClick={() => setConfirmDelete(run.id)}
                              className="h-7 w-7 rounded-lg border border-[#EDEAE1] text-[#16205B]/30 hover:border-red-300 hover:text-red-500 transition-colors flex items-center justify-center">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {runs.map(run => {
              const s = STATUS_STYLES[run.status]
              const isBusy = patching === run.id
              return (
                <div key={run.id} className={`bg-white rounded-2xl border border-[#EDEAE1] p-4 ${run.status === 'completed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-bold text-[#16205B] text-sm">{fmtDate(run.planned_date)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {run.assignee?.name ?? 'Unassigned'} · {run.stop_count} stop{run.stop_count !== 1 ? 's' : ''} · {fmtTime(run.departure_time)}
                      </p>
                      {run.name && <p className="text-xs text-gray-400 mt-0.5 truncate">{run.name}</p>}
                      {run.total_duration_min && <p className="text-xs text-gray-400">{fmtDuration(run.total_duration_min)}</p>}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${s.pill}`}>{s.label}</span>
                  </div>
                  {confirmDelete === run.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-red-600 font-semibold flex-1">Delete this route?</span>
                      <button type="button" onClick={() => deleteRun(run.id)} disabled={deleting}
                        className="h-8 px-3 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40">{deleting ? '…' : 'Delete'}</button>
                      <button type="button" onClick={() => setConfirmDelete(null)}
                        className="h-8 px-3 rounded-lg border border-[#EDEAE1] text-sm text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {run.status !== 'completed' ? (
                        <button type="button" onClick={() => patchStatus(run.id, 'completed')} disabled={isBusy}
                          className="flex-1 h-9 rounded-xl bg-[#16205B] text-white text-sm font-bold disabled:opacity-40">
                          {isBusy ? '…' : '✓ Complete'}
                        </button>
                      ) : (
                        <button type="button" onClick={() => patchStatus(run.id, 'active')} disabled={isBusy}
                          className="flex-1 h-9 rounded-xl border border-[#EDEAE1] text-[#16205B]/50 text-sm font-bold disabled:opacity-40">
                          {isBusy ? '…' : 'Reopen'}
                        </button>
                      )}
                      <Link href={`/routes?editId=${run.id}&tab=optimiser`}
                        className="h-9 px-4 rounded-xl border border-[#EDEAE1] text-[#16205B]/60 text-sm font-bold hover:border-[#EB6619] hover:text-[#EB6619] transition-colors flex items-center">Edit</Link>
                      <button type="button" onClick={() => setConfirmDelete(run.id)}
                        className="h-9 w-9 rounded-xl border border-[#EDEAE1] text-[#16205B]/30 hover:border-red-300 hover:text-red-500 transition-colors flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
