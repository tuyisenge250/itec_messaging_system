import clsx from "clsx";
import { Button } from "./Button";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-max text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-border bg-background text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">{children}</thead>;
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx("px-3 py-2.5 font-medium", className)}>{children}</th>;
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr className={clsx(onClick && "cursor-pointer hover:bg-background", className)} onClick={onClick}>
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={clsx("px-3 py-2.5 align-middle text-foreground", className)}>{children}</td>;
}

export function Pagination({
  hasMore,
  onNext,
  onPrev,
  canGoBack,
  loading,
}: {
  hasMore: boolean;
  onNext: () => void;
  onPrev?: () => void;
  canGoBack?: boolean;
  loading?: boolean;
}) {
  if (!hasMore && !canGoBack) return null;
  return (
    <div className="flex items-center justify-end gap-2 py-3">
      {onPrev && (
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!canGoBack || loading}>
          Previous
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore || loading}>
        Next
      </Button>
    </div>
  );
}
