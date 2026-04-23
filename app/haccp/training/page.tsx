/**
 * app/haccp/training/page.tsx
 *
 * Staff Training Register — admin only
 *
 * Tab 1: Butchery & Process Room Training (MFS V2.0)
 * Tab 2: Warehouse Operative Training (MFS V2.0)   ← coming next
 * Tab 3: Allergen Awareness                         ← coming next
 *
 * Document versions are tracked so EHO can verify which version
 * each staff member signed. When docs update, change CURRENT_VERSIONS.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── DOCUMENT CONTROL ────────────────────────────────────────────────────────
// UPDATE THESE when training documents are revised (see docs/DOCUMENT_CONTROL.md)
const CURRENT_VERSIONS: Record<string, string> = {
  butchery_process_room: 'V2.0',
  warehouse_operative:   'V2.0',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffTrainingRecord {
  id:                 string
  staff_name:         string
  job_role:           string
  training_type: string
  document_version:   string | null
  completion_date: string
  refresh_date:       string
  supervisor_name:     string | null
  confirmation_items: Record<string, boolean> | null
  submitted_at:       string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPERVISOR_PRESETS = ['Hakan', 'Ege']

const JOB_ROLES: Record<string, string[]> = {
  butchery_process_room: ['Butcher', 'Processing Worker'],
  warehouse_operative:   ['Warehouse Operative'],
}

// ─── Training document content ────────────────────────────────────────────────
// Full content from MFS Butchery & Process Room Training V2.0 (Nov 2025)
// Update this when the document version changes (see docs/DOCUMENT_CONTROL.md)

const BUTCHERY_DOCUMENT_SECTIONS = [
  {
    title: 'Your Critical Responsibilities',
    content: `Every day you must:
• Maintain strict personal hygiene at all times
• Keep all meat at ≤4°C during processing
• Keep processing room ambient temperature at ≤12°C
• Clean and sanitize equipment properly between products
• Monitor and record temperatures every 2 hours
• Inspect products for quality and condition
• Report any temperature deviations immediately
• Maintain accurate records of all activities`,
  },
  {
    title: 'Personal Hygiene & Protective Clothing',
    content: `Before entering production area:
1. Change into clean work overalls/smock (changed daily)
2. Put on hair net or hat covering all hair
3. Put on non-slip safety footwear
4. Wash hands using 8-step procedure (wet, soap, scrub 20 seconds, rinse, dry, sanitizer, air dry)
5. Change into fresh disposable gloves

During your shift — wash hands: before handling food, after raw meat, after toilet, after touching face/hair, after waste, between products.

Keep fingernails short and clean (max 2mm). No jewellery, false nails, or nail polish. Cover any cuts with waterproof plaster + glove.

Prohibited in production area: No smoking, eating, drinking, or chewing. No touching face or hair while working. No loose clothing, jewellery, or personal items.`,
  },
  {
    title: 'Temperature Control',
    content: `Legal limits you must maintain:
• Product temperature during processing: ≤4°C (absolutely critical)
• Processing room ambient temperature: ≤12°C
• Final packaged product before dispatch: ≤4°C

Daily procedure:
1. Check product temperature from cold storage BEFORE processing begins
2. If product exceeds 4°C — return to chiller, report to supervisor
3. Monitor product core temperature every 2 hours using calibrated thermometer
4. If product warms above 4°C — stop processing immediately, return product to cold storage, report to supervisor before resuming

Thermometer calibration (daily):
• Ice water test: reading should be 0°C ±1°C
• Boiling water test: reading should be 100°C ±1°C
• If out of calibration: remove from service immediately, use backup, report to supervisor`,
  },
  {
    title: 'Equipment Cleaning & Sanitization',
    content: `4-step cleaning process — required every time:

Step 1 — Pre-cleaning: Remove all visible soil and meat residue. Disassemble equipment where possible. Rinse with cold water.

Step 2 — Cleaning: Apply approved cleaning solution at correct concentration. Scrub all surfaces thoroughly. Rinse thoroughly with clean water.

Step 3 — Sanitization: Apply hot water at ≥82°C for 30 seconds minimum, OR apply approved chemical sanitizer at correct concentration.

Step 4 — Verification: Visually inspect for cleanliness. Check water temperature if using hot water method.

Cleaning schedule:
• Knives and small tools: Start and end of shift (≥82°C)
• Cutting boards: Between products and end of shift
• Processing equipment: End of each shift
• Work surfaces: Between products and end of shift`,
  },
  {
    title: 'Critical Hazards & Prevention',
    content: `Biological: Salmonella, E. coli O157, Campylobacter, Listeria are present on raw meat. Cannot be seen or smelled. Multiply rapidly above 4°C. Prevention: keep temperature ≤4°C, clean equipment properly, maintain hygiene.

Chemical: Cleaning chemicals, sanitizers, lubricants. Prevention: use only food-safe chemicals, follow dilution instructions, rinse thoroughly, never mix chemicals.

Physical: Metal fragments, bone chips, plastic fragments, personal items. Prevention: inspect equipment regularly, report damage immediately, use proper techniques.

Cross-contamination: Transfer of contamination between products via equipment, hands, surfaces. Prevention: clean equipment between products, wash hands frequently, change gloves regularly.`,
  },
  {
    title: 'Critical Control Points (CCPs) You Monitor',
    content: `CCP 3 — Processing Room Temperature Control:
• Critical limits: Product ≤4°C, Room ≤12°C
• Monitor: Take product core temperature every 2 hours, check room temperature continuously
• Record: Temperature, product type, batch code, date, time, your initials
• If limit exceeded: Stop processing immediately, move products to cold storage, report to supervisor, do NOT resume until approved

CCP 4 — Final Product Temperature:
• Critical limit: Packaged product ≤4°C before dispatch
• Monitor: Random sample from each batch, insert thermometer into package centre
• Record: Temperature, batch code, date, time, your initials
• If limit exceeded: Quarantine entire batch, return to cold storage, recheck before release`,
  },
  {
    title: 'Packaging & Dispatch',
    content: `Before packaging: Products must be ≤4°C. Equipment must be clean and sanitized.

Every package must be labelled with: product type, batch/lot code, packaging date, use-by date, storage instructions (0-4°C), weight/portion size, allergen declarations.

Final checks before release: package integrity, correct labelling, product appearance, temperature ≤4°C.`,
  },
  {
    title: 'Traceability & Record Keeping',
    content: `You must record on receiving: supplier name and batch number, product type and quantity, receipt date/time, temperature reading, any issues.

During processing: product type, raw material batch used, processing date/time, operators involved, temperature readings every 2 hours, any deviations.

On packaging: batch code, packaging date/time, quantities, link to raw material records.

Why records matter: prove you're doing your job properly, help trace issues back to source, protect customers and the company, required by Food Standards Agency.`,
  },
  {
    title: 'Health & Fitness to Work',
    content: `Do NOT come to work if you have: diarrhoea or vomiting (must be symptom-free 48 hours before returning), jaundice — MUST EXCLUDE, medical clearance required, open cuts or wounds that cannot be covered, skin infections or rashes, discharge from eyes, nose, or ears.

If you become ill during shift: stop handling meat immediately, tell supervisor, leave production area, do NOT continue working.

Return-to-work: gastrointestinal illness — symptom-free 48 hours minimum. Other illness — symptoms resolved. Serious illness — medical clearance required.`,
  },
  {
    title: 'Emergency Procedures',
    content: `If a problem occurs:
1. Stop normal work
2. Tell your supervisor immediately
3. Follow supervisor's instructions
4. Do NOT panic — work calmly as a team
5. Help with documentation as needed

Key emergencies:
• Power/refrigeration failure: Tell supervisor, products may warm, may need discarding
• Water supply loss: Cannot clean without water, stop operations
• Equipment damage: Tell supervisor, move products to backup storage
• Pest activity: Tell supervisor, do NOT touch, let pest control handle it
• Injury: Tell supervisor/first aider immediately`,
  },
  {
    title: 'Key Rules — No Exceptions',
    content: `1. If temperature is wrong, stop work immediately. Do not guess. Report.
2. If you're unsure about anything, ask your supervisor. Never proceed if uncertain.
3. If equipment looks damaged, don't use it. Report it.
4. If you're feeling ill, tell your supervisor. Do not work while unwell.
5. If cleaning doesn't look complete, re-clean it. Do not use dirty equipment.
6. Record everything you do. Documentation proves compliance.
7. Report problems immediately. Don't wait or hope they'll resolve.

YOUR DECISION MATTERS. CUSTOMER SAFETY DEPENDS ON YOU.`,
  },
]

// ─── Document Reader component ────────────────────────────────────────────────
// Staff must scroll through and mark as read before acknowledgment items unlock

function DocumentReader({
  sections,
  docVersion,
  title,
  onRead,
}: {
  sections: { title: string; content: string }[]
  docVersion: string
  title: string
  onRead: () => void
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [hasRead,   setHasRead]   = useState(false)
  const [scrolled,  setScrolled]  = useState(false)

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (nearBottom) setScrolled(true)
  }

  function markRead() {
    setHasRead(true)
    setExpanded(false)
    onRead()
  }

  if (hasRead) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
        <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <div className="flex-1">
          <p className="text-green-700 text-xs font-bold">Training document read — {title} {docVersion}</p>
          <p className="text-green-600 text-[10px] mt-0.5">Acknowledgment checklist now unlocked below</p>
        </div>
        <button onClick={() => { setHasRead(false); setScrolled(false); setExpanded(true) }}
          className="text-green-600 text-[10px] underline flex-shrink-0">Re-read</button>
      </div>
    )
  }

  return (
    <div className="border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 text-left"
      >
        <div>
          <p className="text-slate-900 text-sm font-bold">
            {title} {docVersion}
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            Staff must read this document before signing the acknowledgment
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            Must read
          </span>
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <>
          <div
            onScroll={handleScroll}
            className="max-h-96 overflow-y-auto bg-white px-4 py-3 space-y-5 border-t border-blue-100"
          >
            {sections.map((section, i) => (
              <div key={i}>
                <p className="text-slate-900 text-xs font-bold mb-1.5 uppercase tracking-wide">{section.title}</p>
                <p className="text-slate-600 text-xs leading-relaxed whitespace-pre-line">{section.content}</p>
              </div>
            ))}
            <div className="h-4" /> {/* scroll target */}
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-blue-100 flex items-center justify-between gap-3">
            {!scrolled ? (
              <p className="text-slate-400 text-xs">Scroll to the bottom to confirm you have read the document</p>
            ) : (
              <p className="text-green-600 text-xs font-bold">Document fully read ✓</p>
            )}
            <button
              onClick={markRead}
              disabled={!scrolled}
              className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all disabled:opacity-40 border-orange-500 bg-orange-50 text-orange-700 active:scale-95"
            >
              Mark as read
            </button>
          </div>
        </>
      )}

      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-2.5 bg-white text-orange-600 text-xs font-bold border-t border-blue-100 hover:bg-orange-50 transition-colors"
        >
          Open and read training document →
        </button>
      )}
    </div>
  )
}

