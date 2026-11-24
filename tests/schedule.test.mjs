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

// ---- what is on a given day ----

const kinds = (rows) => rows.map((r) => `${r.h.name}:${r.kind}`).sort();

test("jobsOn: a later day lists habits whose ideal day or final day (with tolerance) falls on it", () => {
  const habits = [
    habit("weekly", 7, 2, "2026-11-08"), // ideal 15 Nov, final day 17 Nov
    habit("strict", 5, 0, "2026-11-10"), // ideal 15 Nov, no tolerance
    habit("other", 9, 1, "2026-11-08"), // ideal 17 Nov, final day 18 Nov
  ];
  assert.deepEqual(kinds(S.jobsOn(habits, "2026-11-15", TODAY)), ["strict:ideal", "weekly:ideal"]);
  assert.deepEqual(kinds(S.jobsOn(habits, "2026-11-17", TODAY)), ["other:ideal", "weekly:last"]);
  assert.deepEqual(kinds(S.jobsOn(habits, "2026-11-18", TODAY)), ["other:last"]);
  assert.deepEqual(S.jobsOn(habits, "2026-11-16", TODAY), [], "a day with nothing scheduled is empty");
});

test("jobsOn: with no tolerance the ideal day is also the final day, but it is listed once as the ideal day", () => {
  const rows = S.jobsOn([habit("strict", 5, 0, "2026-11-10")], "2026-11-15", TODAY);
  assert.deepEqual(kinds(rows), ["strict:ideal"]);
});

test("jobsOn: today lists the habits that are due now, past days list nothing", () => {
  const habits = [
    habit("due today", 3, 1, "2026-11-07"), // ideal today
    habit("on the last day", 3, 1, "2026-11-06"), // final day today
    habit("ideal passed", 4, 3, "2026-11-04"), // ideal 8 Nov, final day 11 Nov
    habit("resting", 7, 1, "2026-11-09"),
    habit("late", 2, 0, "2026-11-01"),
  ];
  assert.deepEqual(kinds(S.jobsOn(habits, TODAY, TODAY)), ["due today:ideal", "ideal passed:ideal", "on the last day:last"]);
  assert.deepEqual(S.jobsOn(habits, "2026-11-09", TODAY), []);
});

test("jobsOn: archived habits are left out and rows are ordered by name", () => {
  const rows = S.jobsOn([
    habit("b", 7, 0, "2026-11-08"),
    habit("a", 7, 0, "2026-11-08"),
    habit("old", 7, 0, "2026-11-08", { archived: true }),
  ], "2026-11-15", TODAY);
  assert.deepEqual(rows.map((r) => r.h.name), ["a", "b"]);
});

test("reminders keep coming for 30 days after the final day, so a long absence does not silence them", () => {
  const r = S.reminders(habit("litter", 3, 1, "2026-11-01"));
  assert.deepEqual(r.slice(0, 2).map((x) => x.stage), ["ideal", "last"]);
  const late = r.filter((x) => x.stage === "late");
  assert.equal(late.length, 30);
  assert.equal(late[0].late, 1);
  assert.equal(late[29].late, 30);
});

test("byDay: one entry per day at its earliest time, items by time then name", () => {
  const at = (d, h) => S.at(d, h);
  const days = S.byDay([
    { day: "2026-11-11", at: at("2026-11-11", "18:00"), name: "Su", id: "a" },
    { day: "2026-11-11", at: at("2026-11-11", "09:00"), name: "Kedi", id: "b" },
    { day: "2026-11-11", at: at("2026-11-11", "09:00"), name: "Bitki", id: "c" },
    { day: "2026-11-12", at: at("2026-11-12", "09:00"), name: "Su", id: "a" },
  ]);
  assert.equal(days.length, 2);
  assert.equal(days[0].day, "2026-11-11");
  assert.equal(days[0].at, at("2026-11-11", "09:00"));
  assert.deepEqual(days[0].items.map((x) => x.name), ["Bitki", "Kedi", "Su"]);
  assert.equal(days[1].items.length, 1);
  assert.deepEqual(S.byDay([]), []);
});

