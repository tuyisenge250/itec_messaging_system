import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateOrganizationSchema } from "@/modules/organizations/validation";
import { getOrganization, updateOrganization } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const organization = await getOrganization(actor, id);
  return ok(organization, requestId);
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateOrganizationSchema);
  const organization = await updateOrganization(actor, id, body);
  return ok(organization, requestId);
});
