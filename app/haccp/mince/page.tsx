/**
 * app/haccp/mince/page.tsx
 * CCP-M1, CCP-M2, CCP-MP1, CCP-MP2 — Mince & Meat Preparations
 * Three sub-forms: Mince log · Meatprep log · Time separation log
 * Source: MMP-001 V1.0 · MMP-MF-001 V1.0 · MMP-HA-001 V1.0
 *
 * Mince unit (Tier B): re-expressed onto components/ui/ + semantic tokens.
 * The hand-rolled number pad is now the reusable kit `NumberPad`; the CCA
 * popup and print use-by dialog use the kit `Modal`. The temperature and
 * kill-day limits come from the DB thresholds (haccp_mince_thresholds) via
 * the SHARED domain rule (`minceTempStatus` / `minceTempPass`), so the screen
 * and the server can never disagree — and all limit copy is DERIVED from the
 * fetched rows (`describeMinceBand`), so an admin threshold edit self-updates
 * the wording. FAIL-CLOSED: if the thresholds cannot be loaded, temperature
 * entry is disabled — there is no baked-in band table left.
 *
 * ⚠️ AMBER IS DISPLAY ONLY (spec-critical): `minceTempStatus` drives COLOUR
 * only (tiles / badges / numpad tone). Everything that decides paperwork —
 * the CCA popup trigger, submit gating, the persisted pass booleans — keys on
 * `minceTempPass`, which is deliberately blind to amber. An amber reading
 * still demands and files the corrective action, exactly as before.
 *
 * Bug fixes in this unit: (1) timesep corrective-action text now reaches the
 * server (was hardcoded undefined); (2) timesep history honours the date
 * filter; (3) a dual-channel failure shows ONE popup with a combined deduped
 * cause list; (4) submitErr renders exactly once on the mince tab.
 *
 * Printer flow byte-preserved (ADR-0010): `PrintLabelStrip`, the use-by
 * options (7/10/14/90/182 days) and `getPrinter().printMinceLabel` with
 * print errors surfacing via `submitErr` next to the submit button.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPrinter } from '@/lib/wiring/printer'
import PrintLabelStrip from '@/components/PrintLabelStrip'
import {
  Modal,
  NumberPad,
  Button,
  ScreenHeader,
  SegmentedControl,
  TextField,
  Textarea,
  Banner,
  Spinner,
  Badge,
  type NumberPadTone,
} from '@/components/ui'
import {
  minceTempKey,
  minceTempStatus,
  minceTempPass,
  minceKillDaysPass,
  minceKillDaysHardFail,
  describeMinceBand,
} from '@/lib/domain'
import type { MinceThreshold } from '@/lib/domain'

// Maps a label-print failure to a user-facing message, surfaced via the page's
// existing `submitErr` inline error `<p>` (no new UI component).
function printErrorMessage(kind: 'auth-bounce' | 'error'): string {
  return kind === 'auth-bounce'
    ? 'Session expired — please log in again to print.'
    : 'Could not print label — please try again.'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType = 'mince' | 'meatprep' | 'timesep'

interface DeliveryOption {
  id:               string
  supplier:         string
  product:          string
  product_category: string
  batch_number:     string
  slaughter_site:   string | null
  born_in:          string | null
  delivery_number:  number | null
  date:             string
  temperature_c:    number
  temp_status:      string
}

interface MinceRecord {
  id: string; date: string; time_of_production: string
  batch_code: string; product_species: string
  kill_date: string; days_from_kill: number
  kill_date_within_limit: boolean
  input_temp_c: number; output_temp_c: number
  input_temp_pass: boolean; output_temp_pass: boolean
  output_mode: string; source_batch_numbers: string[]
  corrective_action: string | null; submitted_at: string
  users: { name: string }
}

interface MeatprepRecord {
  id: string; date: string; time_of_production: string
  batch_code: string; product_name: string
  kill_date: string | null; days_from_kill: number | null
  input_temp_c: number; output_temp_c: number
  input_temp_pass: boolean; output_temp_pass: boolean
  output_mode: string
  allergens_present: string[]; label_check_completed: boolean
  source_batch_numbers: string[]
  corrective_action: string | null; submitted_at: string
  users: { name: string }
}

interface TimesepRecord {
  id: string; date: string; time_of_entry: string
  plain_products_end_time: string | null
  clean_completed_time: string
  allergen_products_start_time: string | null
  clean_verified_by: string; allergens_in_production: string
  corrective_action: string | null; submitted_at: string
  users: { name: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Species keys/labels only — limits are NOT hardcoded any more; the sublabel,
// kill-day enforcement and input limit derive from the fetched threshold rows.
const SPECIES: { key: string; label: string }[] = [
  { key: 'lamb',         label: 'Lamb' },
  { key: 'beef',         label: 'Beef (fresh)' },
  { key: 'imported_vac', label: 'Imported / vac-packed' },
]

const ALLERGENS = [
  'Mustard', 'Celery', 'Sulphites', 'Gluten', 'Milk/Dairy',
  'Soya', 'Eggs', 'Peanuts', 'Tree nuts', 'Crustaceans',
  'Molluscs', 'Fish', 'Lupin', 'Sesame',
]

const COUNTRIES: Record<string, string> = {
  IRL: 'Ireland', UK: 'UK', AUS: 'Australia', NZL: 'New Zealand', BRA: 'Brazil',
}

// ─── CA constants (adaptive popup — unchanged) ───────────────────────────────

type CAPayload = { cause: string; disposition: string; recurrence: string; notes: string }

type CAChannel = 'M1-input' | 'M1-output' | 'MP1-input' | 'MP1-output'

// Causes split by channel type — input breach ≠ output breach
const MINCE_CAUSES_BY_CHANNEL: Record<CAChannel, string[]> = {
  'M1-input': [
    'Supplier delivered product above temperature',
    'Delay in transit / vehicle breakdown',
    'Insufficient chilling at supplier before dispatch',
    'Product left unrefrigerated during intake process',
    'Intake temperature probe fault',
    'Other',
  ],
  'M1-output': [
    'Insufficient chilling time after mincing',
    'Batch too large — chiller capacity exceeded',
    'Chiller malfunction / temperature drift',
    'Room temperature too high during production',
    'Mincing friction heat — batch minced too quickly',
    'Other',
  ],
  'MP1-input': [
    'Supplier delivered product above temperature',
    'Delay in transit / vehicle breakdown',
    'Insufficient chilling at supplier before dispatch',
    'Product left unrefrigerated during intake process',
    'Intake temperature probe fault',
    'Other',
  ],
  'MP1-output': [
    'Insufficient chilling time after preparation',
    'Batch too large — chiller capacity exceeded',
    'Chiller malfunction / temperature drift',
    'Room temperature too high during production',
    'Other',
  ],
}

const MINCE_RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  // Input-related causes
  'Supplier delivered product above temperature':         ['Issue formal supplier notification', 'Request temperature records on next delivery', 'Review approved supplier status', 'Other'],
  'Delay in transit / vehicle breakdown':                 ['Improve delivery scheduling', 'Request pre-cooled delivery vehicles', 'Review delivery SLA with supplier', 'Other'],
  'Insufficient chilling at supplier before dispatch':    ['Issue formal supplier notification', 'Review approved supplier status', 'Request HACCP evidence from supplier', 'Other'],
  'Product left unrefrigerated during intake process':    ['Retrain intake staff on cold chain procedure', 'Revise intake SOP — chill immediately on receipt', 'Other'],
  'Intake temperature probe fault':                       ['Calibrate or replace probe immediately', 'Schedule regular probe calibration checks', 'Other'],
  // Output-related causes
  'Insufficient chilling time after mincing':             ['Increase chilling time before dispatch', 'Use blast chiller for mince output', 'Other'],
  'Batch too large — chiller capacity exceeded':          ['Reduce batch sizes', 'Split into smaller runs', 'Review chiller capacity vs production volume', 'Other'],
  'Chiller malfunction / temperature drift':              ['Contact refrigeration engineer immediately', 'Schedule preventive maintenance', 'Install temperature alarm', 'Other'],
  'Room temperature too high during production':          ['Improve ventilation in production room', 'Reduce production room temperature', 'Monitor CCP3 room temp before mincing', 'Other'],
  'Mincing friction heat — batch minced too quickly':     ['Slow down mincing process', 'Chill mince immediately post-mincing', 'Reduce batch size', 'Other'],
  'Insufficient chilling time after preparation':         ['Increase chilling time before dispatch', 'Use blast chiller', 'Other'],
  'Other':                                                ['Review procedure', 'Retrain staff', 'Schedule maintenance check', 'Other'],
}

// Protocol steps per channel — read-only in popup. Structure unchanged; the
// limit VALUES interpolate the resolved threshold row (no band literals).
function minceProtocol(ch: CAChannel, row: MinceThreshold | undefined): string[] {
  const p = row ? Number(row.pass_max) : null
  const lim = p !== null ? `${p}°C` : 'the limit'
  switch (ch) {
    case 'M1-input':
      return [
        'Quarantine batch immediately',
        'Assess product condition and odour',
        `Attempt rapid chilling to ≤${lim} within 2 hours`,
        `If ≤${lim} not achieved within 2 hours: reject — return to supplier`,
        'Investigate supplier temperature control',
        'Record on Mincing Production Log (MMP-MF-001 Form 1)',
      ]
    case 'M1-output':
      return [
        'Extend chilling period — recheck after 30 minutes',
        `If still above ${lim}: assess product safety`,
        'Reduce batch size — friction heat may be the cause',
        `Do not dispatch until ≤${lim} confirmed`,
      ]
    case 'MP1-input':
      return [
        'Quarantine batch immediately',
        'Assess product condition',
        `Attempt rapid chilling to ≤${lim} within 2 hours`,
        `If ≤${lim} not achieved: reject product`,
        'Record on Meat Prep Log (MMP-MF-001 Form 2)',
      ]
    case 'MP1-output':
      return [
        'Extend chilling period — recheck after 30 minutes',
        `If still above ${lim}: assess product safety before dispatch`,
        'Consider reducing batch size',
        'Do not dispatch until temperature compliance achieved',
      ]
  }
}

const MINCE_DISPOSITION_BY_CHANNEL: Record<CAChannel, string[]> = {
  'M1-input':  ['Assess', 'Reject', 'Conditional accept'],
  'M1-output': ['Conditional accept', 'Assess', 'Reject'],
  'MP1-input': ['Assess', 'Reject', 'Conditional accept'],
  'MP1-output':['Conditional accept', 'Assess', 'Reject'],
}

const CHANNEL_LABELS: Record<CAChannel, string> = {
  'M1-input':  'CCP-M1 — Input temperature exceeded',
  'M1-output': 'CCP-M1 — Output temperature exceeded',
  'MP1-input': 'CCP-MP1 — Input temperature exceeded',
  'MP1-output':'CCP-MP1 — Output temperature exceeded',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDays(killDate: string): number {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const diff  = new Date(today + 'T00:00:00').getTime() - new Date(killDate + 'T00:00:00').getTime()
  return Math.floor(diff / 86400000)
}

function fmtTime(t?: string) { return t?.slice(0, 5) ?? '—' }

function todayStr() {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Status → semantic tokens (green/amber CAGED: temp tiles + badges only) ──
// The 3-state verdict is DISPLAY ONLY — everything that persists or files
// paperwork keys on the boolean `minceTempPass` (amber ⇒ false ⇒ CA).

type TempStatus3 = 'pass' | 'amber' | 'fail'

const TEMP_STATUS_LABEL: Record<TempStatus3, string> = {
  pass: 'Pass', amber: 'Warning', fail: 'Fail',
}
const TEMP_TEXT: Record<TempStatus3, string> = {
  pass:  'text-status-success-text',
  amber: 'text-status-warning-text',
  fail:  'text-status-error-text',
}
const TEMP_TILE: Record<TempStatus3 | 'empty', string> = {
  pass:  'bg-status-success-soft border-status-success-border',
  amber: 'bg-status-warning-soft border-status-warning-border',
  fail:  'bg-status-error-soft border-status-error-border',
  empty: 'bg-surface-raised border-default',
}
const TEMP_BADGE_TONE: Record<TempStatus3, 'success' | 'warning' | 'danger'> = {
  pass: 'success', amber: 'warning', fail: 'danger',
}
const TEMP_PAD_TONE: Record<TempStatus3, NumberPadTone> = {
  pass: 'success', amber: 'warning', fail: 'danger',
}
const DELIVERY_TEMP_BADGE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  pass: 'success', urgent: 'warning', fail: 'danger',
}

// ─── Local glyphs (non-exported helpers — not kit assets) ─────────────────────

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-2">{children}</p>
  )
}

/** Combined deduped cause list across channels (bug fix 3): first-seen order,
 *  a single "Other" moved last. */
