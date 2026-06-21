/**
 * lib/api/compliments/dto.ts
 *
 * DTO translators: the Compliment domain shapes (camelCase) → the EXACT
 * snake_case wire shapes the compliments screen reads today (F-17 PR2). Pure
 * functions, no I/O, unit-tested key-for-key AND key-order — these are the
 * wire-compat tripwire for the route re-point.
 *
 * Key ORDER is load-bearing: NextResponse.json serialises object keys in
 * insertion order, so the order below must match each route's current response
 * literal verbatim (app/api/compliments/route.ts GET lines 37–45 / POST lines
 * 92–100, app/api/compliments/users/route.ts).
 *
 * Defaults (`posted_by_name: 'Unknown'`, `recipient_name: null`) are baked into
 * the domain by the Supabase adapter — these translators do a STRAIGHT field
 * copy and do NOT re-apply them (the adapter owns the default; re-defaulting
 * here would double-handle). Import domain types only (ADR-0002).
 */
import type { Compliment, ComplimentRecipient } from "@/lib/domain";

// ─── Wire shapes (what the compliments screen was built to read) ──

/** A compliment in the GET `compliments` array / the POST `compliment` echo. */
export interface ComplimentDto {
  id: string;
  body: string;
  created_at: string;
  posted_by_id: string | null;
  posted_by_name: string;
  recipient_id: string | null;
  recipient_name: string | null;
}

/** An active user for the recipient dropdown (`compliments/users` GET). */
export interface RecipientDto {
  id: string;
  name: string;
  role: string;
}

// ─── Translators ─────────────────────────────────────────────

/**
 * A Compliment → the snake_case wire object. Used by BOTH the GET (mapped over
 * the array → `{ compliments: [...] }`) and the POST (single → `{ compliment }`)
 * — the route literals are identical. Key order = the route's literal order
 * (id, body, created_at, posted_by_id, posted_by_name, recipient_id,
 * recipient_name). Straight field copy: defaults already baked in by the adapter.
 */
export function toComplimentWireDto(c: Compliment): ComplimentDto {
  return {
    id: c.id,
    body: c.body,
    created_at: c.createdAt,
    posted_by_id: c.postedById,
    posted_by_name: c.postedByName,
    recipient_id: c.recipientId,
    recipient_name: c.recipientName,
  };
}

/**
 * A ComplimentRecipient → the recipient-dropdown wire row. Straight
 * pass-through (the domain shape is already `{ id, name, role }`); the route
 * echoed the raw `users` rows in that column order.
 */
export function toRecipientWireDto(r: ComplimentRecipient): RecipientDto {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
  };
}
