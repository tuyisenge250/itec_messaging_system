"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { adminApi, sandboxApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, StatGrid, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { FlaskConical, Activity } from "lucide-react";

export default function SimulatorOverviewPage() {
  const scenarios = useQuery({ queryKey: ["admin", "simulator", "scenarios"], queryFn: () => adminApi.simulator.scenarios() });
  const executions = useQuery({ queryKey: ["admin", "simulator", "executions"], queryFn: () => adminApi.simulator.executions() });
  const testNumbers = useQuery({ queryKey: ["sandbox", "test-numbers"], queryFn: () => sandboxApi.testNumbers() });

  const enabledCount = scenarios.data?.scenarios.filter((s) => s.enabled).length ?? 0;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Simulator"
        description="The simulator stands in for a real SMS/payment provider — no real telecom or payment network is ever contacted."
        actions={
          <Link href="/admin/organizations">
            <Button variant="outline">Act as an organization to test a send</Button>
          </Link>
        }
      />

      <Card>
        <p className="mb-3 text-sm font-semibold text-foreground">At a glance</p>
        <StatGrid
          rows={[
            { label: "Scenarios configured", value: scenarios.data?.scenarios.length ?? "—" },
            { label: "Enabled", value: enabledCount },
            { label: "Executions recorded", value: executions.data?.executions.length ?? "—" },
          ]}
        />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">How this works</h2>
        <p className="text-sm text-foreground-muted">
          Executions aren&apos;t triggered from this page — they&apos;re created automatically whenever a real message is
          sent through an organization&apos;s sandbox (or a production environment still configured with the simulator
          provider). Each send is matched against the scenarios below, in priority order, and the outcome — accepted or
          rejected immediately, then delivered/failed/expired after a delay — gets recorded as an execution.
        </p>
        <p className="text-sm text-foreground-muted">
          To see one happen: use <strong>&quot;Act as an organization&quot;</strong> above to open a real organization&apos;s
          dashboard, then send a message to one of the deterministic test numbers below. It&apos;ll show up on the{" "}
          <Link href="/admin/simulator/executions" className="font-medium text-brand-600 hover:underline">
            Executions
          </Link>{" "}
          page within a few seconds.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/simulator/scenarios">
          <Card className="flex h-full items-start gap-3 transition-colors hover:border-brand-300">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div>
              <p className="text-sm font-semibold text-foreground">Scenarios</p>
              <p className="mt-0.5 text-xs text-foreground-muted">Configure which phone numbers, sender IDs, or organizations trigger a specific outcome.</p>
            </div>
          </Card>
        </Link>
        <Link href="/admin/simulator/executions">
          <Card className="flex h-full items-start gap-3 transition-colors hover:border-brand-300">
            <Activity className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div>
              <p className="text-sm font-semibold text-foreground">Executions</p>
              <p className="mt-0.5 text-xs text-foreground-muted">History of every simulated send — which scenario matched, and the outcome.</p>
            </div>
          </Card>
        </Link>
      </div>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Deterministic test numbers</h2>
        <p className="text-sm text-foreground-muted">
          {testNumbers.data ? `Numbers starting with ${testNumbers.data.numberPrefix}` : "Sandbox test numbers"} always produce the same
          outcome — send to one of these from any organization&apos;s sandbox to reliably exercise success, failure, retry, and timeout handling.
        </p>
        {testNumbers.isLoading && <SkeletonTable rows={3} />}
        {testNumbers.isError && <Alert tone="danger">Unable to load test numbers. {errorMessage(testNumbers.error)}</Alert>}
        {testNumbers.data && (
          <Table>
            <Thead>
              <tr>
                <Th>Number</Th>
                <Th>Behaviour</Th>
                <Th>Provider response</Th>
                <Th>Final status</Th>
              </tr>
            </Thead>
            <Tbody>
              {testNumbers.data.numbers.map((n) => (
                <Tr key={n.phoneNumber}>
                  <Td className="font-mono text-xs">{n.phoneNumber}</Td>
                  <Td className="max-w-64 text-xs text-foreground-muted">{n.description ?? n.name}</Td>
                  <Td>
                    <StatusBadge status={n.initialProviderStatus} />
                  </Td>
                  <Td>
                    <StatusBadge status={n.finalDeliveryStatus} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
