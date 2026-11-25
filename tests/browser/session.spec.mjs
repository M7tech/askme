import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("lecturer launches a quiz and releases a private result", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make room for every answer." }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/home.png", fullPage: true });
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByLabel("Your name").fill("Avery");
  await page.getByLabel("Organization").fill("Seminar");
  await page.getByLabel("Email address").fill(randomUUID() + "@example.test");
  await page.getByLabel("Password").fill(randomUUID());
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your teaching workspace." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Quiz library", exact: true }).click();
  await page.getByRole("link", { name: "Use template" }).first().click();
  await page.getByRole("button", { name: "Launch session" }).click();
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start session" }),
  ).toBeVisible();
  const pin = page.url().split("/").pop();
  const participant = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobile = await participant.newPage();
  await mobile.goto("http://127.0.0.1:3447/#/join/" + pin);
  await mobile.getByLabel("Your name").fill("Sam");
  await mobile.getByRole("button", { name: "Join session" }).click();
  await expect(
    mobile.getByRole("heading", { name: "Waiting for the presenter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start session" }).click();
  await mobile.getByRole("button", { name: /Navy and ivory/ }).click();
  await mobile.getByRole("button", { name: "Submit response" }).click();
  await expect(mobile.getByText(/Response recorded/)).toBeVisible();
  await mobile.reload();
  await expect(mobile.getByText(/Response recorded/)).toBeVisible();
  const url = await mobile
    .getByRole("link", { name: "My private results" })
    .getAttribute("href");
  const raw = url.split("/").pop();
  const getResults = () =>
    mobile.request
      .get("http://127.0.0.1:3447/api/rooms/" + pin + "/results", {
        headers: { "x-results": raw },
      })
      .then((r) => r.json());
  expect((await getResults()).questions[0]).not.toHaveProperty("solution");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect.poll(async () => (await getResults()).score).toBe(100);
  await mobile.getByRole("link", { name: "My private results" }).click();
  await expect(mobile.getByText("✓ Correct · 100 points")).toBeVisible();
  await mobile.screenshot({
    path: "docs/screenshots/mobile-results.png",
    fullPage: true,
  });
  await participant.close();
});
for (const width of [360, 393, 412])
  test("mobile home fits " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Join session" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
