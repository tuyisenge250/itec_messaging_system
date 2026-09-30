import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { setPlatformAdminStatus } from "@/modules/auth/services/auth-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  isPlatformAdmin: z.boolean(),
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, bodySchema);
  const { passwordHash: _passwordHash, ...user } = await setPlatformAdminStatus(actor, id, body.isPlatformAdmin);
  return ok(user, requestId);
});
