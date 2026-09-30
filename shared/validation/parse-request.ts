import type { NextRequest } from "next/server";
import type { ZodType, z } from "zod";
import { AppError } from "@/shared/errors/app-error";

export async function parseJsonBody<T extends ZodType>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw AppError.validation("Request body must be valid JSON");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.validation("Validation failed", result.error.flatten());
  }
  return result.data;
}

/** Like parseJsonBody, but a missing/empty body is treated as `{}` — for endpoints where every field is optional. */
export async function parseOptionalJsonBody<T extends ZodType>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw AppError.validation("Request body must be valid JSON");
    }
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.validation("Validation failed", result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T extends ZodType>(request: NextRequest, schema: T): z.infer<T> {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw AppError.validation("Invalid query parameters", result.error.flatten());
  }
  return result.data;
}
