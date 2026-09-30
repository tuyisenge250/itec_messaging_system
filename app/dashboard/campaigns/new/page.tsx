"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { campaignsApi, contactsApi, senderIdsApi, templatesApi } from "../../../_lib/api";
import { errorMessage } from "../../../_lib/api-client";
import { useEnvironment } from "../../../_lib/environment-context";
import { PageHeader, Card } from "../../../_components/ui/Layout";
import { Field, Input, Select, Checkbox } from "../../../_components/ui/Form";
import { Button } from "../../../_components/ui/Button";
import { Alert } from "../../../_components/ui/Alert";

export default function NewCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { environment } = useEnvironment();

  const [name, setName] = useState("");
  const [senderIdId, setSenderIdId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [contactGroupId, setContactGroupId] = useState("");
  const [batchSize, setBatchSize] = useState(1000);
  const [scheduledAt, setScheduledAt] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [recurrenceEndAt, setRecurrenceEndAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const senderIds = useQuery({ queryKey: ["sender-ids", "active"], queryFn: () => senderIdsApi.active() });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => templatesApi.list() });
  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => contactsApi.groups() });

  const activeSenderIds = (senderIds.data?.senderIds ?? []).filter((s) => s.status === "ACTIVE" && s.environment === environment);

  const create = useMutation({
    mutationFn: () =>
      campaignsApi.create(environment, {
        name,
        senderIdId,
        templateId,
        contactGroupId,
        batchSize,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        isRecurring: isRecurring || undefined,
        recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
        recurrenceEndAt: isRecurring && recurrenceEndAt ? new Date(recurrenceEndAt).toISOString() : undefined,
      }),
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.push(`/dashboard/campaigns/${campaign.id}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="max-w-lg">
      <PageHeader title="New campaign" description={environment} />
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!activeSenderIds.some((s) => s.id === senderIdId)) {
              setError(`Select a ${environment.toLowerCase()} sender ID before creating this campaign.`);
              return;
            }
            if (isRecurring && !scheduledAt) {
              setError("A recurring campaign needs a first-run schedule time.");
              return;
            }
            create.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Campaign name" required>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Sender ID" required>
            <Select required value={senderIdId} onChange={(e) => setSenderIdId(e.target.value)}>
              <option value="" disabled>
                Select…
              </option>
              {activeSenderIds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Template" required hint="Campaign content always comes from a template.">
            <Select required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="" disabled>
                Select…
              </option>
              {(templates.data?.templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact group" required>
            <Select required value={contactGroupId} onChange={(e) => setContactGroupId(e.target.value)}>
              <option value="" disabled>
                Select…
              </option>
              {(groups.data?.groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Batch size" hint="Recipients per send batch.">
            <Input type="number" min={1} max={5000} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
          </Field>
          <Field label="Schedule (optional)" hint="Leave blank to send immediately after creating.">
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            Repeat this campaign
          </label>
          {isRecurring && (
            <>
              <Field label="Repeat every" required>
                <Select value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(e.target.value as "DAILY" | "WEEKLY" | "MONTHLY")}>
                  <option value="DAILY">Day</option>
                  <option value="WEEKLY">Week</option>
                  <option value="MONTHLY">Month</option>
                </Select>
              </Field>
              <Field label="Stop repeating after (optional)">
                <Input type="datetime-local" value={recurrenceEndAt} onChange={(e) => setRecurrenceEndAt(e.target.value)} />
              </Field>
            </>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending}>
            Create draft
          </Button>
        </form>
      </Card>
    </div>
  );
}
