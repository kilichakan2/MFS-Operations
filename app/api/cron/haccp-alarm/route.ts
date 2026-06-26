/*
 * app/api/cron/haccp-alarm/route.ts
 *
 * Vercel cron: runs every 5 minutes, 8am-4pm UTC
 * (= 9am-5pm BST in summer, 8am-4pm GMT in winter)
 *
 * Cron schedule in vercel.json: every-5-mins 8-16 every-day
 * (NOTE: the cron is not currently registered in vercel.json — tracked as
 * BACKLOG F-PROD-03; F-25 is behaviour-preserving and does NOT change whether
 * it fires.)
 *
 * Flow:
 * 1. Check current HACCP overdue status
 * 2. If nothing overdue: resolve any active alarm sessions, stop
 * 3. If overdue: for each push subscription, send/escalate notification
 * 4. Clean up expired subscriptions (410/404 from push service)
 *
 * F-25 — re-pointed behind the `runHaccpAlarmCheck` use-case: the route now
 * imports ZERO adapters and ZERO vendor SDKs. The Bearer/CRON_SECRET 401 guard
 * + the outer-catch 500 stay in the route VERBATIM; everything else (the overdue
 * read, the escalation/cleanup loop, the `[haccp-alarm] …` log) lives in the
 * use-case BYTE-IDENTICALLY.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runHaccpAlarmCheck } from '@/lib/wiring/haccpAlarm'

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel cron request
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const result = await runHaccpAlarmCheck.run(new Date())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/cron/haccp-alarm]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
