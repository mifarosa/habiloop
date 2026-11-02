import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// schedule.js is a plain script that also exports for Node, so tests need no build step.
const S = createRequire(import.meta.url)("../js/schedule.js");

const TODAY = "2026-11-10";
// A habit done on `last`, every `every` days with `grace` days of tolerance.
const habit = (name, every, grace, last, extra = {}) => ({
  id: name, name, every, grace, start: last, created: last, logs: last ? [last] : [], ...extra,
});

test("upcoming: every habit appears once, on the day its next job falls", () => {
  const rows = S.upcoming([
    habit("resting", 7, 1, "2026-11-08"), // ideal 15 Nov
    habit("ideal today", 3, 1, "2026-11-07"), // ideal 10 Nov = today
    habit("last day", 3, 1, "2026-11-06"), // ideal 9 Nov, last day 10 Nov
    habit("late", 2, 1, "2026-11-05"), // ideal 7 Nov, last day 8 Nov
  ], TODAY);
  const byName = Object.fromEntries(rows.map((r) => [r.h.name, r]));
  assert.equal(rows.length, 4);
  assert.equal(byName.resting.day, "2026-11-15");
  assert.equal(byName["ideal today"].day, TODAY);
  assert.equal(byName["last day"].day, TODAY);
  assert.equal(byName.late.day, "2026-11-08", "a late habit shows the final day it missed");
  assert.equal(byName.resting.st.state, "ok");
  assert.equal(byName.late.st.state, "late");
});

test("upcoming: due and late habits first (the most overdue first), then the resting ones nearest first", () => {
  const rows = S.upcoming([
    habit("far", 14, 0, "2026-11-10"), // ideal 24 Nov
    habit("near", 3, 0, "2026-11-10"), // ideal 13 Nov
    habit("today", 3, 0, "2026-11-07"), // ideal today
    habit("very late", 2, 0, "2026-11-01"), // final day 3 Nov
    habit("late", 2, 0, "2026-11-06"), // final day 8 Nov
  ], TODAY);
  assert.deepEqual(rows.map((r) => r.h.name), ["very late", "late", "today", "near", "far"]);
});

test("upcoming: ties are ordered by name, archived habits are left out, nothing gives an empty list", () => {
  const rows = S.upcoming([
    habit("b", 7, 0, "2026-11-10"),
    habit("a", 7, 0, "2026-11-10"),
    habit("gone", 1, 0, "2026-11-01", { archived: true }),
  ], TODAY);
  assert.deepEqual(rows.map((r) => r.h.name), ["a", "b"]);
  assert.deepEqual(S.upcoming([], TODAY), []);
});

test("upcoming: a habit that was never done counts from its start day", () => {
  const rows = S.upcoming([{ id: "n", name: "new", every: 7, grace: 0, start: "2026-11-12", created: "2026-11-12", logs: [] }], TODAY);
  assert.equal(rows[0].day, "2026-11-12");
});

test("nearestDays: one mark per habit, today and later only", () => {
  const days = S.nearestDays([
    habit("resting", 7, 1, "2026-11-08"), // 15 Nov
    habit("also 15th", 5, 0, "2026-11-10"), // 15 Nov
    habit("due", 3, 1, "2026-11-07"), // today
    habit("late", 2, 1, "2026-11-05"), // in the past: no mark
  ], TODAY);
  assert.deepEqual([...days.keys()].sort(), [TODAY, "2026-11-15"]);
  assert.deepEqual(days.get("2026-11-15").sort(), ["also 15th", "resting"]);
  assert.deepEqual(days.get(TODAY), ["due"]);
  assert.equal([...days.values()].flat().length, 3, "the late habit has no mark");
});

test("repeat presets are plain intervals: daily 1, weekly 7, every 2 weeks 14, monthly 30", () => {
  const next = (every) => S.str(S.num("2026-11-10") + every);
  const done = (every) => S.status(habit("p", every, 0, "2026-11-10"), TODAY).ideal;
  assert.equal(S.str(done(1)), next(1));
  assert.equal(S.str(done(7)), "2026-11-17");
  assert.equal(S.str(done(14)), "2026-11-24");
  assert.equal(S.str(done(30)), "2026-12-10");
});
