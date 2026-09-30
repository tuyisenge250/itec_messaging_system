import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listPackages } from "@/modules/billing/payment-service";

export const runtime = "nodejs";

export const GET = withRoute(async (_request, { requestId }) => {
  const packages = await listPackages();
  return ok({ packages }, requestId);
});
