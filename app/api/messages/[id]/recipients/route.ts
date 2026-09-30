import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listRecipients } from "@/modules/messaging/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const recipients = await listRecipients(actor, id, cursor);
  return ok({ recipients }, requestId);
});
