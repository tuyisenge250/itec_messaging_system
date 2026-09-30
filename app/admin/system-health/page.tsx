"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, SkeletonTable } from "../../_components/ui/Layout";
import { Badge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";
import type { SystemHealthCheck } from "../../_lib/api/types";

function CheckCard({ label, check }: { label: string; check: SystemHealthCheck }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <Badge tone={check.status === "HEALTHY" ? "success" : check.status === "DEGRADED" ? "warning" : "danger"}>{check.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-foreground-muted">{check.latencyMs}ms</p>
      {check.error && <p className="mt-1 text-xs text-danger">{check.error}</p>}
    </Card>
  );
}

export default function AdminSystemHealthPage() {
  const query = useQuery({ queryKey: ["admin", "system", "health"], queryFn: () => adminApi.systemHealth(), refetchInterval: 15_000 });

  return (
    <div>
      <PageHeader title="System Health" description="Live checks against Postgres, Redis, and each BullMQ queue. Refreshes every 15s." />
      {query.isLoading && (
        <Card>
          <SkeletonTable rows={3} />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load system health. {errorMessage(query.error)}</Alert>}
      {query.data && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CheckCard label="PostgreSQL" check={query.data.postgres} />
            <CheckCard label="Redis" check={query.data.redis} />
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">Queues</p>
            {query.data.queuesError && <Alert tone="danger">{query.data.queuesError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {query.data.queues.map((q) => (
                <Card key={q.name}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{q.name}</p>
                    <Badge tone={q.status === "HEALTHY" ? "success" : "warning"}>{q.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {q.waiting} waiting · {q.active} active · {q.failed} failed
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
