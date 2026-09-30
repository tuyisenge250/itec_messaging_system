import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { updatePackage } from "@/modules/billing/payment-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional(),
  priceMinorUnits: z.number().int().positive().optional(),
  creditAmountMinorUnits: z.number().int().positive().optional(),
  bonusMinorUnits: z.number().int().nonnegative().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  active: z.boolean().optional(),
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateSchema);
  const pkg = await updatePackage(actor, id, body);
  return ok(pkg, requestId);
});
