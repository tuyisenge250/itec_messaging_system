import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createOrganizationSchema } from "@/modules/organizations/validation";
import { createOrganization } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { authRepository } from "@/modules/auth/repository";
import { organizationRepository } from "@/modules/organizations/repository";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  if (!actor.userId) throw AppError.unauthenticated();

  if (actor.isPlatformAdmin) {
    const orgs = await organizationRepository.list({ take: 50 });
    return ok({ organizations: orgs }, requestId);
  }

  const memberships = await authRepository.listMembershipsForUser(actor.userId);
  return ok({ organizations: memberships.map((m) => ({ ...m.organization, role: m.role.name })) }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createOrganizationSchema);
  const organization = await createOrganization(actor, body);
  return created(organization, requestId);
});
