import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3447",
  headers = { Origin: origin };
let cookies;
test.beforeAll(async ({ playwright }) => {
  const c = await playwright.request.newContext({ baseURL: origin });
  await c.post("/api/register", {
    headers,
    data: {
      name: "Instructor",
      organization: "Text answers",
      email: randomUUID() + "@example.test",
      password: randomUUID(),
    },
  });
  cookies = (await c.storageState()).cookies;
  await c.dispose();
});
test.beforeEach(({ page }) => page.context().addCookies(cookies));

for (const [type, key, typed] of [
  ["Text answer", "Baghdad", "baghdad"],
  ["Fill in the blank", "Law", "law"],
  ["Numeric", "42", "42"],
  ["Survey", "", "Useful"],
])
  test(
    type + " made by switching the format can be answered",
    async ({ page, browser }) => {
      await page.goto("/#/editor");
      await page.getByLabel("Quiz title", { exact: true }).fill(type);
      await page.locator("[name=type]").selectOption(type);
      await page.locator("[name=prompt]").fill("Prompt");
      if (key) await page.locator("[name=key]").fill(key);
      await page.getByRole("button", { name: "Launch session" }).click();
      await page.getByRole("button", { name: "Create session" }).click();
      await expect(page).toHaveURL(/#\/host\/\d{6}$/);
      const pin = page.url().split("/").pop();
      const ctx = await browser.newContext({ baseURL: origin });
      const phone = await ctx.newPage();
      await phone.goto("/#/join/" + pin);
      await phone.getByLabel("Your name").fill("Sara");
      await phone.getByRole("button", { name: "Join session" }).click();
      await page.getByRole("button", { name: "Start session" }).click();
      const box = phone.getByLabel("Your response");
      await box.fill(typed);
      // A presenter action mid-answer must not wipe what the student typed.
      await page.getByRole("button", { name: "Show statistics" }).click();
      await expect(
        page.getByRole("button", { name: "Hide statistics" }),
      ).toBeVisible();
      await phone.waitForTimeout(900);
      await expect(box).toHaveValue(typed);
      await phone.getByRole("button", { name: "Submit response" }).click();
      await expect(phone.getByText(/Response recorded/)).toBeVisible();
      // Typed answers stay out of the public distribution until approved.
      const state = await (
        await phone.request.get(`/api/rooms/${pin}/state`)
      ).json();
      expect(state.question.options).toEqual([]);
      expect(state.distribution).toBeUndefined();
      await ctx.close();
    },
  );

/* ---- Automatic sessions ---- */
async function session(page, questions, config) {
  const quiz = await (
    await page.request.post("/api/quizzes", {
      headers,
      data: { title: "Automatic", questions },
    })
  ).json();
  const { pin } = await (
    await page.request.post("/api/rooms", {
      headers,
      data: { quiz: quiz.id, ...config },
    })
  ).json();
  const path = `/api/rooms/${pin}/`;
  return {
    pin,
    control: (action) =>
      page.request.post(path + "control", { headers, data: { action } }),
    state: async () => (await page.request.get(path + "state")).json(),
    join: async (name) =>
      (
        await page.request.post(path + "join", { headers, data: { name } })
      ).json(),
    answer: (person, q, value) =>
      page.request.post(path + "answer", {
        headers: { ...headers, "x-participant": person.token },
        data: { q, value, requestId: randomUUID() },
      }),
  };
}
const poll = (prompt, seconds = 0) => ({
  type: "Poll",
  prompt,
  options: ["Yes", "No"],
  seconds,
});
const at = (room) => async () => {
  const s = await room.state();
  return s.phase + " " + s.position;
};

test("questions advance when everyone has answered and the session ends itself", async ({
  page,
  browser,
}) => {
  const room = await session(page, [poll("First?"), poll("Second?")], {
    advance: "auto",
    autoBreak: 2,
    autoSeconds: 60,
  });
  const ctx = await browser.newContext({ baseURL: origin });
  const phone = await ctx.newPage();
  await phone.goto("/#/join/" + room.pin);
  await phone.getByLabel("Your name").fill("Sara");
  await phone.getByRole("button", { name: "Join session" }).click();
  const other = await room.join("Dilan");
  await room.control("start");
  await phone.getByRole("button", { name: /Yes/ }).click();
  await phone.getByRole("button", { name: "Submit response" }).click();
  await expect(phone.getByText(/Response recorded/)).toBeVisible();
  // One answer is missing, so the room waits.
  await page.waitForTimeout(2500);
  expect(await at(room)()).toBe("open 0");
  await room.answer(other, 0, "No");
  await expect(phone.getByText("Next question in")).toBeVisible();
  await expect(phone.getByText("Second?")).toBeVisible();
  expect(await at(room)()).toBe("open 1");
  await phone.getByRole("button", { name: /No/ }).click();
  await phone.getByRole("button", { name: "Submit response" }).click();
  await room.answer(other, 1, "No");
  await expect(
    phone.getByRole("heading", { name: "Session complete" }),
  ).toBeVisible();
  await ctx.close();
});

test("untimed questions use the chosen limit and nobody is needed", async ({
  page,
}) => {
  const room = await session(page, [poll("First?"), poll("Second?")], {
    advance: "auto",
    autoBreak: 0,
    autoSeconds: 5,
  });
  await room.join("Sara");
  await room.control("start");
  expect((await room.state()).deadline).toBeGreaterThan(0);
  await expect.poll(at(room), { timeout: 12000 }).toBe("open 1");
  await expect.poll(at(room), { timeout: 12000 }).toBe("ended 1");
});

test("changeable answers wait for the timer, and manual sessions stay manual", async ({
  page,
}) => {
  const changing = await session(page, [poll("First?"), poll("Second?")], {
    advance: "auto",
    autoBreak: 0,
    autoSeconds: 60,
    changes: true,
  });
  const manual = await session(page, [poll("First?", 5), poll("Second?")], {});
  for (const room of [changing, manual]) {
    const p = await room.join("Sara");
    await room.control("start");
    await room.answer(p, 0, "Yes");
  }
  await page.waitForTimeout(7000);
  expect(await at(changing)()).toBe("open 0");
  expect(await at(manual)()).toBe("open 0");
});

test("presenter can hold, resume and switch automatic mode while running", async ({
  page,
}) => {
  const room = await session(page, [poll("First?"), poll("Second?")], {
    autoBreak: 4,
  });
  const p = await room.join("Sara");
  await page.goto("/#/host/" + room.pin);
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Advance automatically" }).click();
  await expect(page.getByText("Questions advance automatically")).toBeVisible();
  expect((await room.state()).deadline).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Turn off automatic" }).click();
  await expect.poll(async () => (await room.state()).deadline).toBe(0);
  await page.getByRole("button", { name: "Advance automatically" }).click();
  await expect(page.getByText("Questions advance automatically")).toBeVisible();
  await room.answer(p, 0, "Yes");
  await expect(page.locator("#next-in")).toHaveText(/[1-4]/);
  await page.getByRole("button", { name: "Hold here" }).click();
  await expect(page.getByText("On hold")).toBeVisible();
  await page.waitForTimeout(5000);
  expect(await at(room)()).toBe("closed 0");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect.poll(at(room)).toBe("open 1");
});

test("self-paced students move on after each answer", async ({
  page,
  browser,
}) => {
  await page.goto("about:blank");
  const quiz = await (
    await page.request.post("/api/quizzes", {
      headers,
      data: { title: "Self", questions: [poll("First?"), poll("Second?")] },
    })
  ).json();
  await page.goto("/#/launch/" + quiz.id);
  await page.getByLabel("Move between questions").selectOption("auto");
  await expect(page.getByLabel("Seconds between questions")).toBeVisible();
  await page.getByLabel("Participation mode").selectOption("self");
  await expect(page.getByLabel("Seconds between questions")).toHaveCount(0);
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page).toHaveURL(/#\/host\/\d{6}$/);
  const pin = page.url().split("/").pop();
  const ctx = await browser.newContext({ baseURL: origin });
  const phone = await ctx.newPage();
  await phone.goto("/#/join/" + pin);
  await phone.getByLabel("Your name").fill("Sara");
  await phone.getByRole("button", { name: "Join session" }).click();
  await phone.getByRole("button", { name: /Yes/ }).click();
  await phone.getByRole("button", { name: "Submit response" }).click();
  await expect(phone.getByText("Second?")).toBeVisible();
  await phone.getByRole("button", { name: /No/ }).click();
  await phone.getByRole("button", { name: "Submit response" }).click();
  await expect(phone.getByText(/Response recorded/)).toBeVisible();
  await phone.waitForTimeout(2500);
  await expect(phone.getByText("Second?")).toBeVisible();
  await ctx.close();
});

/* ---- Marking typed answers ---- */
test("typed answers are marked after the session and reach results", async ({
  page,
  browser,
}) => {
  const room = await session(
    page,
    [
      { type: "Text answer", prompt: "Explain good faith", points: 10 },
      { type: "Text answer", prompt: "Capital?", key: "Baghdad", points: 5 },
    ],
    { release: "end", rank: true },
  );
  const sara = await room.join("Sara"),
    dilan = await room.join("Dilan");
  await room.control("start");
  await room.answer(sara, 0, "Honesty between the parties");
  await room.answer(dilan, 0, "No idea");
  await room.control("next");
  await room.answer(sara, 1, "baghdad");
  await room.answer(dilan, 1, "Bagdad");
  await room.control("end");
  const results = async (p) =>
    (
      await page.request.get(`/api/rooms/${room.pin}/results`, {
        headers: { "x-results": p.resultToken },
      })
    ).json();
  expect((await results(sara)).questions[0].unmarked).toBe(true);
  expect((await results(sara)).score).toBe(5);

  await page.goto("/#/host/" + room.pin);
  await page.getByRole("link", { name: "Mark answers" }).click();
  await expect(page.getByText("3 answers to mark")).toBeVisible();
  const row = (text) => page.locator(".mark-row", { hasText: text });
  // Out of range is refused beside the field.
  const honest = row("Honesty");
  await honest.getByLabel("Points").fill("11");
  await honest.getByRole("button", { name: "Save points" }).click();
  await expect(honest.getByText("Enter a number from 0 to 10.")).toBeVisible();
  await honest.getByLabel("Points").fill("7");
  await honest.getByRole("button", { name: "Save points" }).click();
  await expect(page.getByText("2 answers to mark")).toBeVisible();
  await row("No idea").getByRole("button", { name: "No points" }).click();
  // A near miss the key rejected can still earn full points.
  await row("Bagdad").getByRole("button", { name: "Full points" }).click();
  await expect(page.getByText("Every answer is marked.")).toBeVisible();
  await page.getByLabel("Show", { exact: true }).selectOption("all");
  await expect(page.locator(".mark-row")).toHaveCount(4);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  const s = await results(sara),
    d = await results(dilan);
  expect([s.score, d.score]).toEqual([12, 5]);
  expect(s.questions[0]).toMatchObject({ points: 7, unmarked: false });
  expect(d.questions[1]).toMatchObject({ points: 5, correct: true });
  const ctx = await browser.newContext({ baseURL: origin });
  const phone = await ctx.newPage();
  await phone.goto(`/#/results/${room.pin}/${sara.resultToken}`);
  await expect(phone.getByText(/7 points/)).toBeVisible();
  await ctx.close();
});

test("marks are private to the lecturer and reset when an answer changes", async ({
  page,
  playwright,
}) => {
  const room = await session(
    page,
    [{ type: "Text answer", prompt: "Explain", points: 10 }, poll("Choice?")],
    { changes: true },
  );
  const p = await room.join("Sara");
  await room.control("start");
  await room.answer(p, 0, "First");
  const mark = (data, ctx = page.request) =>
    ctx.post(`/api/rooms/${room.pin}/control`, {
      headers,
      data: { action: "mark", person: person.id, q: 0, ...data },
    });
  const host = await (
    await page.request.get(`/api/rooms/${room.pin}/host`)
  ).json();
  const person = host.people[0];
  const guest = await playwright.request.newContext({ baseURL: origin });
  expect((await mark({ value: "First", points: 10 }, guest)).ok()).toBe(false);
  expect((await guest.get(`/api/rooms/${room.pin}/marking`)).ok()).toBe(false);
  await guest.dispose();
  expect((await mark({ value: "First", points: 99 })).status()).toBe(400);
  expect((await mark({ value: "First", points: 10 })).ok()).toBe(true);
  await room.answer(p, 0, "Second");
  expect((await mark({ value: "First", points: 10 })).status()).toBe(409);
  expect((await mark({ q: 1, value: "Yes", points: 1 })).status()).toBe(400);
  const { questions } = await (
    await page.request.get(`/api/rooms/${room.pin}/marking`)
  ).json();
  expect(questions).toHaveLength(1);
  expect(questions[0].answers[0]).toMatchObject({
    value: "Second",
    marked: false,
    points: 0,
  });
});
