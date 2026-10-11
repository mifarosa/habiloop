"use client";

import { useTransition } from "react";
import { deleteCompletion } from "@/app/actions";
import { formatTR } from "@/lib/dates";
import type { Completion } from "@/lib/types";

export function HistoryList({ habitId, completions }: { habitId: string; completions: Completion[] }) {
  const [pending, start] = useTransition();
  if (completions.length === 0) return <p className="text-sm text-muted">Henüz kayıt yok.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {completions.map((c) => (
        <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span>{formatTR(c.done_on)}</span>
          <button
            className="text-muted hover:text-bad"
            disabled={pending}
            onClick={() => start(() => deleteCompletion(habitId, c.id))}
            aria-label="Kaydı sil"
          >
            Sil
          </button>
        </li>
      ))}
    </ul>
  );
}
