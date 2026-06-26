/**
 * lib/wiring/pushSender.ts — composition root for the PushSender port (F-25)
 *
 * The ONE business-layer file where the PushSender port is bolted to its
 * concrete web-push adapter (same F-TD-11 rule as the other wiring files: only
 * composition roots import from `@/lib/adapters/*`), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the push vendor =
 * one new adapter folder (`lib/adapters/<vendor>/`) + one edit to THIS file.
 * The cron usecase, the vapid-key route, the subscribe route, the port and the
 * owned types never change.
 *
 * This file is a parts list, not logic. The adapter reads VAPID_* env vars
 * lazily on the first send (never at import) — so importing this module triggers
 * no network and reads no key at startup. `getPublicKey()`'s throw (when
 * VAPID_PUBLIC_KEY is unset) is what the vapid-key route maps to 503.
 */
import { createWebPushSender } from "@/lib/adapters/web-push";
import type { PushSender } from "@/lib/ports";

export const pushSender: PushSender = createWebPushSender();
