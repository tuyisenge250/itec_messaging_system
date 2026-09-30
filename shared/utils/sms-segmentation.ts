/**
 * SMS segmentation per GSM 03.38 (GSM-7) vs UCS-2, including multipart limits.
 *
 * - GSM-7 single segment: 160 septets. Multipart: 153 septets/segment (7 octets
 *   reserved for the UDH concatenation header).
 * - UCS-2 single segment: 70 UTF-16 code units. Multipart: 67/segment (same
 *   6-octet UDH overhead, but UCS-2 chars are 2 octets each).
 * - GSM-7 "extended" characters (^ { } \ [ ] ~ | €) cost 2 septets each
 *   because they're an escape sequence into the extension table.
 */

const GSM7_BASIC = new Set(
  (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
  ).split(""),
);

const GSM7_EXTENDED = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

export type SmsEncoding = "GSM_7" | "UCS_2";

export interface SegmentationResult {
  encoding: SmsEncoding;
  segmentCount: number;
  characterCount: number;
  perSegmentLimit: number;
}

function isGsm7Encodable(content: string): boolean {
  for (const char of content) {
    if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED.has(char)) return false;
  }
  return true;
}

/** GSM-7 septet count: extended-table characters cost 2 septets each. */
function gsm7Length(content: string): number {
  let length = 0;
  for (const char of content) {
    length += GSM7_EXTENDED.has(char) ? 2 : 1;
  }
  return length;
}

export function segmentMessage(content: string): SegmentationResult {
  const gsm7 = isGsm7Encodable(content);
  const encoding: SmsEncoding = gsm7 ? "GSM_7" : "UCS_2";
  const characterCount = gsm7 ? gsm7Length(content) : content.length;

  const singleLimit = gsm7 ? 160 : 70;
  const multipartLimit = gsm7 ? 153 : 67;

  if (characterCount === 0) {
    return { encoding, segmentCount: 0, characterCount, perSegmentLimit: singleLimit };
  }

  if (characterCount <= singleLimit) {
    return { encoding, segmentCount: 1, characterCount, perSegmentLimit: singleLimit };
  }

  const segmentCount = Math.ceil(characterCount / multipartLimit);
  return { encoding, segmentCount, characterCount, perSegmentLimit: multipartLimit };
}
