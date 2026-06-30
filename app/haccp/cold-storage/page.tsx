/**
 * app/haccp/cold-storage/page.tsx
 *
 * CCP 2 — Cold Storage Temperature Check
 * AM and PM readings for all 5 units.
 * Corrective Action popup fires if any reading is amber or critical.
 *
 * UI Phase 1 (Tier B): re-expressed onto components/ui/ + semantic tokens. The
 * inline number pad is now the reusable kit `NumberPad`; the number-pad,
 * corrective-action and quick-ref overlays use the kit `Modal`. Dark theme is
 * inherited from app/haccp/layout.tsx (data-theme="dark" + ThemeLock) — no
 * hardcoded colour survives. Behaviour (sessions, classification, CA flow,
 * once-per-session guard, today-only, pre-fill, states) is preserved exactly.
 */

'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  Modal,
  NumberPad,
  Button,
  IconButton,
  SegmentedControl,
  Textarea,
  Banner,
  Spinner,
  Badge,
  type NumberPadTone,
} from '@/components/ui'
import {
  COLD_STORAGE_CAUSES,
  COLD_STORAGE_MIN_TEMP_C,
  COLD_STORAGE_MAX_TEMP_C,
} from '@/lib/domain'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StorageUnit {
  id:            string
  name:          string
  unit_type:     'chiller' | 'freezer'
  target_temp_c: number
  max_temp_c:    number
}

interface ExistingReading {
  unit_id:     string
  session:     'AM' | 'PM'
  temperature_c: number
  temp_status: string
  comments:    string | null
}

type TempStatus = 'pass' | 'amber' | 'critical' | null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTempStatus(temp: number, unit: StorageUnit): TempStatus {
  if (isNaN(temp)) return null
  // Unified logic across chillers & freezers — thresholds come from the DB.
  if (temp <= unit.target_temp_c) return 'pass'
  if (temp <= unit.max_temp_c)    return 'amber'
  return 'critical'
}

function getCorrectiveAction(status: TempStatus, unitType: string): string {
  if (status === 'amber' && unitType === 'freezer') return 'Keep door closed. Check for ice build-up on coils. Monitor closely. Acceptable short-term if product is re-frozen immediately.'
  if (status === 'critical' && unitType === 'freezer') return 'Assess product for thawing — check ice crystal formation and texture. Transfer to a functioning freezer. Do NOT refreeze if product has already thawed.'
  if (status === 'amber') return 'Check door seals and closure. Verify unit is not overloaded. Reduce loading if necessary. Recheck within 30 minutes. Transfer product to backup chiller if temperature is still rising. Call refrigeration engineer.'
  if (status === 'critical') return 'CRITICAL: Minimise door openings immediately. Transfer ALL product to backup refrigeration unit. Probe individual product temperatures. Contact refrigeration engineer urgently. Segregate any product above the limit for safety assessment. Supervisor sign-off required.'
  return ''
}

function currentSession(): 'AM' | 'PM' {
  return new Date().getHours() < 14 ? 'AM' : 'PM'
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

// ─── Status → semantic tokens ───────────────────────────────────────────────────
// Literal class strings (not interpolated) so Tailwind's scanner keeps them.

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', amber: 'Amber', critical: 'Critical',
}

const STATUS_TONE: Record<'pass' | 'amber' | 'critical', NumberPadTone> = {
  pass: 'success', amber: 'warning', critical: 'danger',
}

const STATUS_BADGE_TONE: Record<'pass' | 'amber' | 'critical', 'success' | 'warning' | 'danger'> = {
  pass: 'success', amber: 'warning', critical: 'danger',
}

const STATUS_CARD: Record<'pass' | 'amber' | 'critical', { shell: string; text: string }> = {
  pass:     { shell: 'bg-status-success-soft border-status-success-border', text: 'text-status-success-text' },
  amber:    { shell: 'bg-status-warning-soft border-status-warning-border', text: 'text-status-warning-text' },
  critical: { shell: 'bg-status-error-soft border-status-error-border',     text: 'text-status-error-text' },
}

