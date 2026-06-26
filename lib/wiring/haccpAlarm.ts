/**
 * lib/wiring/haccpAlarm.ts — composition root for the HACCP overdue-alarm cron
 * use-case (F-25)
 *
 * The ONE business-layer file where `runHaccpAlarmCheck` is bolted to its four
 * concrete seams (same F-TD-11 rule: only composition roots import from
 * `@/lib/adapters/*`), pinned by `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * SERVICE-ROLE SINGLETONS. The `push_subscriptions` + `alarm_sessions` tables
 * are service-role-only by RLS, and the reporting reads run as service-role
 * today — exactly the access the cron has now, so the re-point is byte-identical.
 *   - subscriptions  → supabasePushSubscriptionsRepository (master key)
 *   - alarmSessions  → supabaseAlarmSessionsRepository    (master key)
 *   - reporting      → haccpReportingService              (the existing F-19 PR7
 *                       service-role singleton; we only call its new
 *                       getAlarmOverdueStatus(now) method)
 *   - pushSender     → pushSender (the web-push singleton, lib/wiring/pushSender)
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the push vendor = one
 * new adapter + one edit to lib/wiring/pushSender.ts; swapping the DB for either
 * table = one new adapter each + their wiring lines here. The cron route, the
 * use-case, the service, the domain and the ports never change.
 */
import {
  createRunHaccpAlarmCheck,
  type RunHaccpAlarmCheck,
} from "@/lib/usecases/runHaccpAlarmCheck";
import {
  supabasePushSubscriptionsRepository,
  supabaseAlarmSessionsRepository,
} from "@/lib/adapters/supabase";
import { haccpReportingService } from "@/lib/wiring/haccp";
import { pushSender } from "@/lib/wiring/pushSender";

export const runHaccpAlarmCheck: RunHaccpAlarmCheck = createRunHaccpAlarmCheck({
  reporting: haccpReportingService,
  subscriptions: supabasePushSubscriptionsRepository,
  alarmSessions: supabaseAlarmSessionsRepository,
  pushSender,
});
