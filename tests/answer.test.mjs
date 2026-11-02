import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAnswer, makeAnswerRecord, verifyAnswer, gateLocked, gateMinutesLeft, gateAfterFail, gateAfterSuccess,
  fallbackOk, checkQuestion, GATE_MAX_TRIES, GATE_WAIT_MS,
} from "../js/sync-core.js";

const FAST = 1000; // iterations: enough to prove the logic, fast enough for tests

test("normalizeAnswer: case, accents, the Turkish dotless i and spaces do not matter", () => {
  const same = ["Mırmır", "MİRMİR", "mirmir", "  MIRMIR  ", "mIrMıR"];
  for (const s of same) assert.equal(normalizeAnswer(s), "mirmir", s);
  assert.equal(normalizeAnswer("Şişli Çarşı"), "sisli carsi");
  assert.equal(normalizeAnswer("  İstanbul   Ankara "), "istanbul ankara");
  assert.equal(normalizeAnswer("Ömer Ünal Ğ"), "omer unal g");
  assert.equal(normalizeAnswer(null), "");
  assert.notEqual(normalizeAnswer("mirmir"), normalizeAnswer("mirmirr"), "different words stay different");
  assert.equal(normalizeAnswer("Mir   mir"), "mir mir", "inner spaces are collapsed, not removed");
});

test("an answer is accepted when it matches in any spelling, and refused otherwise", async () => {
  const record = await makeAnswerRecord("Mırmır", FAST);
  assert.equal(record.iter, FAST);
  assert.match(record.h, /^[A-Za-z0-9+/=]{44}$/);
  assert.equal(await verifyAnswer("mirmir", record), true);
  assert.equal(await verifyAnswer("  MİRMİR ", record), true);
  assert.equal(await verifyAnswer("pamuk", record), false);
  assert.equal(await verifyAnswer("", record), false);
});

test("the stored record does not contain the answer, and every record has its own salt", async () => {
  const a = await makeAnswerRecord("pamuk", FAST), b = await makeAnswerRecord("pamuk", FAST);
  assert.ok(!JSON.stringify(a).toLowerCase().includes("pamuk"));
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.h, b.h, "same answer, different salt, different hash");
  assert.equal(await verifyAnswer("pamuk", a), true);
  assert.equal(await verifyAnswer("pamuk", b), true);
});

test("a malformed or missing record never verifies and never throws", async () => {
  for (const bad of [null, undefined, {}, { salt: "!!", iter: 1, h: "x" }, { salt: "AAAA", iter: "x", h: 5 }]) {
    assert.equal(await verifyAnswer("pamuk", bad), false);
  }
});

test("the gate: five wrong answers lock it for 15 minutes, a right one resets the count", () => {
  const t0 = 1_000_000;
  let state = gateAfterSuccess();
  for (let i = 1; i < GATE_MAX_TRIES; i++) {
    state = gateAfterFail(state, t0);
    assert.equal(gateLocked(state, t0), false, `still open after ${i} wrong answers`);
  }
  state = gateAfterFail(state, t0);
  assert.equal(gateLocked(state, t0), true);
  assert.equal(gateMinutesLeft(state, t0), 15);
  assert.equal(gateLocked(state, t0 + GATE_WAIT_MS - 1), true);
  assert.equal(gateLocked(state, t0 + GATE_WAIT_MS), false, "open again after the wait");
  assert.equal(gateMinutesLeft(state, t0 + 60_000 * 14 + 1), 1);
  const reopened = gateAfterFail(state, t0 + GATE_WAIT_MS);
  assert.equal(reopened.fails, 1, "the count starts over after a lock");
  assert.deepEqual(gateAfterSuccess(), { fails: 0, until: 0 });
  assert.equal(gateLocked(null, t0), false);
});

test("fallback for accounts without a question: the typed e-mail and the word have to match", () => {
  const email = "Ayse.Yilmaz@Gmail.com";
  assert.equal(fallbackOk({ typedEmail: "ayse.yilmaz@gmail.com", word: "SİL" }, email), true);
  assert.equal(fallbackOk({ typedEmail: " AYSE.YILMAZ@GMAIL.COM ", word: "sil" }, email), true);
  assert.equal(fallbackOk({ typedEmail: "ayse.yilmaz@gmail.com", word: "DELETE" }, email), true);
  assert.equal(fallbackOk({ typedEmail: "ayse.yilmaz@gmail.com", word: "evet" }, email), false);
  assert.equal(fallbackOk({ typedEmail: "baska@gmail.com", word: "SİL" }, email), false);
  assert.equal(fallbackOk({ typedEmail: "", word: "SİL" }, ""), false, "no account e-mail never passes");
});

test("checkQuestion: both parts are needed and the answer must not be in the question", () => {
  assert.equal(checkQuestion("İlk evcil hayvanımın adı?", "Pamuk"), null);
  assert.equal(checkQuestion("kısa?", "Pamuk"), "short");
  assert.equal(checkQuestion("İlk evcil hayvanımın adı?", " "), "short");
  assert.equal(checkQuestion("İlk evcil hayvanımın adı?", "x"), "short");
  assert.equal(checkQuestion("x".repeat(121), "Pamuk"), "short");
  assert.equal(checkQuestion("Pamuk benim kedimin adı mı?", "pamuk"), "same");
  assert.equal(checkQuestion("Pamuk benim kedimin adı mı?", "PAMUK"), "same");
});
