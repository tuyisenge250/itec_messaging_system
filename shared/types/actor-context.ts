/**
 * "Who is making this request" — threaded through services for
 * authorization, audit logging, and fraud checks. This is built once per
 * request (see modules/auth/services/request-context-service.ts) from either
 * a session cookie or an API key, and application code must treat it as the
 * only trustworthy source of `organizationId` — never a client-supplied
 * value (route params, body fields) for anything that gates access.
 */
export interface ActorContext {
  actorType: "USER" | "API_KEY" | "SYSTEM";
  requestId: string;
  ipAddress?: string;
  userAgent?: string;

  userId?: string;
  isPlatformAdmin?: boolean;

  apiKeyId?: string;
  apiKeyScopes?: string[];

  /** The single organization this actor is scoped to for this request, when applicable. */
  organizationId?: string;
  membershipId?: string;
  roleId?: string;
  environment?: "SANDBOX" | "PRODUCTION";
}

export const SYSTEM_ACTOR: ActorContext = {
  actorType: "SYSTEM",
  requestId: "system",
};
