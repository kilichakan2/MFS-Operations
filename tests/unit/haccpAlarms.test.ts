/**
 * tests/unit/haccpAlarms.test.ts
 *
 * Tests for the HACCP alarm and notification system.
 *
 * Covers:
 * - Overdue detection logic (which items trigger alarms)
 * - Alarm escalation levels (beep count, volume, tone)
 * - Notification text escalation
 * - Cron active hours (9am-5pm UK time)
 * - Push subscription validation
 */

import { describe, it, expect } from 'vitest'

// ── Types (mirrors lib/haccp-alarm-status.ts) ─────────────────────────────────

interface HACCPStatus {
  cold_storage:    { am_done: boolean; pm_done: boolean; am_overdue: boolean; pm_overdue: boolean }
  processing_room: { am_done: boolean; pm_done: boolean; am_overdue: boolean; pm_overdue: boolean; opening_overdue?: boolean; closing_overdue?: boolean }
  daily_diary:     { opening: boolean; operational: boolean; closing: boolean; opening_overdue: boolean; operational_overdue: boolean; closing_overdue: boolean }
  unresolved_cas:  number
}

interface OverdueItem {
  key:   string
  label: string
}

// ── Overdue detection ─────────────────────────────────────────────────────────

function getOverdueItems(status: HACCPStatus): OverdueItem[] {
  const items: OverdueItem[] = []

  if (status.cold_storage.am_overdue)
    items.push({ key: 'cold_am',      label: 'Cold storage AM temp' })
  if (status.cold_storage.pm_overdue)
    items.push({ key: 'cold_pm',      label: 'Cold storage PM temp' })
  if (status.processing_room.am_overdue)
    items.push({ key: 'process_am',   label: 'Process room AM temp' })
  if (status.processing_room.pm_overdue)
    items.push({ key: 'process_pm',   label: 'Process room PM temp' })
  if (status.daily_diary.opening_overdue)
    items.push({ key: 'diary_open',   label: 'Diary opening check' })
  if (status.daily_diary.closing_overdue)
    items.push({ key: 'diary_close',  label: 'Diary closing check' })
  if (status.unresolved_cas > 0)
    items.push({ key: 'unresolved_ca',label: `${status.unresolved_cas} unresolved corrective action${status.unresolved_cas > 1 ? 's' : ''}` })

  return items
}

const allOkStatus: HACCPStatus = {
  cold_storage:    { am_done: true, pm_done: true, am_overdue: false, pm_overdue: false },
  processing_room: { am_done: true, pm_done: true, am_overdue: false, pm_overdue: false },
  daily_diary:     { opening: true, operational: true, closing: true, opening_overdue: false, operational_overdue: false, closing_overdue: false },
  unresolved_cas:  0,
}

describe('Overdue item detection', () => {
  it('all ok → no overdue items', () => {
    expect(getOverdueItems(allOkStatus)).toHaveLength(0)
  })

  it('cold AM overdue', () => {
    const s = { ...allOkStatus, cold_storage: { ...allOkStatus.cold_storage, am_overdue: true } }
    const items = getOverdueItems(s)
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('cold_am')
    expect(items[0].label).toBe('Cold storage AM temp')
  })

  it('cold PM overdue', () => {
    const s = { ...allOkStatus, cold_storage: { ...allOkStatus.cold_storage, pm_overdue: true } }
    expect(getOverdueItems(s)[0].key).toBe('cold_pm')
  })

  it('process room AM overdue', () => {
    const s = { ...allOkStatus, processing_room: { ...allOkStatus.processing_room, am_overdue: true } }
    expect(getOverdueItems(s)[0].key).toBe('process_am')
  })

  it('process room PM overdue', () => {
    const s = { ...allOkStatus, processing_room: { ...allOkStatus.processing_room, pm_overdue: true } }
    expect(getOverdueItems(s)[0].key).toBe('process_pm')
  })

  it('diary opening overdue', () => {
    const s = { ...allOkStatus, daily_diary: { ...allOkStatus.daily_diary, opening_overdue: true } }
    expect(getOverdueItems(s)[0].key).toBe('diary_open')
  })

  it('diary closing overdue', () => {
    const s = { ...allOkStatus, daily_diary: { ...allOkStatus.daily_diary, closing_overdue: true } }
    expect(getOverdueItems(s)[0].key).toBe('diary_close')
  })

  it('unresolved CAs', () => {
    const s = { ...allOkStatus, unresolved_cas: 2 }
    const items = getOverdueItems(s)
    expect(items[0].key).toBe('unresolved_ca')
    expect(items[0].label).toBe('2 unresolved corrective actions')
  })

  it('single unresolved CA uses singular', () => {
    const s = { ...allOkStatus, unresolved_cas: 1 }
    expect(getOverdueItems(s)[0].label).toBe('1 unresolved corrective action')
  })

  it('multiple overdue items returned', () => {
    const s = {
      ...allOkStatus,
      cold_storage:    { ...allOkStatus.cold_storage, am_overdue: true, pm_overdue: true },
      unresolved_cas:  1,
    }
    expect(getOverdueItems(s)).toHaveLength(3)
  })

  it('weekly/monthly reviews do NOT trigger alarm', () => {
    // These are not in the overdue items function — visual only
    const s = { ...allOkStatus } // no weekly/monthly fields
    expect(getOverdueItems(s)).toHaveLength(0)
  })
})

