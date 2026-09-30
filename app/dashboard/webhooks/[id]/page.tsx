"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { webhooksApi } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { StatusBadge } from "../../../_components/ui/Badge";
import { Alert } from "../../../_components/ui/Alert";

export default function WebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deliveries = useQuery({ queryKey: ["webhooks", id, "deliveries"], queryFn: () => webhooksApi.deliveries(id) });

  return (
    <div>
      <PageHeader title="Webhook delivery history" />
      {deliveries.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {deliveries.isError && <Alert tone="danger">Unable to load deliveries. {errorMessage(deliveries.error)}</Alert>}
      {deliveries.data && deliveries.data.deliveries.length === 0 && <EmptyState title="No deliveries yet" description="Deliveries will appear here once a message reaches a terminal status." />}
      {deliveries.data && deliveries.data.deliveries.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th>Attempts</Th>
              <Th>Response status</Th>
              <Th>Last attempt</Th>
              <Th>Error</Th>
            </tr>
          </Thead>
          <Tbody>
            {deliveries.data.deliveries.map((d) => (
              <Tr key={d.id}>
                <Td>{d.eventType}</Td>
                <Td>
                  <StatusBadge status={d.status} />
                </Td>
                <Td>{d.attempts}</Td>
                <Td>{d.responseStatus ?? "—"}</Td>
                <Td>{d.lastAttemptAt ? formatDateTime(d.lastAttemptAt) : "—"}</Td>
                <Td className="max-w-64 truncate text-xs text-danger">{d.lastError ?? "—"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
