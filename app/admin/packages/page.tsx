"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatMoney } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Badge } from "../../_components/ui/Badge";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Dialog } from "../../_components/ui/Dialog";
import { Field, Input, Checkbox } from "../../_components/ui/Form";
import { useToast } from "../../_components/ui/Toast";
import type { SmsPackage } from "../../_lib/api/types";

const EMPTY_FORM = { name: "", description: "", priceMinorUnits: "", creditAmountMinorUnits: "", bonusMinorUnits: "0", currency: "RWF", active: true };

export default function AdminPackagesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<SmsPackage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["admin", "packages"], queryFn: () => adminApi.packages() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createPackage({
        name: form.name,
        description: form.description || undefined,
        priceMinorUnits: Number(form.priceMinorUnits),
        creditAmountMinorUnits: Number(form.creditAmountMinorUnits),
        bonusMinorUnits: Number(form.bonusMinorUnits) || 0,
        currency: form.currency,
        active: form.active,
      }),
    onSuccess: () => {
      toast.push("Package created", "success");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      invalidate();
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  const update = useMutation({
    mutationFn: (data: Partial<SmsPackage>) => adminApi.updatePackage(editing!.id, data),
    onSuccess: () => {
      toast.push("Package updated", "success");
      setEditing(null);
      invalidate();
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div>
      <PageHeader
        title="SMS Packages"
        description="Prepaid wallet top-up bundles customers can purchase — price, credit granted, and any bonus credit."
        actions={<Button onClick={() => setCreateOpen(true)}>Create package</Button>}
      />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load packages. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.packages.length === 0 && <EmptyState title="No packages configured" />}
      {query.data && query.data.packages.length > 0 && (
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Price</Th>
                <Th>Credit granted</Th>
                <Th>Bonus</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </Thead>
            <Tbody>
              {query.data.packages.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-foreground">{p.name}</Td>
                  <Td>{formatMoney(p.priceMinorUnits, p.currency)}</Td>
                  <Td>{formatMoney(p.creditAmountMinorUnits, p.currency)}</Td>
                  <Td>{p.bonusMinorUnits > 0 ? formatMoney(p.bonusMinorUnits, p.currency) : "—"}</Td>
                  <Td>
                    <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
                  </Td>
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
        title="Create package"
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
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Price (minor units)" required>
            <Input required type="number" min={1} value={form.priceMinorUnits} onChange={(e) => setForm((f) => ({ ...f, priceMinorUnits: e.target.value }))} />
          </Field>
          <Field label="Credit granted (minor units)" required hint="How much wallet credit the customer receives.">
            <Input
              required
              type="number"
              min={1}
              value={form.creditAmountMinorUnits}
              onChange={(e) => setForm((f) => ({ ...f, creditAmountMinorUnits: e.target.value }))}
            />
          </Field>
          <Field label="Bonus (minor units)" hint="Extra credit on top, e.g. a promotional bundle.">
            <Input type="number" min={0} value={form.bonusMinorUnits} onChange={(e) => setForm((f) => ({ ...f, bonusMinorUnits: e.target.value }))} />
          </Field>
          <Field label="Currency">
            <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </Field>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create package
          </Button>
        </form>
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit package">
        {editing && <EditPackageForm pkg={editing} onSubmit={(data) => update.mutate(data)} loading={update.isPending} />}
      </Dialog>
    </div>
  );
}

function EditPackageForm({ pkg, onSubmit, loading }: { pkg: SmsPackage; onSubmit: (data: Partial<SmsPackage>) => void; loading: boolean }) {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? "");
  const [price, setPrice] = useState(String(pkg.priceMinorUnits));
  const [credit, setCredit] = useState(String(pkg.creditAmountMinorUnits));
  const [bonus, setBonus] = useState(String(pkg.bonusMinorUnits));
  const [active, setActive] = useState(pkg.active ?? true);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          description: description || undefined,
          priceMinorUnits: Number(price),
          creditAmountMinorUnits: Number(credit),
          bonusMinorUnits: Number(bonus) || 0,
          active,
        });
      }}
      className="space-y-3"
    >
      <Field label="Name" required>
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Price (minor units)" required>
        <Input required type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="Credit granted (minor units)" required>
        <Input required type="number" min={1} value={credit} onChange={(e) => setCredit(e.target.value)} />
      </Field>
      <Field label="Bonus (minor units)">
        <Input type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} />
      </Field>
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
