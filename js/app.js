(() => {
  const KEY = "habiloop.v2";
  const ACCENTS = { moss: "#3d6a4d", ink: "#2c4a7a", plum: "#7a3b69", clay: "#b2562f", slate: "#44505a" };
  const S = Schedule;
  const $ = (s, r = document) => r.querySelector(s);

  let state = load();
  let view = "habits", detailId = null, editingId = null;
  let asking = null, calMonth = null, calSel = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.habits)) return { habits: s.habits, prefs: s.prefs || {}, tombstones: s.tombstones || {} };
    } catch (e) {}
    return { habits: [], prefs: {}, tombstones: {} };
  }

  // What sync compares: the habit's own fields (not the local "asked today" flags).
  const pack = (h) => ({ name: h.name, every: h.every, grace: h.grace, time: h.time || null, start: h.start, created: h.created, logs: h.logs, archived: !!h.archived, dismissed: h.dismissed ?? null });
  const sigs = {};
  const syncListeners = [];
  state.habits.forEach((h) => { if (!h.updatedAt) h.updatedAt = Date.now(); sigs[h.id] = JSON.stringify(pack(h)); });
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  // Stamps habits that changed since the last save, records deletions, and tells sync what to send.
  function save() {
    const now = Date.now(), changed = [];
    for (const h of state.habits) {
      const sig = JSON.stringify(pack(h));
      if (sigs[h.id] !== sig) { sigs[h.id] = sig; h.updatedAt = now; delete state.tombstones[h.id]; changed.push(h.id); }
    }
    for (const id of Object.keys(sigs)) {
      if (!state.habits.some((h) => h.id === id)) { delete sigs[id]; state.tombstones[id] = now; changed.push(id); }
    }
    persist();
    if (changed.length) { syncListeners.forEach((fn) => fn(changed)); publishPush(); }
  }
  const dateOk = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  function normalize(d, L) {
    if (!d || typeof d.name !== "string") return null;
    return {
      id: String(d.id), updatedAt: d.updatedAt || Date.now(), name: d.name.slice(0, 60), every: Math.max(1, +d.every || 1), grace: Math.max(0, +d.grace || 0),
      time: /^\d\d:\d\d$/.test(d.time) ? d.time : null, created: dateOk(d.created) ? d.created : Schedule.todayStr(), start: dateOk(d.start) ? d.start : Schedule.todayStr(),
      archived: !!d.archived, dismissed: d.dismissed ?? null, logs: Array.isArray(d.logs) ? d.logs.filter(dateOk).sort() : [],
      askedOn: L ? L.askedOn : null, notifiedOn: L ? L.notifiedOn : null,
    };
  }

  const lang = () => state.prefs.lang || ((navigator.language || "tr").startsWith("tr") ? "tr" : "en");
  const t = (k, v = {}) => String(I18N[lang()][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x]);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => S.todayStr();
  const fmt = (d) => new Date(S.num(d) * S.DAY).toLocaleDateString(lang(), { day: "numeric", month: "short", timeZone: "UTC" });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const find = (id) => state.habits.find((h) => h.id === id);
  const defTime = () => state.prefs.defTime || "09:00";
  const hasNotif = () => "Notification" in window;
  const notifOn = () => hasNotif() && Notification.permission === "granted" && !!state.prefs.notify;

  function toast(msg) {
    const n = $("#toast"); n.textContent = msg; n.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (n.hidden = true), 2200);
  }

  function applyPrefs() {
    const r = document.documentElement, p = state.prefs;
    p.theme === "light" || p.theme === "dark" ? r.setAttribute("data-theme", p.theme) : r.removeAttribute("data-theme");
    r.setAttribute("data-accent", ACCENTS[p.accent] ? p.accent : "moss");
    r.lang = lang();
  }
  function translateStatic() {
    document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
    document.querySelectorAll("[data-i18n-ph]").forEach((n) => n.setAttribute("placeholder", t(n.dataset.i18nPh)));
  }

  // ---- pieces ----
  function statusText(st) {
    if (st.state === "ok") return st.toIdeal === 1 ? t("st.ok1") : t("st.ok", { n: st.toIdeal });
    if (st.state === "ideal") return st.toIdeal === 0 ? t("st.ideal") : t("st.idealPast", { n: -st.toIdeal });
    if (st.state === "last") return t("st.last");
    return t("st.late", { n: -st.toDeadline });
  }
  function ring(st) {
    const C = 2 * Math.PI * 20, len = Math.max(0.04, st.frac) * C;
    const label = st.state === "ok" ? st.toIdeal : st.state === "late" ? "+" + -st.toDeadline : "!";
    return `<svg class="ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="tr" cx="24" cy="24" r="20"/><circle class="pr" cx="24" cy="24" r="20" stroke-dasharray="${len} ${C}"/><text x="24" y="25">${label}</text></svg>`;
  }
  const rule = (h) => (h.grace ? t("ruleGrace", { n: h.every, g: h.grace }) : t("rule", { n: h.every }));

  function row(h, st) {
    const due = st.state !== "ok";
    return `<div class="row s-${st.state}" role="button" tabindex="0" data-act="open" data-id="${h.id}">
      ${ring(st)}
      <div class="txt"><b>${esc(h.name)}</b><span>${statusText(st)}</span>${S.suggest(h) ? ` <span class="m">· ${t("hasSuggest")}</span>` : ""}</div>
      ${due ? `<button class="go" data-act="done" data-id="${h.id}">${t("done")}</button>` : ""}</div>`;
  }

  const coffee = () => `<div class="coffee"><p>${t("coffee.text")}</p><a href="https://buymeacoffee.com/mifarosa" target="_blank" rel="noopener noreferrer">☕ ${t("coffee.button")}</a></div>`;

  // ---- views ----
  function renderHabits() {
    const items = state.habits.filter((h) => !h.archived).map((h) => ({ h, st: S.status(h, today()) }));
    const due = items.filter((x) => x.st.state !== "ok").sort((a, b) => a.st.deadline - b.st.deadline);
    const soon = items.filter((x) => x.st.state === "ok").sort((a, b) => a.st.ideal - b.st.ideal);
    $("#title").textContent = new Date().toLocaleDateString(lang(), { day: "numeric", month: "long" });
    let html = `<p class="sub">${!items.length ? t("sub.none") : due.length ? t("sub.due", { n: due.length }) : t("sub.clear")}</p>`;
    if (!items.length) html += `<div class="list empty"><h2>${t("empty.title")}</h2><p>${t("empty.text")}</p></div>`;
    if (due.length) html += `<h3 class="sec">${t("sec.due")}</h3><div class="list">${due.map((x) => row(x.h, x.st)).join("")}</div>`;
    if (soon.length) html += `<h3 class="sec">${t("sec.soon")}</h3><div class="list">${soon.map((x) => row(x.h, x.st)).join("")}</div>`;
    return html + coffee();
  }

  function renderCalendar() {
    const now = new Date();
    if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
    if (!calSel) calSel = today();
    const first = Date.UTC(calMonth.y, calMonth.m, 1), count = new Date(Date.UTC(calMonth.y, calMonth.m + 1, 0)).getUTCDate();
    const lead = (new Date(first).getUTCDay() + 6) % 7;
    $("#title").textContent = t("title.calendar");
    const mt = new Date(first).toLocaleDateString(lang(), { month: "long", year: "numeric", timeZone: "UTC" });
    let cells = I18N[lang()].days.map((d) => `<span class="h">${d}</span>`).join("") + "<span></span>".repeat(lead);
    for (let d = 1; d <= count; d++) {
      const ds = S.str(Math.floor(first / S.DAY) + d - 1), n = state.habits.filter((h) => h.logs.includes(ds)).length;
      cells += `<button class="cd${ds === calSel ? " sel" : ""}${ds === today() ? " today" : ""}" data-act="day" data-d="${ds}" ${ds > today() ? "disabled" : ""}>${d}<span class="dots">${"<i></i>".repeat(Math.min(n, 3))}</span></button>`;
    }
    const done = state.habits.filter((h) => h.logs.includes(calSel));
    return `<div class="calnav"><button data-act="prevm" aria-label="‹">‹</button><strong>${mt}</strong><button data-act="nextm" aria-label="›">›</button></div>
      <div class="cal">${cells}</div><h3 class="sec">${fmt(calSel)}</h3>
      ${done.length ? `<div class="list">${done.map((h) => `<div class="entry"><span>${esc(h.name)}</span><button class="linkbtn danger" data-act="unlog" data-id="${h.id}" data-d="${calSel}">${t("cal.remove")}</button></div>`).join("")}</div>` : `<p class="muted">${t("cal.none")}</p>`}`;
  }

  function renderSettings() {
    const p = state.prefs, theme = p.theme || "system", accent = ACCENTS[p.accent] ? p.accent : "moss";
    $("#title").textContent = t("title.settings");
    const seg = (items, cur, act) => `<div class="seg">${items.map(([v, l]) => `<button class="${cur === v ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
    let notif;
    if (!hasNotif()) notif = `<div class="srow"><span>${t("set.notifUnsupported")}</span></div>`;
    else {
      const blocked = Notification.permission === "denied";
      notif = `<div class="srow"><span>${t("set.notif")}<small>${blocked ? t("set.notifBlocked") : t("set.notifSub")}</small></span>
        <label class="sw"><input type="checkbox" data-act="notify" ${notifOn() ? "checked" : ""} ${blocked ? "disabled" : ""}><i></i></label></div>
        <div class="srow"><span>${t("set.defTime")}</span><input type="time" data-act="deftime" value="${defTime()}"></div>
        <div class="srow"><span>${t("set.test")}</span><button class="linkbtn" data-act="test" ${notifOn() ? "" : "disabled"}>›</button></div>`;
    }
    const serverPush = window.HABILOOP_VAPID && syncView.state === "on" && "PushManager" in window
      ? `<div class="srow"><span>${t("push.server")}<small>${t("push.serverSub")}</small></span>
          <label class="sw"><input type="checkbox" data-act="pushserver" ${pushOn ? "checked" : ""}><i></i></label></div>
        ${pushOn ? `<div class="srow"><span>${t("push.test")}</span><button class="linkbtn" data-act="pushtest">›</button></div>` : ""}` : "";
    return `<div class="group"><h3>${t("g.look")}</h3><div class="list">
        <div class="srow"><span>${t("set.theme")}</span>${seg([["system", t("set.system")], ["light", t("set.light")], ["dark", t("set.dark")]], theme, "theme")}</div>
        <div class="srow"><span>${t("set.accent")}</span><div class="swatches">${Object.keys(ACCENTS).map((a) => `<button class="sw-${a}${accent === a ? " on" : ""}" data-act="accent" data-v="${a}" aria-label="${a}"></button>`).join("")}</div></div>
        <div class="srow"><span>${t("set.lang")}</span>${seg([["tr", "Türkçe"], ["en", "English"]], lang(), "lang")}</div></div></div>
      ${syncGroup()}
      <div class="group"><h3>${t("g.notif")}</h3><div class="list">${serverPush}${notif}</div><p class="hint gap">${t("set.notifNote")}</p></div>
      <div class="group"><h3>${t("g.data")}</h3><div class="list">
        <div class="srow"><span>${t("set.export")}</span><button class="linkbtn" data-act="export">›</button></div>
        <div class="srow"><span>${t("set.import")}</span><button class="linkbtn" data-act="import">›</button></div>
        <div class="srow"><span>${t("set.wipe")}</span><button class="linkbtn danger" data-act="wipe">›</button></div></div>
        <p class="hint gap">${t("set.privacy")}</p><input id="import-file" type="file" accept="application/json" hidden></div>
      <div class="group"><h3>${t("g.about")}</h3>${coffee()}</div>`;
  }

  function render() {
    applyPrefs(); translateStatic();
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#add").hidden = view !== "habits";
    if (view === "settings" && syncConfigured() && !syncPromise) loadSync().catch(() => {}); // loaded early so the Google popup is not blocked
    $("#app").innerHTML = view === "habits" ? renderHabits() : view === "calendar" ? renderCalendar() : renderSettings();
    if ($("#detail-dialog").open) renderDetail();
  }

  // ---- detail sheet ----
  function openDetail(id) { detailId = id; renderDetail(); if (!$("#detail-dialog").open) $("#detail-dialog").showModal(); }
  function renderDetail() {
    const h = find(detailId);
    if (!h) { $("#detail-dialog").close(); return; }
    const st = S.status(h, today()), rate = S.onTime(h), sug = S.suggest(h);
    $("#detail").innerHTML = `<div class="s-${st.state}">
      <div class="dhead">${ring(st)}<div><h2>${esc(h.name)}</h2><div class="dstate">${statusText(st)}</div><small>${rule(h)}${h.time ? " · " + h.time : ""}</small></div></div>
      <div class="facts">
        <div class="fact"><b>${h.logs.length ? fmt(h.logs[h.logs.length - 1]) : t("never")}</b><span>${t("f.last")}</span></div>
        <div class="fact"><b>${rate ? Math.round(rate.rate * 100) + "% (" + rate.ok + "/" + rate.cycles + ")" : t("rateNone")}</b><span>${t("f.rate")}</span></div>
        <div class="fact"><b>${fmt(S.str(st.ideal))}</b><span>${t("f.next")}</span></div>
        <div class="fact"><b>${fmt(S.str(st.deadline))}</b><span>${t("f.final")}</span></div></div>
      ${sug ? `<div class="suggest"><span>${t("suggest", { n: sug })}</span><div class="btnrow"><button class="btn solid" data-act="accept" data-id="${h.id}" data-n="${sug}">${t("change")}</button><button class="btn" data-act="dismiss" data-id="${h.id}" data-n="${sug}">${t("dismiss")}</button></div></div>` : ""}
      <div class="btnrow"><button class="btn solid" data-act="done" data-id="${h.id}">${t("done")}</button><button class="btn" data-act="other" data-id="${h.id}">${t("other")}</button></div>
      <div class="foot"><button class="btn danger" data-act="del" data-id="${h.id}">${t("delete")}</button><span>
        <button class="btn quiet" data-act="edit" data-id="${h.id}">${t("edit")}</button><button class="btn quiet" data-close>${t("close")}</button></span></div></div>`;
  }

  // In-app confirmation (the browser's confirm() is blocked in some webviews and installed apps).
  function confirmAction(text) {
    return new Promise((resolve) => {
      const d = $("#confirm-dialog");
      $("#confirm-text").textContent = text;
      const finish = (v) => { d.close(); resolve(v); };
      $("#confirm-yes").onclick = () => finish(true);
      $("#confirm-no").onclick = () => finish(false);
      d.oncancel = () => resolve(false);
      d.showModal();
    });
  }

  async function removeHabit(id) {
    const h = find(id); if (!h) return;
    if (!(await confirmAction(t("confirmDelete", { n: h.name })))) return;
    state.habits = state.habits.filter((x) => x.id !== id);
    save(); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); render(); toast(t("deleted"));
  }

  // ---- logging ----
  function logDone(h, date) { S.addLog(h, date); h.askedOn = today(); save(); render(); toast(t("logged")); }
  function openOther(id) {
    const list = $("#other-list"); list.replaceChildren();
    for (let i = 0; i < 14; i++) {
      const d = S.str(S.num(today()) - i), b = document.createElement("button");
      b.type = "button"; b.className = "btn"; b.textContent = (i === 0 ? t("today") + " · " : i === 1 ? t("yesterday") + " · " : "") + fmt(d);
      b.onclick = () => { $("#other-dialog").close(); logDone(find(id), d); };
      list.append(b);
    }
    $("#other-dialog").showModal();
  }

  // ---- editor ----
  function updateHint() {
    const n = Math.max(1, parseInt($("#f-every").value) || 1), g = Math.max(0, parseInt($("#f-grace").value) || 0);
    $("#f-hint").textContent = g ? t("hint", { n, g }) : t("hint0", { n });
  }
  function openForm(id) {
    editingId = id || null;
    const h = find(id);
    $("#form-title").textContent = t(h ? "editTitle" : "newTitle");
    $("#f-name").value = h ? h.name : "";
    $("#f-every").value = h ? h.every : 3; $("#f-grace").value = h ? h.grace : 1;
    $("#f-time").value = h ? h.time || "" : defTime();
    $("#f-last").value = ""; $("#f-last").max = today();
    $("#f-last-wrap").hidden = !!h; $("#f-history-wrap").hidden = !h;
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
    updateHint();
    $("#form-dialog").showModal();
  }
  $("#f-every").oninput = $("#f-grace").oninput = updateHint;
  $("#form").onsubmit = () => {
    const name = $("#f-name").value.trim(); if (!name) return;
    const data = { name, every: Math.max(1, parseInt($("#f-every").value) || 1), grace: Math.max(0, parseInt($("#f-grace").value) || 0), time: $("#f-time").value || null };
    const h = find(editingId);
    if (h) { if (data.every !== h.every) h.dismissed = null; Object.assign(h, data); }
    else {
      const nh = { id: uid(), created: today(), start: today(), logs: [], askedOn: null, notifiedOn: null, archived: false, ...data };
      const last = $("#f-last").value;
      if (last && last <= today()) S.addLog(nh, last);
      state.habits.push(nh);
    }
    save(); render();
  };
  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) e.target.closest("dialog").close();
    else if (e.target.tagName === "DIALOG") {
      // Only the dim backdrop closes it, not clicks on the sheet's own padding.
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });

  // ---- server push: the list of reminders this device hands to the home server ----
  let pushOn = false, pushTimer = null;
  const pushJobsFor = (h) => {
    const time = h.time || defTime(), now = Date.now(), jobs = [];
    for (const r of S.reminders(h)) {
      const when = S.at(r.day, time);
      if (when < now - 45 * 60000) continue; // the server drops anything later than that anyway
      jobs.push({
        key: `${h.id}|${r.day}|${r.stage}`, at: when, id: h.id, name: h.name, tag: "habiloop-" + h.id, act: t("notif.done"),
        title: h.name, body: r.stage === "late" ? t("st.late", { n: r.late }) : t(r.stage === "last" ? "st.last" : "st.ideal"),
      });
    }
    return jobs;
  };
  function buildJobs() {
    return state.habits.flatMap(pushJobsFor).sort((x, y) => x.at - y.at).slice(0, 80);
  }
  // Called after any change (and when the app is opened): keeps the server's list current.
  function publishPush() {
    if (!pushOn) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { loadSync().then((c) => c.push.publish(buildJobs())).catch(() => {}); }, 800);
  }

  // A readable reason for a failed push action; the raw error stays in the console.
  function pushErrText(e) {
    const code = String((e && (e.code || e.name)) || ""), msg = String((e && e.message) || "");
    if (code.includes("permission-denied")) return t("push.errRules");
    if (code === "NotAllowedError") return t("push.denied");
    if (msg.includes("service worker")) return t("push.errSw");
    if (code === "AbortError" || /push service|registration failed/i.test(msg)) return t("push.errService");
    if (code.includes("unavailable") || !navigator.onLine) return t("sync.unreachable");
    return t("push.err") + " (" + (code || msg).slice(0, 60) + ")";
  }

  // ---- sync (optional; js/sync.js holds the Firebase logic and is loaded on demand) ----
  const SYNC_KEY = "habiloop.sync";
  let syncView = { state: "off" }, syncPromise = null;
  const syncConfigured = () => !!(window.HABILOOP_FIREBASE && window.HABILOOP_FIREBASE.apiKey);
  const syncEnabled = () => { try { return localStorage.getItem(SYNC_KEY) === "1"; } catch (e) { return false; } };
  function setSyncEnabled(on) { try { on ? localStorage.setItem(SYNC_KEY, "1") : localStorage.removeItem(SYNC_KEY); } catch (e) {} }
  function setSyncView(v) {
    syncView = v;
    if (v.state === "on" && syncPromise) {
      syncPromise.then((c) => c.push.isOn()).then((on) => { pushOn = on; if (on) publishPush(); if (view === "settings") render(); }).catch(() => {});
    } else if (v.state !== "on") pushOn = false;
    if (view === "settings") render();
  }

  function askPassword({ mode, email, submit }) {
    return new Promise((resolve) => {
      const d = $("#pw-dialog"), create = mode !== "unlock"; // "create" and "change" ask for the password twice
      $("#pw-title").textContent = t(mode === "change" ? "pw.changeTitle" : create ? "pw.createTitle" : "pw.unlockTitle");
      $("#pw-text").textContent = t(mode === "change" ? "pw.changeText" : create ? "pw.createText" : "pw.unlockText") + " (" + email + ")";
      $("#pw-1").value = ""; $("#pw-2").value = ""; $("#pw-err").textContent = "";
      $("#pw-2-wrap").hidden = !create; $("#pw-forgot").hidden = create;
      const go = $("#pw-ok");
      $("#pw-form").onsubmit = async (e) => {
        e.preventDefault();
        const pw = $("#pw-1").value, err = $("#pw-err");
        err.textContent = "";
        if (pw.length < 8) { err.textContent = t("pw.short"); return; }
        if (create && pw !== $("#pw-2").value) { err.textContent = t("pw.mismatch"); return; }
        go.disabled = true;
        try {
          if (await submit(pw)) { d.close(); resolve("ok"); } else err.textContent = t("pw.wrong");
        } catch (e2) { err.textContent = t("sync.error"); }
        go.disabled = false;
      };
      $("#pw-forgot").onclick = () => { d.close(); resolve("forgot"); };
      $("#pw-cancel").onclick = () => { d.close(); resolve("cancel"); };
      d.oncancel = () => resolve("cancel");
      d.showModal();
      $("#pw-1").focus();
    });
  }

  const syncStore = {
    getHabits: () => state.habits, getTombstones: () => state.tombstones, normalize, pack,
    applyRemote(habits, tombstones) {
      state.habits = habits; state.tombstones = tombstones;
      for (const k of Object.keys(sigs)) delete sigs[k];
      habits.forEach((h) => (sigs[h.id] = JSON.stringify(pack(h))));
      persist(); render();
    },
    onLocalChange: (fn) => syncListeners.push(fn),
    lang, pushJobs: () => buildJobs(), setSyncView, setSyncEnabled, toast: (k) => toast(t(k)), confirm: (k) => confirmAction(t(k)), askPassword,
  };
  function loadSync() {
    if (!syncPromise) {
      syncPromise = import("./sync.js").then((m) => m.start(syncStore)).catch((e) => {
        syncPromise = null; setSyncView({ state: "error", message: "sync.loadFailed" }); throw e;
      });
    }
    return syncPromise;
  }
  const runSync = (method) => loadSync().then((c) => c[method]()).catch(() => {});

  function syncGroup() {
    if (!syncConfigured()) return "";
    const v = syncView, btn = (act, label, cls = "") => `<button class="linkbtn ${cls}" data-act="${act}">${label}</button>`;
    let text, actions = "";
    if (v.state === "connecting") text = t("sync.connecting");
    else if (v.state === "locked") { text = t("sync.lockedText", { e: v.email }); actions = btn("sync-unlock", t("sync.unlock")) + btn("sync-signout", t("sync.signout"), "danger"); }
    else if (v.state === "on") { text = t("sync.onText", { e: v.email }) + " · " + t(v.status === "offline" ? "sync.offline" : v.status === "pending" ? "sync.pending" : "sync.synced"); actions = btn("sync-changepw", t("sync.changePw")) + btn("sync-signout", t("sync.signout"), "danger"); }
    else if (v.state === "error") { text = t(v.message || "sync.error"); actions = btn("sync-retry", t("sync.retry")) + (v.email ? btn("sync-signout", t("sync.signout"), "danger") : ""); }
    else { text = t("sync.offText"); actions = btn("sync-signin", t("sync.signin")); }
    return `<div class="group"><h3>${t("g.account")}</h3><div class="list"><div class="srow"><span>${text}</span></div>${actions ? `<div class="srow">${actions}</div>` : ""}</div></div>`;
  }

  // ---- notifications ----
  async function showNotification(title, body, id) {
    const opts = { body, tag: id || "habiloop", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { id: id || null }, actions: id ? [{ action: "done", title: t("notif.done") }] : [] };
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
    } catch (err) {
      try { delete opts.actions; new Notification(title, opts); } catch (e) {}
    }
  }

  // ---- "it's time" prompt ----
  function pumpAsk() {
    const now = new Date();
    if (pushOn) return; // the home server sends the reminders
    if (notifOn() && document.hidden) {
      state.habits.filter((h) => S.shouldAsk({ ...h, askedOn: h.notifiedOn }, now)).forEach((h) => {
        h.notifiedOn = today(); save(); showNotification(h.name, t("askText"), h.id);
      });
      return;
    }
    if (asking || $("dialog[open]")) return;
    const h = state.habits.find((x) => S.shouldAsk(x, now)); if (!h) return;
    asking = h;
    $("#ask-title").textContent = h.name; $("#ask-text").textContent = t("askText");
    $("#ask-dialog").showModal();
  }
  const closeAsk = () => { asking = null; $("#ask-dialog").close(); setTimeout(pumpAsk, 300); };
  $("#ask-done").onclick = () => { const h = asking; logDone(h, today()); closeAsk(); };
  $("#ask-other").onclick = () => { const h = asking; h.askedOn = today(); save(); asking = null; $("#ask-dialog").close(); openOther(h.id); };
  $("#ask-later").onclick = () => { asking.askedOn = today(); save(); closeAsk(); };
  $("#ask-dialog").addEventListener("cancel", () => { if (asking) { asking.askedOn = today(); save(); asking = null; } });

  // ---- clicks ----
  $("#add").onclick = () => openForm();
  document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { view = b.dataset.view; render(); window.scrollTo(0, 0); }));

  async function handle(b) {
    const { act, id, v, d, n } = b.dataset, h = find(id);
    if (act === "open") openDetail(id);
    else if (act === "done") { logDone(h, today()); }
    else if (act === "other") openOther(id);
    else if (act === "edit") { $("#detail-dialog").close(); openForm(id); }
    else if (act === "del") removeHabit(id);
    else if (act === "accept") { h.every = +n; h.dismissed = null; save(); render(); }
    else if (act === "dismiss") { h.dismissed = +n; save(); render(); }
    else if (act === "day") { calSel = d; render(); }
    else if (act === "unlog") { h.logs = h.logs.filter((x) => x !== d); save(); render(); }
    else if (act === "prevm") { calMonth = calMonth.m ? { y: calMonth.y, m: calMonth.m - 1 } : { y: calMonth.y - 1, m: 11 }; render(); }
    else if (act === "nextm") { calMonth = calMonth.m < 11 ? { y: calMonth.y, m: calMonth.m + 1 } : { y: calMonth.y + 1, m: 0 }; render(); }
    else if (act === "theme") { v === "system" ? delete state.prefs.theme : (state.prefs.theme = v); save(); render(); }
    else if (act === "accent") { state.prefs.accent = v; save(); render(); }
    else if (act === "lang") { state.prefs.lang = v; save(); render(); }
    else if (act === "pushtest") {
      try { await (await loadSync()).push.test(); toast(t("push.testSent")); } catch (e) { console.error(e); toast(pushErrText(e)); }
    }
    else if (act === "sync-signin") runSync("signIn");
    else if (act === "sync-unlock") runSync("unlock");
    else if (act === "sync-signout") runSync("signOut");
    else if (act === "sync-changepw") runSync("changePassword");
    else if (act === "sync-retry") runSync("retry");
    else if (act === "test") showNotification(t("test.title"), t("test.body"));
    else if (act === "export") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
      a.download = `habiloop-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (act === "import") $("#import-file").click();
    else if (act === "wipe") {
      if (!(await confirmAction(t("set.wipeConfirm")))) return;
      state.habits = []; save(); render(); toast(t("deleted"));
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.matches("input")) return;
    if (b.dataset.act === "open" && e.target.closest("button.go")) return; // the pill handles itself
    e.stopPropagation(); handle(b);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[data-act="open"]')) { e.preventDefault(); handle(e.target); }
  });
  document.addEventListener("change", async (e) => {
    const el = e.target, act = el.dataset && el.dataset.act;
    if (act === "pushserver") {
      try {
        const c = await loadSync();
        if (el.checked) {
          const r = await c.push.enable();
          pushOn = r === "on";
          if (r === "denied") toast(t("push.denied"));
        } else { await c.push.disable(); pushOn = false; }
      } catch (e) { console.error(e); pushOn = false; toast(pushErrText(e)); }
      render();
    } else if (act === "notify") {
      if (el.checked) {
        const r = await Notification.requestPermission();
        state.prefs.notify = r === "granted";
      } else state.prefs.notify = false;
      save(); render();
    } else if (act === "deftime") { state.prefs.defTime = el.value || "09:00"; save(); }
    else if (el.id === "import-file") {
      const f = el.files[0]; if (!f) return;
      try {
        const s = JSON.parse(await f.text());
        if (!s || !Array.isArray(s.habits)) throw 0;
        const habits = s.habits.map((h) => normalize({ ...h, id: h.id || uid(), updatedAt: Date.now() })).filter(Boolean);
        const prefs = s.prefs && typeof s.prefs === "object" ? s.prefs : {};
        state.habits = []; save(); // tombstones for the old habits, so sync removes them too
        state.prefs = prefs; state.habits = habits;
        save(); render(); toast(t("set.importOk"));
      } catch (err) { toast(t("set.importFail")); }
    }
  });

  // A tap on a notification (or its "Done" action) arrives as ?done=<id> or as a message from the service worker.
  function markDoneFromNotification(id) {
    const h = find(id); if (!h) return;
    S.addLog(h, today()); h.askedOn = today(); save(); render(); toast(t("logged"));
  }
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("done")) { markDoneFromNotification(q.get("done")); history.replaceState(null, "", location.pathname); }
  } catch (e) {}
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.done) markDoneFromNotification(e.data.done); });
    // A new service worker takes over after an update: reload once so the new files show up right away.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return; // first install: nothing stale to replace
      reloaded = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  render();
  if (syncConfigured() && syncEnabled()) { setSyncView({ state: "connecting" }); loadSync().catch(() => {}); }
  pumpAsk();
  setInterval(pumpAsk, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); pumpAsk(); publishPush(); } });
})();
