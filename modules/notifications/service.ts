import { notificationsRepository } from "./repository";
import { AppError } from "@/shared/errors/app-error";
import type { ActorContext } from "@/shared/types/actor-context";
import type { NotificationType, Prisma } from "@/generated/prisma/client";

/** Internal helper other modules call at the point an event happens — not permission-gated itself, since it never takes a client-supplied target (callers always pass a resolved userId). */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  options?: { organizationId?: string; data?: Prisma.InputJsonValue },
) {
  await notificationsRepository.create({
    userId,
    organizationId: options?.organizationId ?? null,
    type,
    title,
    message,
    data: options?.data,
  });
}

/** Fans out one notification row per active platform admin — the model is per-user, this is the broadcast primitive for platform-wide operational alerts. */
export async function notifyAllPlatformAdmins(
  type: NotificationType,
  title: string,
  message: string,
  options?: { organizationId?: string; data?: Prisma.InputJsonValue },
) {
  const admins = await notificationsRepository.listPlatformAdminUserIds();
  if (admins.length === 0) return;
  await notificationsRepository.createMany(
    admins.map((admin) => ({
      userId: admin.id,
      organizationId: options?.organizationId ?? null,
      type,
      title,
      message,
      data: options?.data,
    })),
  );
}

export async function listMyNotifications(actor: ActorContext, params: { unreadOnly?: boolean; cursor?: string }) {
  if (!actor.userId) throw AppError.unauthenticated();
  const [notifications, unreadCount] = await Promise.all([
    notificationsRepository.listForUser(actor.userId, { ...params, take: 25 }),
    notificationsRepository.countUnread(actor.userId),
  ]);
  return { notifications, unreadCount };
}

export async function markNotificationRead(actor: ActorContext, id: string) {
  if (!actor.userId) throw AppError.unauthenticated();
  const notification = await notificationsRepository.findById(id);
  if (!notification || notification.userId !== actor.userId) throw AppError.notFound();
  return notificationsRepository.markRead(id);
}
