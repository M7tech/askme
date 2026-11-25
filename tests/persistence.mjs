import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const dir = await mkdtemp(path.join(os.tmpdir(), "chorus-persist-")),
  base = "http://127.0.0.1:3472";
async function boot() {
  const child = spawn(process.execPath, ["server/app.mjs"], {
    env: {
      ...process.env,
      DATA_DIR: dir,
      HOST: "127.0.0.1",
      PORT: "3472",
      DATABASE_URL: "",
      REDIS_URL: "",
      PUBLIC_ORIGIN: base,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw Error("Startup failed");
    }),
  ]);
  return child;
}
let child = await boot();
try {
  const headers = { origin: base, "Content-Type": "application/json" };
  const reg = await fetch(base + "/api/register", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Persistence",
      organization: "Restart test",
      email: "restart@example.test",
      password: randomUUID(),
    }),
  });
  assert.equal(reg.status, 200);
  headers.cookie = reg.headers.get("set-cookie").split(";")[0];
  const draft = {
    title: "Saved before restart",
    questions: [
      { type: "Survey", prompt: "Your feedback?", options: [], key: "" },
    ],
  };
  const quiz = await (
    await fetch(base + "/api/quizzes", {
      method: "POST",
      headers,
      body: JSON.stringify(draft),
    })
  ).json();
  assert.ok(quiz.id);
  const exited = once(child, "exit");
  child.kill();
  await exited;
  child = await boot();
  const saved = await (
    await fetch(base + "/api/quizzes/" + quiz.id, { headers })
  ).json();
  assert.equal(saved.title, draft.title);
  console.log(
    "Persisted quiz and authenticated session recovered after process restart.",
  );
} finally {
  child.kill();
}
