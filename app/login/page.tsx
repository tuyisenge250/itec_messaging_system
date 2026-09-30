"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../_lib/api";
import { errorMessage } from "../_lib/api-client";
import { Button } from "../_components/ui/Button";
import { Field, Input } from "../_components/ui/Form";
import { Alert } from "../_components/ui/Alert";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.login(email, password);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const me = await authApi.me();
      router.push(me.isPlatformAdmin ? "/admin" : "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">SMS Gateway</h1>
          <p className="mt-1 text-sm text-foreground-muted">Sign in to your account</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
          <Field label="Email" required>
            <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" required>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full">
            Log in
          </Button>
        </form>
        <p className="text-center text-sm text-foreground-muted">
          No account?{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
