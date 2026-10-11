"use client";

import { useState, useTransition } from "react";
import { markDone } from "@/app/actions";
import { addDays, type ISODate } from "@/lib/dates";

const BACKDATE_LIMIT_DAYS = 14;

/** "Yaptım" button with an optional date picker for logging a past completion. */
export function DoneButton({ habitId, today, doneToday }: { habitId: string; today: ISODate; doneToday: boolean }) {
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(addDays(today, -1));

  const submit = (doneOn?: ISODate) =>
    start(async () => {
      await markDone(habitId, doneOn);
      setPicking(false);
    });

  if (picking) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          className="input w-auto"
          value={date}
          min={addDays(today, -BACKDATE_LIMIT_DAYS)}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="btn-primary" disabled={pending || !date} onClick={() => submit(date)}>
          Kaydet
        </button>
        <button className="btn-ghost" onClick={() => setPicking(false)}>
          Vazgeç
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button className="btn-primary" disabled={pending || doneToday} onClick={() => submit()}>
        {doneToday ? "Bugün yapıldı ✓" : pending ? "…" : "Yaptım"}
      </button>
      <button className="text-sm text-muted underline-offset-2 hover:underline" onClick={() => setPicking(true)}>
        Başka gün yaptım
      </button>
    </div>
  );
}
