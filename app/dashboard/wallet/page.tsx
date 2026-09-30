"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { walletApi } from "../../_lib/api";
import { useEnvironment } from "../../_lib/environment-context";
import { formatMoney } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, StatCard, Card } from "../../_components/ui/Layout";
import { Alert } from "../../_components/ui/Alert";
import { Button } from "../../_components/ui/Button";

export default function WalletPage() {
  const { environment } = useEnvironment();
  const wallet = useQuery({ queryKey: ["wallet", environment], queryFn: () => walletApi.get(environment) });

  return (
    <div>
      <PageHeader
        title="Wallet"
        description={environment}
        actions={
          <Link href="/dashboard/packages">
            <Button>Buy SMS credits</Button>
          </Link>
        }
      />

      {wallet.isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <Card>—</Card>
          <Card>—</Card>
          <Card>—</Card>
        </div>
      )}
      {wallet.isError && <Alert tone="danger">Unable to load wallet. {errorMessage(wallet.error)}</Alert>}
      {wallet.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Available" value={formatMoney(wallet.data.availableBalanceMinorUnits, wallet.data.currency)} tone="brand" hint="Money available for new SMS" />
          <StatCard label="Reserved" value={formatMoney(wallet.data.reservedBalanceMinorUnits, wallet.data.currency)} hint="Temporarily held for queued SMS" />
          <StatCard
            label="Total Balance"
            value={formatMoney(wallet.data.availableBalanceMinorUnits + wallet.data.reservedBalanceMinorUnits, wallet.data.currency)}
          />
        </div>
      )}

      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/dashboard/transactions" className="font-medium text-brand-600 hover:underline">
          View ledger →
        </Link>
        <Link href="/dashboard/payments" className="font-medium text-brand-600 hover:underline">
          View payment history →
        </Link>
      </div>
    </div>
  );
}
