"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatMoney, formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Badge } from "../../_components/ui/Badge";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Dialog } from "../../_components/ui/Dialog";
import { Field, Input, Checkbox } from "../../_components/ui/Form";
import { useToast } from "../../_components/ui/Toast";
import type { PricingPlan } from "../../_lib/api/types";

const EMPTY_FORM = { name: "", pricePerSegmentMinorUnits: "", currency: "RWF", isDefault: false, active: true };

export default function AdminPricingPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<PricingPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["admin", "pricing-plans"], queryFn: () => adminApi.pricingPlans() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "pricing-plans"] });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createPricingPlan({
        name: form.name,
        pricePerSegmentMinorUnits: Number(form.pricePerSegmentMinorUnits),
        currency: form.currency,
        isDefault: form.isDefault,
        active: form.active,
      }),
    onSuccess: () => {
      toast.push("Pricing plan created", "success");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      invalidate();
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  const update = useMutation({
    mutationFn: (data: Partial<PricingPlan>) => adminApi.updatePricingPlan(editing!.id, data),
    onSuccess: () => {
      toast.push("Pricing plan updated", "success");
      setEditing(null);
      invalidate();
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div>
      <PageHeader
        title="Pricing Plans"
        description="Per-segment SMS pricing. Exactly one active plan is the default, applied to any organization without a custom plan assigned."
        actions={<Button onClick={() => setCreateOpen(true)}>Create plan</Button>}
      />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load pricing plans. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.plans.length === 0 && <EmptyState title="No pricing plans configured" />}
      {query.data && query.data.plans.length > 0 && (
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Price / segment</Th>
                <Th>Default</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </Thead>
            <Tbody>
              {query.data.plans.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-foreground">{p.name}</Td>
                  <Td>{formatMoney(p.pricePerSegmentMinorUnits, p.currency)}</Td>
                  <Td>{p.isDefault && <Badge tone="brand">Default</Badge>}</Td>
                  <Td>
                    <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td>{formatDateTime(p.updatedAt)}</Td>
                  <Td>
                    <button onClick={() => setEditing(p)} className="text-xs font-medium text-brand-600 hover:underline">
                      Edit
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setFormError(null);
        }}
        title="Create pricing plan"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Name" required>
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Price per segment (minor units)" required hint="RWF has no subunit — this is the RWF amount.">
            <Input
              required
              type="number"
              min={1}
              value={form.pricePerSegmentMinorUnits}
              onChange={(e) => setForm((f) => ({ ...f, pricePerSegmentMinorUnits: e.target.value }))}
            />
          </Field>
          <Field label="Currency">
            <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
            Make this the default plan
          </label>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create plan
          </Button>
        </form>
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit pricing plan">
        {editing && (
          <EditPlanForm
            plan={editing}
            onSubmit={(data) => update.mutate(data)}
            loading={update.isPending}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditPlanForm({ plan, onSubmit, loading }: { plan: PricingPlan; onSubmit: (data: Partial<PricingPlan>) => void; loading: boolean }) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.pricePerSegmentMinorUnits));
  const [isDefault, setIsDefault] = useState(plan.isDefault);
  const [active, setActive] = useState(plan.active);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, pricePerSegmentMinorUnits: Number(price), isDefault, active });
      }}
      className="space-y-3"
    >
      <Field label="Name" required>
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Price per segment (minor units)" required>
        <Input required type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Default plan
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
      <Button type="submit" loading={loading} className="w-full">
        Save changes
      </Button>
    </form>
  );
}
