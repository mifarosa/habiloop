import admin from 'firebase-admin';
import webpush from 'web-push';
import { readConfig } from './config.js';
import { createNotifier } from './notifier.js';
import { fileSentStore } from './sentStore.js';

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

const config = readConfig();
webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const sentStore = fileSentStore(config.dataDir);

const notifier = createNotifier({
  // TTL: a reminder that could not be delivered within 10 minutes is no longer useful.
  send: (sub, payload) => webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys },
    JSON.stringify(payload),
    { TTL: 600, urgency: 'high' },
  ),
  removeSub: (id) => db.collection('pushSubs').doc(id).delete(),
  loadSent: sentStore.load,
  saveSent: sentStore.save,
  maxLateMin: config.maxLateMinutes,
  log,
});

// Keep the subscriptions in memory. Firestore only bills a read when something changes.
let loaded = false;
db.collection('pushSubs').onSnapshot(
  (snap) => {
    snap.docChanges().forEach((c) => notifier.setSub(c.doc.id, c.type === 'removed' ? null : c.doc.data()));
    // Say "connected" only once the list has really loaded, so a bad key never looks like success.
    if (!loaded) {
      loaded = true;
      log(`connected to Firestore: ${notifier.stats().subs} device(s)`);
    }
  },
  (err) => {
    // Exit so the supervisor (systemd / docker) restarts us with a fresh connection.
    log(`listener on "pushSubs" failed: ${err.message}`);
    process.exit(1);
  },
);

const timer = setInterval(() => {
  notifier.tick().catch((err) => log(`tick failed: ${err.message}`));
}, config.tickSeconds * 1000);

log(`habiloop-notifier starting (every ${config.tickSeconds}s, ignores reminders older than ${config.maxLateMinutes} min)`);
setInterval(() => log(`alive: ${notifier.stats().subs} device(s)`), 60 * 60 * 1000).unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`${signal} received, stopping`);
    clearInterval(timer);
    process.exit(0);
  });
}
