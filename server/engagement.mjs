import { one, rows } from "./db.mjs";
import { check, released, str } from "./model.mjs";
import { personFor } from "./rooms.mjs";
export const games = [
  "Leaderboard",
  "Car racing",
  "Space racing",
  "Horse racing",
  "Balloon race",
  "Mountain climb",
  "Treasure hunt",
  "Quiz battle",
];
export function installEngagement(app, { auth, manage }) {
  app.get("/api/rooms/:pin/standings", async (req, res) => {
    const r = await one("SELECT * FROM rooms WHERE pin=$1", [req.params.pin]);
    check(r && r.config.rank, "Rankings disabled.", 404);
    if (r.config.secret && !(await personFor(req, r.pin)))
      manage(req.user || {}, r);
    const people = await rows(
      "SELECT id,name,team FROM people WHERE pin=$1 ORDER BY joined",
      [r.pin],
    );
    const answers = await rows(
      "SELECT a.* FROM answers a JOIN people p ON p.id=a.person WHERE p.pin=$1",
      [r.pin],
    );
    const totals = new Map();
    for (const a of answers) totals.set(a.q, (totals.get(a.q) || 0) + 1);
    const visible = r.snapshot.map((q, i) =>
      r.config.release === "immediate"
        ? people.length > 0 && totals.get(i) === people.length
        : released(
            r,
            i,
            false,
            people.length > 0 && totals.get(i) === people.length,
          ),
    );
    const map = new Map(
      people.map((p) => [
        p.id,
        { name: p.name, team: p.team, score: 0, hits: 0, streak: 0, best: 0 },
      ]),
    );
    for (const a of answers.sort((x, y) => x.q - y.q)) {
      if (!visible[a.q]) continue;
      const p = map.get(a.person);
      p.score += a.points;
      p.streak = a.correct ? p.streak + 1 : 0;
      p.best = Math.max(p.best, p.streak);
      if (a.correct) p.hits++;
    }
    const entries = [...map.values()].sort((a, b) => b.score - a.score);
    const teams = new Map();
    for (const p of entries)
      if (p.team) teams.set(p.team, (teams.get(p.team) || 0) + p.score);
    res.json({
      title: r.title,
      game: r.config.game || "Leaderboard",
      phase: r.phase,
      visible: visible.some(Boolean),
      entries: visible.some(Boolean) ? entries.slice(0, 100) : [],
      teams: visible.some(Boolean)
        ? [...teams].sort((a, b) => b[1] - a[1])
        : [],
    });
  });
  app.get("/api/analytics", auth, async (req, res) => {
    const r = await rows(
      `SELECT r.pin,r.title,r.created,jsonb_array_length(r.snapshot) AS questions,
  count(DISTINCT p.id)::int AS participants,count(a.person)::int AS responses,
  count(a.correct) FILTER(WHERE a.correct)::int AS correct,count(a.correct)::int AS graded,
  round(avg(a.elapsed)) AS elapsed,coalesce(sum(a.points),0)::int AS points
  FROM rooms r LEFT JOIN people p ON p.pin=r.pin LEFT JOIN answers a ON a.person=p.id
  WHERE r.org=$1 AND (r.owner=$2 OR $3) GROUP BY r.pin ORDER BY r.created DESC`,
      [req.user.org, req.user.id, req.user.role !== "lecturer"],
    );
    res.json(r);
  });
  app.get("/api/insights", auth, async (req, res) => {
    const permitted = await rows(
      `SELECT r.pin,r.title,r.snapshot,r.owner,u.name AS lecturer FROM rooms r LEFT JOIN users u ON u.id=r.owner WHERE r.org=$1 AND (r.owner=$2 OR $3)`,
      [req.user.org, req.user.id, req.user.role !== "lecturer"],
    );
    const data = await rows(
      `SELECT p.pin,a.q,count(*)::int AS n,count(a.correct)::int AS graded,count(*) FILTER(WHERE a.correct)::int AS hits,round(avg(a.elapsed)) AS mean FROM answers a JOIN people p ON p.id=a.person JOIN rooms r ON r.pin=p.pin WHERE r.org=$1 AND (r.owner=$2 OR $3) GROUP BY p.pin,a.q`,
      [req.user.org, req.user.id, req.user.role !== "lecturer"],
    );
    const map = new Map(permitted.map((r) => [r.pin, r]));
    res.json(
      data.map((v) => ({
        pin: v.pin,
        session: map.get(v.pin).title,
        lecturer: map.get(v.pin).lecturer,
        question: map.get(v.pin).snapshot[v.q].prompt,
        submitted: v.n,
        accuracy: v.graded ? Math.round((100 * v.hits) / v.graded) : null,
        elapsed: Number(v.mean),
      })),
    );
  });
  app.get("/api/certificate", auth, async (req, res) =>
    res.json(
      (
        await one("SELECT value FROM settings WHERE id=$1", [
          "certificate:" + req.user.org,
        ])
      )?.value || {},
    ),
  );
  app.put("/api/certificate", auth, async (req, res) => {
    check(req.user.role !== "lecturer", "Administrator access required.", 403);
    const value = {
      issuer: str(req.body.issuer),
      signature: str(req.body.signature),
      title: str(req.body.title),
    };
    await rows(
      "INSERT INTO settings VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value",
      ["certificate:" + req.user.org, JSON.stringify(value)],
    );
    res.json(value);
  });
}
