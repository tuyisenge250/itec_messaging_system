"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, StatGrid, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Table, Thead, Th, Tbody, Tr, Td } from "../../_components/ui/Table";
import { Badge } from "../../_components/ui/Badge";
import { Button, IconButton } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { ConfirmDialog } from "../../_components/ui/Dialog";
import { useToast } from "../../_components/ui/Toast";
import { X } from "lucide-react";

export default function AdminQueuesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pauseTarget, setPauseTarget] = useState<string | null>(null);
  const [resumeTarget, setResumeTarget] = useState<string | null>(null);
  const queues = useQuery({ queryKey: ["admin", "queues"], queryFn: () => adminApi.queues(), refetchInterval: 10_000 });

  const pause = useMutation({
    mutationFn: (queueName: string) => adminApi.pauseQueue(queueName),
    onSuccess: () => {
      toast.push("Queue paused", "success");
      setPauseTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "queues"] });
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  const resume = useMutation({
    mutationFn: (queueName: string) => adminApi.resumeQueue(queueName),
    onSuccess: () => {
      toast.push("Queue resumed", "success");
      setResumeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "queues"] });
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div>
      <PageHeader title="Queues" description="BullMQ job counts per queue. Expand a queue to inspect and retry failed jobs." />
      {queues.isLoading && (
        <Card>
          <SkeletonTable rows={5} cols={5} />
        </Card>
      )}
      {queues.isError && <Alert tone="danger">Unable to load queues. {errorMessage(queues.error)}</Alert>}
      {queues.data && (
        <div className="grid gap-4 sm:grid-cols-2">
          {queues.data.queues.map((q) => (
            <Card key={q.name}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{q.name}</p>
                <div className="flex items-center gap-2">
                  {q.isPaused && <Badge tone="warning">Paused</Badge>}
                  {q.failed > 0 && <Badge tone="danger">{q.failed} failed</Badge>}
                  {q.isPaused ? (
                    <button onClick={() => setResumeTarget(q.name)} className="text-xs font-medium text-brand-600 hover:underline">
                      Resume
                    </button>
                  ) : (
                    <button onClick={() => setPauseTarget(q.name)} className="text-xs font-medium text-brand-600 hover:underline">
                      Pause
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === q.name ? null : q.name)} className="text-xs font-medium text-brand-600 hover:underline">
                    {expanded === q.name ? "Hide failed" : "View failed"}
                  </button>
                </div>
              </div>
              <StatGrid
                rows={[
                  { label: "Waiting", value: q.waiting },
                  { label: "Active", value: q.active },
                  { label: "Delayed", value: q.delayed },
                  { label: "Completed", value: q.completed },
                  { label: "Failed", value: q.failed, tone: q.failed > 0 ? "danger" : "default" },
                ]}
              />
              {expanded === q.name && <FailedJobs queueName={q.name} />}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pauseTarget !== null}
        onCancel={() => setPauseTarget(null)}
        onConfirm={() => pause.mutate(pauseTarget!)}
        title={`Pause "${pauseTarget}"?`}
        description="No new jobs will be processed until this queue is resumed. Jobs already in progress will still finish."
        confirmLabel="Pause"
        loading={pause.isPending}
        danger
      />
      <ConfirmDialog
        open={resumeTarget !== null}
        onCancel={() => setResumeTarget(null)}
        onConfirm={() => resume.mutate(resumeTarget!)}
        title={`Resume "${resumeTarget}"?`}
        description="Job processing for this queue will start again immediately."
        confirmLabel="Resume"
        loading={resume.isPending}
      />
    </div>
  );
}

function FailedJobs({ queueName }: { queueName: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const jobs = useQuery({ queryKey: ["admin", "queues", queueName, "failed"], queryFn: () => adminApi.failedJobs(queueName) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "queues", queueName, "failed"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "queues"] });
  };

  const retry = useMutation({
    mutationFn: (jobId: string) => adminApi.retryJob(queueName, jobId),
    onSuccess: () => {
      toast.push("Job retried", "success");
      invalidate();
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  const remove = useMutation({
    mutationFn: (jobId: string) => adminApi.removeJob(queueName, jobId),
    onSuccess: () => {
      toast.push("Job removed", "success");
      setRemoveTarget(null);
      invalidate();
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <div className="mt-4 border-t border-border pt-4">
      {jobs.isLoading && <SkeletonTable rows={2} cols={3} />}
      {jobs.isError && <Alert tone="danger">Unable to load failed jobs. {errorMessage(jobs.error)}</Alert>}
      {jobs.data && jobs.data.jobs.length === 0 && <EmptyState title="No failed jobs" />}
      {jobs.data && jobs.data.jobs.length > 0 && (
        <Table>
          <Thead>
            <tr>
              <Th>Job</Th>
              <Th>Attempts</Th>
              <Th>Failed reason</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {jobs.data.jobs.map((job) => (
              <Tr key={job.id}>
                <Td className="font-mono text-xs">{job.id}</Td>
                <Td>{job.attemptsMade}</Td>
                <Td className="max-w-xs truncate text-xs text-foreground-muted">{job.failedReason}</Td>
                <Td className="space-x-2 text-xs">
                  <Button size="sm" variant="outline" onClick={() => retry.mutate(job.id!)} loading={retry.isPending}>
                    Retry
                  </Button>
                  <IconButton aria-label="Remove job" title="Remove job" onClick={() => setRemoveTarget(job.id!)}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => remove.mutate(removeTarget!)}
        title="Remove this job permanently?"
        description="This deletes the job from the queue. It will not be retried again."
        confirmLabel="Remove"
        loading={remove.isPending}
        danger
      />
    </div>
  );
}
