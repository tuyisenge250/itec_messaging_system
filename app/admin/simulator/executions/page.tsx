"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { StatusBadge } from "../../../_components/ui/Badge";
import { Alert } from "../../../_components/ui/Alert";

export default function ExecutionsPage() {
  const query = useQuery({ queryKey: ["admin", "simulator", "executions"], queryFn: () => adminApi.simulator.executions() });

  return (
    <div>
      <PageHeader title="Simulator Executions" />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load executions. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.executions.length === 0 && <EmptyState title="No executions yet" />}
      {query.data && query.data.executions.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Scenario</Th>
              <Th>Recipient</Th>
              <Th>Initial</Th>
              <Th>Final</Th>
              <Th>Delay</Th>
              <Th>Executed</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.executions.map((e) => (
              <Tr key={e.id}>
                <Td>{e.scenario?.name ?? "— default —"}</Td>
                <Td className="font-mono text-xs">{e.recipientId}</Td>
                <Td>
                  <StatusBadge status={e.initialStatus} />
                </Td>
                <Td>{e.finalStatus ? <StatusBadge status={e.finalStatus} /> : "pending"}</Td>
                <Td>{e.delayMsApplied}ms</Td>
                <Td>{formatDateTime(e.executedAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
