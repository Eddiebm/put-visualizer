// Date helpers — no UI, no dependencies.

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Nearest Friday at least 7 days out — a sensible default option expiration.
export function defaultExpiration() {
  const d = new Date();
  // Days until the next Friday, in 1..7 (7 when today itself is Friday).
  const toFri = ((5 - d.getDay() + 7) % 7) || 7;
  // If that Friday is under 7 days out, skip to the one after — otherwise
  // adding a flat 7 (the old bug) can overshoot past Friday entirely.
  const add = toFri < 7 ? toFri + 7 : toFri;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

// Nearest Friday at least `targetDays` out — for daily picks (~30 DTE sweet spot).
export function targetExpiration(targetDays = 30) {
  const d = new Date();
  d.setDate(d.getDate() + targetDays);
  const toFri = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + toFri);
  return d.toISOString().slice(0, 10);
}

export function computeDte(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 30;
  return Math.max(1, Math.round((new Date(iso + "T12:00:00Z") - Date.now()) / 86400000));
}

// Signed days until an ISO date — negative means it's already past. Unlike
// computeDte, this does NOT floor at 1, so callers can tell "due today or
// already past" apart from "due later."
export function entryDaysTo(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  return Math.round((new Date(iso + "T12:00:00Z") - Date.now()) / 86400000);
}

// Monday (UTC) of the ISO week containing dateStr, as an ISO date string.
export function weekStartIso(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const diffToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

// Human label for the Mon–Sun week starting at mondayIso, e.g. "Jun 22–28, 2026".
export function weekLabel(mondayIso) {
  const start = new Date(mondayIso + "T12:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)}–${fmt(end)}, ${start.getUTCFullYear()}`;
}
