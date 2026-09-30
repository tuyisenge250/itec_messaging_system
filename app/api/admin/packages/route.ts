import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { listPackagesForAdmin, createPackage } from "@/modules/billing/payment-service";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
  priceMinorUnits: z.number().int().positive(),
  creditAmountMinorUnits: z.number().int().positive(),
  bonusMinorUnits: z.number().int().nonnegative().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  active: z.boolean().optional(),
});

// GET: all packages (including inactive) — admin needs the full picture.
export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const packages = await listPackagesForAdmin(actor);
  return ok({ packages }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createSchema);
  const pkg = await createPackage(actor, body);
  return created(pkg, requestId);
});
