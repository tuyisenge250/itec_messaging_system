"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge, Badge } from "../../_components/ui/Badge";
import { Tabs } from "../../_components/ui/Tabs";
import { Alert } from "../../_components/ui/Alert";

export default function AdminFraudPage() {
  const [tab, setTab] = useState("events");
  const queryClient = useQueryClient();
  const events = useQuery({ queryKey: ["admin", "fraud-events"], queryFn: () => adminApi.fraudEvents(), enabled: tab === "events" });
  const rules = useQuery({ queryKey: ["admin", "fraud-rules"], queryFn: () => adminApi.fraudRules(), enabled: tab === "rules" });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "RESOLVED" | "DISMISSED" }) => adminApi.reviewFraudEvent(id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "fraud-events"] }),
  });

  return (
    <div>
      <PageHeader title="Fraud" />
      <div className="mb-4">
        <Tabs tabs={[{ id: "events", label: "Events" }, { id: "rules", label: "Rules" }]} active={tab} onChange={setTab} />
      </div>

      {tab === "events" && (
        <>
          {events.isLoading && (
            <Card>
              <SkeletonTable />
            </Card>
          )}
          {events.isError && <Alert tone="danger">Unable to load fraud events. {errorMessage(events.error)}</Alert>}
          {events.data && events.data.events.length === 0 && <EmptyState title="No fraud events" description="Nothing has tripped a fraud rule yet." />}
          {events.data && events.data.events.length > 0 && (
            <Table>
              <Thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Severity</Th>
                  <Th>Description</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th />
                </tr>
              </Thead>
              <Tbody>
                {events.data.events.map((e) => (
                  <Tr key={e.id}>
                    <Td>{e.eventType}</Td>
                    <Td>
                      <Badge tone={e.severity === "CRITICAL" || e.severity === "HIGH" ? "danger" : e.severity === "MEDIUM" ? "warning" : "neutral"}>{e.severity}</Badge>
                    </Td>
                    <Td className="max-w-80 truncate">{e.description}</Td>
                    <Td>
                      <StatusBadge status={e.status} />
                    </Td>
                    <Td>{formatDateTime(e.createdAt)}</Td>
                    <Td className="space-x-2 text-xs">
                      {e.status === "OPEN" && (
                        <>
                          <button onClick={() => review.mutate({ id: e.id, decision: "RESOLVED" })} className="text-success hover:underline">
                            Resolve
                          </button>
                          <button onClick={() => review.mutate({ id: e.id, decision: "DISMISSED" })} className="text-foreground-muted hover:underline">
                            Dismiss
                          </button>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </>
      )}

      {tab === "rules" && (
        <>
          {rules.isLoading && (
            <Card>
              <SkeletonTable />
            </Card>
          )}
          {rules.data && (
            <Table>
              <Thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Threshold</Th>
                  <Th>Window</Th>
                  <Th>Action</Th>
                  <Th>Scope</Th>
                  <Th>Enabled</Th>
                </tr>
              </Thead>
              <Tbody>
                {rules.data.rules.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.name}</Td>
                    <Td>{r.ruleType}</Td>
                    <Td>{r.thresholdValue}</Td>
                    <Td>{r.windowSeconds ? `${r.windowSeconds}s` : "—"}</Td>
                    <Td>{r.action}</Td>
                    <Td>{r.scope}</Td>
                    <Td>
                      <Badge tone={r.enabled ? "success" : "neutral"}>{r.enabled ? "Yes" : "No"}</Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
