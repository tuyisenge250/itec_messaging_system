import { z } from "zod";

export const sendMessageSchema = z
  .object({
    // senderIdId is the internal database id; senderId is the sender ID's own
    // unique value (e.g. "MYBRAND") — unique per (organizationId, environment),
    // see SenderId's @@unique in prisma/schema.prisma. Provide exactly one —
    // senderId is the friendlier option for API integrators who already know
    // their registered sender ID string and shouldn't need to look up its
    // internal id first.
    senderIdId: z.string().min(1).optional(),
    senderId: z.string().min(1).optional(),
    recipients: z.array(z.string().min(5).max(20)).min(1).max(5000),
    content: z.string().min(1).max(1600),
    clientReference: z.string().trim().max(200).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((data) => Boolean(data.senderIdId) !== Boolean(data.senderId), {
    message: "Provide exactly one of senderIdId or senderId",
    path: ["senderId"],
  });

export const listMessagesQuerySchema = z.object({
  status: z
    .enum(["SCHEDULED", "QUEUED", "PROCESSING", "SENT", "DELIVERED", "PARTIALLY_DELIVERED", "FAILED", "EXPIRED", "REJECTED", "CANCELLED"])
    .optional(),
  cursor: z.string().optional(),
});
