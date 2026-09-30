import { NextResponse } from "next/server";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export function ok<T>(data: T, requestId: string, init?: number | ResponseInit) {
  const body: ApiSuccessBody<T> = { success: true, data, requestId };
  return NextResponse.json(body, typeof init === "number" ? { status: init } : init);
}

export function created<T>(data: T, requestId: string) {
  return ok(data, requestId, 201);
}

export function errorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    const body: ApiErrorBody = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
    };
    return NextResponse.json(body, { status: error.httpStatus });
  }

  // Never leak internals (stack traces, driver errors, etc.) to the client.
  const body: ApiErrorBody = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
      requestId,
    },
  };
  return NextResponse.json(body, { status: 500 });
}
