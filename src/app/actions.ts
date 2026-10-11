"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordCompletion } from "@/lib/complete";
import { requireUser } from "@/lib/data";

function intField(form: FormData, name: string, min: number, max: number): number {
  const n = Number(form.get(name));
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Geçersiz değer: ${name}`);
  return n;
}

function habitFields(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 80) throw new Error("İsim gerekli");
  return {
    name,
    emoji: String(form.get("emoji") ?? "").trim() || "✅",
    interval_days: intField(form, "interval_days", 1, 365),
    grace_days: intField(form, "grace_days", 0, 60),
  };
}

export async function createHabit(form: FormData) {
  const { supabase, user } = await requireUser();
  const { data: habit, error } = await supabase.from("habits").insert(habitFields(form)).select("id").single();
  if (error) throw new Error(error.message);

  // Optional "I already did it on…" date when creating the habit.
  const lastDone = String(form.get("last_done") ?? "");
  if (lastDone) await recordCompletion(supabase, user.id, habit.id, lastDone);

  revalidatePath("/");
  redirect("/");
}

export async function updateHabit(id: string, form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("habits")
    .update({ ...habitFields(form), dismissed_suggestion: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/habits/${id}`);
}

export async function archiveHabit(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("habits").update({ archived: true }).eq("id", id);
  revalidatePath("/");
  redirect("/");
}

export async function markDone(habitId: string, doneOn?: string) {
  const { supabase, user } = await requireUser();
  await recordCompletion(supabase, user.id, habitId, doneOn);
  revalidatePath("/");
  revalidatePath(`/habits/${habitId}`);
}

export async function deleteCompletion(habitId: string, completionId: string) {
  const { supabase } = await requireUser();
  await supabase.from("completions").delete().eq("id", completionId);
  revalidatePath("/");
  revalidatePath(`/habits/${habitId}`);
}

export async function applySuggestion(habitId: string, interval: number) {
  const { supabase } = await requireUser();
  await supabase.from("habits").update({ interval_days: interval, dismissed_suggestion: null }).eq("id", habitId);
  revalidatePath("/");
  revalidatePath(`/habits/${habitId}`);
}

export async function dismissSuggestion(habitId: string, interval: number) {
  const { supabase } = await requireUser();
  await supabase.from("habits").update({ dismissed_suggestion: interval }).eq("id", habitId);
  revalidatePath(`/habits/${habitId}`);
}

export async function saveSettings(form: FormData) {
  const { supabase, user } = await requireUser();
  const timezone = String(form.get("timezone") ?? "");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("Geçersiz saat dilimi");
  }
  await supabase
    .from("profiles")
    .upsert({ id: user.id, timezone, reminder_hour: intField(form, "reminder_hour", 0, 23) });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}
