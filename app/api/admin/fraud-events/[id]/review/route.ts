import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { reviewFraudEvent } from "@/modules/fraud/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  decision: z.enum(["RESOLVED", "DISMISSED"]),
  notes: z.string().trim().max(2000).optional(),
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, bodySchema);
  const event = await reviewFraudEvent(actor, id, body.decision, body.notes);
  return ok(event, requestId);
});
