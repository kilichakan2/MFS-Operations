/**
 * lib/utils/ukDateAndHour.ts
 *
 * Extracted from app/api/routes/today/route.ts so it can be
 * unit-tested without a running Next.js server.
 *
 * Returns the current date string (YYYY-MM-DD) and hour (0-23)
 * in Europe/London local time — handles GMT/BST automatically.
 */

export function getUKDateAndHour(now: Date = new Date()): {
  dateStr: string
  hour: number
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:  'Europe/London',
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
    hour:      'numeric',
    hour12:    false,
  }).formatToParts(now)

  const get = (type: string) => parts.find(p => p.type === type)!.value
  // en-GB gives DD/MM/YYYY parts — reassemble to YYYY-MM-DD
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`
  const hour    = parseInt(get('hour'), 10)
  return { dateStr, hour }
}

/**
 * Given a UK date string and hour, compute the effectiveMinDate
 * for the driver route query (7PM rollover).
 */
export function getEffectiveMinDate(
  dateStr: string,
  hour: number
): string {
  if (hour >= 19) {
    const tomorrow = new Date(dateStr + 'T12:00:00')
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toLocaleDateString('en-CA')
  }
  return dateStr
}

/**
 * The current UK week's Monday–Sunday bounds as YYYY-MM-DD strings.
 *
 * Lifted verbatim from app/api/admin/runs/route.ts (F-14) so it sits
 * beside its UK-time siblings and gets unit tests. "This week" means
 * Monday-start, not a rolling 7 days. Accepts an optional `now` so the
 * boundary is testable with a fixed clock.
 */
export function getUKWeekBounds(now: Date = new Date()): {
  from: string
  to: string
} {
  const ukDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const d = new Date(ukDateStr + 'T12:00:00')
  const day = d.getDay() // 0=Sun … 6=Sat
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((day + 6) % 7))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return {
    from: mon.toLocaleDateString('en-CA'),
    to: sun.toLocaleDateString('en-CA'),
  }
}
