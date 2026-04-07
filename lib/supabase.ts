/**
 * lib/supabase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single shared Supabase service-role client for all API routes.
 *
 * Uses the service role key — bypasses RLS. Never import this in client
 * components. It is only safe for use in Next.js route handlers (server-only).
 *
 * Centralised here so the key rotation or URL change needs only one edit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'

export const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
