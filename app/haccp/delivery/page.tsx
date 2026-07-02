/**
 * app/haccp/delivery/page.tsx
 *
 * CCP 1 — Goods In (Delivery Intake Temperature Check)
 * Event-driven: one record per delivery. Form resets after submit.
 * Supplier: chips from DB + "Other" free text fallback.
 *
 * Goods In unit (Tier B): re-expressed onto components/ui/ + semantic tokens.
 * The hand-rolled number pad is now the reusable kit `NumberPad`; the CCA,
 * delivery-detail and quick-ref overlays use the kit `Modal`. The
 * pass/urgent/fail bands come from the DB thresholds
 * (haccp_goods_in_thresholds) via the SHARED domain rule `goodsInStatus`, so
 * the screen and the server can never disagree — and the chip copy is DERIVED
 * from the fetched rows (`describeGoodsInBands`), so an admin threshold edit
 * self-updates the wording. FAIL-CLOSED: if the thresholds cannot be loaded,
 * temperature entry is disabled — there is no baked-in band table left.
 *
 * Behaviour preserved exactly (spec §1 inventory): category-first form,
 * category-filtered supplier chips + Other, meat-only BLS block (curated
 * country chips + ISO search, same-as shortcuts, live DDMM-CC-N batch
 * preview), contamination 3-way + 4 types + notes, SALSA 1.4.2 allergen check
 * (auto-CA on meat/poultry categories only), two-track CCA popup,
 * Today/This-week/Last-week log + detail sheet, SOP 5B banner, quick ref,
 * handbook link, Europe/London stamping, ca_write_failed path. Printer-port
 * label flow byte-preserved (ADR-0010).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPrinter } from '@/lib/wiring/printer'
import type { DeliveryLabelInput } from '@/lib/ports'
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
import { goodsInStatus, describeGoodsInBands } from '@/lib/domain'
import type { GoodsInThreshold } from '@/lib/domain'

// Maps a label-print failure to a user-facing message, surfaced via each
// screen's existing `submitErr` red-inline `<p>` (no new UI component).
type PrintErrorHandler = (kind: 'auth-bounce' | 'error') => void

function printErrorMessage(kind: 'auth-bounce' | 'error'): string {
  return kind === 'auth-bounce'
    ? 'Session expired — please log in again to print.'
    : 'Could not print label — please try again.'
}

// ── Print handlers (via the Printer port) ───────────────────────────────────────
// The screen no longer knows HOW a label reaches paper. It builds the port's
// DeliveryLabelInput and asks the wired printer to print; the wiring picks the
// adapter (Sunmi native for 58mm on the V3, browser/iframe everywhere else and as
// fallback) and the Sunmi adapter handles the native→iframe fallback internally.
// `onError` surfaces a dead-session / failure to the caller's existing submitErr.

function buildDeliveryInput(d: Delivery, width: '58mm' | '100mm'): DeliveryLabelInput {
  return {
    id:               d.id,
    batch_number:     d.batch_number ?? '',
    supplier:         d.supplier,
    product_category: d.product_category,
    date:             d.date,
    temperature_c:    d.temperature_c,
    temp_status:      d.temp_status,
    born_in:          d.born_in,
    reared_in:        d.reared_in,
    slaughter_site:   d.slaughter_site,
    cut_site:         d.cut_site,
    allergens_flagged: d.allergens_identified,
    allergen_notes:    d.allergen_notes,
    width,
    copies:           1,
  }
}

async function handlePrint58(d: Delivery, onError: PrintErrorHandler): Promise<void> {
  await getPrinter().printDeliveryLabel(buildDeliveryInput(d, '58mm'), onError)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TempStatus = 'pass' | 'urgent' | 'fail' | null

// action is NOT in the payload — server derives it from deviation + cause
type CAPayload = {
  cause:       string
  disposition: string
  recurrence:  string
  notes:       string
}

interface Supplier  { id: string; name: string; categories: string[] }

// Categories that require BLS traceability fields
// offal: bovine offal legally requires BLS; lamb offal best practice
// frozen_beef_lamb: frozen red meat still requires BLS (same regs as fresh)
const MEAT_CATEGORIES = new Set(['lamb', 'beef', 'red_meat', 'offal', 'frozen_beef_lamb'])
// Categories that have a temperature CCP (all except dry_goods)
const NO_TEMP_CATEGORIES = new Set(['dry_goods'])
// Frozen family — number pad offers the sign key (cold-storage precedent)
const FROZEN_CATEGORIES = new Set(['frozen', 'frozen_beef_lamb'])

function isMeatCategory(cat: string) { return MEAT_CATEGORIES.has(cat) }
function noTempCategory(cat: string)  { return NO_TEMP_CATEGORIES.has(cat) }

// Filter suppliers to those tagged for the selected category
function filterSuppliers(suppliers: Supplier[], category: string): Supplier[] {
  if (!category) return []
  return suppliers.filter(s =>
    s.categories.length === 0 ||  // no categories = show for all (backwards compat)
    s.categories.includes(category)
  )
}
interface Delivery  {
  id:                   string
  date:                 string
  time_of_delivery:     string
  supplier:             string
  product:              string
  product_category:     string
  temperature_c:        number | null
  temp_status:          string
  covered_contaminated: string
  corrective_action_required: boolean
  contamination_notes:  string | null
  notes:                string | null
  born_in:              string | null
  reared_in:            string | null
  slaughter_site:       string | null
  cut_site:             string | null
  batch_number:         string | null
  delivery_number:      number | null
  allergens_identified: boolean
  allergen_notes:       string | null
  submitted_at:         string
  users:                { name: string }
}

// SALSA 1.4 — 14 EU/UK regulated allergens
const ALLERGENS = [
  'Mustard', 'Celery', 'Sulphites', 'Gluten', 'Milk/Dairy',
  'Soya', 'Eggs', 'Peanuts', 'Tree nuts', 'Crustaceans',
  'Molluscs', 'Fish', 'Lupin', 'Sesame',
]

// The 9 selectable categories. Band copy (limit/detail) is NOT hardcoded any
// more — it is derived from the fetched thresholds via `describeGoodsInBands`.
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'lamb',             label: 'Lamb' },
  { key: 'beef',             label: 'Beef' },
  { key: 'offal',            label: 'Offal' },
  { key: 'frozen',           label: 'Frozen' },
  { key: 'frozen_beef_lamb', label: 'Frozen Beef/Lamb' },
  { key: 'poultry',          label: 'Poultry' },
  { key: 'dairy',            label: 'Dairy / Chilled' },
  { key: 'chilled_other',    label: 'Chilled Other' },
  { key: 'dry_goods',        label: 'Dry Goods' },
]

const CATEGORY_LABELS: Record<string, string> = {
  lamb: 'Lamb', beef: 'Beef', red_meat: 'Red meat',
  offal: 'Offal', mince_prep: 'Mince / prep', frozen: 'Frozen',
  frozen_beef_lamb: 'Frozen Beef/Lamb',
  poultry: 'Poultry', dairy: 'Dairy / Chilled',
  chilled_other: 'Chilled Other', dry_goods: 'Dry Goods',
}

// ── Category chips — brand family tokens (pairing-law §5.11, Step-10 tokens) ──
// Visual concern only: which brand chip family each category key belongs to.
type CategoryFamily = 'meat' | 'frozen' | 'chilled' | 'poultry' | 'ambient'

const CATEGORY_FAMILY: Record<string, CategoryFamily> = {
  lamb: 'meat', beef: 'meat', red_meat: 'meat', offal: 'meat', mince_prep: 'meat',
  frozen: 'frozen', frozen_beef_lamb: 'frozen',
  dairy: 'chilled', chilled_other: 'chilled',
  poultry: 'poultry',
  dry_goods: 'ambient',
}

// Literal class strings (not interpolated) so Tailwind's scanner keeps them.
const FAMILY_CHIP: Record<CategoryFamily, string> = {
  meat:    'bg-category-meat-fill text-category-meat-fg',
  frozen:  'bg-category-frozen-fill text-category-frozen-fg',
  chilled: 'bg-category-chilled-fill text-category-chilled-fg',
  poultry: 'bg-category-poultry-fill text-category-poultry-fg',
  ambient: 'bg-category-ambient-fill text-category-ambient-fg',
}

function categoryChipClass(cat: string): string {
  return FAMILY_CHIP[CATEGORY_FAMILY[cat] ?? 'ambient']
}

// ─── Countries ────────────────────────────────────────────────────────────────

// Curated 14 — shown as chips. ISO 3166-1 alpha-2.
const CURATED_CODES = ['GB','IE','AU','NZ','BR','US','AR','UY','ZA','NL','DE','FR','ES','PL']

// Full list for search (curated + common additional countries)
const ALL_COUNTRIES: { label: string; code: string }[] = [
  { label: 'United Kingdom',   code: 'GB' },
  { label: 'Ireland',          code: 'IE' },
  { label: 'Australia',        code: 'AU' },
  { label: 'New Zealand',      code: 'NZ' },
  { label: 'Brazil',           code: 'BR' },
  { label: 'United States',    code: 'US' },
  { label: 'Argentina',        code: 'AR' },
  { label: 'Uruguay',          code: 'UY' },
  { label: 'South Africa',     code: 'ZA' },
  { label: 'Netherlands',      code: 'NL' },
  { label: 'Germany',          code: 'DE' },
  { label: 'France',           code: 'FR' },
  { label: 'Spain',            code: 'ES' },
  { label: 'Poland',           code: 'PL' },
  { label: 'Austria',          code: 'AT' },
  { label: 'Belgium',          code: 'BE' },
  { label: 'Canada',           code: 'CA' },
  { label: 'Chile',            code: 'CL' },
  { label: 'China',            code: 'CN' },
  { label: 'Czech Republic',   code: 'CZ' },
  { label: 'Denmark',          code: 'DK' },
  { label: 'Finland',          code: 'FI' },
  { label: 'Greece',           code: 'GR' },
  { label: 'Hungary',          code: 'HU' },
  { label: 'India',            code: 'IN' },
  { label: 'Italy',            code: 'IT' },
  { label: 'Japan',            code: 'JP' },
  { label: 'Lithuania',        code: 'LT' },
  { label: 'Mexico',           code: 'MX' },
  { label: 'Norway',           code: 'NO' },
  { label: 'Pakistan',         code: 'PK' },
  { label: 'Paraguay',         code: 'PY' },
  { label: 'Portugal',         code: 'PT' },
  { label: 'Romania',          code: 'RO' },
  { label: 'Slovakia',         code: 'SK' },
  { label: 'Sweden',           code: 'SE' },
  { label: 'Switzerland',      code: 'CH' },
  { label: 'Thailand',         code: 'TH' },
  { label: 'Turkey',           code: 'TR' },
  { label: 'Ukraine',          code: 'UA' },
  { label: 'Viet Nam',         code: 'VN' },
]

const CURATED_COUNTRIES = ALL_COUNTRIES.filter((c) => CURATED_CODES.includes(c.code))

function countryLabel(code: string | null): string {
  if (!code) return '—'
  return ALL_COUNTRIES.find((c) => c.code === code)?.label ?? code
}

// ─── Batch number preview (client-side, no delivery number) ──────────────────
// Format: DDMM-CC   (server appends -N)
function buildBatchPrefix(date: string, countryCode: string): string {
  if (!date || !countryCode) return ''
  const d  = new Date(date + 'T00:00:00')
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}-${countryCode}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Client-side verdict via the SHARED domain rule against the FETCHED
 * thresholds (client and server can never disagree). The client keeps its own
 * "no temp typed yet → null (no verdict)" pre-check; a missing threshold row →
 * null too (fail-closed — never grade against a baked-in table; none exists).
 */
