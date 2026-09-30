/**
 * Minimal "magic bytes" check so a file claiming to be a PDF/image via its
 * declared MIME type actually starts with that format's real signature —
 * a cheap defense against disguised uploads (e.g. an executable renamed to
 * `.pdf`). Not a full content-type sniffer; covers the document types this
 * platform accepts (see prisma seed DocumentRequirement.allowedMimeTypes).
 */
const SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  "application/pdf": (buf) => buf.subarray(0, 4).toString("latin1") === "%PDF",
  "image/jpeg": (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/png": (buf) =>
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

export function matchesDeclaredFileSignature(mimeType: string, buffer: Buffer): boolean {
  const check = SIGNATURES[mimeType];
  if (!check) return true; // no known signature for this type — skip rather than false-reject
  return check(buffer);
}
