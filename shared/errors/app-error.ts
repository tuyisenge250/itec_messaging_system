import { ErrorCode } from "./error-codes";

/**
 * Typed application error. Route handlers catch this (see shared/errors/http.ts)
 * and turn it into the standard `{ success: false, error: {...} }` response shape.
 * Anything that isn't an AppError is treated as an unexpected 500 and never
 * has its message/stack leaked to the client.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  static validation(message: string, details?: unknown) {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static notFound(message = "Resource not found") {
    return new AppError(ErrorCode.NOT_FOUND, message, 404);
  }

  static unauthenticated(message = "Authentication required") {
    return new AppError(ErrorCode.UNAUTHENTICATED, message, 401);
  }

  static forbidden(message = "You do not have permission to do this") {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(ErrorCode.CONFLICT, message, 409, details);
  }

  static rateLimited(message = "Too many requests", details?: unknown) {
    return new AppError(ErrorCode.RATE_LIMITED, message, 429, details);
  }

  static internal(message = "Internal server error") {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500);
  }

  static of(code: ErrorCode, message: string, httpStatus: number, details?: unknown) {
    return new AppError(code, message, httpStatus, details);
  }
}