// ─── Local icons (non-exported helpers — not kit assets) ────────────────────────

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function BackGlyph() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function HelpGlyph() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function HandbookGlyph() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

// ─── CA constants (Batch 4 — adaptive redesign) ──────────────────────────────

// Single source of truth — shared with the server's VALID_COLD_STORAGE_CAUSES
// so the lists can never drift (the drift was the root cause of the 400 bug).
const CAUSE_OPTIONS = COLD_STORAGE_CAUSES

const RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'Door left open':                           ['Retrain staff on door discipline', 'Add door-close reminder signage', 'Other'],
  'Unit overloaded':                          ['Reduce loading limit', 'Retrain staff on loading limits', 'Other'],
  'Seal damaged':                             ['Replace door seal immediately', 'Schedule maintenance check', 'Other'],
  'Equipment failure':                        ['Contact refrigeration engineer', 'Schedule maintenance check', 'Install temperature alarm', 'Other'],
  'Power interruption':                       ['Install temperature alarm', 'Review backup power options', 'Schedule maintenance check', 'Other'],
  'Defrost cycle — scheduled temperature rise': ['Review defrost cycle schedule', 'Adjust defrost timing to avoid busy periods', 'Verify unit recovers within 30 minutes', 'Other'],
  'High ambient room temperature':            ['Improve room ventilation', 'Reduce ambient temperature in storage area', 'Monitor unit during hot weather', 'Other'],
  'Other':                                    ['Schedule maintenance check', 'Retrain staff', 'Install temperature alarm', 'Other'],
}

// Predetermined protocols (CA-001) — shown read-only, stored server-side
const PROTOCOL_STEPS: Record<string, string[]> = {
  chiller_critical: [
    'Minimise door openings immediately',
    'Transfer all product to backup unit immediately',
    'Probe individual products to assess core temperature',
    'Segregate any product above the legal limit for assessment',
    'Contact refrigeration engineer urgently',
    'Assess all product for safety before release',
  ],
  chiller_amber: [
    'Check door seals and closure',
    'Verify unit not overloaded / reduce loading',
    'Recheck temperature within 30 minutes',
    'Transfer product to backup chiller if temperature does not recover',
    'Call refrigeration engineer if fault persists',
  ],
  freezer_critical: [
    'Assess product for thawing (ice crystal formation, texture)',
    'Transfer to functioning freezer immediately',
    'Do NOT refreeze if product has fully thawed',
    'Contact refrigeration engineer urgently',
  ],
  freezer_amber: [
    'Keep door closed — minimise openings',
    'Check for ice build-up on coils',
    'Monitor — acceptable short-term if product re-frozen immediately',
    'Call refrigeration engineer if temperature does not recover',
  ],
  equipment_failure: [
    'Document time of failure discovery',
    'Transfer products to backup refrigeration immediately',
    'Estimate time product was at elevated temperature',
    'Contact refrigeration engineer urgently',
    'Assess each product individually (if >2h above limit)',
    'Complete equipment failure log',
  ],
}

function getProtocolKey(cause: string, worstStatus: TempStatus, worstUnitType: string): string {
  if (cause === 'Equipment failure') return 'equipment_failure'
  if (worstUnitType === 'freezer') return worstStatus === 'critical' ? 'freezer_critical' : 'freezer_amber'
  return worstStatus === 'critical' ? 'chiller_critical' : 'chiller_amber'
}

function getDispositionDefault(cause: string, worstStatus: TempStatus): string {
  if (cause === 'Equipment failure') return 'Assess'
  return worstStatus === 'critical' ? 'Assess' : 'Conditional accept'
}

function getDispositionOptions(cause: string, worstStatus: TempStatus): string[] {
  if (cause === 'Equipment failure') return ['Assess', 'Conditional accept', 'Reject']
  if (worstStatus === 'critical')    return ['Assess', 'Reject']
  return ['Conditional accept', 'Assess', 'Accept']
}

// ─── Section label ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-2">{children}</p>
  )
}

