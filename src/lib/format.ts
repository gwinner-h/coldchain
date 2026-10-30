const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function money(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : usd.format(n);
}

/** $4.8M, $920K: for board cards and KPI figures. */
export function moneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return usd.format(n);
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

export function date(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}

export function dateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "—";
}

/** yyyy-mm-dd for <input type="date">. */
export function dateInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
