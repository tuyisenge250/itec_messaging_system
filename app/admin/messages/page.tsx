"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";

export default function AdminMessagesPage() {
  const query = useQuery({ queryKey: ["admin", "messages"], queryFn: () => adminApi.messages() });

  return (
    <div>
      <PageHeader title="Messages" description="Cross-organization oversight." />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load messages. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.messages.length === 0 && <EmptyState title="No messages yet" />}
      {query.data && query.data.messages.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Content</Th>
              <Th>Status</Th>
              <Th>Recipients</Th>
              <Th>Delivered</Th>
              <Th>Failed</Th>
              <Th>Created</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.messages.map((m) => (
              <Tr key={m.id}>
                <Td className="max-w-80 truncate">{m.content}</Td>
                <Td>
                  <StatusBadge status={m.status} />
                </Td>
                <Td>{m.totalRecipients}</Td>
                <Td>{m.deliveredCount}</Td>
                <Td>{m.failedCount}</Td>
                <Td>{formatDateTime(m.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
