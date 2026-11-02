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

// ---------------------------------------------------------------------------
// Recovery question: the gate in front of "forgot password", which deletes the cloud copy.
// The answer never unlocks the data (only the password does); it only decides whether the
// deletion may be offered. The question is stored as plain text so it can be shown to someone
// who cannot unlock; the answer only as a salted PBKDF2 hash.
// ---------------------------------------------------------------------------

// Case, accents, the Turkish dotless i and extra spaces do not matter: "Mırmır", "MİRMİR" and
// " mirmir " are the same answer, so a different keyboard does not lock the owner out.
export function normalizeAnswer(text) {
  return String(text ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function answerHash(answer, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", enc.encode(normalizeAnswer(answer)), "PBKDF2", false, ["deriveBits"]);
  return toB64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 256));
}

export async function makeAnswerRecord(answer, iterations = PBKDF2_ITERATIONS) {
  const salt = randomBytes(16);
  return { salt: toB64(salt), iter: iterations, h: await answerHash(answer, salt, iterations) };
}

// Compares in constant time; any malformed record simply fails.
export async function verifyAnswer(answer, record) {
  try {
    const got = await answerHash(answer, fromB64(record.salt), record.iter);
    if (got.length !== record.h.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ record.h.charCodeAt(i);
    return diff === 0;
  } catch (_) {
    return false;
  }
}

// Wrong answers lock the question for a while, so it cannot be guessed at the keyboard.
export const GATE_MAX_TRIES = 5;
export const GATE_WAIT_MS = 15 * 60 * 1000;

// state: { fails, until } (until = time in ms before which no try is allowed)
export const gateLocked = (state, now) => Boolean(state && state.until > now);
export const gateMinutesLeft = (state, now) => Math.max(0, Math.ceil((state.until - now) / 60000));
export function gateAfterFail(state, now) {
  const fails = ((state && state.fails) || 0) + 1;
  return fails >= GATE_MAX_TRIES ? { fails: 0, until: now + GATE_WAIT_MS } : { fails, until: 0 };
}
export const gateAfterSuccess = () => ({ fails: 0, until: 0 });

// For an account that never set a question: the typed e-mail and the word have to match.
export function fallbackOk({ typedEmail, word }, accountEmail) {
  const w = normalizeAnswer(word);
  return Boolean(accountEmail) && normalizeAnswer(typedEmail) === normalizeAnswer(accountEmail) && (w === "sil" || w === "delete");
}

// A question and answer that can be saved: not empty, and the answer is not written in the question.
export function checkQuestion(question, answer) {
  const q = String(question ?? "").trim(), a = normalizeAnswer(answer);
  if (q.length < 8 || q.length > 120 || a.length < 2) return "short";
  if (normalizeAnswer(q).includes(a)) return "same";
  return null;
}
