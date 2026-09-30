"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Badge } from "../../_components/ui/Badge";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Dialog, ConfirmDialog } from "../../_components/ui/Dialog";
import { Field, Input, Select, Checkbox } from "../../_components/ui/Form";
import { useToast } from "../../_components/ui/Toast";
import type { ProviderConfig } from "../../_lib/api/types";

const TUNABLE_FIELDS: Array<{ key: keyof ProviderConfig; label: string }> = [
  { key: "priority", label: "Priority" },
  { key: "rateLimitPerSecond", label: "Rate limit/s" },
  { key: "maxConcurrency", label: "Max concurrency" },
  { key: "timeoutMs", label: "Timeout (ms)" },
  { key: "retryCount", label: "Retry count" },
  { key: "backoffBaseMs", label: "Backoff base (ms)" },
  { key: "circuitBreakerFailureThreshold", label: "Circuit breaker failure threshold" },
  { key: "circuitBreakerCooldownMs", label: "Circuit breaker cooldown (ms)" },
];

export default function AdminProvidersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ providerType: "SMS", providerCode: "", displayName: "", environment: "SANDBOX", priority: "0" });

  const query = useQuery({ queryKey: ["admin", "providers"], queryFn: () => adminApi.providers() });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createProvider({
        providerType: form.providerType,
        providerCode: form.providerCode,
        displayName: form.displayName,
        environment: form.environment as "SANDBOX" | "PRODUCTION",
        priority: Number(form.priority) || 0,
      }),
    onSuccess: () => {
      toast.push("Provider created", "success");
      setCreateOpen(false);
      setForm({ providerType: "SMS", providerCode: "", displayName: "", environment: "SANDBOX", priority: "0" });
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "providers"] });
    },
    onError: (err) => setCreateError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Providers"
        description="Configured SMS/payment provider settings. Credential values are write-only — never returned by the API."
        actions={<Button onClick={() => setCreateOpen(true)}>Create provider</Button>}
      />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load providers. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.providers.length === 0 && <EmptyState title="No providers configured" />}
      {query.data && query.data.providers.length > 0 && (
        <div className="space-y-3">
          {query.data.providers.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {p.displayName} <span className="font-normal text-foreground-muted">({p.providerCode})</span>
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {p.providerType} · {p.environment}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Inactive"}</Badge>
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="text-xs font-medium text-brand-600 hover:underline">
                    {expanded === p.id ? "Hide details" : "Manage"}
                  </button>
                </div>
              </div>
              {expanded === p.id && <ProviderDetail provider={p} />}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create provider">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCreateError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Provider type" required>
            <Select value={form.providerType} onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value }))}>
              <option value="SMS">SMS</option>
              <option value="PAYMENT">PAYMENT</option>
            </Select>
          </Field>
          <Field label="Environment" required>
            <Select value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}>
              <option value="SANDBOX">SANDBOX</option>
              <option value="PRODUCTION">PRODUCTION</option>
            </Select>
          </Field>
          <Field label="Provider code" required hint="e.g. SIMULATOR, MTN_SMS, AIRTEL_SMS, MTN_MOMO">
            <Input required value={form.providerCode} onChange={(e) => setForm((f) => ({ ...f, providerCode: e.target.value }))} />
          </Field>
          <Field label="Display name" required>
            <Input required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </Field>
          <Field label="Priority" hint="Higher priority is preferred when multiple active providers match.">
            <Input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
          </Field>
          {createError && <Alert tone="danger">{createError}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create provider
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

function ProviderDetail({ provider }: { provider: ProviderConfig }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(TUNABLE_FIELDS.map(({ key }) => [key, provider[key] != null ? String(provider[key]) : ""])),
  );
  const [isActive, setIsActive] = useState(provider.isActive);

  const update = useMutation({
    mutationFn: () =>
      adminApi.updateProvider(provider.id, {
        isActive,
        ...Object.fromEntries(TUNABLE_FIELDS.map(({ key }) => [key, values[key] === "" ? undefined : Number(values[key])])),
      }),
    onSuccess: () => {
      toast.push("Provider updated", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "providers"] });
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate();
        }}
        className="space-y-3"
      >
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TUNABLE_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <Input type="number" value={values[key]} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Button type="submit" size="sm" loading={update.isPending}>
          Save changes
        </Button>
      </form>

      <CredentialsSection providerConfigId={provider.id} />
    </div>
  );
}

