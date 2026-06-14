/**
 * lib/wiring/dbToken.ts
 *
 * Composition root (F-TD-11 rule) for the DbTokenMinter port (F-RLS-03).
 * The ONE place the `SUPABASE_JWT_SECRET` env var is read — via a lazy
 * getter, so the import graph loads with no env set (matches the lazy
 * Supabase client + SessionTokens patterns). The minter adapter and any
 * future route never read `process.env` directly.
 *
 * `SUPABASE_JWT_SECRET` is the Supabase project's JWT signing secret —
 * server-side ONLY, never `NEXT_PUBLIC_`. Tokens minted with it are
 * short-lived and never sent to the browser.
 */

import { createWebCryptoDbTokenMinter } from "@/lib/adapters/web-crypto";
import type { DbTokenMinter } from "@/lib/ports";

export const dbTokenMinter: DbTokenMinter = createWebCryptoDbTokenMinter({
  getSecret: () => process.env.SUPABASE_JWT_SECRET,
});
