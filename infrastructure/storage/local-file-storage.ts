import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FileStorage, SaveFileInput, SavedFile } from "./file-storage";
import { env } from "@/infrastructure/config/env";

const ROOT = path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
}

/** storageKey format: "<organizationId>/<uuid>-<sanitized-original-filename>" — never an absolute path. */
export class LocalFileStorage implements FileStorage {
  private resolve(storageKey: string): string {
    const resolved = path.resolve(ROOT, storageKey);
    if (!resolved.startsWith(ROOT)) {
      throw new Error("Invalid storage key: path traversal detected");
    }
    return resolved;
  }

  async save(input: SaveFileInput): Promise<SavedFile> {
    const storageKey = `${input.organizationId}/${randomUUID()}-${sanitizeFilename(input.originalFilename)}`;
    const filePath = this.resolve(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.buffer, { mode: 0o600 });
    return { storageKey, provider: "LOCAL" };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolve(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolve(storageKey), { force: true });
  }

  async getUrl(): Promise<string> {
    // Local storage has no public/CDN URL of its own — content is served through our
    // own authenticated route (GET /api/documents/[id]/content), which looks the
    // Document row up by id and streams it via FileStorage.read(), not via this URL.
    throw new Error("LocalFileStorage has no direct URL — fetch content via GET /api/documents/:id/content");
  }
}
