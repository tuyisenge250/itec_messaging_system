import type { NextRequest } from "next/server";
import { generateRandomToken, safeCompare } from "@/shared/utils/crypto";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function generateCsrfToken(): string {
  return generateRandomToken(32);
}

/**
 * Double-submit cookie check: a cross-site request can make the browser send
 * our session cookie automatically, but it can't read the CSRF cookie's value
 * (blocked by same-origin policy) to also send a matching header — so a
 * mismatch/missing header means the request didn't originate from a page we
 * served. Only meaningful for cookie-authenticated (session) requests; an
 * API-key Bearer token isn't auto-attached by the browser, so it isn't
 * susceptible to CSRF in the first place.
 */
export function verifyCsrfToken(request: NextRequest, cookieValue: string | undefined): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  if (!cookieValue) return false;
  const header = request.headers.get(CSRF_HEADER_NAME);
  if (!header) return false;
  return safeCompare(header, cookieValue);
}
