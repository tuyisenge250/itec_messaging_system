"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MessageSquare, CreditCard } from "lucide-react";
import { dashboardApi, orgApi } from "../_lib/api";
import { errorMessage } from "../_lib/api-client";
import { useCurrentOrg, useCurrentUser } from "../_lib/use-current-user";
import { useEnvironment } from "../_lib/environment-context";
import { formatMoney } from "../_lib/format";
import { PageHeader, Card, Skeleton, EmptyState, StatGrid } from "../_components/ui/Layout";
import { Field, Input } from "../_components/ui/Form";
import { Button } from "../_components/ui/Button";
import { Alert } from "../_components/ui/Alert";
import { StatusBadge } from "../_components/ui/Badge";
import { DeliveryBarChart } from "../_components/ui/Chart";
import type { SandboxOnboardingSummary } from "../_lib/api/types";

function SandboxReadyCard({ summary, onContinue }: { summary: SandboxOnboardingSummary; onContinue: () => void }) {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Sandbox ready" description="No RURA approval, documents, or real payment needed to start testing." />
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Sender ID</div>
            <div className="mt-1 font-mono text-sm text-foreground">{summary.senderId.value}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Sandbox balance</div>
            <div className="mt-1 text-sm text-foreground">{formatMoney(summary.initialCreditMinorUnits, "RWF")}</div>
          </div>
        </div>

        <Alert tone="warning" title="Copy this API key now — it will not be shown again">
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{summary.apiKey.plaintextToken}</code>
        </Alert>

        <p className="text-xs text-foreground-muted">
          Test numbers and their behaviours are listed under Developers → Sandbox Guide once you continue.
        </p>

        <Button onClick={onContinue} className="w-full">
          Continue to dashboard
        </Button>
      </Card>
    </div>
  );
}

function CreateOrgForm() {
  const [legalName, setLegalName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<SandboxOnboardingSummary | null>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => orgApi.create(legalName),
    onSuccess: (data) => {
      if (data.sandboxOnboarding) {
        // Deliberately not invalidating ["auth","me"] yet — that would unmount this
        // form immediately (the parent switches away once organizations.length > 0),
        // which would lose the one-time API key reveal before the user can copy it.
        setOnboarding(data.sandboxOnboarding);
      } else {
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      }
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (onboarding) {
    return <SandboxReadyCard summary={onboarding} onContinue={() => queryClient.invalidateQueries({ queryKey: ["auth", "me"] })} />;
  }

  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Create your organization" description="Every resource (sender IDs, messages, wallet) is scoped to an organization." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Legal business name" required>
          <Input required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" loading={create.isPending}>
          Create organization
        </Button>
      </form>
    </div>
  );
}

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const org = useCurrentOrg();
  const { environment } = useEnvironment();

  const summary = useQuery({
    queryKey: ["dashboard", "summary", org?.organizationId, environment],
    queryFn: () => dashboardApi.summary(environment),
    enabled: Boolean(org),
  });

  if (!user) return null;
  if (user.organizations.length === 0) return <CreateOrgForm />;

  return (
    <div>
      <PageHeader title={`Welcome back${user.name ? `, ${user.name}` : ""}`} description={`${org?.organizationName} · ${environment}`} />

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Overview{summary.data && ` — last ${summary.data.windowDays} days`}
        </h2>

        {summary.isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-14" />
              </div>
            ))}
          </div>
        )}
        {summary.isError && <Alert tone="danger">Unable to load dashboard data. {errorMessage(summary.error)}</Alert>}
        {summary.data && (
          <StatGrid
            rows={[
              {
                label: "Available balance",
                value: summary.data.wallet ? formatMoney(summary.data.wallet.availableBalanceMinorUnits, summary.data.wallet.currency) : "—",
              },
              {
                label: "Reserved",
                value: summary.data.wallet ? formatMoney(summary.data.wallet.reservedBalanceMinorUnits, summary.data.wallet.currency) : "—",
              },
              {
                label: "Delivery rate",
                value: summary.data.totals.deliveryRatePercent != null ? `${summary.data.totals.deliveryRatePercent}%` : "—",
                tone: summary.data.totals.deliveryRatePercent != null && summary.data.totals.deliveryRatePercent < 80 ? "danger" : "success",
              },
              { label: "Messages sent", value: summary.data.totals.messagesSent.toLocaleString() },
              { label: "Delivered", value: summary.data.totals.messagesDelivered.toLocaleString(), tone: "success" },
              { label: "Failed", value: summary.data.totals.messagesFailed.toLocaleString(), tone: summary.data.totals.messagesFailed > 0 ? "danger" : undefined },
              { label: "Active campaigns", value: summary.data.activeCampaigns },
              { label: "Active sender IDs", value: summary.data.activeSenderIds },
            ]}
          />
        )}
      </Card>

      {summary.data && (
        <>
          <Card className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Delivery activity — last 14 days</h2>
            <DeliveryBarChart data={summary.data.timeSeries} />
          </Card>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MessageSquare className="h-4 w-4 text-foreground-muted" />
                  Recent messages
                </h2>
                <Link href="/dashboard/messages" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  View all
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {summary.data.recentMessages.length === 0 ? (
                <EmptyState title="No messages yet" description="Send your first SMS to see activity here." />
              ) : (
                <ul className="divide-y divide-border">
                  {summary.data.recentMessages.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="truncate text-foreground">{m.content}</span>
                      <StatusBadge status={m.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CreditCard className="h-4 w-4 text-foreground-muted" />
                  Recent payments
                </h2>
                <Link href="/dashboard/payments" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  View all
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {summary.data.recentPayments.length === 0 ? (
                <EmptyState title="No payments yet" description="Buy an SMS package to top up your wallet." />
              ) : (
                <ul className="divide-y divide-border">
                  {summary.data.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-foreground">{p.package?.name ?? formatMoney(p.amountMinorUnits, p.currency)}</span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
