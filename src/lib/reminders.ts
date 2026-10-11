import type { HabitWindow } from "./schedule";

export interface ReminderPayload {
  title: string;
  body: string;
  habitId: string;
  /** Deduplication key: one reminder per habit, kind and day. */
  kind: HabitWindow["state"];
}

/** Builds the reminder for a habit window, or null when nothing is due. */
export function reminderFor(
  habit: { id: string; name: string; emoji: string },
  window: HabitWindow,
): ReminderPayload | null {
  const title = `${habit.emoji} ${habit.name}`;
  switch (window.state) {
    case "green":
      return null;
    case "yellow":
      return {
        title,
        body: window.daysLeft === 1 ? "Bugün ideal gün. Son gün yarın." : `Zamanı geldi. Son güne ${window.daysLeft} gün var.`,
        habitId: habit.id,
        kind: "yellow",
      };
    case "red":
      return { title, body: "⚠️ Bugün son gün!", habitId: habit.id, kind: "red" };
    case "overdue":
      return { title, body: `${-window.daysLeft} gün gecikti.`, habitId: habit.id, kind: "overdue" };
  }
}
