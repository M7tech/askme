import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { createClient } from "redis";
import { createMailer } from "./mail.mjs";
import { rows, one, transaction } from "./db.mjs";
import { id, token, hash, password, check, str, cleanQuiz } from "./model.mjs";
import { installEngagement } from "./engagement.mjs";
import { installAdmin, preferences } from "./admin.mjs";
import { installAccounts } from "./accounts.mjs";
import { installRooms } from "./rooms.mjs";
import { installContent } from "./content.mjs";
import { installOpenApi } from "./openapi.mjs";
import { installMedia } from "./media.mjs";
const app = express(),
  server = http.createServer(app),
  sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const origin = process.env.PUBLIC_ORIGIN,
  production = process.env.NODE_ENV === "production";
if (production && !/^https:\/\//.test(origin || ""))
  throw Error("Set PUBLIC_ORIGIN to the public HTTPS origin.");
const redis = process.env.REDIS_URL
  ? await createClient({ url: process.env.REDIS_URL })
      .on("error", (e) => console.error(e.message))
      .connect()
  : null;
const channels = new Map();
function broadcast(pin) {
  for (const ws of channels.get(pin) || [])
    if (ws.readyState === 1) ws.send("refresh");
}
const pendingNotifications = new Set();
function notify(pin) {
  if (pendingNotifications.has(pin)) return;
  pendingNotifications.add(pin);
  setTimeout(async () => {
    pendingNotifications.delete(pin);
    try {
      if (redis) await redis.publish("chorus:rooms", pin);
      else broadcast(pin);
    } catch (error) {
      console.error(error.message);
    }
  }, 80);
}
if (redis) {
  const sub = redis.duplicate();
  await sub.connect();
  await sub.subscribe("chorus:rooms", broadcast);
}
server.on("upgrade", (req, socket, head) => {
  const match = /^\/live\/(\d{6})$/.exec(req.url);
  if (!match || req.headers.origin !== (origin || "http://" + req.headers.host))
    return socket.destroy();
  sockets.handleUpgrade(req, socket, head, (ws) => {
    const pin = match[1];
    if (!channels.has(pin)) channels.set(pin, new Set());
    channels.get(pin).add(ws);
    ws.on("error", () => ws.terminate());
    ws.on("message", () => ws.close(1008));
    ws.on("close", () => {
      const set = channels.get(pin);
      set?.delete(ws);
      if (!set?.size) channels.delete(pin);
    });
  });
});
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(self), microphone=()",
  });
  if (production) res.set("Strict-Transport-Security", "max-age=31536000");
  if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    check(
      req.get("origin") === (origin || req.protocol + "://" + req.get("host")),
      "Invalid request origin.",
      403,
    );
  next();
});
app.use(express.json({ limit: "1mb" }));
const limits = new Map();
setInterval(() => {
  for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
}, 60000).unref();
async function limit(key, count) {
  const k = "chorus:rate:" + hash(key);
  if (redis) {
    const n = await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
      { keys: [k], arguments: [] },
    );
    check(n <= count, "Please try again in a minute.", 429);
    return;
  }
  let item = limits.get(k);
  if (!item || item.until < Date.now()) {
    item = { n: 0, until: Date.now() + 60000 };
    limits.set(k, item);
  }
  check(++item.n <= count, "Please try again in a minute.", 429);
}
const sessionCookie = {
  httpOnly: true,
  sameSite: "strict",
  secure: production,
  path: "/",
  maxAge: 7 * 86400000,
};
const parseCookie = (req) =>
  /\bchorus_session=([\w-]+)/.exec(req.get("cookie") || "")?.[1] || "";
app.use("/api", async (req, res, next) => {
  const cookie = parseCookie(req);
  if (cookie)
    req.user = await one(
      "SELECT u.id,u.name,u.email,u.org,u.role,u.verified,o.name AS organization FROM credentials c JOIN users u ON u.id=c.uid JOIN organizations o ON o.id=u.org WHERE c.token=$1 AND c.purpose='login' AND c.expires>$2 AND NOT u.suspended",
      [hash(cookie), Date.now()],
    );
  next();
});
const auth = (req, res, next) => {
  check(req.user, "Sign in to continue.", 401);
  next();
};
const manage = (u, record) => {
  check(
    u &&
      record &&
      (u.role === "super" ||
        (u.org === record.org &&
          (u.role === "admin" || record.owner === u.id))),
    "Item unavailable.",
    404,
  );
};
const audit = (u, action) =>
  rows("INSERT INTO audit VALUES($1,$2,$3,$4,$5)", [
    id(),
    u.id,
    u.org,
    action,
    Date.now(),
  ]);
