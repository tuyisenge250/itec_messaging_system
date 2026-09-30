"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Select } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { useToast } from "../../_components/ui/Toast";

const PAGE_SIZE = 25;

export default function AdminOutboxPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];

  const query = useQuery({
    queryKey: ["admin", "outbox", status, cursor],
    queryFn: () => adminApi.outboxEvents(status || undefined, cursor),
  });

  const retry = useMutation({
    mutationFn: (id: string) => adminApi.retryOutboxEvent(id),
    onSuccess: () => {
      toast.push("Outbox event retried", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "outbox"] });
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div>
      <PageHeader title="Outbox" description="Transactional outbox events — retry one that hit its max attempts and flipped to FAILED." />

      <div className="mb-4 max-w-xs">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursors([]);
          }}
        >
          <option value="">All statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="FAILED">FAILED</option>
        </Select>
      </div>

      {query.isLoading && (
        <Card>
          <SkeletonTable rows={4} />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load outbox events. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.events.length === 0 && <EmptyState title="No outbox events" />}
      {query.data && query.data.events.length > 0 && (
        <>
          <Table>
            <Thead>
              <tr>
                <Th>Event type</Th>
                <Th>Aggregate</Th>
                <Th>Status</Th>
                <Th>Attempts</Th>
                <Th>Last error</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </Thead>
            <Tbody>
              {query.data.events.map((e) => (
                <Tr key={e.id}>
                  <Td>{e.eventType}</Td>
                  <Td className="font-mono text-xs">
                    {e.aggregateType}:{e.aggregateId}
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                  </Td>
                  <Td>{e.attempts}</Td>
                  <Td className="max-w-xs truncate text-xs text-foreground-muted">{e.lastError ?? "—"}</Td>
                  <Td>{formatDateTime(e.createdAt)}</Td>
                  <Td>
                    {e.status === "FAILED" && (
                      <Button size="sm" variant="outline" onClick={() => retry.mutate(e.id)} loading={retry.isPending}>
                        Retry
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination
            hasMore={query.data.events.length === PAGE_SIZE}
            canGoBack={cursors.length > 0}
            loading={query.isFetching}
            onNext={() => setCursors((c) => [...c, query.data!.events[query.data!.events.length - 1].id])}
            onPrev={() => setCursors((c) => c.slice(0, -1))}
          />
        </>
      )}
    </div>
  );
}
