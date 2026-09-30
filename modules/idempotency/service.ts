import { prisma } from "@/infrastructure/database/prisma";
import { sha256Hex } from "@/shared/utils/crypto";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { Prisma, type Environment } from "@/generated/prisma/client";

const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyParams {
  organizationId: string;
  environment: Environment;
  /** Namespaces keys per endpoint, e.g. "messages.send" — the same raw key under a different scope never collides. */
  scope: string;
  key: string;
  requestBody: unknown;
}

/**
 * Generic Idempotency-Key support, backed by the IdempotencyRecord table
 * (organizationId, environment, scope, key) unique constraint already in the
 * schema. Reused across any endpoint that needs it (currently: message
 * sends — see app/api/messages/route.ts; payment intents have their own
 * purpose-built mechanism on PaymentIntent itself, see
 * modules/billing/payment-service.ts).
 *
 * Behaviour, matching the spec this was built against:
 *   - same key + same request body -> replays the original response, `handler` never re-runs.
 *   - same key + different request body -> 409 IDEMPOTENCY_KEY_REUSED.
 *   - same key, first request still in flight (concurrent replay) -> 409 conflict.
 *   - handler throws -> the pending record is deleted, so the same key can be retried.
 */
export async function withIdempotency<T>(params: IdempotencyParams, handler: () => Promise<T>): Promise<{ result: T; replayed: boolean }> {
  const requestHash = sha256Hex(JSON.stringify(params.requestBody ?? null));

  let recordId: string;
  try {
    const record = await prisma.idempotencyRecord.create({
      data: {
        organizationId: params.organizationId,
        environment: params.environment,
        scope: params.scope,
        key: params.key,
        requestHash,
        expiresAt: new Date(Date.now() + RECORD_TTL_MS),
      },
    });
    recordId = record.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;

    const existing = await prisma.idempotencyRecord.findFirst({
      where: { organizationId: params.organizationId, environment: params.environment, scope: params.scope, key: params.key },
    });
    if (!existing) throw error; // shouldn't happen — the row that caused the conflict must exist

    if (existing.requestHash !== requestHash) {
      throw AppError.of(ErrorCode.IDEMPOTENCY_KEY_REUSED, "This Idempotency-Key was already used with a different request body", 409);
    }
    if (existing.responseSnapshot == null) {
      throw AppError.conflict("A request with this Idempotency-Key is already being processed");
    }
    return { result: existing.responseSnapshot as unknown as T, replayed: true };
  }

  try {
    const result = await handler();
    // Round-trip through JSON so Date/etc. values already match what a replay would return
    // (JSON.stringify -> parse), and so the value satisfies Prisma's InputJsonValue type.
    const snapshot = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
    await prisma.idempotencyRecord.update({ where: { id: recordId }, data: { responseSnapshot: snapshot, statusCode: 201 } });
    return { result, replayed: false };
  } catch (error) {
    await prisma.idempotencyRecord.delete({ where: { id: recordId } }).catch(() => undefined);
    throw error;
  }
}