// 7 acknowledgment items — exact from MFS Butchery & Process Room Training V2.0 page 8
const BUTCHERY_ACK_ITEMS = [
  { id: 'b1', label: 'Read and understood this training summary' },
  { id: 'b2', label: 'Reviewed the complete MFS Global HACCP Policy Handbook (V2.0)' },
  { id: 'b3', label: 'Understand the food safety hazards in meat processing' },
  { id: 'b4', label: 'Know my critical responsibilities for temperature control and equipment cleaning' },
  { id: 'b5', label: 'Understand how to monitor Critical Control Points (CCP 3 & 4)' },
  { id: 'b6', label: 'Know what to do if problems occur' },
  { id: 'b7', label: 'Accept responsibility for food safety in my daily work' },
]

// ─── Warehouse Operative Training V2.0 — document content ─────────────────────
// 12 sections from MFS Warehouse Operative Training V2.0 (Nov 2025)
// Update when document version changes — see docs/DOCUMENT_CONTROL.md

const WAREHOUSE_DOCUMENT_SECTIONS = [
  {
    title: 'Your Critical Responsibilities',
    content: `Every day you must:
• Inspect every delivery for condition and temperature
• Accept only products meeting safety standards
• Reject unsuitable products without hesitation
• Maintain correct cold storage temperatures (0–4°C fresh, ≤-18°C frozen)
• Monitor temperatures at least twice daily
• Keep accurate records of all receiving and dispatching
• Report any temperature deviations immediately
• Manage stock rotation using FIFO (First In, First Out)
• Prepare products for dispatch at correct temperature`,
  },
  {
    title: 'Personal Hygiene & Protective Clothing',
    content: `Before entering warehouse:
1. Change into clean work overalls/coat (changed daily)
2. Put on hair net or hat covering all hair
3. Put on non-slip safety footwear
4. Wash hands using 8-step procedure (wet, soap, scrub 20 seconds, rinse, dry, sanitizer, air dry)
5. Put on disposable gloves

During your shift — wash hands: before handling products, after raw meat contact, after toilet, after touching face/hair, after waste, between products.

Keep fingernails short and clean (max 2mm). No jewellery, false nails, or nail polish. Cover any cuts with waterproof plaster + glove.

Prohibited: No smoking, eating, or drinking in storage areas. No touching face while handling products. No loose clothing or personal items near product areas.`,
  },
  {
    title: 'Receiving Products — The Complete Procedure',
    content: `Step 1 — Delivery arrival: Confirm paperwork matches order. Visually check vehicle and products. Resolve discrepancies BEFORE unloading.

Step 2 — Unloading: Work quickly — products warm during unloading. Handle carefully — damaged packaging = contamination entry. Keep receiving bay door closed between deliveries.

Step 3 — Transfer to inspection area: Move in covered containers. Keep boxes covered to retain cold. Minimise time at room temperature.

Step 4 — Acceptance inspection:
Check 1 — Documentation: Supplier approved? Batch codes present? Documentation complete?
Check 2 — Temperature (CRITICAL): Fresh meat ≤4°C, Frozen ≤-12°C, Offal ≤3°C. If temperature too high: REJECT ENTIRE DELIVERY.
Check 3 — Visual: Package integrity, product appearance, use-by dates.

ACCEPT if: all temperatures correct, packaging intact, no contamination, dates acceptable.
REJECT if: temperature exceeds limits, packaging damaged, visible defects, dates expired, documentation incomplete.`,
  },
  {
    title: 'Temperature Control in Cold Storage',
    content: `Critical limits:
• Fresh product storage: 0–4°C at all times
• Frozen product storage: ≤-18°C at all times

Daily monitoring:
1. Check temperature display at least twice (start of shift, mid-shift)
2. Record: storage area, temperature reading, date, time, your initials
3. If outside limits: report to supervisor IMMEDIATELY, do NOT add new products

If storage drifts above 4°C: report to supervisor immediately, check how long elevated, assess product safety, do NOT dispatch warm products.

Stock rotation — FIFO: products arriving first must be used/dispatched first. Check use-by dates regularly. Never let old stock expire behind newer stock.`,
  },
  {
    title: 'Product Dispatch & Traceability',
    content: `Before dispatch:
1. Verify product temperature ≤4°C
2. Check packaging — intact and properly labelled
3. Verify batch/lot codes match dispatch records
4. Confirm customer details are correct

Loading: use temperature-controlled vehicles ONLY. Load quickly. Verify vehicle is truly temperature-controlled.

Traceability: record batch/lot codes in dispatch documentation. Link batch codes to customer orders. This creates forward traceability for recalls if needed.`,
  },
  {
    title: 'Critical Control Points (CCPs) You Monitor',
    content: `CCP 1 — Receipt Temperature Control:
• Critical limits: Fresh ≤4°C, Frozen ≤-12°C, Offal ≤3°C
• Monitor: temperature check every delivery
• Record: temperature, product type, batch code, date, time, your initials
• If limit exceeded: REJECT entire delivery, notify supplier, document rejection

CCP 2 — Cold Storage Temperature:
• Critical limits: Fresh 0–4°C, Frozen ≤-18°C
• Monitor: check temperature display at least 2x daily
• Record: storage area, temperature, date, time, your initials
• If limit exceeded: report to supervisor immediately, assess product safety, may need to discard`,
  },
  {
    title: 'Hazards in Warehouse Operations',
    content: `Biological: Salmonella, E. coli, Campylobacter, Listeria present on raw meat. Cannot be seen or smelled. Multiply rapidly above 4°C. Prevention: keep temperature ≤4°C, reject warm products, monitor continuously.

Physical: contaminated vehicles, damaged products, foreign objects, pest contamination, equipment failure. Prevention: inspect vehicles, reject damaged products, maintain clean storage, report pest evidence.

Temperature hazards: products arriving too warm, equipment malfunction, cold chain breaks. Prevention: temperature check every product, monitor storage twice daily, report problems immediately.`,
  },
  {
    title: 'Authority to Reject Products',
    content: `You have the authority to reject ANY product if:
• Temperature exceeds critical limits
• Packaging is damaged or leaking
• Shows signs of contamination or damage
• Documentation is incomplete or incorrect
• Use-by date is expired or too close
• Supplier is not approved
• Any food safety concern exists

Rejecting a product:
1. Stop accepting immediately
2. Document reason clearly
3. Notify supplier
4. Report to supervisor
5. Return to supplier or follow disposal procedures

This is not negotiable — customer safety comes first.`,
  },
  {
    title: 'Common Issues & Your Actions',
    content: `Delivery arrives warm (above 4°C): REJECT entire delivery. Notify supplier. Document rejection. Report to supervisor.

Packaging has holes or leaks: REJECT those products. Do NOT accept. Notify supplier. Document rejection.

Cold storage reading 6°C: report to supervisor IMMEDIATELY. Check thermometer accuracy. Check product temperatures. Call maintenance.

Products near use-by date: ensure FIFO working. Prioritise for dispatch. Alert supervisor if approaching expiry.

Pest droppings found: tell supervisor IMMEDIATELY. Isolate area. Do NOT move products without guidance. Pest control will be called.

Vehicle temperature system broken: tell supervisor IMMEDIATELY. Do NOT load products. Get alternative temperature-controlled vehicle.`,
  },
  {
    title: 'Emergency Procedures',
    content: `If emergency occurs:
1. Stop normal work
2. Tell supervisor immediately
3. Follow supervisor's instructions
4. Work calmly as a team
5. Help document what happened

Key emergencies:
• Power/refrigeration failure: Tell supervisor, products may warm, may need discarding
• Water supply loss: Cannot clean, stop operations, wait for restoration
• Cold chain broken: Tell supervisor, products may need discarding
• Pest activity: Tell supervisor, do NOT touch, let pest control handle
• Injury: Tell supervisor/first aider immediately, do NOT move injured person`,
  },
  {
    title: 'Health & Fitness to Work',
    content: `Do NOT come to work if you have: diarrhoea or vomiting (symptom-free 48 hours required before returning), jaundice — MUST EXCLUDE, medical clearance required, open cuts that cannot be covered, skin infections or rashes, discharge from eyes, nose, or ears.

If feeling unwell during shift: tell supervisor immediately, stop handling products, leave warehouse area, do NOT continue working.

Return-to-work: gastrointestinal — symptom-free 48 hours minimum. Other illness — symptoms resolved. Serious illness — medical clearance required.`,
  },
  {
    title: 'Key Rules — No Exceptions',
    content: `1. If temperature is wrong, reject it. Don't risk customer safety.
2. If packaging is damaged, reject it. Contamination can enter.
3. If you're unsure, ask your supervisor. Never guess.
4. Keep records accurate. They prove compliance.
5. Work quickly with cold products. Minimise temperature rise.
6. Maintain cold chain integrity. It's your job.
7. Report problems immediately. Don't wait.

YOUR DECISION MATTERS. CUSTOMER SAFETY DEPENDS ON YOU.`,
  },
]

