"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDate } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination } from "../../_components/ui/Table";
import { StatusBadge, Badge } from "../../_components/ui/Badge";
import { Field, Input, Select, Checkbox } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Dialog } from "../../_components/ui/Dialog";

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [platformAdminFilter, setPlatformAdminFilter] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [grantAdmin, setGrantAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const query = useQuery({
    queryKey: ["admin", "users", search, status, platformAdminFilter, cursor],
    queryFn: () => adminApi.users(search || undefined, status || undefined, platformAdminFilter ? platformAdminFilter === "true" : undefined, cursor),
  });

  const create = useMutation({
    mutationFn: () => adminApi.createUser(email, name || undefined, grantAdmin),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setCreateOpen(false);
      setCredential({ email, password: data.temporaryPassword });
      setEmail("");
      setName("");
      setGrantAdmin(false);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Every platform account, across all organizations."
        actions={<Button onClick={() => setCreateOpen(true)}>Create user</Button>}
      />

      {credential && (
        <Alert tone="warning" title="Copy this password now — it will not be shown again">
          <p className="text-xs text-foreground-muted">
            Share it with <span className="font-medium text-foreground">{credential.email}</span> out of band.
          </p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">{credential.password}</code>
          <button onClick={() => setCredential(null)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
            Dismiss
          </button>
        </Alert>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
          setCursors([]);
        }}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <div className="w-64">
          <Input placeholder="Search by name or email" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursors([]);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </Select>
        </div>
        <div className="w-44">
          <Select
            value={platformAdminFilter}
            onChange={(e) => {
              setPlatformAdminFilter(e.target.value);
              setCursors([]);
            }}
          >
            <option value="">All users</option>
            <option value="true">Platform admins only</option>
            <option value="false">Non-admins only</option>
          </Select>
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {query.isLoading && (
        <Card>
          <SkeletonTable rows={4} />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load users. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.users.length === 0 && <EmptyState title="No users found" description="Try changing your filters or search query." />}
      {query.data && query.data.users.length > 0 && (
        <>
          <Table>
            <Thead>
              <tr>
                <Th>Email</Th>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Organizations</Th>
                <Th>Created</Th>
              </tr>
            </Thead>
            <Tbody>
              {query.data.users.map((u) => (
                <Tr key={u.id} onClick={() => router.push(`/admin/users/${u.id}`)}>
                  <Td>{u.email}</Td>
                  <Td>{u.name ?? "—"}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <StatusBadge status={u.status} />
                      {u.isPlatformAdmin && <Badge tone="brand">Platform admin</Badge>}
                    </div>
                  </Td>
                  <Td>{u._count.memberships}</Td>
                  <Td>{formatDate(u.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination
            hasMore={query.data.users.length === PAGE_SIZE}
            canGoBack={cursors.length > 0}
            loading={query.isFetching}
            onNext={() => setCursors((c) => [...c, query.data!.users[query.data!.users.length - 1].id])}
            onPrev={() => setCursors((c) => c.slice(0, -1))}
          />
        </>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create user">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Email" required>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={grantAdmin} onChange={(e) => setGrantAdmin(e.target.checked)} />
            Grant platform admin access
          </label>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create user
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
