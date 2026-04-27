/**
 * lib/haccp-alarm-status.ts
 *
 * Shared overdue detection logic for HACCP alarms.
 * Used by:
 * - /api/cron/haccp-alarm (server — determines what to send push for)
 * - hooks/useHACCPAlarm.ts (client — drives in-app Web Audio beeps)
 *
 * Items that trigger alarms (time-critical daily operational checks):
 * - Cold storage AM / PM temp
 * - Process room AM / PM temp
 * - Daily diary opening / closing check
 * - Unresolved corrective actions
 *
 * Items that do NOT trigger alarms (visual only):
 * - Weekly review overdue
 * - Monthly review overdue
 * - Training refresh overdue
 */

export interface OverdueItem {
  key:   string
  label: string
}

export interface AlarmLevel {
  beepCount: number
  volume:    number   // 0.0 – 1.0
  frequency: number   // Hz
}

/**
 * Extracts overdue items from the HACCP status object.
 * Works with the same shape returned by the HACCP homepage status API.
 */
export function getOverdueItems(status: {
  cold_storage?:    { am_overdue?: boolean; pm_overdue?: boolean }
  processing_room?: { am_overdue?: boolean; pm_overdue?: boolean }
  daily_diary?:     { opening_overdue?: boolean; closing_overdue?: boolean }
  unresolved_cas?:  number
}): OverdueItem[] {
  const items: OverdueItem[] = []

  if (status.cold_storage?.am_overdue)
    items.push({ key: 'cold_am',       label: 'Cold storage AM temp' })
  if (status.cold_storage?.pm_overdue)
    items.push({ key: 'cold_pm',       label: 'Cold storage PM temp' })
  if (status.processing_room?.am_overdue)
    items.push({ key: 'process_am',    label: 'Process room AM temp' })
  if (status.processing_room?.pm_overdue)
    items.push({ key: 'process_pm',    label: 'Process room PM temp' })
  if (status.daily_diary?.opening_overdue)
    items.push({ key: 'diary_open',    label: 'Diary opening check' })
  if (status.daily_diary?.closing_overdue)
    items.push({ key: 'diary_close',   label: 'Diary closing check' })

  const cas = status.unresolved_cas ?? 0
  if (cas > 0)
    items.push({
      key:   'unresolved_ca',
      label: `${cas} unresolved corrective action${cas > 1 ? 's' : ''}`,
    })

  return items
}

/**
 * Returns the alarm level for in-app Web Audio beeps.
 * Escalates with each 5-minute interval.
 */
export function getAlarmLevel(notificationCount: number): AlarmLevel {
  if (notificationCount <= 1) return { beepCount: 2, volume: 0.7, frequency: 880  }
  if (notificationCount === 2) return { beepCount: 3, volume: 0.85, frequency: 880  }
  if (notificationCount === 3) return { beepCount: 4, volume: 0.95, frequency: 1100 }
  if (notificationCount === 4) return { beepCount: 5, volume: 1.0, frequency: 1100 }
  return                               { beepCount: 5, volume: 1.0, frequency: 1320 }
}

/**
 * Builds the push notification title and body text.
 * Text escalates urgency with each consecutive notification.
 */
export function getNotificationText(
  items: OverdueItem[],
  count: number,
): { title: string; body: string } {
  const icon    = count === 1 ? '⚠️' : count === 2 ? '🚨' : count === 3 ? '🔴' : '🆘'
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

/**
 * Returns a stable hash key for the current set of overdue items.
 * Used to detect when overdue state changes (new session vs continuation).
 */
export function getOverdueKey(items: OverdueItem[]): string {
  return items.map(i => i.key).sort().join('|')
}
