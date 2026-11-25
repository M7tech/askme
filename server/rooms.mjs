import { randomInt } from "node:crypto";
import { games } from "./engagement.mjs";
import { richText } from "./content.mjs";
import QRCode from "qrcode";
import ExcelJS from "exceljs";
import { rows, one, transaction } from "./db.mjs";
import {
  check,
  str,
  token,
  hash,
  id,
  bounded,
  shuffle,
  cleanAnswer,
  grade,
  released,
} from "./model.mjs";
export const personFor = async (req, pin) =>
  one("SELECT * FROM people WHERE token=$1 AND pin=$2", [
    hash(req.get("x-participant") || ""),
    pin,
  ]);
const getRoom = (pin) => one("SELECT * FROM rooms WHERE pin=$1", [pin]);
const tally = async (pin) =>
  rows(
    "SELECT a.q, count(*)::int AS total FROM answers a JOIN people p ON a.person=p.id WHERE p.pin=$1 GROUP BY a.q",
    [pin],
  );
function configuration(b) {
  const release = [
    "immediate",
    "timer",
    "all",
    "manual",
    "end",
    "scheduled",
    "never",
  ].includes(b.release)
    ? b.release
    : "manual";
  const releaseAt = Date.parse(b.releaseAt);
  check(
    release !== "scheduled" || Number.isFinite(releaseAt),
    "Select a release date.",
  );
  const mode = b.mode === "self" ? "self" : "live";
  check(
    mode !== "self" || release !== "timer",
    "Choose a release policy supported by self-paced sessions.",
  );
  const starts = Date.parse(b.starts);
  const accessAt = Number.isFinite(starts) ? starts : Date.now();
  return {
    starts: accessAt,
    style: ["Professional", "Fun", "Party"].includes(b.style)
      ? b.style
      : "Professional",
    game: games.includes(b.game) ? b.game : "Leaderboard",
    release,
    releaseAt: releaseAt || 0,
    mode,
    anonymous: !!b.anonymous,
    repeat: !!b.repeat,
    changes: !!b.changes,
    late: b.late !== false,
    max: bounded(b.max, 1, 10000, 500),
    expires:
      Math.max(Date.now(), accessAt) + 86400000 * bounded(b.days, 1, 365, 7),
    rank: !!b.rank,
    speed: !!b.speed && mode === "live",
    negative: !!b.negative,
    certificate: !!b.certificate,
    graded: b.graded !== false,
    photography: !!b.photography,
    guardian: !!b.guardian,
    // Selfies are session photographs: same consent, storage and deletion rules.
    selfie: !!b.photography && !!b.selfie,
    team: !!b.team,
    secret: b.private ? hash(token()) : "",
    stats: false,
  };
}
export function installRooms(app, { auth, manage, notify, limit, audit }) {
  app.get("/api/rooms", auth, async (req, res) =>
    res.json(
      await rows(
        "SELECT r.pin,r.title,r.phase,r.created,r.config,count(p.id)::int AS participants FROM rooms r LEFT JOIN people p ON p.pin=r.pin WHERE r.org=$1 AND (r.owner=$2 OR $3) GROUP BY r.pin ORDER BY r.created DESC",
        [req.user.org, req.user.id, req.user.role !== "lecturer"],
      ),
    ),
  );
  app.post("/api/rooms", auth, async (req, res) => {
    const quiz = await one("SELECT * FROM quizzes WHERE id=$1 AND org=$2", [
      str(req.body.quiz),
      req.user.org,
    ]);
    check(quiz, "Select a quiz.");
    const config = configuration(req.body);
    if (config.secret) {
      check(
        str(req.body.passcode).length >= 8,
        "Use an access phrase of at least eight characters.",
      );
      config.secret = hash(str(req.body.passcode));
    }
    const snapshot = quiz.document;
    if (req.body.randomQuestions) shuffle(snapshot);
    for (const q of snapshot) {
      if (q.type === "Ordering") q.key = q.options.join("|");
      if (
        req.body.randomAnswers &&
        !["Matching", "Drag and drop", "Ordering"].includes(q.type)
      )
        shuffle(q.options);
    }
    let room;
    for (let i = 0; i < 8 && !room; i++) {
      const pin = String(randomInt(100000, 1000000));
      room = await one(
        "INSERT INTO rooms(pin,org,owner,quiz,title,snapshot,config,created,phase) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING pin",
        [
          pin,
          req.user.org,
          req.user.id,
          quiz.id,
          quiz.title,
          JSON.stringify(snapshot),
          JSON.stringify(config),
          Date.now(),
          config.mode === "self" ? "open" : "waiting",
        ],
      );
    }
    check(room, "Try creating the session again.", 503);
    await audit(req.user, "session.created");
    res.json(room);
  });
  app.get("/api/rooms/:pin/info", async (req, res) => {
    const r = await getRoom(req.params.pin);
    check(r, "Session not found.", 404);
    res.json({
      title: r.title,
      phase: r.phase,
      anonymous: r.config.anonymous,
      private: !!r.config.secret,
      team: r.config.team,
      photography: r.config.photography,
      selfie: !!r.config.selfie,
      guardian: !!r.config.guardian,
    });
  });
  app.post("/api/rooms/:pin/join", async (req, res) => {
    await limit(req.ip + "join", 1000);
    const pin = req.params.pin,
      raw = token(),
      resultToken = token(),
      pid = id();
    await transaction(async (c) => {
      const {
        rows: [r],
      } = await c.query("SELECT * FROM rooms WHERE pin=$1 FOR UPDATE", [pin]);
      check(r, "Session not found.", 404);
      check(
        !r.config.starts || Date.now() >= r.config.starts,
        "This scheduled session has not opened yet.",
        409,
      );
      check(
        r.phase !== "ended" && Date.now() < r.config.expires,
        "This session has ended.",
        410,
      );
      check(
        r.config.late || r.phase === "waiting" || r.config.mode === "self",
        "Joining has closed.",
        403,
      );
      if (r.config.secret) {
        await limit(req.ip + "passcode", 20);
        check(
          hash(str(req.body.passcode)) === r.config.secret,
          "Incorrect access phrase.",
          403,
        );
      }
      const {
        rows: [n],
      } = await c.query("SELECT count(*)::int AS n FROM people WHERE pin=$1", [
        pin,
      ]);
      check(n.n < r.config.max, "This session is full.", 409);
      const name = r.config.anonymous
        ? "Guest " + (n.n + 1)
        : str(req.body.name, 80);
      check(name, "Enter your name.");
      await c.query(
        "INSERT INTO people(id,pin,name,token,consent,joined,team) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          pid,
          pin,
          name,
          hash(raw),
          r.config.photography && req.body.consent === true,
          Date.now(),
          r.config.team ? str(req.body.team, 60) : "",
        ],
      );
      await c.query("INSERT INTO consent_records VALUES($1,$2,$3,false,$4)", [
        id(),
        pid,
        r.config.photography && req.body.consent === true,
        Date.now(),
      ]);
      await c.query("INSERT INTO result_links VALUES($1,$2)", [
        hash(resultToken),
        pid,
      ]);
    });
    await notify(pin);
    res.json({ token: raw, resultToken, pin });
  });
  app.get("/api/rooms/:pin/host", auth, async (req, res) => {
    const r = await getRoom(req.params.pin);
    manage(req.user, r);
    const people = await rows(
      "SELECT id,name,team,consent,feedback,guardian_reference,(SELECT f.id FROM photos f WHERE f.person=people.id AND people.consent AND f.moment='Selfie' ORDER BY f.created DESC LIMIT 1) AS selfie FROM people WHERE pin=$1 ORDER BY joined",
      [r.pin],
    );
    const review = [
      "Word cloud",
      "Brainstorm",
      "Text answer",
      "Survey",
    ].includes(r.snapshot[r.position].type)
      ? await rows(
          "SELECT a.person,a.q,a.value FROM answers a JOIN people p ON p.id=a.person LEFT JOIN approved_answers ok ON ok.person=a.person AND ok.q=a.q AND ok.approved_value=a.value WHERE p.pin=$1 AND a.q=$2 AND ok.person IS NULL",
          [r.pin, r.position],
        )
      : [];
    res.json({
      ...r,
      people,
      review,
      tally: await tally(r.pin),
      messages: await rows(
        "SELECT id,body,approved FROM messages WHERE pin=$1 ORDER BY created",
        [r.pin],
      ),
    });
  });
  app.post("/api/rooms/:pin/control", auth, async (req, res) => {
    const pin = req.params.pin,
      action = req.body.action;
    await transaction(async (c) => {
      const {
        rows: [r],
      } = await c.query("SELECT * FROM rooms WHERE pin=$1 FOR UPDATE", [pin]);
      manage(req.user, r);
      check(
        r.phase !== "ended" ||
          ["reveal", "stats", "feedback", "approve", "remove"].includes(action),
        "Session has ended.",
        409,
      );
      const now = Date.now();
      let { phase, position, remaining, deadline, revealed, config } = r;
      if (
        r.phase === "open" &&
        Number(deadline) > 0 &&
        now >= Number(deadline)
      ) {
        config.expiredQuestions = [
          ...new Set([...(config.expiredQuestions || []), position]),
        ];
      }
      switch (action) {
        case "start":
        case "next":
        case "previous": {
          if (action === "start")
            check(phase === "waiting", "Session already started.", 409);
          position += action === "next" ? 1 : action === "previous" ? -1 : 0;
          check(
            position >= 0 && position < r.snapshot.length,
            "No question in that direction.",
          );
          phase = "open";
          remaining = 0;
          config.openedAt = now;
          config.pausedMs = 0;
          const seconds = r.snapshot[position].seconds;
          deadline = seconds ? now + seconds * 1000 : 0;
          break;
        }
        case "pause":
          check(
            phase === "open" && (!Number(deadline) || now < Number(deadline)),
            "Question is closed.",
            409,
          );
          config.pausedAt = now;
          remaining = Number(deadline)
            ? Math.max(1, Number(deadline) - now)
            : 0;
          deadline = 0;
          phase = "paused";
          break;
        case "resume":
          check(phase === "paused", "Question is not paused.", 409);
          config.pausedMs =
            (config.pausedMs || 0) +
            Math.max(0, now - (config.pausedAt || now));
          phase = "open";
          deadline = Number(remaining) ? now + Number(remaining) : 0;
          break;
        case "extend":
          check(
            phase === "open" && Number(deadline),
            "Requires a timed open question.",
          );
          deadline = Math.max(Number(deadline), now) + 15000;
          break;
        case "close":
          phase = "closed";
          break;
        case "reveal":
          check(
            config.release === "manual",
            "The selected release policy controls answer visibility.",
          );
          if (!revealed.includes(position)) revealed.push(position);
          break;
        case "stats":
          config.stats = !config.stats;
          break;
        case "end":
          phase = "ended";
          break;
        case "approve-answer":
          check(Number.isInteger(req.body.q), "Choose a question.");
          await c.query(
            "INSERT INTO approved_answers SELECT a.person,a.q,a.value FROM answers a JOIN people p ON p.id=a.person WHERE p.pin=$1 AND p.id=$2 AND a.q=$3 AND a.value=$4::jsonb ON CONFLICT(person,q) DO UPDATE SET approved_value=EXCLUDED.approved_value",
            [
              pin,
              str(req.body.person),
              req.body.q,
              JSON.stringify(req.body.value),
            ],
          );
          break;
        case "guardian": {
          const reference = str(req.body.reference, 160);
          await c.query(
            "UPDATE people SET guardian_reference=$1 WHERE id=$2 AND pin=$3",
            [reference, str(req.body.person), pin],
          );
          if (!reference)
            await c.query(
              "DELETE FROM photos WHERE person IN (SELECT id FROM people WHERE id=$1 AND pin=$2)",
              [str(req.body.person), pin],
            );
          await c.query("INSERT INTO audit VALUES($1,$2,$3,$4,$5)", [
            id(),
            req.user.id,
            r.org,
            reference
              ? "guardian.authorization.recorded"
              : "guardian.authorization.withdrawn",
            now,
          ]);
          break;
        }
        case "feedback":
          await c.query(
            "UPDATE people SET feedback=$1 WHERE id=$2 AND pin=$3",
            [str(req.body.feedback, 2000), str(req.body.person), pin],
          );
          break;
        case "remove":
          await c.query("DELETE FROM people WHERE id=$1 AND pin=$2", [
            str(req.body.person),
            pin,
          ]);
          break;
        case "approve":
          await c.query(
            "UPDATE messages SET approved=true WHERE id=$1 AND pin=$2",
            [str(req.body.message), pin],
          );
          break;
        default:
          check(false, "Unknown control.");
      }
      await c.query(
        "UPDATE rooms SET phase=$1,position=$2,remaining=$3,deadline=$4,revealed=$5,config=$6 WHERE pin=$7",
        [
          phase,
          position,
          remaining,
          deadline,
          JSON.stringify(revealed),
          JSON.stringify(config),
          pin,
        ],
      );
    });
    await notify(pin);
    res.json({ ok: true });
  });
  app.get("/api/rooms/:pin/state", async (req, res) => {
    const r = await getRoom(req.params.pin);
    check(r, "Session unavailable.", 404);
    const p = await personFor(req, r.pin);
    check(!req.get("x-participant") || p, "Participation expired.", 403);
    if (r.config.secret && !p) manage(req.user, r);
    const i =
      r.config.mode === "self" && p
        ? bounded(req.query.q, 0, r.snapshot.length - 1, 0)
        : r.position;
    const n = await one("SELECT count(*)::int AS n FROM people WHERE pin=$1", [
      r.pin,
    ]);
    const counts = await tally(r.pin),
      answered = counts.find((x) => x.q === i)?.total || 0;
    const state = {
      style: r.config.style || "Professional",
      title: r.title,
      pin: r.pin,
      phase: r.phase,
      position: i,
      count: r.snapshot.length,
      mode: r.config.mode,
      changes: r.config.changes || r.config.repeat,
      participants: n.n,
      answered,
      deadline: Number(r.deadline),
      now: Date.now(),
      photos: r.config.photography,
      rank: r.config.rank,
      consent: p?.consent,
      publicPhoto: p?.public_photo,
    };
    if (r.phase !== "waiting") {
      const q = r.snapshot[i],
        a =
          p &&
          (await one("SELECT * FROM answers WHERE person=$1 AND q=$2", [
            p.id,
            i,
          ]));
      if (p && r.config.mode === "self" && r.phase === "open")
        await rows(
          "INSERT INTO question_views VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [p.id, i, Date.now()],
        );
      const visible = released(r, i, a, n.n > 0 && answered === n.n);
      const language = ["ar", "ckb"].includes(req.query.lang)
        ? req.query.lang
        : "en";
      const prompt = q.translations?.[language]?.prompt || q.prompt;
      const pairs = ["Matching", "Drag and drop"].includes(q.type);
      state.question = {
        motion: r.config.graded
          ? null
          : {
              moves: q.moves || 1,
              intensity: q.intensity || 2,
              duration: q.duration || 450,
              target: q.target ?? -1,
            },
        labels: pairs ? q.options.map((o) => o.split("|")[0]) : [],
        targets: pairs
          ? [...new Set(q.options.map((o) => o.split("|")[1]))].sort()
          : [],
        rich: richText(prompt),
        asset: q.asset || null,
        type: q.type,
        prompt,
        options: pairs
          ? []
          : q.type === "Ordering"
            ? [...q.options].sort()
            : q.options,
        effect: r.config.graded ? "None" : q.effect,
      };
      if (a) state.response = a.value;
      if (visible) {
        state.solution = q.type === "Ordering" ? q.options.join(" → ") : q.key;
        state.explanation =
          q.translations?.[language]?.explanation || q.explanation;
        state.reference = q.reference;
        if (pairs)
          state.solution = q.options
            .map((o) => o.replace("|", " → "))
            .join("; ");
      }
      if (
        r.config.stats &&
        ["Word cloud", "Brainstorm", "Text answer", "Survey"].includes(q.type)
      )
        state.textStats = await rows(
          "SELECT a.value,count(*)::int AS n FROM answers a JOIN people p ON p.id=a.person JOIN approved_answers ok ON ok.person=a.person AND ok.q=a.q AND ok.approved_value=a.value WHERE p.pin=$1 AND a.q=$2 GROUP BY a.value ORDER BY n DESC LIMIT 100",
          [r.pin, i],
        );
      if (r.config.stats && q.type === "Rating")
        state.distribution = await rows(
          "SELECT a.value,count(*)::int AS n FROM answers a JOIN people p ON p.id=a.person WHERE p.pin=$1 AND a.q=$2 GROUP BY a.value ORDER BY a.value",
          [r.pin, i],
        );
      if (r.config.stats && !pairs && q.options.length && q.type !== "Ordering")
        state.distribution = await rows(
          "SELECT value,count(*)::int AS n FROM answers a JOIN people p ON p.id=a.person WHERE p.pin=$1 AND a.q=$2 GROUP BY value",
          [r.pin, i],
        );
    }
    if (
      r.config.photography &&
      !r.config.secret &&
      r.config.expires > Date.now()
    )
      state.projected = await rows(
        "SELECT f.id,f.moment FROM photos f JOIN people p ON p.id=f.person WHERE p.pin=$1 AND p.consent AND p.public_photo AND f.published ORDER BY f.created DESC LIMIT 12",
        [r.pin],
      );
    state.messages = await rows(
      "SELECT m.id,m.body,count(v.person)::int AS votes FROM messages m LEFT JOIN votes v ON v.message=m.id WHERE m.pin=$1 AND m.approved GROUP BY m.id ORDER BY votes DESC,m.created LIMIT 100",
      [r.pin],
    );
    res.json(state);
  });
  app.post("/api/rooms/:pin/answer", async (req, res) => {
    const pin = req.params.pin;
    const p = await personFor(req, pin);
    check(p, "Join the session first.", 403);
    await transaction(async (c) => {
      const {
        rows: [r],
      } = await c.query("SELECT * FROM rooms WHERE pin=$1 FOR UPDATE", [pin]);
      const i = req.body.q,
        q = r.snapshot[i],
        now = Date.now();
      check(
        Number.isInteger(i) &&
          q &&
          (r.config.mode === "self" || r.position === i),
        "Question has changed.",
        409,
      );
      check(
        r.phase === "open" &&
          now < r.config.expires &&
          (!Number(r.deadline) || now <= Number(r.deadline)),
        "Answering is closed.",
        409,
      );
      const {
        rows: [old],
      } = await c.query("SELECT * FROM answers WHERE person=$1 AND q=$2", [
        p.id,
        i,
      ]);
      const value = cleanAnswer(q, req.body.value);
      const requestId = str(req.body.requestId, 80);
      if (r.config.repeat) {
        check(requestId, "Submission identifier required.");
        const replay = await c.query(
          "SELECT 1 FROM attempts WHERE person=$1 AND q=$2 AND request_id=$3",
          [p.id, i, requestId],
        );
        if (replay.rows.length) return;
      } else if (old && JSON.stringify(old.value) === JSON.stringify(value))
        return;
      check(!released(r, i, old, false, now), "Answer has been released.", 409);
      check(
        !old || r.config.changes || r.config.repeat,
        "Response already recorded.",
        409,
      );
      check(
        !r.revealed.includes(i) &&
          !(old && r.config.release === "immediate") &&
          !(r.config.release === "scheduled" && now >= r.config.releaseAt),
        "Answer has been released.",
        409,
      );
      if (old && r.config.release === "all") {
        const {
          rows: [counts],
        } = await c.query(
          "SELECT count(*)::int AS n,count(a.person)::int AS answered FROM people p LEFT JOIN answers a ON a.person=p.id AND a.q=$1 WHERE p.pin=$2",
          [i, pin],
        );
        check(counts.answered < counts.n, "Answer has been released.", 409);
      }
      const correct = grade(q, value);
      const view =
        r.config.mode === "self"
          ? (
              await c.query(
                "SELECT started FROM question_views WHERE person=$1 AND q=$2",
                [p.id, i],
              )
            ).rows[0]
          : null;
      const elapsed =
        r.config.mode === "self"
          ? Math.max(0, now - Number(view?.started || now))
          : Math.max(
              0,
              now -
                (r.config.openedAt || Number(r.created)) -
                (r.config.pausedMs || 0),
            );
      const points = correct
        ? q.points +
          (r.config.speed && q.seconds
            ? Math.round(
                q.points * 0.25 * Math.max(0, 1 - elapsed / (q.seconds * 1000)),
              )
            : 0)
        : correct === false && r.config.negative
          ? -q.points
          : 0;
      if (r.config.repeat)
        await c.query(
          "INSERT INTO attempts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            id(),
            p.id,
            i,
            requestId,
            JSON.stringify(value),
            points,
            correct,
            elapsed,
            now,
          ],
        );
      await c.query(
        "INSERT INTO answers VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(person,q) DO UPDATE SET value=EXCLUDED.value,points=EXCLUDED.points,correct=EXCLUDED.correct,elapsed=EXCLUDED.elapsed",
        [p.id, i, JSON.stringify(value), points, correct, elapsed],
      );
      if (r.config.release === "all") {
        const {
          rows: [n],
        } = await c.query(
          "SELECT count(*)::int AS total,count(a.person)::int AS answered FROM people p LEFT JOIN answers a ON a.person=p.id AND a.q=$1 WHERE p.pin=$2",
          [i, pin],
        );
        if (n.total === n.answered) {
          r.config.answeredQuestions = [
            ...new Set([...(r.config.answeredQuestions || []), i]),
          ];
          await c.query("UPDATE rooms SET config=$1 WHERE pin=$2", [
            JSON.stringify(r.config),
            pin,
          ]);
        }
      }
    });
    await notify(pin);
    res.json({ ok: true });
  });
  app.post("/api/rooms/:pin/discuss", async (req, res) => {
    const p = await personFor(req, req.params.pin);
    check(p, "Join first.", 403);
    await limit("message:" + p.id, 12);
    if (req.body.vote) {
      await rows(
        "INSERT INTO votes SELECT id,$1 FROM messages WHERE id=$2 AND pin=$3 AND approved ON CONFLICT DO NOTHING",
        [p.id, str(req.body.vote), p.pin],
      );
    } else {
      const body = str(req.body.body, 500);
      check(body, "Write a question.");
      await rows(
        "INSERT INTO messages(id,pin,person,body,created) VALUES($1,$2,$3,$4,$5)",
        [id(), p.pin, p.id, body, Date.now()],
      );
    }
    await notify(p.pin);
    res.json({ ok: true });
  });
  app.get("/api/rooms/:pin/results", async (req, res) => {
    const r = await getRoom(req.params.pin),
      p = await one(
        "SELECT p.* FROM result_links l JOIN people p ON p.id=l.person WHERE l.token=$1 AND p.pin=$2",
        [hash(req.get("x-results") || ""), req.params.pin],
      );
    check(r && p, "Private results link required.", 403);
    const answers = await rows("SELECT * FROM answers WHERE person=$1", [p.id]),
      counts = await tally(r.pin),
      { n } = await one("SELECT count(*)::int AS n FROM people WHERE pin=$1", [
        r.pin,
      ]);
    const list = r.snapshot.map((q, i) => {
      const a = answers.find((x) => x.q === i),
        visible = released(r, i, a, counts.find((x) => x.q === i)?.total === n);
      const lang = req.query.lang;
      return {
        prompt: q.translations?.[lang]?.prompt || q.prompt,
        value: a?.value,
        elapsed: a ? Number(a.elapsed) : null,
        ...(visible
          ? {
              solution:
                q.type === "Ordering"
                  ? q.options.join(" → ")
                  : ["Matching", "Drag and drop"].includes(q.type)
                    ? q.options.join("; ")
                    : q.key,
              correct: a?.correct,
              points: a?.points || 0,
              explanation: q.explanation,
            }
          : {}),
      };
    });
    const canScore = list.every((x) => Object.hasOwn(x, "points"));
    const answerable = r.snapshot.filter((q) => q.type !== "Slide").length;
    const result = {
      title: r.title,
      name: p.name,
      team: p.team,
      feedback: p.feedback,
      questions: list,
      complete: answers.length === answerable,
      certificate: r.config.certificate && answers.length === answerable,
      photos: await rows("SELECT id,moment FROM photos WHERE person=$1", [
        p.id,
      ]),
    };
    if (result.certificate)
      result.design =
        (
          await one("SELECT value FROM settings WHERE id=$1", [
            "certificate:" + r.org,
          ])
        )?.value || {};
    if (canScore) {
      result.correct = answers.filter((a) => a.correct === true).length;
      result.incorrect = answers.filter((a) => a.correct === false).length;
      const graded = r.snapshot.filter(
        (q) =>
          ![
            "Poll",
            "Rating",
            "Word cloud",
            "Survey",
            "Ranking",
            "Brainstorm",
            "Personality",
            "Slide",
          ].includes(q.type),
      ).length;
      result.percentage = graded
        ? Math.round((100 * result.correct) / graded)
        : null;
      result.score = answers.reduce((s, a) => s + a.points, 0);
      if (r.config.rank && r.phase === "ended") {
        result.leaders = await rows(
          "SELECT p.name,p.team,coalesce(sum(a.points),0)::int AS score FROM people p LEFT JOIN answers a ON a.person=p.id WHERE p.pin=$1 GROUP BY p.id ORDER BY score DESC,p.joined LIMIT 100",
          [r.pin],
        );
      }
    }
    res.json(result);
  });
  app.get("/api/rooms/:pin/qr/:format", async (req, res) => {
    const r = await getRoom(req.params.pin);
    check(r, "Session unavailable.", 404);
    const base =
      process.env.PUBLIC_ORIGIN || req.protocol + "://" + req.get("host");
    const q = req.query.q;
    check(
      q === undefined ||
        (r.config.mode === "self" &&
          /^\d+$/.test(q) &&
          Number(q) < r.snapshot.length),
      "Invalid question link.",
    );
    const link = base + "/#/join/" + r.pin + (q === undefined ? "" : "/" + q);
    check(["png", "svg"].includes(req.params.format), "Choose PNG or SVG.");
    const svg = req.params.format === "svg";
    res
      .type(svg ? "image/svg+xml" : "image/png")
      .send(
        svg
          ? await QRCode.toString(link, { type: "svg" })
          : await QRCode.toBuffer(link, { width: 800 }),
      );
  });
  app.get("/api/rooms/:pin/report", auth, async (req, res) => {
    const r = await getRoom(req.params.pin);
    manage(req.user, r);
    const records = await rows(
      "SELECT p.name,p.team,a.q,a.value,a.correct,a.points,a.elapsed FROM people p LEFT JOIN answers a ON a.person=p.id WHERE p.pin=$1 ORDER BY p.joined,a.q",
      [r.pin],
    );
    const table = records.map((v) => [
      v.name,
      v.team,
      r.snapshot[v.q]?.prompt || "",
      Array.isArray(v.value) ? v.value.join(", ") : (v.value ?? ""),
      v.correct === null ? "" : String(v.correct),
      v.points,
      Number(v.elapsed) || 0,
    ]);
    const headings = [
      "Participant",
      "Team",
      "Question",
      "Response",
      "Correct",
      "Points",
      "Elapsed (ms)",
    ];
    if (req.query.format === "xlsx") {
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet("Session");
      sheet.addRow(headings);
      sheet.addRows(table);
      res
        .attachment("session-" + r.pin + ".xlsx")
        .send(Buffer.from(await book.xlsx.writeBuffer()));
    } else if (req.query.format === "csv") {
      const quote = (v) =>
        '"' +
        String(v ?? "")
          .replace(/^([\s]*[=+@-])/, "'$1")
          .replaceAll('"', '""') +
        '"';
      res
        .attachment("session-" + r.pin + ".csv")
        .send(
          "\uFEFF" +
            [headings, ...table]
              .map((row) => row.map(quote).join(","))
              .join("\r\n"),
        );
    } else res.json({ title: r.title, headings, table });
  });
}
