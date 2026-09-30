import clsx from "clsx";

type Tone = "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  info: "bg-info-bg text-info border-info/20",
  success: "bg-success-bg text-success border-success/20",
  warning: "bg-warning-bg text-warning border-warning/20",
  danger: "bg-danger-bg text-danger border-danger/20",
};

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <div className={clsx("rounded-md border px-3 py-2.5 text-sm", TONE_CLASSES[tone])} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-medium">{title}</p>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}