// ─── CCA Popup ────────────────────────────────────────────────────────────────

type CAPayload = {
  cause:       string
  disposition: string
  recurrence:  string
  notes:       string
}

function CCAPopup({ deviations, onSubmit, onBack }: {
  deviations: { name: string; temp: number; status: TempStatus; unitType: string }[]
  onSubmit:   (ca: CAPayload) => void
  onBack:     () => void
}) {
  const worst       = deviations.find((d) => d.status === 'critical') ?? deviations[0]
  const worstStatus = worst?.status ?? 'amber'
  const worstType   = worst?.unitType ?? 'chiller'

  const [cause,      setCause]      = useState('')
  const [disposition, setDisposition] = useState(getDispositionDefault('', worstStatus as TempStatus))
  const [recurrence, setRecurrence] = useState('')
  const [notes,      setNotes]      = useState('')

  const protocolKey   = getProtocolKey(cause, worstStatus as TempStatus, worstType)
  const protocolSteps = PROTOCOL_STEPS[protocolKey] ?? []
  const dispOptions   = getDispositionOptions(cause, worstStatus as TempStatus)

  // Reset disposition default when cause changes
  useEffect(() => {
    setDisposition(getDispositionDefault(cause, worstStatus as TempStatus))
    setRecurrence('')
  }, [cause]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = Boolean(cause && disposition && recurrence)

  function handleConfirm() {
    onSubmit({ cause, disposition, recurrence, notes: notes.trim() })
  }

  return (
    <Modal
      variant="sheet"
      open
      onOpenChange={(o) => { if (!o) onBack() }}
      title="Corrective Action Required"
      description="CCP 2 deviation"
    >
      <div className="space-y-5 pt-1">

        {/* Deviation summary */}
        <div className="space-y-2">
          {deviations.map((d) => (
            <div key={d.name} className={`rounded-xl p-3 border ${STATUS_CARD[d.status ?? 'amber'].shell}`}>
              <span className={`font-semibold text-sm ${STATUS_CARD[d.status ?? 'amber'].text}`}>{d.name}: {d.temp}°C</span>
              <span className={`ml-2 text-xs opacity-75 ${STATUS_CARD[d.status ?? 'amber'].text}`}>— {STATUS_LABEL[d.status ?? 'amber']}</span>
              <p className="text-xs mt-1 text-muted">{getCorrectiveAction(d.status, d.unitType)}</p>
            </div>
          ))}
        </div>

        {/* Required protocol — read only, updates if cause changes */}
        <div>
          <FieldLabel>
            Required action (CA-001)
            {cause === 'Equipment failure' && <span className="ml-1 text-status-warning-text normal-case font-normal">— equipment failure override</span>}
          </FieldLabel>
          <div className="bg-surface-sunken border border-default rounded-xl px-4 py-3 space-y-2">
            {protocolSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-status-error-soft text-status-error-text">{i + 1}</div>
                <p className="text-body text-xs leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cause */}
        <div>
          <FieldLabel>What caused this?</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {CAUSE_OPTIONS.map((c) => (
              <Button key={c} variant={cause === c ? 'primary' : 'ghost'} size="sm" fullWidth onClick={() => setCause(c)}>
                {c}
              </Button>
            ))}
          </div>
        </div>

        {/* Disposition — pre-filled, limited options */}
        <div>
          <FieldLabel>Product disposition</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {dispOptions.map((d) => (
              <Button key={d} variant={disposition === d ? 'primary' : 'ghost'} size="sm" onClick={() => setDisposition(d)}>
                {d}
              </Button>
            ))}
          </div>
        </div>

        {/* Recurrence — cause-aware, appears after cause selected */}
        {cause && (
          <div>
            <FieldLabel>Recurrence prevention</FieldLabel>
            <div className="space-y-1.5">
              {(RECURRENCE_BY_CAUSE[cause] ?? RECURRENCE_BY_CAUSE['Other']).map((r) => (
                <Button key={r} variant={recurrence === r ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start" onClick={() => setRecurrence(r)}>
                  {r}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <FieldLabel>Notes <span className="normal-case font-normal">(optional)</span></FieldLabel>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any additional details…" />
        </div>

        <p className="text-muted text-xs">This record is immutable once submitted. Protocol per CA-001.</p>

        <Button variant="danger" fullWidth disabled={!canSubmit} onClick={handleConfirm}>
          Confirm corrective action & submit
        </Button>
      </div>
    </Modal>
  )
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ColdStoragePage() {
  const [units,      setUnits]      = useState<StorageUnit[]>([])
  const [existing,   setExisting]   = useState<ExistingReading[]>([])
  const [session,    setSession]    = useState<'AM' | 'PM'>(currentSession())
  const [date,       setDate]       = useState(todayISO())
  const [temps,      setTemps]      = useState<Record<string, string>>({})
  const [comments,   setComments]   = useState('')
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError,setSubmitError]= useState('')
  const [numpadUnit, setNumpadUnit] = useState<StorageUnit | null>(null)
  const [showCCA,    setShowCCA]    = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  // Quick reference panel state
  const [showQuick, setShowQuick] = useState(false)

  function openHandbook() {
    window.location.href = '/haccp/documents/hb-001?from=/haccp/cold-storage'
  }

  // Separate function so we can call it on date change too
  const loadReadings = useCallback((forDate: string) => {
    fetch(`/api/haccp/cold-storage?date=${forDate}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`)
        return r.json()
      })
      .then((d) => {
        const loadedUnits    = d.units    ?? []
        const loadedReadings = d.readings ?? []
        setUnits(loadedUnits)
        setExisting(loadedReadings)
        // Default to first unsubmitted session
        const amDone = loadedUnits.length > 0 &&
          loadedUnits.every((u: StorageUnit) => loadedReadings.some((r: ExistingReading) => r.unit_id === u.id && r.session === 'AM'))
        const pmDone = loadedUnits.length > 0 &&
          loadedUnits.every((u: StorageUnit) => loadedReadings.some((r: ExistingReading) => r.unit_id === u.id && r.session === 'PM'))
        if (amDone && !pmDone) setSession('PM')
        else setSession('AM')
      })
      .catch((err) => {
        console.error('[cold-storage] fetch failed:', err)
        setSubmitError('Could not load units — check connection')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadReadings(date)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when date changes
  function handleDateChange(newDate: string) {
    setDate(newDate)
    setLoading(true)
    setTemps({})
    loadReadings(newDate)
  }

  // Pre-fill if readings already exist for this session
  useEffect(() => {
    const sessionReadings = existing.filter((r) => r.session === session)
    if (sessionReadings.length > 0) {
      const pre: Record<string, string> = {}
      sessionReadings.forEach((r) => { pre[r.unit_id] = String(r.temperature_c) })
      setTemps(pre)
    } else {
      setTemps({})  // Clear — don't leak previous session's values into an empty session
    }
  }, [existing, session])

  const allFilled = units.length > 0 && units.every((u) => temps[u.id] !== undefined && temps[u.id] !== '')

  // True when all units already have a reading for the current session (read-only mode)
  const sessionAlreadyDone = units.length > 0 &&
    units.every((u) => existing.some((r) => r.unit_id === u.id && r.session === session))

  const deviations = units
    .filter((u) => {
      const t = parseFloat(temps[u.id] ?? '')
      return !isNaN(t) && getTempStatus(t, u) !== 'pass'
    })
    .map((u) => ({
      name:     u.name,
      temp:     parseFloat(temps[u.id]),
      status:   getTempStatus(parseFloat(temps[u.id]), u),
      unitType: u.unit_type,
    }))

  const doSubmit = useCallback(async (ca: CAPayload | null) => {
    setSubmitting(true)
    setShowCCA(false)
    try {
      const readings = units.map((u) => ({
        unit_id:       u.id,
        temperature_c: parseFloat(temps[u.id]),
      }))
      const res = await fetch('/api/haccp/cold-storage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session, date, readings, comments, corrective_action: ca }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.ca_write_failed) {
          // Readings saved but CA row(s) didn't — don't silently succeed
          setSubmitError('Readings saved, but corrective action record failed. Please notify admin.')
          setSubmitting(false)
          return
        }
        setSubmitted(true)
        setTimeout(() => { window.location.href = '/haccp' }, 2000)
      } else {
        const d = await res.json()
        setSubmitError(d.error ?? 'Submission failed')
      }
    } catch { setSubmitError('Connection error — try again') }
    finally { setSubmitting(false) }
  }, [units, temps, session, date, comments])

  const handleSubmitAttempt = useCallback(() => {
    if (deviations.length > 0) { setShowCCA(true); return }
    doSubmit(null)
  }, [deviations, doSubmit])

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-status-success-soft flex items-center justify-center text-status-success-text">
          <CheckGlyph className="w-10 h-10" />
        </div>
        <p className="text-body text-xl font-bold">Session submitted</p>
        <p className="text-muted text-sm">CCP 2 · {session} · {date}</p>
      </div>
    )
  }

  // ── Numpad modal context ──
  const numpadStatus = numpadUnit
    ? getTempStatus(parseFloat(temps[numpadUnit.id] ?? ''), numpadUnit)
    : null

  return (
    <div className="min-h-screen bg-surface-base flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-default bg-surface-raised">
        <IconButton aria-label="Back to HACCP" variant="ghost" icon={<BackGlyph />} onClick={() => { window.location.href = '/haccp' }} />
        <div className="flex-1 min-w-0">
          <p className="text-action-primary text-[10px] font-bold tracking-widest uppercase">CCP 2 — Cold Storage</p>
          <h1 className="text-body text-lg font-bold leading-tight">Temperature Check</h1>
        </div>
        <Button variant="ghost" size="sm" leadingIcon={<HelpGlyph />} onClick={() => setShowQuick(true)}>
          Quick ref
        </Button>
        <Button variant="secondary" size="sm" leadingIcon={<HandbookGlyph />} onClick={openHandbook}>
          Handbook
        </Button>
      </div>

      {/* Session + date selectors */}
      <div className="px-5 py-4 flex items-center gap-4 border-b border-default flex-wrap">
        <SegmentedControl
          aria-label="Session"
          value={session}
          onChange={(s) => setSession(s)}
          options={(['AM', 'PM'] as const).map((s) => {
            const isDone = units.length > 0 &&
              units.every((u) => existing.some((r) => r.unit_id === u.id && r.session === s))
            return {
              id: s,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {isDone && <CheckGlyph className="w-3.5 h-3.5" />}
                  {s}
                </span>
              ),
            }
          })}
        />
        <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
          max={todayISO()}
          className="bg-surface-raised border border-default rounded-xl px-3 py-2 text-body text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        <span className="text-subtle text-xs ml-auto">SOP 3 — check twice daily</span>
      </div>

      {/* Unit list */}
      <div className="flex-1 px-5 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-3 text-muted text-sm mt-8">
            <Spinner /> Loading units…
          </div>
        ) : units.map((unit) => {
          const raw    = temps[unit.id] ?? ''
          const numVal = parseFloat(raw)
          const status = raw !== '' && !isNaN(numVal) ? getTempStatus(numVal, unit) : null
          const existing_session = existing.find((r) => r.unit_id === unit.id && r.session === session)

          return (
            <button key={unit.id}
              onClick={() => setNumpadUnit(unit)}
              className={`w-full text-left rounded-2xl p-4 border transition-transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                status ? STATUS_CARD[status].shell : 'bg-surface-raised border-default'
              }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-body font-semibold text-base">{unit.name}</p>
                  <p className="text-muted text-xs mt-0.5">
                    {`Target ≤${unit.target_temp_c}°C · Max ${unit.max_temp_c}°C`}
                    {existing_session ? ' · Already recorded' : ''}
                  </p>
                </div>
                <div className="text-right">
                  {raw !== '' && !isNaN(numVal) ? (
                    <>
                      <p className={`text-2xl font-bold ${status ? STATUS_CARD[status].text : 'text-body'}`}>
                        {numVal}°C
                      </p>
                      {status && (
                        <Badge tone={STATUS_BADGE_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                      )}
                    </>
                  ) : (
                    <div className="w-20 h-12 rounded-xl bg-surface-sunken border border-default flex items-center justify-center text-subtle text-sm">
                      Tap
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Comments + submit — hidden when session already done */}
      <div className="px-5 pb-6 border-t border-default pt-4">
        {sessionAlreadyDone ? (
          <Banner tone="success" icon={<CheckGlyph className="w-5 h-5" />} title={`${session} check already submitted`}>
            Readings recorded above are read-only
          </Banner>
        ) : (
          <div className="space-y-3">
            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} placeholder="Comments (optional)…" />
            {submitError && <Banner tone="danger">{submitError}</Banner>}
            <Button fullWidth loading={submitting} disabled={!allFilled || submitting}
              leadingIcon={!submitting ? <CheckGlyph className="w-5 h-5" /> : undefined}
              onClick={handleSubmitAttempt}>
              {submitting ? 'Submitting…' : `Submit ${session} check`}
            </Button>
          </div>
        )}
      </div>

      {/* Numpad overlay */}
      {numpadUnit && (
        <Modal
          variant="sheet"
          open
          onOpenChange={(o) => { if (!o) setNumpadUnit(null) }}
          title={numpadUnit.name}
          description="CCP 2 — Cold Storage"
        >
          <NumberPad
            value={temps[numpadUnit.id] ?? ''}
            onChange={(v) => setTemps((prev) => ({ ...prev, [numpadUnit.id]: v }))}
            onConfirm={() => setNumpadUnit(null)}
            allowDecimal={numpadUnit.unit_type === 'chiller'}
            allowNegative={numpadUnit.unit_type === 'freezer'}
            min={COLD_STORAGE_MIN_TEMP_C}
            max={COLD_STORAGE_MAX_TEMP_C}
            suffix="°C"
            tone={numpadStatus ? STATUS_TONE[numpadStatus] : 'neutral'}
            hint={
              numpadStatus && numpadStatus !== 'pass' ? (
                <span className={STATUS_CARD[numpadStatus].text}>
                  {STATUS_LABEL[numpadStatus]} — action required. {getCorrectiveAction(numpadStatus, numpadUnit.unit_type)}
                </span>
              ) : undefined
            }
          />
        </Modal>
      )}

      {/* CCA popup */}
      {showCCA && (
        <CCAPopup
          deviations={deviations}
          onSubmit={doSubmit}
          onBack={() => setShowCCA(false)}
        />
      )}

      {/* Quick reference panel */}
      {showQuick && (
        <Modal variant="sheet" open onOpenChange={(o) => { if (!o) setShowQuick(false) }} title="CCP 2 — Quick Reference">
          <div className="space-y-3 text-sm pt-1">
            <div className="bg-surface-sunken border border-default rounded-xl p-4">
              <p className="text-action-primary font-bold text-xs uppercase tracking-widest mb-2">Chillers (Lamb, Dispatch, Dairy)</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-success-fill flex-shrink-0" /><span className="text-muted">≤5°C — Pass</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-warning-fill flex-shrink-0" /><span className="text-muted">5–8°C — Amber: check seals, recheck in 30 min</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-error-fill flex-shrink-0" /><span className="text-muted">&gt;8°C — Critical: transfer all product, call engineer</span></div>
              </div>
            </div>
            <div className="bg-surface-sunken border border-default rounded-xl p-4">
              <p className="text-action-primary font-bold text-xs uppercase tracking-widest mb-2">Freezer</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-success-fill flex-shrink-0" /><span className="text-muted">≤-18°C — Pass</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-warning-fill flex-shrink-0" /><span className="text-muted">-15 to -18°C — Amber: keep door closed, check coils</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-error-fill flex-shrink-0" /><span className="text-muted">&gt;-15°C — Critical: assess for thawing, do NOT refreeze</span></div>
              </div>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
