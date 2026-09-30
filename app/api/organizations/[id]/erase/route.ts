import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { eraseOrganizationData } from "@/modules/organizations/gdpr-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const eraseSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  confirmName: z.string().trim().min(1),
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, eraseSchema);
  await eraseOrganizationData(actor, id, body.reason, body.confirmName);
  return ok({ erased: true }, requestId);
});