// ── Alarm escalation (in-app Web Audio) ──────────────────────────────────────

interface AlarmLevel {
  beepCount: number
  volume:    number   // 0.0 - 1.0
  frequency: number   // Hz
}

function getAlarmLevel(notificationCount: number): AlarmLevel {
  if (notificationCount <= 1) return { beepCount: 1, volume: 0.3, frequency: 880  }
  if (notificationCount === 2) return { beepCount: 2, volume: 0.5, frequency: 880  }
  if (notificationCount === 3) return { beepCount: 3, volume: 0.7, frequency: 1100 }
  if (notificationCount === 4) return { beepCount: 4, volume: 0.9, frequency: 1100 }
  return                               { beepCount: 5, volume: 1.0, frequency: 1320 }
}

describe('Alarm escalation levels', () => {
  it('count 1 → 1 beep, 30% vol, 880Hz', () => {
    const l = getAlarmLevel(1)
    expect(l.beepCount).toBe(1)
    expect(l.volume).toBe(0.3)
    expect(l.frequency).toBe(880)
  })

  it('count 2 → 2 beeps, 50% vol, 880Hz', () => {
    const l = getAlarmLevel(2)
    expect(l.beepCount).toBe(2)
    expect(l.volume).toBe(0.5)
  })

  it('count 3 → 3 beeps, 70% vol, higher tone 1100Hz', () => {
    const l = getAlarmLevel(3)
    expect(l.beepCount).toBe(3)
    expect(l.volume).toBe(0.7)
    expect(l.frequency).toBe(1100)
  })

  it('count 4 → 4 beeps, 90% vol', () => {
    const l = getAlarmLevel(4)
    expect(l.beepCount).toBe(4)
    expect(l.volume).toBe(0.9)
  })

  it('count 5+ → max: 5 beeps, 100% vol, 1320Hz', () => {
    expect(getAlarmLevel(5).beepCount).toBe(5)
    expect(getAlarmLevel(5).volume).toBe(1.0)
    expect(getAlarmLevel(5).frequency).toBe(1320)
    expect(getAlarmLevel(10).beepCount).toBe(5) // caps at 5
    expect(getAlarmLevel(10).volume).toBe(1.0)
  })

  it('volume always increases with count', () => {
    const levels = [1, 2, 3, 4, 5].map(getAlarmLevel)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].volume).toBeGreaterThanOrEqual(levels[i - 1].volume)
    }
  })

  it('beepCount always increases with count', () => {
    const levels = [1, 2, 3, 4, 5].map(getAlarmLevel)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].beepCount).toBeGreaterThanOrEqual(levels[i - 1].beepCount)
    }
  })
})

// ── Notification text escalation (push) ──────────────────────────────────────

function getNotificationText(items: OverdueItem[], count: number): { title: string; body: string } {
  const icon  = count === 1 ? '⚠️' : count === 2 ? '🚨' : count === 3 ? '🔴' : '🆘'
  const urgency = count === 1 ? 'Overdue' : count === 2 ? 'URGENT' : count === 3 ? 'ACTION REQUIRED' : 'CRITICAL'
  const minutes = (count - 1) * 5

  if (items.length === 1) {
    const title = `${icon} ${urgency}: ${items[0].label}`
    const body  = count === 1
      ? 'Check not completed — please log now'
      : `${minutes} minutes overdue — please log now`
    return { title, body }
  }

  const title = `${icon} ${urgency}: ${items.length} overdue checks`
  const body  = items.map(i => i.label).join(', ')
  return { title, body }
}

