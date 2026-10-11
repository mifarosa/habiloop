import { addDays, diffDays, type ISODate } from "./dates";
import type { HabitRule } from "./schedule";

export interface OnTimeStats {
  onTime: number;
  total: number;
  /** 0..1, or null when there are no finished cycles yet. */
  rate: number | null;
}

/**
 * A cycle is each gap between consecutive completions (the first gap starts at startDate).
 * It counts as on time when the next completion falls on or before that cycle's deadline.
 */
export function onTimeRate(rule: HabitRule, completions: ISODate[]): OnTimeStats {
  const sorted = [...new Set(completions)].sort();
  let onTime = 0;
  let total = 0;
  let prev: ISODate | null = null;

  for (const done of sorted) {
    const ideal = prev ? addDays(prev, rule.intervalDays) : rule.startDate;
    const deadline = addDays(ideal, rule.graceDays);
    total++;
    if (diffDays(done, deadline) >= 0) onTime++;
    prev = done;
  }

  return { onTime, total, rate: total === 0 ? null : onTime / total };
}
