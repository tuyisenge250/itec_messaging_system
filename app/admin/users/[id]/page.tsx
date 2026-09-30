"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../_lib/api";
import { formatDate, formatDateTime } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, StatGrid, SkeletonTable, EmptyState } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { StatusBadge, Badge } from "../../../_components/ui/Badge";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";
import { Dialog, ConfirmDialog } from "../../../_components/ui/Dialog";
import { Field, Input } from "../../../_components/ui/Form";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [confirmStatus, setConfirmStatus] = useState<"ACTIVE" | "DISABLED" | null>(null);
  const [confirmPlatformAdmin, setConfirmPlatformAdmin] = useState<boolean | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [platformAdminError, setPlatformAdminError] = useState<string | null>(null);
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null);

  const user = useQuery({ queryKey: ["admin", "user", id], queryFn: () => adminApi.user(id) });
  const sessions = useQuery({ queryKey: ["admin", "user", id, "sessions"], queryFn: () => adminApi.userSessions(id) });
  const activity = useQuery({ queryKey: ["admin", "user", id, "activity"], queryFn: () => adminApi.userActivity(id) });

  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "DISABLED") => adminApi.setUserStatus(id, status),
    onSuccess: () => {
      setConfirmStatus(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const setPlatformAdmin = useMutation({
    mutationFn: (isPlatformAdmin: boolean) => adminApi.setPlatformAdmin(id, isPlatformAdmin),
    onSuccess: () => {
      setConfirmPlatformAdmin(null);
      setPlatformAdminError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      setPlatformAdminError(errorMessage(err));
      setConfirmPlatformAdmin(null);
    },
  });

  const resetPassword = useMutation({
    mutationFn: () => adminApi.resetUserPassword(id, newPassword),
    onSuccess: () => {
      setResetSuccess(true);
      setResetError(null);
    },
    onError: (err) => setResetError(errorMessage(err)),
  });

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => adminApi.revokeUserSession(id, sessionId),
    onSuccess: () => {
      setRevokeSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id, "sessions"] });
    },
  });

  return (
    <div>
      <PageHeader title={user.data?.email ?? "User"} description={user.data?.name ?? undefined} />
      {user.isLoading && (
        <Card>
          <SkeletonTable rows={3} />
        </Card>
      )}
      {user.isError && <Alert tone="danger">Unable to load user. {errorMessage(user.error)}</Alert>}
      {platformAdminError && <Alert tone="danger">{platformAdminError}</Alert>}

      {user.data && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Profile</p>
              <div className="flex flex-wrap gap-2">
                {user.data.status === "ACTIVE" ? (
                  <Button size="sm" variant="danger" onClick={() => setConfirmStatus("DISABLED")}>
                    Disable
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setConfirmStatus("ACTIVE")}>
                    Reactivate
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
                  Reset password
                </Button>
                {user.data.isPlatformAdmin ? (
                  <Button size="sm" variant="danger" onClick={() => setConfirmPlatformAdmin(false)}>
                    Revoke platform admin
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirmPlatformAdmin(true)}>
                    Grant platform admin
                  </Button>
                )}
              </div>
            </div>
            <StatGrid
              rows={[
                { label: "Status", value: <StatusBadge status={user.data.status} /> },
                { label: "Platform admin", value: user.data.isPlatformAdmin ? <Badge tone="brand">Yes</Badge> : "No" },
                { label: "Organizations", value: user.data._count.memberships },
                { label: "Created", value: formatDate(user.data.createdAt) },
              ]}
            />
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold text-foreground">Organization memberships</p>
            {user.data.memberships.length === 0 ? (
              <p className="text-sm text-foreground-muted">Not a member of any organization.</p>
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Organization</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Joined</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {user.data.memberships.map((m) => (
                    <Tr key={m.organizationId}>
                      <Td>{m.organizationName}</Td>
                      <Td>{m.role}</Td>
                      <Td>
                        <StatusBadge status={m.status} />
                      </Td>
                      <Td>{m.joinedAt ? formatDate(m.joinedAt) : "—"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold text-foreground">Active sessions</p>
            {sessions.isLoading && <SkeletonTable rows={2} cols={3} />}
            {sessions.data && sessions.data.sessions.length === 0 && <p className="text-sm text-foreground-muted">No active sessions.</p>}
            {sessions.data && sessions.data.sessions.length > 0 && (
              <Table>
                <Thead>
                  <tr>
                    <Th>Device / User agent</Th>
                    <Th>IP address</Th>
                    <Th>Created</Th>
                    <Th>Expires</Th>
                    <Th />
                  </tr>
                </Thead>
                <Tbody>
                  {sessions.data.sessions.map((s) => (
                    <Tr key={s.id}>
                      <Td className="max-w-xs truncate text-xs">{s.userAgent ?? "—"}</Td>
                      <Td className="text-xs">{s.ipAddress ?? "—"}</Td>
                      <Td>{formatDateTime(s.createdAt)}</Td>
                      <Td>{formatDateTime(s.expiresAt)}</Td>
                      <Td>
                        <button onClick={() => setRevokeSessionId(s.id)} className="text-xs text-danger hover:underline">
                          Revoke
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>

          <Card>
            <p className="mb-3 text-sm font-semibold text-foreground">Recent activity</p>
            {activity.isLoading && <SkeletonTable rows={2} cols={3} />}
            {activity.data && activity.data.events.length === 0 && <EmptyState title="No audit activity yet" />}
            {activity.data && activity.data.events.length > 0 && (
              <Table>
                <Thead>
                  <tr>
                    <Th>Action</Th>
                    <Th>Resource</Th>
                    <Th>Date</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {activity.data.events.map((e) => (
                    <Tr key={e.id}>
                      <Td>{e.action}</Td>
                      <Td>
                        {e.resourceType}
                        {e.resourceId ? ` · ${e.resourceId}` : ""}
                      </Td>
                      <Td>{formatDateTime(e.createdAt)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmStatus !== null}
        onCancel={() => setConfirmStatus(null)}
        onConfirm={() => setStatus.mutate(confirmStatus!)}
        title={confirmStatus === "DISABLED" ? "Disable this user?" : "Reactivate this user?"}
        description={
          confirmStatus === "DISABLED"
            ? "This immediately signs them out everywhere and blocks future logins. Their organization memberships are kept as-is."
            : "This restores their ability to log in, with the same organization access they had before."
        }
        confirmLabel={confirmStatus === "DISABLED" ? "Disable" : "Reactivate"}
        loading={setStatus.isPending}
        danger={confirmStatus === "DISABLED"}
      />

      <ConfirmDialog
        open={confirmPlatformAdmin !== null}
        onCancel={() => setConfirmPlatformAdmin(null)}
        onConfirm={() => setPlatformAdmin.mutate(confirmPlatformAdmin!)}
        title={confirmPlatformAdmin ? "Grant platform admin access?" : "Revoke platform admin access?"}
        description={
          confirmPlatformAdmin
            ? "This user will gain full access to every organization's data and every platform-admin action."
            : "This immediately removes their platform-wide access. Refused if they're the last remaining platform admin."
        }
        confirmLabel={confirmPlatformAdmin ? "Grant" : "Revoke"}
        loading={setPlatformAdmin.isPending}
        danger={!confirmPlatformAdmin}
      />

      <ConfirmDialog
        open={revokeSessionId !== null}
        onCancel={() => setRevokeSessionId(null)}
        onConfirm={() => revokeSession.mutate(revokeSessionId!)}
        title="Revoke this session?"
        description="Immediately signs that device out."
        confirmLabel="Revoke"
        loading={revokeSession.isPending}
        danger
      />

      <Dialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setNewPassword("");
          setResetError(null);
          setResetSuccess(false);
        }}
        title="Reset password"
      >
        {resetSuccess ? (
          <Alert tone="success">Password reset. Share the new password with the user out of band — all their existing sessions have been signed out.</Alert>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setResetError(null);
              resetPassword.mutate();
            }}
            className="space-y-3"
          >
            <Field label="New password" required hint="At least 10 characters, with a letter and a number.">
              <Input type="text" required minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            {resetError && <Alert tone="danger">{resetError}</Alert>}
            <Button type="submit" loading={resetPassword.isPending} className="w-full">
              Reset password
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
