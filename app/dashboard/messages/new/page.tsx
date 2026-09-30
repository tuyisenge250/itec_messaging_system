"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { messagesApi, senderIdsApi, sandboxApi } from "../../../_lib/api";
import { errorMessage } from "../../../_lib/api-client";
import { useEnvironment } from "../../../_lib/environment-context";
import { useCurrentOrg } from "../../../_lib/use-current-user";
import { formatMoney } from "../../../_lib/format";
import { PageHeader, Card } from "../../../_components/ui/Layout";
import { Field, Input, Select, Textarea } from "../../../_components/ui/Form";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";

export default function NewMessagePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const org = useCurrentOrg();
  const { environment } = useEnvironment();

  const [senderIdId, setSenderIdId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [content, setContent] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ acceptedRecipients: number; rejectedRecipients: number } | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const sandboxNumbers = useQuery({
    queryKey: ["sandbox", "test-numbers"],
    queryFn: () => sandboxApi.testNumbers(),
    enabled: environment === "SANDBOX",
  });

  const senderIds = useQuery({
    queryKey: ["sender-ids", "active", org?.organizationId],
    queryFn: () => senderIdsApi.active(),
    enabled: Boolean(org),
  });
  const activeSenderIds = (senderIds.data?.senderIds ?? []).filter((s) => s.status === "ACTIVE" && s.environment === environment);

  const recipientList = recipients
    .split(/[\n,]/)
    .map((r) => r.trim())
    .filter(Boolean);

  const estimate = useQuery({
    queryKey: ["messages", "estimate", content, recipientList.length, environment],
    queryFn: () => messagesApi.estimate(environment, content, recipientList.length || 1),
    enabled: content.length > 0,
  });

  const send = useMutation({
    mutationFn: () =>
      messagesApi.send(
        environment,
        {
          senderIdId,
          recipients: recipientList,
          content,
          clientReference: clientReference || undefined,
          scheduledAt: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
        idempotencyKey,
      ),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      setTimeout(() => router.push(`/dashboard/messages/${data.message.id}`), 1500);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader title="Send SMS" description={`Environment: ${environment}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            // Guards against a sender ID selected before an environment toggle switch —
            // the dropdown's *options* update immediately, but a stale selected id could
            // otherwise still be submitted for the wrong environment.
            if (!activeSenderIds.some((s) => s.id === senderIdId)) {
              setError(`Select a ${environment.toLowerCase()} sender ID before sending.`);
              return;
            }
            send.mutate();
          }}
          className="space-y-4 lg:col-span-2"
        >
          <Card className="space-y-4">
            {activeSenderIds.length === 0 && !senderIds.isLoading && (
              <Alert tone="warning">No active sender IDs for {environment}. Request one under Sender IDs first.</Alert>
            )}
            <Field label="Sender ID" required>
              <Select required value={senderIdId} onChange={(e) => setSenderIdId(e.target.value)}>
                <option value="" disabled>
                  Select…
                </option>
                {activeSenderIds.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Recipients" required hint="One per line, or comma-separated. Rwandan MSISDN format.">
              <Textarea required rows={4} className="font-mono text-xs" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={"+250788000001\n+250788000002"} />
            </Field>
            {environment === "SANDBOX" && sandboxNumbers.data && sandboxNumbers.data.numbers.length > 0 && (
              <div className="-mt-2">
                <p className="mb-1.5 text-xs text-foreground-muted">
                  Use a test number for a deterministic outcome (
                  <Link href="/dashboard/sandbox" className="text-brand-600 hover:underline">
                    full list
                  </Link>
                  ):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sandboxNumbers.data.numbers.map((n) => (
                    <button
                      key={n.phoneNumber}
                      type="button"
                      title={n.description ?? n.name}
                      onClick={() => setRecipients((prev) => (prev.trim() ? `${prev.trim()}\n${n.phoneNumber}` : n.phoneNumber))}
                      className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-foreground-muted hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {n.phoneNumber} · {n.finalDeliveryStatus.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Field label="Message" required>
              <Textarea required rows={4} maxLength={1600} value={content} onChange={(e) => setContent(e.target.value)} />
            </Field>
            <Field label="Client reference" hint="Optional — your own identifier for this send.">
              <Input value={clientReference} onChange={(e) => setClientReference(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} className="h-4 w-4 rounded border-border-strong text-brand-600" />
              Schedule for later
            </label>
            {scheduleEnabled && (
              <Field label="Send at">
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </Field>
            )}

            {error && <Alert tone="danger">{error}</Alert>}
            {result && (
              <Alert tone="success">
                Queued for {result.acceptedRecipients} recipient(s){result.rejectedRecipients > 0 && `, ${result.rejectedRecipients} rejected (invalid number)`}.
              </Alert>
            )}

            <Button type="submit" loading={send.isPending} disabled={!senderIdId || recipientList.length === 0}>
              Send
            </Button>
          </Card>
        </form>

        <Card className="h-fit space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Preview</h2>
          {!estimate.data ? (
            <p className="text-sm text-foreground-muted">Type a message to see cost and encoding.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <Row label="Characters" value={String(estimate.data.characterCount)} />
              <Row label="Encoding" value={estimate.data.encoding.replace("_", "-")} />
              <Row label="Segments" value={String(estimate.data.segmentCount)} />
              <Row label="Recipients" value={String(recipientList.length || 1)} />
              <Row label="Cost per recipient" value={formatMoney(estimate.data.costPerRecipientMinorUnits, estimate.data.currency)} />
              <Row label="Estimated total" value={formatMoney(estimate.data.totalEstimatedCostMinorUnits, estimate.data.currency)} strong />
              {estimate.data.availableBalanceMinorUnits != null && (
                <Row label="Wallet balance" value={formatMoney(estimate.data.availableBalanceMinorUnits, estimate.data.currency)} />
              )}
              {estimate.data.availableBalanceMinorUnits != null && estimate.data.availableBalanceMinorUnits < estimate.data.totalEstimatedCostMinorUnits && (
                <Alert tone="danger">Insufficient balance for this send.</Alert>
              )}
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}
