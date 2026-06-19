/**
 * lib/adapters/fake/AttachmentStorage.ts
 *
 * In-memory implementation of `AttachmentStorage`
 * (lib/ports/AttachmentStorage.ts). No Supabase SDK import — records
 * uploads + removals in Maps and returns a deterministic fake signed URL.
 * The faithful twin of the Supabase Storage adapter for unit tests.
 *
 * The recorded `uploaded` / `removed` maps are exposed on the returned
 * object (via the FakeAttachmentStorage interface) so a test can spy on
 * what the service composed — e.g. assert deleteEntry called remove([path])
 * before deleting the row.
 *
 * Construction:
 *   - `createFakeAttachmentStorage()` factory.
 *   - `fakeAttachmentStorage` singleton — empty; exists for barrel symmetry.
 */

import type { AttachmentStorage } from "@/lib/ports";

/** A recorded upload. */
export interface FakeUpload {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** The Fake storage surface plus its test-observable record of operations. */
export interface FakeAttachmentStorage extends AttachmentStorage {
  /** path → the last upload recorded at that path. */
  readonly uploaded: Map<string, FakeUpload>;
  /** every path passed to remove(), in call order (flattened). */
  readonly removed: string[];
}

export function createFakeAttachmentStorage(): FakeAttachmentStorage {
  const uploaded = new Map<string, FakeUpload>();
  const removed: string[] = [];

  return {
    uploaded,
    removed,

    async upload(
      path: string,
      bytes: Uint8Array,
      contentType: string,
    ): Promise<void> {
      uploaded.set(path, { path, bytes, contentType });
    },

    async createSignedUrl(
      path: string,
      _ttlSeconds: number,
    ): Promise<string | null> {
      if (!path) return null;
      return `fake-signed://${path}`;
    },

    async remove(paths: readonly string[]): Promise<void> {
      for (const p of paths) removed.push(p);
    },
  };
}

export const fakeAttachmentStorage: FakeAttachmentStorage =
  createFakeAttachmentStorage();
