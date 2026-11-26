import { one, rows, transaction } from "./db.mjs";
import { check, str, token, hash, password } from "./model.mjs";

/** Stored size per account, split by what takes the space. */
async function usage() {
  const parts = await Promise.all([
    rows(
      "SELECT owner,count(*)::int AS n,coalesce(sum(pg_column_size(document)),0)::bigint AS bytes FROM quizzes GROUP BY owner",
    ),
    rows(
      "SELECT owner,count(*)::int AS n,coalesce(sum(octet_length(bytes)),0)::bigint AS bytes FROM assets GROUP BY owner",
    ),
    rows(
      "SELECT owner,count(*)::int AS n,coalesce(sum(pg_column_size(snapshot)+pg_column_size(config)),0)::bigint AS bytes FROM rooms GROUP BY owner",
    ),
    rows(
      "SELECT r.owner,count(*)::int AS n,coalesce(sum(pg_column_size(p.*)),0)::bigint AS bytes FROM people p JOIN rooms r ON r.pin=p.pin GROUP BY r.owner",
    ),
    rows(
      "SELECT r.owner,count(*)::int AS n,coalesce(sum(pg_column_size(a.*)),0)::bigint AS bytes FROM answers a JOIN people p ON p.id=a.person JOIN rooms r ON r.pin=p.pin GROUP BY r.owner",
    ),
    rows(
      "SELECT r.owner,count(*)::int AS n,coalesce(sum(pg_column_size(a.*)),0)::bigint AS bytes FROM attempts a JOIN people p ON p.id=a.person JOIN rooms r ON r.pin=p.pin GROUP BY r.owner",
    ),
    rows(
      "SELECT r.owner,count(*)::int AS n,coalesce(sum(pg_column_size(m.*)),0)::bigint AS bytes FROM messages m JOIN rooms r ON r.pin=m.pin GROUP BY r.owner",
    ),
    rows(
      "SELECT r.owner,count(*)::int AS n,coalesce(sum(octet_length(f.image)+octet_length(f.thumb)),0)::bigint AS bytes FROM photos f JOIN people p ON p.id=f.person JOIN rooms r ON r.pin=p.pin GROUP BY r.owner",
    ),
  ]);
  const maps = parts.map((list) => new Map(list.map((v) => [v.owner, v])));
  const [quizzes, media, rooms, people, answers, attempts, messages, photos] =
    maps;
  const n = (map, uid) => map.get(uid)?.n || 0,
    bytes = (map, uid) => Number(map.get(uid)?.bytes || 0);
  return (uid) => {
    const data = {
      quizzes: bytes(quizzes, uid),
      media: bytes(media, uid),
      sessions:
        bytes(rooms, uid) +
        bytes(people, uid) +
        bytes(answers, uid) +
        bytes(attempts, uid) +
        bytes(messages, uid),
      photos: bytes(photos, uid),
    };
    return {
      quizzes: n(quizzes, uid),
      media: n(media, uid),
      sessions: n(rooms, uid),
      participants: n(people, uid),
      answers: n(answers, uid),
      photos: n(photos, uid),
      data,
      bytes: Object.values(data).reduce((a, b) => a + b, 0),
    };
  };
}

/**
 * Deletes everything an account created. Media that a colleague's quiz or
 * session still shows is kept.
 */
async function clearData(c, uid) {
  const { rows: pins } = await c.query(
    "DELETE FROM rooms WHERE owner=$1 RETURNING pin",
    [uid],
  );
  await c.query("DELETE FROM quizzes WHERE owner=$1", [uid]);
  await c.query(
    `DELETE FROM assets a WHERE a.owner=$1
     AND NOT EXISTS (SELECT 1 FROM quizzes q, jsonb_array_elements(q.document) x WHERE x->'asset'->>'id'=a.id)
     AND NOT EXISTS (SELECT 1 FROM rooms r, jsonb_array_elements(r.snapshot) x WHERE x->'asset'->>'id'=a.id)`,
    [uid],
  );
  return pins.map((v) => v.pin);
}

