/**
 * lib/utils/defaultDateAndTime.ts
 *
 * Extracted pure function from app/routes/page.tsx so it can be
 * unit-tested without spinning up a React component tree.
 */

export function getDefaultDateAndTime(now: Date = new Date()): {
  date: string
  time: string
} {
  const before10 = now.getHours() < 10
  const date = new Date(now)
  if (!before10) date.setDate(date.getDate() + 1)
  // en-CA gives YYYY-MM-DD in local time — toISOString() would shift by UTC offset
  return { date: date.toLocaleDateString('en-CA'), time: '10:00' }
}
