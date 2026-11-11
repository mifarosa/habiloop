// Window logic for interval habits. A habit is done every `every` days with `grace` days of tolerance:
// after the last log, the ideal day is last + every, the final day is ideal + grace.
// Pure functions, no DOM, so they can be tested in Node.
(function (root) {
  const DAY = 864e5;
  const pad = (n) => String(n).padStart(2, "0");
  const num = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const str = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const todayStr = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // state: ok (green) | ideal (yellow) | last (red, final day) | late (overdue)
  function status(h, today) {
    const t = typeof today === "string" ? num(today) : today;
    const ideal = h.logs.length ? num(h.logs[h.logs.length - 1]) + h.every : num(h.start);
    const deadline = ideal + h.grace;
    let state = "ok";
    if (t > deadline) state = "late";
    else if (t >= ideal) state = h.grace > 0 && t === deadline ? "last" : "ideal";
    // frac: how far through the window we are, 0 at the last log, 1 on the final day.
    const from = ideal - h.every, frac = Math.min(1, Math.max(0, (t - from) / (deadline - from)));
    return { ideal, deadline, state, frac, toIdeal: ideal - t, toDeadline: deadline - t };
  }

  // Share of cycles done on or before the final day.
  function onTime(h) {
    const cycles = h.logs.length - 1;
    if (cycles < 1) return null;
    let ok = 0;
    for (let i = 1; i < h.logs.length; i++) if (num(h.logs[i]) <= num(h.logs[i - 1]) + h.every + h.grace) ok++;
    return { ok, cycles, rate: ok / cycles };
  }

  // After 5+ logs, suggest the real rhythm when it differs from the setting.
  function suggest(h) {
    if (h.logs.length < 5) return null;
    const recent = h.logs.slice(-6);
    const gaps = [];
    for (let i = 1; i < recent.length; i++) gaps.push(num(recent[i]) - num(recent[i - 1]));
    gaps.sort((a, b) => a - b);
    const mid = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : Math.round((gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2);
    return mid >= 1 && Math.abs(mid - h.every) >= 1 && h.dismissed !== mid ? mid : null;
  }

  function addLog(h, date) {
    if (!h.logs.includes(date)) { h.logs.push(date); h.logs.sort(); }
  }

  // Should the app ask about this habit now? Once per day, after its reminder time.
  function shouldAsk(h, now = new Date()) {
    if (h.archived || h.askedOn === todayStr(now)) return false;
    if (status(h, todayStr(now)).state === "ok") return false;
    if (!h.time) return true;
    const [hh, mm] = h.time.split(":").map(Number);
    return now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm;
  }

  // One entry per active habit: the day its next job falls on. That is today for a habit that is due
  // (ideal or final day), the ideal day while it is still resting, and the missed final day when it is late.
  // Habits that are due or late come first, most urgent first; then the resting ones, nearest first.
  function upcoming(habits, today) {
    const t = num(today);
    return habits.filter((h) => !h.archived).map((h) => {
      const st = status(h, today);
      const day = st.state === "ok" ? st.ideal : st.state === "late" ? st.deadline : t;
      return { h, st, day: str(day) };
    }).sort((a, b) => {
      const aRest = a.st.state === "ok", bRest = b.st.state === "ok";
      if (aRest !== bRest) return aRest ? 1 : -1;
      return (aRest ? a.st.ideal - b.st.ideal : a.st.deadline - b.st.deadline) || a.h.name.localeCompare(b.h.name);
    });
  }

  // The jobs that fall on one day. Today: the habits that are due now. Later days: habits whose ideal day is that
  // day, or whose final day is (when there is a tolerance). Earlier days have none, the calendar shows what was
  // logged there. Later repeats are not guessed: they depend on when the habit is actually done.
  function jobsOn(habits, day, today) {
    const d = num(day), t = num(today);
    if (d < t) return [];
    const out = [];
    for (const h of habits) {
      if (h.archived) continue;
      const st = status(h, today);
      if (d === t) {
        if (st.state === "ideal" || st.state === "last") out.push({ h, kind: st.state });
      } else if (st.ideal === d) out.push({ h, kind: "ideal" });
      else if (h.grace > 0 && st.deadline === d) out.push({ h, kind: "last" });
    }
    return out.sort((a, b) => a.h.name.localeCompare(b.h.name));
  }

  // Habit names by day for marking the calendar: each habit appears once, on its next job day.
  // Days before today (a late habit) are left out, the list says "N days overdue" for those.
  function nearestDays(habits, today) {
    const days = new Map();
    for (const { h, day } of upcoming(habits, today)) {
      if (num(day) < num(today)) continue;
      days.set(day, [...(days.get(day) || []), h.name]);
    }
    return days;
  }

  // The reminders the server should send for a habit: the ideal day, the last day (when there is
  // a tolerance) and each of the next `lateDays` days after it. Each has a local day and a stage.
  function reminders(h, lateDays = 30) {
    if (h.archived) return [];
    const st = status(h, "1970-01-01"); // only ideal/deadline are used, so the reference day is irrelevant
    const out = [{ day: str(st.ideal), stage: st.deadline === st.ideal ? "last" : "ideal", late: 0 }];
    if (st.deadline > st.ideal) out.push({ day: str(st.deadline), stage: "last", late: 0 });
    for (let i = 1; i <= lateDays; i++) out.push({ day: str(st.deadline + i), stage: "late", late: i });
    return out;
  }

  // Groups reminders ({ day, at, name, ... }) into one entry per local day, due at that day's earliest time,
  // so the phone gets a single notification per day. Inside a day: by time, then by name.
  function byDay(items) {
    const days = new Map();
    for (const it of items) {
      const g = days.get(it.day) || { day: it.day, at: it.at, items: [] };
      g.at = Math.min(g.at, it.at);
      g.items.push(it);
      days.set(it.day, g);
    }
    for (const g of days.values()) g.items.sort((a, b) => a.at - b.at || String(a.name).localeCompare(String(b.name)));
    return [...days.values()].sort((a, b) => a.at - b.at);
  }

  // Local wall-clock timestamp (ms) for a day and "HH:MM", in the device's own time zone.
  function at(day, time) {
    const [y, m, d] = day.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }

  const api = { reminders, byDay, at, DAY, num, str, todayStr, status, onTime, suggest, addLog, shouldAsk, upcoming, nearestDays, jobsOn };
  if (typeof module !== "undefined") module.exports = api; else root.Schedule = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