function CredentialsSection({ providerConfigId }: { providerConfigId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const credentials = useQuery({
    queryKey: ["admin", "providers", providerConfigId, "credentials"],
    queryFn: () => adminApi.providerCredentials(providerConfigId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "providers", providerConfigId, "credentials"] });

  const add = useMutation({
    mutationFn: () => adminApi.createProviderCredential(providerConfigId, key, value),
    onSuccess: () => {
      toast.push("Credential added", "success");
      setAddOpen(false);
      setKey("");
      setValue("");
      setAddError(null);
      invalidate();
    },
    onError: (err) => setAddError(errorMessage(err)),
  });

  const rotate = useMutation({
    mutationFn: (credId: string) => adminApi.rotateProviderCredential(providerConfigId, credId, rotateValue),
    onSuccess: () => {
      toast.push("Credential rotated", "success");
      setRotateTarget(null);
      setRotateValue("");
      setRotateError(null);
      invalidate();
    },
    onError: (err) => setRotateError(errorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (credId: string) => adminApi.revokeProviderCredential(providerConfigId, credId),
    onSuccess: () => {
      toast.push("Credential revoked", "success");
      setRevokeTarget(null);
      invalidate();
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Credentials</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          Add credential
        </Button>
      </div>
      {credentials.isLoading && <SkeletonTable rows={2} cols={4} />}
      {credentials.data && credentials.data.credentials.length === 0 && <p className="text-xs text-foreground-muted">No credentials stored.</p>}
      {credentials.data && credentials.data.credentials.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Key</Th>
              <Th>Status</Th>
              <Th>Rotated</Th>
              <Th>Expires</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {credentials.data.credentials.map((c) => (
              <Tr key={c.id}>
                <Td className="font-mono text-xs">{c.key}</Td>
                <Td>
                  <Badge tone={c.status === "ACTIVE" ? "success" : c.status === "REVOKED" ? "danger" : "neutral"}>{c.status}</Badge>
                </Td>
                <Td>{c.rotatedAt ? formatDateTime(c.rotatedAt) : "—"}</Td>
                <Td>{c.expiresAt ? formatDateTime(c.expiresAt) : "—"}</Td>
                <Td className="space-x-2 text-xs">
                  {c.status === "ACTIVE" && (
                    <>
                      <button onClick={() => setRotateTarget(c.id)} className="text-brand-600 hover:underline">
                        Rotate
                      </button>
                      <button onClick={() => setRevokeTarget(c.id)} className="text-danger hover:underline">
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

      <Dialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddError(null);
        }}
        title="Add credential"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddError(null);
            add.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Key" required hint="e.g. api_secret, auth_token">
            <Input required value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field label="Value" required>
            <Input required type="password" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          {addError && <Alert tone="danger">{addError}</Alert>}
          <Button type="submit" loading={add.isPending} className="w-full">
            Add credential
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={rotateTarget !== null}
        onClose={() => {
          setRotateTarget(null);
          setRotateError(null);
        }}
        title="Rotate credential"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRotateError(null);
            rotate.mutate(rotateTarget!);
          }}
          className="space-y-3"
        >
          <Field label="New value" required>
            <Input required type="password" value={rotateValue} onChange={(e) => setRotateValue(e.target.value)} />
          </Field>
          {rotateError && <Alert tone="danger">{rotateError}</Alert>}
          <Button type="submit" loading={rotate.isPending} className="w-full">
            Rotate
          </Button>
        </form>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => revoke.mutate(revokeTarget!)}
        title="Revoke this credential?"
        description="It will stop working immediately. This cannot be undone from here — you'd need to add a new one."
        confirmLabel="Revoke"
        loading={revoke.isPending}
        danger
      />
    </div>
  );
}
