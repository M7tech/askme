import { test, expect } from "@playwright/test";

test("account pages redirect aliases to the configured origin before submitting", async ({
  page,
  request,
}) => {
  await page.goto("http://localhost:3447/?source=alias#/register");
  await expect(page).toHaveURL("http://127.0.0.1:3447/?source=alias#/register");
  await expect(
    page.getByRole("heading", { name: "Create your workspace" }),
  ).toBeVisible();
  const valid = await request.post("/api/register", {
    headers: { Origin: "http://127.0.0.1:3447" },
    data: {},
  });
  expect(valid.status()).toBe(400);
  expect((await valid.json()).error).not.toBe("Invalid request origin.");
  const invalid = await request.post("/api/register", {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(invalid.status()).toBe(403);
  expect((await invalid.json()).error).toBe("Invalid request origin.");
});
