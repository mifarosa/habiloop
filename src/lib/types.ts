import type { ISODate } from "./dates";

export interface Profile {
  id: string;
  timezone: string;
  reminder_hour: number;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  interval_days: number;
  grace_days: number;
  start_date: ISODate;
  archived: boolean;
  dismissed_suggestion: number | null;
}

export interface Completion {
  id: string;
  habit_id: string;
  done_on: ISODate;
}
