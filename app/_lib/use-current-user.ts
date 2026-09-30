"use client";

import { useQuery } from "@tanstack/react-query";
import { authApi } from "./api";
import type { CurrentUser } from "./api/types";

export function useCurrentUser() {
  const query = useQuery<CurrentUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
  return query;
}

/**
 * The organization this session operates in. A platform admin "viewing as"
 * an organization (see app/_lib/acting-organization.ts) takes priority — that's
 * an explicit, deliberate choice, unlike a regular multi-org member, who still
 * just gets their first membership (the UI has no switcher for that case; the
 * backend supports it via the same X-Organization-Id header if ever needed).
 */
export function useCurrentOrg() {
  const { data: user } = useCurrentUser();
  return user?.actingOrganization ?? user?.organizations[0] ?? null;
}

export function usePermission(code: string): boolean {
  const org = useCurrentOrg();
  const { data: user } = useCurrentUser();
  if (user?.isPlatformAdmin) return true;
  return org?.permissions.includes(code) ?? false;
}
