import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { authRepository } from "../repository";
import { getSessionCookie, getCsrfCookie, validateSessionToken } from "./session-service";
import { verifyApiKeyToken } from "@/modules/api-keys/service";
import { verifyCsrfToken } from "@/shared/http/csrf";
import { AppError } from "@/shared/errors/app-error";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Environment } from "@/generated/prisma/client";

function extractIp(request: NextRequest): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

function requestMeta(request: NextRequest) {
  return {
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    ipAddress: extractIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}

/**
 * Resolves the ActorContext for an authenticated *dashboard* (session-cookie)
 * request. If the user belongs to more than one organization they must pick
 * one via the `X-Organization-Id` header — which is always re-verified
 * against real membership rows below, never trusted on its own.
 */
export async function getSessionActorContext(request: NextRequest): Promise<ActorContext> {
  const meta = requestMeta(request);
  const token = await getSessionCookie();
  if (!token) throw AppError.unauthenticated();

  const result = await validateSessionToken(token);
  if (!result) throw AppError.unauthenticated();

  const csrfCookie = await getCsrfCookie();
  if (!verifyCsrfToken(request, csrfCookie)) {
    throw AppError.forbidden("Invalid or missing CSRF token");
  }

  const base: ActorContext = {
    actorType: "USER",
    userId: result.user.id,
    isPlatformAdmin: result.user.isPlatformAdmin,
    ...meta,
  };

  const requestedOrgId = request.headers.get("x-organization-id") ?? undefined;
  const memberships = await authRepository.listMembershipsForUser(result.user.id);

  let organizationId = requestedOrgId;
  if (!organizationId) {
    if (memberships.length === 1) {
      organizationId = memberships[0].organizationId;
    } else {
      // No organization context resolvable — fine for platform-admin-only routes,
      // callers that need one will get a clear error from assertOrganizationAccess.
      return base;
    }
  }

  const membership = memberships.find((m) => m.organizationId === organizationId);
  if (!membership) {
    if (base.isPlatformAdmin) {
      return { ...base, organizationId };
    }
    throw AppError.forbidden("You are not a member of this organization");
  }

  return {
    ...base,
    organizationId: membership.organizationId,
    membershipId: membership.id,
    roleId: membership.roleId,
  };
}

/**
 * Resolves the ActorContext for an API-key-authenticated request
 * (`Authorization: Bearer <key>`). `expectedEnvironment` lets a route pin
 * sandbox vs production explicitly when it matters.
 */
export async function getApiKeyActorContext(
  request: NextRequest,
  expectedEnvironment?: Environment,
): Promise<ActorContext> {
  const meta = requestMeta(request);
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw AppError.unauthenticated("Missing API key");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const { apiKey } = await verifyApiKeyToken(token, expectedEnvironment);

  return {
    actorType: "API_KEY",
    apiKeyId: apiKey.id,
    apiKeyScopes: apiKey.scopes,
    organizationId: apiKey.organizationId,
    environment: apiKey.environment,
    ...meta,
  };
}

/** Accepts either a session cookie or an API key, whichever is present — for shared endpoints. */
export async function getActorContext(request: NextRequest): Promise<ActorContext> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return getApiKeyActorContext(request);
  }
  return getSessionActorContext(request);
}
