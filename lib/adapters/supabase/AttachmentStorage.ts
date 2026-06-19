/**
 * lib/adapters/supabase/AttachmentStorage.ts
 *
 * Supabase Storage implementation of `AttachmentStorage`
 * (lib/ports/AttachmentStorage.ts), targeting the `cash-attachments`
 * bucket. One of the adapter files allowed to import
 * `@supabase/supabase-js` (the SDK reaches Storage via the same client).
 * The ONLY file that imports the vendor Storage SDK for Cash.
 *
 * Behaviour copied VERBATIM from the Cash routes the PR2 re-point will
 * replace:
 *   - upload: `{ contentType, upsert: false }`, throws ServiceError on
 *     vendor error (matches today's 500-on-uploadErr).
 *   - createSignedUrl: returns `data?.signedUrl ?? null` (matches today's
 *     getSignedUrl — empty path / failure → null).
 *   - remove: best-effort, matches today's pre-delete `remove([path])`.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseAttachmentStorage(client)` factory.
 *   - `supabaseAttachmentStorage` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type { AttachmentStorage } from "@/lib/ports";

const BUCKET = "cash-attachments";

export function createSupabaseAttachmentStorage(
  client: SupabaseClient,
): AttachmentStorage {
  return {
    async upload(
      path: string,
      bytes: Uint8Array,
      contentType: string,
    ): Promise<void> {
      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) {
        log.error("AttachmentStorage.upload storage error", {
          path,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
    },

    async createSignedUrl(
      path: string,
      ttlSeconds: number,
    ): Promise<string | null> {
      if (!path) return null;
      const { data } = await client.storage
        .from(BUCKET)
        .createSignedUrl(path, ttlSeconds);
      return data?.signedUrl ?? null;
    },

    async remove(paths: readonly string[]): Promise<void> {
      if (paths.length === 0) return;
      await client.storage.from(BUCKET).remove([...paths]);
    },
  };
}

export const supabaseAttachmentStorage: AttachmentStorage =
  createSupabaseAttachmentStorage(supabaseService);
