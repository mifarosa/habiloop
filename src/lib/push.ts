import webpush from "web-push";
import { serverEnv, vapidPublicKey } from "./env";

let configured = false;

function configure() {
  if (configured) return;
  webpush.setVapidDetails(serverEnv("VAPID_SUBJECT"), vapidPublicKey(), serverEnv("VAPID_PRIVATE_KEY"));
  configured = true;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends a push message. Returns false when the subscription is gone and should be deleted. */
export async function sendPush(sub: StoredSubscription, payload: object): Promise<boolean> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return false;
    throw e;
  }
}
