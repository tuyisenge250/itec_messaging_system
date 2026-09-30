import type { OrganizationStatus } from "@/generated/prisma/client";
import { AppError } from "@/shared/errors/app-error";

/**
 * PENDING --submit--> UNDER_REVIEW --approve--> VERIFIED --activate--> ACTIVE
 *                          |--reject--> REJECTED --(update+resubmit)--> UNDER_REVIEW
 *                                                ACTIVE <--reactivate-- SUSPENDED
 *                                                ACTIVE --suspend--> SUSPENDED
 */
const ALLOWED_TRANSITIONS: Record<OrganizationStatus, OrganizationStatus[]> = {
  PENDING: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: ["ACTIVE"],
  REJECTED: ["UNDER_REVIEW"],
  ACTIVE: ["SUSPENDED"],
  SUSPENDED: ["ACTIVE"],
};

export function assertValidOrganizationTransition(from: OrganizationStatus, to: OrganizationStatus): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw AppError.conflict(`Cannot move organization from ${from} to ${to}`);
  }
}

/** Only these statuses may send SMS, buy credits, request sender IDs for production use, etc. */
export function isOrganizationOperational(status: OrganizationStatus): boolean {
  return status === "ACTIVE";
}
