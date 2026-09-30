import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { importContacts } from "@/modules/contacts/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");

  const formData = await request.formData();
  const file = formData.get("file");
  const groupId = formData.get("groupId");

  if (!(file instanceof File)) {
    throw AppError.validation("A CSV file is required");
  }

  const csv = Buffer.from(await file.arrayBuffer());
  const result = await importContacts(actor, actor.organizationId, {
    csv,
    groupId: typeof groupId === "string" && groupId ? groupId : undefined,
  });

  return ok(result, requestId);
});