function calcStatus(
  temp: number | null,
  category: string,
  thresholds: readonly GoodsInThreshold[],
): TempStatus {
  const row = thresholds.find((t) => t.category === category)
  if (!row) return null
  if (temp === null || isNaN(temp as number)) {
    return row.pass_max_c === null ? 'pass' : null
  }
  return goodsInStatus(temp, row)
}

function nowDisplay() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
}

function deliveryTime(t: string) { return t?.slice(0, 5) ?? '—' }

// ─── Status → semantic tokens (green/amber CAGED: verdict tiles + badges only) ─

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', urgent: 'Conditional accept', fail: 'Reject',
}
const STATUS_TEXT: Record<string, string> = {
  pass:   'text-status-success-text',
  urgent: 'text-status-warning-text',
  fail:   'text-status-error-text',
}
const STATUS_BADGE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  pass: 'success', urgent: 'warning', fail: 'danger',
}
const STATUS_TILE: Record<string, string> = {
  pass:   'bg-status-success-soft border-status-success-border',
  urgent: 'bg-status-warning-soft border-status-warning-border',
  fail:   'bg-status-error-soft border-status-error-border',
  empty:  'bg-surface-raised border-default',
}
const STATUS_TONE: Record<'pass' | 'urgent' | 'fail', NumberPadTone> = {
  pass: 'success', urgent: 'warning', fail: 'danger',
}

// ─── CA constants (adaptive/smart redesign — unchanged) ───────────────────────

// Track-specific cause lists
const TEMP_CAUSES = [
  'Cold chain break in transport',
  'Inadequate pre-chilling at supplier',
  'Vehicle refrigeration failure',
  'Delivery delayed — product held too long',
  'Probe / thermometer fault — reading may be inaccurate',
  'Other',
]

const CONTAM_CAUSES = [
  'Contamination during handling',
  'Packaging damaged in transit',
  'Supplier loading error',
  'Missing documentation',
  'Other',
]

// Cause-aware recurrence options — 3-4 items per cause, not a generic list of 7
const RECURRENCE_BY_CAUSE: Record<string, string[]> = {
  'Cold chain break in transport':            ['Contact supplier — cold chain audit', 'Request supplier corrective action plan', 'Add supplier to watch list', 'Other'],
  'Inadequate pre-chilling at supplier':      ['Contact supplier — cold chain audit', 'Request supplier corrective action plan', 'Arrange supplier site visit', 'Other'],
  'Vehicle refrigeration failure':            ['Report equipment failure to supplier in writing', 'Do not use vehicle until fault rectified', 'Request replacement vehicle arrangement', 'Other'],
  'Delivery delayed — product held too long': ['Review delivery window / timing with supplier', 'Contact supplier — scheduling discussion', 'Other'],
  'Contamination during handling':            ['Retrain receiving staff', 'Review intake procedures', 'Contact supplier', 'Other'],
  'Packaging damaged in transit':             ['Request supplier corrective action plan', 'Review packaging requirements with supplier', 'Other'],
  'Supplier loading error':                   ['Request supplier corrective action plan', 'Contact supplier — loading procedure review', 'Other'],
  'Missing documentation':                    ['Contact supplier — documentation requirements', 'Add to documentation watch list', 'Other'],
  'Probe / thermometer fault — reading may be inaccurate': ['Calibrate probe immediately', 'Verify product core temp with second probe', 'Replace probe if fault confirmed', 'Other'],
  'Other':                                    ['Contact supplier', 'Retrain receiving staff', 'Review intake procedures', 'Other'],
}

// Predetermined action protocols (CA-001) — shown read-only, stored server-side
const PROTOCOL_STEPS: Record<string, string[]> = {
  temp_urgent: [
    'Accept conditionally — do NOT reject the delivery',
    'Place immediately into coldest chiller area',
    'Use within reduced shelf life — halve remaining use-by',
    'Document assessment and accelerated use decision',
    'Review supplier performance',
  ],
  temp_fail: [
    'REJECT delivery immediately — do NOT accept product',
    'Photograph product and temperature reading',
    'Complete Non-Conformance Report',
    'Notify supplier in writing within 24 hours',
    'Segregate and arrange return or disposal',
  ],
  temp_equipment: [
    'Verify product core temperature with calibrated probe',
    'If within conditional limits: accept with reduced shelf life',
    'If exceeds legal limit: REJECT immediately',
    'Document refrigeration failure and photograph vehicle thermometer',
    'Report equipment failure to supplier in writing',
    'Do not use this vehicle until fault is rectified',
  ],
  contam_uncovered: [
    'If minor exposure only: re-cover immediately, use for immediate processing only',
    'If visible contamination or cross-contamination risk: REJECT',
    'Document incident and notify supplier',
  ],
  contam_contaminated_faecal: [
    'Trim contaminated area using clean knife',
    'Dispose of trimmings as Category 2/3 ABP',
    'Sterilise knife immediately after trimming (≥82°C)',
    'Document trimming action and disposal',
    'If contamination excessive: REJECT entire carcase',
  ],
  contam_packaging_damaged: [
    'If seal broken on vacuum pack or visible ingress: REJECT and dispose',
    'Minor outer damage with intact inner seal: re-pack and use immediately',
    'Document and notify supplier',
  ],
  contam_missing_docs: [
    'Hold product in segregated area',
    'Request traceability documents from supplier within 2 hours',
    'If not received within 2 hours: REJECT delivery',
  ],
}

