"use client";

import { useQuery } from "@tanstack/react-query";
import { walletApi } from "../../_lib/api";
import { useEnvironment } from "../../_lib/environment-context";
import { formatDateTime, formatMoney } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";

export default function PaymentsPage() {
  const { environment } = useEnvironment();
  const query = useQuery({ queryKey: ["payment-intents", environment], queryFn: () => walletApi.paymentIntents(environment) });

  return (
    <div>
      <PageHeader title="Payments" description={environment} />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load payments. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.paymentIntents.length === 0 && <EmptyState title="No payments yet" description="Buy an SMS package to see payment history here." />}
      {query.data && query.data.paymentIntents.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Package</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Provider reference</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {query.data.paymentIntents.map((p) => (
              <Tr key={p.id}>
                <Td>{p.package?.name ?? "Custom top-up"}</Td>
                <Td>{formatMoney(p.amountMinorUnits, p.currency)}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td className="font-mono text-xs">{p.providerReference ?? "—"}</Td>
                <Td>{formatDateTime(p.createdAt)}</Td>
                <Td>
                  {p.status === "SUCCEEDED" && (
                    <a href={`/api/payment-intents/${p.id}/invoice`} className="text-xs font-medium text-brand-600 hover:underline">
                      Download invoice
                    </a>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
