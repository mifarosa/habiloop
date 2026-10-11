import { saveSettings, signOut } from "@/app/actions";
import { PushToggle } from "@/components/PushToggle";
import { getProfile } from "@/lib/data";

const TIMEZONES = Intl.supportedValuesOf("timeZone");

export default async function SettingsPage() {
  const profile = await getProfile();
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Ayarlar</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Bildirimler</h2>
        <PushToggle />
      </section>

      <form action={saveSettings} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Hatırlatma saati</span>
          <select name="reminder_hour" defaultValue={profile.reminder_hour} className="input">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Saat dilimi</span>
          <select name="timezone" defaultValue={profile.timezone} className="input">
            {TIMEZONES.map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary">Kaydet</button>
      </form>

      <form action={signOut}>
        <button className="btn-ghost w-full">Çıkış yap</button>
      </form>
    </div>
  );
}
