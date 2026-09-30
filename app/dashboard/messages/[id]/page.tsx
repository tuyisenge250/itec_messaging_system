"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { messagesApi } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { StatusBadge } from "../../../_components/ui/Badge";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";

const STAGES = ["QUEUED", "PROCESSING", "SENT", "DELIVERED"];

function RecipientTimeline({ recipientId }: { recipientId: string }) {
  const txs = useQuery({ queryKey: ["recipient-transactions", recipientId], queryFn: () => messagesApi.recipientTransactions(recipientId) });
  if (txs.isLoading) return <p className="text-xs text-foreground-muted">Loading provider history…</p>;
  if (!txs.data || txs.data.transactions.length === 0) return <p className="text-xs text-foreground-muted">No provider calls recorded yet.</p>;
  return (
    <ul className="space-y-1.5">
      {txs.data.transactions.map((t) => (
        <li key={t.id} className="flex items-center justify-between text-xs">
          <span className="text-foreground-muted">
            Attempt {t.attempt} · {t.providerCode}
            {t.providerMessageId && ` · ${t.providerMessageId}`}
          </span>
          <StatusBadge status={t.status} />
        </li>
      ))}
    </ul>
  );
}

export default function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const message = useQuery({ queryKey: ["messages", id], queryFn: () => messagesApi.get(id) });
  const recipients = useQuery({ queryKey: ["messages", id, "recipients"], queryFn: () => messagesApi.recipients(id) });

  const cancel = useMutation({
    mutationFn: () => messagesApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
    onError: (err) => setError(errorMessage(err)),
  });

  if (message.isLoading) return <SkeletonTable rows={3} cols={3} />;
  if (message.isError || !message.data) return <Alert tone="danger">Message not found.</Alert>;

  const m = message.data;
  const currentStageIndex = STAGES.indexOf(m.status) >= 0 ? STAGES.indexOf(m.status) : m.status === "PARTIALLY_DELIVERED" ? 3 : -1;

  return (
    <div>
      <PageHeader
        title="Message"
        description={formatDateTime(m.createdAt)}
        actions={
          ["SCHEDULED", "QUEUED"].includes(m.status) && (
            <Button variant="outline" size="sm" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              Cancel
            </Button>
          )
        }
      />
      {error && (
        <Alert tone="danger" title="Could not cancel">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-sm text-foreground">{m.content}</p>
        </Card>
        <Card className="space-y-2 text-sm">
          <Row label="Status" value={<StatusBadge status={m.status} />} />
          <Row label="Type" value={m.type} />
          <Row label="Total recipients" value={String(m.totalRecipients)} />
          <Row label="Delivered" value={String(m.deliveredCount)} />
          <Row label="Failed" value={String(m.failedCount)} />
          <Row label="Total cost" value={`${m.totalCostMinorUnits} ${m.currency}`} />
          {m.clientReference && <Row label="Client reference" value={m.clientReference} />}
        </Card>
      </div>

      {["FAILED", "REJECTED"].includes(m.status) ? null : m.status !== "CANCELLED" ? (
        <div className="mt-4 flex items-center gap-1 overflow-x-auto text-xs">
          {STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center gap-1">
              <span className={`rounded-full px-2 py-1 font-medium ${i <= currentStageIndex ? "bg-brand-50 text-brand-700" : "bg-background text-foreground-muted"}`}>{stage}</span>
              {i < STAGES.length - 1 && <span className="text-foreground-muted">→</span>}
            </div>
          ))}
        </div>
      ) : null}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">Recipients</h2>
      {recipients.isLoading && <SkeletonTable />}
      {recipients.data && (
        <Table>
          <Thead>
            <tr>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Encoding</Th>
              <Th>Segments</Th>
              <Th>Cost</Th>
              <Th>Attempts</Th>
              <Th>Failure reason</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {recipients.data.recipients.map((r) => (
              <>
                <Tr key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <Td>{r.phoneNormalized}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>{r.encoding.replace("_", "-")}</Td>
                  <Td>{r.segmentCount}</Td>
                  <Td>
                    {r.costMinorUnits} {r.currency}
                  </Td>
                  <Td>{r.attempts}</Td>
                  <Td className="max-w-64 truncate">{r.failureReason ?? "—"}</Td>
                  <Td className="text-brand-600">{expanded === r.id ? "Hide" : "Details"}</Td>
                </Tr>
                {expanded === r.id && (
                  <tr key={`${r.id}-detail`}>
                    <td colSpan={8} className="border-t border-border bg-background px-3 py-3">
                      <RecipientTimeline recipientId={r.id} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
