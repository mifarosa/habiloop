import { describe, expect, it } from "vitest";
import { computeWindow, compareUrgency } from "../src/lib/schedule";
import { todayIn, hourIn, weekdayTR } from "../src/lib/dates";

// 2026-10-07 is a Wednesday.
const WED = "2026-10-07";
const cat = { intervalDays: 3, graceDays: 1, startDate: "2026-10-01" };

describe("computeWindow", () => {
  it("handles the cat litter example", () => {
    expect(weekdayTR(WED)).toBe("Çarşamba");
    const at = (today: string) => computeWindow(cat, [WED], today);
    expect(at("2026-10-08").state).toBe("green"); // Thu
    expect(at("2026-10-09").state).toBe("green"); // Fri
    expect(at("2026-10-10").state).toBe("yellow"); // Sat: ideal
    expect(at("2026-10-11").state).toBe("red"); // Sun: last day
    expect(at("2026-10-12").state).toBe("overdue"); // Mon
    expect(at("2026-10-12").daysLeft).toBe(-1);
    expect(at("2026-10-10")).toMatchObject({ ideal: "2026-10-10", deadline: "2026-10-11", daysLeft: 1 });
  });

  it("treats grace 0 daily habits as red on the due day", () => {
    const daily = { intervalDays: 1, graceDays: 0, startDate: "2026-10-01" };
    expect(computeWindow(daily, ["2026-10-10"], "2026-10-10").state).toBe("green");
    expect(computeWindow(daily, ["2026-10-10"], "2026-10-11").state).toBe("red");
    expect(computeWindow(daily, ["2026-10-10"], "2026-10-12").state).toBe("overdue");
  });

  it("keeps a yellow span for wide grace periods", () => {
    const weekly = { intervalDays: 7, graceDays: 2, startDate: "2026-10-01" };
    const w = (t: string) => computeWindow(weekly, ["2026-10-01"], t).state;
    expect(w("2026-10-07")).toBe("green");
    expect(w("2026-10-08")).toBe("yellow");
    expect(w("2026-10-09")).toBe("yellow");
    expect(w("2026-10-10")).toBe("red");
  });

  it("anchors a new habit at its start date", () => {
    const w = computeWindow({ ...cat, startDate: "2026-10-11" }, [], "2026-10-11");
    expect(w).toMatchObject({ ideal: "2026-10-11", deadline: "2026-10-12", state: "yellow" });
  });

  it("recomputes from a retroactive entry", () => {
    // Forgot to log Saturday's cleaning, logged it on Monday.
    const w = computeWindow(cat, [WED, "2026-10-10"], "2026-10-12");
    expect(w).toMatchObject({ anchor: "2026-10-10", ideal: "2026-10-13", state: "green" });
  });

  it("sorts by urgency", () => {
    const ws = ["2026-10-12", "2026-10-09", "2026-10-11"].map((t) => computeWindow(cat, [WED], t));
    expect(ws.sort(compareUrgency).map((w) => w.state)).toEqual(["overdue", "red", "green"]);
  });
});

describe("timezone helpers", () => {
  const instant = new Date("2026-10-10T22:30:00Z");
  it("resolves the local date and hour", () => {
    expect(todayIn("UTC", instant)).toBe("2026-10-10");
    expect(todayIn("Europe/Istanbul", instant)).toBe("2026-10-11");
    expect(hourIn("Europe/Istanbul", instant)).toBe(1);
  });
});
