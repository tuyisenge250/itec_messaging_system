// NOTE: lives at /api/webhook-endpoints rather than the spec's literal /api/webhooks
// because that path is claimed by the inbound provider webhook receiver
// (POST /api/webhooks/:provider) — Next.js cannot host two different dynamic
// segment names ([provider] vs [id]) as siblings under the same route. See
// docs/architecture.md "Known deviations from the literal endpoint list".
import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createWebhookSchema } from "@/modules/webhooks/validation";
import { createWebhook, listWebhooks } from "@/modules/webhooks/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const webhooks = await listWebhooks(actor, actor.organizationId);
  return ok({ webhooks }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, createWebhookSchema);
  const webhook = await createWebhook(actor, actor.organizationId, body);
  return created(webhook, requestId);
});
