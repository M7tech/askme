import os from "node:os";
import { one, rows, transaction } from "./db.mjs";
import { check, str, bounded, password } from "./model.mjs";
export async function preferences(id) {
  return (
    (await one("SELECT value FROM settings WHERE id=$1", [id]))?.value || {}
  );
}
// The settings form used to save the former default, which is not a chosen name.
const platformName = (p) => (p.name && p.name !== "AskShaubo" ? p.name : "Ask");
export function installAdmin(app, { auth, audit }) {
  const superuser = (req, res, next) => {
    check(
      req.user?.role === "super",
      "Platform administrator access required.",
      403,
    );
    next();
  };
  app.get("/api/admin", auth, superuser, async (req, res) => {
    res.json({
      orgs: await rows(
        "SELECT o.id,o.name,count(u.id)::int AS accounts FROM organizations o LEFT JOIN users u ON u.org=o.id GROUP BY o.id ORDER BY o.name",
      ),
      activity: await rows(
        "SELECT action,at,org FROM audit ORDER BY at DESC LIMIT 50",
      ),
      usage: await one(
        "SELECT (SELECT count(*) FROM rooms)::int AS sessions,(SELECT count(*) FROM people)::int AS participants,(SELECT coalesce(sum(octet_length(image)+octet_length(thumb)),0) FROM photos) AS photo_bytes",
      ),
      process: {
        uptime: Math.round(process.uptime()),
        rss: process.memoryUsage().rss,
        cores: os.availableParallelism(),
      },
      config: await preferences("platform").then((p) => ({
        ...p,
        name: platformName(p),
      })),
    });
  });
  app.patch("/api/admin", auth, superuser, async (req, res) => {
    const b = req.body;
    const config = {
      terms: str(b.terms, 12000),
      privacy: str(b.privacy, 12000),
      name: str(b.name) || "Ask",
      retention: bounded(b.retention, 1, 3650, 90),
      maxDimension: bounded(b.maxDimension, 320, 4096, 1280),
      thumbnail: bounded(b.thumbnail, 100, 640, 320),
      quality: bounded(b.quality, 40, 95, 80),
      registration: b.registration === true,
    };
    await rows(
      "INSERT INTO settings VALUES('platform',$1) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value",
      [JSON.stringify(config)],
    );
    await audit(req.user, "platform.updated");
    res.json({ ok: true });
  });
  app.patch("/api/org/member/:id", auth, async (req, res) => {
    check(
      req.user.role !== "lecturer" && req.params.id !== req.user.id,
      "Cannot change this account.",
      403,
    );
    check(
      ["admin", "lecturer"].includes(req.body.role),
      "Select a valid role.",
    );
    const u = await one(
      "UPDATE users SET role=$1 WHERE id=$2 AND (org=$3 OR $4) AND role<>'super' RETURNING id",
      [req.body.role, req.params.id, req.user.org, req.user.role === "super"],
    );
    check(u, "Account unavailable.", 404);
    await audit(req.user, "member.role.updated");
    res.json(u);
  });
  app.delete("/api/profile", auth, async (req, res) => {
    const u = await one("SELECT password FROM users WHERE id=$1", [
      req.user.id,
    ]);
    check(
      typeof req.body.password === "string" &&
        req.body.password.length <= 256 &&
        (await password(req.body.password, u.password)),
      "Password is incorrect.",
      403,
    );
    await transaction(async (c) => {
      const {
        rows: [o],
      } = await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        req.user.org,
      ]);
      const { rows: members } = await c.query(
        "SELECT id,role FROM users WHERE org=$1",
        [o.id],
      );
      check(
        members.length === 1 ||
          members.some((m) => m.id !== req.user.id && m.role !== "lecturer"),
        "Assign another organization administrator first.",
        409,
      );
      if (members.length === 1)
        await c.query("DELETE FROM organizations WHERE id=$1", [o.id]);
      else await c.query("DELETE FROM users WHERE id=$1", [req.user.id]);
    });
    res.clearCookie("chorus_session", { path: "/" }).json({ ok: true });
  });
  app.get("/api/branding", async (req, res) => {
    const p = await preferences("platform");
    res.json({
      terms: p.terms || "",
      privacy: p.privacy || "",
      name: platformName(p),
      publicOrigin: process.env.PUBLIC_ORIGIN || null,
      registration: p.registration !== false,
    });
  });
  return { superuser };
}
