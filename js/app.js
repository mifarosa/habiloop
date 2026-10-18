(() => {
  const KEY = "habiloop.v2";
  const ACCENTS = ["teal", "blue", "purple", "rose", "orange"];
  const ACCENT_COLORS = { teal: "#0f766e", blue: "#1d4ed8", purple: "#7c3aed", rose: "#be185d", orange: "#c2410c" };
  const S = Schedule;
  const $ = (s, r = document) => r.querySelector(s);

  let state = load();
  let view = "habits";
  let editingId = null, otherFor = null, askQueue = [], asking = null;
  let calMonth = null, calSel = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.habits)) return { habits: s.habits, prefs: s.prefs || {} };
    } catch (e) {}
    return { habits: [], prefs: {} };
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  const lang = () => state.prefs.lang || ((navigator.language || "tr").startsWith("tr") ? "tr" : "en");
  const t = (k, v = {}) => String(I18N[lang()][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x]);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => S.todayStr();
  const fmt = (d) => new Date(S.num(d) * S.DAY).toLocaleDateString(lang(), { day: "numeric", month: "short", timeZone: "UTC" });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const find = (id) => state.habits.find((h) => h.id === id);

  function toast(msg) {
    const n = $("#toast"); n.textContent = msg; n.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (n.hidden = true), 2200);
  }

  function applyPrefs() {
    const r = document.documentElement, p = state.prefs;
    p.theme === "light" || p.theme === "dark" ? r.setAttribute("data-theme", p.theme) : r.removeAttribute("data-theme");
    r.setAttribute("data-accent", ACCENTS.includes(p.accent) ? p.accent : "teal");
    r.lang = lang();
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = ACCENT_COLORS[p.accent] || ACCENT_COLORS.teal;
  }
  function translateStatic() {
    document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
    document.querySelectorAll("[data-i18n-aria]").forEach((n) => n.setAttribute("aria-label", t(n.dataset.i18nAria)));
    document.querySelectorAll("[data-i18n-ph]").forEach((n) => n.setAttribute("placeholder", t(n.dataset.i18nPh)));
  }

  // ---- habits view ----
  function statusText(h, st) {
    if (st.state === "ok") return st.toIdeal === 1 ? t("st.ok1") : t("st.ok", { n: st.toIdeal });
    if (st.state === "ideal") return st.toIdeal === 0 ? t("st.ideal") : t("st.idealPast", { n: -st.toIdeal });
    if (st.state === "last") return t("st.last");
    return t("st.late", { n: -st.toDeadline });
  }
  const chipText = (st) => t("chip." + st.state);

  function habitCard(h) {
    const st = S.status(h, today()), rate = S.onTime(h), sug = S.suggest(h);
    const last = h.logs.length ? t("lastDone", { d: fmt(h.logs[h.logs.length - 1]) }) : t("never");
    return `<article class="card habit ${st.state}">
      <div class="top"><button class="name" data-act="edit" data-id="${h.id}">${esc(h.name)}</button><span class="chip">${chipText(st)}</span></div>
      <div class="status">${statusText(h, st)}</div>
      <div class="meta"><span>${h.grace ? t("ruleGrace", { n: h.every, g: h.grace }) : t("rule", { n: h.every })}${h.time ? " · " + h.time : ""}</span>
        <span>${last}${rate ? " · " + t("rate", { p: Math.round(rate.rate * 100), a: rate.ok, b: rate.cycles }) : ""}</span></div>
      <div class="row"><button class="btn primary" data-act="done" data-id="${h.id}">${t("done")}</button><button class="btn" data-act="other" data-id="${h.id}">${t("other")}</button></div>
      ${sug ? `<div class="suggest"><span>${t("suggest", { n: sug })}</span><div class="row"><button class="btn primary" data-act="accept" data-id="${h.id}" data-n="${sug}">${t("change")}</button><button class="btn" data-act="dismiss" data-id="${h.id}" data-n="${sug}">${t("dismiss")}</button></div></div>` : ""}
    </article>`;
  }

  const order = { late: 0, last: 1, ideal: 2, ok: 3 };
  function renderHabits() {
    const list = state.habits.filter((h) => !h.archived)
      .map((h) => ({ h, st: S.status(h, today()) }))
      .sort((a, b) => order[a.st.state] - order[b.st.state] || a.st.ideal - b.st.ideal);
    return (list.length
      ? list.map((x) => habitCard(x.h)).join("") + `<p class="muted small">${t("legend")}</p>`
      : `<div class="card empty"><h2>${t("empty.title")}</h2><p class="muted">${t("empty.text")}</p></div>`) + coffee();
  }
  const coffee = () => `<div class="coffee"><p>${t("coffee.text")}</p><a class="coffee-pill" href="https://buymeacoffee.com/mifarosa" target="_blank" rel="noopener noreferrer">☕ ${t("coffee.button")}</a></div>`;

  // ---- calendar view ----
  function renderCalendar() {
    const now = new Date();
    if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
    if (!calSel) calSel = today();
    const first = Date.UTC(calMonth.y, calMonth.m, 1), count = new Date(Date.UTC(calMonth.y, calMonth.m + 1, 0)).getUTCDate();
    const lead = (new Date(first).getUTCDay() + 6) % 7;
    const title = new Date(first).toLocaleDateString(lang(), { month: "long", year: "numeric", timeZone: "UTC" });
    let cells = I18N[lang()].days.map((d) => `<span class="h">${d}</span>`).join("") + "<span></span>".repeat(lead);
    for (let d = 1; d <= count; d++) {
      const ds = S.str(Math.floor(first / S.DAY) + d - 1);
      const n = state.habits.filter((h) => h.logs.includes(ds)).length;
      cells += `<button class="cd${ds === calSel ? " sel" : ""}${ds === today() ? " today" : ""}" data-act="day" data-d="${ds}" ${ds > today() ? "disabled" : ""}>${d}<span class="dots">${"<i></i>".repeat(Math.min(n, 3))}</span></button>`;
    }
    const done = state.habits.filter((h) => h.logs.includes(calSel));
    const list = done.length
      ? done.map((h) => `<div class="card row" style="align-items:center;justify-content:space-between"><span>${esc(h.name)}</span><button class="btn ghost danger" data-act="unlog" data-id="${h.id}" data-d="${calSel}">${t("cal.remove")}</button></div>`).join("")
      : `<p class="muted">${t("cal.none")}</p>`;
    return `<div class="calnav"><button data-act="prevm" aria-label="‹">‹</button><strong>${title}</strong><button data-act="nextm" aria-label="›">›</button></div>
      <div class="cal">${cells}</div><h3 class="small muted" style="margin:14px 0 6px">${fmt(calSel)}</h3>${list}`;
  }

  // ---- settings view ----
  function renderSettings() {
    const p = state.prefs, theme = p.theme || "system", accent = ACCENTS.includes(p.accent) ? p.accent : "teal";
    const seg = (items, cur, act) => `<div class="seg">${items.map(([v, l]) => `<button class="btn${cur === v ? " on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
    const perm = "Notification" in window ? Notification.permission : "denied";
    const notif = !("Notification" in window) ? "" : perm === "granted" && p.notify ? `<button class="btn on" disabled>${t("set.notifOff")}</button>` : perm === "denied" ? `<button class="btn" disabled>${t("set.notifDenied")}</button>` : `<button class="btn" data-act="notify">${t("set.notifOn")}</button>`;
    return `<section class="set"><h3>${t("set.theme")}</h3>${seg([["system", t("set.system")], ["light", t("set.light")], ["dark", t("set.dark")]], theme, "theme")}</section>
      <section class="set"><h3>${t("set.accent")}</h3><div class="seg">${ACCENTS.map((a) => `<button class="dot-c${accent === a ? " on" : ""}" style="background:${ACCENT_COLORS[a]}" data-act="accent" data-v="${a}" aria-label="${a}"></button>`).join("")}</div></section>
      <section class="set"><h3>${t("set.lang")}</h3>${seg([["tr", "Türkçe"], ["en", "English"]], lang(), "lang")}</section>
      ${notif ? `<section class="set"><h3>${t("set.notif")}</h3><div class="seg">${notif}</div><p class="muted small">${t("set.notifNote")}</p></section>` : ""}
      <section class="set"><h3>${t("set.data")}</h3><div class="seg"><button class="btn" data-act="export">${t("set.export")}</button><button class="btn" data-act="import">${t("set.import")}</button></div><p class="muted small">${t("set.privacy")}</p>
      <input id="import-file" type="file" accept="application/json" hidden></section>${coffee()}`;
  }

  function render() {
    applyPrefs(); translateStatic();
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#app").innerHTML = view === "habits" ? renderHabits() : view === "calendar" ? renderCalendar() : renderSettings();
  }

  // ---- logging ----
  function logDone(h, date) {
    S.addLog(h, date); h.askedOn = today(); save(); render(); toast(t("logged"));
  }
  function openOther(id, onPick) {
    otherFor = { id, onPick };
    const list = $("#other-list"); list.replaceChildren();
    for (let i = 0; i < 14; i++) {
      const d = S.str(S.num(today()) - i);
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn"; b.textContent = (i === 0 ? t("today") + " · " : i === 1 ? t("yesterday") + " · " : "") + fmt(d);
      b.onclick = () => { $("#other-dialog").close(); logDone(find(id), d); if (otherFor.onPick) otherFor.onPick(); };
      list.append(b);
    }
    $("#other-dialog").showModal();
  }

  // ---- editor ----
  function openForm(id) {
    editingId = id || null;
    const h = find(id);
    $("#form-title").textContent = t(h ? "editTitle" : "newTitle");
    $("#f-name").value = h ? h.name : "";
    $("#f-every").value = h ? h.every : 3;
    $("#f-grace").value = h ? h.grace : 1;
    $("#f-time").value = h ? h.time || "" : "09:00";
    $("#f-last").value = ""; $("#f-last").max = today();
    $("#f-last-wrap").hidden = !!h;
    $("#f-history-wrap").hidden = !h;
    $("#f-delete").hidden = !h;
    const hist = $("#f-history"); hist.replaceChildren();
    if (h) {
      if (!h.logs.length) hist.textContent = t("noHistory");
      [...h.logs].reverse().slice(0, 30).forEach((d) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip-btn"; b.textContent = fmt(d) + " ✕";
        b.onclick = () => { h.logs = h.logs.filter((x) => x !== d); save(); b.remove(); render(); };
        hist.append(b);
      });
    }
    $("#form-dialog").showModal();
  }
  $("#form").onsubmit = () => {
    const name = $("#f-name").value.trim(); if (!name) return;
    const data = {
      name, every: Math.max(1, parseInt($("#f-every").value) || 1), grace: Math.max(0, parseInt($("#f-grace").value) || 0),
      time: $("#f-time").value || null,
    };
    const h = find(editingId);
    if (h) { if (data.every !== h.every) h.dismissed = null; Object.assign(h, data); }
    else {
      const nh = { id: uid(), created: today(), start: today(), logs: [], askedOn: null, archived: false, ...data };
      const last = $("#f-last").value;
      if (last && last <= today()) S.addLog(nh, last);
      state.habits.push(nh);
    }
    save(); render();
  };
  $("#f-delete").onclick = () => {
    if (!confirm(t("confirmDelete"))) return;
    state.habits = state.habits.filter((h) => h.id !== editingId);
    save(); $("#form-dialog").close(); render();
  };
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));

  // ---- "it's time" prompt ----
  function pumpAsk() {
    if (asking || $("dialog[open]")) return;
    const now = new Date();
    askQueue = state.habits.filter((h) => S.shouldAsk(h, now));
    const h = askQueue[0]; if (!h) return;
    asking = h;
    $("#ask-title").textContent = h.name;
    $("#ask-text").textContent = t("askText");
    $("#ask-dialog").showModal();
    if ("Notification" in window && Notification.permission === "granted" && state.prefs.notify && document.hidden) {
      try { new Notification(h.name, { body: t("askText"), tag: h.id }); } catch (e) {}
    }
  }
  const closeAsk = () => { asking = null; $("#ask-dialog").close(); setTimeout(pumpAsk, 300); };
  $("#ask-done").onclick = () => { const h = asking; logDone(h, today()); closeAsk(); };
  $("#ask-other").onclick = () => { const h = asking; $("#ask-dialog").close(); asking = null; h.askedOn = today(); save(); openOther(h.id); };
  $("#ask-later").onclick = () => { asking.askedOn = today(); save(); closeAsk(); };
  $("#ask-dialog").addEventListener("cancel", () => { if (asking) { asking.askedOn = today(); save(); asking = null; } });

  // ---- clicks ----
  $("#add").onclick = () => openForm();
  document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { view = b.dataset.view; render(); window.scrollTo(0, 0); }));
  $("#app").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const { act, id, v, d, n } = b.dataset, h = find(id);
    if (act === "done") logDone(h, today());
    else if (act === "other") openOther(id);
    else if (act === "edit") openForm(id);
    else if (act === "accept") { h.every = +n; h.dismissed = null; save(); render(); }
    else if (act === "dismiss") { h.dismissed = +n; save(); render(); }
    else if (act === "day") { calSel = d; render(); }
    else if (act === "unlog") { h.logs = h.logs.filter((x) => x !== d); save(); render(); }
    else if (act === "prevm") { calMonth = calMonth.m ? { y: calMonth.y, m: calMonth.m - 1 } : { y: calMonth.y - 1, m: 11 }; render(); }
    else if (act === "nextm") { calMonth = calMonth.m < 11 ? { y: calMonth.y, m: calMonth.m + 1 } : { y: calMonth.y + 1, m: 0 }; render(); }
    else if (act === "theme") { v === "system" ? delete state.prefs.theme : (state.prefs.theme = v); save(); render(); }
    else if (act === "accent") { state.prefs.accent = v; save(); render(); }
    else if (act === "lang") { state.prefs.lang = v; save(); render(); }
    else if (act === "notify") {
      const r = await Notification.requestPermission();
      state.prefs.notify = r === "granted"; save(); render();
    } else if (act === "export") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
      a.download = `habiloop-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (act === "import") $("#import-file").click();
  });
  $("#app").addEventListener("change", async (e) => {
    if (e.target.id !== "import-file") return;
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || !Array.isArray(s.habits)) throw 0;
      state = {
        prefs: s.prefs && typeof s.prefs === "object" ? s.prefs : {},
        habits: s.habits.filter((h) => h && typeof h.name === "string").map((h) => ({
          id: String(h.id || uid()), name: h.name.slice(0, 60), every: Math.max(1, +h.every || 1), grace: Math.max(0, +h.grace || 0),
          time: /^\d\d:\d\d$/.test(h.time) ? h.time : null, created: /^\d{4}-\d{2}-\d{2}$/.test(h.created) ? h.created : today(),
          start: /^\d{4}-\d{2}-\d{2}$/.test(h.start) ? h.start : today(), askedOn: null, archived: !!h.archived, dismissed: h.dismissed ?? null,
          logs: Array.isArray(h.logs) ? h.logs.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort() : [],
        })),
      };
      save(); render(); toast(t("set.importOk"));
    } catch (err) { toast(t("set.importFail")); }
  });

  render();
  pumpAsk();
  setInterval(pumpAsk, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); pumpAsk(); } });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