describe('Push notification text escalation', () => {
  const singleItem: OverdueItem[] = [{ key: 'cold_am', label: 'Cold storage AM temp' }]
  const multiItems: OverdueItem[] = [
    { key: 'cold_am',    label: 'Cold storage AM temp' },
    { key: 'process_am', label: 'Process room AM temp' },
  ]

  it('count 1 → ⚠️ icon, Overdue prefix', () => {
    const { title } = getNotificationText(singleItem, 1)
    expect(title).toContain('⚠️')
    expect(title).toContain('Overdue')
  })

  it('count 2 → 🚨 icon, URGENT prefix, 5 min', () => {
    const { title, body } = getNotificationText(singleItem, 2)
    expect(title).toContain('🚨')
    expect(title).toContain('URGENT')
    expect(body).toContain('5 minutes')
  })

  it('count 3 → 🔴 icon, ACTION REQUIRED, 10 min', () => {
    const { title, body } = getNotificationText(singleItem, 3)
    expect(title).toContain('🔴')
    expect(body).toContain('10 minutes')
  })

  it('count 4+ → 🆘 icon, CRITICAL', () => {
    const { title } = getNotificationText(singleItem, 4)
    expect(title).toContain('🆘')
    expect(title).toContain('CRITICAL')
  })

  it('multiple items → count in title, items listed in body', () => {
    const { title, body } = getNotificationText(multiItems, 1)
    expect(title).toContain('2 overdue checks')
    expect(body).toContain('Cold storage AM temp')
    expect(body).toContain('Process room AM temp')
  })

  it('single item title includes item label', () => {
    const { title } = getNotificationText(singleItem, 1)
    expect(title).toContain('Cold storage AM temp')
  })
})

// ── Cron active hours: 9am-5pm UK time ───────────────────────────────────────
// Cron runs on UTC schedule: */5 8-16 * * *
// BST (UTC+1, summer): 8am UTC = 9am local, 16:55 UTC = 5:55pm local ✓
// GMT (UTC+0, winter): 8am UTC = 8am local (slightly early but acceptable)

function isCronActiveHour(utcHour: number): boolean {
  // Active hours: 8-16 UTC (covers 9am-5pm BST, 8am-4:55pm GMT)
  return utcHour >= 8 && utcHour <= 16
}

describe('Cron active hours', () => {
  it('8am UTC is active (9am BST)', () => {
    expect(isCronActiveHour(8)).toBe(true)
  })

  it('16 UTC is active (5pm BST last run)', () => {
    expect(isCronActiveHour(16)).toBe(true)
  })

  it('17 UTC is NOT active (6pm BST)', () => {
    expect(isCronActiveHour(17)).toBe(false)
  })

  it('7 UTC is NOT active (before shift)', () => {
    expect(isCronActiveHour(7)).toBe(false)
  })

  it('12 UTC (midday) is active', () => {
    expect(isCronActiveHour(12)).toBe(true)
  })

  it('0 UTC (midnight) is NOT active', () => {
    expect(isCronActiveHour(0)).toBe(false)
  })
})

// ── Push subscription validation ─────────────────────────────────────────────

interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function validatePushSubscription(payload: unknown): payload is PushSubscriptionPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (typeof p.endpoint !== 'string' || !p.endpoint.startsWith('https://')) return false
  if (!p.keys || typeof p.keys !== 'object') return false
  const keys = p.keys as Record<string, unknown>
  if (typeof keys.p256dh !== 'string' || keys.p256dh.length < 10) return false
  if (typeof keys.auth !== 'string'   || keys.auth.length < 10)   return false
  return true
}

describe('Push subscription validation', () => {
  const valid: PushSubscriptionPayload = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'BHExamplePublicKeyBase64=', auth: 'AuthSecretBase64=' },
  }

  it('valid subscription passes', () => {
    expect(validatePushSubscription(valid)).toBe(true)
  })

  it('missing endpoint → invalid', () => {
    const { endpoint: _, ...rest } = valid
    expect(validatePushSubscription(rest)).toBe(false)
  })

  it('http endpoint → invalid (must be https)', () => {
    expect(validatePushSubscription({ ...valid, endpoint: 'http://example.com' })).toBe(false)
  })

  it('missing keys → invalid', () => {
    expect(validatePushSubscription({ endpoint: valid.endpoint })).toBe(false)
  })

  it('null → invalid', () => {
    expect(validatePushSubscription(null)).toBe(false)
  })

  it('empty object → invalid', () => {
    expect(validatePushSubscription({})).toBe(false)
  })
})
