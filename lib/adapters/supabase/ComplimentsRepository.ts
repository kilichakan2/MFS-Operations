/**
 * lib/adapters/supabase/ComplimentsRepository.ts
 *
 * Supabase implementation of `ComplimentsRepository`
 * (lib/ports/ComplimentsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the lib/adapters/supabase
 * tree at .eslintrc.json). The ONLY file that imports the vendor SDK for the
 * Compliments DB.
 *
 * Boundary discipline (ADR-0002 line 27): PostgREST row shapes are touched
 * only inside the method bodies. Vendor column names (posted_by, recipient_id,
 * created_at) are mapped to camelCase domain fields. The `.select(…)` column
 * lists are copied VERBATIM from the two compliments routes the PR2 re-point
 * will replace, so the wire output stays byte-identical.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseComplimentsRepository(client)` factory.
 *   - `supabaseComplimentsRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return empty on miss; every DB
 * failure throws ServiceError.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  Compliment,
  ComplimentRecipient,
  CreateComplimentInput,
} from "@/lib/domain";
import type { ComplimentsRepository } from "@/lib/ports";

// Select field lists copied VERBATIM from the compliments routes.

// GET + POST /api/compliments select (poster + recipient id,name joins).
const COMPLIMENT_COLS = `
      id, body, created_at,
      poster:users!compliments_posted_by_fkey(id, name),
      recipient:users!compliments_recipient_id_fkey(id, name)
    `;

// ─── coercion helpers ────────────────────────────────────────────────

/** Supabase embeds a to-one join as either an object or a 1-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── row shapes (PostgREST) ──────────────────────────────────────────

interface IdNameJoinRow {
  id: string;
  name: string;
}

interface ComplimentRow {
  id: string;
  body: string;
  created_at: string;
  poster?: IdNameJoinRow | IdNameJoinRow[] | null;
  recipient?: IdNameJoinRow | IdNameJoinRow[] | null;
}

interface RecipientRow {
  id: string;
  name: string;
  role: string;
}

// ─── row → domain mappers ────────────────────────────────────────────

function toCompliment(row: ComplimentRow): Compliment {
  const poster = one(row.poster ?? null);
  const recipient = one(row.recipient ?? null);
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    postedById: poster?.id ?? null,
    postedByName: poster?.name ?? "Unknown",
    recipientId: recipient?.id ?? null,
    recipientName: recipient?.name ?? null,
  };
}

export function createSupabaseComplimentsRepository(
  client: SupabaseClient,
): ComplimentsRepository {
  return {
    async listRecent(): Promise<readonly Compliment[]> {
      const { data, error } = await client
        .from("compliments")
        .select(COMPLIMENT_COLS)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        log.error("ComplimentsRepository.listRecent DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load", { cause: error });
      }
      const rows = (data ?? []) as unknown as ComplimentRow[];
      return rows.map(toCompliment);
    },

    async createCompliment(
      input: CreateComplimentInput,
    ): Promise<Compliment> {
      const { data, error } = await client
        .from("compliments")
        .insert({
          body: input.body.trim(),
          posted_by: input.postedBy,
          recipient_id: input.recipientId || null,
        })
        .select(COMPLIMENT_COLS)
        .single();
      if (error || !data) {
        log.error("ComplimentsRepository.createCompliment DB error", {
          error: error?.message,
        });
        throw new ServiceError("Failed to post", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return toCompliment(data as unknown as ComplimentRow);
    },

    async listActiveRecipients(): Promise<readonly ComplimentRecipient[]> {
      const { data, error } = await client
        .from("users")
        .select("id, name, role")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) {
        log.error("ComplimentsRepository.listActiveRecipients DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to load users", { cause: error });
      }
      const rows = (data ?? []) as unknown as RecipientRow[];
      return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }));
    },
  };
}

export const supabaseComplimentsRepository: ComplimentsRepository =
  createSupabaseComplimentsRepository(supabaseService);
