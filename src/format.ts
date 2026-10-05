import type { Lang } from "../shared/contract";

export function formatLocalTime(iso: string, lang: Lang): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const locale = lang === "te" ? "te-IN" : lang === "hi" ? "hi-IN" : "en-IN";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(time);
}

export function minutesUntil(iso: string, nowMs: number): number | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((time - nowMs) / 60000));
}

export function isObservationStale(observedAt: string, staleAfterSeconds: number, nowMs: number, forced = false): boolean {
  if (forced) return true;
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return true;
  return nowMs - observed > staleAfterSeconds * 1000;
}
