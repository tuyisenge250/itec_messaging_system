import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { authRepository } from "@/modules/auth/repository";
import { organizationRepository } from "@/modules/organizations/repository";
import { getPermissionCodesForRole } from "@/modules/auth/services/authorization-service";
import { ALL_PERMISSION_CODES } from "@/shared/constants/permissions";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  if (!actor.userId) throw AppError.unauthenticated();

  const user = await authRepository.findUserById(actor.userId);
  if (!user) throw AppError.unauthenticated();

  const memberships = await authRepository.listMembershipsForUser(user.id);

  // Platform admins bypass the RolePermission join entirely (see
  // authorization-service.ts) — reflect that here so the frontend can show
  // every admin nav item without a separate permissions concept for them.
  const organizations = await Promise.all(
    memberships.map(async (m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.legalName,
      organizationStatus: m.organization.status,
      role: m.role.name,
      status: m.status,
      permissions: user.isPlatformAdmin ? ALL_PERMISSION_CODES : await getPermissionCodesForRole(m.roleId),
    })),
  );

  // A platform admin "viewing as" an organization they don't actually belong
  // to (see app/admin/organizations/[id]/page.tsx's "View as this
  // organization" and app/_lib/acting-organization.ts) — actor.organizationId
  // is already resolved from the X-Organization-Id header by
  // getSessionActorContext for this exact case.
  let actingOrganization = null;
  if (user.isPlatformAdmin && actor.organizationId && !memberships.some((m) => m.organizationId === actor.organizationId)) {
    const org = await organizationRepository.findById(actor.organizationId);
    if (org) {
      actingOrganization = {
        organizationId: org.id,
        organizationName: org.legalName,
        organizationStatus: org.status,
        role: "PLATFORM_ADMIN",
        status: "ACTIVE",
        permissions: ALL_PERMISSION_CODES,
      };
    }
  }

  return ok(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
      organizations,
      actingOrganization,
    },
    requestId,
  );
});