function getTempProtocolKey(tempStatus: TempStatus, cause: string): string {
  if (cause === 'Vehicle refrigeration failure') return 'temp_equipment'
  return tempStatus === 'urgent' ? 'temp_urgent' : 'temp_fail'
}

// Disposition: limited options per scenario (not full 5-picker)
function getDispositionOptions(track: 'temp' | 'contam', tempStatus: TempStatus, contaminated: string): string[] {
  if (track === 'temp') {
    if (tempStatus === 'fail') return ['Reject']
    return ['Conditional accept', 'Reject']
  }
  return contaminated === 'yes_actioned'
    ? ['Accept', 'Assess', 'Reject']
    : ['Assess', 'Reject']
}

const CONTAM_TYPE_LABELS: Record<string, string> = {
  uncovered:           'Product uncovered / exposed',
  contaminated_faecal: 'Faecal, wool, or hide contamination',
  packaging_damaged:   'Packaging damaged',
  missing_docs:        'Missing documentation',
}

// ─── Local glyphs (non-exported helpers — not kit assets) ─────────────────────

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
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

function WarnGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  )
}

function ChevronRightGlyph() {
  return (
    <svg className="w-3.5 h-3.5 text-subtle mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-2">{children}</p>
  )
}

// ─── CCAPopup ─────────────────────────────────────────────────────────────────

