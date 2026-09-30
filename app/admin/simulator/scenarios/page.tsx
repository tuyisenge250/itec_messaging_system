"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../_lib/api";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { Field, Input, Select } from "../../../_components/ui/Form";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";
import { Badge } from "../../../_components/ui/Badge";
import { Dialog } from "../../../_components/ui/Dialog";

const TRIGGER_TYPES = ["PHONE_NUMBER", "SENDER_ID", "ORGANIZATION", "MESSAGE_ID", "API_KEY", "MESSAGE_CONTENT", "RANDOM_PERCENTAGE"];
const PROVIDER_STATUSES = ["ACCEPTED", "REJECTED", "TIMEOUT", "UNAVAILABLE"];
const FINAL_STATUSES = ["DELIVERED", "FAILED", "EXPIRED", "UNDELIVERED"];

export default function ScenariosPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [triggerType, setTriggerType] = useState("PHONE_NUMBER");
  const [triggerValue, setTriggerValue] = useState("");
  const [initialProviderStatus, setInitialProviderStatus] = useState("ACCEPTED");
  const [finalDeliveryStatus, setFinalDeliveryStatus] = useState("DELIVERED");
  const [delayMs, setDelayMs] = useState(3000);
  const [probabilityPercent, setProbabilityPercent] = useState(10);
  const [priority, setPriority] = useState(0);

  const scenarios = useQuery({ queryKey: ["admin", "simulator", "scenarios"], queryFn: () => adminApi.simulator.scenarios() });

  const create = useMutation({
    mutationFn: () =>
      adminApi.simulator.createScenario({
        name,
        environment,
        triggerType,
        triggerValue: triggerType === "RANDOM_PERCENTAGE" ? undefined : triggerValue,
        initialProviderStatus,
        finalDeliveryStatus,
        delayMs,
        probabilityPercent: triggerType === "RANDOM_PERCENTAGE" ? probabilityPercent : undefined,
        priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "simulator", "scenarios"] });
      setOpen(false);
      setName("");
      setTriggerValue("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => adminApi.simulator.updateScenario(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "simulator", "scenarios"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.simulator.deleteScenario(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "simulator", "scenarios"] }),
  });

  return (
    <div>
      <PageHeader title="Simulator Scenarios" actions={<Button onClick={() => setOpen(true)}>New scenario</Button>} />

      {scenarios.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {scenarios.data && scenarios.data.scenarios.length === 0 && <EmptyState title="No scenarios configured" />}
      {scenarios.data && scenarios.data.scenarios.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Env</Th>
              <Th>Trigger</Th>
              <Th>Initial → Final</Th>
              <Th>Priority</Th>
              <Th>Enabled</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {scenarios.data.scenarios.map((s) => (
              <Tr key={s.id}>
                <Td>{s.name}</Td>
                <Td>{s.environment}</Td>
                <Td className="text-xs">
                  {s.triggerType}
                  {s.triggerValue ? `: ${s.triggerValue}` : s.probabilityPercent != null ? `: ${s.probabilityPercent}%` : ""}
                </Td>
                <Td className="text-xs">
                  {s.initialProviderStatus} → {s.finalDeliveryStatus} ({s.delayMs}ms)
                </Td>
                <Td>{s.priority}</Td>
                <Td>
                  <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "Yes" : "No"}</Badge>
                </Td>
                <Td className="space-x-2 text-xs">
                  <button onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })} className="font-medium text-brand-600 hover:underline">
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove.mutate(s.id)} className="text-danger hover:underline">
                    Delete
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New scenario">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Name" required className="col-span-2">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Environment">
            <Select value={environment} onChange={(e) => setEnvironment(e.target.value as "SANDBOX" | "PRODUCTION")}>
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </Field>
          <Field label="Trigger type">
            <Select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          {triggerType === "RANDOM_PERCENTAGE" ? (
            <Field label="Probability %">
              <Input type="number" min={0} max={100} value={probabilityPercent} onChange={(e) => setProbabilityPercent(Number(e.target.value))} />
            </Field>
          ) : (
            <Field label="Trigger value" required>
              <Input required value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} />
            </Field>
          )}
          <Field label="Initial provider status">
            <Select value={initialProviderStatus} onChange={(e) => setInitialProviderStatus(e.target.value)}>
              {PROVIDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Final delivery status">
            <Select value={finalDeliveryStatus} onChange={(e) => setFinalDeliveryStatus(e.target.value)}>
              {FINAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delay (ms)">
            <Input type="number" min={0} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
          </Field>
          {error && (
            <div className="col-span-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <div className="col-span-2">
            <Button type="submit" loading={create.isPending}>
              Create scenario
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
