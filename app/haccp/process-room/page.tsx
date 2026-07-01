/**
 * app/haccp/process-room/page.tsx
 *
 * CCP 3 + SOP 1 — Process Room
 * Card 1: Temperature check (product core + room ambient) — AM + PM
 * Card 2: Daily diary — Opening / Operational / Closing checklists
 *
 * UI Phase 1 (Tier B): re-expressed onto components/ui/ + semantic tokens. The
 * inline number pad is now the reusable kit `NumberPad`; the number-pad,
 * corrective-action and quick-ref overlays use the kit `Modal`. Dark theme is
 * inherited from app/haccp/layout.tsx. The pass/amber/critical bands come from
 * the DB thresholds (haccp_process_room_thresholds) via the SHARED domain
 * helper `processRoomBand`, so the screen and the server can never disagree.
 * Behaviour (AM/PM sessions, smart default, per-session lock, 3-phase diary,
 * tick/cross, issues-note gate, CCA-on-deviation, quick-ref, handbook,
 * past-dates) is preserved exactly.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
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
  PROCESS_ROOM_CAUSES,
  PROCESS_ROOM_MIN_TEMP_C,
  PROCESS_ROOM_MAX_TEMP_C,
  processRoomBand,
  type ProcessRoomThreshold,
} from '@/lib/domain'

// ─── Types ────────────────────────────────────────────────────────────────────

type Session  = 'AM' | 'PM'
type Phase    = 'opening' | 'operational' | 'closing'
type TempStat = 'pass' | 'amber' | 'critical' | null

interface TempReading {
  session:             Session
  product_temp_c:      number
  room_temp_c:         number
  product_within_limit:boolean
  room_within_limit:   boolean
  within_limits:       boolean
  submitted_at:        string
}

interface DiaryEntry {
  phase:           Phase
  check_results:   Record<string, boolean>
  issues:          boolean
  what_did_you_do: string | null
  submitted_at:    string
}

// ─── Check item definitions ───────────────────────────────────────────────────

const CHECKS: Record<Phase, { key: string; label: string }[]> = {
  opening: [
    { key: 'steriliser',    label: 'Hot water steriliser: minimum 82°C verified' },
    { key: 'handwash',      label: 'Hand washing stations: soap, sanitiser, paper towels adequate' },
    { key: 'room_temp',     label: 'Room temperature: processing area ≤12°C' },
    { key: 'ppe',           label: 'PPE: adequate supplies available for all staff' },
    { key: 'hairnets',      label: 'Hair nets, overalls, safety footwear worn correctly' },
    { key: 'jewellery',     label: 'All jewellery and personal items removed' },
    { key: 'handwashing',   label: 'Proper hand washing technique observed' },
    { key: 'plasters',      label: 'Cuts/wounds covered with coloured plasters' },
    { key: 'health',        label: 'Health reporting compliance confirmed' },
    { key: 'no_food',       label: 'No eating, drinking, or smoking in production areas' },
  ],
  operational: [
    { key: 'temp_limits',   label: 'Products being processed within temperature limits' },
    { key: 'cleaning',      label: 'Cleaning schedule being followed' },
    { key: 'hygiene',       label: 'Staff following hygiene procedures' },
    { key: 'contamination', label: 'No cross-contamination risks observed' },
    { key: 'equipment',     label: 'Equipment functioning correctly' },
  ],
  closing: [
    { key: 'product_chilled', label: 'All product removed from production area and chilled' },
    { key: 'equip_clean',     label: 'Equipment cleaned and sanitised' },
    { key: 'steriliser_clean',label: 'Sterilisers drained and cleaned' },
    { key: 'waste',           label: 'Waste disposed of correctly' },
    { key: 'secured',         label: 'Production area locked and secured' },
  ],
}

const PHASE_LABELS: Record<Phase, string> = {
  opening:     'Opening checks',
  operational: 'Operational checks',
  closing:     'Closing checks',
}

const PHASE_SUBS: Record<Phase, string> = {
  opening:     'Before shift starts — 10 items',
  operational: 'Mid-shift checks — 5 items',
  closing:     'End of shift — 5 items',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function currentSession(): Session {
  return new Date().getHours() < 14 ? 'AM' : 'PM'
}

/** Band from a DB threshold via the SHARED helper (client + server agree). */
function bandFor(temp: number, threshold: ProcessRoomThreshold | undefined): TempStat {
  if (!threshold || isNaN(temp)) return null
  return processRoomBand(temp, Number(threshold.target_temp_c), Number(threshold.max_temp_c))
}

