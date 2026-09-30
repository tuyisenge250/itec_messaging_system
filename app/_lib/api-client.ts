/**
 * Minimal fetch wrapper for the pages under app/. These pages are
 * intentionally basic client-side consumers of the REST API — the same
 * contract any external integrator would use. Not meant as a UI framework;
 * just enough to exercise the backend from a browser.
 */
import { getActingOrganizationId } from "./acting-organization";

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(public apiError: ApiError) {
    super(apiError.message);
  }
}

function readCsrfCookie(): string | undefined {
  try {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const csrfHeader: Record<string, string> = method === "GET" || method === "HEAD" ? {} : { "X-CSRF-Token": readCsrfCookie() ?? "" };
  // A FormData body must NOT get an explicit Content-Type — the browser sets
  // one with the multipart boundary itself; setting it here would break parsing.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const contentTypeHeader: Record<string, string> = isFormData ? {} : { "Content-Type": "application/json" };
  // Not method-gated like CSRF — a platform admin "viewing as" an org needs this
  // on GET requests too, since it's what getSessionActorContext resolves
  // organizationId from when the actor has no real membership row.
  const actingOrgId = getActingOrganizationId();
  const orgHeader: Record<string, string> = actingOrgId ? { "X-Organization-Id": actingOrgId } : {};

  const response = await fetch(path, {
    ...options,
    headers: { ...contentTypeHeader, ...orgHeader, ...csrfHeader, ...options.headers },
    credentials: "include",
  });

  const body = await response.json();
  if (!body.success) {
    throw new ApiRequestError(body.error as ApiError);
  }
  return body.data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.apiError.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
