import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { listProviderCredentials, createProviderCredential } from "@/modules/providers/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const credentials = await listProviderCredentials(actor, id);
  return ok({ credentials }, requestId);
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createSchema);
  const credential = await createProviderCredential(actor, id, body);
  return created(credential, requestId);
});
