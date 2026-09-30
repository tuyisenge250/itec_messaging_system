import type { SenderIdRequestStatus } from "@/generated/prisma/client";
import { AppError } from "@/shared/errors/app-error";

/**
 * DRAFT --submit--> SUBMITTED --review--> UNDER_REVIEW --review--> RURA_SUBMITTED
 *   ^                    |                     |                        |
 *   |                    v                     v                        v
 *   +-- DOCUMENTS_REQUIRED <-------------------+          RURA_INFORMATION_REQUESTED
 *                                               |                        |
 *                                               v                        v (resubmit)
 *                                            REJECTED <---------- RURA_SUBMITTED
 *                                                                        |
 *                                                                  RURA_APPROVED
 *                                                                        |
 *                                                                 MNO_WHITELISTING
 *                                                                        |
 *                                                                    APPROVED
 *
 * This is only a representation of the workflow — a RURA_APPROVED status here is
 * never itself the real regulatory approval, only our record that our review
 * process reached that step. See docs/architecture.md "Sender ID workflow".
 */
const CUSTOMER_SUBMIT_FROM: SenderIdRequestStatus[] = ["DRAFT", "DOCUMENTS_REQUIRED"];

const ADMIN_REVIEW_TRANSITIONS: Partial<Record<SenderIdRequestStatus, SenderIdRequestStatus[]>> = {
  SUBMITTED: ["UNDER_REVIEW", "DOCUMENTS_REQUIRED"],
  UNDER_REVIEW: ["DOCUMENTS_REQUIRED", "RURA_SUBMITTED"],
  RURA_SUBMITTED: ["RURA_INFORMATION_REQUESTED", "RURA_APPROVED", "RURA_REJECTED"],
  RURA_INFORMATION_REQUESTED: ["RURA_SUBMITTED"],
  RURA_APPROVED: ["MNO_WHITELISTING"],
};

const REJECTABLE_FROM: SenderIdRequestStatus[] = [
  "SUBMITTED",
  "DOCUMENTS_REQUIRED",
  "UNDER_REVIEW",
  "RURA_SUBMITTED",
  "RURA_INFORMATION_REQUESTED",
  "RURA_REJECTED",
];

export function assertCanSubmit(from: SenderIdRequestStatus): void {
  if (!CUSTOMER_SUBMIT_FROM.includes(from)) {
    throw AppError.conflict(`Cannot submit a sender ID request from status ${from}`);
  }
}

export function assertValidReviewTransition(from: SenderIdRequestStatus, to: SenderIdRequestStatus): void {
  if (!ADMIN_REVIEW_TRANSITIONS[from]?.includes(to)) {
    throw AppError.conflict(`Cannot move sender ID request from ${from} to ${to}`);
  }
}

export function assertCanApprove(from: SenderIdRequestStatus): void {
  if (from !== "MNO_WHITELISTING") {
    throw AppError.conflict("A sender ID request can only be approved once MNO whitelisting is complete");
  }
}

export function assertCanReject(from: SenderIdRequestStatus): void {
  if (!REJECTABLE_FROM.includes(from)) {
    throw AppError.conflict(`Cannot reject a sender ID request from status ${from}`);
  }
}

export const TERMINAL_STATUSES: SenderIdRequestStatus[] = ["APPROVED", "REJECTED", "CANCELLED"];
