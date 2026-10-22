// Orchestrates sending: keeps the latest push subscriptions in memory and, on every tick, sends the
// reminders that are due. Each subscription carries its own list of reminders (`jobs`) that the app
// worked out on the device (the habit data is end-to-end encrypted, so the server never sees it).
// Network and storage are injected, so the whole flow can be tested without Firebase or a push service.

const TEST_FRESH_MS = 2 * 60 * 1000; // a test request older than this is ignored (e.g. after a restart)
const KEEP_MS = 3 * 86400000; // how long "already sent" entries are remembered
const TEST_TEXT = { tr: 'Bildirimler çalışıyor ✓', en: 'Notifications are working ✓' };

const isGone = (err) => err && (err.statusCode === 404 || err.statusCode === 410);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// deps:
//   send(sub, payloadObject)  resolves when the push service accepted it; rejects with .statusCode
//   removeSub(id)             forget a subscription the push service says is gone
//   loadSent() / saveSent(o)  which reminders were already sent (key -> time), so a restart never repeats them
export function createNotifier({
  send, removeSub, loadSent, saveSent, now = () => Date.now(), maxLateMin = 30, log = () => {},
}) {
  const subs = new Map(); // id -> { id, uid, endpoint, keys, lang, jobs, testAt, ... }
  const handledTest = new Map(); // id -> last testAt we answered
  const sent = loadSent() || {};
  let running = false;

  function setSub(id, data) {
    if (!data) {
      subs.delete(id);
      handledTest.delete(id);
      return;
    }
    subs.set(id, { ...data, id });
  }

  function prune() {
    const keepFrom = now() - KEEP_MS;
    let changed = false;
    for (const key of Object.keys(sent)) {
      if (!(sent[key] > keepFrom)) { delete sent[key]; changed = true; }
    }
    if (changed) saveSent(sent);
  }

  // Sends to one subscription; true when the push service accepted it. Dead ones are removed.
  async function sendOne(sub, payload) {
    try {
      await send(sub, payload);
      return true;
    } catch (err) {
      if (isGone(err)) {
        log(`subscription ${sub.id.slice(0, 8)}… is gone, removing`);
        subs.delete(sub.id);
        await removeSub(sub.id).catch(() => {});
      } else {
        log(`push to ${sub.id.slice(0, 8)}… failed: ${err && (err.statusCode || err.message)}`);
      }
      return false;
    }
  }

  async function answerTests() {
    for (const sub of [...subs.values()]) {
      const at = Number(sub.testAt) || 0;
      if (!at || at <= (handledTest.get(sub.id) || 0)) continue;
      handledTest.set(sub.id, at);
      if (now() - at > TEST_FRESH_MS) continue;
      const ok = await sendOne(sub, { title: 'Habiloop', body: TEST_TEXT[sub.lang] || TEST_TEXT.en, tag: 'habiloop-test' });
      log(`test push to ${sub.id.slice(0, 8)}…: ${ok ? 'sent' : 'not delivered'}`);
    }
  }

  async function tick() {
    if (running) return { sent: 0, skipped: true };
    running = true;
    let count = 0;
    try {
      await answerTests();
      const t = now();
      for (const sub of [...subs.values()]) {
        if (!Array.isArray(sub.jobs)) continue;
        for (const job of sub.jobs) {
          if (!job || typeof job !== 'object' || !job.key) continue;
          const at = Number(job.at);
          if (!Number.isFinite(at) || at > t) continue; // not due yet
          if (t - at > maxLateMin * 60000) continue; // too late to be useful (e.g. the server was off)
          const key = `${sub.id}|${job.key}`;
          if (sent[key]) continue;
          const ok = await sendOne(sub, {
            title: str(job.title, 120), body: str(job.body, 200), tag: str(job.tag, 80) || 'habiloop',
            id: str(job.id, 80), act: str(job.act, 30),
          });
          // Not marked when it was not delivered, so the next tick tries again (until it is too late).
          if (ok) {
            sent[key] = at;
            saveSent(sent);
            count += 1;
            log(`sent "${str(job.title, 60)}" to ${sub.id.slice(0, 8)}…`);
          }
          if (!subs.has(sub.id)) break; // the subscription was just removed
        }
      }
      prune();
    } finally {
      running = false;
    }
    return { sent: count };
  }

  return { setSub, tick, stats: () => ({ subs: subs.size }) };
}
