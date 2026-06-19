/**
 * lib/ports/AttachmentStorage.ts
 *
 * The file-store port (F-16) for the `cash-attachments` bucket: the
 * "filing cabinet" socket for receipt/invoice images, separate from the
 * database socket. Pure TypeScript — imports nothing; the app owns this
 * interface and the Supabase Storage SDK is confined to the adapter.
 *
 * Three operations, each mapping to a Cash route surface:
 *   upload          → POST   /api/cash/upload
 *   createSignedUrl → GET    /api/cash/month attachment URLs
 *   remove          → DELETE /api/cash/entry/[id] pre-delete cleanup
 *
 * Error contract: upload throws ServiceError on vendor error;
 * createSignedUrl returns null on failure/empty path (define errors out
 * of existence, matching today's `data?.signedUrl ?? null`); remove is
 * best-effort (matches today's pre-delete remove).
 */

export interface AttachmentStorage {
  /** Upload bytes to the bucket at `path`; throws ServiceError on vendor error.
   *  upsert:false (matches today). → POST /api/cash/upload. */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /** A time-limited signed URL for a stored object, or null on failure/empty
   *  path. → GET /api/cash/month attachment URLs. */
  createSignedUrl(path: string, ttlSeconds: number): Promise<string | null>;

  /** Remove the given object paths (best-effort, matches today's pre-delete). */
  remove(paths: readonly string[]): Promise<void>;
}
