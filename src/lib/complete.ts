import { addDays, todayIn, type ISODate } from "./dates";
import type { createClient } from "./supabase/server";

export const BACKDATE_LIMIT_DAYS = 14;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Records a completion, rejecting future dates and dates beyond the backdate limit. */
export async function recordCompletion(supabase: Supabase, userId: string, habitId: string, doneOn?: ISODate) {
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const today = todayIn(profile?.timezone ?? "Europe/Istanbul");
  const date = doneOn ?? today;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < addDays(today, -BACKDATE_LIMIT_DAYS)) {
    throw new Error("Geçersiz tarih");
  }

  const { error } = await supabase
    .from("completions")
    .upsert({ habit_id: habitId, done_on: date }, { onConflict: "habit_id,done_on", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
