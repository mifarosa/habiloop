import { createHabit } from "@/app/actions";
import { HabitForm } from "@/components/HabitForm";
import { todayIn } from "@/lib/dates";
import { getProfile } from "@/lib/data";

export default async function NewHabitPage() {
  const profile = await getProfile();
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Yeni alışkanlık</h1>
      <HabitForm action={createHabit} today={todayIn(profile.timezone)} submitLabel="Oluştur" />
    </>
  );
}
