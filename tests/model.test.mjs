import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanQuiz,
  cleanAnswer,
  grade,
  released,
  password,
} from "../server/model.mjs";
const q = {
  type: "Multiple choice",
  prompt: "Pick two",
  options: ["One", "Two", "Three"],
  key: "One|Two",
};
test("multiple choice scores a set and rejects duplicate options", () => {
  assert.equal(grade(q, cleanAnswer(q, ["Two", "One"])), true);
  assert.equal(grade(q, ["One"]), false);
  assert.throws(() => cleanAnswer(q, ["One", "One"]));
});
test("invalid answer keys cannot be saved", () =>
  assert.throws(() =>
    cleanQuiz({ title: "Numbers", questions: [{ ...q, key: "Unlisted" }] }),
  ));
test("all release policies", () => {
  const r = {
    config: {},
    phase: "open",
    position: 0,
    deadline: 100,
    revealed: [],
  };
  for (const policy of [
    "manual",
    "end",
    "scheduled",
    "timer",
    "all",
    "never",
    "immediate",
  ]) {
    r.config = { release: policy, releaseAt: 100 };
    assert.equal(released(r, 0, null, false, 50), false);
  }
  r.config.release = "timer";
  assert.equal(released(r, 0, null, false, 101), true);
  r.config.release = "manual";
  r.revealed = [0];
  assert.equal(released(r, 0, null, false), true);
  r.config.release = "never";
  r.phase = "ended";
  assert.equal(released(r, 0, {}, true), false);
});
test("salted passwords verify and differ", async () => {
  const p = await password("test-only passphrase");
  assert.equal(await password("test-only passphrase", p), true);
  assert.equal(await password("wrong", p), false);
  assert.notEqual(await password("test-only passphrase"), p);
});
