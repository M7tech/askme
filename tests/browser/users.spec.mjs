import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
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
let server, boss, lecturer, colleague, leaver;
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
  colleague = await account("Hawar Omar", "Temporary");
  leaver = await account("Old Account", "Former faculty");
  await stop();
  expect(
    spawnSync(process.execPath, ["server/promote.mjs", boss.email], {
      cwd: root,
      env,
      timeout: 30000,
    }).status,
  ).toBe(0);
  // Invitations need email, so the colleague joins the organization directly.
  const moved = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { rows } = await import("./server/db.mjs");
       await rows("UPDATE users SET org=(SELECT org FROM users WHERE email=$1),role='lecturer' WHERE email=$2",["${lecturer.email}","${colleague.email}"]);
       await rows("DELETE FROM organizations WHERE name='Temporary'");
       await rows("UPDATE users SET last_seen=$1 WHERE email=$2",[Date.now()-3*3600000,"${leaver.email}"]);
       process.exit(0);`,
    ],
    { cwd: root, env, timeout: 30000 },
  );
  expect(moved.status, String(moved.stderr)).toBe(0);
  await boot();
  // One of everything, so data use and deletion have something to measure.
  const own = await playwright.request.newContext({ baseURL: origin });
  await own.post("/api/login", {
    headers,
    data: { email: lecturer.email, password: lecturer.password },
  });
  const picture = await sharp({
    create: { width: 200, height: 120, channels: 3, background: "#10406f" },
  })
    .png()
    .toBuffer();
  const image = { name: "a.png", mimeType: "image/png", buffer: picture };
  const asset = await (
    await own.post("/api/assets", { headers, multipart: { file: image } })
  ).json();
  lecturer.shared = asset.id;
  const quiz = await (
    await own.post("/api/quizzes", {
      headers,
      data: {
        title: "Contracts",
        questions: [{ type: "Survey", prompt: "What is shown?", asset }],
      },
    })
  ).json();
  lecturer.pin = (
    await (
      await own.post("/api/rooms", {
        headers,
        data: { quiz: quiz.id, photography: true },
      })
    ).json()
  ).pin;
  const path2 = "/api/rooms/" + lecturer.pin + "/";
  const person = await (
    await own.post(path2 + "join", {
      headers,
      data: { name: "Sara", consent: true },
    })
  ).json();
  const h = { ...headers, "x-participant": person.token };
  await own.post(path2 + "control", { headers, data: { action: "start" } });
  await own.post(path2 + "answer", {
    headers: h,
    data: { q: 0, value: "A contract", requestId: randomUUID() },
  });
  expect(
    (
      await own.post(path2 + "photos", { headers: h, multipart: { image } })
    ).ok(),
  ).toBe(true);
  await own.dispose();
});
test.describe.configure({ mode: "serial" });
test.afterAll(() => stop());

const admin = (page, id, data) =>
  page.request.post("/api/admin/accounts/" + id, { headers, data });
const list = async (page) =>
  (await (await page.request.get("/api/admin/accounts")).json()).accounts;
const find = async (page, email) =>
  (await list(page)).find((u) => u.email === email);
const signIn = (ctx, a, password = a.password) =>
  ctx.post("/api/login", { headers, data: { email: a.email, password } });

test("administrator sees data used, filters users and changes roles", async ({
  page,
}) => {
  await page.context().addCookies(boss.cookies);
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "All users" }).click();
  await expect(page.locator(".account-row")).toHaveCount(4);
  await page.getByLabel(/Search name/).fill("rezan");
  await expect(page.locator(".account-row")).toHaveCount(1);
  await page.getByRole("link", { name: "Manage" }).click();
  await expect(page.getByText("Question media")).toBeVisible();
  const before = (await find(page, lecturer.email)).usage;
  expect(before).toMatchObject({
    quizzes: 1,
    media: 1,
    sessions: 1,
    participants: 1,
    answers: 1,
    photos: 1,
  });
  for (const v of Object.values(before.data)) expect(v).toBeGreaterThan(0);
  await page.getByLabel("Role", { exact: true }).selectOption("lecturer");
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByText("Role saved.")).toBeVisible();
  expect((await find(page, lecturer.email)).role).toBe("lecturer");
  // Promotion to platform administrator asks first.
  await page.getByLabel("Role", { exact: true }).selectOption("super");
  await page.getByRole("button", { name: "Save role" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  expect((await find(page, lecturer.email)).role).toBe("lecturer");
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of [
      "users",
      "users/" + (await find(page, lecturer.email)).id,
    ]) {
      await page.goto("about:blank");
      await page.goto("/#/" + route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        route,
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations.map((v) => v.id),
        route,
      ).toEqual([]);
    }
  }
});

test("reset link replaces the password, works once and ends sign-ins", async ({
  page,
  playwright,
}) => {
  await page.context().addCookies(boss.cookies);
  const u = await find(page, lecturer.email);
  const own = await playwright.request.newContext({ baseURL: origin });
  expect((await signIn(own, lecturer)).ok()).toBe(true);
  await page.goto("/#/users/" + u.id);
  await page.getByRole("button", { name: "Create reset link" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset password" })
    .click();
  const link = await page.getByLabel("Reset link").inputValue();
  expect(link).toContain(origin + "/#/reset/");
  expect(
    (await own.get("/api/me")).ok() &&
      (await (await own.get("/api/me")).json()),
  ).toBe(null);
  expect((await signIn(own, lecturer)).status()).toBe(401);
  lecturer.password = randomUUID();
  const redeem = () =>
    own.post("/api/redeem", {
      headers,
      data: {
        kind: "reset",
        token: link.split("/").pop(),
        password: lecturer.password,
      },
    });
  expect((await redeem()).ok()).toBe(true);
  expect((await redeem()).status()).toBe(400);
  expect((await signIn(own, lecturer)).ok()).toBe(true);
  await own.dispose();
});

test("suspension signs out, blocks sign-in and new participants, and can be undone", async ({
  page,
  playwright,
}) => {
  await page.context().addCookies(boss.cookies);
  const u = await find(page, lecturer.email);
  const own = await playwright.request.newContext({ baseURL: origin });
  await signIn(own, lecturer);
  const join = () =>
    own.post(`/api/rooms/${lecturer.pin}/join`, {
      headers,
      data: { name: "Late" },
    });
  await page.goto("/#/users/" + u.id);
  await page.getByRole("button", { name: "Suspend account" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Suspend account" })
    .click();
  await expect(
    page.locator(".account-card").getByText("Suspended"),
  ).toBeVisible();
  expect(await (await own.get("/api/me")).json()).toBe(null);
  const refused = await signIn(own, lecturer);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain("suspended");
  expect((await join()).status()).toBe(403);
  expect((await find(page, lecturer.email)).usage.quizzes).toBe(1);
  await page.getByRole("button", { name: "Restore access" }).click();
  await expect(page.getByText("Access restored.")).toBeVisible();
  expect((await signIn(own, lecturer)).ok()).toBe(true);
  expect((await join()).ok()).toBe(true);
  await own.dispose();
});

test("limits: own account, other administrators, confirmation and other roles", async ({
  page,
  playwright,
}) => {
  const other = await playwright.request.newContext({ baseURL: origin });
  await signIn(other, lecturer);
  await page.context().addCookies(boss.cookies);
  const accounts = await list(page),
    me = accounts.find((u) => u.email === boss.email),
    them = accounts.find((u) => u.email === lecturer.email),
    mate = accounts.find((u) => u.email === colleague.email);
  for (const action of ["role", "reset", "suspend", "clear", "remove"])
    expect(
      (
        await admin(page, me.id, {
          action,
          role: "lecturer",
          confirm: boss.email,
        })
      ).status(),
    ).toBe(403);
  await admin(page, mate.id, { action: "role", role: "super" });
  for (const action of ["reset", "suspend", "clear", "remove"])
    expect(
      (
        await admin(page, mate.id, { action, confirm: colleague.email })
      ).status(),
    ).toBe(409);
  await admin(page, mate.id, { action: "role", role: "lecturer" });
  for (const action of ["clear", "remove"]) {
    expect((await admin(page, them.id, { action })).status()).toBe(400);
    expect(
      (
        await admin(page, them.id, { action, confirm: "wrong@example.test" })
      ).status(),
    ).toBe(400);
  }
  expect(
    (await admin(page, them.id, { action: "role", role: "owner" })).status(),
  ).toBe(400);
  expect((await other.get("/api/admin/accounts")).status()).toBe(403);
  expect(
    (
      await other.post("/api/admin/accounts/" + me.id, {
        headers,
        data: { action: "suspend" },
      })
    ).status(),
  ).toBe(403);
  await other.dispose();
  expect((await find(page, lecturer.email)).usage.quizzes).toBe(1);
});

test("administrator sees active sessions and users, ends sessions and removes from the list", async ({
  page,
  playwright,
}) => {
  await page.context().addCookies(boss.cookies);
  await page.goto("/#/users");
  const sessions = page.locator(".session-row");
  await expect(sessions).toHaveCount(1);
  await expect(sessions).toContainText("Contracts");
  await expect(sessions).toContainText("Rezan Ali");
  await expect(sessions).toContainText(lecturer.pin);
  // The administrator is using the site, so counts as active.
  const me = page.locator(".account-row", { hasText: boss.email });
  await expect(me.getByText("Active now")).toBeVisible();
  await expect(me.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await page.getByLabel("Show", { exact: true }).selectOption("active");
  await expect(
    page.locator(".account-row", { hasText: boss.email }),
  ).toBeVisible();
  await page.getByLabel("Show", { exact: true }).selectOption("");
  // Last activity is shown for everyone else, and refreshed when they return.
  const old = page.locator(".account-row", { hasText: leaver.email });
  await expect(old.getByText("Active now")).toHaveCount(0);
  await expect(old.locator(".seen")).toContainText("Last active 3 hours ago");
  // Ending asks first.
  await sessions.getByRole("button", { name: "End session" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "End session" })
    .click();
  await expect(page.getByText("No sessions are running.")).toBeVisible();
  const state = await (
    await page.request.get(`/api/rooms/${lecturer.pin}/info`)
  ).json();
  expect(state.phase).toBe("ended");
  // Removing from the list deletes the account after typing its email.
  await old.getByRole("button", { name: "Remove" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Confirmation").fill(leaver.email);
  await dialog.getByRole("button", { name: "Remove account" }).click();
  await expect(page.getByText("Account removed.")).toBeVisible();
  await expect(
    page.locator(".account-row", { hasText: leaver.email }),
  ).toHaveCount(0);
  const gone = await playwright.request.newContext({ baseURL: origin });
  expect((await signIn(gone, leaver)).status()).toBe(401);
  await gone.dispose();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  // Only platform administrators can list sessions across organizations.
  const other = await playwright.request.newContext({ baseURL: origin });
  await signIn(other, colleague);
  expect((await other.get("/api/admin/sessions")).status()).toBe(403);
  await other.dispose();
});

test("clearing keeps the account and colleagues' media; removing deletes everything", async ({
  page,
  playwright,
}) => {
  await page.context().addCookies(boss.cookies);
  const u = await find(page, lecturer.email);
  // A colleague reuses the lecturer's media in their own quiz.
  const mate = await playwright.request.newContext({ baseURL: origin });
  await signIn(mate, colleague);
  expect(
    (
      await mate.post("/api/quizzes", {
        headers,
        data: {
          title: "Shared picture",
          questions: [
            {
              type: "Survey",
              prompt: "What is this?",
              asset: { id: lecturer.shared, mime: "image/webp" },
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/#/users/" + u.id);
  await page.getByRole("button", { name: "Clear data" }).click();
  const dialog = page.getByRole("dialog"),
    go = dialog.getByRole("button", { name: "Clear data" });
  await expect(go).toBeDisabled();
  await dialog.getByLabel("Confirmation").fill("someone@else.test");
  await expect(go).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Confirmation").fill(lecturer.email);
  await go.click();
  await expect(page.getByText("Data cleared.")).toBeVisible();
  const cleared = await find(page, lecturer.email);
  expect(cleared.usage).toMatchObject({
    quizzes: 0,
    sessions: 0,
    participants: 0,
    answers: 0,
    photos: 0,
  });
  expect((await mate.get("/api/assets/" + lecturer.shared)).ok()).toBe(true);
  expect((await mate.get(`/api/rooms/${lecturer.pin}/info`)).status()).toBe(
    404,
  );
  const own = await playwright.request.newContext({ baseURL: origin });
  expect((await signIn(own, lecturer)).ok()).toBe(true);

  await page.getByRole("button", { name: "Remove account" }).click();
  await dialog.getByLabel("Confirmation").fill(lecturer.email);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/users$/);
  await expect(page.getByText(lecturer.email)).toHaveCount(0);
  expect(await (await own.get("/api/me")).json()).toBe(null);
  expect((await signIn(own, lecturer)).status()).toBe(401);
  // The colleague, in the same organization, is untouched.
  expect((await (await mate.get("/api/quizzes")).json()).length).toBe(1);
  expect((await mate.get("/api/assets/" + lecturer.shared)).ok()).toBe(true);
  const log = (
    await (await page.request.get("/api/admin")).json()
  ).activity.map((v) => v.action);
  for (const a of [
    "account.role",
    "account.reset",
    "account.suspend",
    "account.restore",
    "account.clear",
    "account.remove",
  ])
    expect(log).toContain(a);
  await own.dispose();
  await mate.dispose();
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
  await page.context().addCookies(colleague.cookies);
  expect((await page.request.get("/api/admin")).status()).toBe(403);
  await page.goto("/#/dashboard");
  await expect(
    page.getByRole("link", { name: "Live sessions", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "All users" })).toHaveCount(0);
  await page.goto("/#/users");
  await expect(
    page.getByText("Platform administrator access required."),
  ).toBeVisible();
});
