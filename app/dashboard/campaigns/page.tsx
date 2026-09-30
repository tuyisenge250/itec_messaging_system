"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { campaignsApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";

export default function CampaignsPage() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["campaigns"], queryFn: () => campaignsApi.list() });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        actions={
          <Link href="/dashboard/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load campaigns. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.campaigns.length === 0 && (
        <EmptyState title="No campaigns yet" description="Create your first campaign to start sending SMS to a contact group." />
      )}
      {query.data && query.data.campaigns.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Environment</Th>
              <Th>Recipients</Th>
              <Th>Scheduled</Th>
              <Th>Recurring</Th>
              <Th>Created</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.campaigns.map((c) => (
              <Tr key={c.id} onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}>
                <Td>{c.name}</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td>{c.environment}</Td>
                <Td>{c.totalRecipients}</Td>
                <Td>{c.scheduledAt ? formatDateTime(c.scheduledAt) : "—"}</Td>
                <Td>{c.isRecurring ? c.recurrenceInterval : "—"}</Td>
                <Td>{formatDateTime(c.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
