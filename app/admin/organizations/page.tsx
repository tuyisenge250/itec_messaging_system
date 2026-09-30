"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDate } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Alert } from "../../_components/ui/Alert";

const ACTIONS: Record<string, Array<{ label: string; action: "approve" | "reject" | "activate" | "suspend" }>> = {
  UNDER_REVIEW: [
    { label: "Approve", action: "approve" },
    { label: "Reject", action: "reject" },
  ],
  VERIFIED: [{ label: "Activate", action: "activate" }],
  ACTIVE: [{ label: "Suspend", action: "suspend" }],
  SUSPENDED: [{ label: "Reactivate", action: "activate" }],
};

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "organizations"], queryFn: () => adminApi.organizations() });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "activate" | "suspend" }) => adminApi.orgAction(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] }),
  });

  return (
    <div>
      <PageHeader title="Organizations" />
      {query.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load organizations. {errorMessage(query.error)}</Alert>}
      {query.data && query.data.organizations.length === 0 && <EmptyState title="No organizations yet" />}
      {query.data && query.data.organizations.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Legal name</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {query.data.organizations.map((o) => (
              <Tr key={o.id} onClick={() => router.push(`/admin/organizations/${o.id}`)}>
                <Td>{o.legalName}</Td>
                <Td>
                  <StatusBadge status={o.status} />
                </Td>
                <Td>{formatDate(o.createdAt)}</Td>
                <Td className="space-x-2 text-xs">
                  {(ACTIONS[o.status] ?? []).map((a) => (
                    <button
                      key={a.action}
                      onClick={(e) => {
                        e.stopPropagation();
                        act.mutate({ id: o.id, action: a.action });
                      }}
                      disabled={act.isPending}
                      className="font-medium text-brand-600 hover:underline disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ))}
                  {!(ACTIONS[o.status] ?? []).length && <span className="text-foreground-muted">—</span>}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
