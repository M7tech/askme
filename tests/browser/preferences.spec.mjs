import { test, expect } from "@playwright/test";
test("global languages, RTL and persistent font sizing", async ({ page }) => {
  await page.goto("/#/preview/1");
  await page.locator("#global-language").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(
    page.getByRole("button", { name: "أرسل الإجابة التجريبية" }),
  ).toBeVisible();
  await page.locator("#font-increase").click();
  await expect(page.locator("#font-level")).toContainText(await page.evaluate(()=>new Intl.NumberFormat("ar").format(110)));
  expect(
    await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    ),
  ).toBeCloseTo(17.6);
  await page.reload();
  expect(
    await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    ),
  ).toBeCloseTo(17.6);
  await page.locator("#global-language").selectOption("ckb");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("button", { name: "وەڵامی تاقیکردنەوە بنێرە" }),
  ).toBeVisible();
  await page.goto("/#/login");
  await expect(page.getByLabel("ناونیشانی ئیمەیڵ")).toBeVisible();
  await page.locator("#global-language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.locator("#font-decrease").click();
  await expect(page.locator("#font-level")).toHaveText("100%");
  await page.setViewportSize({ width: 360, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
