// Minor-units formatting mirrors shared/utils/money.ts's convention (1 RWF = 1 minor unit).
const MINOR_UNIT_MULTIPLIER: Record<string, number> = { RWF: 1, USD: 100 };

export function formatMoney(minorUnits: number, currency: string): string {
  const multiplier = MINOR_UNIT_MULTIPLIER[currency] ?? 1;
  const major = minorUnits / multiplier;
  return `${major.toLocaleString("en-RW", { maximumFractionDigits: 2 })} ${currency}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
