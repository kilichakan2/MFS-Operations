/**
 * lib/adapters/web-push/index.ts
 *
 * Barrel re-export for the web-push adapter package (F-25). Import surface:
 *   import { createWebPushSender } from '@/lib/adapters/web-push'
 *
 * Factory only — the production singleton lives in lib/wiring/pushSender.ts
 * (F-TD-11). This file does NOT re-export any `web-push` type — the vendor
 * stops at PushSender.ts per ADR-0002.
 */
export { createWebPushSender } from "./PushSender";
