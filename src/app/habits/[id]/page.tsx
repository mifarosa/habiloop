import { notFound } from "next/navigation";
import { archiveHabit, updateHabit } from "@/app/actions";
import { DoneButton } from "@/components/DoneButton";
import { HabitForm } from "@/components/HabitForm";
import { HistoryList } from "@/components/HistoryList";
import { StateBadge } from "@/components/StateBadge";
import { SuggestionCard } from "@/components/SuggestionCard";
import { WindowSummary } from "@/components/WindowSummary";
import { getHabitDetail, ruleOf } from "@/lib/data";
import { onTimeRate } from "@/lib/stats";
import { suggestInterval } from "@/lib/suggest";

export default async function HabitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getHabitDetail(id);
  if (!detail) notFound();

  const { habit, completions, dates, today, window } = detail;
  const stats = onTimeRate(ruleOf(habit), dates);
  const suggested = suggestInterval(dates, habit.interval_days);
  const showSuggestion = suggested !== null && suggested !== habit.dismissed_suggestion;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            {habit.emoji} {habit.name}
          </h1>
          <StateBadge window={window} />
        </div>
        <WindowSummary window={window} today={today} />
        <DoneButton habitId={habit.id} today={today} doneToday={dates.includes(today)} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Zamanında yapma</p>
          <p className="text-2xl font-semibold">{stats.rate === null ? "—" : `%${Math.round(stats.rate * 100)}`}</p>
          <p className="text-xs text-muted">
            {stats.onTime}/{stats.total} döngü
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Kural</p>
          <p className="text-2xl font-semibold">{habit.interval_days} gün</p>
          <p className="text-xs text-muted">+{habit.grace_days} gün tolerans</p>
        </div>
      </section>

      {showSuggestion && <SuggestionCard habitId={habit.id} current={habit.interval_days} suggested={suggested} />}

      <section>
        <h2 className="mb-2 font-semibold">Geçmiş</h2>
        <HistoryList habitId={habit.id} completions={completions} />
      </section>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Düzenle</summary>
        <div className="mt-4">
          <HabitForm action={updateHabit.bind(null, habit.id)} today={today} habit={habit} submitLabel="Kaydet" />
          <form action={archiveHabit.bind(null, habit.id)} className="mt-3">
            <button className="btn-ghost w-full text-bad">Arşivle</button>
          </form>
        </div>
      </details>
    </div>
  );
}
