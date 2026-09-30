import { z } from "zod";

export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(2).max(300),
  tradingName: z.string().trim().max(300).optional(),
  registrationNumber: z.string().trim().max(100).optional(),
  tin: z.string().trim().max(100).optional(),
  businessType: z.string().trim().max(150).optional(),
  industry: z.string().trim().max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  addressLine1: z.string().trim().max(300).optional(),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().max(150).optional(),
  country: z.string().trim().length(2).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  website: z.string().trim().url().optional(),
  legalRepresentativeName: z.string().trim().max(300).optional(),
  legalRepresentativeEmail: z.string().trim().email().optional(),
  legalRepresentativePhone: z.string().trim().max(30).optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const submitForReviewSchema = z.object({});

export const reviewDecisionSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

// roleId may reference either a global system role (ADMIN, OPERATOR, ...) or one of
// this organization's own custom roles — modules/roles/service.ts::resolveAssignableRole
// is what actually validates and scopes it; this is only shape validation.
//
// If the email already belongs to an existing account, that account is attached to the
// organization as-is (name is ignored, no password is set) — see createMember in
// modules/organizations/service.ts. name only applies when a brand-new account is created.
export const createMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200).optional(),
  roleId: z.string().min(1),
});

export const updateMemberRoleSchema = z.object({
  roleId: z.string().min(1),
});
