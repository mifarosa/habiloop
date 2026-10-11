// Calendar dates are handled as ISO "YYYY-MM-DD" strings to avoid timezone drift.
// All arithmetic is done in UTC, where a day is always exactly 24 hours.

export type ISODate = string;

const DAY_MS = 86_400_000;

function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Number of days from `a` to `b` (positive when b is after a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current hour (0-23) in the given IANA timezone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

const WEEKDAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function weekdayTR(date: ISODate): string {
  return WEEKDAYS_TR[new Date(toUTC(date)).getUTCDay()];
}

export function formatTR(date: ISODate): string {
  const d = new Date(toUTC(date));
  return `${d.getUTCDate()} ${MONTHS_TR[d.getUTCMonth()]} ${weekdayTR(date)}`;
}

/** Human-friendly relative label: "bugün", "yarın", "dün", "3 gün sonra", "2 gün önce". */
export function relativeTR(date: ISODate, today: ISODate): string {
  const n = diffDays(today, date);
  if (n === 0) return "bugün";
  if (n === 1) return "yarın";
  if (n === -1) return "dün";
  return n > 0 ? `${n} gün sonra` : `${-n} gün önce`;
}