function combinedCauses(channels: CAChannel[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ch of channels) {
    for (const c of MINCE_CAUSES_BY_CHANNEL[ch]) {
      if (c === 'Other' || seen.has(c)) continue
      seen.add(c)
      out.push(c)
    }
  }
  out.push('Other')
  return out
}

// ─── CCA Popup ───────────────────────────────────────────────────────────────

function CCAPopup({ channels, channelRows, onSubmit, onBack }: {
  channels:    CAChannel[]
  /** Resolved threshold row per deviating channel — interpolates the protocol copy. */
  channelRows: Partial<Record<CAChannel, MinceThreshold>>
  onSubmit:    (ca: CAPayload) => void
  onBack:      () => void
}) {
  // Use the first channel's disposition list as primary (unchanged behaviour);
  // the cause list is the COMBINED dedup across all deviating channels (bug 3).
  const primary = channels[0]
  const causes = combinedCauses(channels)

  const [cause,       setCause]       = useState('')
  const [disposition, setDisposition] = useState(MINCE_DISPOSITION_BY_CHANNEL[primary][0])
  const [recurrence,  setRecurrence]  = useState('')
  const [notes,       setNotes]       = useState('')

  useEffect(() => {
    setDisposition(MINCE_DISPOSITION_BY_CHANNEL[primary][0])
    setRecurrence('')
  }, [cause]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = Boolean(cause && disposition && recurrence)

  return (
    <Modal
      variant="sheet"
      open
      onOpenChange={(o) => { if (!o) onBack() }}
      title="Corrective Action Required"
      description={
        channels.length > 1
          ? 'Temperature deviation · two channels — one record covers both'
          : 'Temperature deviation · complete all fields to submit'
      }
    >
      <div className="space-y-5 pt-1">

        {/* Deviation summary — "something is wrong" = red family */}
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch} className="bg-status-error-soft border border-status-error-border rounded-xl px-4 py-3">
              <p className="text-status-error-text text-xs font-bold">{CHANNEL_LABELS[ch]}</p>
            </div>
          ))}
        </div>

        {/* Protocol — read-only, per channel */}
        {channels.map((ch) => (
          <div key={ch}>
            <FieldLabel>Required action — {CHANNEL_LABELS[ch]}</FieldLabel>
            <div className="bg-surface-sunken border border-default rounded-xl px-4 py-3 space-y-2">
              {minceProtocol(ch, channelRows[ch]).map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-status-error-soft text-status-error-text">{i + 1}</div>
                  <p className="text-body text-xs leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Cause — combined deduped list across deviating channels (bug 3) */}
        <div>
          <FieldLabel>What caused this?</FieldLabel>
          <div className="space-y-1.5">
            {causes.map((c) => (
              <Button key={c} variant={cause === c ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                onClick={() => setCause(c)}>
                {c}
              </Button>
            ))}
          </div>
        </div>

        {/* Disposition */}
        <div>
          <FieldLabel>Product disposition</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {MINCE_DISPOSITION_BY_CHANNEL[primary].map((d) => (
              <Button key={d} variant={disposition === d ? 'primary' : 'ghost'} size="sm"
                onClick={() => setDisposition(d)}>
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
              {(MINCE_RECURRENCE_BY_CAUSE[cause] ?? MINCE_RECURRENCE_BY_CAUSE['Other']).map((r) => (
                <Button key={r} variant={recurrence === r ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                  onClick={() => setRecurrence(r)}>
                  {r}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <FieldLabel>Notes <span className="normal-case font-normal">(optional)</span></FieldLabel>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Additional details…" />
        </div>

        <p className="text-muted text-xs">This record is immutable once submitted. Protocol per CA-001 Table 4.</p>

        <Button variant="danger" fullWidth disabled={!canSubmit}
          onClick={() => onSubmit({ cause, disposition, recurrence, notes: notes.trim() })}>
          Confirm &amp; submit
        </Button>
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MincePage() {
  const [tab, setTab]       = useState<TabType>('mince')
  const [minceRecs, setMinceRecs]     = useState<MinceRecord[]>([])
  const [prepRecs,  setPrepRecs]      = useState<MeatprepRecord[]>([])
  const [tsRecs,    setTsRecs]        = useState<TimesepRecord[]>([])
  const [deliveries,setDeliveries]    = useState<DeliveryOption[]>([])
  const [minceBatches, setMinceBatches] = useState<{ id: string; batch_code: string; species: string; kill_date: string; output_mode: string }[]>([])
  const [thresholds, setThresholds]   = useState<MinceThreshold[]>([])
  const [loading,   setLoading]       = useState(true)
  const [printTarget, setPrintTarget] = useState<{ id: string; batchCode: string; outputMode: string; width: '100mm' | '58mm'; kind: 'mince' | 'prep' } | null>(null)
  const [dateFilter, setDateFilter]   = useState<'today' | 'week' | 'last_week'>('today')

  // ── Mince form state ────────────────────────────────────────────────────────
  const [mSpecies,       setMSpecies]       = useState('')
  const [mKillDate,      setMKillDate]      = useState('')
  const [mInputVal,      setMInputVal]      = useState('')
  const [mOutputVal,     setMOutputVal]     = useState('')
  const [mOutputMode,    setMOutputMode]    = useState<'chilled'|'frozen'>('chilled')
  const [mSourceIds,     setMSourceIds]     = useState<string[]>([])
  const [mSourceBatches, setMSourceBatches] = useState<string[]>([])

  // ── Meatprep form state ─────────────────────────────────────────────────────
  const [pProductName,      setPProductName]      = useState('')
  const [pSpecies,          setPSpecies]          = useState('')
  const [pKillDate,         setPKillDate]         = useState('')  // kept for route compat — not shown in UI
  const [pInputVal,         setPInputVal]         = useState('')
  const [pOutputVal,        setPOutputVal]        = useState('')
  const [pOutputMode,       setPOutputMode]       = useState<'chilled'|'frozen'>('chilled')
  const [pAllergens,        setPAllergens]        = useState<string[]>([])
  const [pLabelCheck,       setPLabelCheck]       = useState(false)
  const [pSourceIds,        setPSourceIds]        = useState<string[]>([])
  const [pSourceBatches,    setPSourceBatches]    = useState<string[]>([])
  // Source mince batches (today's runs) — for prep coming from mince
  const [pMinceBatchIds,    setPMinceBatchIds]    = useState<string[]>([])
  const [pMinceBatchCodes,  setPMinceBatchCodes]  = useState<string[]>([])

  // ── Time sep form state ─────────────────────────────────────────────────────
  const [tPlainEnd,      setTPlainEnd]      = useState('')
  const [tCleanDone,     setTCleanDone]     = useState('')
  const [tAllergenStart, setTAllergenStart] = useState('')
  const [tVerifiedBy,    setTVerifiedBy]    = useState('')
  const [tAllergens,     setTAllergens]     = useState('')
  const [tCA,            setTCA]            = useState('')

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [numpad,      setNumpad]      = useState<string | null>(null)
  const [submitErr,   setSubmitErr]   = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [flash,       setFlash]       = useState('')
  const [showCCA,     setShowCCA]     = useState(false)
  const [ccaChannels, setCcaChannels] = useState<CAChannel[]>([])
  const [pendingTab,  setPendingTab]  = useState<'mince' | 'meatprep' | null>(null)

  const loadData = useCallback(() => {
    setLoading(true)
    fetch(`/api/haccp/mince-prep?range=${dateFilter}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        setMinceRecs(d.mince ?? [])
        setPrepRecs(d.meatprep ?? [])
        setTsRecs(d.timesep ?? [])
        setDeliveries(d.deliveries ?? [])
        setMinceBatches(d.mince_batches ?? [])
        setThresholds(d.thresholds ?? [])
      })
      .catch((e) => setSubmitErr(`Load error — ${e.message}`))
      .finally(() => setLoading(false))
  }, [dateFilter])

  useEffect(() => { loadData() }, [loadData])

  // FAIL-CLOSED: no threshold rows = no ruler — refuse temperature grading.
  const thresholdsMissing = !loading && thresholds.length === 0

  // Row lookup (client-side: a missing row → undefined → no verdict, entry
  // disabled — never a baked-in fallback; none exists).
  const rowFor = useCallback(
    (key: string): MinceThreshold | undefined => thresholds.find((t) => t.key === key),
    [thresholds],
  )
  const bandFor = (key: string) => {
    const r = rowFor(key)
    return r ? describeMinceBand(r) : null
  }

  /** Client 3-state DISPLAY verdict (colour only). */
  function tempStatusFor(val: string, row: MinceThreshold | undefined): TempStatus3 | null {
    if (!val || !row) return null
    const n = parseFloat(val)
    if (isNaN(n)) return null
    return minceTempStatus(n, row)
  }

  const mInputRow  = rowFor(minceTempKey('mince', 'input', mOutputMode))
  const mOutputRow = rowFor(minceTempKey('mince', 'output', mOutputMode))
  const pInputRow  = rowFor(minceTempKey('meatprep', 'input', pOutputMode))
  const pOutputRow = rowFor(minceTempKey('meatprep', 'output', pOutputMode))

  const mInputNum     = parseFloat(mInputVal)
  const mOutputNum    = parseFloat(mOutputVal)
  const mDays         = mKillDate ? calcDays(mKillDate) : null
  const mKillRow      = mSpecies ? rowFor(`kill_days_${mSpecies}`) : undefined
  const mKillEnforced = mKillRow ? mKillRow.pass_max !== null : false
  const mKillHardFail = mDays !== null && mKillRow ? minceKillDaysHardFail(mDays, mKillRow) : false
  const mKillPass     = mDays !== null && mKillRow ? minceKillDaysPass(mDays, mKillRow) : null
  // DISPLAY verdicts (3-state, colour only)…
  const mInStatus     = tempStatusFor(mInputVal, mInputRow)
  const mOutStatus    = tempStatusFor(mOutputVal, mOutputRow)
  // …and the PAPERWORK booleans (amber ⇒ false ⇒ CCA popup + CA rows).
  const mInPass       = mInputVal && mInputRow ? minceTempPass(mInputNum, mInputRow) : null
  const mOutPass      = mOutputVal && mOutputRow ? minceTempPass(mOutputNum, mOutputRow) : null
  const mTempFail     = mInPass === false || mOutPass === false
  const mSp           = SPECIES.find((s) => s.key === mSpecies)

  const pInputNum  = parseFloat(pInputVal)
  const pOutputNum = parseFloat(pOutputVal)
  const pInStatus  = tempStatusFor(pInputVal, pInputRow)
  const pOutStatus = tempStatusFor(pOutputVal, pOutputRow)
  const pInPass    = pInputVal && pInputRow ? minceTempPass(pInputNum, pInputRow) : null
  const pOutPass   = pOutputVal && pOutputRow ? minceTempPass(pOutputNum, pOutputRow) : null
  const pAllergenIssue = pAllergens.length > 0 && !pLabelCheck

  function speciesSub(key: string): string {
    const killRow  = rowFor(`kill_days_${key}`)
    const inputRow = rowFor('mince_input')
    const inputLim = inputRow ? describeMinceBand(inputRow).limit : '—'
    if (!killRow) return `· ${inputLim}`
    return killRow.pass_max !== null
      ? `max ${Number(killRow.pass_max)}d · ${inputLim}`
      : `no kill limit · ${inputLim}`
  }

  function resetMince() {
    setMSpecies(''); setMKillDate(''); setMInputVal(''); setMOutputVal('')
    setMOutputMode('chilled'); setMSourceIds([]); setMSourceBatches([])
  }
  function resetPrep() {
    setPProductName(''); setPSpecies(''); setPKillDate(''); setPInputVal(''); setPOutputVal('')
    setPOutputMode('chilled'); setPAllergens([]); setPLabelCheck(false)
    setPSourceIds([]); setPSourceBatches([])
    setPMinceBatchIds([]); setPMinceBatchCodes([])
  }
  function resetTs() { setTPlainEnd(''); setTCleanDone(''); setTAllergenStart(''); setTVerifiedBy(''); setTAllergens(''); setTCA('') }

  async function doSubmit(ca: CAPayload | null) {
    setShowCCA(false); setSubmitErr(''); setSubmitting(true)
    const activeTab = pendingTab ?? tab
    setPendingTab(null)
    try {
      let body: Record<string, unknown>

      if (activeTab === 'mince') {
        body = {
          form: 'mince', product_species: mSpecies, kill_date: mKillDate,
          input_temp_c: mInputNum, output_temp_c: mOutputNum, output_mode: mOutputMode,
          source_batch_numbers: mSourceBatches, source_delivery_ids: mSourceIds,
          corrective_action: ca ?? undefined,
        }
      } else if (activeTab === 'meatprep') {
        body = {
          form: 'meatprep', product_name: pProductName,
          product_species: pSpecies || undefined,
          kill_date: undefined,
          input_temp_c: pInputNum, output_temp_c: pOutputNum, output_mode: pOutputMode,
          allergens_present: pAllergens, label_check_completed: pLabelCheck,
          source_batch_numbers: pSourceBatches, source_delivery_ids: pSourceIds,
          source_mince_batch_ids: pMinceBatchCodes,
          corrective_action: ca ?? undefined,
        }
      } else {
        body = {
          form: 'timesep',
          plain_products_end_time: tPlainEnd || undefined,
          clean_completed_time: tCleanDone,
          allergen_products_start_time: tAllergenStart || undefined,
          clean_verified_by: tVerifiedBy, allergens_in_production: tAllergens,
          // Bug fix 1 (client half): the free text now reaches the server
          // (was hardcoded undefined — the record lost its CA note).
          corrective_action: tCA.trim() || undefined,
        }
      }

      const res = await fetch('/api/haccp/mince-prep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const d = await res.json()
        if (d.ca_write_failed) {
          setSubmitErr('Record saved, but corrective action log failed. Notify admin.')
          return
        }
        const msg = activeTab === 'mince'
          ? `Mince logged — ${d.batch_code}`
          : activeTab === 'meatprep' ? `Prep logged — ${d.batch_code}`
          : 'Time separation logged'
        setFlash(msg)
        activeTab === 'mince' ? resetMince() : activeTab === 'meatprep' ? resetPrep() : resetTs()
        loadData()
        setTimeout(() => setFlash(''), 3000)
      } else {
        const d = await res.json()
        setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error') }
    finally { setSubmitting(false) }
  }

  function handleSubmit() {
    setSubmitErr('')

    if (tab === 'mince') {
      if (!mSpecies || !mKillDate || !mInputVal || !mOutputVal) {
        setSubmitErr('Fill in all required fields'); return
      }
      if (mKillHardFail) {
        setSubmitErr(`Kill date exceeded (${mDays} days) — DO NOT MINCE. Segregate product.`); return
      }
      if (mTempFail) {
        // Open CCA popup — keyed on the BOOLEAN (amber ⇒ popup, spec-critical)
        const channels: CAChannel[] = []
        if (mInPass === false)  channels.push('M1-input')
        if (mOutPass === false) channels.push('M1-output')
        setCcaChannels(channels); setPendingTab('mince'); setShowCCA(true); return
      }
      doSubmit(null)
    } else if (tab === 'meatprep') {
      if (!pProductName || !pInputVal || !pOutputVal) {
        setSubmitErr('Fill in all required fields'); return
      }
      if (pInPass === false || pOutPass === false) {
        const channels: CAChannel[] = []
        if (pInPass === false)  channels.push('MP1-input')
        if (pOutPass === false) channels.push('MP1-output')
        setCcaChannels(channels); setPendingTab('meatprep'); setShowCCA(true); return
      }
      doSubmit(null)
    } else {
      if (!tCleanDone || !tVerifiedBy || !tAllergens) {
        setSubmitErr('Fill in all required fields'); return
      }
      doSubmit(null)
    }
  }

  // Numpad target state: [value, setter, title, channel row]. The sign toggle
  // is available on EVERY channel (Hakan 2026-07-02): genuinely sub-zero
  // readings — e.g. a −1°C partially frozen intake — are recordable on input
  // and chilled-output tiles too, matching the old pad's permanent +/− toggle.
  const numpadState: Record<string, [string, (v: string) => void, string, MinceThreshold | undefined]> = {
    m_input:  [mInputVal,  setMInputVal,  'Input temperature (CCP-M1)',  mInputRow],
    m_output: [mOutputVal, setMOutputVal, 'Output temperature (CCP-M1)', mOutputRow],
    p_input:  [pInputVal,  setPInputVal,  'Input temperature (CCP-MP1)', pInputRow],
    p_output: [pOutputVal, setPOutputVal, 'Output temperature (CCP-MP1)', pOutputRow],
  }

  // Pre-compute filtered delivery lists in component body — avoids stale closure in DeliveryPicker
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  function matchesSpecies(d: DeliveryOption, species: string): boolean {
    if (!species) return true
    if (d.product_category === 'red_meat') return true  // legacy — show for both
    switch (species) {
      case 'lamb':         return d.product_category === 'lamb'
      case 'beef':
      case 'imported_vac': return d.product_category === 'beef'
      default:             return true
    }
  }

  const filteredMDeliveries = deliveries.filter((d) => matchesSpecies(d, mSpecies))
  const filteredPDeliveries = deliveries.filter((d) => matchesSpecies(d, pSpecies))

  /** Delivery batch picker — receives pre-filtered list as prop */
  function DeliveryPicker({
    form, filtered, activeSpecies,
  }: { form: 'mince' | 'meatprep'; filtered: DeliveryOption[]; activeSpecies: string }) {
    const selectedIds = form === 'mince' ? mSourceIds : pSourceIds
    const toggle = (d: DeliveryOption) => {
      const setIds     = form === 'mince' ? setMSourceIds     : setPSourceIds
      const setBatches = form === 'mince' ? setMSourceBatches : setPSourceBatches
      setIds((prev) => prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])
      setBatches((prev) => prev.includes(d.batch_number) ? prev.filter((x) => x !== d.batch_number) : [...prev, d.batch_number])
    }

    const hasDeliveries = deliveries.length > 0
    const hasFiltered   = filtered.length > 0

    if (!hasDeliveries) {
      return (
        <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-3">
          <p className="text-muted text-xs">No delivery batches in the last 16 days.</p>
        </div>
      )
    }

    if (activeSpecies && !hasFiltered) {
      const spLabel = SPECIES.find(s => s.key === activeSpecies)?.label ?? activeSpecies
      return (
        <div className="bg-surface-sunken border border-default rounded-xl px-4 py-3">
          <p className="text-body text-xs font-semibold">No {spLabel} batches found in recent deliveries.</p>
          <p className="text-muted text-xs mt-1">Log the delivery first via the Goods In section, or continue without selecting a source batch.</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {filtered.map((d) => {
          const sel     = selectedIds.includes(d.id)
          const isToday = d.date === today
          return (
            <button key={d.id} type="button" onClick={() => toggle(d)}
              className={`w-full text-left rounded-xl px-4 py-3 border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                sel ? 'border-action-primary bg-surface-raised' : 'border-default bg-surface-raised hover:border-input'
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.delivery_number && (
                      <span data-surface="bold-navy" className="text-[10px] font-bold bg-surface-inverse text-body px-1.5 py-0.5 rounded font-mono">#{d.delivery_number}</span>
                    )}
                    {!isToday && <span className="text-[10px] font-bold bg-status-info-soft text-status-info-text px-1.5 py-0.5 rounded">{d.date}</span>}
                    <p className="text-body text-sm font-semibold">{d.supplier}</p>
                  </div>
                  <p className="text-muted text-xs mt-0.5 truncate">{d.product}</p>
                  {d.batch_number && <p className="text-body text-xs font-mono font-bold mt-0.5">{d.batch_number}</p>}
                  {d.born_in && <p className="text-subtle text-[10px] mt-0.5">{COUNTRIES[d.born_in] ?? d.born_in}{d.slaughter_site ? ` · Site: ${d.slaughter_site}` : ''}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'border-action-primary bg-action-primary' : 'border-input bg-surface-raised'}`}>
                    {sel && <CheckGlyph className="w-3 h-3 text-action-primary-fg" />}
                  </div>
                  {/* pass/warn/fail badge on a temperature — caged colours legal */}
                  <Badge tone={DELIVERY_TEMP_BADGE_TONE[d.temp_status] ?? 'neutral'}>
                    {d.temperature_c}°C
                  </Badge>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  /** Mince batch picker for the prep form — today's mince runs */
  function MinceBatchPicker() {
    if (minceBatches.length === 0) {
      return (
        <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-3">
          <p className="text-muted text-xs">No mince runs logged today — select delivery batches above if sourcing direct from delivery.</p>
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {minceBatches.map((m) => {
          const sel = pMinceBatchIds.includes(m.id)
          return (
            <button key={m.id} type="button" onClick={() => {
              setPMinceBatchIds((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])
              setPMinceBatchCodes((prev) => prev.includes(m.batch_code) ? prev.filter((x) => x !== m.batch_code) : [...prev, m.batch_code])
            }}
              className={`w-full text-left rounded-xl px-4 py-3 border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                sel ? 'border-action-primary bg-surface-raised' : 'border-default bg-surface-raised hover:border-input'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-body text-sm font-semibold font-mono">{m.batch_code}</p>
                  <p className="text-subtle text-xs mt-0.5">
                    {m.species} · kill {m.kill_date} · {m.output_mode}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${sel ? 'border-action-primary bg-action-primary' : 'border-input bg-surface-raised'}`}>
                  {sel && <CheckGlyph className="w-3 h-3 text-action-primary-fg" />}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  /** History header + date-range filter — all three tabs (bug fix 2). */
  function HistoryHeader({ noun }: { noun: string }) {
    return (
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-muted text-xs font-bold uppercase tracking-widest">
          {dateFilter === 'today' ? `Today's ${noun}` : dateFilter === 'week' ? `This week's ${noun}` : `Last week's ${noun}`}
        </p>
        <SegmentedControl
          aria-label="Date range"
          value={dateFilter}
          onChange={(v) => setDateFilter(v as 'today' | 'week' | 'last_week')}
          options={[
            { id: 'today',     label: 'Today' },
            { id: 'week',      label: 'This week' },
            { id: 'last_week', label: 'Last week' },
          ]}
        />
      </div>
    )
  }

  function emptyRangeCopy() {
    return dateFilter === 'today' ? 'today' : dateFilter === 'week' ? 'this week' : 'last week'
  }

  /** Temperature entry tile — 3-state DISPLAY colour, boolean-driven badges. */
  function TempTile({ target, sub, value, num, status, disabled }: {
    target: string; sub: string; value: string; num: number
    status: TempStatus3 | null; disabled?: boolean
  }) {
    return (
      <button type="button" onClick={() => !disabled && setNumpad(target)} disabled={disabled}
        className={`w-full rounded-2xl px-4 py-3 border-2 flex items-center justify-between transition-all disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
          !value || !status ? TEMP_TILE.empty : TEMP_TILE[status]
        }`}>
        <div>
          <p className="text-muted text-xs mb-0.5">{sub}</p>
          <p className={`text-2xl font-bold font-mono ${!value ? 'text-subtle' : status ? TEMP_TEXT[status] : 'text-subtle'}`}>
            {value && !isNaN(num) ? `${num}°C` : 'Tap to enter'}
          </p>
        </div>
        {status && value && (
          <Badge tone={TEMP_BADGE_TONE[status]}>{TEMP_STATUS_LABEL[status]}</Badge>
        )}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-surface-base flex flex-col select-none">

      {/* Use-by selection dialog (printer flow byte-preserved — ADR-0010) */}
      {printTarget && (
        <Modal
          variant="sheet"
          open
          onOpenChange={(o) => { if (!o) setPrintTarget(null) }}
          title={`Print ${printTarget.width} label`}
          description={<span className="font-mono font-bold">{printTarget.batchCode}</span>}
        >
          <div className="space-y-2 pt-1 pb-2">
            <p className="text-muted text-xs capitalize">{printTarget.outputMode}</p>
            <FieldLabel>Select use-by date</FieldLabel>
            {[
              { label: 'Fresh 7 days',    days: 7   },
              { label: 'Fresh 10 days',   days: 10  },
              { label: 'Fresh 14 days',   days: 14  },
              { label: 'Frozen 3 months', days: 90  },
              { label: 'Frozen 6 months', days: 182 },
            ].map(opt => (
              <Button
                key={opt.days}
                variant="ghost"
                size="md"
                fullWidth
                className="justify-start"
                onPointerDown={async (e) => {
                  e.preventDefault()
                  const target = printTarget
                  setPrintTarget(null)
                  setSubmitErr('')
                  await getPrinter().printMinceLabel(
                    { kind: target.kind, id: target.id, usebydays: opt.days, width: target.width, copies: 1 },
                    (kind) => setSubmitErr(printErrorMessage(kind)),
                  )
                }}
              >
                {opt.label}
              </Button>
            ))}
            <Button variant="secondary" size="md" fullWidth
              onPointerDown={(e) => { e.preventDefault(); setPrintTarget(null) }}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {/* Header */}
      <ScreenHeader
        eyebrow="CCP-M1 · CCP-M2 · CCP-MP1 · CCP-MP2"
        title="Mince & Meat Prep"
        onBack={() => { window.location.href = '/haccp' }}
        backLabel="Back to HACCP"
        actions={
          <Button variant="ghost-inverse" size="sm" leadingIcon={<HandbookGlyph />}
            onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/mince' }}>
            Handbook
          </Button>
        }
      />

      {/* Tab selector — chrome: selected = orange primary (pairing law) */}
      <div className="px-5 pt-4 pb-0 grid grid-cols-3 gap-2">
        {([
          { key: 'mince',   label: 'Mince Log',  count: minceRecs.length },
          { key: 'meatprep',label: 'Meat Prep',  count: prepRecs.length  },
          { key: 'timesep', label: 'Time Sep',   count: tsRecs.length    },
        ] as const).map((t) => (
          <Button key={t.key} variant={tab === t.key ? 'primary' : 'ghost'} size="sm" fullWidth
            onClick={() => setTab(t.key)}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-[10px] opacity-70">({t.count})</span>}
          </Button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* FAIL-CLOSED: thresholds unavailable */}
        {thresholdsMissing && (
          <Banner tone="danger" title="Temperature limits unavailable">
            The CCP-M temperature and kill-day thresholds could not be loaded —
            temperature entry is disabled. Do not grade by memory; retry or contact the admin.
          </Banner>
        )}

        {/* Flash */}
        {flash && (
          <Banner tone="info" icon={<CheckGlyph className="w-5 h-5" />}>
            <span className="font-bold">{flash}</span>
          </Banner>
        )}

        {/* ── MINCE TAB ────────────────────────────────────────────────────── */}
        {tab === 'mince' && (
          <>
            <div className="bg-surface-raised border border-default rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-default">
                <p className="text-body font-semibold text-sm">Mincing Production Log</p>
                <p className="text-muted text-xs mt-0.5">CCP-M1 (Temp) · CCP-M2 (Kill date) · MMP-MF-001 Form 1</p>
              </div>

              <div className="px-4 py-4 space-y-4">

                {/* Species */}
                <div>
                  <FieldLabel>Species (CCP-M2 — determines kill date limit)</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {SPECIES.map((s) => (
                      <button key={s.key} type="button"
                        onClick={() => { setMSpecies(s.key); setMInputVal('') }}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                          mSpecies === s.key ? 'bg-action-primary text-action-primary-fg border-transparent' : 'border-input bg-surface-raised text-muted'
                        }`}>
                        {s.label}
                        <span className="block text-[9px] font-normal opacity-70">{speciesSub(s.key)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Delivery batch picker */}
                <div>
                  <FieldLabel>Source delivery batches (select all that apply)</FieldLabel>
                  <DeliveryPicker form="mince" filtered={filteredMDeliveries} activeSpecies={mSpecies} />
                  {mSourceBatches.length > 0 && (
                    <div className="mt-2 bg-surface-sunken border border-subtle rounded-lg px-3 py-2">
                      <p className="text-muted text-[10px] mb-1">Selected batches:</p>
                      <p className="text-body text-xs font-mono font-bold">{mSourceBatches.join(' · ')}</p>
                    </div>
                  )}
                </div>

                {/* Kill date */}
                <div>
                  <FieldLabel>
                    Kill date (CCP-M2)
                    {mSp && mKillRow && mKillEnforced && <span className="text-link"> — max {Number(mKillRow.pass_max)} days for {mSp.label}</span>}
                    {mSp && mKillRow && !mKillEnforced && <span className="normal-case font-normal"> — recorded for traceability only</span>}
                  </FieldLabel>
                  <TextField type="date" value={mKillDate}
                    onChange={(e) => setMKillDate(e.target.value)}
                    max={new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })} />
                  {mDays !== null && mSpecies && (
                    <div className={`mt-2 rounded-xl px-4 py-3 border ${
                      mKillHardFail ? 'bg-status-error-soft border-status-error-border' :
                      mKillPass && mKillEnforced ? 'bg-status-success-soft border-status-success-border' :
                      'bg-surface-sunken border-subtle'
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-bold ${
                          mKillHardFail ? 'text-status-error-text' :
                          mKillPass && mKillEnforced ? 'text-status-success-text' : 'text-body'
                        }`}>
                          {mDays} days from kill
                        </p>
                        {/* kill-day verdict badge — pass/fail badge, caged colours legal */}
                        <Badge tone={
                          mKillHardFail ? 'danger' :
                          !mKillEnforced ? 'neutral' :
                          mKillPass ? 'success' : 'warning'
                        }>
                          {mKillHardFail ? 'DO NOT MINCE' :
                           !mKillEnforced ? 'Informational' :
                           mKillPass ? `Pass ≤${Number(mKillRow?.pass_max)}d` : 'Warning'}
                        </Badge>
                      </div>
                      {mKillHardFail && (
                        <p className="text-status-error-text text-xs mt-1.5 font-semibold">
                          Kill date exceeded — segregate product. Return to supplier or dispose as Category 3 ABP.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Input temp */}
                <div>
                  <FieldLabel>Input temperature — CCP-M1</FieldLabel>
                  <TempTile
                    target="m_input"
                    sub={thresholdsMissing
                      ? 'Temperature limits unavailable — entry disabled'
                      : mSp ? `${mSp.label} · limit ${bandFor(minceTempKey('mince', 'input', mOutputMode))?.limit ?? '—'}` : 'Select species first'}
                    value={mInputVal} num={mInputNum} status={mInStatus}
                    disabled={!mSpecies || thresholdsMissing}
                  />
                </div>

                {/* Output temp */}
                <div>
                  <FieldLabel>Output temperature — CCP-M1</FieldLabel>
                  <div className="flex gap-2 mb-2">
                    {(['chilled','frozen'] as const).map((m) => (
                      <Button key={m} variant={mOutputMode === m ? 'primary' : 'ghost'} size="sm"
                        onClick={() => { setMOutputMode(m); setMOutputVal('') }}>
                        {m === 'chilled' ? 'Chilled' : 'Frozen'}
                        <span className="ml-1 font-normal text-[10px] opacity-70">
                          {bandFor(minceTempKey('mince', 'output', m))?.limit ?? '—'}
                        </span>
                      </Button>
                    ))}
                  </div>
                  <TempTile
                    target="m_output"
                    sub={thresholdsMissing
                      ? 'Temperature limits unavailable — entry disabled'
                      : `Check after ${mOutputMode === 'frozen' ? 'freezing' : 'chilling'} — must reach ${bandFor(minceTempKey('mince', 'output', mOutputMode))?.limit ?? '—'}`}
                    value={mOutputVal} num={mOutputNum} status={mOutStatus}
                    disabled={thresholdsMissing}
                  />
                </div>

                {/* Deviation info — anything over the pass line files paperwork */}
                {mTempFail && !mKillHardFail && mSpecies && mKillDate && mInputVal && mOutputVal && (
                  <div className="bg-status-deviation-soft border border-status-deviation-border rounded-xl px-4 py-3">
                    <p className="text-status-deviation-text text-[10px] font-bold uppercase tracking-widest mb-1">Temperature deviation — action required</p>
                    <p className="text-muted text-xs">Submit to open the corrective action form.</p>
                  </div>
                )}

                <p className="text-subtle text-xs">{todayStr()}</p>
                {/* Bug fix 4: submitErr renders ONCE on this tab — next to the
                    submit button (decision 19a placement). */}
                {submitErr && <p className="text-status-error-text text-xs">{submitErr}</p>}
              </div>

              <div className="px-4 pb-4">
                <Button
                  variant={mTempFail && !mKillHardFail ? 'danger' : 'primary'}
                  fullWidth
                  loading={submitting}
                  disabled={submitting || !mSpecies || !mKillDate || !mInputVal || !mOutputVal || mKillHardFail}
                  onClick={handleSubmit}>
                  {submitting ? 'Saving…' : mKillHardFail ? 'Blocked — kill date exceeded' : 'Submit mince log'}
                </Button>
              </div>
            </div>

            {/* Mince history */}
            <div>
              <HistoryHeader noun="mince runs" />
              {loading ? (
                <div className="flex items-center gap-3 text-muted text-sm py-4"><Spinner /> Loading…</div>
              ) : minceRecs.length === 0
              ? <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-5 text-center"><p className="text-muted text-sm">No mince runs logged {emptyRangeCopy()}</p></div>
              : (
                <div className="space-y-2">
                  {minceRecs.map((r) => (
                    <div key={r.id} className="bg-surface-raised border border-default rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                          {dateFilter !== 'today' && (
                            <span className="inline-block text-[10px] font-bold bg-status-info-soft text-status-info-text px-1.5 py-0.5 rounded mb-0.5">
                              {new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          <p className="text-body font-semibold text-sm font-mono">{r.batch_code}</p>
                          <p className="text-muted text-xs mt-0.5">{r.product_species} · {r.days_from_kill}d from kill</p>
                          {r.source_batch_numbers?.length > 0 && (
                            <p className="text-subtle text-[10px] mt-0.5">From: {r.source_batch_numbers.join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <p className="text-muted text-xs">{fmtTime(r.time_of_production)}</p>
                          {/* boolean-based history badge — stored rows are NOT
                              retro-graded against the (possibly edited) bands */}
                          <Badge tone={r.kill_date_within_limit && r.input_temp_pass && r.output_temp_pass ? 'success' : 'danger'}>
                            {r.kill_date_within_limit && r.input_temp_pass && r.output_temp_pass ? 'All pass' : 'Deviation'}
                          </Badge>
                        </div>
                      </div>
                      <PrintLabelStrip
                        on100mm={() => setPrintTarget({ id: r.id, batchCode: r.batch_code, outputMode: r.output_mode, width: '100mm', kind: 'mince' })}
                        on58mm={() => setPrintTarget({ id: r.id, batchCode: r.batch_code, outputMode: r.output_mode, width: '58mm', kind: 'mince' })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── MEATPREP TAB ────────────────────────────────────────────────────── */}
        {tab === 'meatprep' && (
          <>
            <div className="bg-surface-raised border border-default rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-default">
                <p className="text-body font-semibold text-sm">Meat Preparations Production Log</p>
                <p className="text-muted text-xs mt-0.5">CCP-MP1 (Temp) · CCP-MP2 (Allergens) · MMP-MF-001 Form 2</p>
              </div>

              <div className="px-4 py-4 space-y-4">

                {/* Product name */}
                <div>
                  <FieldLabel>Product name</FieldLabel>
                  <TextField type="text" value={pProductName} onChange={(e) => setPProductName(e.target.value)}
                    placeholder="e.g. Marinated lamb leg, Burger patties, Seasoned mince" />
                </div>

                {/* Species (optional for prep) */}
                <div>
                  <FieldLabel>Species (optional — for traceability)</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {SPECIES.map((s) => (
                      <Button key={s.key} variant={pSpecies === s.key ? 'primary' : 'ghost'} size="sm"
                        onClick={() => setPSpecies(pSpecies === s.key ? '' : s.key)}>
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Source — delivery batches */}
                <div>
                  <FieldLabel>Source delivery batches (select all that apply)</FieldLabel>
                  <DeliveryPicker form="meatprep" filtered={filteredPDeliveries} activeSpecies={pSpecies} />
                </div>

                {/* Source — mince batches (today's runs) */}
                <div>
                  <FieldLabel>Source mince batches — today&apos;s runs (select if prep comes from mince)</FieldLabel>
                  <MinceBatchPicker />
                  {pMinceBatchCodes.length > 0 && (
                    <div className="mt-2 bg-surface-sunken border border-subtle rounded-lg px-3 py-2">
                      <p className="text-muted text-[10px] mb-1">Selected mince batches:</p>
                      <p className="text-body text-xs font-mono font-bold">{pMinceBatchCodes.join(' · ')}</p>
                    </div>
                  )}
                </div>

                {/* Input temp */}
                <div>
                  <FieldLabel>Input temperature — CCP-MP1 ({bandFor(minceTempKey('meatprep', 'input', pOutputMode))?.limit ?? '—'})</FieldLabel>
                  <TempTile
                    target="p_input"
                    sub={thresholdsMissing ? 'Temperature limits unavailable — entry disabled' : `Probe reading · limit ${bandFor(minceTempKey('meatprep', 'input', pOutputMode))?.limit ?? '—'}`}
                    value={pInputVal} num={pInputNum} status={pInStatus}
                    disabled={thresholdsMissing}
                  />
                </div>

                {/* Output temp */}
                <div>
                  <FieldLabel>Output temperature — CCP-MP1</FieldLabel>
                  <div className="flex gap-2 mb-2">
                    {(['chilled','frozen'] as const).map((m) => (
                      <Button key={m} variant={pOutputMode === m ? 'primary' : 'ghost'} size="sm"
                        onClick={() => { setPOutputMode(m); setPOutputVal('') }}>
                        {m === 'chilled' ? 'Chilled' : 'Frozen'}
                        <span className="ml-1 font-normal text-[10px] opacity-70">
                          {bandFor(minceTempKey('meatprep', 'output', m))?.limit ?? '—'}
                        </span>
                      </Button>
                    ))}
                  </div>
                  <TempTile
                    target="p_output"
                    sub={thresholdsMissing
                      ? 'Temperature limits unavailable — entry disabled'
                      : `Check after ${pOutputMode === 'frozen' ? 'freezing' : 'chilling'} — must reach ${bandFor(minceTempKey('meatprep', 'output', pOutputMode))?.limit ?? '—'}`}
                    value={pOutputVal} num={pOutputNum} status={pOutStatus}
                    disabled={thresholdsMissing}
                  />
                </div>

                {/* Allergens — CCP-MP2 ("something needs attention" = red family) */}
                <div>
                  <FieldLabel>Allergens present (CCP-MP2) — select all that apply</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGENS.map((a) => (
                      <Button key={a} variant={pAllergens.includes(a) ? 'danger' : 'ghost'} size="sm"
                        onClick={() => setPAllergens((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])}>
                        {a}
                      </Button>
                    ))}
                  </div>
                  {pAllergens.length === 0 && (
                    <p className="text-muted text-xs mt-1.5">Select none if plain meat product with no allergen ingredients</p>
                  )}
                </div>

                {/* Label check — required if allergens */}
                {pAllergens.length > 0 && (
                  <button type="button" onClick={() => setPLabelCheck((v) => !v)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                      pLabelCheck ? 'border-action-primary bg-surface-raised' : 'border-status-error-border bg-status-error-soft'
                    }`}>
                    <div className={`w-6 h-6 rounded border-2 flex-shrink-0 flex items-center justify-center ${pLabelCheck ? 'border-action-primary bg-action-primary' : 'border-status-error-border bg-surface-raised'}`}>
                      {pLabelCheck && <CheckGlyph className="w-3.5 h-3.5 text-action-primary-fg" />}
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-bold ${pLabelCheck ? 'text-body' : 'text-status-error-text'}`}>Label check completed (CCP-MP2)</p>
                      <p className="text-muted text-xs">All allergens verified on label before production starts</p>
                    </div>
                  </button>
                )}

                {/* Deviation info — popup opens on submit */}
                {(pInPass === false || pOutPass === false) && (
                  <div className="bg-status-deviation-soft border border-status-deviation-border rounded-xl px-4 py-3">
                    <p className="text-status-deviation-text text-[10px] font-bold uppercase tracking-widest mb-1">Temperature deviation detected</p>
                    <p className="text-muted text-xs">A corrective action record will be required before this submission is saved.</p>
                  </div>
                )}

                <p className="text-subtle text-xs">{todayStr()}</p>
                {submitErr && <p className="text-status-error-text text-xs">{submitErr}</p>}
              </div>

              <div className="px-4 pb-4">
                <Button
                  variant={pInPass === false || pOutPass === false ? 'danger' : 'primary'}
                  fullWidth
                  loading={submitting}
                  disabled={submitting || !pProductName || !pInputVal || !pOutputVal || pAllergenIssue}
                  onClick={handleSubmit}>
                  {submitting ? 'Saving…' : 'Submit meat prep log'}
                </Button>
              </div>
            </div>

            {/* Meatprep history */}
            <div>
              <HistoryHeader noun="prep runs" />
              {prepRecs.length === 0
              ? <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-5 text-center"><p className="text-muted text-sm">No prep runs logged {emptyRangeCopy()}</p></div>
              : (
                <div className="space-y-2">
                  {prepRecs.map((r) => (
                    <div key={r.id} className="bg-surface-raised border border-default rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {dateFilter !== 'today' && (
                            <span className="inline-block text-[10px] font-bold bg-status-info-soft text-status-info-text px-1.5 py-0.5 rounded mb-0.5">
                              {new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          <p className="text-body font-semibold text-sm font-mono">{r.batch_code}</p>
                          <p className="text-muted text-xs mt-0.5">{r.product_name}</p>
                          {r.allergens_present?.length > 0 && (
                            <p className="text-status-error-text text-[10px] mt-0.5">Allergens: {r.allergens_present.join(', ')}</p>
                          )}
                          {r.source_batch_numbers?.length > 0 && (
                            <p className="text-subtle text-[10px] mt-0.5">From: {r.source_batch_numbers.join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p className="text-muted text-xs">{fmtTime(r.time_of_production)}</p>
                          <Badge tone={r.input_temp_pass && r.output_temp_pass && r.label_check_completed ? 'success' : 'warning'}>
                            {r.input_temp_pass && r.output_temp_pass ? 'Pass' : 'Deviation'}
                          </Badge>
                        </div>
                      </div>
                      <PrintLabelStrip
                        on100mm={() => setPrintTarget({ id: r.id, batchCode: r.batch_code, outputMode: r.output_mode, width: '100mm', kind: 'prep' })}
                        on58mm={() => setPrintTarget({ id: r.id, batchCode: r.batch_code, outputMode: r.output_mode, width: '58mm', kind: 'prep' })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TIME SEP TAB ─────────────────────────────────────────────────── */}
        {tab === 'timesep' && (
          <>
            {/* Process sequence reminder — chrome, not a verdict → info banner */}
            <Banner tone="info" title="Required process sequence (MMP-001 §7)">
              <span className="block space-y-0.5">
                {[
                  '1. Complete ALL plain cutting / mincing',
                  '2. Remove all plain products from area',
                  '3. FULL CLEAN & SANITISE all equipment and surfaces',
                  '4. Visual inspection — verify cleanliness',
                  '5. Sign off below',
                  '6. Begin allergen products',
                ].map((s) => (
                  <span key={s} className="block text-xs leading-relaxed">{s}</span>
                ))}
              </span>
            </Banner>

            <div className="bg-surface-raised border border-default rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-default">
                <p className="text-body font-semibold text-sm">Time Separation Log</p>
                <p className="text-muted text-xs mt-0.5">MMP-MF-001 Form 3 · Allergen cross-contamination prevention</p>
              </div>

              <div className="px-4 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Plain products ended</FieldLabel>
                    <TextField type="time" value={tPlainEnd} onChange={(e) => setTPlainEnd(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel>Clean completed ✱</FieldLabel>
                    <TextField type="time" value={tCleanDone} onChange={(e) => setTCleanDone(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Allergen products started</FieldLabel>
                    <TextField type="time" value={tAllergenStart} onChange={(e) => setTAllergenStart(e.target.value)} />
                  </div>
                </div>

                <div>
                  <FieldLabel>Clean verified by ✱</FieldLabel>
                  <TextField type="text" value={tVerifiedBy} onChange={(e) => setTVerifiedBy(e.target.value)}
                    placeholder="Name of person who visually verified the clean" />
                </div>

                <div>
                  <FieldLabel>Allergens in production ✱</FieldLabel>
                  <TextField type="text" value={tAllergens} onChange={(e) => setTAllergens(e.target.value)}
                    placeholder="e.g. Mustard, Gluten, Soya" />
                </div>

                <div>
                  <FieldLabel>Corrective action (if any issue found)</FieldLabel>
                  <Textarea value={tCA} onChange={(e) => setTCA(e.target.value)} rows={2}
                    placeholder="Any issues or actions taken…" />
                </div>

                <p className="text-subtle text-xs">{todayStr()}</p>
                {submitErr && <p className="text-status-error-text text-xs">{submitErr}</p>}
              </div>

              <div className="px-4 pb-4">
                <Button variant="primary" fullWidth loading={submitting}
                  disabled={submitting || !tCleanDone || !tVerifiedBy || !tAllergens}
                  onClick={handleSubmit}>
                  {submitting ? 'Saving…' : 'Submit time separation log'}
                </Button>
              </div>
            </div>

            {/* Time sep history — honours the date filter (bug fix 2) */}
            <div>
              <HistoryHeader noun="time separation records" />
              {tsRecs.length === 0
              ? <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-5 text-center"><p className="text-muted text-sm">No time separation logs {emptyRangeCopy()}</p></div>
              : (
                <div className="space-y-2">
                  {tsRecs.map((r) => (
                    <div key={r.id} className="bg-surface-raised border border-default rounded-xl px-4 py-3">
                      {dateFilter !== 'today' && (
                        <span className="inline-block text-[10px] font-bold bg-status-info-soft text-status-info-text px-1.5 py-0.5 rounded mb-0.5">
                          {new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      <p className="text-body font-semibold text-sm">Clean completed: {fmtTime(r.clean_completed_time)}</p>
                      <p className="text-muted text-xs mt-0.5">Verified by: {r.clean_verified_by}</p>
                      <p className="text-status-error-text text-xs mt-0.5">Allergens: {r.allergens_in_production}</p>
                      {r.allergen_products_start_time && (
                        <p className="text-subtle text-[10px] mt-0.5">Allergen production started: {fmtTime(r.allergen_products_start_time)}</p>
                      )}
                      {r.corrective_action && (
                        <p className="text-muted text-[10px] mt-0.5">Corrective action: {r.corrective_action}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* CCA Popup */}
      {showCCA && (
        <CCAPopup
          channels={ccaChannels}
          channelRows={{
            'M1-input':   mInputRow,
            'M1-output':  mOutputRow,
            'MP1-input':  pInputRow,
            'MP1-output': pOutputRow,
          }}
          onSubmit={(ca) => doSubmit(ca)}
          onBack={() => { setShowCCA(false); setPendingTab(null) }}
        />
      )}

      {/* Numpad — kit NumberPad in a kit Modal (sheet) */}
      {numpad && numpadState[numpad] && (() => {
        const [val, setVal, label, row] = numpadState[numpad]
        const band = row ? describeMinceBand(row) : null
        const status = tempStatusFor(val, row)
        return (
          <Modal
            variant="sheet"
            open
            onOpenChange={(o) => { if (!o) setNumpad(null) }}
            title={label}
            description={band ? `Bands: ${band.detail}` : undefined}
          >
            <NumberPad
              value={val}
              onChange={setVal}
              onConfirm={() => setNumpad(null)}
              allowDecimal
              allowNegative
              suffix="°C"
              tone={status ? TEMP_PAD_TONE[status] : 'neutral'}
              hint={status ? (
                <span className="block">
                  <Badge tone={TEMP_BADGE_TONE[status]}>{TEMP_STATUS_LABEL[status]}</Badge>
                  {status !== 'pass' && (
                    <span className="block mt-1 text-status-error-text text-left">
                      Above the pass limit — a corrective action will be required on submit.
                    </span>
                  )}
                </span>
              ) : undefined}
            />
          </Modal>
        )
      })()}

    </div>
  )
}
