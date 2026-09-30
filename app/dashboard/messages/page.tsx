"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { messagesApi } from "../../_lib/api";
import { useEnvironment } from "../../_lib/environment-context";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Select } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";

const STATUSES = ["", "SCHEDULED", "QUEUED", "PROCESSING", "SENT", "DELIVERED", "PARTIALLY_DELIVERED", "FAILED", "REJECTED", "CANCELLED"];
const PAGE_SIZE = 25;

export default function MessagesPage() {
  const router = useRouter();
  const { environment } = useEnvironment();
  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);

  const cursor = cursors[cursors.length - 1];
  const query = useQuery({
    queryKey: ["messages", environment, status, cursor],
    queryFn: () => messagesApi.list(environment, status || undefined, cursor),
  });

  return (
    <div>
      <PageHeader
        title="Messages"
        description={environment}
        actions={
          <Link href="/dashboard/messages/new">
            <Button>Send new</Button>
          </Link>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setCursors([]);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load messages. {errorMessage(query.error)}</Alert>}

      {query.data && query.data.messages.length === 0 && (
        <EmptyState title="No messages" description="Send your first SMS to see it here." action={<Link href="/dashboard/messages/new" className="text-sm font-medium text-brand-600 hover:underline">Send SMS</Link>} />
      )}

      {query.data && query.data.messages.length > 0 && (
        <>
          <Table>
            <Thead>
              <tr>
                <Th>Content</Th>
                <Th>Status</Th>
                <Th>Recipients</Th>
                <Th>Delivered</Th>
                <Th>Failed</Th>
                <Th>Cost</Th>
                <Th>Created</Th>
              </tr>
            </Thead>
            <Tbody>
              {query.data.messages.map((m) => (
                <Tr key={m.id} onClick={() => router.push(`/dashboard/messages/${m.id}`)}>
                  <Td className="max-w-xs truncate">{m.content}</Td>
                  <Td>
                    <StatusBadge status={m.status} />
                  </Td>
                  <Td>{m.totalRecipients}</Td>
                  <Td>{m.deliveredCount}</Td>
                  <Td>{m.failedCount}</Td>
                  <Td>
                    {m.totalCostMinorUnits} {m.currency}
                  </Td>
                  <Td>{formatDateTime(m.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination
            hasMore={query.data.messages.length === PAGE_SIZE}
            canGoBack={cursors.length > 0}
            loading={query.isFetching}
            onNext={() => setCursors((c) => [...c, query.data!.messages[query.data!.messages.length - 1].id])}
            onPrev={() => setCursors((c) => c.slice(0, -1))}
          />
        </>
      )}
    </div>
  );
}
