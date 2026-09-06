// Pure formatting helpers — no UI, no dependencies. Split out of App.jsx so
// they're testable on their own and reusable from any component or lib.

// Calculator inputs are `string | number` in practice: DEFAULTS holds plain
// numbers, but every <input onChange> hands back a string.
export function num(v: string | number | undefined | null): number {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function trimNum(n: number): number {
  return Number.isInteger(n) ? n : Math.round(n * 10) / 10;
}

export const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money2 = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export const moneySigned = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));

export function formatExp(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "[expiration]";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}
