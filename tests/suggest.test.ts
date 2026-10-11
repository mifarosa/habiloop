import { describe, expect, it } from "vitest";
import { suggestInterval } from "../src/lib/suggest";
import { addDays } from "../src/lib/dates";

const every = (gap: number, n: number) => Array.from({ length: n }, (_, i) => addDays("2026-09-01", i * gap));

describe("suggestInterval", () => {
  it("needs enough data", () => {
    expect(suggestInterval(every(2, 4), 3)).toBeNull();
  });

  it("suggests the real rhythm when it differs", () => {
    expect(suggestInterval(every(2, 6), 3)).toBe(2);
    expect(suggestInterval(every(5, 6), 3)).toBe(5);
  });

  it("stays quiet when the rhythm matches", () => {
    expect(suggestInterval(every(3, 8), 3)).toBeNull();
    // 8 vs 7 is under the 25% threshold.
    expect(suggestInterval(every(8, 6), 7)).toBeNull();
  });
});
