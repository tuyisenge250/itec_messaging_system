"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../_lib/api";
import { formatDate, formatDateTime, formatMoney } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { setActingOrganizationId } from "../../../_lib/acting-organization";
import { useToast } from "../../../_components/ui/Toast";
import { PageHeader, Card, StatGrid, EmptyState, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination } from "../../../_components/ui/Table";
import { StatusBadge, Badge } from "../../../_components/ui/Badge";
import { Tabs } from "../../../_components/ui/Tabs";
import { Alert } from "../../../_components/ui/Alert";
import { Button } from "../../../_components/ui/Button";
import { Dialog, ConfirmDialog } from "../../../_components/ui/Dialog";
import { Field, Input, Textarea, Select } from "../../../_components/ui/Form";
import type { Environment, OrganizationDetail, Wallet } from "../../../_lib/api/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "documents", label: "Documents" },
  { id: "sender-ids", label: "Sender IDs" },
  { id: "wallet", label: "Wallet" },
  { id: "messages", label: "Messages" },
  { id: "campaigns", label: "Campaigns" },
  { id: "api-keys", label: "API Keys" },
  { id: "webhooks", label: "Webhooks" },
  { id: "payments", label: "Payments" },
  { id: "fraud", label: "Fraud" },
  { id: "audit", label: "Audit Logs" },
];

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("overview");

  const org = useQuery({ queryKey: ["admin", "org", id], queryFn: () => adminApi.organization(id) });

  const actAs = useMutation({
    mutationFn: () => adminApi.actAsOrganization(id),
    onSuccess: (result) => {
      setActingOrganizationId(result.organizationId);
      // Clears everything, not just org-scoped keys — avoids a previous
      // acting-as session's cached data briefly showing for the new org.
      queryClient.invalidateQueries();
      toast.push(`Viewing as ${result.organizationName}`, "success");
      router.push("/dashboard");
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div>
      <PageHeader
        title={org.data?.legalName ?? "Organization"}
        description={org.data ? `${org.data.status} · ${org.data.country}` : undefined}
        actions={
          <Button variant="outline" onClick={() => actAs.mutate()} loading={actAs.isPending}>
            View as this organization
          </Button>
        }
      />
      {org.isLoading && (
        <Card>
          <SkeletonTable rows={4} />
        </Card>
      )}
      {org.isError && <Alert tone="danger">Unable to load organization. {errorMessage(org.error)}</Alert>}

      {org.data && (
        <>
          <div className="mb-4">
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
          </div>
          {tab === "overview" && <OverviewTab organization={org.data} />}
          {tab === "members" && <MembersTab organizationId={id} active={tab === "members"} />}
          {tab === "documents" && <DocumentsTab organizationId={id} active={tab === "documents"} />}
          {tab === "sender-ids" && <SenderIdsTab organizationId={id} active={tab === "sender-ids"} />}
          {tab === "wallet" && <WalletTab organizationId={id} active={tab === "wallet"} wallets={org.data.wallets} />}
          {tab === "messages" && <MessagesTab organizationId={id} active={tab === "messages"} />}
          {tab === "campaigns" && <CampaignsTab organizationId={id} active={tab === "campaigns"} />}
          {tab === "api-keys" && <ApiKeysTab organizationId={id} active={tab === "api-keys"} />}
          {tab === "webhooks" && <WebhooksTab organizationId={id} active={tab === "webhooks"} />}
          {tab === "payments" && <PaymentsTab organizationId={id} active={tab === "payments"} />}
          {tab === "fraud" && <FraudTab organizationId={id} active={tab === "fraud"} />}
          {tab === "audit" && <AuditTab organizationId={id} active={tab === "audit"} />}
        </>
      )}
    </div>
  );
}

function OverviewTab({ organization }: { organization: OrganizationDetail }) {
  const contact = [
    ["Trading name", organization.tradingName],
    ["Registration number", organization.registrationNumber],
    ["TIN", organization.tin],
    ["Business type", organization.businessType],
    ["Industry", organization.industry],
    ["Phone", organization.phone],
    ["Email", organization.email],
    ["Website", organization.website],
  ].filter(([, v]) => v) as [string, string][];

  const representative = [
    ["Name", organization.legalRepresentativeName],
    ["Email", organization.legalRepresentativeEmail],
    ["Phone", organization.legalRepresentativePhone],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-sm font-semibold text-foreground">Wallets</p>
        {organization.wallets.length === 0 && <p className="text-sm text-foreground-muted">No wallets provisioned yet.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {organization.wallets.map((w) => (
            <div key={w.id} className="rounded-md border border-border p-3">
              <Badge tone={w.environment === "PRODUCTION" ? "brand" : "neutral"}>{w.environment}</Badge>
              <StatGrid
                rows={[
                  { label: "Available", value: formatMoney(w.availableBalanceMinorUnits, w.currency) },
                  { label: "Reserved", value: formatMoney(w.reservedBalanceMinorUnits, w.currency) },
                  { label: "Total", value: formatMoney(w.availableBalanceMinorUnits + w.reservedBalanceMinorUnits, w.currency) },
                ]}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-foreground">At a glance</p>
        <StatGrid
          rows={[
            { label: "Members", value: organization._count.memberships },
            { label: "Sender IDs", value: organization._count.senderIds },
            { label: "API keys", value: organization._count.apiKeys },
            { label: "Documents", value: organization._count.documents },
            { label: "Pricing plan", value: organization.pricingPlan?.name ?? "Default" },
            { label: "Created", value: formatDate(organization.createdAt) },
          ]}
        />
      </Card>

      {contact.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-foreground">Contact information</p>
          <StatGrid rows={contact.map(([label, value]) => ({ label, value }))} />
        </Card>
      )}

      {representative.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-foreground">Legal representative</p>
          <StatGrid rows={representative.map(([label, value]) => ({ label, value }))} />
        </Card>
      )}

      {organization.description && (
        <Card>
          <p className="mb-1 text-sm font-semibold text-foreground">Description</p>
          <p className="text-sm text-foreground-muted">{organization.description}</p>
        </Card>
      )}
    </div>
  );
}

function MembersTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({ queryKey: ["admin", "org", organizationId, "members"], queryFn: () => adminApi.orgMembers(organizationId), enabled: active });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load members. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.members.length === 0) return <EmptyState title="No members" />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Name</Th>
          <Th>Email</Th>
          <Th>Role</Th>
          <Th>Status</Th>
          <Th>Joined</Th>
        </tr>
      </Thead>
      <Tbody>
        {query.data.members.map((m) => (
          <Tr key={m.id}>
            <Td>{m.name ?? "—"}</Td>
            <Td>{m.email}</Td>
            <Td>{m.role}</Td>
            <Td>
              <StatusBadge status={m.status} />
            </Td>
            <Td>{m.joinedAt ? formatDate(m.joinedAt) : "—"}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function DocumentsTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({ queryKey: ["admin", "org", organizationId, "documents"], queryFn: () => adminApi.orgDocuments(organizationId), enabled: active });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load documents. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.documents.length === 0) return <EmptyState title="No documents uploaded" />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Filename</Th>
          <Th>Type</Th>
          <Th>Size</Th>
          <Th>Status</Th>
          <Th>Uploaded</Th>
          <Th />
        </tr>
      </Thead>
      <Tbody>
        {query.data.documents.map((d) => (
          <Tr key={d.id}>
            <Td>{d.originalFilename}</Td>
            <Td>{d.mimeType}</Td>
            <Td>{(d.sizeBytes / 1024).toFixed(0)} KB</Td>
            <Td>
              <StatusBadge status={d.status} />
            </Td>
            <Td>{formatDateTime(d.createdAt)}</Td>
            <Td>
              <a href={`/api/documents/${d.id}/content`} className="text-xs font-medium text-brand-600 hover:underline">
                View
              </a>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function SenderIdsTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; value: string; action: "suspend" | "activate" } | null>(null);

  const query = useQuery({ queryKey: ["admin", "org", organizationId, "sender-ids"], queryFn: () => adminApi.orgSenderIds(organizationId), enabled: active });

  const setStatus = useMutation({
    mutationFn: (target: { id: string; action: "suspend" | "activate" }) =>
      target.action === "suspend" ? adminApi.suspendSenderId(target.id) : adminApi.activateSenderId(target.id),
    onSuccess: () => {
      toast.push(`Sender ID ${confirmTarget?.action === "suspend" ? "suspended" : "activated"}`, "success");
      setConfirmTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "org", organizationId, "sender-ids"] });
    },
    onError: (err) => {
      toast.push(errorMessage(err), "danger");
      setConfirmTarget(null);
    },
  });

  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load sender IDs. {errorMessage(query.error)}</Alert>;
  if (!query.data) return null;
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Active sender IDs</p>
        {query.data.active.length === 0 ? (
          <EmptyState title="No active sender IDs" />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Value</Th>
                <Th>Environment</Th>
                <Th>Status</Th>
                <Th>Activated</Th>
                <Th />
              </tr>
            </Thead>
            <Tbody>
              {query.data.active.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.value}</Td>
                  <Td>
                    <Badge tone={s.environment === "PRODUCTION" ? "brand" : "neutral"}>{s.environment}</Badge>
                  </Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td>{s.activatedAt ? formatDate(s.activatedAt) : "—"}</Td>
                  <Td>
                    {s.status === "ACTIVE" && (
                      <button
                        onClick={() => setConfirmTarget({ id: s.id, value: s.value, action: "suspend" })}
                        className="text-xs font-medium text-danger hover:underline"
                      >
                        Suspend
                      </button>
                    )}
                    {s.status === "SUSPENDED" && (
                      <button
                        onClick={() => setConfirmTarget({ id: s.id, value: s.value, action: "activate" })}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        Reactivate
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Requests</p>
        {query.data.requests.length === 0 ? (
          <EmptyState title="No sender ID requests" />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Requested value</Th>
                <Th>Environment</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
              </tr>
            </Thead>
            <Tbody>
              {query.data.requests.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.requestedValue}</Td>
                  <Td>
                    <Badge tone={r.environment === "PRODUCTION" ? "brand" : "neutral"}>{r.environment}</Badge>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>{formatDate(r.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={confirmTarget?.action === "suspend" ? `Suspend ${confirmTarget.value}?` : `Reactivate ${confirmTarget?.value}?`}
        description={
          confirmTarget?.action === "suspend"
            ? "Messages can no longer be sent from this sender ID until it's reactivated."
            : "This sender ID becomes usable for sending again."
        }
        confirmLabel={confirmTarget?.action === "suspend" ? "Suspend" : "Reactivate"}
        danger={confirmTarget?.action === "suspend"}
        loading={setStatus.isPending}
        onConfirm={() => setStatus.mutate({ id: confirmTarget!.id, action: confirmTarget!.action })}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function WalletTab({ organizationId, active, wallets }: { organizationId: string; active: boolean; wallets: Wallet[] }) {
  const queryClient = useQueryClient();
  // Only SANDBOX is guaranteed to exist (auto-provisioned at org creation) — PRODUCTION
  // only appears once the org is activated. Deriving the default/available options from
  // the real wallet rows (rather than hardcoding both) avoids querying an environment
  // this org doesn't have a wallet for yet, which the backend correctly 404s.
  const availableEnvironments = wallets.map((w) => w.environment);
  const [environment, setEnvironment] = useState<Environment>(() => (availableEnvironments.includes("SANDBOX") ? "SANDBOX" : availableEnvironments[0]));
  const [cursors, setCursors] = useState<string[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cursor = cursors[cursors.length - 1];
  const PAGE_SIZE = 50;

  const query = useQuery({
    queryKey: ["admin", "org", organizationId, "wallet-transactions", environment, cursor],
    queryFn: () => adminApi.orgWalletTransactions(organizationId, environment, cursor),
    enabled: active && Boolean(environment),
  });

  const adjust = useMutation({
    mutationFn: () => adminApi.walletAdjust(organizationId, environment, Math.round(Number(amount)), description),
    onSuccess: () => {
      setAdjustOpen(false);
      setAmount("");
      setDescription("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "org", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "org", organizationId, "wallet-transactions"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (!environment) {
    return <EmptyState title="No wallet provisioned yet" description="This organization has no wallet in any environment." />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select
          value={environment}
          onChange={(e) => {
            setEnvironment(e.target.value as Environment);
            setCursors([]);
          }}
          className="w-40"
        >
          {availableEnvironments.map((env) => (
            <option key={env} value={env}>
              {env}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={() => setAdjustOpen(true)}>
          Adjust balance
        </Button>
      </div>

      {query.isLoading && <SkeletonTable rows={3} />}
      {query.isError && <Alert tone="danger">Unable to load wallet transactions. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.transactions.length === 0 && <EmptyState title="No ledger entries" />}
      {query.data && query.data.transactions.length > 0 && (
        <>
          <Table>
            <Thead>
              <tr>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Balance after</Th>
                <Th>Description</Th>
                <Th>Date</Th>
              </tr>
            </Thead>
            <Tbody>
              {query.data.transactions.map((t) => (
                <Tr key={t.id}>
                  <Td>{t.type}</Td>
                  <Td>{t.amountMinorUnits.toLocaleString()}</Td>
                  <Td>{t.balanceAfterMinorUnits.toLocaleString()}</Td>
                  <Td>{t.description ?? "—"}</Td>
                  <Td>{formatDateTime(t.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination
            hasMore={query.data.transactions.length === PAGE_SIZE}
            canGoBack={cursors.length > 0}
            loading={query.isFetching}
            onNext={() => setCursors((c) => [...c, query.data!.transactions[query.data!.transactions.length - 1].id])}
            onPrev={() => setCursors((c) => c.slice(0, -1))}
          />
        </>
      )}

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} title={`Adjust ${environment} balance`}>
        {environment === "PRODUCTION" && (
          <Alert tone="danger" title="You are modifying PRODUCTION data">
            This action credits or debits real customer balance and is recorded in the ledger and audit log.
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            adjust.mutate();
          }}
          className="mt-3 space-y-3"
        >
          <Field label="Amount (minor units)" required hint="Positive to credit, negative to debit.">
            <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Reason" required>
            <Textarea rows={2} required maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={adjust.isPending} className="w-full">
            Apply adjustment
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

function MessagesTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const PAGE_SIZE = 25;
  const query = useQuery({
    queryKey: ["admin", "org", organizationId, "messages", cursor],
    queryFn: () => adminApi.orgMessages(organizationId, undefined, cursor),
    enabled: active,
  });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load messages. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.messages.length === 0) return <EmptyState title="No messages" />;
  return (
    <>
      <Table>
        <Thead>
          <tr>
            <Th>Content</Th>
            <Th>Environment</Th>
            <Th>Status</Th>
            <Th>Recipients</Th>
            <Th>Delivered</Th>
            <Th>Failed</Th>
            <Th>Cost</Th>
            <Th>Created</Th>
          </tr>
        </Thead>
        <Tbody>
          {query.data.messages.map((m) => (
            <Tr key={m.id}>
              <Td className="max-w-xs truncate">{m.content}</Td>
              <Td>
                <Badge tone={m.environment === "PRODUCTION" ? "brand" : "neutral"}>{m.environment}</Badge>
              </Td>
              <Td>
                <StatusBadge status={m.status} />
              </Td>
              <Td>{m.totalRecipients}</Td>
              <Td>{m.deliveredCount}</Td>
              <Td>{m.failedCount}</Td>
              <Td>{formatMoney(m.totalCostMinorUnits, m.currency)}</Td>
              <Td>{formatDateTime(m.createdAt)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Pagination
        hasMore={query.data.messages.length === PAGE_SIZE}
        canGoBack={cursors.length > 0}
        loading={query.isFetching}
        onNext={() => setCursors((c) => [...c, query.data!.messages[query.data!.messages.length - 1].id])}
        onPrev={() => setCursors((c) => c.slice(0, -1))}
      />
    </>
  );
}

function CampaignsTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({ queryKey: ["admin", "org", organizationId, "campaigns"], queryFn: () => adminApi.orgCampaigns(organizationId), enabled: active });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load campaigns. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.campaigns.length === 0) return <EmptyState title="No campaigns" />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Name</Th>
          <Th>Environment</Th>
          <Th>Status</Th>
          <Th>Recipients</Th>
          <Th>Created</Th>
        </tr>
      </Thead>
      <Tbody>
        {query.data.campaigns.map((c) => (
          <Tr key={c.id}>
            <Td>{c.name}</Td>
            <Td>
              <Badge tone={c.environment === "PRODUCTION" ? "brand" : "neutral"}>{c.environment}</Badge>
            </Td>
            <Td>
              <StatusBadge status={c.status} />
            </Td>
            <Td>{c.totalRecipients}</Td>
            <Td>{formatDate(c.createdAt)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function ApiKeysTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({ queryKey: ["admin", "org", organizationId, "api-keys"], queryFn: () => adminApi.orgApiKeys(organizationId), enabled: active });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load API keys. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.apiKeys.length === 0) return <EmptyState title="No API keys" />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Name</Th>
          <Th>Environment</Th>
          <Th>Prefix</Th>
          <Th>Status</Th>
          <Th>Last used</Th>
        </tr>
      </Thead>
      <Tbody>
        {query.data.apiKeys.map((k) => (
          <Tr key={k.id}>
            <Td>{k.name}</Td>
            <Td>
              <Badge tone={k.environment === "PRODUCTION" ? "brand" : "neutral"}>{k.environment}</Badge>
            </Td>
            <Td className="font-mono text-xs">{k.displayPrefix}</Td>
            <Td>
              <StatusBadge status={k.status} />
            </Td>
            <Td>{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never"}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function WebhooksTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({ queryKey: ["admin", "org", organizationId, "webhooks"], queryFn: () => adminApi.orgWebhooks(organizationId), enabled: active });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load webhooks. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.webhooks.length === 0) return <EmptyState title="No webhook endpoints" />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>URL</Th>
          <Th>Environment</Th>
          <Th>Events</Th>
          <Th>Active</Th>
        </tr>
      </Thead>
      <Tbody>
        {query.data.webhooks.map((w) => (
          <Tr key={w.id}>
            <Td className="max-w-xs truncate">{w.url}</Td>
            <Td>
              <Badge tone={w.environment === "PRODUCTION" ? "brand" : "neutral"}>{w.environment}</Badge>
            </Td>
            <Td className="max-w-xs truncate">{w.events.join(", ")}</Td>
            <Td>
              <Badge tone={w.isActive ? "success" : "neutral"}>{w.isActive ? "Active" : "Inactive"}</Badge>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function PaymentsTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({ queryKey: ["admin", "org", organizationId, "payments"], queryFn: () => adminApi.orgPayments(organizationId), enabled: active });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load payments. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.paymentIntents.length === 0) return <EmptyState title="No payments" />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Package</Th>
          <Th>Amount</Th>
          <Th>Status</Th>
          <Th>Provider reference</Th>
          <Th>Created</Th>
          <Th />
        </tr>
      </Thead>
      <Tbody>
        {query.data.paymentIntents.map((p) => (
          <Tr key={p.id}>
            <Td>{p.package?.name ?? "—"}</Td>
            <Td>{formatMoney(p.amountMinorUnits, p.currency)}</Td>
            <Td>
              <StatusBadge status={p.status} />
            </Td>
            <Td className="font-mono text-xs">{p.providerReference ?? "—"}</Td>
            <Td>{formatDateTime(p.createdAt)}</Td>
            <Td>
              {p.status === "SUCCEEDED" && (
                <a href={`/api/payment-intents/${p.id}/invoice`} className="text-xs font-medium text-brand-600 hover:underline">
                  Download invoice
                </a>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function FraudTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const query = useQuery({
    queryKey: ["admin", "org", organizationId, "fraud"],
    queryFn: () => adminApi.fraudEvents(undefined, organizationId),
    enabled: active,
  });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load fraud events. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.events.length === 0) return <EmptyState title="No fraud events" description="Nothing has tripped a fraud rule for this organization." />;
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Type</Th>
          <Th>Severity</Th>
          <Th>Description</Th>
          <Th>Status</Th>
          <Th>Date</Th>
        </tr>
      </Thead>
      <Tbody>
        {query.data.events.map((e) => (
          <Tr key={e.id}>
            <Td>{e.eventType}</Td>
            <Td>
              <Badge tone={e.severity === "CRITICAL" || e.severity === "HIGH" ? "danger" : e.severity === "MEDIUM" ? "warning" : "neutral"}>{e.severity}</Badge>
            </Td>
            <Td className="max-w-80 truncate">{e.description}</Td>
            <Td>
              <StatusBadge status={e.status} />
            </Td>
            <Td>{formatDateTime(e.createdAt)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function AuditTab({ organizationId, active }: { organizationId: string; active: boolean }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const PAGE_SIZE = 50;
  const query = useQuery({
    queryKey: ["admin", "org", organizationId, "audit", cursor],
    queryFn: () => adminApi.auditLogs(cursor, organizationId),
    enabled: active,
  });
  if (query.isLoading) return <SkeletonTable rows={3} />;
  if (query.isError) return <Alert tone="danger">Unable to load audit logs. {errorMessage(query.error)}</Alert>;
  if (!query.data || query.data.events.length === 0) return <EmptyState title="No audit events" />;
  return (
    <>
      <Table>
        <Thead>
          <tr>
            <Th>Action</Th>
            <Th>Actor</Th>
            <Th>Resource</Th>
            <Th>Date</Th>
          </tr>
        </Thead>
        <Tbody>
          {query.data.events.map((e) => (
            <Tr key={e.id}>
              <Td>{e.action}</Td>
              <Td>{e.actorType}</Td>
              <Td>
                {e.resourceType}
                {e.resourceId ? ` · ${e.resourceId}` : ""}
              </Td>
              <Td>{formatDateTime(e.createdAt)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Pagination
        hasMore={query.data.events.length === PAGE_SIZE}
        canGoBack={cursors.length > 0}
        loading={query.isFetching}
        onNext={() => setCursors((c) => [...c, query.data!.events[query.data!.events.length - 1].id])}
        onPrev={() => setCursors((c) => c.slice(0, -1))}
      />
    </>
  );
}
