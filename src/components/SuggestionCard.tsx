"use client";

import { useTransition } from "react";
import { applySuggestion, dismissSuggestion } from "@/app/actions";

export function SuggestionCard({ habitId, current, suggested }: { habitId: string; current: number; suggested: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="rounded-xl border border-accent/40 bg-card p-4">
      <p className="mb-3 text-sm">
        💡 Genelde <b>{suggested} günde bir</b> yapıyorsun, ama aralık <b>{current} gün</b>. Aralığı {suggested} gün yapalım mı?
      </p>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => start(() => applySuggestion(habitId, suggested))}>
          Evet, {suggested} gün yap
        </button>
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => dismissSuggestion(habitId, suggested))}>
          Böyle kalsın
        </button>
      </div>
    </div>
  );
}
