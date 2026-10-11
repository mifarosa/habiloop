import { describe, expect, it } from "vitest";
import { onTimeRate } from "../src/lib/stats";

const rule = { intervalDays: 3, graceDays: 1, startDate: "2026-10-01" };

describe("onTimeRate", () => {
  it("returns null without data", () => {
    expect(onTimeRate(rule, []).rate).toBeNull();
  });

  it("counts cycles done by their deadline", () => {
    // start 10-01 (deadline 10-02) → 10-02 ok; deadline 10-06 → 10-06 ok; deadline 10-10 → 10-12 late.
    const s = onTimeRate(rule, ["2026-10-02", "2026-10-06", "2026-10-12"]);
    expect(s).toEqual({ onTime: 2, total: 3, rate: 2 / 3 });
  });
});
