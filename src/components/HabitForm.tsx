"use client";

import { useState } from "react";
import { addDays, formatTR, weekdayTR, type ISODate } from "@/lib/dates";
import type { Habit } from "@/lib/types";

const PRESETS = [
  { emoji: "🐱", name: "Kedi kumu", interval: 3, grace: 1 },
  { emoji: "📖", name: "Kitap okuma", interval: 1, grace: 0 },
  { emoji: "✍️", name: "Haftalık yazı", interval: 7, grace: 1 },
  { emoji: "🪴", name: "Çiçek sulama", interval: 4, grace: 2 },
];

interface Props {
  action: (form: FormData) => void | Promise<void>;
  today: ISODate;
  habit?: Habit;
  submitLabel: string;
}

export function HabitForm({ action, today, habit, submitLabel }: Props) {
  const [name, setName] = useState(habit?.name ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "✅");
  const [interval, setInterval] = useState(habit?.interval_days ?? 3);
  const [grace, setGrace] = useState(habit?.grace_days ?? 1);

  const ideal = addDays(today, interval);
  const deadline = addDays(ideal, grace);

  return (
    <form action={action} className="space-y-5">
      {!habit && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="rounded-full border border-border bg-card px-3 py-1 text-sm hover:border-accent"
              onClick={() => {
                setName(p.name);
                setEmoji(p.emoji);
                setInterval(p.interval);
                setGrace(p.grace);
              }}
            >
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input name="emoji" className="input w-16 text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
        <input name="name" className="input" placeholder="Ne yapacaksın?" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Ne sıklıkla? (gün)</span>
        <input name="interval_days" type="number" min={1} max={365} className="input" value={interval} onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))} />
        <span className="mt-1 block text-xs text-muted">İdeal olarak kaç günde bir yapmalısın.</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Tolerans (gün)</span>
        <input name="grace_days" type="number" min={0} max={60} className="input" value={grace} onChange={(e) => setGrace(Math.max(0, Number(e.target.value) || 0))} />
        <span className="mt-1 block text-xs text-muted">İdeal günden sonra en fazla kaç gün gecikebilirsin.</span>
      </label>

      {!habit && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">En son ne zaman yaptın? (isteğe bağlı)</span>
          <input name="last_done" type="date" className="input" min={addDays(today, -14)} max={today} />
          <span className="mt-1 block text-xs text-muted">Boş bırakırsan bugünden itibaren yapılması gerekir.</span>
        </label>
      )}

      <div className="rounded-xl bg-card p-4 text-sm ring-1 ring-border">
        <p>
          <b>{weekdayTR(today)}</b> yaparsan →
        </p>
        <p className="mt-1">
          <span className="text-warn">●</span> İdeal: <b>{formatTR(ideal)}</b>
        </p>
        {grace > 0 && (
          <p>
            <span className="text-bad">●</span> Son gün: <b>{formatTR(deadline)}</b>
          </p>
        )}
      </div>

      <button type="submit" className="btn-primary w-full">
        {submitLabel}
      </button>
    </form>
  );
}