/** Someone who used the site in the last 15 minutes counts as active now. */
const ACTIVE = 15 * 60000;
export function installAccounts(app, { auth, superuser, audit, notify, mail }) {
  app.get("/api/admin/accounts", auth, superuser, async (req, res) => {
    const measure = await usage();
    const accounts = await rows(
      "SELECT u.id,u.org,o.name AS organization,u.name,u.email,u.role,u.verified,u.suspended,u.last_seen::float8 AS last_seen,EXISTS(SELECT 1 FROM credentials c WHERE c.uid=u.id AND c.purpose='login' AND c.expires>$1) AS signed_in FROM users u JOIN organizations o ON o.id=u.org ORDER BY u.name,u.email",
      [Date.now()],
    );
    res.json({
      now: Date.now(),
      active: ACTIVE,
      mail: mail.available,
      self: req.user.id,
      accounts: accounts.map((u) => ({ ...u, usage: measure(u.id) })),
    });
  });
  // Sessions that have not ended or expired, across every organization.
  app.get("/api/admin/sessions", auth, superuser, async (req, res) => {
    res.json(
      await rows(
        `SELECT r.pin,r.title,r.phase,r.position,jsonb_array_length(r.snapshot) AS questions,
          r.created::float8 AS created,r.config->>'mode' AS mode,r.owner,u.name AS presenter,u.email,o.name AS organization,
          (SELECT count(*)::int FROM people p WHERE p.pin=r.pin) AS participants,
          (SELECT count(*)::int FROM answers a JOIN people p ON p.id=a.person WHERE p.pin=r.pin) AS responses,
          (SELECT max(p.joined)::float8 FROM people p WHERE p.pin=r.pin) AS joined
         FROM rooms r JOIN organizations o ON o.id=r.org LEFT JOIN users u ON u.id=r.owner
         WHERE r.phase<>'ended' AND (r.config->>'expires')::bigint>$1
         ORDER BY (r.phase='waiting'),greatest(r.created,coalesce((SELECT max(p.joined) FROM people p WHERE p.pin=r.pin),0)) DESC`,
        [Date.now()],
      ),
    );
  });
  app.post("/api/admin/accounts/:id", auth, superuser, async (req, res) => {
    const { action } = req.body,
      uid = req.params.id;
    check(uid !== req.user.id, "You cannot change your own account here.", 403);
    const u = await one(
      "SELECT id,org,email,name,role FROM users WHERE id=$1",
      [uid],
    );
    check(u, "Account unavailable.", 404);
    check(
      u.role !== "super" || action === "role",
      "Change this platform administrator’s role first.",
      409,
    );
    const confirmed = () =>
      check(
        str(req.body.confirm, 254).toLowerCase() === u.email,
        "Type the account’s email address to confirm.",
      );
    let result = { ok: true },
      pins = [];
    switch (action) {
      case "role": {
        check(
          ["lecturer", "admin", "super"].includes(req.body.role),
          "Select a valid role.",
        );
        await rows("UPDATE users SET role=$1 WHERE id=$2", [
          req.body.role,
          uid,
        ]);
        break;
      }
      case "reset": {
        // The administrator never learns a password: the owner chooses one
        // through a single-use link, and the old one stops working now.
        const byMail = req.body.delivery === "email";
        check(!byMail || mail.available, "Email delivery is unavailable.", 503);
        const raw = token(),
          expires = Date.now() + 3600000,
          link = mail.link("reset", raw, req);
        if (byMail) await mail.send(u.email, link);
        const locked = await password(token());
        await transaction(async (c) => {
          await c.query(
            "DELETE FROM credentials WHERE uid=$1 AND purpose IN ('login','reset')",
            [uid],
          );
          await c.query("INSERT INTO credentials VALUES($1,$2,'reset',$3)", [
            hash(raw),
            uid,
            expires,
          ]);
          await c.query("UPDATE users SET password=$1 WHERE id=$2", [
            locked,
            uid,
          ]);
        });
        result = byMail ? { sent: true } : { link, expires };
        break;
      }
      case "suspend":
      case "restore":
        await transaction(async (c) => {
          await c.query("UPDATE users SET suspended=$1 WHERE id=$2", [
            action === "suspend",
            uid,
          ]);
          if (action === "suspend")
            await c.query(
              "DELETE FROM credentials WHERE uid=$1 AND purpose IN ('login','reset')",
              [uid],
            );
        });
        break;
      case "clear":
        confirmed();
        pins = await transaction((c) => clearData(c, uid));
        break;
      case "remove":
        confirmed();
        pins = await transaction(async (c) => {
          await c.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
            u.org,
          ]);
          const gone = await clearData(c, uid);
          await c.query("DELETE FROM users WHERE id=$1", [uid]);
          const { rows: left } = await c.query(
            "SELECT 1 FROM users WHERE org=$1 LIMIT 1",
            [u.org],
          );
          // An organization without accounts cannot be reached by anyone.
          if (!left.length) {
            await c.query("DELETE FROM settings WHERE id=$1", [
              "certificate:" + u.org,
            ]);
            await c.query("DELETE FROM organizations WHERE id=$1", [u.org]);
          }
          return gone;
        });
        break;
      default:
        check(false, "Unknown control.");
    }
    await audit(req.user, "account." + action);
    for (const pin of pins) await notify(pin);
    res.json(result);
  });
}
