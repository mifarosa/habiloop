import { relativeTR, weekdayTR, type ISODate } from "@/lib/dates";
import type { HabitWindow } from "@/lib/schedule";

export function WindowSummary({ window, today }: { window: HabitWindow; today: ISODate }) {
  if (window.ideal === window.deadline) {
    return (
      <p className="text-sm text-muted">
        Son gün: <b className="text-text">{weekdayTR(window.deadline)}</b> ({relativeTR(window.deadline, today)})
      </p>
    );
  }
  return (
    <p className="text-sm text-muted">
      İdeal: <b className="text-text">{weekdayTR(window.ideal)}</b> ({relativeTR(window.ideal, today)}) · Son gün:{" "}
      <b className="text-text">{weekdayTR(window.deadline)}</b> ({relativeTR(window.deadline, today)})
    </p>
  );
}
