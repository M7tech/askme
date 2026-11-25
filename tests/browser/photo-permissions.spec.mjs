import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
test("guardian evidence and separate projector authorization are enforced", async ({
  request,
}) => {
  const headers = { origin: "http://127.0.0.1:3447" };
  await request.post("/api/register", {
    headers,
    data: {
      email: randomUUID() + "@example.test",
      password: randomUUID(),
      organization: "School",
      name: "Instructor",
    },
  });
  const quiz = await (
    await request.post("/api/quizzes", {
      headers,
      data: {
        title: "Workshop",
        questions: [{ type: "Survey", prompt: "What did you learn?" }],
      },
    })
  ).json();
  const room = await (
    await request.post("/api/rooms", {
      headers,
      data: { quiz: quiz.id, photography: true, guardian: true },
    })
  ).json();
  const route = "/api/rooms/" + room.pin + "/";
  const p = await (
    await request.post(route + "join", {
      headers,
      data: { name: "Student", consent: true },
    })
  ).json();
  const participant = { ...headers, "x-participant": p.token };
  const person = (await (await request.get(route + "host")).json()).people[0]
    .id;
  const pixels = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#7054e8" },
  })
    .png()
    .toBuffer();
  const multipart = {
    image: { name: "image.png", mimeType: "image/png", buffer: pixels },
  };
  const upload = () =>
    request.post(route + "photos", { headers: participant, multipart });
  expect((await upload()).status()).toBe(403);
  await request.post(route + "control", {
    headers,
    data: {
      action: "guardian",
      person,
      reference: "School authorization record 7",
    },
  });
  const f = await (await upload()).json();
  expect(f.id).toBeTruthy();
  const publish = () =>
    request.patch(route + "photos/" + f.id + "/publish", {
      headers,
      data: { published: true },
    });
  expect((await publish()).status()).toBe(403);
  await request.post(route + "consent", {
    headers: participant,
    data: { consent: true, publicPhoto: true },
  });
  expect((await request.get(route + "projected/" + f.id)).status()).toBe(404);
  expect((await publish()).ok()).toBe(true);
  expect((await request.get(route + "projected/" + f.id)).ok()).toBe(true);
  await request.post(route + "consent", {
    headers: participant,
    data: { consent: true, publicPhoto: false },
  });
  expect((await request.get(route + "projected/" + f.id)).status()).toBe(404);
  expect(
    (
      await request.get(route + "identification", { headers: participant })
    ).headers()["content-type"],
  ).toContain("image/png");
  const schema = await (await request.get("/api/openapi.json")).json();
  expect(schema.paths["/rooms/{pin}/answer"].post.security).toEqual([
    { participant: [] },
  ]);
});
