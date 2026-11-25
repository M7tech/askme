import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { WebSocket } from "ws";
import assert from "node:assert/strict";
const count = Number(process.env.AUDIENCE || 500),
  port = 3458,
  base = "http://127.0.0.1:" + port;
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chorus-benchmark-"));
const child = spawn(process.execPath, ["server/app.mjs"], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    PUBLIC_ORIGIN: base,
    NODE_ENV: "test",
    DATABASE_URL: "",
    REDIS_URL: "",
    DATA_DIR: dir,
  },
  stdio: ["ignore", "pipe", "inherit"],
});
const connections = [],
  elapsed = {};
let cookie = "";
async function call(route, data, raw, owner = false) {
  const headers = { origin: base, "Content-Type": "application/json" };
  if (raw) headers["x-participant"] = raw;
  if (owner) headers.cookie = cookie;
  const response = await fetch(base + "/api/" + route, {
    method: data === undefined ? "GET" : "POST",
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (route === "register")
    cookie = response.headers.get("set-cookie").split(";")[0];
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  return value;
}
async function batch(name, items, fn) {
  const times = [];
  const start = performance.now();
  const result = await Promise.all(
    items.map(async (item, i) => {
      const t = performance.now();
      const out = await fn(item, i);
      times.push(performance.now() - t);
      return out;
    }),
  );
  times.sort((a, b) => a - b);
  elapsed[name] = {
    totalMs: Math.round(performance.now() - start),
    p95Ms: Math.round(times[Math.ceil(times.length * 0.95) - 1]),
  };
  return result;
}
try {
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw Error("Server stopped before startup");
    }),
  ]);
  await call("register", {
    email: "load@example.test",
    name: "Load test",
    organization: "Isolated benchmark",
    password: randomUUID(),
  });
  const q = await call(
    "quizzes",
    {
      title: "Load test",
      questions: [
        {
          type: "Single choice",
          prompt: "Choose A",
          options: ["A", "B"],
          key: "A",
          seconds: 0,
          points: 1,
        },
      ],
    },
    null,
    true,
  );
  const { pin } = await call(
    "rooms",
    { quiz: q.id, max: count, release: "manual" },
    null,
    true,
  );
  const route = "rooms/" + pin + "/";
  const people = await batch("join", Array.from({ length: count }), (_, i) =>
    call(route + "join", { name: "Seat " + i }),
  );
  await batch("websocket", people, async () => {
    const ws = new WebSocket(base.replace("http", "ws") + "/live/" + pin, {
      origin: base,
    });
    connections.push(ws);
    await once(ws, "open");
  });
  const signals = connections.map((ws) => once(ws, "message"));
  await call(route + "control", { action: "start" }, null, true);
  await Promise.all(signals);
  await batch("readQuestion", people, (p) =>
    call(route + "state", undefined, p.token),
  );
  await batch("answer", people, (p) =>
    call(route + "answer", { q: 0, value: "A" }, p.token),
  );
  const r = await call(route + "host", undefined, null, true);
  assert.equal(r.tally[0].total, count);
  const metrics = {
    date: new Date().toISOString(),
    runtime: process.version,
    platform: os.platform(),
    cpu: os.cpus()[0].model,
    logicalProcessors: os.availableParallelism(),
    memoryGB: Math.round(os.totalmem() / 2 ** 30),
    storage: "Embedded PGlite on local disk",
    audience: count,
    accepted: r.tally[0].total,
    measurements: elapsed,
    scope:
      "Loopback, one synchronized question, one WebSocket start signal per participant and one HTTP read per participant. No reverse proxy, Redis or sustained browser refresh traffic.",
  };
  await fs.mkdir("docs", { recursive: true });
  await fs.writeFile(
    "docs/benchmark.json",
    JSON.stringify(metrics, null, 2) + "\n",
  );
  console.log(metrics);
} finally {
  for (const ws of connections) ws.terminate();
  child.kill();
}
