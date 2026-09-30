import type { Environment } from "@/generated/prisma/client";

/**
 * Resolves which wallet/provider environment a request operates in: an API
 * key is permanently pinned to one (ApiKey.environment), while a dashboard
 * session may pick via `?environment=`, defaulting to SANDBOX.
 */
export function resolveEnvironment(actor: { environment?: Environment }, request: Request): Environment {
  if (actor.environment) return actor.environment;
  const url = new URL(request.url);
  const param = url.searchParams.get("environment");
  if (param === "PRODUCTION" || param === "SANDBOX") return param;
  return "SANDBOX";
}
