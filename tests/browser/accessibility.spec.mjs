import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const route of ["", "login", "register", "preview/0"])
  test("accessibility scan " + (route || "home"), async ({ page }) => {
    await page.goto("/#/" + route);
    await expect(page.locator("main h1")).toBeVisible();
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      report.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });
