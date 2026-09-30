"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Building,
  ClipboardList,
  UserCog,
  MessageSquare,
  Server,
  ShieldAlert,
  FlaskConical,
  Activity,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { adminApi } from "../../_lib/api";
import { formatMoney, formatDate } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, Skeleton, StatGrid } from "../../_components/ui/Layout";
import { Alert } from "../../_components/ui/Alert";
import type { PlatformSummary } from "../../_lib/api/types";

function buildSections(summary?: PlatformSummary): Array<{ href: string; label: string; description: string; icon: LucideIcon; badge?: number }> {
  return [
    {
      href: "/admin/organizations",
      label: "Organizations",
      description: "Review, approve, activate, and suspend organizations.",
      icon: Building,
      badge: summary?.organizations.pendingReview,
    },
    {
      href: "/admin/sender-id-requests",
      label: "Sender ID Requests",
      description: "Review, approve, and reject sender ID requests.",
      icon: ClipboardList,
      badge: summary?.senderIdRequestsPending,
    },
    { href: "/admin/users", label: "Users", description: "Every platform account, across all organizations.", icon: UserCog },
    { href: "/admin/messages", label: "Messages", description: "Cross-organization message oversight.", icon: MessageSquare },
    { href: "/admin/providers", label: "Providers", description: "Configured SMS/payment provider settings (read-only).", icon: Server },
    {
      href: "/admin/fraud",
      label: "Fraud",
      description: "Review flagged sends and configured rate-limit rules.",
      icon: ShieldAlert,
      badge: summary?.openFraudEvents,
    },
    { href: "/admin/simulator/scenarios", label: "Simulator Scenarios", description: "Configure how the simulated SMS provider behaves.", icon: FlaskConical },
    { href: "/admin/simulator/executions", label: "Simulator Executions", description: "History of simulator scenario matches.", icon: Activity },
    { href: "/admin/audit-log", label: "System Audit Log", description: "Every sensitive action across every organization.", icon: ScrollText },
  ];
}

export default function AdminOverviewPage() {
  const query = useQuery({ queryKey: ["admin", "summary"], queryFn: () => adminApi.summary(), refetchInterval: 60_000 });
  const summary = query.data;

  return (
    <div>
      <PageHeader title="Admin Dashboard" description="Platform-wide overview across every organization." />

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Today&rsquo;s overview{summary && ` (${formatDate(summary.date)})`}
        </h2>

        {query.isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-14" />
              </div>
            ))}
          </div>
        )}
        {query.isError && <Alert tone="danger">Unable to load platform summary. {errorMessage(query.error)}</Alert>}
        {summary && (
          <StatGrid
            rows={[
              { label: "Messages sent today", value: summary.messagesToday.count.toLocaleString() },
              { label: "Recipients today", value: summary.messagesToday.recipients.toLocaleString() },
              {
                label: "Delivery rate today",
                value: summary.messagesToday.deliveryRatePercent != null ? `${summary.messagesToday.deliveryRatePercent}%` : "—",
                tone: summary.messagesToday.deliveryRatePercent != null && summary.messagesToday.deliveryRatePercent < 80 ? "danger" : "success",
              },
              { label: "Failed today", value: summary.messagesToday.failed.toLocaleString(), tone: summary.messagesToday.failed > 0 ? "danger" : undefined },
              { label: "Credits consumed today", value: formatMoney(summary.messagesToday.costMinorUnits, "RWF") },
              { label: "Active organizations", value: `${summary.organizations.active} / ${summary.organizations.total}` },
              {
                label: "Organizations pending review",
                value: String(summary.organizations.pendingReview),
                tone: summary.organizations.pendingReview > 0 ? "warning" : undefined,
              },
              {
                label: "Sender ID requests pending",
                value: String(summary.senderIdRequestsPending),
                tone: summary.senderIdRequestsPending > 0 ? "warning" : undefined,
              },
              { label: "Open fraud events", value: String(summary.openFraudEvents), tone: summary.openFraudEvents > 0 ? "danger" : undefined },
            ]}
          />
        )}
      </Card>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-foreground">Manage</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {buildSections(summary).map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}>
              <Card className="h-full transition-colors hover:border-brand-200">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  {!!s.badge && (
                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">{s.badge}</span>
                  )}
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{s.label}</p>
                <p className="mt-1 text-sm text-foreground-muted">{s.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
