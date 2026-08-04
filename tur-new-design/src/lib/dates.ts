import { addDays, format } from "date-fns";

export function toISO(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function nextDays(count: number, from = new Date()) {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

export function prettyDate(iso: string) {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return format(new Date(y, m - 1, d), "EEE, d MMM yyyy");
}

export function todayISO() {
  return toISO(new Date());
}
