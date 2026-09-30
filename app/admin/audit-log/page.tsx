"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Alert } from "../../_components/ui/Alert";

export default function AdminAuditPage() {
  const query = useQuery({ queryKey: ["admin", "audit-logs"], queryFn: () => adminApi.auditLogs() });

  return (
    <div>
      <PageHeader title="System Audit Log" description="Every sensitive action across every organization." />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load audit log. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.events.length === 0 && <EmptyState title="No audit events yet" />}
      {query.data && query.data.events.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Action</Th>
              <Th>Actor</Th>
              <Th>Organization</Th>
              <Th>Resource</Th>
              <Th>IP</Th>
              <Th>Date</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.events.map((e) => (
              <Tr key={e.id}>
                <Td>{e.action}</Td>
                <Td>
                  {e.actorType}
                  {e.actorUserId && ` #${e.actorUserId.slice(0, 8)}`}
                </Td>
                <Td className="font-mono text-xs">{e.organizationId?.slice(0, 8) ?? "—"}</Td>
                <Td>
                  {e.resourceType}
                  {e.resourceId && ` #${e.resourceId.slice(0, 8)}`}
                </Td>
                <Td className="font-mono text-xs">{e.ipAddress ?? "—"}</Td>
                <Td>{formatDateTime(e.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
