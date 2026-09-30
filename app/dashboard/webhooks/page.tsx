"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { webhooksApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Field, Input, Select, Checkbox } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Badge } from "../../_components/ui/Badge";
import { Dialog } from "../../_components/ui/Dialog";

const EVENTS = ["message.delivered", "message.failed"];

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [events, setEvents] = useState<string[]>(EVENTS);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const webhooks = useQuery({ queryKey: ["webhooks"], queryFn: () => webhooksApi.list() });

  const create = useMutation({
    mutationFn: () => webhooksApi.create({ url, environment, events }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setNewSecret(data.secret);
      setUrl("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => webhooksApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  function toggleEvent(event: string) {
    setEvents((e) => (e.includes(event) ? e.filter((x) => x !== event) : [...e, event]));
  }

  return (
    <div>
      <PageHeader title="Webhooks" actions={<Button onClick={() => setOpen(true)}>Add webhook</Button>} />

      {newSecret && (
        <Alert tone="warning" title="Signing secret — shown once">
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{newSecret}</code>
          <button onClick={() => setNewSecret(null)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
            Dismiss
          </button>
        </Alert>
      )}

      {webhooks.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {webhooks.data && webhooks.data.webhooks.length === 0 && <EmptyState title="No webhooks configured" description="Get notified when a message is delivered or fails." />}
      {webhooks.data && webhooks.data.webhooks.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>URL</Th>
              <Th>Environment</Th>
              <Th>Events</Th>
              <Th>Active</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {webhooks.data.webhooks.map((w) => (
              <Tr key={w.id}>
                <Td className="max-w-64 truncate">
                  <Link href={`/dashboard/webhooks/${w.id}`} className="text-brand-600 hover:underline">
                    {w.url}
                  </Link>
                </Td>
                <Td>{w.environment}</Td>
                <Td className="text-xs">
                  {w.events.map((e) => (
                    <Badge key={e} tone="neutral">
                      {e}
                    </Badge>
                  ))}
                </Td>
                <Td>
                  <button onClick={() => toggle.mutate({ id: w.id, isActive: !w.isActive })} className="text-xs font-medium text-brand-600 hover:underline">
                    {w.isActive ? "Disable" : "Enable"}
                  </button>
                </Td>
                <Td>
                  <button onClick={() => remove.mutate(w.id)} className="text-xs text-danger hover:underline">
                    Delete
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add webhook">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
            setOpen(false);
          }}
          className="space-y-3"
        >
          <Field label="URL" required>
            <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/sms" />
          </Field>
          <Field label="Environment">
            <Select value={environment} onChange={(e) => setEnvironment(e.target.value as "SANDBOX" | "PRODUCTION")}>
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </Select>
          </Field>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium text-foreground">Events</legend>
            {EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2">
                <Checkbox checked={events.includes(event)} onChange={() => toggleEvent(event)} />
                {event}
              </label>
            ))}
          </fieldset>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={events.length === 0} className="w-full">
            Add webhook
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
