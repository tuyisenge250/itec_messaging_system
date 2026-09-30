"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { sandboxApi } from "../../_lib/api";
import { formatMoney } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";
import { Button } from "../../_components/ui/Button";
import { useMounted } from "../../_lib/use-mounted";

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-md bg-foreground p-3 text-xs text-surface"><code>{children}</code></pre>;
}

export default function SandboxGuidePage() {
  const query = useQuery({ queryKey: ["sandbox", "test-numbers"], queryFn: () => sandboxApi.testNumbers() });
  // See app/_lib/use-mounted.ts — avoids a hydration mismatch from reading window.location.origin during render.
  const mounted = useMounted();
  const base = mounted ? window.location.origin : "";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Sandbox Guide" description="Everything you need to exercise the platform without touching a real telecom or payment network." actions={<Link href="/dashboard/messages/new"><Button variant="outline">Send a test SMS</Button></Link>} />

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">What sandbox is</h2>
        <p className="text-sm text-foreground-muted">
          Sandbox is a fully simulated SMS and payment environment. No real SMS is sent, no real money is charged, and no
          telecom or payment provider is ever contacted — every send and every payment is handled by an internal simulator
          that plays both roles (the provider accepting the request, and its later delivery callback). Sandbox and
          production never share a wallet, sender ID, API key, or message — see the environment toggle in the header.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Automatic onboarding</h2>
        <p className="text-sm text-foreground-muted">
          Every new organization automatically receives, with no approval workflow: a sandbox sender ID, a starting
          sandbox balance{query.data ? ` of ${formatMoney(query.data.initialCreditMinorUnits, "RWF")}` : ""}, and a
          sandbox API key. Production requires the real Sender ID request, document review, and RURA workflow —
          sandbox deliberately skips all of it, and never presents itself as real regulatory approval.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Test numbers</h2>
        <p className="text-sm text-foreground-muted">
          {query.data ? `Numbers starting with ${query.data.numberPrefix}` : "Configured sandbox test numbers"} are virtual —
          they are never real recipients, and a message sent to one never leaves the sandbox. Each one deterministically
          produces a specific outcome, so you can reliably test success, failure, and retry handling.
        </p>

        {query.isLoading && <SkeletonTable />}
        {query.isError && <Alert tone="danger">Unable to load test numbers. {errorMessage(query.error)}</Alert>}
        {query.data && (
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
              {query.data.numbers.map((n) => (
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
        <p className="text-xs text-foreground-muted">
          Any other number with a real Rwandan mobile prefix (078/079/072/073/075) is accepted too and, unless it matches
          an admin-configured scenario, is delivered successfully after a short simulated delay.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Sending a test SMS via the API</h2>
        <Code>{`curl -X POST ${base}/api/messages \\\n  -H "Authorization: Bearer sk_test.<publicId>.<secret>" \\\n  -H "Idempotency-Key: test-123" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "senderIdId": "<your sandbox sender ID id>",\n    "recipients": ["${query.data?.numberPrefix ?? "+250700000"}001"],\n    "content": "Hello from sandbox"\n  }'`}</Code>
        <p className="text-sm text-foreground-muted">
          The <code>Idempotency-Key</code> header is optional but recommended — replaying the same key and the same
          request body returns the original result instead of sending twice; reusing it with a different body is
          rejected.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Testing sandbox payments</h2>
        <p className="text-sm text-foreground-muted">
          Buying an SMS package in sandbox (see Wallet → Buy Credits) goes through the same simulated payment provider
          and lets you force a specific outcome (success, failure, timeout, provider unavailable) for testing your own
          error handling — see <Link href="/dashboard/wallet/packages" className="text-brand-600 hover:underline">Buy Credits</Link>.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Production is not sandbox</h2>
        <p className="text-sm text-foreground-muted">
          Production sender IDs go through the real workflow — document upload, internal review, RURA submission, and
          MNO whitelisting — and production sends and payments are billed against your real wallet balance the moment
          the (currently unimplemented) real provider accepts them. There are no sandbox shortcuts in production: every
          security check (authentication, RBAC, rate limits, fraud rules, idempotency) applies equally in both
          environments — sandbox only replaces the external provider, never the platform&rsquo;s own rules.
        </p>
      </Card>
    </div>
  );
}
