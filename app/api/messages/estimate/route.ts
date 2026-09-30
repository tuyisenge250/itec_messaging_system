import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { estimateMessageCost } from "@/modules/messaging/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { resolveEnvironment } from "@/shared/http/environment";
import { AppError } from "@/shared/errors/app-error";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  content: z.string().max(1600),
  recipientCount: z.number().int().min(0).default(1),
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, bodySchema);
  const environment = resolveEnvironment(actor, request);
  const estimate = await estimateMessageCost(actor, actor.organizationId, environment, body.content, body.recipientCount);
  return ok(estimate, requestId);
});
