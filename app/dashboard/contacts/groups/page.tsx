"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contactsApi } from "../../../_lib/api";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../_components/ui/Table";
import { Field, Input } from "../../../_components/ui/Form";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";
import { Dialog } from "../../../_components/ui/Dialog";

export default function ContactGroupsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => contactsApi.groups() });

  const create = useMutation({
    mutationFn: () => contactsApi.createGroup(name, description || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-groups"] });
      setOpen(false);
      setName("");
      setDescription("");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader title="Contact Groups" actions={<Button onClick={() => setOpen(true)}>New group</Button>} />
      {groups.isLoading && (
        <Card>
          <SkeletonTable rows={3} cols={2} />
        </Card>
      )}
      {groups.isError && <Alert tone="danger">Unable to load groups. {errorMessage(groups.error)}</Alert>}
      {groups.data && groups.data.groups.length === 0 && <EmptyState title="No contact groups yet" description="Groups let you target a campaign at a set of contacts." />}
      {groups.data && groups.data.groups.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {groups.data.groups.map((g) => (
              <Tr key={g.id}>
                <Td>{g.name}</Td>
                <Td>{g.description ?? "—"}</Td>
                <Td>
                  <Link href={`/dashboard/contacts/groups/${g.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    Manage members
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New contact group">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Name" required>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create group
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
