import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { rotateProviderCredential } from "@/modules/providers/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; credId: string }> };

const bodySchema = z.object({
  value: z.string().min(1),
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { credId } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, bodySchema);
  const credential = await rotateProviderCredential(actor, credId, body.value);
  return ok(credential, requestId);
});
