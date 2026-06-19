export const dynamic = 'force-dynamic'

/**
 * GET    /api/pricing/[id]   — fetch single agreement with lines
 * PATCH  /api/pricing/[id]   — update header fields or status
 *   Body: { status?, valid_from?, valid_until?, notes?, customer_id?, prospect_name? }
 *   Access: sales can only edit own agreements; office/admin can edit any
 *   Status validation: only 'draft'|'active'|'cancelled' accepted (expired is computed)
 * DELETE /api/pricing/[id]   — delete agreement
 *   Access: admin can delete any; sales/office can delete own drafts only
 *
 * F-15 PR2: re-pointed through `pricingService` + the `pricingActivationEmail`
 * use-case. No direct @supabase import. Responses stay byte-identical — the
 * dto helpers (lib/api/pricing/dto.ts) reproduce the snake_case wire shapes.
 * The service throws ServiceError on DB failure; each call is wrapped to
 * reproduce today's exact status code + log line (incl. the GET DB-error→404
 * and the RBAC owner-read error→403 swallow, F-TD-24).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendPricingEmail }          from '@/lib/pricing-email'
import { pricingService, pricingActivationEmail } from '@/lib/wiring/pricing'
import { toAgreementWireDto, toPricingEmailData } from '@/lib/api/pricing/dto'
import type { UpdateAgreementInput, AgreementStatus } from '@/lib/domain'

const ALLOWED_ROLES  = ['sales', 'office', 'admin']
const VALID_STATUSES = ['draft', 'active', 'cancelled'] as const

type Params = { params: Promise<{ id: string }> }

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // Today: `if (error || !data) return 404` — a DB error also surfaced as 404.
  // The service throws on DB failure, so catch it and reproduce the 404.
  let agreement
  try {
    agreement = await pricingService.getAgreementById(id)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!agreement) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(toAgreementWireDto(agreement))
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  let body: Record<string, unknown> | null = null
  try { body = await req.json() } catch { /**/ }
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Validate status if provided — cannot set to 'expired' via API
  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  // Access control: sales can only edit their own agreements
  const isAdmin   = role === 'admin'
  const isManager = role === 'office' || isAdmin

  if (!isManager) {
    // Today the owner pre-check ignored the DB error (`const { data: own }`),
    // so a DB hiccup → undefined → 403. Reproduce that swallow (F-TD-24).
    let owner
    try {
      owner = await pricingService.getAgreementOwner(id)
    } catch {
      owner = null
    }
    if (!owner || owner.agreedBy !== userId) {
      return NextResponse.json({ error: 'Not authorised to edit this agreement' }, { status: 403 })
    }
  }

  // Build the patch from the 6 PATCH-able fields, keeping the '' → null
  // normalisation in the route (matches today's field loop). Only keys
  // present in the body are set, so the adapter's `"x" in patch` checks fire
  // exactly as today's column loop did.
  const patch: {
    status?: AgreementStatus
    validFrom?: string
    validUntil?: string | null
    notes?: string | null
    customerId?: string | null
    prospectName?: string | null
  } = {}
  const norm = (v: unknown) => (v === '' ? null : v)
  if ('status' in body)        patch.status       = norm(body.status) as AgreementStatus
  if ('valid_from' in body)    patch.validFrom    = norm(body.valid_from) as string
  if ('valid_until' in body)   patch.validUntil   = norm(body.valid_until) as string | null
  if ('notes' in body)         patch.notes        = norm(body.notes) as string | null
  if ('customer_id' in body)   patch.customerId   = norm(body.customer_id) as string | null
  if ('prospect_name' in body) patch.prospectName = norm(body.prospect_name) as string | null

  let patched
  try {
    patched = await pricingService.updateAgreement(id, patch as UpdateAgreementInput)
  } catch (err) {
    console.error('[pricing PATCH]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  if (!patched) {
    console.error('[pricing PATCH]', undefined)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  console.log(`[pricing PATCH] ${patched.referenceNumber} → ${patched.status}`)

  // Fire email when agreement is activated — await before returning (no fire-and-forget in serverless)
  if (patched.status === 'active') {
    try {
      const result = await pricingActivationEmail.resolveActivationEmail(id)
      if (result) {
        await sendPricingEmail(
          toPricingEmailData(result.agreement),
          result.recipients,
        ).catch(err => console.error('[pricing PATCH] email error:', err))
      }
    } catch (err) {
      console.error('[pricing PATCH] failed to fetch full agreement for email:', err)
    }
  }

  return NextResponse.json({
    id:               patched.id,
    reference_number: patched.referenceNumber,
    status:           patched.status,
    updated_at:       patched.updatedAt,
  })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const userId = req.headers.get('x-mfs-user-id')
  const role   = req.headers.get('x-mfs-user-role') ?? ''
  if (!userId || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  // Fetch owner + status to check ownership. Today this ignored the DB error
  // (`const { data: agreement }`), so a DB hiccup → undefined → 404. Reproduce.
  let owner
  try {
    owner = await pricingService.getAgreementOwner(id)
  } catch {
    owner = null
  }
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = role === 'admin'
  const isOwner = owner.agreedBy === userId

  // Non-admins can only delete own drafts
  if (!isAdmin && (!isOwner || owner.status !== 'draft')) {
    return NextResponse.json(
      { error: 'Only admins can delete active/cancelled agreements, or agreements not owned by you' },
      { status: 403 }
    )
  }

  try {
    await pricingService.deleteAgreement(id)
  } catch (err) {
    console.error('[pricing DELETE]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  // Decision R5 (accepted): getAgreementOwner returns no reference_number, so
  // the log line drops the ref (log-only, non-wire change). F-TD-24-adjacent.
  console.log(`[pricing DELETE] deleted by ${userId}`)
  return NextResponse.json({ deleted: true })
}
