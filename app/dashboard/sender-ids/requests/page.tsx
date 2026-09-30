"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { senderIdsApi } from "../../../_lib/api";
import { errorMessage } from "../../../_lib/api-client";
import { useEnvironment } from "../../../_lib/environment-context";
import { formatDate } from "../../../_lib/format";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { Field, Input, Select } from "../../../_components/ui/Form";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";
import { Dialog } from "../../../_components/ui/Dialog";
import { StatusBadge } from "../../../_components/ui/Badge";

export default function SenderIdRequestsPage() {
  const queryClient = useQueryClient();
  const { environment } = useEnvironment();
  const [open, setOpen] = useState(false);
  const [requestedValue, setRequestedValue] = useState("");
  const [reqEnvironment, setReqEnvironment] = useState(environment);
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);

  const requests = useQuery({ queryKey: ["sender-id-requests"], queryFn: () => senderIdsApi.listRequests() });

  const create = useMutation({
    mutationFn: () => senderIdsApi.createRequest({ requestedValue, environment: reqEnvironment, purpose: purpose || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sender-id-requests"] });
      setOpen(false);
      setRequestedValue("");
      setPurpose("");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader title="Sender ID Requests" description="Our internal review + RURA workflow representation — not a live regulatory feed." actions={<Button onClick={() => setOpen(true)}>New request</Button>} />

      {requests.isLoading && (
        <Card>
          <SkeletonTable rows={3} cols={3} />
        </Card>
      )}
      {requests.isError && <Alert tone="danger">Unable to load requests. {errorMessage(requests.error)}</Alert>}
      {requests.data && requests.data.senderIdRequests.length === 0 && <EmptyState title="No requests yet" description="Request a sender ID to get started." />}
      {requests.data && requests.data.senderIdRequests.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Value</Th>
              <Th>Environment</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {requests.data.senderIdRequests.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.requestedValue}</Td>
                <Td>{r.environment}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td>{formatDate(r.createdAt)}</Td>
                <Td>
                  <Link href={`/dashboard/sender-ids/requests/${r.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    View
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Request a sender ID">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Sender ID value" required hint="Max 11 characters, letters/numbers/spaces.">
            <Input required maxLength={11} value={requestedValue} onChange={(e) => setRequestedValue(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Environment" required>
            <Select value={reqEnvironment} onChange={(e) => setReqEnvironment(e.target.value as "SANDBOX" | "PRODUCTION")}>
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </Select>
          </Field>
          <Field label="Purpose">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. OTP and order notifications" />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create draft
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
