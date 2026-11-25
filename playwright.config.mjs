import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 65000,
  use: {
    baseURL: "http://127.0.0.1:3447",
    channel: process.platform === "win32" ? "msedge" : undefined,
  },
  webServer: {
    command: "node server/app.mjs",
    url: "http://127.0.0.1:3447/health",
    timeout: 60000,
    env: {
      PORT: "3447",
      HOST: "127.0.0.1",
      DATA_DIR: path.join(os.tmpdir(), "chorus-e2e-" + randomUUID()),
    },
  },
});
