import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { adjustWallet } from "@/modules/wallets/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  amountMinorUnits: z.number().int().refine((n) => n !== 0, "amountMinorUnits must not be zero"),
  description: z.string().trim().min(1).max(500),
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const body = await parseJsonBody(request, bodySchema);
  const wallet = await adjustWallet(actor, id, body.environment, body.amountMinorUnits, body.description);
  return ok(wallet, requestId);
});
