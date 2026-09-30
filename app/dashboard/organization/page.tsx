"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orgApi } from "../../_lib/api";
import { useCurrentOrg } from "../../_lib/use-current-user";
import { errorMessage } from "../../_lib/api-client";
import type { Organization } from "../../_lib/api/types";
import { PageHeader, Card } from "../../_components/ui/Layout";
import { Field, Input } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { StatusBadge } from "../../_components/ui/Badge";
import { Dialog } from "../../_components/ui/Dialog";
import { useToast } from "../../_components/ui/Toast";

const FIELDS: Array<[key: string, label: string]> = [
  ["legalName", "Legal name"],
  ["tradingName", "Trading name"],
  ["registrationNumber", "Registration number"],
  ["tin", "TIN"],
  ["businessType", "Business type"],
  ["industry", "Industry"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["website", "Website"],
  ["city", "City"],
  ["legalRepresentativeName", "Legal representative"],
];

function buildForm(organization: Organization): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key] of FIELDS) next[key] = (organization as unknown as Record<string, string | null>)[key] ?? "";
  return next;
}

export default function OrganizationPage() {
  const org = useCurrentOrg();
  const query = useQuery({ queryKey: ["organizations", org?.organizationId], queryFn: () => orgApi.get(org!.organizationId), enabled: Boolean(org) });

  if (!query.data) return null;

  // Keyed by organization id so the form only re-initializes from the server
  // record when it starts editing a *different* organization, not on every
  // background refetch — the form otherwise owns its own state once mounted.
  return <OrganizationForm key={query.data.id} organization={query.data} organizationId={org!.organizationId} />;
}

function OrganizationForm({ organization, organizationId }: { organization: Organization; organizationId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>(() => buildForm(organization));
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () => orgApi.update(organizationId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] });
      toast.push("Organization updated", "success");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submitForReview = useMutation({
    mutationFn: () => orgApi.submit(organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Organization"
        actions={
          organization.status === "PENDING" && (
            <Button variant="outline" onClick={() => submitForReview.mutate()} loading={submitForReview.isPending}>
              Submit for review
            </Button>
          )
        }
      />
      <div className="mb-4">
        <StatusBadge status={organization.status} />
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            update.mutate();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input value={form[key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </Field>
          ))}
          {error && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={update.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>

      <DataPrivacySection organizationId={organizationId} organization={organization} />
    </div>
  );
}

function DataPrivacySection({ organizationId, organization }: { organizationId: string; organization: Organization }) {
  const router = useRouter();
  const toast = useToast();
  const [eraseOpen, setEraseOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const erase = useMutation({
    mutationFn: () => orgApi.erase(organizationId, reason, confirmName),
    onSuccess: () => {
      toast.push("Organization erased", "success");
      // Erasure revokes every session tied solely to this org, including this one
      // if the acting user has no other org membership — send them to login.
      router.push("/login");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Card className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Data &amp; Privacy</h2>
      <p className="mb-4 text-xs text-foreground-muted">Export everything this organization&apos;s account covers, or permanently erase it.</p>

      <div className="flex flex-wrap items-center gap-3">
        <a href={`/api/organizations/${organizationId}/export`} className="inline-block">
          <Button variant="outline">Export my data</Button>
        </a>
        <Button variant="danger" onClick={() => setEraseOpen(true)}>
          Delete organization
        </Button>
      </div>

      <Dialog
        open={eraseOpen}
        onClose={() => {
          setEraseOpen(false);
          setError(null);
        }}
        title="Delete this organization"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            erase.mutate();
          }}
          className="space-y-3"
        >
          <Alert tone="danger">
            This permanently anonymizes the organization&apos;s profile and contact data, revokes API keys, and cancels sender IDs. It cannot be undone.
            Payment and message history are retained for legal/accounting purposes.
          </Alert>
          <Field label={`Type "${organization.legalName}" to confirm`} required>
            <Input required value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          </Field>
          <Field label="Reason" required>
            <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" variant="danger" loading={erase.isPending} disabled={confirmName !== organization.legalName} className="w-full">
            Permanently delete organization
          </Button>
        </form>
      </Dialog>
    </Card>
  );
}
