import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanQuiz,
  optionsOf,
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

test("matching pairs normalize spacing and reject duplicate or incomplete labels", () => {
  const quiz = {
    title: "Pairs",
    questions: [
      {
        type: "Matching",
        prompt: "Match",
        options: [" Sky | Blue ", " Grass | Green "],
      },
    ],
  };
  assert.deepEqual(cleanQuiz(quiz).questions[0].options, [
    "Sky|Blue",
    "Grass|Green",
  ]);
  quiz.questions[0].options = ["Sky|Blue", " Sky |Grey"];
  assert.throws(() => cleanQuiz(quiz), /Question 1 needs/);
  quiz.questions[0].options = ["Sky|Blue", "Grass|"];
  assert.throws(() => cleanQuiz(quiz), /fill in every matching target/);
});

test("formats without options discard ones left from another format", () => {
  for (const type of ["Text answer", "Numeric", "Survey", "Rating"]) {
    const left = { type, prompt: "Prompt", options: ["", "Old"], key: "1" };
    assert.deepEqual(optionsOf(left), []);
    assert.deepEqual(
      cleanQuiz({ title: "Quiz", questions: [left] }).questions[0].options,
      [],
    );
  }
  assert.deepEqual(optionsOf({ type: "Poll", options: ["A", "B"] }), [
    "A",
    "B",
  ]);
});

test("text answers without a key wait for the lecturer", () => {
  const q = { type: "Text answer", prompt: "Explain", key: "" };
  const saved = cleanQuiz({ title: "Quiz", questions: [q] }).questions[0];
  assert.equal(grade(saved, "An essay"), null);
  assert.equal(grade({ ...saved, key: "Law" }, "law"), true);
  assert.throws(() =>
    cleanQuiz({
      title: "Quiz",
      questions: [{ type: "Numeric", prompt: "How many?", key: "" }],
    }),
  );
});
