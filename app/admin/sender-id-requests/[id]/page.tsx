"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, senderIdsApi, documentsApi } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { errorMessage } from "../../../_lib/api-client";
import { PageHeader, Card } from "../../../_components/ui/Layout";
import { StatusBadge } from "../../../_components/ui/Badge";
import { Button } from "../../../_components/ui/Button";
import { Select, Field, Input } from "../../../_components/ui/Form";
import { Alert } from "../../../_components/ui/Alert";

const REVIEW_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "DOCUMENTS_REQUIRED"],
  UNDER_REVIEW: ["DOCUMENTS_REQUIRED", "RURA_SUBMITTED"],
  RURA_SUBMITTED: ["RURA_INFORMATION_REQUESTED", "RURA_APPROVED", "RURA_REJECTED"],
  RURA_INFORMATION_REQUESTED: ["RURA_SUBMITTED"],
  RURA_APPROVED: ["MNO_WHITELISTING"],
};
const REJECTABLE = ["SUBMITTED", "DOCUMENTS_REQUIRED", "UNDER_REVIEW", "RURA_SUBMITTED", "RURA_INFORMATION_REQUESTED", "RURA_REJECTED"];

export default function AdminSenderIdRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [toStatus, setToStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const request = useQuery({ queryKey: ["sender-id-requests", id], queryFn: () => senderIdsApi.getRequest(id) });
  const documents = useQuery({
    queryKey: ["documents", request.data?.organizationId, id],
    queryFn: () => documentsApi.list(request.data!.organizationId, id),
    enabled: Boolean(request.data),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["sender-id-requests", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "sender-id-requests"] });
  }

  const review = useMutation({
    mutationFn: () => adminApi.review(id, toStatus, notes || undefined),
    onSuccess: () => {
      invalidate();
      setToStatus("");
      setNotes("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const approve = useMutation({ mutationFn: () => adminApi.approveSenderId(id), onSuccess: invalidate, onError: (err) => setError(errorMessage(err)) });
  const reject = useMutation({ mutationFn: () => adminApi.rejectSenderId(id), onSuccess: invalidate, onError: (err) => setError(errorMessage(err)) });
  const reviewDoc = useMutation({
    mutationFn: ({ docId, decision }: { docId: string; decision: "approve" | "reject" }) => adminApi.reviewDocument(docId, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", request.data?.organizationId, id] }),
  });

  if (!request.data) return null;
  const r = request.data;
  const transitions = REVIEW_TRANSITIONS[r.status] ?? [];

  return (
    <div>
      <PageHeader title={r.requestedValue} description={`${r.organization?.legalName ?? ""} · ${r.environment} · ${formatDateTime(r.createdAt)}`} />
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="mb-4">
        <StatusBadge status={r.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Move workflow</h2>
          {transitions.length > 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                review.mutate();
              }}
              className="space-y-3"
            >
              <Field label="Next status">
                <Select required value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
                  <option value="" disabled>
                    Select…
                  </option>
                  {transitions.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Button type="submit" size="sm" loading={review.isPending} disabled={!toStatus}>
                Apply
              </Button>
            </form>
          )}
          <div className="mt-4 flex gap-2">
            {r.status === "MNO_WHITELISTING" && (
              <Button size="sm" onClick={() => approve.mutate()} loading={approve.isPending}>
                Approve — activate sender ID
              </Button>
            )}
            {REJECTABLE.includes(r.status) && (
              <Button size="sm" variant="danger" onClick={() => reject.mutate()} loading={reject.isPending}>
                Reject
              </Button>
            )}
          </div>
          {transitions.length === 0 && r.status !== "MNO_WHITELISTING" && !REJECTABLE.includes(r.status) && (
            <p className="text-sm text-foreground-muted">This request is in a terminal state.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Documents</h2>
          {documents.data && documents.data.documents.length === 0 && <p className="text-sm text-foreground-muted">No documents uploaded.</p>}
          <ul className="space-y-2">
            {documents.data?.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{d.originalFilename}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={d.status} />
                  {d.status === "PENDING" && (
                    <>
                      <button onClick={() => reviewDoc.mutate({ docId: d.id, decision: "approve" })} className="text-xs text-success hover:underline">
                        Approve
                      </button>
                      <button onClick={() => reviewDoc.mutate({ docId: d.id, decision: "reject" })} className="text-xs text-danger hover:underline">
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Status history</h2>
        <ul className="space-y-2 text-xs">
          {(r.statusHistory ?? []).map((h) => (
            <li key={h.id} className="border-l-2 border-border pl-2">
              <span className="font-medium text-foreground">{h.toStatus.replaceAll("_", " ")}</span> <span className="text-foreground-muted">— {formatDateTime(h.createdAt)}</span>
              {h.note && <p className="text-foreground-muted">{h.note}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
