"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { orgApi } from "../../_lib/api";
import { useCurrentOrg } from "../../_lib/use-current-user";
import { errorMessage } from "../../_lib/api-client";
import { ORG_ASSIGNABLE_PERMISSION_CODES } from "@/shared/constants/permissions";
import { PageHeader, Card, SkeletonTable, EmptyState } from "../../_components/ui/Layout";
import { Field, Input, Textarea } from "../../_components/ui/Form";
import { Button, IconButton } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Badge } from "../../_components/ui/Badge";
import { Dialog, ConfirmDialog } from "../../_components/ui/Dialog";
import type { OrgRole } from "../../_lib/api/types";

const GROUP_LABELS: Record<string, string> = {
  organization: "Organization",
  members: "Team Members",
  roles: "Roles & Permissions",
  documents: "Documents",
  sender_id: "Sender IDs",
  sms: "Messaging",
  campaign: "Campaigns",
  contacts: "Contacts",
  templates: "Templates",
  wallet: "Wallet & Billing",
  api_key: "API Keys",
  webhook: "Webhooks",
  audit: "Audit",
};

function groupPermissionCodes(codes: string[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const code of codes) {
    const key = code.split(".")[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(code);
  }
  return Array.from(groups.entries());
}

const PERMISSION_GROUPS = groupPermissionCodes(ORG_ASSIGNABLE_PERMISSION_CODES);

function RoleCard({ role, onEdit, onDelete }: { role: OrgRole; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{role.name}</p>
          {role.description && <p className="mt-0.5 text-xs text-foreground-muted">{role.description}</p>}
        </div>
        {(onEdit || onDelete) && (
          <div className="flex shrink-0 gap-1">
            {onEdit && (
              <IconButton onClick={onEdit} aria-label="Edit role" title="Edit role">
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
            )}
            {onDelete && (
              <IconButton onClick={onDelete} aria-label="Delete role" title="Delete role" className="hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {role.permissionCodes.length === 0 ? (
          <span className="text-xs text-foreground-muted">No permissions granted.</span>
        ) : (
          role.permissionCodes.map((p) => (
            <Badge key={p} tone="neutral">
              {p}
            </Badge>
          ))
        )}
      </div>
    </Card>
  );
}

function RoleForm({
  initialName,
  initialDescription,
  initialPermissions,
  submitting,
  submitLabel,
  onSubmit,
  error,
}: {
  initialName: string;
  initialDescription: string;
  initialPermissions: string[];
  submitting: boolean;
  submitLabel: string;
  onSubmit: (data: { name: string; description: string; permissionCodes: string[] }) => void;
  error: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [permissions, setPermissions] = useState<Set<string>>(new Set(initialPermissions));

  function toggle(code: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(codes: string[], allSelected: boolean) {
    setPermissions((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        if (allSelected) next.delete(code);
        else next.add(code);
      }
      return next;
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, description, permissionCodes: Array.from(permissions) });
      }}
      className="space-y-3"
    >
      <Field label="Role name" required>
        <Input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <Textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">Permissions</p>
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-3">
          {PERMISSION_GROUPS.map(([group, codes]) => {
            const allSelected = codes.every((c) => permissions.has(c));
            return (
              <div key={group}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{GROUP_LABELS[group] ?? group}</p>
                  <button type="button" onClick={() => toggleGroup(codes, allSelected)} className="text-xs font-medium text-brand-600 hover:underline">
                    {allSelected ? "Clear" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {codes.map((code) => (
                    <label key={code} className="flex items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={permissions.has(code)}
                        onChange={() => toggle(code)}
                        className="h-3.5 w-3.5 rounded border-border-strong text-brand-600"
                      />
                      {code}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-foreground-muted">{permissions.size} permission(s) selected.</p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={submitting} disabled={permissions.size === 0} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

export default function RolesPage() {
  const org = useCurrentOrg();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<OrgRole | null>(null);
  const [deleteRole, setDeleteRole] = useState<OrgRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["organizations", org?.organizationId, "roles"], queryFn: () => orgApi.roles(org!.organizationId), enabled: Boolean(org) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["organizations", org?.organizationId, "roles"] });

  const create = useMutation({
    mutationFn: (data: { name: string; description: string; permissionCodes: string[] }) =>
      orgApi.createRole(org!.organizationId, { name: data.name, description: data.description || undefined, permissionCodes: data.permissionCodes }),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const update = useMutation({
    mutationFn: (data: { name: string; description: string; permissionCodes: string[] }) =>
      orgApi.updateRole(org!.organizationId, editRole!.id, { name: data.name, description: data.description || undefined, permissionCodes: data.permissionCodes }),
    onSuccess: () => {
      invalidate();
      setEditRole(null);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (roleId: string) => orgApi.deleteRole(org!.organizationId, roleId),
    onSuccess: () => {
      invalidate();
      setDeleteRole(null);
      setError(null);
    },
    onError: (err) => {
      setError(errorMessage(err));
      setDeleteRole(null);
    },
  });

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Create custom roles for your organization, or assign one of the built-in system roles under Team Members."
        actions={<Button onClick={() => setCreateOpen(true)}>Create custom role</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {query.isLoading && (
        <Card>
          <SkeletonTable rows={4} cols={1} />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load roles. {errorMessage(query.error)}</Alert>}

      {query.data && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Custom roles</h2>
          {query.data.custom.length === 0 ? (
            <EmptyState title="No custom roles yet" description="Create one to grant a teammate exactly the permissions they need." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {query.data.custom.map((role) => (
                <RoleCard key={role.id} role={role} onEdit={() => setEditRole(role)} onDelete={() => setDeleteRole(role)} />
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-6 text-sm font-semibold text-foreground">System roles</h2>
          <p className="mb-3 -mt-2 text-xs text-foreground-muted">Built in, available to every organization, and read-only.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {query.data.global.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </div>
        </>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create custom role">
        <RoleForm
          initialName=""
          initialDescription=""
          initialPermissions={[]}
          submitting={create.isPending}
          submitLabel="Create role"
          error={error}
          onSubmit={(data) => {
            setError(null);
            create.mutate(data);
          }}
        />
      </Dialog>

      <Dialog open={editRole != null} onClose={() => setEditRole(null)} title={`Edit "${editRole?.name ?? ""}"`}>
        {editRole && (
          <RoleForm
            initialName={editRole.name}
            initialDescription={editRole.description ?? ""}
            initialPermissions={editRole.permissionCodes}
            submitting={update.isPending}
            submitLabel="Save changes"
            error={error}
            onSubmit={(data) => {
              setError(null);
              update.mutate(data);
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteRole != null}
        onCancel={() => setDeleteRole(null)}
        onConfirm={() => remove.mutate(deleteRole!.id)}
        title="Delete this role?"
        description={`"${deleteRole?.name}" will be permanently deleted. This only works if no team member currently has it assigned.`}
        confirmLabel="Delete role"
        loading={remove.isPending}
        danger
      />
    </div>
  );
}
