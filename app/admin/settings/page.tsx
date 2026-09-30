"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../_lib/api";
import { formatDateTime } from "../../_lib/format";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, SkeletonTable } from "../../_components/ui/Layout";
import { Input } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { useToast } from "../../_components/ui/Toast";
import type { SystemSetting } from "../../_lib/api/types";

function SettingRow({ setting }: { setting: SystemSetting }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.value);

  const update = useMutation({
    mutationFn: () => adminApi.updateSetting(setting.key, value),
    onSuccess: () => {
      toast.push("Setting updated", "success");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (err) => toast.push(errorMessage(err), "danger"),
  });

  return (
    <Card>
      <p className="text-sm font-semibold text-foreground">{setting.key}</p>
      {setting.description && <p className="mt-0.5 text-xs text-foreground-muted">{setting.description}</p>}
      <div className="mt-3 flex items-center gap-2">
        {editing ? (
          <>
            <Input value={value} onChange={(e) => setValue(e.target.value)} className="max-w-xs" />
            <Button size="sm" onClick={() => update.mutate()} loading={update.isPending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setValue(setting.value);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-foreground">{setting.value}</span>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-foreground-muted">Last updated {formatDateTime(setting.updatedAt)}</p>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const query = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi.settings() });

  return (
    <div>
      <PageHeader title="Settings" description="Runtime-editable platform configuration. Falls back to the deployment's env-var default when unset." />
      {query.isLoading && (
        <Card>
          <SkeletonTable rows={2} />
        </Card>
      )}
      {query.isError && <Alert tone="danger">Unable to load settings. {errorMessage(query.error)}</Alert>}
      {query.data && (
        <div className="grid gap-4 sm:grid-cols-2">
          {query.data.settings.map((s) => (
            <SettingRow key={s.key} setting={s} />
          ))}
        </div>
      )}
    </div>
  );
}
