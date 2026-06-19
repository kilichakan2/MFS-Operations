export const dynamic = 'force-dynamic'

/**
 * POST /api/pricing/[id]/lines/replace
 *
 * Atomically replaces ALL lines on an agreement in a single Postgres
 * transaction. Either all old lines are deleted and all new lines are
 * inserted, or nothing changes. Prevents partial-save data loss.
 *
 * Body: { lines: LineInput[] }
 * Access: sales own agreements only; office/admin any.
 *
 * F-15 PR2: re-pointed through `pricingService.replaceLines` (the adapter owns
 * the atomic `replace_agreement_lines` RPC). The adapter defaults position to
 * the array index (`l.position ?? i`), matching today's route. RBAC owner-read
 * error is swallowed to a 403 (F-TD-24). The response count stays
 * `body.lines.length` to be byte-identical with today.
 *
 * F-RLS-04d: this route STAYS on the service-role `pricingService` singleton —
 * it is the ONLY pricing route NOT flipped to the per-caller authenticated
 * client. `replaceLines` calls the `replace_agreement_lines` SECURITY DEFINER
 * RPC, whose EXECUTE was deliberately REVOKED from the `authenticated` role by
 * the T3 hardening migration (20260613020000_harden_security_definer_fns.sql,
 * with an asserting post-check). Running it under the badge would 500 on a
 * permission-denied. Keeping it on service-role mirrors the E1 decision for the
 * activation-email path (a server-side back-office operation). The app-layer
 * owner check below still runs exactly as today.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pricingService }            from '@/lib/wiring/pricing'
import type { CreateLineInput, PriceUnit } from '@/lib/domain'

type Params = { params: Promise<{ id: string }> }

interface LineInput {
  product_id?:             string | null
  product_name_override?:  string | null
  price:                   number
  unit:                    'per_kg' | 'per_box'
  notes?:                  string | null
  position:                number
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agreementId } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''

  if (!userId || !['sales', 'office', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // F-RLS-04d: stays on the service-role singleton (NOT pricingServiceForCaller).
  // `replaceLines` → `replace_agreement_lines` RPC is authenticated-REVOKED by the
  // T3 hardening migration, so the badge would 500. Mirrors the email-path E1
  // decision; this route is byte-identical to current production.

  let body: { lines: LineInput[] } | null = null
  try { body = await req.json() } catch { /**/ }
  if (!body || !Array.isArray(body.lines)) {
    return NextResponse.json({ error: 'lines array required' }, { status: 400 })
  }

  // Validate each line
  for (let i = 0; i < body.lines.length; i++) {
    const l = body.lines[i]
    if (!l.price || l.price <= 0) {
      return NextResponse.json({ error: `Line ${i + 1}: price must be > 0` }, { status: 400 })
    }
    if (!l.product_id && !l.product_name_override?.trim()) {
      return NextResponse.json({ error: `Line ${i + 1}: product_id or product_name_override required` }, { status: 400 })
    }
  }

  // Access control: sales can only edit their own agreements. Today's pre-check
  // ignored the DB error → undefined → 403; reproduce that swallow (F-TD-24).
  const isManager = role === 'office' || role === 'admin'
  if (!isManager) {
    let owner
    try {
      owner = await pricingService.getAgreementOwner(agreementId)
    } catch {
      owner = null
    }
    if (!owner || owner.agreedBy !== userId) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    }
  }

  // Translate to CreateLineInput[]; the adapter applies position ?? index.
  const lines: CreateLineInput[] = body.lines.map(l => ({
    productId:           l.product_id            || null,
    productNameOverride: l.product_name_override || null,
    price:               l.price,
    unit:                (l.unit ?? 'per_kg') as PriceUnit,
    notes:               l.notes                 || null,
    position:            l.position ?? null,
  }))

  try {
    await pricingService.replaceLines(agreementId, lines)
  } catch (err) {
    console.error('[pricing lines replace]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to replace lines' }, { status: 500 })
  }

  return NextResponse.json({ replaced: true, count: body.lines.length })
}
