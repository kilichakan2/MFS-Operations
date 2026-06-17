/**
 * lib/adapters/resend/index.ts
 *
 * Barrel re-export for the Resend adapter package. Import surface:
 *   import { createResendMailer } from '@/lib/adapters/resend'
 *
 * Factory only — the ready-to-use singleton lives in `lib/wiring/mailer.ts`
 * (F-TD-11 rule: adapters/services export factories, composition roots export
 * singletons).
 */

export { createResendMailer } from "./Mailer";
