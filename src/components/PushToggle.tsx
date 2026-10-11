"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export function PushToggle() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"));
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setState("denied");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });
    await fetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) });
    setState("on");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  switch (state) {
    case "loading":
      return <p className="text-sm text-muted">…</p>;
    case "unsupported":
      return (
        <p className="text-sm text-muted">
          Bu tarayıcı bildirim desteklemiyor. iPhone&apos;da önce Paylaş → &quot;Ana Ekrana Ekle&quot; ile uygulamayı kur.
        </p>
      );
    case "denied":
      return <p className="text-sm text-bad">Bildirim izni reddedilmiş. Tarayıcı ayarlarından izin ver.</p>;
    case "off":
      return (
        <button className="btn-primary" onClick={enable}>
          Bildirimleri aç
        </button>
      );
    case "on":
      return (
        <button className="btn-ghost" onClick={disable}>
          Bildirimler açık ✓ (kapat)
        </button>
      );
  }
}
