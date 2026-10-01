import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody, parseQuery } from "@/shared/validation/parse-request";
import { sendMessageSchema, listMessagesQuerySchema } from "@/modules/messaging/validation";
import { sendMessage, listMessages } from "@/modules/messaging/service";
import { withIdempotency } from "@/modules/idempotency/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { resolveEnvironment } from "@/shared/http/environment";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const query = parseQuery(request, listMessagesQuerySchema);
  const messages = await listMessages(actor, actor.organizationId, query.status, query.cursor);
  return ok({ messages }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, sendMessageSchema);
  const environment = resolveEnvironment(actor, request);

  // Idempotency-Key is optional here (unlike payments, a message send has no
  // standalone dedup constraint of its own) — present it and a retried
  // request with the same body replays the original result instead of
  // sending twice; omit it and the send behaves exactly as before.
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const { result } = await withIdempotency(
      { organizationId: actor.organizationId, environment, scope: "messages.send", key: idempotencyKey, requestBody: body },
      () => sendMessage(actor, actor.organizationId!, environment, body, idempotencyKey),
    );
    return created(result, requestId);
  }

  const result = await sendMessage(actor, actor.organizationId, environment, body);
  return created(result, requestId);
});
