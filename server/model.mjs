import {
  randomBytes,
  createHash,
  randomUUID,
  randomInt,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(derive);
export const id = randomUUID,
  token = () => randomBytes(32).toString("base64url"),
  hash = (v) => createHash("sha256").update(v).digest("hex");
export function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export function str(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export async function password(value, stored) {
  const salt = stored?.split(".")[0] || token();
  const key = await scrypt(value, salt, 64);
  return stored
    ? timingSafeEqual(key, Buffer.from(stored.split(".")[1], "hex"))
    : salt + "." + key.toString("hex");
}
export const formats = [
  "Single choice",
  "Multiple choice",
  "True or false",
  "Text answer",
  "Fill in the blank",
  "Numeric",
  "Word cloud",
  "Poll",
  "Rating",
  "Survey",
  "Ranking",
  "Ordering",
  "Brainstorm",
  "Personality",
  "Matching",
  "Drag and drop",
  "Image hotspot",
  "Slide",
];
export const choices = [
  "Single choice",
  "Multiple choice",
  "True or false",
  "Poll",
  "Personality",
  "Ranking",
  "Ordering",
];
export function cleanQuiz(body) {
  check(str(body.title), "Give your quiz a title.");
  check(
    Array.isArray(body.questions) &&
      body.questions.length > 0 &&
      body.questions.length <= 200,
    "Use between 1 and 200 questions.",
  );
  const questions = body.questions.map((q, questionIndex) => {
    check(
      q && formats.includes(q.type) && str(q.prompt, 2000),
      "Choose a format and enter the question.",
    );
    const options = Array.isArray(q.options)
      ? q.options
          .map((o) => {
            const value = str(o, 400);
            return ["Matching", "Drag and drop"].includes(q.type)
              ? value
                  .split("|")
                  .map((part) => part.trim())
                  .join("|")
              : value;
          })
          .slice(0, 12)
      : [];
    if (choices.includes(q.type))
      check(
        options.length >= 2 &&
          options.every(Boolean) &&
          new Set(options).size === options.length,
        "Enter at least two distinct options.",
      );
    const key = str(q.key, 2000);
    if (["Matching", "Drag and drop"].includes(q.type))
      check(
        options.length >= 2 &&
          options.every(
            (o) =>
              o.split("|").length === 2 && o.split("|").every((s) => s.trim()),
          ) &&
          new Set(options.map((o) => o.split("|")[0])).size === options.length,
        `Question ${questionIndex + 1} needs at least two complete matching pairs. Enter a different label for each pair and fill in every matching target.`,
      );
    if (q.type === "Image hotspot")
      check(
        q.asset?.mime?.startsWith("image/") &&
          /^\d{1,3},\d{1,3},\d{1,2}$/.test(key) &&
          key
            .split(",")
            .map(Number)
            .every((v, i) => v >= 0 && v <= (i === 2 ? 50 : 100)) &&
          Number(key.split(",")[2]) > 0,
        "Attach an image and enter target X,Y,radius in percentages.",
      );
    if (["Single choice", "True or false"].includes(q.type))
      check(options.includes(key), "Select a correct answer.");
    if (q.type === "Multiple choice")
      check(
        key && key.split("|").every((k) => options.includes(k)),
        "Choose the correct options.",
      );
    if (["Numeric", "Fill in the blank", "Text answer"].includes(q.type))
      check(
        key && (q.type !== "Numeric" || Number.isFinite(Number(key))),
        "Enter a valid answer key.",
      );
    const asset =
      q.asset &&
      /^[0-9a-f-]{36}$/.test(q.asset.id) &&
      /^(image|video|audio)\/[a-z0-9-]+$/.test(q.asset.mime)
        ? { id: q.asset.id, mime: q.asset.mime }
        : null;
    return {
      moves: bounded(q.moves, 1, 3, 1),
      intensity: bounded(q.intensity, 1, 5, 2),
      duration: bounded(q.duration, 150, 1500, 450),
      target: bounded(q.target, -1, 11, -1),
      difficulty: str(q.difficulty) || "Standard",
      tags: str(q.tags, 300),
      translations: Object.fromEntries(
        ["ar", "ckb"].map((lang) => [
          lang,
          {
            prompt: str(q.translations?.[lang]?.prompt, 2000),
            explanation: str(q.translations?.[lang]?.explanation, 3000),
          },
        ]),
      ),
      asset,
      prompt: str(q.prompt, 2000),
      type: q.type,
      options,
      key,
      explanation: str(q.explanation, 3000),
      reference: str(q.reference, 500),
      seconds: bounded(q.seconds, 0, 3600, 30),
      points: bounded(q.points, 0, 10000, 100),
      effect: [
        "None",
        "Float",
        "Bounce",
        "Shake",
        "Run away",
        "Vertical",
        "Escape and return",
        "Random",
      ].includes(q.effect)
        ? q.effect
        : "None",
    };
  });
  return {
    title: str(body.title),
    category: str(body.category) || "General",
    questions,
  };
}
export function bounded(v, min, max, def) {
  return Number.isInteger(Number(v)) && v !== ""
    ? Math.max(min, Math.min(max, Number(v)))
    : def;
}
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function cleanAnswer(q, value) {
  if (["Matching", "Drag and drop"].includes(q.type)) {
    check(
      Array.isArray(value) &&
        value.length === q.options.length &&
        value.every((v) => q.options.some((o) => o.split("|")[1] === v)),
      "Match every item.",
    );
    return value;
  }
  if (q.type === "Image hotspot") {
    check(
      Array.isArray(value) &&
        value.length === 2 &&
        value.every((n) => Number.isFinite(n) && n >= 0 && n <= 100),
      "Select a point on the image.",
    );
    return value;
  }
  check(q.type !== "Slide", "This slide does not accept answers.");
  if (["Multiple choice", "Ordering", "Ranking"].includes(q.type)) {
    check(
      Array.isArray(value) &&
        value.length &&
        value.length <= q.options.length &&
        new Set(value).size === value.length &&
        value.every((v) => q.options.includes(v)),
      "Choose valid options.",
    );
    if (q.type !== "Multiple choice")
      check(value.length === q.options.length, "Rank every option.");
    return value;
  }
  const v = str(value, 1500);
  check(v, "Enter your response.");
  if (choices.includes(q.type))
    check(q.options.includes(v), "Choose a listed option.");
  if (q.type === "Rating")
    check(
      ["1", "2", "3", "4", "5"].includes(v),
      "Choose a rating from 1 to 5.",
    );
  if (q.type === "Numeric")
    check(Number.isFinite(Number(v)), "Enter a number.");
  return v;
}
export function grade(q, v) {
  if (
    [
      "Word cloud",
      "Brainstorm",
      "Poll",
      "Rating",
      "Survey",
      "Personality",
      "Ranking",
    ].includes(q.type)
  )
    return null;
  if (["Matching", "Drag and drop"].includes(q.type))
    return v.every((target, i) => q.options[i].split("|")[1] === target);
  if (q.type === "Image hotspot") {
    const [x, y, r] = q.key.split(",").map(Number);
    return Math.hypot(x - v[0], y - v[1]) <= r;
  }
  if (q.type === "Multiple choice")
    return (
      JSON.stringify([...v].sort()) === JSON.stringify(q.key.split("|").sort())
    );
  if (q.type === "Ordering")
    return JSON.stringify(v) === JSON.stringify(q.options);
  return q.type === "Numeric"
    ? Number(q.key) === Number(v)
    : String(v).toLowerCase() === q.key.toLowerCase();
}
export function released(room, i, answer, all, now = Date.now()) {
  switch (room.config.release) {
    case "never":
      return false;
    case "immediate":
      return !!answer;
    case "timer":
      return (
        (room.config.expiredQuestions || []).includes(i) ||
        (room.position === i &&
          room.phase === "open" &&
          room.deadline > 0 &&
          now >= Number(room.deadline))
      );
    case "all":
      return all || (room.config.answeredQuestions || []).includes(i);
    case "end":
      return room.phase === "ended";
    case "scheduled":
      return now >= room.config.releaseAt;
    default:
      return room.revealed.includes(i);
  }
}
