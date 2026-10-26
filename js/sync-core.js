// Sync building blocks with no Firebase dependency: end-to-end encryption and
// the merge between the local habits and the copy in the cloud. js/sync.js wires
// them to Firestore.

export const PBKDF2_ITERATIONS = 600000;
const CHECK_TEXT = "habiloop";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < view.length; i += 0x8000) bin += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

// AES-256-GCM key from the sync password. Non-extractable, so it can be kept
// in IndexedDB without the raw key ever being readable by script.
export async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// `aad` ties a ciphertext to where it is stored (user and entry id), so a
// record cannot be copied into another slot and still decrypt.
export async function encryptJSON(key, value, aad) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJSON(key, { iv, ct }, aad) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv), additionalData: enc.encode(aad) },
    key,
    fromB64(ct),
  );
  return JSON.parse(dec.decode(plain));
}

export const makeCheck = (key, uid) => encryptJSON(key, { check: CHECK_TEXT }, `${uid}/check`);

// False for a wrong password: AES-GCM refuses to decrypt with the wrong key.
export async function verifyCheck(key, check, uid) {
  try {
    const value = await decryptJSON(key, check, `${uid}/check`);
    return value && value.check === CHECK_TEXT;
  } catch (_) {
    return false;
  }
}

// The data key: a random AES-256 key that encrypts the habits. The password only locks it (the
// "wrapped" copy in the key document), so changing the password re-locks the same key and no habit
// has to be re-encrypted. It is extractable so a device that is already unlocked can re-lock it.
export const newDataKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export async function wrapDataKey(kek, dek, uid) {
  const raw = await crypto.subtle.exportKey("raw", dek);
  return encryptJSON(kek, { k: toB64(raw) }, `${uid}/wrap`);
}

export async function unwrapDataKey(kek, wrapped, uid) {
  const { k } = await decryptJSON(kek, wrapped, `${uid}/wrap`);
  return crypto.subtle.importKey("raw", fromB64(k), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

// Merges local habits with the cloud copy, habit by habit; the newer `updatedAt` wins and
// deletions travel as tombstones.
//   local:      [{ id, updatedAt, ...fields }]
//   tombstones: { id: deletedAt }
//   remote:     Map id -> { updatedAt, deleted, data?: { ...fields } }
// Returns { habits, tombstones, changed, push } where push lists the ids whose local version
// is newer than the cloud's (or missing there).
export function reconcile({ local, tombstones, remote, normalize }) {
  const localById = new Map(local.map((h) => [h.id, h]));
  const tomb = { ...tombstones };
  const ids = new Set([...localById.keys(), ...Object.keys(tomb), ...remote.keys()]);
  const habits = [];
  const push = [];

  for (const id of ids) {
    const L = localById.get(id);
    const R = remote.get(id);
    const localTs = L ? L.updatedAt || 0 : tomb[id] || 0;

    if (R && R.updatedAt > localTs) {
      if (R.deleted) { tomb[id] = R.updatedAt; continue; }
      const h = normalize({ ...R.data, id, updatedAt: R.updatedAt }, L);
      if (!h) continue;
      delete tomb[id];
      habits.push(h);
    } else {
      if (L) habits.push(L);
      if ((L || tomb[id]) && (!R || R.updatedAt < localTs)) push.push(id);
    }
  }

  // Keep the local order, then new habits from the cloud.
  const order = new Map(local.map((h, i) => [h.id, i]));
  habits.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e9) - (order.has(b.id) ? order.get(b.id) : 1e9) || a.created?.localeCompare?.(b.created) || 0);
  const changed = JSON.stringify(habits) !== JSON.stringify(local) || JSON.stringify(tomb) !== JSON.stringify(tombstones);
  return { habits, tombstones: tomb, changed, push };
}
