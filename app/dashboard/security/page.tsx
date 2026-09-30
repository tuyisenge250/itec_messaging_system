"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card } from "../../_components/ui/Layout";
import { Field, Input } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { useToast } from "../../_components/ui/Toast";

export default function SecuritySettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toast.push("Password changed. Other devices have been signed out.", "success");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="max-w-md">
      <PageHeader title="Security Settings" />
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Change password</h2>
        <p className="text-xs text-foreground-muted">
          Current authentication: email + password + secure session. Email verification and MFA are not enabled at this stage.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            change.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Current password" required>
            <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label="New password" required hint="At least 10 characters, one letter, one number.">
            <Input type="password" required minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
