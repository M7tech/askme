import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3447",
  headers = { origin };
test("question formats, private keys, version conflicts and moderation of word responses", async ({
  request,
}) => {
  await request.post("/api/register", {
    headers,
    data: {
      name: "Tutor",
      organization: "Writers",
      email: randomUUID() + "@example.test",
      password: randomUUID(),
    },
  });
  const questions = [
    {
      type: "Matching",
      prompt: "Match a color",
      options: ["Sky|Blue", "Grass|Green"],
      key: "",
    },
    {
      type: "Word cloud",
      prompt: "Describe the activity",
      options: [],
      key: "",
    },
  ];
  const q = await (
    await request.post("/api/quizzes", {
      headers,
      data: { title: "Associations", questions },
    })
  ).json();
  const edit = { title: "Associations", questions, version: q.version };
  expect(
    (await request.put("/api/quizzes/" + q.id, { headers, data: edit })).ok(),
  ).toBe(true);
  expect(
    (
      await request.put("/api/quizzes/" + q.id, { headers, data: edit })
    ).status(),
  ).toBe(409);
  const room = await (
    await request.post("/api/rooms", {
      headers,
      data: { mode: "self", quiz: q.id, release: "manual" },
    })
  ).json();
  const route = "/api/rooms/" + room.pin + "/";
  const p = await (
    await request.post(route + "join", {
      headers,
      data: { name: "Participant" },
    })
  ).json();
  const h = { ...headers, "x-participant": p.token };
  const state = await (
    await request.get(route + "state?q=0", { headers: h })
  ).json();
  expect(state.question.options).toEqual([]);
  expect(state.question.targets).toEqual(["Blue", "Green"]);
  expect(JSON.stringify(state)).not.toContain("Sky|Blue");
  expect(
    (
      await request.post(route + "answer", {
        headers: h,
        data: { q: 0, value: ["Blue", "Green"] },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(route + "answer", {
        headers: h,
        data: { q: 1, value: "Curious" },
      })
    ).ok(),
  ).toBe(true);
  await request.post(route + "control", { headers, data: { action: "next" } });
  await request.post(route + "control", { headers, data: { action: "stats" } });
  const read = async () =>
    await (await request.get(route + "state?q=1", { headers: h })).json();
  expect((await read()).textStats).toEqual([]);
  const host = await (await request.get(route + "host")).json();
  expect(host.review).toHaveLength(1);
  await request.post(route + "control", {
    headers,
    data: { action: "approve-answer", ...host.review[0] },
  });
  expect((await read()).textStats).toEqual([{ value: "Curious", n: 1 }]);
  const csv = await request.post("/api/import", {
    headers,
    multipart: {
      file: {
        name: "quiz.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "prompt,type,options,key\nShape?,Single choice,Circle|Triangle,Circle",
        ),
      },
    },
  });
  expect((await csv.json())[0].options).toEqual(["Circle", "Triangle"]);
});
