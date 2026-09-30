import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseOptionalJsonBody } from "@/shared/validation/parse-request";
import { testScenario } from "@/modules/simulator/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  phoneNumber: z.string().optional(),
  senderIdValue: z.string().optional(),
  organizationId: z.string().optional(),
  content: z.string().optional(),
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseOptionalJsonBody(request, bodySchema);
  const result = await testScenario(actor, id, body);
  return ok(result, requestId);
});
