(() => {
  const LANG_KEY = "habiloop.lang", ARCH_KEY = "habiloop.showArchived";
  const DAY = Score.DAY, VISIBLE_DAYS = 5;
  const PALETTE = ["#D32F2F", "#E64A19", "#F57C00", "#FBC02D", "#AFB42B", "#7CB342", "#388E3C", "#00897B", "#0097A7", "#1976D2", "#303F9F", "#7B1FA2", "#C2185B", "#8D6E63", "#757575", "#455A64"];
  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  let lang = store.get(LANG_KEY) || ((navigator.language || "en").startsWith("tr") ? "tr" : "en");
  let showArchived = store.get(ARCH_KEY) === "1";
  let habits = [], entries = new Map();
  let winOffset = 0, calMonth = null;
  let editingId = null, detailId = null, pickedColor = 9;

  const t = (k, vars = {}) => String(LANGS[lang][k] ?? LANGS.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v]);
  const colorOf = (h) => PALETTE[h.color >= 0 && h.color < PALETTE.length ? h.color : 9];
  const todayNum = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
  const dateOf = (n) => new Date(n * DAY); // UTC midnight: read with getUTC*
  const entriesOf = (h) => entries.get(h.id) || new Map();

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function toast(msg) {
    const n = $("toast"); n.textContent = msg; n.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => (n.hidden = true), 2500);
  }

  function computed(h) {
    const e = entriesOf(h), today = todayNum();
    let first = today;
    for (const d of e.keys()) if (d < first) first = d;
    const s = Score.scores(h, e, first, today);
    return { first, scores: s, score: s[s.length - 1] };
  }

  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

  function cellFor(h, day) {
    const v = entriesOf(h).get(day);
    const b = el("button", "cell");
    b.style.color = "";
    if (h.type === 1) {
      if (v != null && v >= 0) {
        const n = v / 1000;
        b.textContent = n >= 1000 ? Math.round(n / 100) / 10 + "k" : String(Math.round(n * 10) / 10);
        b.style.color = colorOf(h); b.style.fontWeight = "600";
      } else b.textContent = "–";
    } else if (v === Score.YES_MANUAL) { b.innerHTML = CHECK; b.style.color = colorOf(h); }
    else if (v === Score.SKIP) b.textContent = "»";
    else b.innerHTML = CROSS;
    b.setAttribute("aria-label", `${h.name} ${dateOf(day).toISOString().slice(0, 10)}`);
    b.onclick = () => toggle(h, day);
    return b;
  }

  async function toggle(h, day) {
    const v = entriesOf(h).get(day);
    if (h.type === 1) {
      const ans = prompt(t("enterValue", { day: dateOf(day).toISOString().slice(0, 10) }) + (h.unit ? ` (${h.unit})` : ""), v != null && v >= 0 ? v / 1000 : "");
      if (ans === null) return;
      const n = parseFloat(ans.replace(",", "."));
      await LoopDB.setEntry(h.id, day, isFinite(n) && n >= 0 && ans.trim() !== "" ? Math.round(n * 1000) : null);
    } else {
      await LoopDB.setEntry(h.id, day, v === Score.YES_MANUAL ? null : Score.YES_MANUAL);
    }
    reload();
  }

  function reload() { habits = LoopDB.habits(); entries = LoopDB.entries(); render(); if (!$("detail").hidden) renderDetail(); }

  function render() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
    document.querySelectorAll("[data-i18n-aria]").forEach((n) => n.setAttribute("aria-label", t(n.dataset.i18nAria)));
    document.querySelectorAll("[data-i18n-ph]").forEach((n) => n.setAttribute("placeholder", t(n.dataset.i18nPh)));
    $("langBtn").textContent = t("langName");
    $("archBtn").textContent = showArchived ? "✓ " + t("showArchived") : t("showArchived");

    const today = todayNum() - winOffset;
    const head = $("dayHead"); head.replaceChildren();
    for (let i = VISIBLE_DAYS - 1; i >= 0; i--) {
      const d = dateOf(today - i), s = el("span");
      s.append(LANGS[lang].days[d.getUTCDay()], document.createElement("br"), String(d.getUTCDate()));
      head.append(s);
    }

    const list = $("list"); list.replaceChildren();
    const shown = habits.filter((h) => showArchived || !h.archived);
    for (const h of shown) {
      const li = el("li", "habit" + (h.archived ? " archived" : ""));
      const row = el("div", "hrow");
      const title = el("button", "title"); title.append(el("b", "", h.name));
      title.firstChild.style.color = colorOf(h);
      title.onclick = () => openDetail(h.id);
      const pct = el("span", "pct", Math.floor(computed(h).score * 100) + "%");
      const cells = el("div", "cells");
      for (let i = VISIBLE_DAYS - 1; i >= 0; i--) cells.append(cellFor(h, today - i));
      row.append(title, pct);
      li.append(row, cells);
      list.append(li);
    }
    const lo = dateOf(today - VISIBLE_DAYS + 1), hi = dateOf(today), mon = (d) => d.toLocaleDateString(lang, { month: "short", timeZone: "UTC" });
    $("winLabel").textContent = `${lo.getUTCDate()} ${mon(lo)} – ${hi.getUTCDate()} ${mon(hi)} ${hi.getUTCFullYear()}`;
    $("nextWin").disabled = winOffset === 0;
    $("winNav").hidden = shown.length === 0;
    $("empty").hidden = shown.length > 0;
    $("dayHead").hidden = shown.length === 0;
  }

  // ---- detail ----
  function openDetail(id) { detailId = id; calMonth = null; $("detail").hidden = false; renderDetail(); }
  function renderDetail() {
    const h = habits.find((x) => x.id === detailId);
    if (!h) { $("detail").hidden = true; return; }
    $("dName").textContent = h.name; $("dName").style.color = colorOf(h);
    $("dQuestion").textContent = h.question || ""; $("dQuestion").hidden = !h.question;
    $("chartTitle").textContent = t("scoreChart");
    $("dArch").textContent = t(h.archived ? "unarchive" : "archive");

    const c = computed(h), today = todayNum(), e = entriesOf(h);
    const at = (daysBack) => { const i = c.scores.length - 1 - daysBack; return i >= 0 ? c.scores[i] : 0; };
    const st = Score.streaks(h, e, c.first, today);
    let total = 0; for (const v of e.values()) total += h.type === 1 ? Math.max(0, v) / 1000 : v === Score.YES_MANUAL ? 1 : 0;
    const diff = (d) => { const x = Math.round((c.score - at(d)) * 100); return (x > 0 ? "+" : "") + x + "%"; };
    const stats = [[t("score"), Math.floor(c.score * 100) + "%"], [t("month"), diff(30)], [t("year"), diff(365)],
      [t("total"), String(Math.round(total * 10) / 10)], [t("current"), String(st.current)], [t("best"), String(st.best)]];
    $("stats").replaceChildren(...stats.map(([l, v]) => { const d = el("div", "stat"); d.append(el("b", "", v), el("span", "", l)); return d; }));
    drawChart(c.scores.slice(-90), colorOf(h));
    renderCal(h);
  }

  function renderCal(h) {
    const now = dateOf(todayNum());
    if (!calMonth) calMonth = { y: now.getUTCFullYear(), m: now.getUTCMonth() };
    $("monLabel").textContent = new Date(Date.UTC(calMonth.y, calMonth.m, 1)).toLocaleDateString(lang, { month: "long", year: "numeric", timeZone: "UTC" });
    $("nextMon").disabled = calMonth.y === now.getUTCFullYear() && calMonth.m === now.getUTCMonth();
    const cal = $("cal"); cal.replaceChildren();
    const first = Date.UTC(calMonth.y, calMonth.m, 1), count = new Date(Date.UTC(calMonth.y, calMonth.m + 1, 0)).getUTCDate();
    const lead = (new Date(first).getUTCDay() + 6) % 7; // Monday first
    const names = LANGS[lang].days;
    for (let i = 0; i < 7; i++) cal.append(el("span", "calh", names[(i + 1) % 7]));
    for (let i = 0; i < lead; i++) cal.append(el("span"));
    const e = entriesOf(h);
    for (let d = 1; d <= count; d++) {
      const day = Math.floor(first / DAY) + d - 1, v = e.get(day);
      const done = h.type === 1 ? v != null && v >= 0 : v === Score.YES_MANUAL;
      const b = el("button", "calday" + (done ? " on" : "") + (day === todayNum() ? " today" : ""), String(d));
      if (done) b.style.background = colorOf(h);
      if (day > todayNum()) b.disabled = true;
      b.onclick = () => toggle(h, day);
      cal.append(b);
    }
  }

  function drawChart(vals, color) {
    const cv = $("chart"), dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 300, h = 160;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    const line = getComputedStyle(document.documentElement).getPropertyValue("--line") || "#ddd";
    g.strokeStyle = line; g.lineWidth = 1;
    for (const p of [0, 0.5, 1]) { const y = 8 + (1 - p) * (h - 16); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    if (vals.length < 2) return;
    g.strokeStyle = color; g.lineWidth = 2.5; g.lineJoin = "round"; g.beginPath();
    vals.forEach((v, i) => { const x = (i / (vals.length - 1)) * w, y = 8 + (1 - v) * (h - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }

  // ---- editor ----
  function buildColors() {
    const box = $("colors"); box.replaceChildren();
    PALETTE.forEach((c, i) => {
      const b = el("button"); b.type = "button"; b.style.background = c; b.setAttribute("aria-label", c);
      b.setAttribute("aria-pressed", String(i === pickedColor));
      b.onclick = () => { pickedColor = i; buildColors(); };
      box.append(b);
    });
  }
  function syncType() { $("numFields").hidden = $("fType").value !== "1"; }
  function openEditor(id) {
    editingId = id || null;
    const h = habits.find((x) => x.id === id);
    $("editorTitle").textContent = t(h ? "editHabit" : "addHabit");
    $("fName").value = h ? h.name : ""; $("fQuestion").value = h ? h.question || "" : "";
    $("fType").value = String(h ? h.type || 0 : 0);
    $("fNum").value = h ? h.freq_num || 1 : 1; $("fDen").value = h ? h.freq_den || 1 : 1;
    $("fTargetType").value = String(h ? h.target_type || 0 : 0); $("fTarget").value = h ? h.target_value ?? 1 : 1;
    $("fUnit").value = h ? h.unit || "" : "";
    pickedColor = h && h.color >= 0 && h.color < PALETTE.length ? h.color : 9;
    buildColors(); syncType();
    $("delBtn").hidden = !h;
    $("editor").hidden = false; $("fName").focus();
  }

  $("fType").onchange = syncType;
  $("form").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("fName").value.trim(); if (!name) return;
    const num = Math.max(1, parseInt($("fNum").value) || 1), den = Math.max(num > 1 ? 1 : 1, parseInt($("fDen").value) || 1);
    await LoopDB.saveHabit({
      id: editingId, name, question: $("fQuestion").value.trim(), type: parseInt($("fType").value),
      freq_num: Math.min(num, den), freq_den: den, target_type: parseInt($("fTargetType").value),
      target_value: parseFloat($("fTarget").value) || 0, unit: $("fUnit").value.trim(), color: pickedColor,
    });
    $("editor").hidden = true; reload();
  };
  $("delBtn").onclick = async () => {
    if (!confirm(t("confirmDelete"))) return;
    await LoopDB.deleteHabit(editingId);
    $("editor").hidden = true; $("detail").hidden = true; reload();
  };
  $("dEdit").onclick = () => { $("detail").hidden = true; openEditor(detailId); };
  $("dArch").onclick = async () => {
    const h = habits.find((x) => x.id === detailId);
    await LoopDB.setArchived(h.id, !h.archived); $("detail").hidden = true; reload();
  };

  // ---- menu, import / export ----
  $("prevWin").onclick = () => { winOffset += VISIBLE_DAYS; render(); };
  $("nextWin").onclick = () => { winOffset = Math.max(0, winOffset - VISIBLE_DAYS); render(); };
  $("prevMon").onclick = () => { calMonth = calMonth.m ? { y: calMonth.y, m: calMonth.m - 1 } : { y: calMonth.y - 1, m: 11 }; renderDetail(); };
  $("nextMon").onclick = () => { calMonth = calMonth.m < 11 ? { y: calMonth.y, m: calMonth.m + 1 } : { y: calMonth.y + 1, m: 0 }; renderDetail(); };
  $("addBtn").onclick = $("emptyAdd").onclick = () => openEditor();
  $("menuBtn").onclick = () => ($("menu").hidden = false);
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => (b.closest(".sheet").hidden = true)));
  document.querySelectorAll(".sheet").forEach((s) => s.addEventListener("click", (e) => { if (e.target === s) s.hidden = true; }));
  $("langBtn").onclick = () => { lang = lang === "en" ? "tr" : "en"; store.set(LANG_KEY, lang); render(); if (!$("detail").hidden) renderDetail(); };
  $("archBtn").onclick = () => { showArchived = !showArchived; store.set(ARCH_KEY, showArchived ? "1" : "0"); render(); };

  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      await LoopDB.importBytes(new Uint8Array(await f.arrayBuffer()));
      $("menu").hidden = true; reload(); toast(t("imported"));
    } catch (err) { toast(t("importFail")); }
  };
  $("exportBtn").onclick = async () => {
    const d = new Date(), pad = (n) => String(n).padStart(2, "0");
    const name = `Loop Habits Backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.db`;
    const file = new File([LoopDB.exportBytes()], name, { type: "application/octet-stream" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch (err) { if (err.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(t("exported"));
  };

  (async () => {
    render();
    try { await LoopDB.init(); } catch (e) { toast(t("loadFail")); return; }
    reload();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  })();
})();
