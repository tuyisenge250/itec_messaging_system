"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { documentsApi } from "../../_lib/api";
import { useCurrentOrg } from "../../_lib/use-current-user";
import { formatDate } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { StatusBadge } from "../../_components/ui/Badge";
import { Select } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { useToast } from "../../_components/ui/Toast";

export default function DocumentsPage() {
  const org = useCurrentOrg();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docCode, setDocCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["documents", org?.organizationId, "org-level"],
    queryFn: () => documentsApi.list(org!.organizationId),
    enabled: Boolean(org),
  });
  const requirements = useQuery({ queryKey: ["document-requirements", "ORGANIZATION"], queryFn: () => documentsApi.requirements("ORGANIZATION") });

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload(org!.organizationId, file, docCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", org?.organizationId, "org-level"] });
      toast.push("Document uploaded", "success");
      if (fileRef.current) fileRef.current.value = "";
      setDocCode("");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader title="Documents" description="Compliance documents for your organization (business registration, TIN, representative ID)." />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Upload a document</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const file = fileRef.current?.files?.[0];
            if (file && docCode) upload.mutate(file);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[220px]">
            <Select value={docCode} onChange={(e) => setDocCode(e.target.value)} required>
              <option value="">Document type…</option>
              {(requirements.data?.requirements ?? []).map((req) => (
                <option key={req.code} value={req.code}>
                  {req.label}
                </option>
              ))}
            </Select>
          </div>
          <input ref={fileRef} type="file" required className="block text-sm text-foreground-muted" />
          <Button type="submit" loading={upload.isPending} disabled={!docCode}>
            Upload
          </Button>
        </form>
        {error && (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </Card>

      {documents.isLoading && (
        <Card>
          <SkeletonTable rows={3} cols={3} />
        </Card>
      )}
      {documents.data && documents.data.documents.length === 0 && <EmptyState title="No documents uploaded" description="Upload your business registration certificate and other required documents above." />}
      {documents.data && documents.data.documents.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>File</Th>
              <Th>Status</Th>
              <Th>Review notes</Th>
              <Th>Uploaded</Th>
            </tr>
          </Thead>
          <Tbody>
            {documents.data.documents.map((d) => (
              <Tr key={d.id}>
                <Td>{d.originalFilename}</Td>
                <Td>
                  <StatusBadge status={d.status} />
                </Td>
                <Td>{d.reviewNotes ?? "—"}</Td>
                <Td>{formatDate(d.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
