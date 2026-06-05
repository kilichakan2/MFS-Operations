/**
 * lib/dates.ts
 *
 * Timezone-correct date helpers for the API surface.
 *
 * The codebase historically derived "today" via
 * `new Date().toISOString().split('T')[0]`, which returns a UTC date
 * string. UK operations run on Europe/London (GMT in winter, BST in
 * summer), so once UK local crosses midnight while UTC is still on
 * the prior day, every "today" filter built on the UTC string drops
 * the last hour(s) of UK-local-today's data — orders, pricing
 * agreement validity, etc. Use `londonToday()` instead.
 */

/**
 * Returns today's date as ISO YYYY-MM-DD in Europe/London — for
 * comparison against `date`-typed columns in the DB. Use this
 * everywhere the previous code did
 * `now.toISOString().split('T')[0]` for date filtering.
 *
 * Intl.DateTimeFormat handles GMT/BST transitions automatically.
 * The `en-CA` locale outputs YYYY-MM-DD by default, which is the
 * exact shape the date columns and Supabase `.eq()` filters expect.
 *
 * @param now Defaults to the current instant. Tests pass explicit
 *            Date instances so no fake-timer plumbing is required.
 */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).format(now)
}
