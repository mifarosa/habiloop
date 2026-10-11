import { NextResponse, type NextRequest } from "next/server";
import { hourIn, todayIn, type ISODate } from "@/lib/dates";
import { ruleOf } from "@/lib/data";
import { sendPush, type StoredSubscription } from "@/lib/push";
import { reminderFor } from "@/lib/reminders";
import { computeWindow } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/server";
import type { Habit, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

// Called hourly by Supabase pg_cron. Sends reminders to users whose local hour matches reminder_hour.
export async function POST(request: NextRequest) {
  if (request.headers.get("x-cron-secret") !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const now = new Date();

  const { data: profiles, error } = await db.from("profiles").select("id, timezone, reminder_hour");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (profiles as Profile[]).filter((p) => hourIn(p.timezone, now) === p.reminder_hour);
  let sent = 0;

  for (const profile of due) {
    const today = todayIn(profile.timezone, now);

    const [{ data: habits }, { data: subs }] = await Promise.all([
      db.from("habits").select("*").eq("user_id", profile.id).eq("archived", false),
      db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", profile.id),
    ]);
    if (!habits?.length || !subs?.length) continue;

    const { data: completions } = await db
      .from("completions")
      .select("habit_id, done_on")
      .in(
        "habit_id",
        habits.map((h) => h.id),
      );

    for (const habit of habits as Habit[]) {
      const dates = (completions ?? []).filter((c) => c.habit_id === habit.id).map((c) => c.done_on as ISODate);
      const reminder = reminderFor(habit, computeWindow(ruleOf(habit), dates, today));
      if (!reminder) continue;

      // The primary key makes this insert fail if the reminder was already sent today.
      const { error: logError } = await db
        .from("notification_log")
        .insert({ habit_id: habit.id, kind: reminder.kind, sent_on: today });
      if (logError) continue;

      for (const sub of subs as StoredSubscription[]) {
        const alive = await sendPush(sub, reminder);
        if (alive) sent++;
        else await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }

  return NextResponse.json({ users: due.length, sent });
}
