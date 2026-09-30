"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { senderIdsApi } from "../../_lib/api";
import { formatDate } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";

export default function SenderIdsPage() {
  const query = useQuery({ queryKey: ["sender-ids", "active"], queryFn: () => senderIdsApi.active() });

  return (
    <div>
      <PageHeader
        title="Sender IDs"
        description="Live, active sender IDs your organization can send from."
        actions={
          <Link href="/dashboard/sender-ids/requests">
            <Button variant="outline">Request a sender ID</Button>
          </Link>
        }
      />
      {query.isLoading && (
        <Card>
          <SkeletonTable rows={3} cols={3} />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load sender IDs. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.senderIds.length === 0 && (
        <EmptyState title="No sender IDs yet" description="Submit a sender ID request and it will appear here once approved." />
      )}
      {query.data && query.data.senderIds.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Value</Th>
              <Th>Environment</Th>
              <Th>Status</Th>
              <Th>Activated</Th>
              <Th>Expires</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.senderIds.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium">{s.value}</Td>
                <Td>{s.environment}</Td>
                <Td>
                  <StatusBadge status={s.status} />
                </Td>
                <Td>{s.activatedAt ? formatDate(s.activatedAt) : "—"}</Td>
                <Td>{s.expiresAt ? formatDate(s.expiresAt) : "—"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
