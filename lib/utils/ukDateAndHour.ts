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
