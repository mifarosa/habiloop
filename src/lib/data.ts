import { redirect } from "next/navigation";
import { todayIn, type ISODate } from "./dates";
import { compareUrgency, computeWindow, type HabitRule, type HabitWindow } from "./schedule";
import { createClient } from "./supabase/server";
import type { Completion, Habit, Profile } from "./types";

export function ruleOf(habit: Habit): HabitRule {
  return { intervalDays: habit.interval_days, graceDays: habit.grace_days, startDate: habit.start_date };
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getProfile(): Promise<Profile> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data ?? { id: user.id, timezone: "Europe/Istanbul", reminder_hour: 9 };
}

export interface HabitView {
  habit: Habit;
  dates: ISODate[];
  window: HabitWindow;
}

export async function getDashboard(): Promise<{ today: ISODate; items: HabitView[] }> {
  const { supabase } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile.timezone);

  const [{ data: habits }, { data: completions }] = await Promise.all([
    supabase.from("habits").select("*").eq("archived", false).order("created_at"),
    supabase.from("completions").select("id, habit_id, done_on"),
  ]);

  const byHabit = new Map<string, ISODate[]>();
  for (const c of (completions ?? []) as Completion[]) {
    byHabit.set(c.habit_id, [...(byHabit.get(c.habit_id) ?? []), c.done_on]);
  }

  const items = ((habits ?? []) as Habit[])
    .map((habit) => {
      const dates = byHabit.get(habit.id) ?? [];
      return { habit, dates, window: computeWindow(ruleOf(habit), dates, today) };
    })
    .sort((a, b) => compareUrgency(a.window, b.window));

  return { today, items };
}

export async function getHabitDetail(id: string) {
  const { supabase } = await requireUser();
  const profile = await getProfile();
  const today = todayIn(profile.timezone);

  const { data: habit } = await supabase.from("habits").select("*").eq("id", id).maybeSingle();
  if (!habit) return null;
  const { data: completions } = await supabase
    .from("completions")
    .select("id, habit_id, done_on")
    .eq("habit_id", id)
    .order("done_on", { ascending: false });

  const list = (completions ?? []) as Completion[];
  const dates = list.map((c) => c.done_on);
  return { habit: habit as Habit, completions: list, dates, today, window: computeWindow(ruleOf(habit), dates, today) };
}
