// Optional sync: Google sign-in through Firebase Auth, habits stored in Firestore, encrypted on the
// device first (see sync-core.js). Loaded by js/app.js only after the user turns sync on.
//
// Firestore layout (rules in firestore.rules):
//   users/{uid}               { v, salt, iter, check }        key parameters
//   users/{uid}/items/{id}    { iv, ct, updatedAt, deleted }  one per habit

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache,
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  PBKDF2_ITERATIONS, deriveKey, encryptJSON, decryptJSON, makeCheck, verifyCheck, randomBytes, toB64, fromB64, reconcile,
} from "./sync-core.js";

// Public by design: access is controlled by sign-in and firestore.rules. Filled in js/firebase-config.js.
const firebaseConfig = window.HABILOOP_FIREBASE;

const SIGNIN_FLAG = "habiloop.signingIn"; // survives the redirect so the password prompt follows
const PUSH_DELAY = 400;
const BATCH_LIMIT = 400;

// ---------------------------------------------------------------------------
// Key storage: the derived key stays on the device (IndexedDB) so the password
// is asked once per device, not on every visit.
// ---------------------------------------------------------------------------
function keyStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("habiloop-sync", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("keys", mode);
      const req = fn(tx.objectStore("keys"));
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const loadKey = (uid) => keyStore("readonly", (s) => s.get(uid)).catch(() => null);
const saveKey = (uid, entry) => keyStore("readwrite", (s) => s.put(entry, uid)).catch(() => {});
const forgetKey = (uid) => keyStore("readwrite", (s) => s.delete(uid)).catch(() => {});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export function start(store) {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    store.setSyncView({ state: "error", message: "sync.notConfigured" });
    return { signIn() {}, unlock() {}, signOut() {}, retry() {} };
  }
  if (!window.isSecureContext || !crypto.subtle) {
    store.setSyncView({ state: "error", message: "sync.needsHttps" });
    return { signIn() {}, unlock() {}, signOut() {}, retry() { location.reload(); } };
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache(),
      experimentalAutoDetectLongPolling: true, // falls back when a proxy or blocker cuts the streaming channel
    });
  } catch (_) {
    db = getFirestore(app); // e.g. private browsing without IndexedDB: memory cache
  }

  let user = null;
  let key = null; // { key: CryptoKey, salt: string }
  let signingIn = false;
  let unsubscribers = [];
  let remote = new Map();
  let ready = false; // true once the first cloud snapshot has been merged
  const pending = new Set();
  let pushTimer = null;
  let queue = Promise.resolve(); // snapshots are handled one at a time

  const email = () => (user && user.email) || "";
  const itemsRef = () => collection(db, "users", user.uid, "items");
  const metaRef = () => doc(db, "users", user.uid);

  // First read of the key document. Waits for the server's answer instead of failing straight away
  // with "client is offline" while the connection is still being set up.
  function readMeta(timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); off(); fn(v); };
      const timer = setTimeout(() => finish(reject, Object.assign(new Error("server unreachable"), { code: "unavailable" })), timeoutMs);
      const off = onSnapshot(metaRef(), { includeMetadataChanges: true },
        (snap) => { if (!snap.metadata.fromCache || snap.exists()) finish(resolve, snap); },
        (err) => finish(reject, err));
    });
  }

  function stop() {
    unsubscribers.forEach((u) => u());
    unsubscribers = [];
    remote = new Map();
    ready = false;
    pending.clear();
    clearTimeout(pushTimer);
  }

  function fail(err, message) {
    console.error(err);
    store.setSyncView({ state: "error", email: email(), message });
  }

  store.onLocalChange((ids) => {
    if (!ready) return;
    ids.forEach((id) => pending.add(id));
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, PUSH_DELAY);
  });

  onAuthStateChanged(auth, async (next) => {
    stop();
    user = next;
    key = null;
    if (!user) {
      store.setSyncEnabled(false);
      if (!signingIn) store.setSyncView({ state: "off" });
      return;
    }
    store.setSyncEnabled(true);
    const saved = await loadKey(user.uid);
    if (saved && saved.key) {
      key = saved;
      begin();
    } else {
      store.setSyncView({ state: "locked", email: email() });
      let back = false;
      try { back = sessionStorage.getItem(SIGNIN_FLAG) === "1"; sessionStorage.removeItem(SIGNIN_FLAG); } catch (_) {}
      if (signingIn || back) {
        signingIn = false;
        unlock();
      }
    }
  });

  // -------------------------------------------------------------------------
  // Sign-in and password
  // -------------------------------------------------------------------------
  async function signIn() {
    signingIn = true;
    store.setSyncView({ state: "connecting" });
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = err && err.code;
      if (code === "auth/operation-not-supported-in-this-environment" || code === "auth/popup-blocked") {
        // Installed apps and some browsers block popups: fall back to a full-page redirect.
        store.setSyncEnabled(true); // so the page loads sync again when it comes back
        try { sessionStorage.setItem(SIGNIN_FLAG, "1"); } catch (_) {}
        await signInWithRedirect(auth, provider);
        return;
      }
      signingIn = false;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        store.setSyncView({ state: "off" });
      } else {
        fail(err, code === "auth/popup-blocked" ? "sync.popupBlocked" : "sync.signInFailed");
      }
    }
  }

  async function unlock() {
    if (!user) return signIn();
    let meta;
    try {
      meta = await readMeta();
    } catch (err) {
      return fail(err, err && err.code === "permission-denied" ? "sync.rulesDenied" : "sync.unreachable");
    }
    const uid = user.uid;
    let result;

    if (!meta.exists()) {
      result = await store.askPassword({
        mode: "create",
        email: email(),
        submit: async (pw) => {
          const salt = toB64(randomBytes(16));
          const k = await deriveKey(pw, fromB64(salt), PBKDF2_ITERATIONS);
          await setDoc(metaRef(), { v: 1, salt, iter: PBKDF2_ITERATIONS, check: await makeCheck(k, uid) });
          key = { key: k, salt };
          return true;
        },
      });
    } else {
      const { salt, iter, check } = meta.data();
      result = await store.askPassword({
        mode: "unlock",
        email: email(),
        submit: async (pw) => {
          const k = await deriveKey(pw, fromB64(salt), iter);
          if (!(await verifyCheck(k, check, uid))) return false;
          key = { key: k, salt };
          return true;
        },
      });
    }

    if (result === "ok") {
      await saveKey(uid, key);
      store.toast("sync.started");
      begin();
    } else if (result === "forgot") {
      if (!(await store.confirm("pw.resetConfirm"))) return unlock();
      try {
        await wipeCloud();
      } catch (err) {
        return fail(err);
      }
      unlock();
    } else {
      store.setSyncView({ state: "locked", email: email() });
    }
  }

  // Forgotten password: drop the cloud copy; this device uploads its habits again.
  async function wipeCloud() {
    stop();
    const snap = await getDocs(itemsRef());
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(metaRef());
  }

  async function doSignOut() {
    if (!(await store.confirm("sync.signoutConfirm"))) return;
    const uid = user && user.uid;
    stop();
    if (uid) await forgetKey(uid);
    await signOut(auth); // onAuthStateChanged shows the "off" state
  }

  // -------------------------------------------------------------------------
  // Live sync
  // -------------------------------------------------------------------------
  function begin() {
    stop();
    store.setSyncView({ state: "on", email: email(), status: "pending" });
    const uid = user.uid;

    // If the password is reset on another device, this key no longer fits.
    unsubscribers.push(onSnapshot(metaRef(), (snap) => {
      if (snap.metadata.fromCache) return;
      if (!snap.exists() || snap.data().salt !== key.salt) {
        stop();
        forgetKey(uid);
        key = null;
        store.toast("sync.keyChanged");
        store.setSyncView({ state: "locked", email: email() });
      }
    }, (err) => fail(err)));

    unsubscribers.push(onSnapshot(itemsRef(), { includeMetadataChanges: true }, (snap) => {
      queue = queue.then(() => handleSnapshot(snap, uid)).catch((err) => fail(err));
    }, (err) => fail(err)));
  }

  async function handleSnapshot(snap, uid) {
    if (!key || !user || user.uid !== uid) return;
    for (const change of snap.docChanges()) {
      const id = change.doc.id;
      if (change.type === "removed") { remote.delete(id); continue; }
      const d = change.doc.data();
      if (d.deleted) {
        remote.set(id, { updatedAt: d.updatedAt, deleted: true });
        continue;
      }
      try {
        const data = await decryptJSON(key.key, d, `${uid}/${id}`);
        remote.set(id, { updatedAt: d.updatedAt, deleted: false, data });
      } catch (_) {
        // Written with another key (e.g. mid password reset): ignore it.
      }
    }

    // Merge only once the server has answered, so a stale offline cache
    // cannot make this device overwrite newer habits.
    if (!ready && snap.metadata.fromCache && navigator.onLine) return;

    const result = reconcile({
      local: store.getHabits(),
      tombstones: store.getTombstones(),
      remote,
      normalize: store.normalize,
    });
    if (result.changed) store.applyRemote(result.habits, result.tombstones);
    result.push.forEach((id) => pending.add(id));
    ready = true;
    if (pending.size) flush();

    const status = snap.metadata.hasPendingWrites || pending.size ? "pending" : snap.metadata.fromCache ? "offline" : "synced";
    store.setSyncView({ state: "on", email: email(), status });
  }

  async function flush() {
    clearTimeout(pushTimer);
    if (!ready || !key || !user || !pending.size) return;
    const uid = user.uid;
    const ids = [...pending];
    pending.clear();
    const habits = store.getHabits();
    const tombstones = store.getTombstones();

    const writes = [];
    for (const id of ids) {
      const h = habits.find((x) => x.id === id);
      if (h) {
        const box = await encryptJSON(key.key, store.pack(h), `${uid}/${id}`);
        writes.push([id, { ...box, updatedAt: h.updatedAt, deleted: false }]);
      } else if (tombstones[id]) {
        writes.push([id, { iv: "", ct: "", updatedAt: tombstones[id], deleted: true }]);
      }
    }

    // Commits resolve only when the server confirms; offline they wait in
    // Firestore's queue, so they are not awaited here.
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      writes.slice(i, i + BATCH_LIMIT).forEach(([id, data]) => batch.set(doc(db, "users", uid, "items", id), data));
      batch.commit().catch((err) => fail(err));
    }
  }

  // -------------------------------------------------------------------------
  // Server push (optional): this device's subscription plus the list of reminders to send,
  // stored in pushSubs/{id}. The home server in server/ reads it. See server/README.md.
  // -------------------------------------------------------------------------
  const vapidKey = () => window.HABILOOP_VAPID || "";
  const b64ToBytes = (b64) => {
    const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };
  async function subDocId(endpoint) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const swReady = () => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error("service worker not ready")), 6000)),
  ]);
  async function currentSub() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    return (await swReady()).pushManager.getSubscription();
  }
  // A subscription made for another server key can never receive our pushes (the push service answers 400).
  function usesOurKey(sub) {
    const k = sub.options && sub.options.applicationServerKey;
    if (!k) return true; // cannot tell; keep it
    const ours = b64ToBytes(vapidKey()), theirs = new Uint8Array(k);
    return ours.length === theirs.length && ours.every((b, i) => b === theirs[i]);
  }
  // The device's subscription for the current key: replaces one made for an older key.
  async function ensureSub(create) {
    const reg = await swReady();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !usesOurKey(sub)) {
      const id = await subDocId(sub.endpoint);
      await deleteDoc(doc(db, "pushSubs", id)).catch(() => {});
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey()) });
    return sub;
  }
  async function writeSub(sub, jobs) {
    const j = sub.toJSON();
    const id = await subDocId(j.endpoint);
    await setDoc(doc(db, "pushSubs", id), {
      uid: user.uid, endpoint: j.endpoint, keys: j.keys, lang: store.lang(),
      jobs: jobs || [], ua: navigator.userAgent.slice(0, 160), updatedAt: Date.now(),
    }, { merge: true });
    return id;
  }
  const push = {
    configured: () => !!vapidKey(),
    supported: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    async isOn() { try { return !!(user && (await currentSub())); } catch (_) { return false; } },
    // Must run straight from a tap: browsers only show the permission prompt for a gesture.
    async enable() {
      if (!user) throw new Error("not signed in");
      if ((await Notification.requestPermission()) !== "granted") return "denied";
      const sub = await ensureSub(true);
      await writeSub(sub, store.pushJobs());
      return "on";
    },
    async disable() {
      const sub = await currentSub();
      if (!sub) return;
      const id = await subDocId(sub.endpoint);
      await deleteDoc(doc(db, "pushSubs", id)).catch(() => {});
      await sub.unsubscribe();
    },
    async publish(jobs) {
      if (!user) return;
      // Permission was already granted, so an outdated subscription can be renewed without a prompt.
      const sub = await ensureSub(Notification.permission === "granted");
      if (sub) await writeSub(sub, jobs);
    },
    async test() {
      const sub = await ensureSub(Notification.permission === "granted");
      if (!sub) throw new Error("not subscribed");
      const id = await writeSub(sub, store.pushJobs()); // make sure the record exists before asking for a test
      await updateDoc(doc(db, "pushSubs", id), { testAt: Date.now() });
    },
  };

  return {
    push,
    signIn,
    unlock,
    signOut: doSignOut,
    retry: () => (user ? (key ? begin() : unlock()) : signIn()),
  };
}
