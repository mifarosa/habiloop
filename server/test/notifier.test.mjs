import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../src/notifier.js';

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0); // a Saturday, 09:00

function setup({ sentStart = {}, now = T0 } = {}) {
  const state = { now, sends: [], removed: [], saved: null, failWith: null };
  const sent = { ...sentStart };
  const n = createNotifier({
    send: async (sub, payload) => {
      if (state.failWith) throw state.failWith;
      state.sends.push({ sub: sub.id, payload });
    },
    removeSub: async (id) => state.removed.push(id),
    loadSent: () => sent,
    saveSent: (o) => { state.saved = { ...o }; },
    now: () => state.now,
    maxLateMin: 30,
  });
  return { n, state, sent };
}
const sub = (jobs, extra = {}) => ({ uid: 'u', endpoint: 'https://push/x', keys: { p256dh: 'a', auth: 'b' }, lang: 'tr', jobs, ...extra });
const job = (key, at, extra = {}) => ({ key, at, title: 'Kedi kumu', body: 'Bugün ideal gün', tag: 'habiloop-a', id: 'a', act: 'Yaptım', ...extra });

test('sends a reminder whose time has come', async () => {
  const { n, state } = setup();
  n.setSub('s1', sub([job('a|2026-10-17|ideal', T0 - 60000)]));
  const r = await n.tick();
  assert.equal(r.sent, 1);
  assert.equal(state.sends[0].payload.title, 'Kedi kumu');
  assert.equal(state.sends[0].payload.id, 'a');
});

test('waits for reminders in the future', async () => {
  const { n, state } = setup();
  n.setSub('s1', sub([job('k', T0 + 60000)]));
  assert.equal((await n.tick()).sent, 0);
  assert.equal(state.sends.length, 0);
  state.now = T0 + 120000;
  assert.equal((await n.tick()).sent, 1);
});

test('never repeats a reminder, also after a restart', async () => {
  const { n, state } = setup();
  n.setSub('s1', sub([job('k', T0 - 1000)]));
  await n.tick();
  await n.tick();
  assert.equal(state.sends.length, 1);
  const again = setup({ sentStart: state.saved });
  again.n.setSub('s1', sub([job('k', T0 - 1000)]));
  await again.n.tick();
  assert.equal(again.state.sends.length, 0);
});

test('drops reminders that are too late', async () => {
  const { n, state } = setup();
  n.setSub('s1', sub([job('old', T0 - 31 * 60000), job('ok', T0 - 29 * 60000)]));
  const r = await n.tick();
  assert.equal(r.sent, 1);
  assert.equal(state.sends[0].payload.title, 'Kedi kumu');
  assert.equal(state.saved['s1|ok'] > 0, true);
  assert.equal('s1|old' in state.saved, false);
});

test('each device gets its own reminders', async () => {
  const { n, state } = setup();
  n.setSub('a', sub([job('k', T0 - 1000)]));
  n.setSub('b', sub([job('k', T0 - 1000)]));
  assert.equal((await n.tick()).sent, 2);
  assert.deepEqual(state.sends.map((s) => s.sub).sort(), ['a', 'b']);
});

test('removes a subscription the push service says is gone', async () => {
  const { n, state } = setup();
  state.failWith = Object.assign(new Error('gone'), { statusCode: 410 });
  n.setSub('s1', sub([job('k', T0 - 1000)]));
  await n.tick();
  assert.deepEqual(state.removed, ['s1']);
  assert.equal(n.stats().subs, 0);
});

test('keeps trying after a temporary failure', async () => {
  const { n, state } = setup();
  state.failWith = Object.assign(new Error('boom'), { statusCode: 500 });
  n.setSub('s1', sub([job('k', T0 - 1000)]));
  assert.equal((await n.tick()).sent, 0);
  state.failWith = null;
  assert.equal((await n.tick()).sent, 1);
});

test('answers a fresh test request once, in the right language', async () => {
  const { n, state } = setup();
  n.setSub('s1', sub([], { testAt: T0 - 1000, lang: 'en' }));
  await n.tick();
  await n.tick();
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].payload.body, 'Notifications are working ✓');
});

test('ignores a stale test request and malformed jobs', async () => {
  const { n, state } = setup();
  n.setSub('s1', sub([{ key: 'x' }, { at: 'soon' }, null, job('good', T0 - 1000)], { testAt: T0 - 10 * 60000 }));
  const r = await n.tick();
  assert.equal(r.sent, 1);
  assert.equal(state.sends.length, 1);
});

test('forgets old sent entries', async () => {
  const { n, state } = setup({ sentStart: { 'x|old': T0 - 4 * 86400000, 'x|new': T0 - 3600000 } });
  await n.tick();
  assert.deepEqual(Object.keys(state.saved), ['x|new']);
});