function CCAPopup({ tempStatus, contaminated, contamType, catRow, onSubmit, onBack }: {
  tempStatus:   TempStatus
  contaminated: string
  contamType:   string
  catRow:       GoodsInThreshold | undefined
  onSubmit:     (caTemp: CAPayload | null, caContam: CAPayload | null) => void
  onBack:       () => void
}) {
  const activeTempTrack   = tempStatus === 'urgent' || tempStatus === 'fail'
  const activeContamTrack = contaminated === 'yes' || contaminated === 'yes_actioned'

  const [tempCause,      setTempCause]      = useState('')
  const [tempDisp,       setTempDisp]       = useState(
    tempStatus === 'fail' ? 'Reject' : 'Conditional accept',
  )
  const [tempRecurrence, setTempRecurrence] = useState('')

  const [contamCause,      setContamCause]      = useState('')
  const [contamDisp,       setContamDisp]       = useState(
    contaminated === 'yes_actioned' ? 'Accept' : 'Assess',
  )
  const [contamRecurrence, setContamRecurrence] = useState('')

  const [notes, setNotes] = useState('')

  const tempProtocolKey     = getTempProtocolKey(tempStatus, tempCause)
  const tempProtocolSteps   = PROTOCOL_STEPS[tempProtocolKey] ?? PROTOCOL_STEPS['temp_urgent']
  const contamProtocolKey   = contamType ? `contam_${contamType}` : ''
  const contamProtocolSteps = contamProtocolKey ? (PROTOCOL_STEPS[contamProtocolKey] ?? []) : []

  const tempDispOptions   = getDispositionOptions('temp',   tempStatus,  contaminated)
  const contamDispOptions = getDispositionOptions('contam', tempStatus,  contaminated)

  const isSubmittable =
    (!activeTempTrack   || (tempCause   !== '' && tempDisp   !== '' && tempRecurrence   !== '')) &&
    (!activeContamTrack || (contamCause !== '' && contamDisp !== '' && contamRecurrence !== ''))

  function handleSubmit() {
    if (!isSubmittable) return
    const caTemp: CAPayload | null = activeTempTrack ? {
      cause: tempCause, disposition: tempDisp, recurrence: tempRecurrence, notes,
    } : null
    const caContam: CAPayload | null = activeContamTrack ? {
      cause: contamCause, disposition: contamDisp, recurrence: contamRecurrence, notes,
    } : null
    onSubmit(caTemp, caContam)
  }

  // Band copy DERIVED from the fetched row (admin edits self-update this line).
  const rejectLine = catRow?.amber_max_c ?? catRow?.pass_max_c ?? null
  const tempTrackSub = tempStatus === 'fail'
    ? `Reject required${rejectLine !== null ? ` (>${Number(rejectLine)}°C)` : ''}`
    : `Conditional accept${catRow && catRow.pass_max_c !== null && catRow.amber_max_c !== null
        ? ` (${Number(catRow.pass_max_c)}–${Number(catRow.amber_max_c)}°C)` : ''}`

  const tempTrackShell = tempStatus === 'fail'
    ? { head: 'bg-status-error-soft', headText: 'text-status-error-text', border: 'border-status-error-border', num: 'bg-status-error-soft text-status-error-text' }
    : { head: 'bg-status-warning-soft', headText: 'text-status-warning-text', border: 'border-status-warning-border', num: 'bg-status-warning-soft text-status-warning-text' }

  return (
    <Modal
      variant="sheet"
      open
      onOpenChange={(o) => { if (!o) onBack() }}
      title="Record what happened"
      description={
        activeTempTrack && activeContamTrack
          ? 'CCP 1 — Corrective Action · two deviations — complete both sections below'
          : 'CCP 1 — Corrective Action · complete all fields to submit'
      }
    >
      <div className="space-y-5 pt-1">

        {activeTempTrack && (
          <div className={`border rounded-2xl overflow-hidden ${tempTrackShell.border}`}>
            <div className={`px-4 py-3 ${tempTrackShell.head}`}>
              <p className={`text-xs font-bold uppercase tracking-widest ${tempTrackShell.headText}`}>
                Temperature deviation
              </p>
              <p className="text-muted text-xs mt-0.5">
                {tempTrackSub}
                {tempCause === 'Vehicle refrigeration failure' && ' — equipment failure override'}
              </p>
            </div>
            <div className="px-4 py-4 space-y-5 bg-surface-raised">
              <div>
                <FieldLabel>Required action (CA-001)</FieldLabel>
                <div className="bg-surface-sunken border border-default rounded-xl px-4 py-3 space-y-2">
                  {tempProtocolSteps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${tempTrackShell.num}`}>{i + 1}</div>
                      <p className="text-body text-xs leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>What caused this?</FieldLabel>
                <div className="space-y-1.5">
                  {TEMP_CAUSES.map((c) => (
                    <Button key={c} variant={tempCause === c ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                      onClick={() => { setTempCause(c); setTempRecurrence('') }}>
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>
                  Product disposition{tempStatus === 'fail' && <span className="ml-1 text-status-error-text normal-case font-normal">— locked</span>}
                </FieldLabel>
                <div className="flex gap-2 flex-wrap">
                  {tempDispOptions.map((d) => (
                    <Button key={d}
                      variant={tempDisp === d ? (tempStatus === 'fail' ? 'danger' : 'primary') : 'ghost'}
                      size="sm"
                      disabled={tempStatus === 'fail'}
                      onClick={() => { if (tempStatus !== 'fail') setTempDisp(d) }}>
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
              {tempCause && (
                <div>
                  <FieldLabel>Recurrence prevention</FieldLabel>
                  <div className="space-y-1.5">
                    {(RECURRENCE_BY_CAUSE[tempCause] ?? RECURRENCE_BY_CAUSE['Other']).map((r) => (
                      <Button key={r} variant={tempRecurrence === r ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                        onClick={() => setTempRecurrence(r)}>
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeContamTrack && (
          <div className="border border-status-deviation-border rounded-2xl overflow-hidden">
            <div className="bg-status-deviation-soft px-4 py-3">
              <p className="text-status-deviation-text text-xs font-bold uppercase tracking-widest">Contamination deviation</p>
              <p className="text-muted text-xs mt-0.5">
                {CONTAM_TYPE_LABELS[contamType] ?? contamType}
                {' · '}
                {contaminated === 'yes_actioned' ? 'Actioned at intake' : 'Not yet actioned'}
              </p>
            </div>
            <div className="px-4 py-4 space-y-5 bg-surface-raised">
              {contamProtocolSteps.length > 0 && (
                <div>
                  <FieldLabel>Required action (CA-001)</FieldLabel>
                  <div className="bg-surface-sunken border border-default rounded-xl px-4 py-3 space-y-2">
                    {contamProtocolSteps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 bg-status-deviation-soft text-status-deviation-text">{i + 1}</div>
                        <p className="text-body text-xs leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <FieldLabel>What caused this?</FieldLabel>
                <div className="space-y-1.5">
                  {CONTAM_CAUSES.map((c) => (
                    <Button key={c} variant={contamCause === c ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                      onClick={() => { setContamCause(c); setContamRecurrence('') }}>
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>Product disposition</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {contamDispOptions.map((d) => (
                    <Button key={d} variant={contamDisp === d ? 'primary' : 'ghost'} size="sm" onClick={() => setContamDisp(d)}>
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
              {contamCause && (
                <div>
                  <FieldLabel>Recurrence prevention</FieldLabel>
                  <div className="space-y-1.5">
                    {(RECURRENCE_BY_CAUSE[contamCause] ?? RECURRENCE_BY_CAUSE['Other']).map((r) => (
                      <Button key={r} variant={contamRecurrence === r ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                        onClick={() => setContamRecurrence(r)}>
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <FieldLabel>Additional notes <span className="normal-case font-normal">(optional)</span></FieldLabel>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Any additional context…" />
        </div>

        <p className="text-muted text-xs">This record is immutable once submitted. Protocol per CA-001.</p>

        <Button variant={tempStatus === 'fail' ? 'danger' : 'primary'} fullWidth disabled={!isSubmittable} onClick={handleSubmit}>
          Confirm &amp; submit delivery
        </Button>
      </div>
    </Modal>
  )
}

// ─── Delivery Detail Sheet ────────────────────────────────────────────────────

function DeliveryDetail({ d, thresholds, onClose }: {
  d: Delivery
  thresholds: readonly GoodsInThreshold[]
  onClose: () => void
}) {
  const bornLabel   = countryLabel(d.born_in)
  const rearedLabel = countryLabel(d.reared_in)
  const catRow      = thresholds.find((t) => t.category === d.product_category)
  const catLabel    = CATEGORY_LABELS[d.product_category]
  const bands       = catRow ? describeGoodsInBands(catRow) : null
  // Print errors surface here (inside the modal, where the print buttons live)
  // using the same submitErr styling as the rest of the app — the page-level
  // submitErr line is occluded by this overlay.
  const [submitErr, setSubmitErr] = useState('')
  const onPrintError: PrintErrorHandler = (kind) => setSubmitErr(printErrorMessage(kind))

  return (
    <Modal
      variant="sheet"
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      title={
        <span className="inline-flex items-center gap-2">
          {d.delivery_number && (
            <span data-surface="bold-navy" className="text-xs font-bold bg-surface-inverse text-body px-2 py-0.5 rounded font-mono flex-shrink-0">#{d.delivery_number}</span>
          )}
          {d.supplier}
        </span>
      }
    >
      <div className="space-y-4 pb-4 pt-1">

        {/* Batch number + Print label */}
        {d.batch_number && (
          <div data-surface="bold-navy" className="bg-surface-inverse rounded-xl px-4 py-3">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Batch reference</p>
            <p className="text-body text-xl font-bold font-mono tracking-widest">{d.batch_number}</p>
            <PrintLabelStrip
              on100mm={() => getPrinter().printDeliveryLabel(buildDeliveryInput(d, '100mm'), onPrintError)}
              on58mm={() => handlePrint58(d, onPrintError)}
            />
            {submitErr && <p className="text-status-error-text text-xs mt-2">{submitErr}</p>}
          </div>
        )}

        {/* Temperature — verdict tile (caged green/amber legal here) */}
        <div className={`rounded-xl px-4 py-3 border ${STATUS_TILE[d.temp_status] ?? STATUS_TILE.empty}`}>
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Temperature — CCP 1</p>
          <div className="flex items-center justify-between">
            <p className={`text-2xl font-bold font-mono ${STATUS_TEXT[d.temp_status] ?? 'text-body'}`}>
              {d.temperature_c != null ? `${d.temperature_c}°C` : 'Ambient'}
            </p>
            <Badge tone={STATUS_BADGE_TONE[d.temp_status] ?? 'neutral'}>
              {STATUS_LABEL[d.temp_status] ?? d.temp_status}
            </Badge>
          </div>
          {catLabel && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${categoryChipClass(d.product_category)}`}>
                {catLabel}
              </span>
              {bands && <p className="text-subtle text-[10px]">Temp limit: {bands.limit}</p>}
            </div>
          )}
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-2 gap-3">

          <div className="bg-surface-sunken border border-subtle rounded-xl px-3 py-2.5">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Slaughter site</p>
            <p className="text-body font-mono font-bold text-sm">{d.slaughter_site ?? '—'}</p>
          </div>

          <div className="bg-surface-sunken border border-subtle rounded-xl px-3 py-2.5">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Cut site</p>
            <p className="text-body font-mono font-bold text-sm">
              {d.cut_site
                ? d.cut_site === d.slaughter_site ? <span className="font-sans font-normal text-muted text-xs">Same</span> : d.cut_site
                : '—'}
            </p>
          </div>

          <div className="bg-surface-sunken border border-subtle rounded-xl px-3 py-2.5">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Born in</p>
            <p className="text-body font-semibold text-sm">{bornLabel}</p>
          </div>

          <div className="bg-surface-sunken border border-subtle rounded-xl px-3 py-2.5">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Reared in</p>
            <p className="text-body font-semibold text-sm">
              {d.reared_in
                ? d.reared_in === d.born_in
                  ? <span className="text-muted font-normal text-xs">Same</span>
                  : rearedLabel
                : '—'}
            </p>
          </div>

          <div className="bg-surface-sunken border border-subtle rounded-xl px-3 py-2.5">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Time</p>
            <p className="text-body font-semibold text-sm">{deliveryTime(d.time_of_delivery)}</p>
          </div>

          <div className="bg-surface-sunken border border-subtle rounded-xl px-3 py-2.5">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Logged by</p>
            <p className="text-body font-semibold text-sm truncate">{d.users?.name ?? '—'}</p>
          </div>

        </div>

        {/* Product */}
        <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-3">
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Product</p>
          <p className="text-body text-sm font-medium">{d.product}</p>
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1 ${categoryChipClass(d.product_category)}`}>
            {catLabel ?? d.product_category}
          </span>
        </div>

        {/* Contamination — "something is wrong" = red family */}
        {d.covered_contaminated !== 'no' && (
          <div className="bg-status-deviation-soft border border-status-deviation-border rounded-xl px-4 py-3">
            <p className="text-status-deviation-text text-[10px] font-bold uppercase tracking-widest mb-1">
              Contamination — {d.covered_contaminated === 'yes_actioned' ? 'actioned' : 'rejected'}
            </p>
            {d.contamination_notes && (
              <p className="text-body text-xs leading-relaxed">{d.contamination_notes}</p>
            )}
          </div>
        )}

        {/* Allergen check result — pass/fail badge (caged green legal) */}
        <div className={`rounded-xl px-4 py-2.5 flex items-start gap-2 border ${
          d.allergens_identified
            ? 'bg-status-error-soft border-status-error-border'
            : 'bg-status-success-soft border-status-success-border'
        }`}>
          <div>
            <span className={`text-[10px] font-bold block ${d.allergens_identified ? 'text-status-error-text' : 'text-status-success-text'}`}>
              {d.allergens_identified ? '⚠️ ALLERGENS IDENTIFIED — SALSA 1.4.2' : '✓ No allergens — SALSA 1.4.2'}
            </span>
            {d.allergens_identified && d.allergen_notes && (
              <span className="text-status-error-text text-xs font-bold block mt-0.5">{d.allergen_notes}</span>
            )}
          </div>
        </div>

        {/* Corrective action required */}
        {d.corrective_action_required && (
          <div className="bg-status-error-soft border border-status-error-border rounded-xl px-4 py-3">
            <p className="text-status-error-text text-[10px] font-bold uppercase tracking-widest mb-1">Corrective action required</p>
            <p className="text-muted text-xs leading-relaxed">
              {d.allergens_identified
                ? `Allergen non-conformance: ${d.allergen_notes || 'See corrective action log'}. Do not process until resolved.`
                : 'A temperature deviation or contamination issue was recorded. Corrective action was documented at time of logging.'
              }
            </p>
          </div>
        )}

        {/* Notes */}
        {d.notes && (
          <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-3">
            <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Notes</p>
            <p className="text-body text-xs leading-relaxed">{d.notes}</p>
          </div>
        )}

      </div>
    </Modal>
  )
}

// ─── Country Picker (shared component for born_in / reared_in) ───────────────

function CountryPicker({ value, onChange, label, required }: {
  value:    string
  onChange: (code: string) => void
  label:    string
  required?: boolean
}) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()

  const searchResults = q.length >= 1
    ? ALL_COUNTRIES.filter(
        (c) => !CURATED_CODES.includes(c.code) &&
               (c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      ).slice(0, 8)
    : []

  return (
    <div>
      <FieldLabel>
        {label}{required && <span className="text-status-error-text ml-0.5">*</span>}
      </FieldLabel>
      {/* Curated chips */}
      <div className="flex flex-wrap gap-2 mb-2">
        {CURATED_COUNTRIES.map((c) => (
          <Button key={c.code} variant={value === c.code ? 'primary' : 'ghost'} size="sm"
            onPointerDown={(e) => { e.preventDefault(); onChange(c.code); setSearch('') }}>
            {c.code}
            <span className="ml-1 font-normal text-[10px] opacity-70">{c.label.split(' ')[0]}</span>
          </Button>
        ))}
      </div>
      {/* Search for others */}
      <TextField
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search other countries…"
      />
      {searchResults.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {searchResults.map((c) => (
            <Button key={c.code} variant={value === c.code ? 'primary' : 'ghost'} size="sm"
              onPointerDown={(e) => { e.preventDefault(); onChange(c.code); setSearch('') }}>
              {c.code}
              <span className="ml-1 font-normal text-[10px] opacity-70">{c.label}</span>
            </Button>
          ))}
        </div>
      )}
      {q.length >= 1 && searchResults.length === 0 && (
        <p className="text-muted text-xs mt-2">No results for &quot;{search}&quot;</p>
      )}
      {/* Show selected value if it came from search (not in curated chips) */}
      {value && !CURATED_CODES.includes(value) && (
        <p className="text-link text-xs mt-1.5 font-medium">Selected: {value} — {countryLabel(value)}</p>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [thresholds, setThresholds] = useState<GoodsInThreshold[]>([])
  const [loading,    setLoading]    = useState(true)
  const [nextNumber, setNextNumber] = useState(1)
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'last_week'>('today')

  // Form state
  const [supplierSel,   setSupplierSel]   = useState('')
  const [supplierOther, setSupplierOther] = useState('')
  const [product,       setProduct]       = useState('')
  const [category,      setCategory]      = useState('')
  const [tempVal,       setTempVal]       = useState('')
  const [contam,        setContam]        = useState('')
  const [contamType,    setContamType]    = useState('')
  const [contamNote,    setContamNote]    = useState('')
  const [bornIn,        setBornIn]        = useState('')
  const [rearedIn,      setRearedIn]      = useState('')
  const [rearedSame,    setRearedSame]    = useState(false)
  const [slaughter,     setSlaughter]     = useState('')
  const [cutSite,       setCutSite]       = useState('')
  const [cutSameAs,     setCutSameAs]     = useState(false)
  const [notes,         setNotes]         = useState('')
  // SALSA 1.4.2 — allergen check at intake
  const [allergensIdentified, setAllergensIdentified] = useState(false)
  const [allergenTypes,       setAllergenTypes]       = useState<string[]>([])
  const [allergenNotes,       setAllergenNotes]       = useState('')

  // UI state
  const [showNumpad,       setShowNumpad]       = useState(false)
  const [showCCA,          setShowCCA]          = useState(false)
  const [showQuick,        setShowQuick]        = useState(false)
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitErr,   setSubmitErr]   = useState('')
  const onPrintError: PrintErrorHandler = (kind) => setSubmitErr(printErrorMessage(kind))
  const [flash,       setFlash]       = useState(false)
  const [timeNow,     setTimeNow]     = useState(nowDisplay())

  useEffect(() => {
    const t = setInterval(() => setTimeNow(nowDisplay()), 30000)
    return () => clearInterval(t)
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    fetch(`/api/haccp/delivery?range=${dateFilter}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => {
        setSuppliers(d.suppliers ?? [])
        setDeliveries(d.deliveries ?? [])
        setNextNumber(d.next_number ?? 1)
        setThresholds(d.thresholds ?? [])
      })
      .catch((e) => setSubmitErr(`Could not load data — ${e.message}`))
      .finally(() => setLoading(false))
  }, [dateFilter])

  useEffect(() => { loadData() }, [loadData])

  // FAIL-CLOSED: no threshold rows = no ruler — refuse temperature grading.
  const thresholdsMissing = !loading && thresholds.length === 0

  const tempNum  = parseFloat(tempVal)
  const tempStat = category ? calcStatus(noTempCategory(category) ? null : tempNum, category, thresholds) : null

  const supplierIdSel     = supplierSel && supplierSel !== 'other' ? supplierSel : ''
  const supplierOtherTrim = supplierOther.trim()
  const supplierChosen    = Boolean(supplierIdSel || (supplierSel === 'other' && supplierOtherTrim))

  const ALLERGEN_CA_CATEGORIES = new Set(['lamb','beef','red_meat','offal','frozen_beef_lamb','poultry'])

  const needsCCA = (tempStat === 'urgent' || tempStat === 'fail') ||
                   (contam === 'yes' || contam === 'yes_actioned') ||
                   (allergensIdentified && ALLERGEN_CA_CATEGORIES.has(category))

  const isMeat      = isMeatCategory(category)
  const isAmbient   = noTempCategory(category)

  // C8: traceability only required for meat categories
  // C9: allergens: at least one type required when identified
  // Temp: not required for dry_goods
  const allergenValid = !allergensIdentified || allergenTypes.length > 0
  const isValid =
    supplierChosen &&
    product.trim() &&
    category &&
    (isAmbient || (tempVal !== '' && !isNaN(tempNum))) &&
    contam &&
    (contam === 'no' || Boolean(contamType)) &&
    (!isMeat || (Boolean(bornIn) && Boolean(rearedIn) && slaughter.trim() !== '' && Boolean(cutSite))) &&
    allergenValid

  function resetForm() {
    setSupplierSel(''); setSupplierOther(''); setProduct('')
    setCategory(''); setTempVal(''); setContam('')
    setContamType(''); setContamNote(''); setNotes(''); setSubmitErr('')
    setAllergensIdentified(false); setAllergenTypes([]); setAllergenNotes('')
    setBornIn(''); setRearedIn(''); setRearedSame(false)
    setSlaughter(''); setCutSite(''); setCutSameAs(false)
  }

  async function doSubmit(caTemp?: CAPayload | null, caContam?: CAPayload | null) {
    setShowCCA(false); setSubmitting(true); setSubmitErr('')
    try {
      const res = await fetch('/api/haccp/delivery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:   supplierIdSel || undefined,
          supplier_name: supplierSel === 'other' ? supplierOtherTrim : undefined,
          product:       product.trim(),
          product_category:     category,
          temperature_c:        isAmbient ? null : tempNum,
          covered_contaminated: contam,
          contamination_type:   (contam !== 'no' && contamType) ? contamType : undefined,
          contamination_notes:  contamNote || undefined,
          notes:                notes || undefined,
          born_in:              isMeat ? (bornIn   || undefined) : undefined,
          reared_in:            isMeat ? (rearedIn || undefined) : undefined,
          slaughter_site:       isMeat ? (slaughter || undefined) : undefined,
          cut_site:             isMeat ? (cutSite   || undefined) : undefined,
          allergens_identified: allergensIdentified,
          allergen_notes:       allergensIdentified
            ? [allergenTypes.join(', '), allergenNotes.trim()].filter(Boolean).join(' — ')
            : undefined,
          corrective_action_temp:   caTemp   ?? undefined,
          corrective_action_contam: caContam ?? undefined,
        }),
      })
      const d = await res.json()
      if (res.ok) {
        if (d.ca_write_failed) {
          setSubmitErr('Delivery saved — but corrective action record failed to write. Notify admin to log manually.')
        } else {
          setFlash(true)
          setTimeout(() => setFlash(false), 2500)
        }
        resetForm(); loadData()
      } else {
        setSubmitErr(d.error ?? 'Submission failed')
      }
    } catch { setSubmitErr('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  function handleSubmit() {
    if (!isValid) return
    if (needsCCA) { setShowCCA(true); return }
    doSubmit()
  }

  const catDef  = CATEGORIES.find((c) => c.key === category)
  const catRow  = category ? thresholds.find((t) => t.category === category) : undefined
  const catBands = catRow ? describeGoodsInBands(catRow) : null

  // Batch number preview (shown once bornIn is set)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const batchPreview = bornIn ? `${buildBatchPrefix(todayStr, bornIn)}-${nextNumber}` : ''

  // Quick-ref key-rule copy — derived from the live rows (no baked-in bands).
  const lambRow   = thresholds.find((t) => t.category === 'lamb')
  const frozenRow = thresholds.find((t) => t.category === 'frozen')

  // Numpad verdict hint (live pass/amber/reject verdict + CA-001 guidance).
  const numpadHint = tempStat ? (
    <span className="block space-y-2">
      <span className="block">
        <Badge tone={STATUS_BADGE_TONE[tempStat]}>{STATUS_LABEL[tempStat]}</Badge>
      </span>
      {tempStat === 'urgent' && (
        <span className="block text-status-warning-text text-left">
          Conditional accept — do NOT reject (CA-001).{' '}
          {FROZEN_CATEGORIES.has(category)
            ? 'Acceptable short-term if product is re-frozen immediately. Document decision.'
            : 'Place immediately into coldest chiller area. Halve remaining shelf life. Document assessment. Review supplier performance.'}
        </span>
      )}
      {tempStat === 'fail' && (
        <span className="block text-status-error-text text-left">
          Reject delivery. Do NOT accept. Photograph product and temp reading. Complete non-conformance report. Notify supplier within 24 hours.
        </span>
      )}
    </span>
  ) : undefined

  return (
    <div className="min-h-screen bg-surface-base flex flex-col select-none">

      {/* Header */}
      <ScreenHeader
        eyebrow="CCP 1 — Delivery Intake"
        title="Goods In"
        onBack={() => { window.location.href = '/haccp' }}
        backLabel="Back to HACCP"
        actions={
          <>
            <Button variant="ghost-inverse" size="sm" leadingIcon={<HelpGlyph />} onClick={() => setShowQuick(true)}>
              Quick ref
            </Button>
            <Button variant="ghost-inverse" size="sm" leadingIcon={<HandbookGlyph />} onClick={() => { window.location.href = '/haccp/documents/hb-001?from=/haccp/delivery' }}>
              Handbook
            </Button>
          </>
        }
      />

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {/* SOP 5B banner */}
        <Banner tone="info" icon={<WarnGlyph className="w-4 h-4" />} title="SOP 5B — Receiving rule">
          Boxed / packaged meat only — NO exposed meat. Driver stays in receiving area and does NOT enter production.
        </Banner>

        {/* FAIL-CLOSED: thresholds unavailable */}
        {thresholdsMissing && (
          <Banner tone="danger" title="Temperature limits unavailable">
            The CCP 1 temperature thresholds could not be loaded — temperature entry is
            disabled. Do not grade deliveries by memory; retry or contact the admin.
          </Banner>
        )}

        {/* Flash */}
        {flash && (
          <Banner tone="info" icon={<CheckGlyph className="w-5 h-5" />}>
            <span className="font-bold">Delivery logged — ready for next entry</span>
          </Banner>
        )}

        {/* Form */}
        <div className="bg-surface-raised border border-default rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-default">
            <p className="text-body font-semibold text-sm">Log a delivery</p>
            <p className="text-muted text-xs mt-0.5">CCP 1 · one record per delivery</p>
          </div>

          <div className="px-4 py-3 space-y-4">

            {/* Product category — FIRST: drives supplier list, BLS fields, temp limits */}
            <div>
              <FieldLabel>Product category</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.key} type="button"
                    onPointerDown={(e) => { e.preventDefault(); setCategory(c.key); setTempVal(''); setSupplierSel(''); setSupplierOther(''); setBornIn(''); setRearedIn(''); setRearedSame(false); setSlaughter(''); setCutSite(''); setCutSameAs(false) }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                      category === c.key
                        ? `${categoryChipClass(c.key)} border-transparent`
                        : 'border-input bg-surface-raised text-muted'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {catDef && catBands && <p className="text-subtle text-[10px] mt-1.5 ml-1">{catBands.detail}</p>}
            </div>

            {/* Supplier */}
            <div>
              <FieldLabel>Supplier</FieldLabel>
              {!category ? (
                <p className="text-muted text-xs italic">Select a product category first</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {filterSuppliers(suppliers, category).map((s) => (
                      <Button key={s.id} variant={supplierSel === s.id ? 'primary' : 'ghost'} size="sm"
                        onPointerDown={(e) => { e.preventDefault(); setSupplierSel(s.id); setSupplierOther('') }}>
                        {s.name}
                      </Button>
                    ))}
                    <Button variant={supplierSel === 'other' ? 'primary' : 'ghost'} size="sm"
                      onPointerDown={(e) => { e.preventDefault(); setSupplierSel('other') }}>
                      Other
                    </Button>
                  </div>
                  {supplierSel === 'other' && (
                    <TextField type="text" value={supplierOther} onChange={(e) => setSupplierOther(e.target.value)}
                      placeholder="Enter supplier name…" />
                  )}
                </>
              )}
            </div>

            {/* Born in / Reared in / Slaughter / Cut site — meat only (C8) */}
            {isMeat && (<>
            {/* Born in (C8: required) */}
            <CountryPicker
              value={bornIn}
              onChange={(code) => {
                setBornIn(code)
                if (rearedSame) setRearedIn(code)
              }}
              label="Born in"
              required
            />

            {/* Reared in (C8: required) */}
            {bornIn && (
              <div>
                <FieldLabel>
                  Reared in<span className="text-status-error-text ml-0.5">*</span>
                </FieldLabel>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button variant={rearedSame ? 'primary' : 'ghost'} size="sm"
                    onPointerDown={(e) => { e.preventDefault(); setRearedSame(true); setRearedIn(bornIn) }}>
                    ✓ Same as born in ({countryLabel(bornIn)})
                  </Button>
                  <Button variant={!rearedSame && rearedIn !== '' ? 'primary' : 'ghost'} size="sm"
                    onPointerDown={(e) => { e.preventDefault(); setRearedSame(false); setRearedIn('') }}>
                    Different country
                  </Button>
                </div>
                {!rearedSame && (
                  <CountryPicker
                    value={rearedIn}
                    onChange={setRearedIn}
                    label="Reared in country"
                    required
                  />
                )}
              </div>
            )}

            {/* Slaughter site (C8: required) */}
            <div>
              <FieldLabel>
                Slaughter site code<span className="text-status-error-text ml-0.5">*</span>
              </FieldLabel>
              <TextField
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                value={slaughter}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                  setSlaughter(v)
                  if (cutSameAs) setCutSite(v)
                }}
                placeholder="e.g. GB1234"
                maxLength={10}
                className="tracking-widest font-mono"
              />
              <p className="text-subtle text-[10px] mt-1 ml-1">Format: GB XXXX (UK approval number) or local code</p>
            </div>

            {/* Cut site (C8: required) */}
            {slaughter.length > 0 && (
              <div>
                <FieldLabel>
                  Cut site code<span className="text-status-error-text ml-0.5">*</span>
                </FieldLabel>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <Button variant={cutSameAs ? 'primary' : 'ghost'} size="sm"
                    onPointerDown={(e) => { e.preventDefault(); setCutSameAs(true); setCutSite(slaughter) }}>
                    ✓ Same as slaughter ({slaughter})
                  </Button>
                  <Button variant={!cutSameAs && cutSite !== '' ? 'primary' : 'ghost'} size="sm"
                    onPointerDown={(e) => { e.preventDefault(); setCutSameAs(false); setCutSite('') }}>
                    Different site
                  </Button>
                </div>
                {!cutSameAs && (
                  <TextField
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    value={cutSite}
                    onChange={(e) => setCutSite(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                    placeholder="e.g. AU1234"
                    maxLength={10}
                    className="tracking-widest font-mono"
                  />
                )}
              </div>
            )}

            {/* Batch number preview */}
            {batchPreview && (
              <div data-surface="bold-navy" className="bg-surface-inverse rounded-xl px-4 py-3">
                <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1.5">Batch reference (auto-generated)</p>
                <p className="text-body text-lg font-bold font-mono tracking-widest">{batchPreview}</p>
                <p className="text-subtle text-[10px] mt-1">DDMM · country code (ISO) · delivery #{nextNumber}</p>
                {bornIn && rearedIn && rearedIn !== bornIn && (
                  <p className="text-[color:var(--surface-accent-fg)] text-[10px] mt-1">
                    Born: {countryLabel(bornIn)} · Reared: {countryLabel(rearedIn)}
                  </p>
                )}
              </div>
            )}
            {/* end BLS meat fields */}
            </>)}

            {/* Product description */}
            <div>
              <FieldLabel>Product description</FieldLabel>
              <TextField type="text" value={product} onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Whole lamb carcasses — 24 units" />
            </div>

            {/* Temperature */}
            {isAmbient ? (
              <div className="bg-surface-sunken border border-default rounded-xl px-4 py-3">
                <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Temperature — Not applicable</p>
                <p className="text-muted text-xs">Dry goods are ambient — no temperature CCP. Condition and packaging check only.</p>
              </div>
            ) : (
              <div>
              <FieldLabel>Temperature — tap to enter</FieldLabel>
              <button type="button"
                onClick={() => category && !thresholdsMissing && setShowNumpad(true)}
                disabled={!category || thresholdsMissing}
                className={`w-full rounded-2xl p-4 border-2 flex items-center justify-between transition-all disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                  !tempVal ? STATUS_TILE.empty : STATUS_TILE[tempStat ?? 'empty'] ?? STATUS_TILE.empty
                }`}>
                <div>
                  <p className="text-muted text-xs mb-1">
                    {thresholdsMissing
                      ? 'Temperature limits unavailable — entry disabled'
                      : category ? `Probe reading · limit ${catBands?.limit ?? '—'}` : 'Select a category first'}
                  </p>
                  <p className={`text-2xl font-bold ${!tempVal ? 'text-subtle' : tempStat ? STATUS_TEXT[tempStat] : 'text-subtle'}`}>
                    {tempVal && !isNaN(tempNum) ? `${tempNum}°C` : 'Tap to enter'}
                  </p>
                </div>
                {tempStat && tempVal && (
                  <Badge tone={STATUS_BADGE_TONE[tempStat]}>{STATUS_LABEL[tempStat]}</Badge>
                )}
              </button>

              {tempStat === 'urgent' && (
                <div className="mt-2 bg-status-warning-soft border border-status-warning-border rounded-xl px-4 py-3">
                  <p className="text-status-warning-text text-xs font-bold uppercase tracking-widest mb-1.5">Conditional accept — do NOT reject (CA-001)</p>
                  {FROZEN_CATEGORIES.has(category) ? (
                    <p className="text-muted text-xs leading-relaxed">Acceptable short-term only if product is re-frozen immediately. Document decision. Monitor closely.</p>
                  ) : (
                    <p className="text-muted text-xs leading-relaxed">Place into coldest chiller area immediately. Use within reduced shelf life — halve remaining use-by. Document assessment. Review supplier performance.</p>
                  )}
                </div>
              )}
              {tempStat === 'fail' && (
                <div className="mt-2 bg-status-error-soft border border-status-error-border rounded-xl px-4 py-3">
                  <p className="text-status-error-text text-xs font-bold uppercase tracking-widest mb-1">Reject delivery</p>
                  <p className="text-muted text-xs leading-relaxed">Do NOT accept. Photograph and complete non-conformance report. Notify supplier within 24 hours.</p>
                </div>
              )}
              </div>
            )}
            {/* end temperature */}

            {/* Covered / contaminated */}
            <div>
              <FieldLabel>Covered / contaminated?</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'no',           label: 'No — all clear' },
                  { val: 'yes',          label: 'Yes — rejected' },
                  { val: 'yes_actioned', label: 'Yes — actioned' },
                ].map((o) => (
                  <Button key={o.val} variant={contam === o.val ? 'primary' : 'ghost'} size="sm" fullWidth
                    onClick={() => { setContam(o.val); setContamType(''); setContamNote('') }}>
                    {o.label}
                  </Button>
                ))}
              </div>
              {(contam === 'yes' || contam === 'yes_actioned') && (
                <div className="mt-3 space-y-3">
                  <FieldLabel>
                    Type of contamination <span className="text-status-error-text">*</span>
                  </FieldLabel>
                  <div className="space-y-2">
                    {[
                      { key: 'uncovered',           label: 'Product uncovered / exposed' },
                      { key: 'contaminated_faecal', label: 'Faecal, wool, or hide contamination' },
                      { key: 'packaging_damaged',   label: 'Packaging damaged' },
                      { key: 'missing_docs',        label: 'Missing documentation' },
                    ].map((t) => (
                      <Button key={t.key} variant={contamType === t.key ? 'primary' : 'ghost'} size="sm" fullWidth className="justify-start"
                        onClick={() => setContamType(t.key)}>
                        {t.label}
                      </Button>
                    ))}
                  </div>
                  {contamType && (
                    <Textarea value={contamNote} onChange={(e) => setContamNote(e.target.value)} rows={2}
                      placeholder="Additional details (optional)…" />
                  )}
                </div>
              )}
            </div>

            {/* Optional notes */}
            <div>
              <FieldLabel>Notes (optional)</FieldLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Any additional notes…" />
            </div>

            {/* SALSA 1.4.2 — Allergen check (required) */}
            <div className={`rounded-xl border px-4 py-3 ${allergensIdentified ? 'border-status-error-border bg-status-error-soft' : 'border-default bg-surface-raised'}`}>
              <FieldLabel>Allergen check — SALSA 1.4.2</FieldLabel>
              <p className="text-muted text-xs mb-3">Did this delivery contain any allergen-containing products?</p>
              <div className="flex gap-2">
                <Button variant={!allergensIdentified ? 'primary' : 'ghost'} fullWidth size="sm"
                  onClick={() => { setAllergensIdentified(false); setAllergenTypes([]); setAllergenNotes('') }}>
                  ✓ No allergens
                </Button>
                <Button variant={allergensIdentified ? 'danger' : 'ghost'} fullWidth size="sm"
                  onClick={() => setAllergensIdentified(true)}>
                  ⚠️ Allergens found
                </Button>
              </div>
              {allergensIdentified && (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-status-error-text text-xs font-bold mb-2">Select allergens identified (select all that apply):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALLERGENS.map(a => (
                        <Button key={a} variant={allergenTypes.includes(a) ? 'danger' : 'ghost'} size="sm"
                          onClick={() => setAllergenTypes(prev =>
                            prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
                          )}>
                          {a}
                        </Button>
                      ))}
                    </div>
                    {allergenTypes.length === 0 && (
                      <p className="text-status-error-text text-[10px] mt-1.5">Select at least one allergen to continue</p>
                    )}
                  </div>
                  <div>
                    <p className="text-status-error-text text-xs font-bold mb-1">Additional notes (optional):</p>
                    <Textarea
                      value={allergenNotes}
                      onChange={(e) => setAllergenNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. Product code, box count, supplier confirmation…"
                    />
                  </div>
                  <p className="text-status-error-text text-[10px] font-bold">
                    ⚠️ A corrective action will be raised automatically. Do not process this delivery until resolved.
                  </p>
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex items-center justify-between">
              <p className="text-subtle text-xs">{new Date().toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric', timeZone:'Europe/London' })}</p>
              <p className="text-subtle text-xs">Auto-time: {timeNow}</p>
            </div>

          </div>

          {submitErr && <p className="px-4 pb-2 text-status-error-text text-xs">{submitErr}</p>}

          <div className="px-4 pb-4">
            <Button
              variant={needsCCA && isValid ? 'danger' : 'primary'}
              fullWidth
              loading={submitting}
              disabled={!isValid || submitting}
              leadingIcon={!submitting ? <CheckGlyph className="w-4 h-4" /> : undefined}
              onClick={handleSubmit}>
              {submitting
                ? 'Submitting…'
                : needsCCA && isValid ? 'Submit — corrective action required' : 'Submit delivery'}
            </Button>
          </div>
        </div>

        {/* Today's log */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <p className="text-muted text-xs font-bold uppercase tracking-widest">
              {dateFilter === 'today' ? "Today's deliveries" : dateFilter === 'week' ? "This week's deliveries" : "Last week's deliveries"}
            </p>
            <div className="flex items-center gap-2">
              {deliveries.length > 0 && (
                <Badge tone="neutral">{deliveries.length} logged</Badge>
              )}
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
          </div>
          {loading ? (
            <div className="flex items-center gap-3 text-muted text-sm py-4">
              <Spinner /> Loading…
            </div>
          ) : deliveries.length === 0 ? (
            <div className="bg-surface-sunken border border-subtle rounded-xl px-4 py-5 text-center">
              <p className="text-muted text-sm">No deliveries logged {dateFilter === 'today' ? 'today' : dateFilter === 'week' ? 'this week' : 'last week'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <button key={d.id} type="button"
                  onClick={() => setSelectedDelivery(d)}
                  className="w-full bg-surface-raised border border-default rounded-xl px-4 py-3 text-left transition-all hover:border-input hover:shadow-sm active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${categoryChipClass(d.product_category)}`}>
                          {CATEGORY_LABELS[d.product_category] ?? d.product_category}
                        </span>
                        {dateFilter !== 'today' && (
                          <span className="text-[10px] font-bold bg-status-info-soft text-status-info-text px-1.5 py-0.5 rounded flex-shrink-0">
                            {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {d.delivery_number && (
                          <span data-surface="bold-navy" className="text-[10px] font-bold bg-surface-inverse text-body px-1.5 py-0.5 rounded font-mono flex-shrink-0">#{d.delivery_number}</span>
                        )}
                        <p className="text-body font-semibold text-sm truncate">{d.supplier}</p>
                      </div>
                      <p className="text-muted text-xs mt-0.5 truncate">
                        {d.product}
                      </p>
                      {d.batch_number && (
                        <p className="text-body text-xs mt-0.5 font-mono font-bold tracking-wider">{d.batch_number}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 mt-0.5">
                        {d.slaughter_site && (
                          <p className="text-subtle text-[10px]">Slaughter: <span className="font-mono font-bold text-muted">{d.slaughter_site}</span></p>
                        )}
                        {d.born_in && (
                          <p className="text-subtle text-[10px]">
                            Born: {countryLabel(d.born_in)}
                            {d.reared_in && d.reared_in !== d.born_in && <> · Reared: {countryLabel(d.reared_in)}</>}
                          </p>
                        )}
                      </div>
                      {d.covered_contaminated !== 'no' && (
                        <p className="text-status-deviation-text text-xs mt-1">⚠ Contamination {d.covered_contaminated === 'yes_actioned' ? 'actioned' : 'rejected'}</p>
                      )}
                      {d.allergens_identified && (
                        <p className="text-status-error-text text-[10px] font-bold mt-0.5">
                          ⚠️ Allergens: {d.allergen_notes?.split(' — ')[0] ?? 'identified'}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="text-muted text-xs">{deliveryTime(d.time_of_delivery)}</p>
                      <Badge tone={STATUS_BADGE_TONE[d.temp_status] ?? 'neutral'}>
                        {d.temperature_c != null
                          ? `${STATUS_LABEL[d.temp_status] ?? d.temp_status} · ${d.temperature_c}°C`
                          : 'Ambient'}
                      </Badge>
                      <ChevronRightGlyph />
                    </div>
                  </div>
                  {d.batch_number && (
                    <PrintLabelStrip
                      on100mm={() => getPrinter().printDeliveryLabel(buildDeliveryInput(d, '100mm'), onPrintError)}
                      on58mm={() => handlePrint58(d, onPrintError)}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Overlays */}
      {selectedDelivery && (
        <DeliveryDetail d={selectedDelivery} thresholds={thresholds} onClose={() => setSelectedDelivery(null)} />
      )}
      {showNumpad && (
        <Modal
          variant="sheet"
          open
          onOpenChange={(o) => { if (!o) setShowNumpad(false) }}
          title="Probe temperature"
          description={`CCP 1 — Goods In${catDef ? ` · ${catDef.label}` : ''}${catBands ? ` · limit ${catBands.limit}` : ''}`}
        >
          <NumberPad
            value={tempVal}
            onChange={setTempVal}
            onConfirm={() => setShowNumpad(false)}
            allowDecimal
            allowNegative={FROZEN_CATEGORIES.has(category)}
            suffix="°C"
            tone={tempStat ? STATUS_TONE[tempStat] : 'neutral'}
            hint={numpadHint}
          />
        </Modal>
      )}
      {showCCA && (
        <CCAPopup
          tempStatus={tempStat}
          contaminated={contam}
          contamType={contamType}
          catRow={catRow}
          onSubmit={(caTemp, caContam) => doSubmit(caTemp, caContam)}
          onBack={() => setShowCCA(false)}
        />
      )}

      {/* Quick reference */}
      {showQuick && (
        <Modal variant="sheet" open onOpenChange={(o) => { if (!o) setShowQuick(false) }} title="CCP 1 — Quick Reference">
          <div className="space-y-3 pt-1">
            <div className="bg-surface-raised rounded-xl p-4">
              <p className="text-[color:var(--surface-accent-fg)] font-bold text-xs uppercase tracking-widest mb-3">Temperature limits (CA-001)</p>
              <div className="space-y-2">
                {CATEGORIES.map((c) => {
                  const row = thresholds.find((t) => t.category === c.key)
                  return (
                    <div key={c.key} className="flex gap-3 items-start">
                      <span className="text-muted text-xs w-32 flex-shrink-0 pt-0.5">{c.label}</span>
                      <span className="text-subtle text-xs leading-relaxed">
                        {row ? describeGoodsInBands(row).detail : 'Limits unavailable'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="bg-status-warning-soft border border-status-warning-border rounded-xl p-4">
              <p className="text-status-warning-text font-bold text-xs uppercase tracking-widest mb-2">Key rule — do NOT auto-reject (CA-001)</p>
              <p className="text-muted text-xs leading-relaxed">
                {lambRow && lambRow.pass_max_c !== null && lambRow.amber_max_c !== null
                  ? `${Number(lambRow.pass_max_c)}–${Number(lambRow.amber_max_c)}°C for chilled meat is `
                  : 'The conditional band for chilled meat is '}
                <span className="text-body font-semibold">NOT a reject</span> — it is a conditional accept. Place into coldest chiller immediately, halve shelf life, document, review supplier.
                {lambRow && lambRow.amber_max_c !== null && (
                  <> Only {'>'}{Number(lambRow.amber_max_c)}°C is a hard reject.</>
                )}
              </p>
            </div>
            <div className="bg-status-warning-soft border border-status-warning-border rounded-xl p-4">
              <p className="text-status-warning-text font-bold text-xs uppercase tracking-widest mb-2">Frozen special rule</p>
              <p className="text-muted text-xs leading-relaxed">
                {frozenRow && frozenRow.pass_max_c !== null && frozenRow.amber_max_c !== null
                  ? `${Number(frozenRow.amber_max_c)} to ${Number(frozenRow.pass_max_c)}°C is acceptable short-term `
                  : 'The frozen conditional band is acceptable short-term '}
                <span className="text-body font-semibold">only if product is re-frozen immediately</span>. Do NOT refreeze if product has thawed.
                {frozenRow && frozenRow.amber_max_c !== null && (
                  <> {'>'}{Number(frozenRow.amber_max_c)}°C = reject.</>
                )}
              </p>
            </div>
            <div className="bg-surface-raised rounded-xl p-4">
              <p className="text-[color:var(--surface-accent-fg)] font-bold text-xs uppercase tracking-widest mb-2">Contamination (CA-001)</p>
              <p className="text-muted text-xs leading-relaxed">Trim contaminated area with clean knife. Sterilise knife ≥82°C immediately. Dispose trimmings as Category 3 ABP. Document everything.</p>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
