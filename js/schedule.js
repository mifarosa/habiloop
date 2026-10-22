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

  // The reminders the server should send for a habit: the ideal day, the last day (when there is
  // a tolerance) and each of the next `lateDays` days after it. Each has a local day and a stage.
  function reminders(h, lateDays = 7) {
    if (h.archived) return [];
    const st = status(h, "1970-01-01"); // only ideal/deadline are used, so the reference day is irrelevant
    const out = [{ day: str(st.ideal), stage: st.deadline === st.ideal ? "last" : "ideal", late: 0 }];
    if (st.deadline > st.ideal) out.push({ day: str(st.deadline), stage: "last", late: 0 });
    for (let i = 1; i <= lateDays; i++) out.push({ day: str(st.deadline + i), stage: "late", late: i });
    return out;
  }

  // Local wall-clock timestamp (ms) for a day and "HH:MM", in the device's own time zone.
  function at(day, time) {
    const [y, m, d] = day.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }

  const api = { reminders, at, DAY, num, str, todayStr, status, onTime, suggest, addLog, shouldAsk };
  if (typeof module !== "undefined") module.exports = api; else root.Schedule = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
