import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { errorResponse, type ApiErrorBody, type ApiSuccessBody } from "./response";
import { childLogger } from "@/infrastructure/logging/logger";
import { captureException } from "@/infrastructure/observability/sentry";
import { AppError } from "@/shared/errors/app-error";

type RouteHandler<Ctx> = (
  request: NextRequest,
  ctx: Ctx & { requestId: string },
) => Promise<NextResponse<ApiSuccessBody<unknown>>>;

/**
 * Wraps a Next.js route handler so every route gets: a correlation/request
 * ID (propagated to the response and to logs), structured error handling
 * (AppError -> the standard `{success:false, error:{...}}` shape, anything
 * else -> an opaque 500 with no leaked internals), and a log line per
 * request. Keeps individual route.ts files thin, per the architecture rule
 * that route handlers must not contain business logic.
 */
// Next 16's generated route validator (.next/dev/types/validator.ts, built from
// next dev's route manifest) expects even a static route's context to be shaped
// `{ params: Promise<{}> }`, not an empty object — match that as our default so
// routes with no dynamic segments (the majority) don't need to pass an explicit
// Ctx generic just to satisfy it.
export function withRoute<Ctx = { params: Promise<Record<string, never>> }>(handler: RouteHandler<Ctx>) {
  return async (request: NextRequest, ctx: Ctx): Promise<NextResponse<ApiSuccessBody<unknown> | ApiErrorBody>> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const log = childLogger({ requestId, method: request.method, path: request.nextUrl.pathname });
    const startedAt = Date.now();

    try {
      const response = await handler(request, { ...ctx, requestId });
      log.info({ status: response.status, durationMs: Date.now() - startedAt }, "request completed");
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        log.warn({ code: error.code, status: error.httpStatus, durationMs: Date.now() - startedAt }, error.message);
      } else {
        log.error({ err: error, durationMs: Date.now() - startedAt }, "unhandled error");
        captureException(error, { requestId, method: request.method, path: request.nextUrl.pathname });
      }
      return errorResponse(error, requestId);
    }
  };
}
