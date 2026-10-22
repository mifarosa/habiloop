// Bump this version whenever any cached file changes, so clients pick up the update.
const CACHE = "habiloop-v24";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/theme-init.js",
  "./js/i18n.js",
  "./js/schedule.js",
  "./js/app.js",
  "./js/sync.js",
  "./js/sync-core.js",
  "./js/firebase-config.js",
  "./js/push-config.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).catch(() => caches.match("./index.html")))
  );
});

// Tapping a notification opens the app; its "Done" action logs today's entry (the app handles ?done=<id>).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.id;
  const done = event.action === "done" && id;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if (win) {
        if (done) win.postMessage({ done: id });
        return win.focus();
      }
      return self.clients.openWindow(done ? "./?done=" + encodeURIComponent(id) : "./");
    })
  );
});

// Server push (see server/): shows the reminder the home server sent, even when the app is closed.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(d.title || "Habiloop", {
      body: d.body || "",
      tag: d.tag || "habiloop",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { id: d.id || null },
      actions: d.id && d.act ? [{ action: "done", title: d.act }] : [],
    })
  );
});
