/**
 * All money is stored as integers in "minor units" — never as floating point
 * (see docs/architecture.md "Money representation"). RWF has no subunit in
 * everyday use, so for RWF 1 minor unit == 1 RWF (multiplier 1). The
 * multiplier table exists so a future currency with real subunits (e.g. USD
 * cents) doesn't require touching every call site.
 */
const MINOR_UNIT_MULTIPLIER: Record<string, number> = {
  RWF: 1,
  USD: 100,
};

export function toMinorUnits(amount: number, currency: string): number {
  const multiplier = MINOR_UNIT_MULTIPLIER[currency] ?? 1;
  return Math.round(amount * multiplier);
}

export function fromMinorUnits(minorUnits: number, currency: string): number {
  const multiplier = MINOR_UNIT_MULTIPLIER[currency] ?? 1;
  return minorUnits / multiplier;
}

export function formatMoney(minorUnits: number, currency: string): string {
  const major = fromMinorUnits(minorUnits, currency);
  return `${major.toLocaleString("en-RW", { maximumFractionDigits: 2 })} ${currency}`;
}
