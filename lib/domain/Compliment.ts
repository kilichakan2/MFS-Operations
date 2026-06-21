/**
 * lib/domain/Compliment.ts
 *
 * App-owned Compliment domain types (F-17). Pure TypeScript — no framework
 * imports, no vendor imports. The database's snake_case spelling
 * (posted_by, recipient_id, created_at) never appears here; the Supabase
 * adapter maps it to these camelCase fields and the rest of the app only
 * ever sees these shapes (ADR-0002).
 *
 * PR2 maps these camelCase fields back to the snake_case keys the
 * front-end currently receives (posted_by_id, posted_by_name, …), so the
 * wire output is unchanged.
 */

/** A compliments row with poster + recipient joins resolved (compliments GET/POST). */
export interface Compliment {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly postedById: string | null; // poster.id ?? null
  readonly postedByName: string; // poster.name ?? 'Unknown'
  readonly recipientId: string | null; // recipient.id ?? null
  readonly recipientName: string | null; // recipient.name ?? null
}

/** An active user for the recipient dropdown (compliments/users GET). */
export interface ComplimentRecipient {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export interface CreateComplimentInput {
  readonly body: string;
  readonly postedBy: string; // x-mfs-user-id
  readonly recipientId: string | null;
}
