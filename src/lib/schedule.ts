import { addDays, diffDays, type ISODate } from "./dates";

export type WindowState = "green" | "yellow" | "red" | "overdue";

export interface HabitRule {
  /** Ideal gap in days between two completions. */
  intervalDays: number;
  /** Extra tolerated days after the ideal day. */
  graceDays: number;
  /** Cycle anchor when there are no completions yet. */
  startDate: ISODate;
}

export interface HabitWindow {
  anchor: ISODate;
  ideal: ISODate;
  deadline: ISODate;
  state: WindowState;
  /** Days until the deadline; negative when overdue. */
  daysLeft: number;
}

/** Most recent completion date, or null. */
export function lastCompletion(dates: ISODate[]): ISODate | null {
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

/**
 * Computes the current window for a habit.
 *
 * Example (interval 3, grace 1): done Wednesday → Saturday is the ideal day,
 * Sunday is the last day, Monday is overdue.
 */
export function computeWindow(rule: HabitRule, completions: ISODate[], today: ISODate): HabitWindow {
  const last = lastCompletion(completions);
  const anchor = last ?? rule.startDate;
  // A fresh habit is due right away on its start date rather than one interval later.
  const ideal = last ? addDays(anchor, rule.intervalDays) : anchor;
  const deadline = addDays(ideal, rule.graceDays);
  const daysLeft = diffDays(today, deadline);

  let state: WindowState;
  if (today < ideal) state = "green";
  else if (today < deadline) state = "yellow";
  else if (today === deadline) state = "red";
  else state = "overdue";

  return { anchor, ideal, deadline, state, daysLeft };
}

const URGENCY: Record<WindowState, number> = { overdue: 0, red: 1, yellow: 2, green: 3 };

/** Sort comparator: most urgent first, then closest deadline. */
export function compareUrgency(a: HabitWindow, b: HabitWindow): number {
  return URGENCY[a.state] - URGENCY[b.state] || a.daysLeft - b.daysLeft;
}
