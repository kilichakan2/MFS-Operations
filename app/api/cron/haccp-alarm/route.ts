/*
 * app/api/cron/haccp-alarm/route.ts
 *
 * Vercel cron: runs every 5 minutes, 8am-4pm UTC
 * (= 9am-5pm BST in summer, 8am-4pm GMT in winter)
 *
 * Cron schedule in vercel.json: every-5-mins 8-16 every-day
 *
 * Flow:
 * 1. Check current HACCP overdue status
 * 2. If nothing overdue: resolve any active alarm sessions, stop
 * 3. If overdue: for each push subscription, send/escalate notification
 * 4. Clean up expired subscriptions (410/404 from push service)
 */

import { NextRequest, NextResponse }    from 'next/server'
import { supabaseService }              from '@/lib/supabase'
import { sendPushNotification }         from '@/lib/webpush'
import { getOverdueItems, getNotificationText, getOverdueKey } from '@/lib/haccp-alarm-status'

const supabase = supabaseService

function todayUK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}
function getMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

async function getOverdueStatus() {
  const today   = todayUK()
  const nowHour = new Date().getHours()

  const [cold, room, diary, ccas] = await Promise.all([
    supabase.from('haccp_cold_storage_temps').select('session').eq('date', today),
    supabase.from('haccp_processing_temps').select('session').eq('date', today),
    supabase.from('haccp_daily_diary').select('phase').eq('date', today),
    supabase.from('haccp_corrective_actions').select('id').eq('resolved', false),
  ])

  const coldSessions = (cold.data ?? []).map((r) => r.session as string)
  const roomSessions = (room.data ?? []).map((r) => r.session as string)
  const phases       = (diary.data ?? []).map((r) => r.phase as string)

  return {
    cold_storage: {
      am_overdue: !coldSessions.includes('AM') && nowHour >= 10,
      pm_overdue: !coldSessions.includes('PM') && nowHour >= 14,
    },
    processing_room: {
      am_overdue: !roomSessions.includes('AM') && nowHour >= 10,
      pm_overdue: !roomSessions.includes('PM') && nowHour >= 14,
    },
    daily_diary: {
      opening_overdue: !phases.includes('opening') && nowHour >= 10,
      closing_overdue: !phases.includes('closing') && nowHour >= 17,
    },
    unresolved_cas: (ccas.data ?? []).length,
  }
}

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel cron request
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const status      = await getOverdueStatus()
    const overdueItems = getOverdueItems(status)
    const overdueKey   = getOverdueKey(overdueItems)

    // Fetch all active push subscriptions
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, overdue: overdueItems.length })
    }

    if (overdueItems.length === 0) {
      // Nothing overdue — resolve all active alarm sessions
      await supabase
        .from('alarm_sessions')
        .update({ resolved_at: new Date().toISOString() })
        .is('resolved_at', null)
      return NextResponse.json({ ok: true, sent: 0, overdue: 0 })
    }

    // Process each subscription
    let sent = 0
    const expiredEndpoints: string[] = []

    for (const sub of subscriptions) {
      // Find or create alarm session for this subscription + overdue key
      const { data: existing } = await supabase
        .from('alarm_sessions')
        .select('id, notification_count')
        .eq('subscription_id', sub.id)
        .eq('overdue_key', overdueKey)
        .is('resolved_at', null)
        .single()

      let count = 1
      let sessionId: string

      if (existing) {
        count     = (existing.notification_count ?? 0) + 1
        sessionId = existing.id
      } else {
        // New overdue session for this subscription
        const { data: newSession } = await supabase
          .from('alarm_sessions')
          .insert({ subscription_id: sub.id, overdue_key: overdueKey, notification_count: 0 })
          .select('id')
          .single()
        sessionId = newSession?.id ?? ''
      }

      // Send one notification per overdue item — each fires a separate alert sound
      let subFailed = false
      for (const item of overdueItems) {
        const { title, body } = getNotificationText([item], count)
        const success = await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          { title, body, url: '/haccp', tag: `haccp-${item.key}`, requireInteraction: true },
        )
        if (success) {
          sent++
        } else {
          subFailed = true
          break  // subscription dead — no point sending more to it
        }
      }

      if (subFailed) {
        expiredEndpoints.push(sub.endpoint)
      } else {
        // Update alarm session count after all items sent
        if (sessionId) {
          await supabase
            .from('alarm_sessions')
            .update({ notification_count: count, last_sent_at: new Date().toISOString() })
            .eq('id', sessionId)
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints)
    }

    console.log(`[haccp-alarm] Overdue: ${overdueItems.length}, Sent: ${sent}/${subscriptions.length}`)
    return NextResponse.json({ ok: true, sent, overdue: overdueItems.length })

  } catch (err) {
    console.error('[GET /api/cron/haccp-alarm]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
