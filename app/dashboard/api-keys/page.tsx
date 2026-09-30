"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeysApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { formatDateTime } from "../../_lib/format";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Field, Input, Select, Checkbox } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { StatusBadge } from "../../_components/ui/Badge";
import { Dialog } from "../../_components/ui/Dialog";

const AVAILABLE_SCOPES = ["sms.send", "sms.read", "campaign.read", "wallet.read"];

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [scopes, setScopes] = useState<string[]>(["sms.send", "sms.read"]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => apiKeysApi.list() });

  const create = useMutation({
    mutationFn: () => apiKeysApi.create({ name, environment, scopes }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewToken(data.token);
      setName("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
  const rotate = useMutation({
    mutationFn: (id: string) => apiKeysApi.rotate(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewToken(data.token);
    },
  });

  function toggleScope(scope: string) {
    setScopes((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));
  }

  return (
    <div>
      <PageHeader title="API Keys" actions={<Button onClick={() => setOpen(true)}>Create key</Button>} />

      {newToken && (
        <Alert tone="warning" title="Copy this token now — it will not be shown again">
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{newToken}</code>
          <button onClick={() => setNewToken(null)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
            Dismiss
          </button>
        </Alert>
      )}

      {keys.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {keys.data && keys.data.apiKeys.length === 0 && <EmptyState title="No API keys yet" description="Create one to integrate programmatically." />}
      {keys.data && keys.data.apiKeys.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Prefix</Th>
              <Th>Environment</Th>
              <Th>Scopes</Th>
              <Th>Status</Th>
              <Th>Last used</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {keys.data.apiKeys.map((k) => (
              <Tr key={k.id}>
                <Td>{k.name}</Td>
                <Td className="font-mono text-xs">{k.displayPrefix}</Td>
                <Td>{k.environment}</Td>
                <Td className="max-w-48 truncate text-xs">{k.scopes.join(", ")}</Td>
                <Td>
                  <StatusBadge status={k.status} />
                </Td>
                <Td>{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never"}</Td>
                <Td className="space-x-2 text-xs">
                  {k.status === "ACTIVE" && (
                    <>
                      <button onClick={() => rotate.mutate(k.id)} className="text-brand-600 hover:underline">
                        Rotate
                      </button>
                      <button onClick={() => revoke.mutate(k.id)} className="text-danger hover:underline">
                        Revoke
                      </button>
                    </>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Create API key">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
            setOpen(false);
          }}
          className="space-y-3"
        >
          <Field label="Name" required>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Environment">
            <Select value={environment} onChange={(e) => setEnvironment(e.target.value as "SANDBOX" | "PRODUCTION")}>
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </Select>
          </Field>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium text-foreground">Scopes</legend>
            {AVAILABLE_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2">
                <Checkbox checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                {scope}
              </label>
            ))}
          </fieldset>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={scopes.length === 0} className="w-full">
            Create key
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
