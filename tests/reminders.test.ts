import { describe, expect, it } from "vitest";
import { reminderFor } from "../src/lib/reminders";
import { computeWindow } from "../src/lib/schedule";

const habit = { id: "h1", name: "Kedi kumu", emoji: "🐱" };
const rule = { intervalDays: 3, graceDays: 1, startDate: "2026-10-01" };
const at = (today: string) => reminderFor(habit, computeWindow(rule, ["2026-10-07"], today));

describe("reminderFor", () => {
  it("is silent while green", () => {
    expect(at("2026-10-09")).toBeNull();
  });

  it("escalates through ideal, last day and overdue", () => {
    expect(at("2026-10-10")).toMatchObject({ kind: "yellow", body: "Bugün ideal gün. Son gün yarın." });
    expect(at("2026-10-11")).toMatchObject({ kind: "red", body: "⚠️ Bugün son gün!" });
    expect(at("2026-10-13")).toMatchObject({ kind: "overdue", body: "2 gün gecikti." });
  });
});
