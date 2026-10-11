import Link from "next/link";
import { HabitCard } from "@/components/HabitCard";
import { getDashboard } from "@/lib/data";

export default async function Home() {
  const { today, items } = await getDashboard();

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="mb-1 text-lg font-semibold">Henüz alışkanlık yok</p>
          <p className="mb-4 text-sm text-muted">
            Örneğin: kedi kumu her 3 günde bir, 1 gün tolerans. Çarşamba temizlersen Cumartesi ideal, Pazar son gün.
          </p>
          <Link href="/habits/new" className="btn-primary">
            İlk alışkanlığını ekle
          </Link>
        </div>
      ) : (
        <>
          {items.map((item) => (
            <HabitCard key={item.habit.id} item={item} today={today} />
          ))}
          <Link href="/habits/new" className="btn-ghost w-full">
            + Yeni alışkanlık
          </Link>
        </>
      )}
    </div>
  );
}
