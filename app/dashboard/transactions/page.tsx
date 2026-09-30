"use client";

import { useQuery } from "@tanstack/react-query";
import { walletApi } from "../../_lib/api";
import { useEnvironment } from "../../_lib/environment-context";
import { formatDateTime, formatMoney } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Badge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";

const TYPE_TONE: Record<string, "success" | "danger" | "info" | "neutral"> = {
  CREDIT: "success",
  BONUS: "success",
  REFUND: "success",
  SMS_USAGE: "danger",
  ADJUSTMENT: "info",
  RESERVATION: "neutral",
  RESERVATION_RELEASE: "neutral",
};

export default function TransactionsPage() {
  const { environment } = useEnvironment();
  const query = useQuery({ queryKey: ["wallet-transactions", environment], queryFn: () => walletApi.transactions(environment) });

  return (
    <div>
      <PageHeader title="Transactions" description={`Wallet ledger — ${environment}`} />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load transactions. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.transactions.length === 0 && <EmptyState title="No transactions yet" />}
      {query.data && query.data.transactions.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Balance after</Th>
              <Th>Description</Th>
              <Th>Date</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.transactions.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <Badge tone={TYPE_TONE[t.type] ?? "neutral"}>{t.type.replaceAll("_", " ")}</Badge>
                </Td>
                <Td className={t.amountMinorUnits < 0 ? "text-danger" : "text-success"}>
                  {t.amountMinorUnits > 0 ? "+" : ""}
                  {formatMoney(t.amountMinorUnits, "RWF")}
                </Td>
                <Td>{formatMoney(t.balanceAfterMinorUnits, "RWF")}</Td>
                <Td>{t.description ?? "—"}</Td>
                <Td>{formatDateTime(t.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
