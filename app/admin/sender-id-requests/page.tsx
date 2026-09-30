"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDate } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";

export default function AdminSenderIdsPage() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["admin", "sender-id-requests"], queryFn: () => adminApi.senderIdRequests() });

  return (
    <div>
      <PageHeader title="Sender ID Requests" description="Internal review + RURA workflow representation across every organization." />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load requests. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.senderIdRequests.length === 0 && <EmptyState title="No requests yet" />}
      {query.data && query.data.senderIdRequests.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Value</Th>
              <Th>Organization</Th>
              <Th>Environment</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.senderIdRequests.map((r) => (
              <Tr key={r.id} onClick={() => router.push(`/admin/sender-id-requests/${r.id}`)}>
                <Td className="font-medium">{r.requestedValue}</Td>
                <Td>{r.organization?.legalName ?? "—"}</Td>
                <Td>{r.environment}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td>{formatDate(r.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
