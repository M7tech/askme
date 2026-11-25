import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const type of ["Matching", "Drag and drop"])
  test(type + " saves and launches with paired fields", async ({ page }) => {
    await page.request.post("/api/register", {
      headers: { Origin: "http://127.0.0.1:3447" },
      data: {
        name: "Instructor",
        organization: "Matching regression",
        email: randomUUID() + "@example.test",
        password: randomUUID(),
      },
    });
    await page.goto("/#/editor");
    await page
      .getByLabel("Quiz title", { exact: true })
      .fill(type + " activity");
    await page.locator("[name=type]").selectOption(type);
    await page
      .getByLabel("Question (Markdown and $math$ supported)", { exact: true })
      .fill("Match each place to its country");
    await page.locator("[name=pairLabel0]").fill("بەغدا");
    await page.locator("[name=pairTarget0]").fill("عێراق");
    await page.locator("[name=pairLabel1]").fill("Paris");
    await page.locator("[name=pairTarget1]").fill("France");
    await page.getByRole("button", { name: "Add pair", exact: true }).click();
    await expect(page.locator("[data-pair]")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Remove pair", exact: true })
      .last()
      .click();
    await expect(page.locator("[data-pair]")).toHaveCount(2);
    await page.getByRole("button", { name: "Save quiz", exact: true }).click();
    await expect(page).toHaveURL(/#\/editor\/[a-f0-9-]+$/);
    await expect(page.locator("[name=pairTarget0]")).toHaveValue("عێراق");
    await page.reload();
    await expect(page.locator("[name=pairLabel1]")).toHaveValue("Paris");
    await page
      .getByRole("button", { name: "Launch session →", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create session", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start session", exact: true }),
    ).toBeVisible();
  });
