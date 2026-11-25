import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3447",
  headers = { Origin: origin };
// One shared account: the server limits registrations per minute.
let cookies;
test.beforeAll(async ({ playwright }) => {
  const account = await playwright.request.newContext({ baseURL: origin });
  await account.post("/api/register", {
    headers,
    data: {
      name: "Instructor",
      organization: "Design checks",
      email: randomUUID() + "@example.test",
      password: randomUUID(),
    },
  });
  cookies = (await account.storageState()).cookies;
  await account.dispose();
});
async function lecturer(page) {
  await page.context().addCookies(cookies);
  const quiz = await (
    await page.request.post("/api/quizzes", {
      headers,
      data: {
        title: "Formation of contracts",
        questions: [
          {
            type: "Single choice",
            prompt: "When is a contract formed?",
            options: ["On acceptance", "On offer", "On payment"],
            key: "On acceptance",
            seconds: 0,
          },
          { type: "Word cloud", prompt: "Good faith means", options: [] },
        ],
      },
    })
  ).json();
  const room = await (
    await page.request.post("/api/rooms", {
      headers,
      data: {
        quiz: quiz.id,
        mode: "live",
        release: "manual",
        rank: true,
        photography: true,
      },
    })
  ).json();
  return { quiz, room };
}
const scan = async (page) =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
// A hash change keeps the previous screen until the next is ready.
async function open(page, route) {
  await page.goto("about:blank");
  await page.goto("/#/" + route);
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const overflowing = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width &&
          (r.right > innerWidth + 1 || r.left < -1) &&
          !e.closest(".scroll, .outline-list, .sr")
        );
      })
      .slice(0, 5)
      .map((e) => e.tagName + "." + (e.className.baseVal ?? e.className)),
  );
const fits = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

