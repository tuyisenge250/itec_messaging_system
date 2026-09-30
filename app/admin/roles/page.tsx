"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { ORG_ASSIGNABLE_PERMISSION_CODES } from "@/shared/constants/permissions";
import { PageHeader, Card, SkeletonTable } from "../../_components/ui/Layout";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { useToast } from "../../_components/ui/Toast";
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

export default function AdminRolesPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["admin", "global-roles"], queryFn: () => adminApi.globalRoles() });

  return (
    <div>
      <PageHeader
        title="Roles & Permission Defaults"
        description="These are the built-in roles every organization shares — editing one changes the default for every organization on the platform immediately, not just new ones."
      />
      <Alert tone="warning">
        Every organization references these exact role rows. Removing a permission here removes it from that role for every organization right away —
        including any member currently signed in.
      </Alert>
      <div className="mt-4 space-y-3">
        {query.isLoading && (
          <Card>
            <SkeletonTable />
          </Card>
        )}
        {query.isError && <Alert tone="danger">Unable to load roles. {errorMessage(query.error)}</Alert>}
        {query.data?.roles.map((role) => (
          <Card key={role.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{role.name}</p>
                {role.description && <p className="mt-0.5 text-xs text-foreground-muted">{role.description}</p>}
                <p className="mt-0.5 text-xs text-foreground-muted">{role.permissionCodes.length} permission(s) granted</p>
              </div>
              <button onClick={() => setExpanded(expanded === role.id ? null : role.id)} className="text-xs font-medium text-brand-600 hover:underline">
                {expanded === role.id ? "Hide" : "Edit permissions"}
              </button>
            </div>
            {expanded === role.id && <RolePermissionEditor role={role} />}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RolePermissionEditor({ role }: { role: OrgRole }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [permissions, setPermissions] = useState<Set<string>>(new Set(role.permissionCodes));

  const save = useMutation({
    mutationFn: () => adminApi.updateGlobalRole(role.id, Array.from(permissions)),
    onSuccess: () => {
      toast.push(`${role.name} updated — this now applies to every organization`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "global-roles"] });
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

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
    <div className="mt-4 border-t border-border pt-4">
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
      <Button size="sm" className="mt-3" loading={save.isPending} onClick={() => save.mutate()}>
        Save — applies to every organization
      </Button>
    </div>
  );
}
