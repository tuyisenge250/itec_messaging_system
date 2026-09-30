import clsx from "clsx";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("rounded-lg border border-border bg-surface p-4 shadow-sm", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "brand" | "success" | "danger";
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p
        className={clsx(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          tone === "brand" && "text-brand-600",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-foreground-muted">{hint}</p>}
    </Card>
  );
}

export interface StatRow {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning";
}

/**
 * A single bordered panel of compact label/value pairs — for a dashboard's
 * "today at a glance" summary, denser than a row of separate StatCards.
 * Wrap in a <Card> and give it its own heading at the call site.
 */
export function StatGrid({ rows }: { rows: StatRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label}>
          <p className="text-xs text-foreground-muted">{row.label}</p>
          <p
            className={clsx(
              "mt-0.5 text-lg font-semibold",
              row.tone === "success" && "text-success",
              row.tone === "danger" && "text-danger",
              row.tone === "warning" && "text-warning",
              (!row.tone || row.tone === "default") && "text-foreground",
            )}
          >
            {row.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-foreground-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-border", className)} />;
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
