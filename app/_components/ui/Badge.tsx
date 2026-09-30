import clsx from "clsx";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-background text-foreground-muted border-border",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  success: "bg-success-bg text-success border-success/20",
  warning: "bg-warning-bg text-warning border-warning/20",
  danger: "bg-danger-bg text-danger border-danger/20",
  info: "bg-info-bg text-info border-info/20",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}

/**
 * Every status vocabulary in the schema, mapped to a tone + a short label —
 * so status is never communicated by color alone (the label text always
 * says it too). Unknown values fall back to a neutral badge with the raw
 * string rather than crashing.
 */
const STATUS_TONES: Record<string, Tone> = {
  // messages / recipients
  QUEUED: "neutral",
  SCHEDULED: "info",
  PROCESSING: "info",
  SENT: "info",
  DELIVERED: "success",
  PARTIALLY_DELIVERED: "warning",
  FAILED: "danger",
  EXPIRED: "danger",
  REJECTED: "danger",
  CANCELLED: "neutral",
  UNDELIVERED: "danger",
  // organizations / sender id requests
  PENDING: "neutral",
  UNDER_REVIEW: "info",
  DOCUMENTS_REQUIRED: "warning",
  SUBMITTED: "info",
  RURA_SUBMITTED: "info",
  RURA_INFORMATION_REQUESTED: "warning",
  RURA_APPROVED: "info",
  RURA_REJECTED: "danger",
  MNO_WHITELISTING: "info",
  APPROVED: "success",
  VERIFIED: "success",
  ACTIVE: "success",
  SUSPENDED: "warning",
  DRAFT: "neutral",
  // documents
  // payments
  SUCCEEDED: "success",
  TIMEOUT: "danger",
  INSUFFICIENT_FUNDS: "danger",
  PROVIDER_UNAVAILABLE: "danger",
  // webhooks
  EXHAUSTED: "danger",
  // fraud / api keys
  OPEN: "warning",
  REVIEWING: "info",
  RESOLVED: "success",
  DISMISSED: "neutral",
  REVOKED: "neutral",
  // campaigns
  SENDING: "info",
  COMPLETED: "success",
  // users
  DISABLED: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return <Badge tone={tone}>{status.replaceAll("_", " ")}</Badge>;
}
