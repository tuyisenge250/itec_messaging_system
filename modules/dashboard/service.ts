import { prisma } from "@/infrastructure/database/prisma";
import { walletRepository } from "@/modules/wallets/repository";
import { assertPermission, assertOrganizationAccess, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Environment } from "@/generated/prisma/client";

const WINDOW_DAYS = 30;
const TIME_SERIES_DAYS = 14;

export interface DashboardTimeSeriesPoint {
  date: string;
  sent: number;
  delivered: number;
  failed: number;
}

/**
 * Every number here comes from a real aggregation over real rows — no
 * placeholder/demo statistics. Message totals and the time series are
 * windowed (30d / 14d) to keep the dashboard both meaningful and cheap to
 * compute; "all time" would answer a different question than "how is this
 * organization doing lately."
 */
export async function getDashboardSummary(actor: ActorContext, organizationId: string, environment: Environment) {
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, organizationId);

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const seriesStart = new Date(Date.now() - TIME_SERIES_DAYS * 24 * 60 * 60 * 1000);

  const [wallet, messageTotals, activeCampaigns, activeSenderIds, recentMessages, recentPayments, timeSeriesRows] =
    await Promise.all([
      walletRepository.findByOrgEnv(organizationId, environment),
      prisma.message.aggregate({
        where: { organizationId, environment, createdAt: { gte: windowStart } },
        _sum: { sentCount: true, deliveredCount: true, failedCount: true, totalRecipients: true },
      }),
      prisma.campaign.count({ where: { organizationId, environment, status: { in: ["SCHEDULED", "SENDING"] } } }),
      prisma.senderId.count({ where: { organizationId, environment, status: "ACTIVE" } }),
      prisma.message.findMany({
        where: { organizationId, environment },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, content: true, status: true, totalRecipients: true, deliveredCount: true, failedCount: true, createdAt: true },
      }),
      prisma.paymentIntent.findMany({
        where: { organizationId, environment },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, status: true, amountMinorUnits: true, currency: true, createdAt: true, package: { select: { name: true } } },
      }),
      prisma.$queryRaw<Array<{ day: Date; sent: bigint; delivered: bigint; failed: bigint }>>`
        SELECT
          date_trunc('day', "createdAt") AS day,
          COALESCE(SUM("sentCount"), 0)::bigint AS sent,
          COALESCE(SUM("deliveredCount"), 0)::bigint AS delivered,
          COALESCE(SUM("failedCount"), 0)::bigint AS failed
        FROM "Message"
        WHERE "organizationId" = ${organizationId}
          AND "environment" = ${environment}::"Environment"
          AND "createdAt" >= ${seriesStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

  const delivered = messageTotals._sum.deliveredCount ?? 0;
  const failed = messageTotals._sum.failedCount ?? 0;
  const sent = messageTotals._sum.sentCount ?? 0;
  const resolved = delivered + failed;

  const timeSeries: DashboardTimeSeriesPoint[] = timeSeriesRows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    sent: Number(row.sent),
    delivered: Number(row.delivered),
    failed: Number(row.failed),
  }));

  return {
    wallet: wallet
      ? {
          availableBalanceMinorUnits: wallet.availableBalanceMinorUnits,
          reservedBalanceMinorUnits: wallet.reservedBalanceMinorUnits,
          currency: wallet.currency,
        }
      : null,
    windowDays: WINDOW_DAYS,
    totals: {
      messagesSent: sent,
      messagesDelivered: delivered,
      messagesFailed: failed,
      totalRecipients: messageTotals._sum.totalRecipients ?? 0,
      deliveryRatePercent: resolved > 0 ? Math.round((delivered / resolved) * 1000) / 10 : null,
    },
    activeCampaigns,
    activeSenderIds,
    recentMessages,
    recentPayments,
    timeSeries,
  };
}

/**
 * Platform-wide, today-scoped overview for the admin landing page — every
 * number is a real aggregation over every organization's rows, no
 * placeholder statistics. "Today" is server-local midnight to now, matching
 * how an operator reading this dashboard reasons about the number ("how
 * much happened today").
 */
export async function getPlatformSummary(actor: ActorContext) {
  requirePlatformAdmin(actor);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [messagesToday, organizationsTotal, organizationsActive, organizationsPendingReview, senderIdRequestsPending, openFraudEvents] =
    await Promise.all([
      prisma.message.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { totalRecipients: true, deliveredCount: true, failedCount: true, totalCostMinorUnits: true },
      }),
      prisma.organization.count(),
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.senderIdRequest.count({ where: { status: { notIn: ["APPROVED", "REJECTED", "CANCELLED"] } } }),
      prisma.fraudEvent.count({ where: { status: "OPEN" } }),
    ]);

  const delivered = messagesToday._sum.deliveredCount ?? 0;
  const failed = messagesToday._sum.failedCount ?? 0;
  const resolved = delivered + failed;

  return {
    date: todayStart.toISOString().slice(0, 10),
    messagesToday: {
      count: messagesToday._count._all,
      recipients: messagesToday._sum.totalRecipients ?? 0,
      delivered,
      failed,
      deliveryRatePercent: resolved > 0 ? Math.round((delivered / resolved) * 1000) / 10 : null,
      costMinorUnits: messagesToday._sum.totalCostMinorUnits ?? 0,
    },
    organizations: { total: organizationsTotal, active: organizationsActive, pendingReview: organizationsPendingReview },
    senderIdRequestsPending,
    openFraudEvents,
  };
}
