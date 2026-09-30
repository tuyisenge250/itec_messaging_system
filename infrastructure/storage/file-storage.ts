/**
 * Storage abstraction. Business/document logic must depend only on this
 * interface and a logical `storageKey` — never on absolute filesystem paths
 * or a specific provider's SDK — so LocalFileStorage can be swapped for
 * CloudinaryStorage later without touching modules/documents.
 */
export interface SaveFileInput {
  buffer: Buffer;
  organizationId: string;
  originalFilename: string;
  mimeType: string;
}

export interface SavedFile {
  storageKey: string;
  provider: "LOCAL" | "CLOUDINARY";
}

export interface FileStorage {
  save(input: SaveFileInput): Promise<SavedFile>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  /** A URL the file can be fetched from — may be a signed/temporary URL for remote providers. */
  getUrl(storageKey: string): Promise<string>;
}
