"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contactsApi } from "../../../../_lib/api";
import { errorMessage } from "../../../../_lib/api-client";
import { PageHeader, Card, EmptyState } from "../../../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../../../_components/ui/Table";
import { Select, Field } from "../../../../_components/ui/Form";
import { Button } from "../../../../_components/ui/Button";
import { Alert } from "../../../../_components/ui/Alert";

export default function GroupMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [selectedContact, setSelectedContact] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({ queryKey: ["contact-groups", id, "members"], queryFn: () => contactsApi.groupMembers(id) });
  const allContacts = useQuery({ queryKey: ["contacts"], queryFn: () => contactsApi.list() });

  const memberIds = new Set((members.data?.members ?? []).map((m) => m.contact.id));
  const available = (allContacts.data?.contacts ?? []).filter((c) => !memberIds.has(c.id));

  const add = useMutation({
    mutationFn: () => contactsApi.addToGroup(id, selectedContact),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-groups", id, "members"] });
      setSelectedContact("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (contactId: string) => contactsApi.removeFromGroup(id, contactId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contact-groups", id, "members"] }),
  });

  return (
    <div>
      <PageHeader title="Group members" />

      <Card className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (selectedContact) add.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Field label="Add a contact" className="min-w-[240px] flex-1">
            <Select value={selectedContact} onChange={(e) => setSelectedContact(e.target.value)}>
              <option value="">Select a contact…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.phoneNormalized} — {c.phoneNormalized}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={add.isPending} disabled={!selectedContact}>
            Add
          </Button>
        </form>
        {error && (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </Card>

      {members.data && members.data.members.length === 0 && <EmptyState title="No members yet" description="Add contacts to this group above." />}
      {members.data && members.data.members.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {members.data.members.map(({ contact }) => (
              <Tr key={contact.id}>
                <Td>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</Td>
                <Td>{contact.phoneNormalized}</Td>
                <Td>
                  <button onClick={() => remove.mutate(contact.id)} className="text-xs text-danger hover:underline">
                    Remove
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