test("relaxed habit: never late or red, says how long ago it was done, due every day until done", () => {
  const h = habit("Kitap", 1, 0, "2026-11-05", { soft: true });
  const st = S.status(h, TODAY); // five days after the last log
  assert.equal(st.state, "ideal");
  assert.equal(st.sinceLast, 5);
  assert.equal(st.soft, true);
  assert.equal(S.status(habit("Kitap", 1, 0, "2026-11-05"), TODAY).state, "late", "the strict habit is late as before");
  assert.equal(S.status(habit("Kitap", 1, 0, TODAY, { soft: true }), TODAY).state, "ok");
  assert.equal(S.onTime(habit("Kitap", 1, 0, "2026-11-05", { soft: true, logs: ["2026-11-01", "2026-11-05"] })), null);
  const r = S.reminders(h);
  assert.ok(r.every((x) => x.stage === "ideal" && x.late === 0), "no last or late reminders");
  assert.equal(r.length, 31);
  assert.equal(S.jobsOn([h], TODAY, TODAY).length, 1);
});

test("notes: own note, carried note, stop marker, clearing, keep limit", () => {
  const h = habit("Kitap", 1, 0, "2026-11-01", { notes: undefined });
  S.setNote(h, "2026-11-03", "3. kitaptayım", true);
  assert.deepEqual(S.noteFor(h, "2026-11-03"), { t: "3. kitaptayım", c: true, own: true, from: "2026-11-03" });
  assert.equal(S.noteFor(h, "2026-11-02"), null, "never shown before the day it was written");
  const later = S.noteFor(h, "2026-11-07");
  assert.equal(later.t, "3. kitaptayım");
  assert.equal(later.own, false);
  assert.equal(later.from, "2026-11-03", "a carried note goes on to every later day");
  S.setNote(h, "2026-11-05", "4. kitaba geçtim", true);
  assert.equal(S.noteFor(h, "2026-11-04").t, "3. kitaptayım", "the days between keep the old note");
  assert.equal(S.noteFor(h, "2026-11-07").t, "4. kitaba geçtim", "a newer entry replaces it");
  S.setNote(h, "2026-11-08", "bitti", false);
  assert.equal(S.noteFor(h, "2026-11-09"), null, "a note that is not carried stops the chain");
  // clearing a day that only inherits needs a stop marker
  S.setNote(h, "2026-11-06", "", false);
  assert.equal(h.notes["2026-11-06"].t, "");
  assert.equal(S.noteFor(h, "2026-11-06"), null);
  assert.equal(S.noteFor(h, "2026-11-07"), null, "clearing ends the carried note from that day on");
  assert.equal(S.noteFor(h, "2026-11-05").t, "4. kitaba geçtim", "earlier days keep it");
  // clearing an own note with nothing to inherit removes the entry; no notes left removes the object
  const h2 = habit("Su", 1, 0, "2026-11-01");
  S.setNote(h2, "2026-11-02", "  x  ", false);
  assert.equal(h2.notes["2026-11-02"].t, "x", "text is trimmed");
  S.setNote(h2, "2026-11-02", "", false);
  assert.equal(h2.notes, undefined);
  S.setNote(h2, "2026-11-02", "y".repeat(500), false);
  assert.equal(h2.notes["2026-11-02"].t.length, S.NOTE_MAX);
  const h3 = habit("Çok", 1, 0, "2026-01-01");
  for (let i = 0; i < 100; i++) S.setNote(h3, S.str(S.num("2026-01-01") + i), "n" + i, false);
  assert.equal(Object.keys(h3.notes).length, 80);
  assert.ok(h3.notes[S.str(S.num("2026-01-01") + 99)], "the newest are kept");
});
