import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createPaymentIntentSchema } from "@/modules/billing/validation";
import { createAndCompletePaymentIntent, listPaymentIntents } from "@/modules/billing/payment-service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { resolveEnvironment } from "@/shared/http/environment";
import { AppError } from "@/shared/errors/app-error";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const environment = resolveEnvironment(actor, request);
  const paymentIntents = await listPaymentIntents(actor, actor.organizationId, environment);
  return ok({ paymentIntents }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");

  const body = await parseJsonBody(request, createPaymentIntentSchema);
  // Idempotency-Key is optional on this endpoint for convenience, but strongly
  // recommended — without it, a retried request creates a new payment attempt.
  const idempotencyKey = request.headers.get("idempotency-key") ?? randomUUID();

  const intent = await createAndCompletePaymentIntent(actor, actor.organizationId, body, idempotencyKey);
  return created(intent, requestId);
});
