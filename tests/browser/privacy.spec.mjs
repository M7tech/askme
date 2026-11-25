import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const base = "http://127.0.0.1:3447",
  headers = { origin: base };
async function account(ctx) {
  const email = randomUUID() + "@example.test";
  const r = await ctx.post("/api/register", {
    headers,
    data: {
      name: "Instructor",
      organization: "Isolated seminar",
      email,
      password: randomUUID(),
    },
  });
  expect(r.status()).toBe(200);
}
test("organization boundaries, read-only result link, private photos and moderated Q&A", async ({
  request,
  playwright,
  page,
}) => {
  await account(request);
  const other = await playwright.request.newContext({ baseURL: base });
  await account(other);
  const q = await (
    await request.post("/api/quizzes", {
      headers,
      data: {
        title: "Observation",
        questions: [
          {
            type: "Single choice",
            prompt: "Identify the color",
            options: ["Blue", "Green"],
            key: "Blue",
            seconds: 0,
            points: 100,
          },
        ],
      },
    })
  ).json();
  expect((await other.get("/api/quizzes/" + q.id)).status()).toBe(404);
  const r = await (
    await request.post("/api/rooms", {
      headers,
      data: {
        quiz: q.id,
        release: "never",
        mode: "self",
        photography: true,
        private: true,
        passcode: "classroom pass",
      },
    })
  ).json();
  const route = "/api/rooms/" + r.pin + "/";
  expect((await other.get(route + "host")).status()).toBe(404);
  expect(
    (
      await other.post(route + "join", { headers, data: { name: "Guest" } })
    ).status(),
  ).toBe(403);
  const participant = await (
    await other.post(route + "join", {
      headers,
      data: { name: "Guest", passcode: "classroom pass" },
    })
  ).json();
  const person = { ...headers, "x-participant": participant.token };
  const bytes = await sharp({
    create: { width: 1600, height: 800, channels: 3, background: "#aa5566" },
  })
    .jpeg()
    .toBuffer();
  const photo = {
    image: { name: "photo.jpg", mimeType: "image/jpeg", buffer: bytes },
    moment: "Workshop",
  };
  expect(
    (
      await other.post(route + "photos", { headers: person, multipart: photo })
    ).status(),
  ).toBe(403);
  expect(
    (
      await other.post(route + "consent", {
        headers: person,
        data: { consent: true },
      })
    ).ok(),
  ).toBe(true);
  const upload = await other.post(route + "photos", {
    headers: person,
    multipart: photo,
  });
  expect(upload.ok()).toBe(true);
  const f = await upload.json();
  const image = await sharp(
    await (
      await other.get(route + "photos/" + f.id, { headers: person })
    ).body(),
  ).metadata();
  expect(image.width).toBe(1280);
  expect(image.format).toBe("webp");
  expect(image.exif).toBeUndefined();
  expect((await other.get(route + "photos/" + f.id)).status()).toBe(404);
  expect((await request.get(route + "photo-archive")).status()).toBe(200);
  await other.post(route + "consent", {
    headers: person,
    data: { consent: false },
  });
  expect(
    (await other.get(route + "photos/" + f.id, { headers: person })).status(),
  ).toBe(404);
  expect(
    (
      await other.post(route + "discuss", {
        headers: person,
        data: { body: "Can we review this?" },
      })
    ).ok(),
  ).toBe(true);
  const state = async () =>
    await (await other.get(route + "state", { headers: person })).json();
  expect((await state()).messages).toHaveLength(0);
  const host = await (await request.get(route + "host")).json();
  await request.post(route + "control", {
    headers,
    data: { action: "approve", message: host.messages[0].id },
  });
  expect((await state()).messages).toHaveLength(1);
  expect(
    (
      await other.post(route + "answer", {
        headers: { ...headers, "x-participant": participant.resultToken },
        data: { q: 0, value: "Blue" },
      })
    ).status(),
  ).toBe(403);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await other.post(route + "answer", {
          headers: person,
          data: { q: 0, value: "Blue" },
        })
      ).ok(),
    ).toBe(true);
  expect(
    (
      await other.post(route + "answer", {
        headers: person,
        data: { q: 0, value: "Green" },
      })
    ).status(),
  ).toBe(409);
  await request.post(route + "control", { headers, data: { action: "end" } });
  const results = await (
    await other.get(route + "results", {
      headers: { "x-results": participant.resultToken },
    })
  ).json();
  expect(results).not.toHaveProperty("score");
  expect(results.questions[0]).not.toHaveProperty("solution");
  expect(
    (await request.get(route + "qr/png?q=0")).headers()["content-type"],
  ).toContain("image/png");
  expect((await request.get(route + "report?format=xlsx")).status()).toBe(200);
  await page.goto("/#/join/" + r.pin);
  for (const lang of ["ar", "ckb"]) {
    await page.locator("#language").selectOption(lang);
    await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).toHaveAttribute("lang", lang);
  }
  await other.dispose();
});
