import Link from "next/link";
import type { ISODate } from "@/lib/dates";
import type { HabitView } from "@/lib/data";
import { DoneButton } from "./DoneButton";
import { STATE_STYLE, StateBadge } from "./StateBadge";
import { WindowSummary } from "./WindowSummary";

export function HabitCard({ item, today }: { item: HabitView; today: ISODate }) {
  const { habit, window, dates } = item;
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-card p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${STATE_STYLE[window.state].bar}`} aria-hidden />
      <div className="mb-1 flex items-start justify-between gap-2">
        <Link href={`/habits/${habit.id}`} className="text-lg font-semibold hover:underline">
          {habit.emoji} {habit.name}
        </Link>
        <StateBadge window={window} />
      </div>
      <WindowSummary window={window} today={today} />
      <div className="mt-3">
        <DoneButton habitId={habit.id} today={today} doneToday={dates.includes(today)} />
      </div>
    </article>
  );
}
