import { diffDays, type ISODate } from "./dates";

export const MIN_COMPLETIONS = 5;
const WINDOW = 10;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Suggests a new interval when the user's real rhythm differs noticeably from the configured one.
 * Uses the median gap of the most recent completions; returns null when no change is warranted.
 */
export function suggestInterval(completions: ISODate[], currentInterval: number): number | null {
  const sorted = [...new Set(completions)].sort().slice(-WINDOW);
  if (sorted.length < MIN_COMPLETIONS) return null;

  const gaps = sorted.slice(1).map((d, i) => diffDays(sorted[i], d));
  const suggested = Math.max(1, Math.round(median(gaps)));
  const delta = Math.abs(suggested - currentInterval);

  if (delta < 1 || delta / currentInterval < 0.25) return null;
  return suggested;
}
