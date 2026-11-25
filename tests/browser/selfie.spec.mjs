import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const origin = "http://127.0.0.1:3447",
  headers = { Origin: origin };
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
let cookies, quiz;
test.beforeAll(async ({ playwright }) => {
  const c = await playwright.request.newContext({ baseURL: origin });
  await c.post("/api/register", {
    headers,
    data: {
      name: "Instructor",
      organization: "Selfie checks",
      email: randomUUID() + "@example.test",
      password: randomUUID(),
    },
  });
  quiz = await (
    await c.post("/api/quizzes", {
      headers,
      data: {
        title: "Attendance",
        questions: [{ type: "Survey", prompt: "What did you learn?" }],
      },
    })
  ).json();
  cookies = (await c.storageState()).cookies;
  await c.dispose();
});
async function room(page, data) {
  await page.context().addCookies(cookies);
  return (
    await page.request.post("/api/rooms", {
      headers,
      data: { quiz: quiz.id, ...data },
    })
  ).json();
}
async function phone(browser) {
  const ctx = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    permissions: ["camera"],
  });
  return [ctx, await ctx.newPage()];
}

test("lecturer asks for name and selfie; student takes one on the phone", async ({
  page,
  browser,
}) => {
  await page.context().addCookies(cookies);
  await page.goto("/#/launch/" + quiz.id);
  await expect(page.getByLabel("Ask for name")).toBeChecked();
  const photography = page.getByLabel("Consent-based photography");
  await page.getByLabel("Ask for a selfie").check();
  await expect(photography).toBeChecked();
  await photography.uncheck();
  await expect(page.getByLabel("Ask for a selfie")).not.toBeChecked();
  await page.getByLabel("Ask for a selfie").check();
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL(/#\/host\/\d{6}$/);
  const pin = page.url().split("/").pop();

  const [ctx, mobile] = await phone(browser);
  await mobile.goto("/#/join/" + pin);
  await mobile.getByLabel("Your name").fill("Sara");
  await expect(
    mobile.getByRole("button", { name: "Open camera" }),
  ).toBeHidden();
  await mobile.getByLabel(/I consent/).check();
  await mobile.getByRole("button", { name: "Open camera" }).click();
  await mobile.getByRole("button", { name: "Take selfie" }).click();
  await expect(mobile.getByAltText("Your selfie")).toBeVisible();
  expect(
    await mobile.evaluate(() => document.querySelector("video").srcObject),
  ).toBeNull();
  expect(
    (
      await new AxeBuilder({ page: mobile })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
  await mobile.getByRole("button", { name: "Join session" }).click();
  await expect(
    mobile.getByRole("heading", { name: "Waiting for the presenter" }),
  ).toBeVisible();

  const avatar = page.getByAltText("Selfie");
  await expect(avatar).toBeVisible();
  await expect
    .poll(() => avatar.evaluate((i) => i.naturalWidth))
    .toBeGreaterThan(0);
  // Strangers cannot read it, and withdrawing consent deletes it.
  const src = await avatar.getAttribute("src");
  const stranger = await browser.newContext({ baseURL: origin });
  expect((await stranger.request.get(src)).ok()).toBe(false);
  await stranger.close();
  const token = await mobile.evaluate(
    (k) => localStorage.getItem(k),
    "chorus.participant." + pin,
  );
  await mobile.request.post(`/api/rooms/${pin}/consent`, {
    headers: { ...headers, "x-participant": token },
    data: { consent: false },
  });
  expect((await page.request.get(src)).status()).toBe(404);
  await ctx.close();
});

test("a selfie stays optional and withdrawing consent drops it", async ({
  page,
  browser,
}) => {
  const r = await room(page, { photography: true, selfie: true });
  const [ctx, mobile] = await phone(browser);
  await mobile.goto("/#/join/" + r.pin);
  await mobile.getByLabel("Your name").fill("Dilan");
  const consent = mobile.getByLabel(/I consent/);
  await consent.check();
  await mobile.locator("#selfie input[type=file]").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 1600, height: 900, channels: 3, background: "#aab9ff" },
    })
      .png()
      .toBuffer(),
  });
  await expect(mobile.getByAltText("Your selfie")).toBeVisible();
  await consent.uncheck();
  await expect(mobile.getByAltText("Your selfie")).toBeHidden();
  await mobile.getByRole("button", { name: "Join session" }).click();
  await expect(
    mobile.getByRole("heading", { name: "Waiting for the presenter" }),
  ).toBeVisible();
  const host = await (
    await page.request.get(`/api/rooms/${r.pin}/host`)
  ).json();
  expect(host.people[0]).toMatchObject({
    name: "Dilan",
    consent: false,
    selfie: null,
  });
  await ctx.close();
});

test("guests, guardian sessions and sessions without selfies", async ({
  page,
  browser,
}) => {
  const [ctx, mobile] = await phone(browser);
  const guests = await room(page, { anonymous: true });
  await mobile.goto("/#/join/" + guests.pin);
  await expect(
    mobile.getByText("You will join with a guest nickname."),
  ).toBeVisible();
  await expect(mobile.getByLabel("Your name")).toHaveCount(0);
  await expect(mobile.locator("#selfie")).toHaveCount(0);
  const guarded = await room(page, {
    photography: true,
    selfie: true,
    guardian: true,
  });
  await mobile.goto("/#/join/" + guarded.pin);
  await expect(mobile.getByText(/guardian permission/)).toBeVisible();
  await expect(mobile.locator("#selfie")).toHaveCount(0);
  // The flag means nothing without consent-based photography.
  const off = await room(page, { selfie: true });
  const info = await (
    await page.request.get(`/api/rooms/${off.pin}/info`)
  ).json();
  expect(info.selfie).toBe(false);
  await ctx.close();
});
