"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contactsApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Field, Input } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Dialog } from "../../_components/ui/Dialog";
import { useToast } from "../../_components/ui/Toast";
import type { ImportContactsResult } from "../../_lib/api/types";

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => contactsApi.list() });

  const create = useMutation({
    mutationFn: () => contactsApi.create({ phoneNumber, firstName: firstName || undefined, lastName: lastName || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setOpen(false);
      setPhoneNumber("");
      setFirstName("");
      setLastName("");
      toast.push("Contact added", "success");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button onClick={() => setOpen(true)}>Add contact</Button>
          </div>
        }
      />

      {contacts.isLoading && (
        <Card>
          <SkeletonTable />
        </Card>
      )}
      {contacts.isError && <Alert tone="danger">Unable to load contacts. {errorMessage(contacts.error)}</Alert>}
      {contacts.data && contacts.data.contacts.length === 0 && <EmptyState title="No contacts yet" description="Add a contact to start building your audience." />}
      {contacts.data && contacts.data.contacts.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Subscribed</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {contacts.data.contacts.map((c) => (
              <Tr key={c.id}>
                <Td>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</Td>
                <Td>{c.phoneNormalized}</Td>
                <Td>{c.email ?? "—"}</Td>
                <Td>{c.isSubscribed ? "Yes" : "No"}</Td>
                <Td>
                  <button onClick={() => remove.mutate(c.id)} className="text-xs text-danger hover:underline">
                    Delete
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add contact">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Phone number" required>
            <Input required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+250788000001" />
          </Field>
          <Field label="First name">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Add contact
          </Button>
        </form>
      </Dialog>

      <ImportContactsDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function ImportContactsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportContactsResult | null>(null);

  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => contactsApi.groups(), enabled: open });

  const importMutation = useMutation({
    mutationFn: () => contactsApi.import(file!, groupId || undefined),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.push(`Imported ${data.imported} contact(s)`, "success");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function handleClose() {
    setFile(null);
    setGroupId("");
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Import contacts from CSV">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setResult(null);
          importMutation.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-xs text-foreground-muted">
          CSV with a <code>phoneNumber</code> column (required) and optional <code>firstName</code>, <code>lastName</code>, <code>email</code> columns. Up
          to 5,000 rows per upload.
        </p>
        <Field label="CSV file" required>
          <input
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
          />
        </Field>
        {groups.data && groups.data.groups.length > 0 && (
          <Field label="Add to group (optional)">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">No group</option>
              {groups.data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {result && (
          <Alert tone={result.errors.length > 0 ? "warning" : "success"}>
            Imported {result.imported}, skipped {result.skipped} (already existed).
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.reason}
                  </li>
                ))}
                {result.errors.length > 10 && <li>...and {result.errors.length - 10} more</li>}
              </ul>
            )}
          </Alert>
        )}
        <Button type="submit" loading={importMutation.isPending} disabled={!file} className="w-full">
          Import
        </Button>
      </form>
    </Dialog>
  );
}
