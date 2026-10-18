// Habit strength, ported from Loop Habit Tracker (uhabits-core Score.kt / ScoreList.kt).
// Loop Habit Tracker is GPL-3.0, Copyright (C) Álinson Santos Xavier; this port is GPL-3.0 as well.
(function (root) {
  const SKIP = 3, YES_MANUAL = 2, NO = 0, UNKNOWN = -1;
  const DAY = 86400000;

  function compute(frequency, previousScore, checkmarkValue) {
    const multiplier = Math.pow(0.5, Math.sqrt(frequency) / 13.0);
    return previousScore * multiplier + checkmarkValue * (1 - multiplier);
  }

  // entries: Map(dayNumber -> stored value). Numerical values are stored multiplied by 1000.
  // Returns an array of scores (0..1), one per day from `from` to `to` inclusive.
  function scores(habit, entries, from, to) {
    const isNumerical = habit.type === 1;
    const isAtMost = habit.target_type === 1;
    const target = habit.target_value || 0;
    let numerator = habit.freq_num || 1, denominator = habit.freq_den || 1;
    const freq = numerator / denominator;
    if (!isNumerical && freq < 1) { numerator *= 2; denominator *= 2; }

    const n = to - from + 1;
    const values = new Array(n);
    for (let i = 0; i < n; i++) values[i] = entries.has(from + i) ? entries.get(from + i) : UNKNOWN;

    const out = new Array(n);
    let rolling = 0;
    let prev = isNumerical && isAtMost ? 1 : 0;
    // Loop walks the interval newest-first; offset i in its list is day (to - i). We walk oldest-first.
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (isNumerical) {
        rolling += Math.max(0, v);
        if (i - denominator >= 0) rolling -= Math.max(0, values[i - denominator]);
        const sum = rolling / 1000;
        if (v !== SKIP) {
          let pct;
          if (!isAtMost) pct = target > 0 ? Math.min(1, sum / target) : 1;
          else pct = target > 0 ? Math.min(1, Math.max(0, 1 - (sum - target) / target)) : (sum > 0 ? 0 : 1);
          prev = compute(freq, prev, pct);
        }
      } else {
        if (v === YES_MANUAL) rolling += 1;
        if (i - denominator >= 0 && values[i - denominator] === YES_MANUAL) rolling -= 1;
        if (v !== SKIP) prev = compute(freq, prev, Math.min(1, rolling / numerator));
      }
      out[i] = prev;
    }
    return out;
  }

  // A day "counts" toward a streak when the habit was done, or (for non-daily habits) when the
  // trailing window still satisfies the frequency. Skipped days neither add to nor break a streak.
  function streaks(habit, entries, from, to) {
    const isNumerical = habit.type === 1;
    const isAtMost = habit.target_type === 1;
    const target = (habit.target_value || 0) * 1000;
    const num = habit.freq_num || 1, den = habit.freq_den || 1;
    const ok = (v) => v === YES_MANUAL ? true : !isNumerical ? false : (isAtMost ? v >= 0 && v <= target : v >= target && v > 0);
    const yes = [];
    for (let d = from; d <= to; d++) yes.push(entries.has(d) && entries.get(d) !== SKIP && ok(entries.get(d)) ? 1 : 0);
    let run = 0, best = 0, runBeforeLast = 0;
    for (let i = 0; i < yes.length; i++) {
      if (i === yes.length - 1) runBeforeLast = run;
      let cnt = 0;
      for (let k = Math.max(0, i - den + 1); k <= i; k++) cnt += yes[k];
      if (entries.get(from + i) === SKIP) { /* keeps the streak as is */ }
      else if (cnt >= num) run++;
      else run = 0;
      if (run > best) best = run;
    }
    // Today not done yet must not reset the current streak.
    const current = run > 0 ? run : runBeforeLast;
    return { current, best };
  }

  const api = { compute, scores, streaks, SKIP, YES_MANUAL, NO, UNKNOWN, DAY };
  if (typeof module !== "undefined") module.exports = api; else root.Score = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
