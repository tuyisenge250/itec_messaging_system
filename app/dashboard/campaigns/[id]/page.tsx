"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "../../../_lib/api";
import { formatDateTime, formatMoney } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, StatCard } from "../../../_components/ui/Layout";
import { StatusBadge } from "../../../_components/ui/Badge";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";
import { ConfirmDialog } from "../../../_components/ui/Dialog";

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const campaign = useQuery({ queryKey: ["campaigns", id], queryFn: () => campaignsApi.get(id) });

  const send = useMutation({
    mutationFn: () => campaignsApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", id] });
      setConfirmSend(false);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const cancel = useMutation({
    mutationFn: () => campaignsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", id] });
      setConfirmCancel(false);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (campaign.isLoading) return <p className="text-sm text-foreground-muted">Loading…</p>;
  if (!campaign.data) return <Alert tone="danger">Campaign not found.</Alert>;

  const c = campaign.data;
  const stats = c.stats;

  return (
    <div>
      <PageHeader
        title={c.name}
        description={formatDateTime(c.createdAt)}
        actions={
          <>
            {c.status === "DRAFT" && (
              <Button onClick={() => setConfirmSend(true)} loading={send.isPending}>
                Send now
              </Button>
            )}
            {["DRAFT", "SCHEDULED"].includes(c.status) && (
              <Button variant="outline" onClick={() => setConfirmCancel(true)} loading={cancel.isPending}>
                Cancel
              </Button>
            )}
          </>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="mb-4 flex items-center gap-3">
        <StatusBadge status={c.status} />
        <span className="text-sm text-foreground-muted">{c.environment}</span>
        {c.isRecurring && (
          <span className="text-sm text-foreground-muted">
            Repeats {c.recurrenceInterval?.toLowerCase()}
            {c.nextRunAt && ` · next run ${formatDateTime(c.nextRunAt)}`}
            {c.recurrenceEndAt && ` · until ${formatDateTime(c.recurrenceEndAt)}`}
          </span>
        )}
        {!c.isRecurring && c.status === "SCHEDULED" && c.nextRunAt && (
          <span className="text-sm text-foreground-muted">Scheduled for {formatDateTime(c.nextRunAt)}</span>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={c.totalRecipients} />
          <StatCard label="Queued" value={stats.queued} />
          <StatCard label="Processing" value={stats.processing} />
          <StatCard label="Sent" value={stats.sent} />
          <StatCard label="Delivered" value={stats.delivered} tone="success" />
          <StatCard label="Failed" value={stats.failed} tone={stats.failed > 0 ? "danger" : "default"} />
        </div>
      )}
      {stats && (
        <Card className="mt-4">
          <p className="text-sm text-foreground-muted">Total cost</p>
          <p className="text-lg font-semibold text-foreground">{formatMoney(stats.totalCostMinorUnits, "RWF")}</p>
        </Card>
      )}

      <ConfirmDialog
        open={confirmSend}
        title="Send this campaign?"
        description="This will send SMS to every subscribed contact in the selected group, in batches, and reserve wallet credit accordingly."
        confirmLabel="Send"
        loading={send.isPending}
        onConfirm={() => send.mutate()}
        onCancel={() => setConfirmSend(false)}
      />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this campaign?"
        danger
        confirmLabel="Cancel campaign"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