/** Number-pad hint text for a deviating reading. */
function procRoomHint(field: 'product' | 'room', band: TempStat): string {
  if (field === 'product') {
    return band === 'critical'
      ? 'Return product to chilled storage immediately. Record time above limit.'
      : 'Product above target — return to chilled storage, reduce batch size, monitor core temperature.'
  }
  return band === 'critical'
    ? 'Stop loading product into the room. Return all product to chilled storage immediately. Investigate cooling failure.'
    : 'Do NOT stop cutting. Bring product in progressively in small quantities so core temperature stays ≤ target. Investigate cause.'
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

function CrossGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// ─── CCA constants (page-local — recurrence menu is UI-only, no server twin) ──

// action is NOT in the payload — server derives it from deviation + cause
type CAPayload = {
  cause:       string
  disposition: string
  recurrence:  string
  notes:       string
}

const CCP3_RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'A/C or cooling failure':        ['Schedule A/C maintenance', 'Install temperature alarm', 'Other'],
  'Doors left open':               ['Retrain staff on door discipline', 'Add door-close reminder signage', 'Other'],
  'Product held in room too long': ['Retrain staff on batch timing', 'Reduce batch sizes', 'Other'],
  'Batch too large':               ['Reduce batch sizes', 'Retrain staff on batch timing', 'Other'],
  'Equipment failure':             ['Contact refrigeration/maintenance engineer', 'Schedule maintenance check', 'Install temperature alarm', 'Other'],
  'Power interruption':            ['Install temperature alarm', 'Review backup power options', 'Schedule maintenance check', 'Other'],
  'Other':                         ['Schedule maintenance check', 'Retrain staff', 'Install temperature alarm', 'Other'],
}

const CCP3_PROTOCOL_STEPS: Record<string, string[]> = {
  product_breach: [
    'Return product to chilled storage immediately',
    'Record time product was above temperature limit',
    'If <2 hours at <8°C: complete processing within 30 minutes then chill',
    'If >2 hours or >8°C: segregate product for safety assessment',
    'Reduce batch sizes for future processing',
  ],
  room_breach_high: [
    'Stop loading product into room',
    'Return all product to chilled storage immediately',
    'Investigate cooling failure urgently',
    'Do not resume until temperature below the target limit',
  ],
  room_breach_amber: [
    'Do NOT stop cutting',
    'Bring product to production progressively in small quantities',
    'Monitor product core temperature — must remain within limit',
    'If core temp rises above target, return to chilled storage',
    'Investigate cause — check A/C and cooling unit',
  ],
  equipment_failure: [
    'Document time of failure discovery',
    'Transfer products to chilled storage immediately',
    'Estimate time product was at elevated temperature',
    'Contact refrigeration/maintenance engineer urgently',
    'Assess each product individually (if >2h above limit)',
    'Complete equipment failure log',
  ],
}

function ccp3ProtocolKey(cause: string, productBreached: boolean, roomBreached: boolean, roomCritical: boolean): string {
  if (cause === 'Equipment failure') return 'equipment_failure'
  if (productBreached) return 'product_breach'
  if (roomBreached)    return roomCritical ? 'room_breach_high' : 'room_breach_amber'
  return 'product_breach'
}

function ccp3DispositionDefault(cause: string, productBreached: boolean, roomBreached: boolean, roomCritical: boolean): string {
  if (cause === 'Equipment failure')  return 'Assess'
  if (productBreached)                return 'Assess'
  if (roomBreached && roomCritical)   return 'Assess'
  return 'Accept'
}

