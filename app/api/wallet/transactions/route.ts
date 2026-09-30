import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listWalletTransactions } from "@/modules/wallets/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { resolveEnvironment } from "@/shared/http/environment";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");

  const environment = resolveEnvironment(actor, request);
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const transactions = await listWalletTransactions(actor, actor.organizationId, environment, cursor);
  return ok({ transactions }, requestId);
});
