"use client";

import { use, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { senderIdsApi, documentsApi } from "../../../../_lib/api";
import { useCurrentOrg } from "../../../../_lib/use-current-user";
import { formatDateTime } from "../../../../_lib/format";
import { errorMessage } from "../../../../_lib/api-client";
import { PageHeader, Card } from "../../../../_components/ui/Layout";
import { StatusBadge } from "../../../../_components/ui/Badge";
import { Button } from "../../../../_components/ui/Button";
import { Select } from "../../../../_components/ui/Form";
import { Alert } from "../../../../_components/ui/Alert";
import { useToast } from "../../../../_components/ui/Toast";

const WORKFLOW = [
  "DRAFT",
  "SUBMITTED",
  "DOCUMENTS_REQUIRED",
  "UNDER_REVIEW",
  "RURA_SUBMITTED",
  "RURA_INFORMATION_REQUESTED",
  "RURA_APPROVED",
  "MNO_WHITELISTING",
  "APPROVED",
];

export default function SenderIdRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const org = useCurrentOrg();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docCode, setDocCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const request = useQuery({ queryKey: ["sender-id-requests", id], queryFn: () => senderIdsApi.getRequest(id) });
  const requirements = useQuery({ queryKey: ["document-requirements", "SENDER_ID"], queryFn: () => documentsApi.requirements("SENDER_ID") });
  const documents = useQuery({
    queryKey: ["documents", org?.organizationId, id],
    queryFn: () => documentsApi.list(org!.organizationId, id),
    enabled: Boolean(org),
  });

  const submit = useMutation({
    mutationFn: () => senderIdsApi.submitRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sender-id-requests", id] }),
    onError: (err) => setError(errorMessage(err)),
  });

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload(org!.organizationId, file, docCode, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", org?.organizationId, id] });
      toast.push("Document uploaded", "success");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (request.isLoading) return <p className="text-sm text-foreground-muted">Loading…</p>;
  if (!request.data) return <Alert tone="danger">Request not found.</Alert>;

  const r = request.data;
  const stepIndex = WORKFLOW.indexOf(r.status);
  const isRejectedOrCancelled = ["REJECTED", "CANCELLED", "RURA_REJECTED"].includes(r.status);

  return (
    <div>
      <PageHeader
        title={r.requestedValue}
        description={`${r.environment} · Created ${formatDateTime(r.createdAt)}`}
        actions={
          ["DRAFT", "DOCUMENTS_REQUIRED"].includes(r.status) && (
            <Button onClick={() => submit.mutate()} loading={submit.isPending}>
              Submit for review
            </Button>
          )
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {isRejectedOrCancelled ? (
        <Alert tone="danger" title={`Status: ${r.status.replaceAll("_", " ")}`}>
          {r.internalReviewNotes ?? "See status history below for details."}
        </Alert>
      ) : (
        <div className="mb-6 flex flex-wrap items-center gap-1 text-xs">
          {WORKFLOW.map((stage, i) => (
            <div key={stage} className="flex items-center gap-1">
              <span className={`rounded-full px-2 py-1 font-medium ${i <= stepIndex ? "bg-brand-50 text-brand-700" : "bg-background text-foreground-muted"}`}>
                {stage.replaceAll("_", " ")}
              </span>
              {i < WORKFLOW.length - 1 && <span className="text-foreground-muted">→</span>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Details</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Purpose" value={r.purpose ?? "—"} />
            <Row label="RURA reference" value={r.ruraReferenceNumber ?? "—"} />
            <Row label="Status" value={<StatusBadge status={r.status} />} />
          </dl>

          <h2 className="mb-2 mt-4 text-sm font-semibold text-foreground">Status history</h2>
          <ul className="space-y-2 text-xs">
            {(r.statusHistory ?? []).map((h) => (
              <li key={h.id} className="border-l-2 border-border pl-2">
                <span className="font-medium text-foreground">{h.toStatus.replaceAll("_", " ")}</span>{" "}
                <span className="text-foreground-muted">— {formatDateTime(h.createdAt)}</span>
                {h.note && <p className="text-foreground-muted">{h.note}</p>}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Documents</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {(documents.data?.documents ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <span className="truncate text-foreground">{d.originalFilename}</span>
                <StatusBadge status={d.status} />
              </li>
            ))}
            {documents.data && documents.data.documents.length === 0 && <p className="text-foreground-muted">No documents uploaded yet.</p>}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const file = fileRef.current?.files?.[0];
              if (file && docCode) upload.mutate(file);
            }}
            className="space-y-2"
          >
            <Select value={docCode} onChange={(e) => setDocCode(e.target.value)} required>
              <option value="">Document type…</option>
              {(requirements.data?.requirements ?? []).map((req) => (
                <option key={req.code} value={req.code}>
                  {req.label}
                </option>
              ))}
            </Select>
            <input ref={fileRef} type="file" required className="block w-full text-sm text-foreground-muted" />
            <Button type="submit" size="sm" loading={upload.isPending} disabled={!docCode}>
              Upload
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}