function ccp3DispositionOptions(cause: string, productBreached: boolean, roomBreached: boolean, roomCritical: boolean): string[] {
  if (cause === 'Equipment failure')  return ['Assess', 'Conditional accept', 'Reject']
  if (productBreached)                return ['Assess', 'Reject', 'Conditional accept']
  if (roomBreached && roomCritical)   return ['Assess', 'Reject']
  return ['Accept', 'Assess', 'Conditional accept']
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-2">{children}</p>
  )
}

// ─── CCA Popup ────────────────────────────────────────────────────────────────

/** CCP 3 corrective action popup — bands are DB-driven. */
function CCAPopup({ productTemp, roomTemp, productThreshold, roomThreshold, onSubmit, onBack }: {
  productTemp:      number
  roomTemp:         number
  productThreshold: ProcessRoomThreshold | undefined
  roomThreshold:    ProcessRoomThreshold | undefined
  onSubmit:         (ca: CAPayload) => void
  onBack:           () => void
}) {
  const productBand   = bandFor(productTemp, productThreshold)
  const roomBand      = bandFor(roomTemp, roomThreshold)
  const productBreached = productBand !== null && productBand !== 'pass'
  const roomBreached    = roomBand !== null && roomBand !== 'pass'
  const roomCritical    = roomBand === 'critical'

  const [cause,       setCause]       = useState('')
  const [disposition, setDisposition] = useState(ccp3DispositionDefault('', productBreached, roomBreached, roomCritical))
  const [recurrence,  setRecurrence]  = useState('')
  const [notes,       setNotes]       = useState('')

  const protocolKey   = ccp3ProtocolKey(cause, productBreached, roomBreached, roomCritical)
  const protocolSteps = CCP3_PROTOCOL_STEPS[protocolKey] ?? []
  const dispOptions   = ccp3DispositionOptions(cause, productBreached, roomBreached, roomCritical)

  useEffect(() => {
    setDisposition(ccp3DispositionDefault(cause, productBreached, roomBreached, roomCritical))
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
      description="CCP 3 deviation"
    >
      <div className="space-y-5 pt-1">

        {/* Deviation summary */}
        <div className="space-y-2">
          {productBreached && productBand && (
            <div className={`rounded-xl px-4 py-3 border ${STATUS_CARD[productBand].shell}`}>
              <p className={`font-semibold text-sm ${STATUS_CARD[productBand].text}`}>
                Product temp: {productTemp}°C — limit ≤{Number(productThreshold?.target_temp_c)}°C
              </p>
              <p className="text-muted text-xs mt-0.5">Return to chilled storage. Apply time-based decision tree.</p>
            </div>
          )}
          {roomBreached && roomBand && (
            <div className={`rounded-xl px-4 py-3 border ${STATUS_CARD[roomBand].shell}`}>
              <p className={`font-semibold text-sm ${STATUS_CARD[roomBand].text}`}>
                Room temp: {roomTemp}°C — limit ≤{Number(roomThreshold?.target_temp_c)}°C
              </p>
              {!roomCritical && <p className="text-muted text-xs mt-0.5 font-medium">Do NOT stop cutting — bring product progressively.</p>}
            </div>
          )}
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
            {PROCESS_ROOM_CAUSES.map((c) => (
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

        {/* Recurrence — cause-aware */}
        {cause && (
          <div>
            <FieldLabel>Recurrence prevention</FieldLabel>
            <div className="space-y-1.5">
              {(CCP3_RECURRENCE_BY_CAUSE[cause] ?? CCP3_RECURRENCE_BY_CAUSE['Other']).map((r) => (
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
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional details…" />
        </div>

        <p className="text-muted text-xs">This record is immutable once submitted. Protocol per CA-001.</p>

        <Button variant="danger" fullWidth disabled={!canSubmit} onClick={handleConfirm}>
          Confirm &amp; submit
        </Button>
      </div>
    </Modal>
  )
}

// ─── Diary Phase Card ─────────────────────────────────────────────────────────

function DiaryPhaseCard({
  phase, existing, onSubmit,
}: {
  phase:    Phase
  existing: DiaryEntry | undefined
  onSubmit: (phase: Phase, results: Record<string,boolean>, issues: boolean, note: string) => Promise<void>
}) {
  const checks  = CHECKS[phase]
  const isDone  = !!existing
  const [open,  setOpen]   = useState(false)
  const [results, setResults] = useState<Record<string,boolean>>({})
  const [issues,  setIssues]  = useState(false)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  const allAnswered = checks.every((c) => results[c.key] !== undefined)

  function toggle(key: string, val: boolean) {
    setResults((prev) => ({ ...prev, [key]: val }))
    // If anything is set to false, auto-toggle issues on
    if (!val) setIssues(true)
  }

  async function handleSubmit() {
    if (!allAnswered) { setErr('Answer all items before submitting'); return }
    if (issues && !note.trim()) { setErr('Describe what was done about the issue'); return }
    setSaving(true); setErr('')
    await onSubmit(phase, results, issues, note)
    setSaving(false)
  }

  if (isDone) {
    const anyFail = Object.values(existing.check_results).some((v) => v === false)
    return (
      <div className="bg-status-success-soft border border-status-success-border rounded-2xl overflow-hidden">
        <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between">
          <div className="text-left">
            <p className="text-body font-semibold text-sm">{PHASE_LABELS[phase]}</p>
            <p className="text-status-success-text text-xs mt-0.5">
              Done · {new Date(existing.submitted_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
              {anyFail ? ' · issues noted' : ' · all pass'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {existing.issues && <Badge tone="warning">Issue noted</Badge>}
            <div className="w-6 h-6 rounded-full bg-status-success-soft flex items-center justify-center text-status-success-text">
              <CheckGlyph className="w-3.5 h-3.5" />
            </div>
            <ChevronGlyph open={open} />
          </div>
        </button>
        {open && (
          <div className="px-4 pb-4 border-t border-default pt-3 space-y-1.5">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${existing.check_results[c.key] ? 'bg-status-success-soft text-status-success-text' : 'bg-status-error-soft text-status-error-text'}`}>
                  {existing.check_results[c.key]
                    ? <CheckGlyph className="w-3 h-3" />
                    : <CrossGlyph className="w-3 h-3" />}
                </div>
                <p className="text-muted text-xs">{c.label}</p>
              </div>
            ))}
            {existing.issues && existing.what_did_you_do && (
              <div className="mt-3 bg-status-warning-soft border-l-2 border-status-warning-border pl-3 py-2">
                <p className="text-status-warning-text text-[10px] font-bold uppercase tracking-widest mb-0.5">Action taken</p>
                <p className="text-muted text-xs italic">{existing.what_did_you_do}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`border rounded-2xl overflow-hidden ${open ? 'border-status-warning-border bg-status-warning-soft' : 'border-default bg-surface-raised'}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between">
        <div className="text-left">
          <p className="text-body font-semibold text-sm">{PHASE_LABELS[phase]}</p>
          <p className="text-muted text-xs mt-0.5">{PHASE_SUBS[phase]}</p>
        </div>
        <ChevronGlyph open={open} />
      </button>

      {open && (
        <div className="border-t border-default">
          <div className="px-4 py-3 space-y-2">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <button onPointerDown={(e) => { e.preventDefault(); toggle(c.key, true) }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-all active:scale-95 ${results[c.key] === true ? 'bg-status-success-soft border-status-success-border text-status-success-text' : 'bg-surface-raised border-default text-subtle'}`}>
                  <CheckGlyph className="w-5 h-5" />
                </button>
                <button onPointerDown={(e) => { e.preventDefault(); toggle(c.key, false) }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-all active:scale-95 ${results[c.key] === false ? 'bg-status-error-soft border-status-error-border text-status-error-text' : 'bg-surface-raised border-default text-subtle'}`}>
                  <CrossGlyph className="w-5 h-5" />
                </button>
                <p className="text-body text-sm flex-1">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="px-4 pb-4 space-y-3 border-t border-default pt-3">
            <div className="flex items-center gap-3">
              <p className="text-muted text-sm">Any issues?</p>
              <div className="ml-auto">
                <SegmentedControl
                  aria-label="Any issues"
                  value={issues ? 'yes' : 'no'}
                  onChange={(v) => setIssues(v === 'yes')}
                  options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]}
                />
              </div>
            </div>

            {issues && (
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="What did you do? Describe the action taken…" />
            )}

            {err && <Banner tone="danger">{err}</Banner>}

            <Button fullWidth loading={saving} disabled={!allAnswered || saving}
              onClick={handleSubmit}>
              {saving ? 'Submitting…' : `Submit ${PHASE_LABELS[phase].toLowerCase()}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProcessRoomPage() {
  const [temps,      setTemps]      = useState<TempReading[]>([])
  const [diary,      setDiary]      = useState<DiaryEntry[]>([])
  const [thresholds, setThresholds] = useState<ProcessRoomThreshold[]>([])
  const [session,    setSession]    = useState<Session>(currentSession())
  const [date,       setDate]       = useState(todayISO())
  const [loading,    setLoading]    = useState(true)
  const [submitErr,  setSubmitErr]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  // Numpad state — draft buffer commits only on Confirm (range-gated), so an
  // out-of-range value can never land in the committed values.
  const [numpadField, setNumpadField] = useState<'product' | 'room' | null>(null)
  const [productVal,  setProductVal]  = useState('')
  const [roomVal,     setRoomVal]     = useState('')
  const [draft,       setDraft]       = useState('')

  // CCA + quick-ref overlays
  const [showCCA,   setShowCCA]   = useState(false)
  const [showQuick, setShowQuick] = useState(false)

  const productThreshold = thresholds.find((t) => t.name === 'Product core')
  const roomThreshold    = thresholds.find((t) => t.name === 'Room ambient')

  // Load today's data
  const loadData = useCallback((forDate: string) => {
    setLoading(true)
    fetch(`/api/haccp/process-room?date=${forDate}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        const allTemps: TempReading[] = d.temps ?? []
        const allDiary: DiaryEntry[]  = d.diary ?? []
        setTemps(allTemps)
        setDiary(allDiary)
        setThresholds(d.thresholds ?? [])
        // Smart session default — first unsubmitted
        const amDone = allTemps.some((t) => t.session === 'AM')
        const pmDone = allTemps.some((t) => t.session === 'PM')
        if (amDone && !pmDone) setSession('PM')
        else setSession('AM')
      })
      .catch((e) => setSubmitErr(`Could not load data — ${e.message}`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData(date) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDateChange(newDate: string) {
    setDate(newDate)
    setProductVal('')
    setRoomVal('')
    loadData(newDate)
  }

  // Clear temp inputs when session switches; pre-fill from an existing reading.
  useEffect(() => {
    const existing = temps.find((t) => t.session === session)
    if (existing) {
      setProductVal(String(existing.product_temp_c))
      setRoomVal(String(existing.room_temp_c))
    } else {
      setProductVal('')
      setRoomVal('')
    }
  }, [session, temps])

  const sessionReading     = temps.find((t) => t.session === session)
  const sessionAlreadyDone = !!sessionReading

  const productNum = parseFloat(productVal)
  const roomNum    = parseFloat(roomVal)
  const pStat      = productVal !== '' ? bandFor(productNum, productThreshold) : null
  const rStat      = roomVal !== '' ? bandFor(roomNum, roomThreshold) : null
  const bothFilled = productVal !== '' && !isNaN(productNum) && roomVal !== '' && !isNaN(roomNum)
  // Any non-pass band is a deviation (product amber now counts, matching server).
  const hasDeviation = (pStat !== null && pStat !== 'pass') || (rStat !== null && rStat !== 'pass')

  const doTempSubmit = useCallback(async (ca: CAPayload | null) => {
    setShowCCA(false); setSubmitErr(''); setSubmitting(true)
    try {
      const res = await fetch('/api/haccp/process-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'temps', session, date, product_temp_c: productNum, room_temp_c: roomNum, corrective_action: ca }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.ca_write_failed) {
          setSubmitErr('Readings saved, but corrective action record failed. Please notify admin.')
          setSubmitting(false)
          return
        }
        setSubmitted(true)
        loadData(date)
        setTimeout(() => setSubmitted(false), 2000)
      } else {
        const d = await res.json()
        setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error — try again') }
    finally { setSubmitting(false) }
  }, [session, date, productNum, roomNum, loadData])

  // Submit temperature session
  const handleTempSubmit = useCallback(() => {
    if (!bothFilled) return
    if (hasDeviation) { setShowCCA(true); return }
    doTempSubmit(null)
  }, [bothFilled, hasDeviation, doTempSubmit])

  // Submit diary phase
  const handleDiarySubmit = useCallback(async (phase: Phase, results: Record<string,boolean>, issues: boolean, note: string) => {
    setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/process-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diary', phase, date, check_results: results, issues, what_did_you_do: note }),
      })
      if (res.ok) { loadData(date) }
      else { const d = await res.json(); setSubmitErr(d.error ?? 'Submission failed') }
    } catch { setSubmitErr('Connection error — try again') }
  }, [date, loadData])

  // Open the pad, seeding the draft from the committed value.
  const openNumpad = useCallback((field: 'product' | 'room') => {
    setDraft(field === 'product' ? productVal : roomVal)
    setNumpadField(field)
  }, [productVal, roomVal])

  // Confirm is the ONLY commit path — range-gated by NumberPad.
  const commitNumpad = useCallback(() => {
    setNumpadField((f) => {
      if (f === 'product') setProductVal(draft)
      else if (f === 'room') setRoomVal(draft)
      return null
    })
  }, [draft])

  const tileClass = (s: TempStat, isEmpty: boolean) =>
    `flex-1 rounded-2xl p-4 cursor-pointer border transition-transform active:scale-[0.97] ${
      isEmpty ? 'bg-surface-raised border-default' : STATUS_CARD[s ?? 'pass'].shell
    }`

  const numpadThreshold = numpadField === 'product' ? productThreshold : roomThreshold
  const numpadBand = numpadField ? bandFor(parseFloat(draft), numpadThreshold) : null

  return (
    <div className="min-h-screen bg-surface-base flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-default bg-surface-raised">
        <IconButton aria-label="Back to HACCP" variant="ghost" icon={<BackGlyph />} onClick={() => { window.location.href = '/haccp' }} />
        <div className="flex-1 min-w-0">
          <p className="text-action-primary text-[10px] font-bold tracking-widest uppercase">CCP 3 + SOP 1 — Process Room</p>
          <h1 className="text-body text-lg font-bold leading-tight">Process Room Check</h1>
        </div>
        <Button variant="ghost" size="sm" leadingIcon={<HelpGlyph />} onClick={() => setShowQuick(true)}>
          Quick ref
        </Button>
        <Button variant="secondary" size="sm" leadingIcon={<HandbookGlyph />} onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/process-room' }}>
          Handbook
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 text-muted text-sm mt-16">
          <Spinner /> Loading…
        </div>
      ) : (
        <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

          {submitErr && <Banner tone="danger">{submitErr}</Banner>}

          {/* ── Card 1: Temperature check ── */}
          <div className="bg-surface-raised border border-default rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-default flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-sm">Temperature check</p>
                <p className="text-muted text-xs mt-0.5">CCP 3 · tap to enter reading</p>
              </div>
              <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)}
                max={todayISO()}
                className="bg-surface-raised border border-default rounded-xl px-3 py-1.5 text-body text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
              <SegmentedControl
                aria-label="Session"
                value={session}
                onChange={(s) => setSession(s)}
                options={(['AM','PM'] as Session[]).map((s) => {
                  const done = temps.some((t) => t.session === s)
                  return {
                    id: s,
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        {done && <CheckGlyph className="w-3.5 h-3.5" />}
                        {s}
                      </span>
                    ),
                  }
                })}
              />
            </div>

            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                {/* Product temp */}
                <div className={tileClass(pStat, productVal === '')}
                  onPointerDown={() => !sessionAlreadyDone && openNumpad('product')}>
                  <p className="text-muted text-xs mb-1.5">Product core</p>
                  <p className={`text-2xl font-bold ${pStat ? STATUS_CARD[pStat].text : 'text-subtle'}`}>
                    {productVal !== '' && !isNaN(productNum) ? `${productNum}°C` : 'Tap'}
                  </p>
                  <p className="text-subtle text-[10px] mt-1">Limit ≤{Number(productThreshold?.target_temp_c ?? 4)}°C</p>
                  {pStat && productVal !== '' && <div className="mt-1"><Badge tone={STATUS_BADGE_TONE[pStat]}>{STATUS_LABEL[pStat]}</Badge></div>}
                </div>

                {/* Room temp */}
                <div className={tileClass(rStat, roomVal === '')}
                  onPointerDown={() => !sessionAlreadyDone && openNumpad('room')}>
                  <p className="text-muted text-xs mb-1.5">Room ambient</p>
                  <p className={`text-2xl font-bold ${rStat ? STATUS_CARD[rStat].text : 'text-subtle'}`}>
                    {roomVal !== '' && !isNaN(roomNum) ? `${roomNum}°C` : 'Tap'}
                  </p>
                  <p className="text-subtle text-[10px] mt-1">Limit ≤{Number(roomThreshold?.target_temp_c ?? 12)}°C</p>
                  {rStat && roomVal !== '' && <div className="mt-1"><Badge tone={STATUS_BADGE_TONE[rStat]}>{STATUS_LABEL[rStat]}</Badge></div>}
                </div>
              </div>

              {/* Room above target verbatim warning */}
              {rStat && rStat !== 'pass' && roomVal !== '' && (
                <div className={`rounded-xl px-4 py-3 border ${STATUS_CARD[rStat].shell}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${STATUS_CARD[rStat].text}`}>
                    {rStat === 'critical' ? 'Critical — room temp action required' : `Room temp above ${Number(roomThreshold?.target_temp_c ?? 12)}°C — CCP 3 guidance`}
                  </p>
                  <p className="text-muted text-xs leading-relaxed">{procRoomHint('room', rStat)}</p>
                </div>
              )}

              {/* Submit / already done */}
              {sessionAlreadyDone ? (
                <Banner tone="success" icon={<CheckGlyph className="w-5 h-5" />} title={`${session} check submitted`}>
                  Product: {sessionReading?.product_temp_c}°C · Room: {sessionReading?.room_temp_c}°C
                </Banner>
              ) : submitted ? (
                <div className="flex items-center justify-center gap-2 py-3 text-status-success-text">
                  <CheckGlyph className="w-5 h-5" />
                  <p className="font-bold text-sm">Submitted</p>
                </div>
              ) : (
                <Button fullWidth loading={submitting} disabled={!bothFilled || submitting}
                  leadingIcon={!submitting ? <CheckGlyph className="w-5 h-5" /> : undefined}
                  onClick={handleTempSubmit}>
                  {submitting
                    ? 'Submitting…'
                    : `Submit ${session} temperature check${hasDeviation && bothFilled ? ' — action required' : ''}`}
                </Button>
              )}
            </div>
          </div>

          {/* ── Card 2: Daily diary ── */}
          <div className="bg-surface-raised border border-default rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-default flex items-center justify-between">
              <div>
                <p className="text-body font-semibold text-sm">Shift diary</p>
                <p className="text-muted text-xs mt-0.5">SOP 1 · three phases</p>
              </div>
              <Badge tone={diary.length === 3 ? 'success' : diary.length > 0 ? 'warning' : 'neutral'}>
                {diary.length} of 3 done
              </Badge>
            </div>

            <div className="p-3 space-y-2">
              {(['opening','operational','closing'] as Phase[]).map((phase) => (
                <DiaryPhaseCard
                  key={phase}
                  phase={phase}
                  existing={diary.find((d) => d.phase === phase)}
                  onSubmit={handleDiarySubmit}
                />
              ))}
            </div>

            <div className="mx-4 mb-4 border-l-2 border-status-warning-border pl-3 py-1">
              <p className="text-muted text-xs italic leading-relaxed">
                &quot;Problems are always happening — the important thing is to show what is being done to put things right.&quot;
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Numpad overlay */}
      {numpadField && (
        <Modal
          variant="sheet"
          open
          onOpenChange={(o) => { if (!o) setNumpadField(null) }}
          title={numpadField === 'product' ? 'Product core temperature' : 'Room ambient temperature'}
          description="CCP 3 — Process Room"
        >
          <NumberPad
            value={draft}
            onChange={setDraft}
            onConfirm={commitNumpad}
            allowDecimal
            allowNegative
            min={PROCESS_ROOM_MIN_TEMP_C}
            max={PROCESS_ROOM_MAX_TEMP_C}
            suffix="°C"
            tone={numpadBand ? STATUS_TONE[numpadBand] : 'neutral'}
            hint={
              numpadBand && numpadBand !== 'pass' ? (
                <span className={STATUS_CARD[numpadBand].text}>
                  {STATUS_LABEL[numpadBand]} — {procRoomHint(numpadField, numpadBand)}
                </span>
              ) : undefined
            }
          />
        </Modal>
      )}

      {/* CCA popup */}
      {showCCA && (
        <CCAPopup
          productTemp={productNum}
          roomTemp={roomNum}
          productThreshold={productThreshold}
          roomThreshold={roomThreshold}
          onSubmit={(ca) => doTempSubmit(ca)}
          onBack={() => setShowCCA(false)}
        />
      )}

      {/* Quick reference */}
      {showQuick && (
        <Modal variant="sheet" open onOpenChange={(o) => { if (!o) setShowQuick(false) }} title="CCP 3 — Quick Reference">
          <div className="space-y-3 text-sm pt-1">
            <div className="bg-surface-sunken border border-default rounded-xl p-4">
              <p className="text-action-primary font-bold text-xs uppercase tracking-widest mb-2">Product core temperature</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-success-fill flex-shrink-0" /><span className="text-muted">≤{Number(productThreshold?.target_temp_c ?? 4)}°C — Pass</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-warning-fill flex-shrink-0" /><span className="text-muted">{Number(productThreshold?.target_temp_c ?? 4)}–{Number(productThreshold?.max_temp_c ?? 7)}°C — Amber: return to chilled storage, reduce batch size</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-error-fill flex-shrink-0" /><span className="text-muted">&gt;{Number(productThreshold?.max_temp_c ?? 7)}°C — Critical: return to chilled storage immediately</span></div>
              </div>
            </div>
            <div className="bg-surface-sunken border border-default rounded-xl p-4">
              <p className="text-action-primary font-bold text-xs uppercase tracking-widest mb-2">Room ambient temperature</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-success-fill flex-shrink-0" /><span className="text-muted">≤{Number(roomThreshold?.target_temp_c ?? 12)}°C — Pass</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-warning-fill flex-shrink-0" /><span className="text-muted">{Number(roomThreshold?.target_temp_c ?? 12)}–{Number(roomThreshold?.max_temp_c ?? 15)}°C — Amber: do NOT stop cutting, bring product in small batches</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-status-error-fill flex-shrink-0" /><span className="text-muted">&gt;{Number(roomThreshold?.max_temp_c ?? 15)}°C — Critical: stop loading, return all product</span></div>
              </div>
            </div>
            <div className="bg-status-warning-soft border border-status-warning-border rounded-xl p-4">
              <p className="text-status-warning-text font-bold text-xs uppercase tracking-widest mb-1.5">Key rule (verbatim — HB-001)</p>
              <p className="text-muted text-xs leading-relaxed italic">&quot;Do NOT stop cutting. Bring product to production area progressively in small quantities to ensure core temperature does not exceed 4°C.&quot;</p>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