for (const [theme, locale] of [
  ["light", "en"],
  ["dark", "ckb"],
])
  test(`every workspace screen is accessible and fits: ${theme} ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const { quiz, room } = await lecturer(page);
    await page.addInitScript(
      ([t, l]) => {
        localStorage.setItem("theme", t);
        localStorage.setItem("chorus.locale", l);
      },
      [theme, locale],
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 820, 360]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "",
        "help",
        "dashboard",
        "library",
        "presentations",
        "bank",
        "sessions",
        "settings",
        "certificates",
        "editor",
        "editor/" + quiz.id,
        "launch/" + quiz.id,
        "host/" + room.pin,
        "display/" + room.pin,
        "join/" + room.pin,
        "host-gallery/" + room.pin,
        "mark/" + room.pin,
      ]) {
        await open(page, route);
        expect(await fits(page), `${route} at ${width}`).toBe(true);
        expect(await scan(page), `${route} at ${width}`).toEqual([]);
      }
    }
  });

test("largest text size keeps phone screens inside the viewport", async ({
  page,
}) => {
  const { quiz, room } = await lecturer(page);
  await page.addInitScript(() =>
    localStorage.setItem("chorus.fontSize", "150"),
  );
  await page.setViewportSize({ width: 360, height: 780 });
  for (const route of [
    "",
    "login",
    "dashboard",
    "library",
    "settings",
    "editor/" + quiz.id,
    "launch/" + quiz.id,
    "host/" + room.pin,
    "join/" + room.pin,
  ]) {
    await open(page, route);
    if (!(await fits(page))) expect(await overflowing(page), route).toEqual([]);
    expect(await fits(page), route).toBe(true);
  }
});

test("hero answer seats the visitor and regroups the room", async ({
  page,
}) => {
  await page.goto("/");
  const pick = page.getByRole("button", { name: "Coral and peach" });
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#verdict")).toContainText("Not this time.");
  await expect(page.locator(".columns text")).toHaveCount(4);
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(page.locator(".columns text")).toHaveCount(0);
  await expect(pick).toHaveAttribute("aria-pressed", "false");
});

test("validation is inline, linked to its field and translated", async ({
  page,
}) => {
  await page.goto("/#/register");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const name = page.getByLabel("Your name");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Fill in this field.");
  await name.fill("Avery");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  const password = page.getByLabel("Password");
  await password.pressSequentially("short");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(password).toHaveAccessibleDescription(
    "Use at least 12 characters.",
  );
  await page.locator("#global-language").selectOption("ar");
  await page.goto("/#/login");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.locator(".field-error").first()).toContainText(
    "املأ هذا الحقل.",
  );
});

test("option rows record the correct answer and drop blanks", async ({
  page,
}) => {
  await lecturer(page);
  await page.goto("/#/editor");
  await page.getByLabel("Quiz title", { exact: true }).fill("Options");
  await page.locator("[name=prompt]").fill("Pick two");
  await page.locator("[name=type]").selectOption("Multiple choice");
  await page.getByLabel("Option 1", { exact: true }).fill("Duress");
  await page.getByLabel("Option 2", { exact: true }).fill("Mistake");
  await page.getByLabel("Option 2", { exact: true }).press("Enter");
  await expect(page.getByLabel("Option 3", { exact: true })).toBeFocused();
  await page.getByLabel("Option 3", { exact: true }).fill("Regret");
  await page.getByRole("button", { name: "Add option" }).click();
  await page.getByLabel("Option 1 is correct").check();
  await page.getByLabel("Option 2 is correct").check();
  await page.getByRole("button", { name: "Save quiz" }).click();
  await expect(page).toHaveURL(/#\/editor\/[a-f0-9-]+$/);
  const id = page.url().split("/").pop();
  const saved = await (await page.request.get("/api/quizzes/" + id)).json();
  expect(saved.document[0].options).toEqual(["Duress", "Mistake", "Regret"]);
  expect(saved.document[0].key).toBe("Duress|Mistake");
  await page.reload();
  await expect(page.getByLabel("Option 2 is correct")).toBeChecked();
  await expect(page.getByLabel("Option 3 is correct")).not.toBeChecked();
});

test("ending a session and deleting a quiz ask first", async ({ page }) => {
  const { quiz, room } = await lecturer(page);
  await page.goto("/#/host/" + room.pin);
  await page.getByRole("button", { name: "Start session" }).click();
  const end = page.getByRole("button", { name: "End session" });
  await end.click();
  const dialog = page.getByRole("dialog", { name: "End this session?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(end).toBeFocused();
  await end.click();
  await dialog.getByRole("button", { name: "End session" }).click();
  await expect(page.locator(".with-chip .chip")).toHaveText("ended");
  await page.goto("/#/editor/" + quiz.id);
  await page.getByText("Import, export and manage quiz").click();
  await page.getByRole("button", { name: "Delete quiz" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete quiz" })
    .click();
  await expect(page).toHaveURL(/#\/library$/);
  expect((await page.request.get("/api/quizzes/" + quiz.id)).status()).toBe(
    404,
  );
});

test("live redraws keep typed feedback", async ({ page, playwright }) => {
  const { room } = await lecturer(page);
  const guest = await playwright.request.newContext({ baseURL: origin });
  const join = (name) =>
    guest.post(`/api/rooms/${room.pin}/join`, { headers, data: { name } });
  await join("Sara");
  await page.goto("/#/host/" + room.pin);
  await page.locator("#people summary").first().click();
  const note = page.getByLabel("Private feedback");
  await note.fill("Strong reasoning");
  await join("Dilan");
  await expect(page.locator("#people summary")).toHaveCount(2);
  await expect(page.locator("#people textarea:visible")).toHaveValue(
    "Strong reasoning",
  );
  await guest.dispose();
});

test("phone navigation opens every section and display preferences", async ({
  page,
}) => {
  await lecturer(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/dashboard");
  await expect(page.getByRole("link", { name: "Presentations" })).toBeHidden();
  const more = page.getByRole("button", { name: "More" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Presentations" }).click();
  await expect(
    page.getByRole("heading", { name: "Presentations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Display preferences" }).click();
  await page.getByRole("switch", { name: "Dark theme" }).check({ force: true });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
