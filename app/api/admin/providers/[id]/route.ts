import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateProviderConfig } from "@/modules/providers/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  rateLimitPerSecond: z.number().int().positive().optional(),
  maxConcurrency: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  backoffBaseMs: z.number().int().positive().optional(),
  circuitBreakerFailureThreshold: z.number().int().positive().optional(),
  circuitBreakerCooldownMs: z.number().int().positive().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateSchema);
  const provider = await updateProviderConfig(actor, id, { ...body, settings: body.settings as Prisma.InputJsonValue | undefined });
  return ok(provider, requestId);
});
