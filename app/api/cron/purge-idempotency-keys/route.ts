/*
 * app/api/cron/purge-idempotency-keys/route.ts
 *
 * Vercel cron: runs daily at 03:00 UTC.
 * Cron schedule in vercel.json: "0 3 * * *".
 *
 * Sweeps expired rows from order_idempotency_keys (TTL hygiene, F-TD-09).
 * The DELETE lives in the Supabase adapter behind OrdersRepository
 * .purgeExpiredIdempotencyKeys — this route only does auth + delegation
 * (CLAUDE.md: app/** imports services via lib/wiring, never adapters).
 */

import { NextRequest, NextResponse } from 'next/server'
import { ordersService }             from '@/lib/wiring/orders'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const deleted = await ordersService.purgeExpiredIdempotencyKeys(new Date())
    console.log(`[purge-idempotency-keys] Deleted: ${deleted}`)
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error('[GET /api/cron/purge-idempotency-keys]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
