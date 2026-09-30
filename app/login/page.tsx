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

// Next.js always statically inlines NODE_ENV client-side (unlike other env
// vars, which need NEXT_PUBLIC_ to reach the browser) — this is the standard
// way to gate dev-only UI, no new env var needed. Guards against these seeded
// demo credentials ever showing up on a real production deployment.
const DEMO_ACCOUNTS_VISIBLE = process.env.NODE_ENV !== "production";

const DEMO_ACCOUNTS = [
  { label: "Platform Admin", email: "admin@smsgateway.dev" },
  { label: "Business Owner", email: "owner@acmeltd.dev" },
  { label: "Developer", email: "dev@acmeltd.dev" },
] as const;
const DEMO_PASSWORD = "DevPassword123!";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setLoading(true);
    try {
      await authApi.login(loginEmail, loginPassword);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const me = await authApi.me();
      router.push(me.isPlatformAdmin ? "/admin" : "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  function loginAsDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void doLogin(demoEmail, DEMO_PASSWORD);
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

        {DEMO_ACCOUNTS_VISIBLE && (
          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Demo accounts</p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => loginAsDemoAccount(account.email)}
                  disabled={loading}
                  className="flex w-full items-center justify-between rounded-md border border-border px-3 py-1.5 text-left text-xs hover:bg-background disabled:opacity-50"
                >
                  <span className="font-medium text-foreground">{account.label}</span>
                  <span className="text-foreground-muted">{account.email}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-foreground-muted">Password for all: {DEMO_PASSWORD}</p>
          </div>
        )}
      </div>
    </div>
  );
}
