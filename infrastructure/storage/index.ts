import type { FileStorage } from "./file-storage";
import { LocalFileStorage } from "./local-file-storage";
import { env } from "@/infrastructure/config/env";

/**
 * Configuration-driven provider resolution (STORAGE_PROVIDER env var) instead
 * of scattering `if (provider === "local")` through the codebase — the same
 * pattern used for SMS and payment providers. CloudinaryStorage is not
 * implemented yet; see docs/architecture.md "Known limitations".
 */
function createFileStorage(): FileStorage {
  switch (env.STORAGE_PROVIDER) {
    case "local":
      return new LocalFileStorage();
    case "cloudinary":
      throw new Error(
        "STORAGE_PROVIDER=cloudinary is not implemented yet. Implement CloudinaryFileStorage against " +
          "the FileStorage interface in infrastructure/storage/file-storage.ts and wire it in here.",
      );
  }
}

export const fileStorage: FileStorage = createFileStorage();
export type { FileStorage, SaveFileInput, SavedFile } from "./file-storage";
