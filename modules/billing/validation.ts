import { z } from "zod";

export const createPaymentIntentSchema = z
  .object({
    environment: z.enum(["SANDBOX", "PRODUCTION"]),
    packageId: z.string().min(1).optional(),
    amountMinorUnits: z.number().int().positive().optional(),
    simulateOutcome: z
      .enum(["SUCCEEDED", "FAILED", "TIMEOUT", "CANCELLED", "INSUFFICIENT_FUNDS", "PROVIDER_UNAVAILABLE"])
      .optional(),
  })
  .refine((v) => Boolean(v.packageId) !== Boolean(v.amountMinorUnits), {
    message: "Provide exactly one of packageId or amountMinorUnits",
  });
