/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

interface ReminderData {
  title: string;
  body: string;
  habitId: string;
  kind: string;
}

self.addEventListener("push", (event) => {
  const data = event.data?.json() as ReminderData | undefined;
  if (!data) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.habitId,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data,
      // Notification actions are supported on Chromium-based browsers.
      ...({ actions: [{ action: "done", title: "Yaptım ✓" }] } as NotificationOptions),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as ReminderData;

  if (event.action === "done") {
    event.waitUntil(
      fetch("/api/complete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ habitId: data.habitId }),
      }),
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => "focus" in w);
      if (existing) return existing.navigate(`/habits/${data.habitId}`).then((w) => w?.focus());
      return self.clients.openWindow(`/habits/${data.habitId}`);
    }),
  );
});
