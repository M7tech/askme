import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Promotion needs the embedded database closed, so this suite runs its own server.
const root = fileURLToPath(new URL("../../", import.meta.url)),
  origin = "http://127.0.0.1:3466",
  headers = { Origin: origin };
const env = {
  ...process.env,
  PORT: "3466",
  HOST: "127.0.0.1",
  PUBLIC_ORIGIN: origin,
  DATA_DIR: path.join(os.tmpdir(), "chorus-users-" + randomUUID()),
};
let server, boss, lecturer;
const boot = async () => {
  server = spawn(process.execPath, ["server/app.mjs"], { cwd: root, env });
  await expect
    .poll(
      async () =>
        (await fetch(origin + "/health").catch(() => ({ ok: false }))).ok,
      { timeout: 40000 },
    )
    .toBe(true);
};
const stop = () =>
  new Promise((done) => {
    server.once("exit", done);
    server.kill();
  });
test.use({ baseURL: origin });
test.beforeAll(async ({ playwright }) => {
  test.setTimeout(120000);
  await boot();
  const account = async (name, organization) => {
    const a = {
      name,
      organization,
      email: randomUUID() + "@example.test",
      password: randomUUID(),
    };
    const c = await playwright.request.newContext({ baseURL: origin });
    expect((await c.post("/api/register", { headers, data: a })).ok()).toBe(
      true,
    );
    const cookies = (await c.storageState()).cookies;
    await c.dispose();
    return { ...a, cookies };
  };
  boss = await account("Platform Owner", "Operations");
  lecturer = await account("Rezan Ali", "College of Law");
  await stop();
  expect(
    spawnSync(process.execPath, ["server/promote.mjs", boss.email], {
      cwd: root,
      env,
      timeout: 30000,
    }).status,
  ).toBe(0);
  await boot();
});
test.afterAll(() => stop());

test("platform administrator sees, filters and manages every user", async ({
  page,
}) => {
  await page.context().addCookies(boss.cookies);
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "All users" }).click();
  await expect(page.locator(".role")).toHaveCount(2);
  await expect(page.getByText(lecturer.email)).toBeVisible();
  await page.getByLabel(/Search name/).fill("college of law");
  await expect(page.locator(".role")).toHaveCount(1);
  await page.locator(".role select").selectOption("lecturer");
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByText("Role saved.")).toBeVisible();
  await page.reload();
  await page.locator("[name=filter]").selectOption("lecturer");
  await expect(page.locator(".role")).toHaveCount(1);
  await page.getByLabel(/Search name/).fill("nobody");
  await expect(page.getByText("No matching users.")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole("button", { name: "Clear search" }).click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
});

test("the site is called Ask, even where the former default was saved", async ({
  page,
}) => {
  await page.context().addCookies(boss.cookies);
  await page.request.patch("/api/admin", {
    headers,
    data: { name: "AskShaubo", registration: true },
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/| Ask$/);
  await expect(page.locator(".brand")).toHaveText("Ask");
  await page.goto("/#/admin");
  await expect(page.getByLabel("Platform name")).toHaveValue("Ask");
  await page.request.patch("/api/admin", {
    headers,
    data: { name: "Law Faculty", registration: true },
  });
  await page.goto("about:blank");
  await page.goto("/");
  await expect(page.locator(".brand")).toHaveText("Law Faculty");
});

test("other accounts and visitors cannot see users", async ({ page }) => {
  expect((await page.request.get("/api/admin")).ok()).toBe(false);
  await page.context().addCookies(lecturer.cookies);
  expect((await page.request.get("/api/admin")).status()).toBe(403);
  await page.goto("/#/dashboard");
  await expect(
    page.getByRole("link", { name: "Reports", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "All users" })).toHaveCount(0);
  await page.goto("/#/users");
  await expect(
    page.getByText("Platform administrator access required."),
  ).toBeVisible();
});
