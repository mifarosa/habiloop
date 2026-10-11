import type { HabitWindow, WindowState } from "@/lib/schedule";

export const STATE_STYLE: Record<WindowState, { label: string; className: string; bar: string }> = {
  green: { label: "Rahat", className: "bg-ok-bg text-ok", bar: "bg-ok" },
  yellow: { label: "Zamanı geldi", className: "bg-warn-bg text-warn", bar: "bg-warn" },
  red: { label: "Son gün", className: "bg-bad-bg text-bad", bar: "bg-bad" },
  overdue: { label: "Gecikti", className: "bg-bad text-white", bar: "bg-bad" },
};

export function StateBadge({ window }: { window: HabitWindow }) {
  const style = STATE_STYLE[window.state];
  const label = window.state === "overdue" ? `${-window.daysLeft} gün gecikti` : style.label;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.className}`}>{label}</span>;
}
