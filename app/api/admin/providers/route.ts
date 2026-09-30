import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin, assertPermission } from "@/modules/auth/services/authorization-service";
import { providerConfigRepository } from "@/modules/providers/provider-config-repository";
import { createProviderConfig } from "@/modules/providers/service";
import { PermissionCode } from "@/shared/constants/permissions";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

const createSchema = z.object({
  providerType: z.enum(["SMS", "PAYMENT"]),
  providerCode: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(150),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
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

// GET: read-only listing (operational tuning only — never credential values).
export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);
  const providers = await providerConfigRepository.list();
  return ok({ providers }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createSchema);
  const provider = await createProviderConfig(actor, { ...body, settings: body.settings as Prisma.InputJsonValue | undefined });
  return created(provider, requestId);
});