// 8 acknowledgment items — exact from MFS Warehouse Operative Training V2.0 page 10
const WAREHOUSE_ACK_ITEMS = [
  { id: 'w1', label: 'Read and understood this training summary' },
  { id: 'w2', label: 'Reviewed the complete MFS Global HACCP Policy Handbook (V2.0)' },
  { id: 'w3', label: 'Understand the food safety hazards in warehouse operations' },
  { id: 'w4', label: 'Know my critical responsibilities for product receiving and temperature control' },
  { id: 'w5', label: 'Understand how to monitor Critical Control Points (CCP 1 & 2)' },
  { id: 'w6', label: 'Have the authority to reject unsuitable products' },
  { id: 'w7', label: 'Know what to do in emergency situations' },
  { id: 'w8', label: 'Accept responsibility for food safety in my daily work' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function refreshStatus(refreshDate: string): { label: string; colour: string } {
  const today = new Date(todayStr())
  const refresh = new Date(refreshDate)
  const daysUntil = Math.floor((refresh.getTime() - today.getTime()) / 86400000)

  if (daysUntil < 0)   return { label: `Overdue by ${Math.abs(daysUntil)}d`, colour: 'bg-red-100 text-red-700' }
  if (daysUntil <= 30) return { label: `Due in ${daysUntil}d`,               colour: 'bg-amber-100 text-amber-700' }
  return { label: `Due ${fmtDate(refreshDate)}`, colour: 'bg-green-100 text-green-700' }
}

// ─── Acknowledgment Checklist ─────────────────────────────────────────────────

function AckChecklist({
  items,
  ticked,
  onToggle,
}: {
  items: { id: string; label: string }[]
  ticked: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  return (
    <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onToggle(item.id)}
          className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-100 last:border-0 transition-all ${
            ticked[item.id] ? 'bg-green-50' : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
            ticked[item.id] ? 'border-green-500 bg-green-500' : 'border-slate-300'
          }`}>
            {ticked[item.id] && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </div>
          <p className={`text-xs leading-relaxed flex-1 ${
            ticked[item.id] ? 'text-green-700 line-through decoration-green-400' : 'text-slate-700'
          }`}>{item.label}</p>
        </button>
      ))}
    </div>
  )
}

// ─── Supervisor sign-off ──────────────────────────────────────────────────────

function SupervisorSignOff({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isOther = value !== '' && !SUPERVISOR_PRESETS.includes(value)
  return (
    <div>
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Supervisor sign-off</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {SUPERVISOR_PRESETS.map((name) => (
          <button key={name} type="button"
            onPointerDown={(e) => { e.preventDefault(); onChange(name) }}
            className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
              value === name ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-slate-300 bg-white text-slate-400'
            }`}>{name}</button>
        ))}
        <button type="button"
          onPointerDown={(e) => { e.preventDefault(); if (!isOther) onChange('') }}
          className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
            isOther ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-slate-300 bg-white text-slate-400'
          }`}>Other</button>
      </div>
      {(value === '' || isOther) && (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="Enter supervisor name…"
          className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
      )}
    </div>
  )
}

// ─── History card ─────────────────────────────────────────────────────────────

function TrainingHistoryCard({ record }: { record: StaffTrainingRecord }) {
  const status = refreshStatus(record.refresh_date)
  const [expanded, setExpanded] = useState(false)
  const acksCount = record.confirmation_items
    ? Object.values(record.confirmation_items).filter(Boolean).length
    : 0
  const totalItems = record.training_type === 'warehouse_operative' ? 8 : 7

  return (
    <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {record.document_version ?? 'V?'}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.colour}`}>
              {status.label}
            </span>
          </div>
          <p className="text-slate-900 text-sm font-semibold">{record.staff_name}</p>
          <p className="text-slate-500 text-xs">{record.job_role} · Signed {fmtDate(record.completion_date)}</p>
          <p className="text-slate-400 text-[10px] mt-0.5">Supervisor: {record.supervisor_name ?? '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-slate-400 text-[10px]">{acksCount}/{totalItems} confirmed</p>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>
      {expanded && record.confirmation_items && (
        <div className="px-4 pb-3 border-t border-slate-100">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-3 mb-2">Acknowledgments confirmed</p>
          {Object.entries(record.confirmation_items).map(([key, val]) => {
            const items = record.training_type === 'butchery_process_room' ? BUTCHERY_ACK_ITEMS
                        : record.training_type === 'warehouse_operative'   ? WAREHOUSE_ACK_ITEMS
                        : []
            const item = items.find((i) => i.id === key)
            if (!item) return null
            return (
              <div key={key} className={`flex items-start gap-2 py-1.5 ${val ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${val ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                  {val && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">{item.label}</p>
              </div>
            )
          })}
          <p className="text-slate-400 text-[10px] mt-3">Logged {fmtDateTime(record.submitted_at)}</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab 1 — Butchery & Process Room ─────────────────────────────────────────

function ButcheryTab({ records, onSubmitted }: { records: StaffTrainingRecord[]; onSubmitted: () => void }) {
  const today = todayStr()
  const [staffName,      setStaffName]      = useState('')
  const [jobRole,        setJobRole]        = useState('')
  const [docVersion,     setDocVersion]     = useState(CURRENT_VERSIONS.butchery_process_room)
  const [completionDate, setCompletionDate] = useState(today)
  const [refreshDate,    setRefreshDate]    = useState(addMonths(today, 12))
  const [documentRead,   setDocumentRead]   = useState(false)
  const [ticked,         setTicked]         = useState<Record<string, boolean>>(
    Object.fromEntries(BUTCHERY_ACK_ITEMS.map((i) => [i.id, false]))
  )
  const [supervisor,     setSupervisor]     = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState('')

  // Auto-update refresh date when completion date changes
  useEffect(() => {
    if (completionDate) setRefreshDate(addMonths(completionDate, 12))
  }, [completionDate])

  const allTicked  = BUTCHERY_ACK_ITEMS.every((i) => ticked[i.id])
  const tickedCount = BUTCHERY_ACK_ITEMS.filter((i) => ticked[i.id]).length
  const isValid    = staffName.trim() && jobRole && docVersion.trim() && completionDate && refreshDate && documentRead && allTicked && supervisor.trim()

  function toggleTick(id: string) {
    setTicked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/haccp/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          training_type:      'butchery_process_room',
          staff_name:         staffName,
          job_role:           jobRole,
          document_version:   docVersion,
          completion_date: completionDate,
          refresh_date:       refreshDate,
          supervisor:        supervisor,
          confirmation_items: ticked,
        }),
      })
      if (res.ok) {
        onSubmitted()
        setStaffName(''); setJobRole(''); setSupervisor('')
        setDocVersion(CURRENT_VERSIONS.butchery_process_room)
        setDocumentRead(false)
        setCompletionDate(today); setRefreshDate(addMonths(today, 12))
        setTicked(Object.fromEntries(BUTCHERY_ACK_ITEMS.map((i) => [i.id, false])))
      } else {
        const d = await res.json(); setError(d.error ?? 'Submission failed')
      }
    } catch { setError('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  const tabRecords = records.filter((r) => r.training_type === 'butchery_process_room')

  return (
    <div className="space-y-4">
      {/* Context banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <div>
          <p className="text-amber-800 text-xs font-bold">Current document: MFS Butchery &amp; Process Room Training {CURRENT_VERSIONS.butchery_process_room}</p>
          <p className="text-amber-700 text-xs mt-0.5">Staff must have read the physical booklet before this record is logged. Refresh annually or when document is updated.</p>
        </div>
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-slate-900 font-semibold text-sm">Log Training Completion</p>
          <p className="text-slate-400 text-xs mt-0.5">Reg 852/2004 Annex II Ch X — food handler training record</p>
        </div>

        <div className="px-4 py-4 space-y-5">

          {/* Staff name */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Staff name</p>
            <input type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          {/* Job role */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Job role</p>
            <div className="flex gap-2 flex-wrap">
              {JOB_ROLES.butchery_process_room.map((role) => (
                <button key={role} type="button"
                  onPointerDown={(e) => { e.preventDefault(); setJobRole(role) }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                    jobRole === role ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'
                  }`}>{role}</button>
              ))}
            </div>
          </div>

          {/* Document version */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Document version signed</p>
            <input type="text" value={docVersion} onChange={(e) => setDocVersion(e.target.value)}
              placeholder="V2.0"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm font-mono focus:outline-none focus:border-orange-500" />
            {docVersion !== CURRENT_VERSIONS.butchery_process_room && (
              <p className="text-amber-600 text-xs mt-1">
                ⚠ Current version is {CURRENT_VERSIONS.butchery_process_room} — confirm staff signed the correct document
              </p>
            )}
          </div>

          {/* Training document reader — must read before acknowledgment unlocks */}
          <DocumentReader
            sections={BUTCHERY_DOCUMENT_SECTIONS}
            docVersion={docVersion}
            title="MFS Butchery & Process Room Training"
            onRead={() => setDocumentRead(true)}
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Completion date</p>
              <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Refresh date</p>
              <input type="date" value={refreshDate} onChange={(e) => setRefreshDate(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
              <p className="text-slate-400 text-[10px] mt-1">Auto-set to +12 months</p>
            </div>
          </div>

          {/* Acknowledgment checklist — locked until document is read */}
          {!documentRead ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-center">
              <svg className="w-6 h-6 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p className="text-slate-400 text-xs font-bold">Acknowledgment locked</p>
              <p className="text-slate-400 text-[10px] mt-0.5">Read the training document above to unlock</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Training acknowledgment</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  allTicked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>{tickedCount}/{BUTCHERY_ACK_ITEMS.length}</span>
              </div>
              <p className="text-slate-500 text-xs mb-3">
                Confirm that the staff member acknowledges each point from the training booklet.
              </p>
              <AckChecklist items={BUTCHERY_ACK_ITEMS} ticked={ticked} onToggle={toggleTick} />
              {!allTicked && (
                <p className="text-slate-400 text-xs mt-2">All {BUTCHERY_ACK_ITEMS.length} items must be confirmed before submitting</p>
              )}
            </div>
          )}

          {/* Supervisor */}
          <SupervisorSignOff value={supervisor} onChange={setSupervisor} />

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || submitting}
          className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
          {submitting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>Saving…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>Submit training record</>
          }
        </button>
      </div>

      {/* History */}
      {tabRecords.length > 0 && (
        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Training records ({tabRecords.length})</p>
          <div className="space-y-2">
            {tabRecords.map((r) => <TrainingHistoryCard key={r.id} record={r} />)}
          </div>
        </div>
      )}
      {tabRecords.length === 0 && (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center">
          <p className="text-slate-400 text-sm">No records yet</p>
        </div>
      )}
    </div>
  )
}

// ─── Placeholder tabs ─────────────────────────────────────────────────────────

// ─── Tab 2 — Warehouse Operative ─────────────────────────────────────────────

function WarehouseTab({ records, onSubmitted }: { records: StaffTrainingRecord[]; onSubmitted: () => void }) {
  const today = todayStr()
  const [staffName,      setStaffName]      = useState('')
  const [docVersion,     setDocVersion]     = useState(CURRENT_VERSIONS.warehouse_operative)
  const [completionDate, setCompletionDate] = useState(today)
  const [refreshDate,    setRefreshDate]    = useState(addMonths(today, 12))
  const [documentRead,   setDocumentRead]   = useState(false)
  const [ticked,         setTicked]         = useState<Record<string, boolean>>(
    Object.fromEntries(WAREHOUSE_ACK_ITEMS.map((i) => [i.id, false]))
  )
  const [supervisor,     setSupervisor]     = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (completionDate) setRefreshDate(addMonths(completionDate, 12))
  }, [completionDate])

  const allTicked   = WAREHOUSE_ACK_ITEMS.every((i) => ticked[i.id])
  const tickedCount = WAREHOUSE_ACK_ITEMS.filter((i) => ticked[i.id]).length
  const isValid     = staffName.trim() && docVersion.trim() && completionDate && refreshDate && documentRead && allTicked && supervisor.trim()

  function toggleTick(id: string) {
    setTicked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/haccp/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          training_type:      'warehouse_operative',
          staff_name:         staffName,
          job_role:           'Warehouse Operative',
          document_version:   docVersion,
          completion_date:    completionDate,
          refresh_date:       refreshDate,
          supervisor,
          confirmation_items: ticked,
        }),
      })
      if (res.ok) {
        onSubmitted()
        setStaffName(''); setSupervisor('')
        setDocVersion(CURRENT_VERSIONS.warehouse_operative)
        setDocumentRead(false)
        setCompletionDate(today); setRefreshDate(addMonths(today, 12))
        setTicked(Object.fromEntries(WAREHOUSE_ACK_ITEMS.map((i) => [i.id, false])))
      } else {
        const d = await res.json(); setError(d.error ?? 'Submission failed')
      }
    } catch { setError('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  const tabRecords = records.filter((r) => r.training_type === 'warehouse_operative')

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <div>
          <p className="text-amber-800 text-xs font-bold">Current document: MFS Warehouse Operative Training {CURRENT_VERSIONS.warehouse_operative}</p>
          <p className="text-amber-700 text-xs mt-0.5">Staff must read the document before this record is logged. Refresh annually or when document is updated.</p>
        </div>
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-slate-900 font-semibold text-sm">Log Training Completion</p>
          <p className="text-slate-400 text-xs mt-0.5">Reg 852/2004 Annex II Ch X — food handler training record</p>
        </div>

        <div className="px-4 py-4 space-y-5">

          {/* Staff name */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Staff name</p>
            <input type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          {/* Job role — single value, displayed for reference */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Job role</p>
            <div className="px-4 py-2.5 bg-slate-50 border border-blue-100 rounded-xl text-slate-600 text-sm">
              Warehouse Operative
            </div>
          </div>

          {/* Document version */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Document version signed</p>
            <input type="text" value={docVersion} onChange={(e) => setDocVersion(e.target.value)}
              placeholder="V2.0"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm font-mono focus:outline-none focus:border-orange-500" />
            {docVersion !== CURRENT_VERSIONS.warehouse_operative && (
              <p className="text-amber-600 text-xs mt-1">
                ⚠ Current version is {CURRENT_VERSIONS.warehouse_operative} — confirm staff signed the correct document
              </p>
            )}
          </div>

          {/* Document reader — must read before acknowledgment unlocks */}
          <DocumentReader
            sections={WAREHOUSE_DOCUMENT_SECTIONS}
            docVersion={docVersion}
            title="MFS Warehouse Operative Training"
            onRead={() => setDocumentRead(true)}
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Completion date</p>
              <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Refresh date</p>
              <input type="date" value={refreshDate} onChange={(e) => setRefreshDate(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
              <p className="text-slate-400 text-[10px] mt-1">Auto-set to +12 months</p>
            </div>
          </div>

          {/* Acknowledgment checklist — locked until document is read */}
          {!documentRead ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-center">
              <svg className="w-6 h-6 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p className="text-slate-400 text-xs font-bold">Acknowledgment locked</p>
              <p className="text-slate-400 text-[10px] mt-0.5">Read the training document above to unlock</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Training acknowledgment</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  allTicked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>{tickedCount}/{WAREHOUSE_ACK_ITEMS.length}</span>
              </div>
              <p className="text-slate-500 text-xs mb-3">
                Confirm that the staff member acknowledges each point from the training booklet.
              </p>
              <AckChecklist items={WAREHOUSE_ACK_ITEMS} ticked={ticked} onToggle={toggleTick} />
              {!allTicked && (
                <p className="text-slate-400 text-xs mt-2">All {WAREHOUSE_ACK_ITEMS.length} items must be confirmed before submitting</p>
              )}
            </div>
          )}

          {/* Supervisor sign-off */}
          <SupervisorSignOff value={supervisor} onChange={setSupervisor} />

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || submitting}
          className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
          {submitting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>Saving…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>Submit training record</>
          }
        </button>
      </div>

      {/* History */}
      {tabRecords.length > 0 && (
        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Training records ({tabRecords.length})</p>
          <div className="space-y-2">
            {tabRecords.map((r) => <TrainingHistoryCard key={r.id} record={r} />)}
          </div>
        </div>
      )}
      {tabRecords.length === 0 && (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center">
          <p className="text-slate-400 text-sm">No records yet</p>
        </div>
      )}
    </div>
  )
}

// ─── Allergen Awareness constants ────────────────────────────────────────────
// 14 major allergens — UK Food Information Regulations 2014
// Each includes common food sources and relevance to MFS operations
const ALLERGEN_ITEMS = [
  {
    id: 'a1', label: 'Celery',
    found_in: 'Celery seeds, celeriac, soups, stocks, spice mixes, ready-made seasonings',
    mfs_note: 'Can be present in pre-mixed seasoning blends or marinades used on products',
  },
  {
    id: 'a2', label: 'Cereals containing gluten (wheat, rye, barley, oats)',
    found_in: 'Bread, flour, pasta, coatings, marinades, soy sauce (often wheat-based), beer',
    mfs_note: 'Breadcrumbs in burger patties, wheat-based coatings on poultry, soy sauce in marinades',
  },
  {
    id: 'a3', label: 'Crustaceans (prawns, crab, lobster)',
    found_in: 'Prawns, crab, lobster, shrimp paste, some Thai and Asian sauces',
    mfs_note: 'Cross-contamination risk if handling any seafood products or shared equipment',
  },
  {
    id: 'a4', label: 'Eggs',
    found_in: 'Mayonnaise, egg wash, pasta, coatings, glazes, some sauces',
    mfs_note: 'Egg-based marinades, glazes on poultry, coatings on QSR products',
  },
  {
    id: 'a5', label: 'Fish',
    found_in: 'Fish sauce, Worcestershire sauce, Caesar dressing, anchovy paste, some spice blends',
    mfs_note: 'Worcestershire sauce is very commonly used in marinades and contains fish (anchovies)',
  },
  {
    id: 'a6', label: 'Lupin',
    found_in: 'Lupin flour in some breads, pastries, pasta, and gluten-free products',
    mfs_note: 'Can appear in specialty burger buns or gluten-free coatings — check all packaging',
  },
  {
    id: 'a7', label: 'Milk',
    found_in: 'Butter, cream, cheese, milk powder, whey, yoghurt-based marinades, some seasonings',
    mfs_note: 'Dairy marinades, butter basting, milk powder in some seasoning blends or patty recipes',
  },
  {
    id: 'a8', label: 'Molluscs (mussels, oysters, squid)',
    found_in: 'Oyster sauce, some Asian cooking sauces, mussels, clams, squid',
    mfs_note: 'Oyster sauce is widely used in marinades — always check ingredients on sauce bottles',
  },
  {
    id: 'a9', label: 'Mustard',
    found_in: 'Mustard seeds, powder, paste, many spice blends, salad dressings, some marinades',
    mfs_note: 'Very common in marinades and rubs — one of the most likely allergens to appear in seasoned meat products',
  },
  {
    id: 'a10', label: 'Peanuts',
    found_in: 'Peanut oil, satay sauce, peanut butter, some spice blends, groundnut oil',
    mfs_note: 'Satay and Asian-style marinades, peanut oil used for cooking — high severity allergen',
  },
  {
    id: 'a11', label: 'Sesame',
    found_in: 'Sesame oil, tahini, hummus, sesame-coated products, some spice blends, some burger buns',
    mfs_note: 'Sesame oil in marinades, sesame seeds on burger buns — increasingly common in food products',
  },
  {
    id: 'a12', label: 'Soybeans',
    found_in: 'Soy sauce, tofu, miso, edamame, some protein products, vegetable oils',
    mfs_note: 'Soy sauce is the most common allergen source in meat marinades — present in most commercial marinades',
  },
  {
    id: 'a13', label: 'Sulphur dioxide and sulphites (>10mg/kg)',
    found_in: 'Processed meats (sausages, burgers), dried fruits, wine, vinegar, some seasonings',
    mfs_note: 'Present in some processed meat products as a preservative — check all cured or processed meat specifications',
  },
  {
    id: 'a14', label: 'Tree nuts (almonds, hazelnuts, walnuts, cashews, pecans, Brazil nuts, pistachios, macadamia)',
    found_in: 'Nut oils, pesto, some sauces, nut-based coatings, some spice blends',
    mfs_note: 'Nut oils occasionally used in marinades — all 8 tree nut varieties must be declared separately',
  },
]

const ALLERGEN_UNDERSTANDING_ITEMS = [
  { id: 'u1', label: 'I understand the risks of allergen cross-contamination in food handling' },
  { id: 'u2', label: 'I know how to store allergen-containing products separately to prevent cross-contamination' },
  { id: 'u3', label: 'I understand my responsibility to prevent allergen cross-contamination during processing and dispatch' },
  { id: 'u4', label: 'I know that allergen information must be accurate on all product labels' },
  { id: 'u5', label: 'I know to report any potential allergen contamination to my supervisor immediately' },
]

const ALL_ALLERGEN_CONFIRMATION_ITEMS = [...ALLERGEN_ITEMS, ...ALLERGEN_UNDERSTANDING_ITEMS]

// ─── Allergen Card ────────────────────────────────────────────────────────────

function AllergenCard({
  item, index, ticked, onTick, isLast,
}: {
  item: { id: string; label: string; found_in: string; mfs_note: string }
  index: number
  ticked: boolean
  onTick: () => void
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border-b border-slate-100 ${isLast ? 'border-0' : ''} ${ticked ? 'bg-green-50' : 'bg-white'}`}>
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="text-slate-400 text-[10px] font-bold w-5 flex-shrink-0 mt-0.5 text-right">{index + 1}</span>
        <button type="button"
          onClick={onTick}
          className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
            ticked ? 'border-green-500 bg-green-500' : 'border-slate-300'
          }`}>
          {ticked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => setExpanded(p => !p)}
            className="w-full text-left flex items-center justify-between gap-2">
            <p className={`text-xs font-semibold leading-relaxed ${ticked ? 'text-green-700 line-through decoration-green-400' : 'text-slate-800'}`}>
              {item.label}
            </p>
            <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''} ${ticked ? 'text-green-500' : 'text-slate-400'}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>
      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 ml-8 space-y-2">
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Commonly found in</p>
            <p className="text-slate-600 text-xs leading-relaxed">{item.found_in}</p>
          </div>
          <div className="bg-orange-50 rounded-xl px-3 py-2.5 border border-orange-100">
            <p className="text-orange-500 text-[10px] font-bold uppercase tracking-widest mb-1">MFS relevance</p>
            <p className="text-slate-700 text-xs leading-relaxed">{item.mfs_note}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3 — Allergen Awareness ───────────────────────────────────────────────

interface AllergenRecord {
  id:                 string
  staff_name:         string
  job_role:           string
  training_completed: string
  certification_date: string
  refresh_date:       string
  supervisor_name:    string | null
  confirmation_items: Record<string, boolean> | null
  submitted_at:       string
}

const ALLERGEN_JOB_ROLES = ['Butcher', 'Processing Worker', 'Warehouse Operative']

function AllergenTab({ allergenRecords, onSubmitted }: { allergenRecords: AllergenRecord[]; onSubmitted: () => void }) {
  const today = todayStr()
  const [staffName,      setStaffName]      = useState('')
  const [jobRole,        setJobRole]        = useState('')
  const [completionDate, setCompletionDate] = useState(today)
  const [refreshDate,    setRefreshDate]    = useState(addMonths(today, 12))
  const [ticked,         setTicked]         = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_ALLERGEN_CONFIRMATION_ITEMS.map((i) => [i.id, false]))
  )
  const [supervisor,     setSupervisor]     = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (completionDate) setRefreshDate(addMonths(completionDate, 12))
  }, [completionDate])

  const allTicked   = ALL_ALLERGEN_CONFIRMATION_ITEMS.every((i) => ticked[i.id])
  const tickedCount = ALL_ALLERGEN_CONFIRMATION_ITEMS.filter((i) => ticked[i.id]).length
  const isValid     = staffName.trim() && jobRole && completionDate && refreshDate && allTicked && supervisor.trim()

  function toggleTick(id: string) {
    setTicked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSubmit() {
    if (!isValid || submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/haccp/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          training_type:      'allergen_awareness',
          staff_name:         staffName,
          job_role:           jobRole,
          certification_date: completionDate,
          refresh_date:       refreshDate,
          supervisor,
          confirmation_items: ticked,
        }),
      })
      if (res.ok) {
        onSubmitted()
        setStaffName(''); setJobRole(''); setSupervisor('')
        setCompletionDate(today); setRefreshDate(addMonths(today, 12))
        setTicked(Object.fromEntries(ALL_ALLERGEN_CONFIRMATION_ITEMS.map((i) => [i.id, false])))
      } else {
        const d = await res.json(); setError(d.error ?? 'Submission failed')
      }
    } catch { setError('Connection error — try again') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <p className="text-blue-800 text-xs font-bold">UK Food Information Regulations 2014 — 14 Major Allergens</p>
          <p className="text-blue-700 text-xs mt-0.5">All food handlers must complete allergen awareness training annually. Supervisor works through each allergen with the staff member before confirming.</p>
        </div>
      </div>

      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-slate-900 font-semibold text-sm">Log Allergen Awareness Training</p>
          <p className="text-slate-400 text-xs mt-0.5">FIR 2014 — annual refresh required</p>
        </div>

        <div className="px-4 py-4 space-y-5">

          {/* Staff name */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Staff name</p>
            <input type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
          </div>

          {/* Job role */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Job role</p>
            <div className="flex gap-2 flex-wrap">
              {ALLERGEN_JOB_ROLES.map((role) => (
                <button key={role} type="button"
                  onPointerDown={(e) => { e.preventDefault(); setJobRole(role) }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                    jobRole === role ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'
                  }`}>{role}</button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Completion date</p>
              <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Refresh date</p>
              <input type="date" value={refreshDate} onChange={(e) => setRefreshDate(e.target.value)}
                className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500" />
              <p className="text-slate-400 text-[10px] mt-1">Auto-set to +12 months</p>
            </div>
          </div>

          {/* 14 allergens checklist */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">14 major allergens — UK FIR 2014</p>
            <p className="text-slate-500 text-xs mb-3">Tap each allergen to expand details. Supervisor confirms staff member can identify it and understands cross-contamination risks before ticking.</p>
            <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
              {ALLERGEN_ITEMS.map((item, i) => (
                <AllergenCard
                  key={item.id}
                  item={item}
                  index={i}
                  ticked={ticked[item.id]}
                  onTick={() => toggleTick(item.id)}
                  isLast={i === ALLERGEN_ITEMS.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Understanding acknowledgments */}
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Understanding confirmation</p>
            <p className="text-slate-500 text-xs mb-3">Staff member confirms understanding of responsibilities.</p>
            <div className="bg-slate-50 border border-blue-100 rounded-xl overflow-hidden">
              {ALLERGEN_UNDERSTANDING_ITEMS.map((item) => (
                <button key={item.id} type="button" onClick={() => toggleTick(item.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-100 last:border-0 transition-all ${
                    ticked[item.id] ? 'bg-green-50' : 'bg-white hover:bg-slate-50'
                  }`}>
                  <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    ticked[item.id] ? 'border-green-500 bg-green-500' : 'border-slate-300'
                  }`}>
                    {ticked[item.id] && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <p className={`text-xs leading-relaxed flex-1 ${ticked[item.id] ? 'text-green-700 line-through decoration-green-400' : 'text-slate-700'}`}>
                    {item.label}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-slate-400 text-xs">{allTicked ? 'All items confirmed ✓' : `${tickedCount} / ${ALL_ALLERGEN_CONFIRMATION_ITEMS.length} confirmed`}</p>
            </div>
          </div>

          {/* Supervisor sign-off */}
          <SupervisorSignOff value={supervisor} onChange={setSupervisor} />

          {error && <p className="text-red-600 text-xs">{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={!isValid || submitting}
          className="w-full bg-orange-600 text-white font-bold py-4 text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity">
          {submitting
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>Saving…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>Submit allergen awareness record</>
          }
        </button>
      </div>

      {/* History */}
      {allergenRecords.length > 0 && (
        <div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Allergen training records ({allergenRecords.length})</p>
          <div className="space-y-2">
            {allergenRecords.map((r) => (
              <div key={r.id} className="bg-white border border-blue-100 rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${refreshStatus(r.refresh_date).colour}`}>
                        {refreshStatus(r.refresh_date).label}
                      </span>
                    </div>
                    <p className="text-slate-900 text-sm font-semibold">{r.staff_name}</p>
                    <p className="text-slate-500 text-xs">{r.job_role} · Completed {fmtDate(r.certification_date)}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Supervisor: {r.supervisor_name ?? '—'}</p>
                  </div>
                  <p className="text-slate-400 text-xs flex-shrink-0">
                    {r.confirmation_items
                      ? `${Object.values(r.confirmation_items).filter(Boolean).length}/19`
                      : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {allergenRecords.length === 0 && (
        <div className="bg-white border border-blue-100 rounded-xl px-4 py-5 text-center">
          <p className="text-slate-400 text-sm">No allergen training records yet</p>
        </div>
      )}
    </div>
  )
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="bg-white border border-blue-100 rounded-xl px-4 py-8 text-center">
      <p className="text-slate-400 text-sm">{label} — coming soon</p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const [tab,          setTab]          = useState<'butchery' | 'warehouse' | 'allergen'>('butchery')
  const [staffRecs,    setStaffRecs]    = useState<StaffTrainingRecord[]>([])
  const [allergenRecs, setAllergenRecs] = useState<AllergenRecord[]>([])
  const [loading,      setLoading]      = useState(true)
  const [flash,        setFlash]        = useState('')

  const loadData = useCallback(() => {
    fetch('/api/haccp/training')
      .then((r) => r.json())
      .then((d) => {
        setStaffRecs(d.staff ?? [])
        setAllergenRecs(d.allergen ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function handleSubmitted() {
    setFlash('Training record submitted')
    loadData()
    setTimeout(() => setFlash(''), 2500)
  }

  // Summary counts — includes allergen records
  const today = new Date(todayStr())
  const overdueCount = [
    ...staffRecs,
    ...allergenRecs.map(r => ({ refresh_date: r.refresh_date })),
  ].filter((r) => new Date(r.refresh_date) < today).length
  const dueSoonCount = [
    ...staffRecs,
    ...allergenRecs.map(r => ({ refresh_date: r.refresh_date })),
  ].filter((r) => {
    const d = new Date(r.refresh_date); const diff = (d.getTime() - today.getTime()) / 86400000
    return diff >= 0 && diff <= 30
  }).length

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
          <p className="text-orange-400 text-[10px] font-bold tracking-widest uppercase">Reg 852/2004 Annex II Ch X</p>
          <h1 className="text-white text-lg font-bold leading-tight">Training Register</h1>
        </div>
        {(overdueCount > 0 || dueSoonCount > 0) && (
          <span className={`text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0 ${
            overdueCount > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {overdueCount > 0 ? `${overdueCount} overdue` : `${dueSoonCount} due soon`}
          </span>
        )}
      </div>

      {/* Tab selector */}
      <div className="px-5 pt-4 pb-0 flex gap-2 overflow-x-auto">
        {([
          { key: 'butchery',  label: 'Butchery & Process Room' },
          { key: 'warehouse', label: 'Warehouse Operative'     },
          { key: 'allergen',  label: 'Allergen Awareness'      },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 py-2.5 px-4 rounded-xl text-sm font-bold border-2 transition-all ${
              tab === t.key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

        {flash && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <p className="text-green-700 font-bold text-sm">{flash}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Loading…
          </div>
        ) : (
          <>
            {tab === 'butchery'  && <ButcheryTab   records={staffRecs}      onSubmitted={handleSubmitted} />}
            {tab === 'warehouse' && <WarehouseTab  records={staffRecs}      onSubmitted={handleSubmitted} />}
            {tab === 'allergen'  && <AllergenTab   allergenRecords={allergenRecs} onSubmitted={handleSubmitted} />}
          </>
        )}

      </div>
    </div>
  )
}
