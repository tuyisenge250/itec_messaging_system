import { z } from "zod";
import { ALL_PERMISSION_CODES } from "@/shared/constants/permissions";

// Permission codes are checked against ORG_ASSIGNABLE_PERMISSION_CODES in the service
// (the actual security boundary) — this just shapes the request.
export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  permissionCodes: z.array(z.string()).min(1).max(ALL_PERMISSION_CODES.length),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).optional(),
  permissionCodes: z.array(z.string()).min(1).max(ALL_PERMISSION_CODES.length).optional(),
});
