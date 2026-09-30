"use client";

import Link from "next/link";
import { PageHeader, Card } from "../../_components/ui/Layout";
import { useMounted } from "../../_lib/use-mounted";

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-md bg-foreground p-3 text-xs text-surface"><code>{children}</code></pre>;
}

export default function ApiDocsPage() {
  // Reads window.location.origin only after mount — computing it directly during
  // render would make the server (no window) and the client's first render (window
  // already exists) produce different text, causing a hydration mismatch.
  const mounted = useMounted();
  const base = mounted ? window.location.origin : "";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="API Documentation" description="A quick-start reference for the same REST API this dashboard uses." />

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Authentication</h2>
        <p className="text-sm text-foreground-muted">
          Dashboard requests use a session cookie. Programmatic access uses an API key in the <code>Authorization</code> header,
          created under <Link href="/dashboard/api-keys" className="text-brand-600 hover:underline">API Keys</Link>. A key is permanently
          bound to sandbox or production — a sandbox key can never reach production resources or vice versa.
        </p>
        <Code>{`curl ${base}/api/messages \\\n  -H "Authorization: Bearer sk_test.<publicId>.<secret>"`}</Code>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Sending an SMS</h2>
        <Code>{`curl -X POST ${base}/api/messages \\\n  -H "Authorization: Bearer sk_test.<publicId>.<secret>" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "senderIdId": "<your active sender ID id>",\n    "recipients": ["+250788000001"],\n    "content": "Hello from SMS Gateway",\n    "clientReference": "order-123"\n  }'`}</Code>
        <p className="text-sm text-foreground-muted">
          Requires the <code>sms.send</code> scope. The response includes accepted/rejected recipient counts — invalid phone
          numbers are rejected before any wallet credit is reserved.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Idempotency</h2>
        <p className="text-sm text-foreground-muted">
          For payment endpoints, pass an <code>Idempotency-Key</code> header. Replaying the same key returns the original result
          without charging or crediting again.
        </p>
        <Code>{`curl -X POST ${base}/api/payment-intents \\\n  -H "Authorization: Bearer sk_test.<publicId>.<secret>" \\\n  -H "Idempotency-Key: <unique-key>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"environment": "SANDBOX", "packageId": "<package id>"}'`}</Code>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Delivery statuses</h2>
        <p className="text-sm text-foreground-muted">
          A recipient moves through <code>QUEUED → PROCESSING → SENT → DELIVERED</code> (or <code>FAILED</code>/<code>EXPIRED</code>/
          <code>REJECTED</code>/<code>CANCELLED</code>). Poll <code>GET /api/messages/:id</code> or configure a webhook (see{" "}
          <Link href="/dashboard/webhooks" className="text-brand-600 hover:underline">Webhooks</Link>) to be notified on{" "}
          <code>message.delivered</code> / <code>message.failed</code>.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Errors</h2>
        <p className="text-sm text-foreground-muted">Every error response has the same shape:</p>
        <Code>{`{\n  "success": false,\n  "error": { "code": "INSUFFICIENT_BALANCE", "message": "Insufficient SMS credits", "requestId": "..." }\n}`}</Code>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Sandbox vs production</h2>
        <p className="text-sm text-foreground-muted">
          Sandbox uses a simulated SMS/payment provider — no real message is sent and no real money moves. See{" "}
          <Link href="/dashboard/sender-ids/requests" className="text-brand-600 hover:underline">Sender ID Requests</Link> to request a
          production sender ID once your organization is verified.
        </p>
      </Card>
    </div>
  );
}
