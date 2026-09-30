import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getPaymentIntent } from "@/modules/billing/payment-service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const intent = await getPaymentIntent(actor, id);
  return ok(intent, requestId);
});
