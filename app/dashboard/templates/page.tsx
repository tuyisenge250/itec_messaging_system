"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { templatesApi } from "../../_lib/api";
import { errorMessage } from "../../_lib/api-client";
import { PageHeader, Card, EmptyState, SkeletonTable } from "../../_components/ui/Layout";
import { Field, Input, Textarea } from "../../_components/ui/Form";
import { Button } from "../../_components/ui/Button";
import { Alert } from "../../_components/ui/Alert";
import { Badge } from "../../_components/ui/Badge";
import { Dialog } from "../../_components/ui/Dialog";

function extractVariables(content: string): string[] {
  return Array.from(new Set(Array.from(content.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1])));
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const templates = useQuery({ queryKey: ["templates"], queryFn: () => templatesApi.list() });

  const create = useMutation({
    mutationFn: () => templatesApi.create({ name, content, category: category || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setOpen(false);
      setName("");
      setContent("");
      setCategory("");
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => templatesApi.update(id, { isActive: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  return (
    <div>
      <PageHeader title="Templates" actions={<Button onClick={() => setOpen(true)}>New template</Button>} />

      {templates.isLoading && (
        <Card>
          <SkeletonTable rows={3} cols={2} />
        </Card>
      )}
      {templates.isError && <Alert tone="danger">Unable to load templates. {errorMessage(templates.error)}</Alert>}
      {templates.data && templates.data.templates.length === 0 && <EmptyState title="No templates yet" description="Templates keep campaign content reusable and consistent." />}

      <div className="grid gap-4 sm:grid-cols-2">
        {templates.data?.templates.map((t) => (
          <Card key={t.id} className={!t.isActive ? "opacity-60" : undefined}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{t.name}</p>
              {t.category && <Badge tone="brand">{t.category}</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground-muted">{t.content}</p>
            {t.variables.length > 0 && (
              <p className="mt-2 text-xs text-foreground-muted">
                Variables: {t.variables.map((v) => `{{${v}}}`).join(", ")}
              </p>
            )}
            {t.isActive && (
              <button onClick={() => deactivate.mutate(t.id)} className="mt-2 text-xs text-danger hover:underline">
                Deactivate
              </button>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="New template">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <Field label="Name" required>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Content" required hint="Use {{variableName}} for placeholders.">
            <Textarea required rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          {content && extractVariables(content).length > 0 && (
            <p className="text-xs text-foreground-muted">Detected variables: {extractVariables(content).join(", ")}</p>
          )}
          <Field label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="otp, transactional, marketing…" />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={create.isPending} className="w-full">
            Create template
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
