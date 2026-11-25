const string = { type: "string" },
  boolean = { type: "boolean" },
  integer = { type: "integer" };
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
});
const question = object(
  {
    type: string,
    prompt: string,
    options: { type: "array", items: string },
    key: string,
    explanation: string,
    points: integer,
    seconds: integer,
  },
  ["type", "prompt"],
);
const quiz = object(
  {
    title: string,
    category: string,
    kind: { type: "string", enum: ["quiz", "presentation"] },
    questions: { type: "array", items: question },
    version: integer,
  },
  ["title", "questions"],
);
const bodies = {
  "POST /register": object(
    {
      name: string,
      organization: string,
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 12 },
    },
    ["name", "organization", "email", "password"],
  ),
  "POST /login": object({ email: string, password: string }, [
    "email",
    "password",
  ]),
  "POST /recover": object({ email: string }, ["email"]),
  "POST /redeem": object(
    {
      kind: { type: "string", enum: ["reset", "verify"] },
      token: string,
      password: string,
    },
    ["kind", "token"],
  ),
  "POST /quizzes": quiz,
  "PUT /quizzes/{id}": quiz,
  "POST /rooms": object(
    {
      quiz: string,
      mode: { type: "string", enum: ["live", "self"] },
      release: {
        type: "string",
        enum: [
          "immediate",
          "timer",
          "all",
          "manual",
          "end",
          "scheduled",
          "never",
        ],
      },
      max: integer,
      rank: boolean,
      anonymous: boolean,
      selfie: boolean,
      changes: boolean,
      repeat: boolean,
      graded: boolean,
      starts: string,
      releaseAt: string,
      private: boolean,
      passcode: string,
    },
    ["quiz"],
  ),
  "POST /rooms/{pin}/join": object({
    name: string,
    team: string,
    passcode: string,
    consent: boolean,
  }),
  "POST /rooms/{pin}/answer": object(
    {
      q: integer,
      value: {
        oneOf: [
          string,
          { type: "array", items: { oneOf: [string, { type: "number" }] } },
        ],
      },
      requestId: string,
    },
    ["q", "value"],
  ),
  "POST /rooms/{pin}/control": object(
    {
      action: {
        type: "string",
        enum: [
          "start",
          "pause",
          "resume",
          "extend",
          "next",
          "previous",
          "close",
          "end",
          "reveal",
          "stats",
          "feedback",
          "remove",
          "approve",
          "approve-answer",
        ],
      },
      person: string,
      feedback: string,
      message: string,
      q: integer,
      value: string,
    },
    ["action"],
  ),
  "POST /rooms/{pin}/discuss": object({ body: string, vote: string }),
  "POST /rooms/{pin}/consent": object(
    { consent: boolean, publicPhoto: boolean },
    ["consent"],
  ),
  "PATCH /profile": object({ name: string }, ["name"]),
  "DELETE /profile": object({ password: string }, ["password"]),
  "PATCH /org": object({ name: string }, ["name"]),
  "POST /org/member": object({ name: string, email: string }, [
    "name",
    "email",
  ]),
  "PATCH /org/member/{id}": object(
    { role: { type: "string", enum: ["lecturer", "admin"] } },
    ["role"],
  ),
  "POST /ai": object({ topic: string }, ["topic"]),
};
export function installOpenApi(app) {
  const paths = {};
  for (const layer of app.router.stack) {
    const route = layer.route;
    if (!route || !route.path.startsWith("/api/")) continue;
    const path = route.path.slice(4).replace(/:([a-zA-Z]+)/g, "{$1}");
    for (const method of Object.keys(route.methods)) {
      const key = method.toUpperCase() + " " + path;
      const protectedRoute = route.stack.some((s) => s.handle.name === "auth");
      const security = protectedRoute
        ? [{ lecturerCookie: [] }]
        : path.includes("/results")
          ? [{ privateResult: [] }]
          : /\/answer$|\/consent$|\/discuss$/.test(path)
            ? [{ participant: [] }]
            : path.includes("/photos")
              ? [{ participant: [] }, { lecturerCookie: [] }]
              : [];
      const op = {
        operationId:
          method +
          "_" +
          path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
        security,
        parameters: [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
          in: "path",
          name: m[1],
          required: true,
          schema: string,
        })),
        responses: {
          200: { description: "Successful operation" },
          default: {
            description: "Request error",
            content: {
              "application/json": {
                schema: object({ error: string }, ["error"]),
              },
            },
          },
        },
      };
      if (bodies[key])
        op.requestBody = {
          required: true,
          content: { "application/json": { schema: bodies[key] } },
        };
      if (
        method === "post" &&
        [
          "/import",
          "/assets",
          "/import/document",
          "/rooms/{pin}/photos",
        ].includes(path)
      ) {
        const name = path.endsWith("/photos") ? "image" : "file";
        op.requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: object(
                {
                  [name]: { type: "string", format: "binary" },
                  moment: string,
                  person: string,
                },
                [name],
              ),
            },
          },
        };
      }
      (paths[path] ||= {})[method] = op;
    }
  }
  app.get("/api/openapi.json", (req, res) =>
    res.json({
      openapi: "3.0.3",
      info: { title: "AskShaubo API", version: "0.1.0" },
      servers: [{ url: "/api" }],
      components: {
        securitySchemes: {
          lecturerCookie: {
            type: "apiKey",
            in: "cookie",
            name: "chorus_session",
          },
          participant: { type: "apiKey", in: "header", name: "X-Participant" },
          privateResult: { type: "apiKey", in: "header", name: "X-Results" },
        },
      },
      paths,
    }),
  );
}
