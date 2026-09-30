"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orgApi } from "../../_lib/api";
import { useCurrentOrg } from "../../_lib/use-current-user";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Field, Input, Select } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Badge } from "../../_components/ui/Badge";
import { Dialog } from "../../_components/ui/Dialog";
import type { OrgRole } from "../../_lib/api/types";

function RoleSelect({ roles, value, onChange, className }: { roles: OrgRole[]; value: string; onChange: (roleId: string) => void; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <optgroup label="Custom roles">
        {roles
          .filter((r) => !r.isSystem)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </optgroup>
      <optgroup label="System roles">
        {roles
          .filter((r) => r.isSystem)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </optgroup>
    </Select>
  );
}

export default function TeamPage() {
  const org = useCurrentOrg();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const members = useQuery({ queryKey: ["organizations", org?.organizationId, "members"], queryFn: () => orgApi.members(org!.organizationId), enabled: Boolean(org) });
  const rolesQuery = useQuery({ queryKey: ["organizations", org?.organizationId, "roles"], queryFn: () => orgApi.roles(org!.organizationId), enabled: Boolean(org) });
  const allRoles: OrgRole[] = [...(rolesQuery.data?.custom ?? []), ...(rolesQuery.data?.global ?? [])];

  const create = useMutation({
    mutationFn: () => orgApi.createMember(org!.organizationId, email, roleId, name || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organizations", org?.organizationId, "members"] });
      setOpen(false);
      if (data.temporaryPassword) setCredential({ email, password: data.temporaryPassword });
      setName("");
      setEmail("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const updateRole = useMutation({
    mutationFn: ({ membershipId, roleId }: { membershipId: string; roleId: string }) => orgApi.updateMemberRole(org!.organizationId, membershipId, roleId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["organizations", org?.organizationId, "members"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (membershipId: string) => orgApi.removeMember(org!.organizationId, membershipId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["organizations", org?.organizationId, "members"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const resetPassword = useMutation({
    mutationFn: (membershipId: string) => orgApi.resetMemberPassword(org!.organizationId, membershipId),
    onSuccess: (data, membershipId) => {
      setError(null);
      const target = members.data?.members.find((m) => m.id === membershipId);
      if (target) setCredential({ email: target.email, password: data.temporaryPassword });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function openCreateDialog() {
    setRoleId(allRoles[0]?.id ?? "");
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Team Members"
        description="Create a member directly and assign it a role. Roles are managed under Roles & Permissions."
        actions={<Button onClick={openCreateDialog}>Add member</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {credential && (
        <Alert tone="warning" title="Copy this password now — it will not be shown again">
          <p className="text-xs text-foreground-muted">
            Share it with <span className="font-medium text-foreground">{credential.email}</span> out of band. They should sign in and change it.
          </p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{credential.password}</code>
          <button onClick={() => setCredential(null)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
            Dismiss
          </button>
        </Alert>
      )}

      {(members.isLoading || rolesQuery.isLoading) && (
        <Card>
          <SkeletonTable rows={3} cols={3} />
        </Card>
      )}
      {members.isError && <Alert tone="danger">Unable to load members. {errorMessage(members.error)}</Alert>}
      {rolesQuery.isError && <Alert tone="danger">Unable to load roles. {errorMessage(rolesQuery.error)}</Alert>}
      {members.data && rolesQuery.data && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {members.data.members.map((m) => (
              <Tr key={m.id}>
                <Td>{m.name ?? "—"}</Td>
                <Td>{m.email}</Td>
                <Td>
                  <RoleSelect
                    roles={allRoles}
                    value={m.roleId}
                    onChange={(newRoleId) => updateRole.mutate({ membershipId: m.id, roleId: newRoleId })}
                    className="w-44 py-1 text-xs"
                  />
                </Td>
                <Td>
                  <Badge tone={m.status === "ACTIVE" ? "success" : "neutral"}>{m.status}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-3">
                    {m.status === "ACTIVE" && (
                      <button
                        onClick={() => resetPassword.mutate(m.id)}
                        disabled={resetPassword.isPending}
                        className="text-xs text-foreground-muted hover:underline"
                      >
                        Reset password
                      </button>
                    )}
                    <button onClick={() => remove.mutate(m.id)} className="text-xs text-danger hover:underline">
                      Remove
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add team member">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" required hint="If this email already has an account, it's attached to your organization as-is.">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" required>
            <RoleSelect roles={allRoles} value={roleId} onChange={setRoleId} />
          </Field>
          <p className="text-xs text-foreground-muted">
            Need a different set of permissions?{" "}
            <Link href="/dashboard/roles" className="text-brand-600 hover:underline">
              Create a custom role
            </Link>
            .
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending} disabled={!roleId} className="w-full">
            Add member
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
