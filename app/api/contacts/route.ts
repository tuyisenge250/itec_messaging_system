import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createContactSchema } from "@/modules/contacts/validation";
import { createContact, listContacts } from "@/modules/contacts/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const contacts = await listContacts(actor, actor.organizationId, cursor);
  return ok({ contacts }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, createContactSchema);
  const contact = await createContact(actor, actor.organizationId, body);
  return created(contact, requestId);
});
