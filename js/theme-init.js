// Applies the saved theme before first paint so a dark phone never flashes light.
try {
  var p = JSON.parse(localStorage.getItem("habiloop.v2")).prefs;
  if (p && /^(light|dark)$/.test(p.theme)) document.documentElement.setAttribute("data-theme", p.theme);
  if (p && /^(teal|blue|purple|rose|orange)$/.test(p.accent)) document.documentElement.setAttribute("data-accent", p.accent);
} catch (e) {}