async function issue(uid, purpose, ms) {
  const raw = token();
  await rows("INSERT INTO credentials VALUES($1,$2,$3,$4)", [
    hash(raw),
    uid,
    purpose,
    Date.now() + ms,
  ]);
  return raw;
}
const smtp = createMailer();
const mail = {
  available: !!smtp,
  link: (kind, raw, req) =>
    (origin || req.protocol + "://" + req.get("host")) +
    "/#/" +
    kind +
    "/" +
    raw,
  send: (to, link) =>
    smtp.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: "Ask account access",
      text: "Open this private link within one hour.\n" + link,
    }),
};
async function sendLink(u, kind) {
  const raw = await issue(u.id, kind, 3600000);
  await mail.send(u.email, origin + "/#/" + kind + "/" + raw);
}
app.get("/health", async (req, res) => {
  await one("SELECT 1");
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => res.json(req.user || null));
app.post("/api/register", async (req, res) => {
  await limit(req.ip + "register", 10);
  check(
    (await preferences("platform")).registration !== false,
    "Organization registration is closed.",
    403,
  );
  const b = req.body,
    email = str(b.email, 254).toLowerCase(),
    uid = id(),
    org = id();
  check(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      str(b.name) &&
      str(b.organization),
    "Enter your name, email and organization.",
  );
  check(
    typeof b.password === "string" &&
      b.password.length >= 12 &&
      b.password.length <= 256,
    "Use a password between 12 and 256 characters.",
  );
  const digest = await password(b.password);
  await transaction(async (c) => {
    await c.query("INSERT INTO organizations VALUES($1,$2)", [
      org,
      str(b.organization),
    ]);
    await c.query(
      "INSERT INTO users(id,org,email,name,password,role) VALUES($1,$2,$3,$4,$5,'admin')",
      [uid, org, email, str(b.name), digest],
    );
  });
  if (smtp) await sendLink({ id: uid, email }, "verify");
  res
    .cookie(
      "chorus_session",
      await issue(uid, "login", sessionCookie.maxAge),
      sessionCookie,
    )
    .json({ ok: true });
});
app.post("/api/login", async (req, res) => {
  await limit(req.ip + "login", 40);
  const email = str(req.body.email, 254).toLowerCase();
  await limit("account:" + email, 10);
  const u = await one("SELECT * FROM users WHERE email=$1", [email]);
  check(
    typeof req.body.password === "string" &&
      req.body.password.length <= 256 &&
      u &&
      (await password(req.body.password, u.password)),
    "Email or password is incorrect.",
    401,
  );
  check(
    !u.suspended,
    "This account is suspended. Contact the platform administrator.",
    403,
  );
  res
    .cookie(
      "chorus_session",
      await issue(u.id, "login", sessionCookie.maxAge),
      sessionCookie,
    )
    .json({ ok: true });
});
app.post("/api/logout", async (req, res) => {
  await rows("DELETE FROM credentials WHERE token=$1", [
    hash(parseCookie(req)),
  ]);
  res.clearCookie("chorus_session", { path: "/" }).json({ ok: true });
});
app.post("/api/recover", async (req, res) => {
  check(
    smtp,
    "Email delivery is unavailable. Contact your administrator.",
    503,
  );
  await limit(req.ip + "recover", 5);
  const u = await one("SELECT id,email FROM users WHERE email=$1", [
    str(req.body.email).toLowerCase(),
  ]);
  if (u) await sendLink(u, "reset");
  res.json({ ok: true });
});
app.post("/api/redeem", async (req, res) => {
  const kind = req.body.kind;
  check(["verify", "reset"].includes(kind), "Invalid link.");
  let digest;
  if (kind === "reset") {
    check(
      typeof req.body.password === "string" &&
        req.body.password.length >= 12 &&
        req.body.password.length <= 256,
      "Use a password between 12 and 256 characters.",
    );
    digest = await password(req.body.password);
  }
  await transaction(async (c) => {
    const {
      rows: [v],
    } = await c.query(
      "DELETE FROM credentials WHERE token=$1 AND purpose=$2 AND expires>$3 RETURNING uid",
      [hash(str(req.body.token)), kind, Date.now()],
    );
    check(v, "Link expired or already used.");
    if (digest) {
      await c.query("UPDATE users SET password=$1 WHERE id=$2", [
        digest,
        v.uid,
      ]);
      await c.query(
        "DELETE FROM credentials WHERE uid=$1 AND purpose IN ('login','reset')",
        [v.uid],
      );
    } else await c.query("UPDATE users SET verified=true WHERE id=$1", [v.uid]);
  });
  res.json({ ok: true });
});
app.patch("/api/profile", auth, async (req, res) => {
  check(str(req.body.name), "Enter a name.");
  await rows("UPDATE users SET name=$1 WHERE id=$2", [
    str(req.body.name),
    req.user.id,
  ]);
  res.json({ ok: true });
});
app.get("/api/org", auth, async (req, res) => {
  check(req.user.role !== "lecturer", "Administrator access required.", 403);
  res.json(
    await rows(
      "SELECT id,name,email,role FROM users WHERE org=$1 ORDER BY name",
      [req.user.org],
    ),
  );
});
app.patch("/api/org", auth, async (req, res) => {
  check(
    req.user.role !== "lecturer" && str(req.body.name),
    "Administrator access required.",
    403,
  );
  await rows("UPDATE organizations SET name=$1 WHERE id=$2", [
    str(req.body.name),
    req.user.org,
  ]);
  await audit(req.user, "organization.updated");
  res.json({ ok: true });
});
app.post("/api/org/member", auth, async (req, res) => {
  check(req.user.role !== "lecturer", "Administrator access required.", 403);
  check(smtp, "Configure SMTP to invite lecturers.", 503);
  const email = str(req.body.email).toLowerCase(),
    uid = id();
  check(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && str(req.body.name),
    "Enter a name and email.",
  );
  await rows(
    "INSERT INTO users(id,org,email,name,password,role) VALUES($1,$2,$3,$4,$5,'lecturer')",
    [uid, req.user.org, email, str(req.body.name), await password(token())],
  );
  await sendLink({ id: uid, email }, "reset");
  await audit(req.user, "lecturer.invited");
  res.json({ ok: true });
});
app.get("/api/quizzes", auth, async (req, res) =>
  res.json(
    await rows(
      "SELECT id,title,kind,category,updated,owner,version,jsonb_array_length(document) AS count FROM quizzes WHERE org=$1 ORDER BY updated DESC",
      [req.user.org],
    ),
  ),
);
app.post("/api/quizzes", auth, async (req, res) => {
  const q = cleanQuiz(req.body),
    key = id();
  await rows(
    "INSERT INTO quizzes(id,org,owner,title,category,document,updated,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      key,
      req.user.org,
      req.user.id,
      q.title,
      q.category,
      JSON.stringify(q.questions),
      Date.now(),
      req.body.kind === "presentation" ? "presentation" : "quiz",
    ],
  );
  res.json({ id: key, version: 1 });
});
app.get("/api/quizzes/:id", auth, async (req, res) => {
  const q = await one("SELECT * FROM quizzes WHERE id=$1 AND org=$2", [
    req.params.id,
    req.user.org,
  ]);
  check(q, "Quiz unavailable.", 404);
  res.json(q);
});
app.put("/api/quizzes/:id", auth, async (req, res) => {
  manage(
    req.user,
    await one("SELECT org,owner FROM quizzes WHERE id=$1", [req.params.id]),
  );
  const q = cleanQuiz(req.body);
  const saved = await one(
    "UPDATE quizzes SET title=$1,category=$2,document=$3,updated=$4,version=version+1 WHERE id=$5 AND version=$6 RETURNING id,version",
    [
      q.title,
      q.category,
      JSON.stringify(q.questions),
      Date.now(),
      req.params.id,
      Number(req.body.version) || 0,
    ],
  );
  check(saved, "This quiz changed in another tab. Reload before saving.", 409);
  res.json(saved);
});
app.delete("/api/quizzes/:id", auth, async (req, res) => {
  manage(
    req.user,
    await one("SELECT org,owner FROM quizzes WHERE id=$1", [req.params.id]),
  );
  await rows("DELETE FROM quizzes WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});
installEngagement(app, { auth, manage });
const { superuser } = installAdmin(app, { auth, audit });
installAccounts(app, { auth, superuser, audit, notify, mail });
installRooms(app, { auth, manage, notify, limit, audit });
installContent(app, { auth, manage, limit });
installMedia(app, { auth, manage, notify, limit });
installOpenApi(app);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint unavailable." }),
);
app.use(express.static(path.resolve("public"), { index: "index.html" }));
app.use((err, req, res, next) => {
  const status = err.status || (err.code === "23505" ? 409 : 500);
  if (status >= 500) console.error(err.message);
  res.status(status).json({
    error:
      status === 409 && err.code === "23505"
        ? "This item already exists."
        : status === 500
          ? "Unable to complete request."
          : err.message,
  });
});
server.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "0.0.0.0",
  () => console.log("Ask ready on port " + server.address().port),
);
