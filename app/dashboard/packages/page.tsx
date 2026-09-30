"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { walletApi } from "../../_lib/api";
import { useEnvironment } from "../../_lib/environment-context";
import { formatMoney } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState } from "../../_components/ui/Layout";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { useToast } from "../../_components/ui/Toast";

export default function PackagesPage() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const packages = useQuery({ queryKey: ["packages"], queryFn: () => walletApi.packages() });

  const buy = useMutation({
    mutationFn: (packageId: string) => walletApi.buy(environment, packageId, crypto.randomUUID()),
    onMutate: (packageId) => setBuyingId(packageId),
    onSuccess: (intent) => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["payment-intents"] });
      if (intent.status === "SUCCEEDED") toast.push("Payment succeeded — wallet credited.", "success");
      else toast.push(`Payment ${intent.status.toLowerCase()}`, "danger");
    },
    onError: (err) => setError(errorMessage(err)),
    onSettled: () => setBuyingId(null),
  });

  return (
    <div>
      <PageHeader title="SMS Packages" description={`Buying into your ${environment} wallet — payments are simulated at this stage.`} />
      {error && <Alert tone="danger">{error}</Alert>}
      {packages.data && packages.data.packages.length === 0 && <EmptyState title="No packages available" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.data?.packages.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <p className="text-sm font-semibold text-foreground">{p.name}</p>
            {p.description && <p className="mt-1 text-xs text-foreground-muted">{p.description}</p>}
            <p className="mt-3 text-2xl font-semibold text-brand-600">{formatMoney(p.priceMinorUnits, p.currency)}</p>
            <p className="text-xs text-foreground-muted">
              Credits {formatMoney(p.creditAmountMinorUnits, p.currency)}
              {p.bonusMinorUnits > 0 && ` + ${formatMoney(p.bonusMinorUnits, p.currency)} bonus`}
            </p>
            <Button className="mt-4" loading={buyingId === p.id} onClick={() => buy.mutate(p.id)}>
              Buy
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
