"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { Badge } from "../../../_components/ui/Badge";
import { Alert } from "../../../_components/ui/Alert";
import { useToast } from "../../../_components/ui/Toast";

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ queryKey: ["auth", "sessions"], queryFn: () => authApi.sessions() });

  const revoke = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toast.push("Session revoked", "success");
    },
  });

  return (
    <div>
      <PageHeader title="Sessions" description="Every device currently signed in to your account." />
      {sessions.isLoading && (
        <Card>
          <SkeletonTable rows={2} cols={3} />
        </Card>
      )}
      {sessions.isError && <Alert tone="danger">Unable to load sessions. {errorMessage(sessions.error)}</Alert>}
      {sessions.data && (
        <Table>
          <Thead>
            <tr>
              <Th>Device / User agent</Th>
              <Th>IP address</Th>
              <Th>Signed in</Th>
              <Th>Expires</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {sessions.data.sessions.map((s) => (
              <Tr key={s.id}>
                <Td className="max-w-80 truncate text-xs">{s.userAgent ?? "Unknown device"}</Td>
                <Td className="font-mono text-xs">{s.ipAddress ?? "—"}</Td>
                <Td>{formatDateTime(s.createdAt)}</Td>
                <Td>{formatDateTime(s.expiresAt)}</Td>
                <Td>
                  {s.isCurrent ? (
                    <Badge tone="brand">This device</Badge>
                  ) : (
                    <button onClick={() => revoke.mutate(s.id)} className="text-xs text-danger hover:underline">
                      Revoke
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
