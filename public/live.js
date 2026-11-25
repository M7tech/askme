import { tr, num, locale, chooseLanguage, bindLanguage } from "./locale.js";
import {
  main,
  esc,
  $,
  all,
  link,
  btn,
  submitButton,
  field,
  area,
  select,
  check,
  go,
  notice,
  confirmAction,
  busy,
  api,
  submit,
  actions,
  title,
  pageHead,
  empty,
  chip,
  capped,
  more,
  storageKey,
  icon,
} from "./shared.js";
import { mark, roomFigure, tally } from "./room.js";
import { selfieStep, bindSelfie } from "./selfie.js";
let closeLive = () => {};
function roomCleanup() {
  closeLive();
  closeLive = () => {};
}
function bindEffects(q, style) {
  if (
    !q.motion ||
    q.effect === "None" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  all("[data-action^=pick]").forEach((b, i) => {
    if (q.motion.target >= 0 && i !== q.motion.target) return;
    let count = 0;
    b.onpointerenter = () => {
      if (count++ >= q.motion.moves) return;
      const d =
        q.motion.intensity * (style === "Party" ? 4 : style === "Fun" ? 3 : 1);
      const effect =
        q.effect === "Random"
          ? ["Vertical", "Run away", "Shake"][Math.floor(Math.random() * 3)]
          : q.effect;
      const mid =
        effect === "Run away" || effect === "Escape and return"
          ? "translateX(" + d * 2 + "px)"
          : effect === "Shake"
            ? "rotate(" + d + "deg)"
            : "translateY(-" + d + "px)";
      b.firstElementChild.animate(
        [{ transform: "none" }, { transform: mid }, { transform: "none" }],
        { duration: q.motion.duration, easing: "ease-out" },
      );
    };
  });
}
function watch(pin, fn) {
  let ws,
    retry,
    fallback,
    pending,
    busy = false,
    again = false,
    done = false;
  const page = location.hash;
  const refresh = async () => {
    if (done || location.hash !== page) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      await fn();
    } catch (e) {
      notice(e.message, "error");
    } finally {
      busy = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(refresh, 160);
  };
  const connect = () => {
    ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") +
        location.host +
        "/live/" +
        pin,
    );
    ws.onmessage = schedule;
    ws.onopen = schedule;
    ws.onclose = () => {
      if (!done) retry = setTimeout(connect, 1500);
    };
  };
  connect();
  fallback = setInterval(refresh, 12000);
  closeLive = () => {
    done = true;
    clearInterval(fallback);
    clearTimeout(retry);
    clearTimeout(pending);
    ws.close();
  };
}
const group = (heading, body) =>
  `<section class="setting"><h2>${esc(heading)}</h2><div class="stack">${body}</div></section>`;
const switches = (list) =>
  `<div class="switches">${list.map((v) => check(...v)).join("")}</div>`;
async function launch(id) {
  const q = await api("quizzes/" + id);
  main.innerHTML = `${pageHead("Launch a session", q.title)}<form novalidate id="launch" class="launch">${
    group(
      "Participation",
      `<div class="fields">${select("Participation mode", "mode", [
        ["live", "Presenter-led live"],
        ["self", "Self-paced"],
      ])}${field("Scheduled opening (optional)", "starts", "", "datetime-local")}</div><div class="fields">${field("Participant limit", "max", 500, "number", 'min="1" max="10000" required')}${field("Expires in days", "days", 7, "number", 'min="1" max="365" required')}</div>${switches(
        [
          ["Private access phrase", "private"],
          ["Allow late joining", "late", true],
        ],
      )}<div id="phrase"></div>`,
    ) +
    group(
      "When students scan the QR code",
      switches([
        ["Ask for name", "askName", true],
        ["Ask for a selfie", "selfie"],
      ]) +
        '<p class="hint">Without a name, students join as numbered guests. A selfie is optional for each student and needs their consent.</p>',
    ) +
    group(
      "Answers",
      `${select("Release correct answers", "release", [
        ["manual", "When I reveal them"],
        ["immediate", "After submission"],
        ["timer", "When time expires"],
        ["all", "After everyone answers"],
        ["end", "After the session ends"],
        ["scheduled", "On a scheduled date"],
        ["never", "Never"],
      ])}<div id="date"></div>${switches([
        ["Allow changes before release", "changes"],
        ["Keep multiple attempts (latest counts)", "repeat"],
        ["Shuffle questions", "randomQuestions"],
        ["Shuffle choices", "randomAnswers"],
      ])}`,
    ) +
    group(
      "Scoring",
      switches([
        ["Graded assessment (disables effects)", "graded", true],
        ["Enable leaderboard", "rank"],
        ["Enable teams", "team"],
        ["Speed bonus", "speed"],
        ["Negative marking", "negative"],
        ["Completion certificates", "certificate"],
      ]) +
        `<div class="fields">${select("Entertainment mode", "style", ["Professional", "Fun", "Party"])}${select("Competition display", "game", ["Leaderboard", "Car racing", "Space racing", "Horse racing", "Balloon race", "Mountain climb", "Treasure hunt", "Quiz battle"])}</div>`,
    ) +
    group(
      "Photographs",
      switches([
        ["Consent-based photography", "photography"],
        ["Require verified guardian authorization for photos", "guardian"],
      ]),
    )
  }<div class="commit">${submitButton("Create session", "primary", "play")}${link("Back to quiz", (q.kind === "presentation" ? "#/presentation/" : "#/editor/") + id, "button quiet")}</div></form>`;
  $("[name=private]").onchange = (e) =>
    ($("#phrase").innerHTML = e.target.checked
      ? field(
          tr("phrase"),
          "passcode",
          "",
          "password",
          'required minlength="8" autocomplete="off"',
        )
      : "");
  $("[name=release]").onchange = (e) =>
    ($("#date").innerHTML =
      e.target.value === "scheduled"
        ? field(
            "Release date and time",
            "releaseAt",
            "",
            "datetime-local",
            "required",
          )
        : "");
  // A selfie is a session photograph, so the two settings move together.
  const selfie = $("[name=selfie]"),
    photography = $("[name=photography]");
  selfie.onchange = () => {
    if (selfie.checked) photography.checked = true;
  };
  photography.onchange = () => {
    if (!photography.checked) selfie.checked = false;
  };
  submit("#launch", async (b, f) => {
    for (const box of f.querySelectorAll("[type=checkbox]"))
      b[box.name] = box.checked;
    b.anonymous = !b.askName;
    delete b.askName;
    if (b.starts) b.starts = new Date(b.starts).toISOString();
    if (b.releaseAt) b.releaseAt = new Date(b.releaseAt).toISOString();
    const r = await api("rooms", "POST", { ...b, quiz: id });
    go("host/" + r.pin);
  });
}
const qrImage = (pin, q) =>
  `<img class="qr" width="220" height="220" src="/api/rooms/${esc(pin)}/qr/svg${q === undefined ? "" : "?q=" + q}" alt="QR code to join session ${esc(pin)}">`;
function qr(pin, q) {
  const base = "/api/rooms/" + pin + "/qr/",
    query = q === undefined ? "" : "?q=" + q;
  return `${qrImage(pin, q)}<div class="actions"><a download="session-${pin}.png" class="button small" href="${base}png${query}">${icon("download")}<span>Download PNG</span></a><a download="session-${pin}.svg" class="button small" href="${base}svg${query}">${icon("download")}<span>Download SVG</span></a></div>`;
}
/* Polling redraws must not close an open participant or drop typed feedback. */
function holdDrafts(scope) {
  const open = all(scope + " details[open][data-key]").map(
      (d) => d.dataset.key,
    ),
    drafts = all(scope + " textarea[data-key]")
      .filter((t) => t.value !== t.defaultValue)
      .map((t) => [t.dataset.key, t.value]),
    expanded = $(scope + " .list") && !$(scope + " .capped"),
    active = document.activeElement,
    focus = active?.dataset?.key,
    at = active?.selectionStart;
  return () => {
    for (const key of open) {
      const d = $(`${scope} details[data-key="${CSS.escape(key)}"]`);
      if (d) d.open = true;
    }
    for (const [key, value] of drafts) {
      const t = $(`${scope} textarea[data-key="${CSS.escape(key)}"]`);
      if (t) t.value = value;
    }
    if (expanded) $(scope + " [data-more]")?.click();
    if (focus && active.tagName === "TEXTAREA") {
      const t = $(`${scope} textarea[data-key="${CSS.escape(focus)}"]`);
      t?.focus();
      t?.setSelectionRange(at, at);
    }
  };
}
async function host(pin) {
  const path = "rooms/" + pin + "/";
  let last = "";
  const draw = async () => {
    const r = await api(path + "host");
    if (location.hash !== "#/host/" + pin) return;
    const json = JSON.stringify(r);
    if (last === json) return;
    const focused =
      document.activeElement?.closest?.("[data-action]")?.dataset.action;
    const restore = holdDrafts("#people");
    last = json;
    const answered = r.tally.find((v) => v.q === r.position)?.total || 0,
      pending = r.messages.filter((m) => !m.approved);
    const step =
      r.phase === "waiting"
        ? btn("Start session", "start", "sun", "play")
        : r.phase === "ended"
          ? ""
          : (r.phase === "paused"
              ? btn("Resume", "resume", "sun", "play")
              : "") +
            (r.position > 0 ? btn("Previous", "previous", "", "prev") : "") +
            (r.position + 1 < r.snapshot.length
              ? btn(
                  "Next question",
                  "next",
                  r.phase === "paused" ? "" : "sun",
                  "",
                  "next",
                )
              : "") +
            (r.phase === "open"
              ? btn("Pause", "pause", "", "pause") +
                btn("Close answering", "close", "", "lock") +
                (Number(r.deadline)
                  ? btn("Add 15 seconds", "extend", "", "clock")
                  : "")
              : "");
    main.innerHTML = `<div class="page-head"><div class="with-chip">${title(r.title)}${chip(r.phase)}</div><div class="actions"><a href="#/display/${pin}" class="button primary" target="_blank" rel="noopener"><span>Open projector</span>${icon("external")}</a>${link("Session report", "#/report/" + pin, "button", "reports")}${r.config.rank ? link("Competition display", "#/standings/" + pin, "button", "trophy") : ""}${r.config.photography ? link(tr("gallery"), "#/host-gallery/" + pin, "button", "camera") : ""}</div></div><div class="console"><div class="console-main"><section class="podium board" aria-label="Presenter controls"><p class="meta"><span>${`Question ${r.position + 1} of ${r.snapshot.length}`}</span><span>${esc(r.snapshot[r.position].type)}</span></p><h2 translate="no" dir="auto">${esc(r.snapshot[r.position].prompt)}</h2><div class="answered"><p><strong>${num(answered)}</strong> <span>${`of ${r.people.length} participants answered`}</span></p>${tally(answered, r.people.length, "Responses")}</div><div class="actions">${step}</div><div class="actions secondary">${r.config.release === "manual" && !r.revealed.includes(r.position) ? btn("Reveal answer", "reveal", "", "eye") : ""}${btn(r.config.stats ? "Hide statistics" : "Show statistics", "stats", "", "chart")}${r.phase !== "ended" ? btn("End session", "ask-end", "end danger", "stop") : ""}</div></section>${r.review.length ? `<section class="block"><h2>Review text responses</h2><div class="list">${r.review.map((v, i) => `<div class="listitem"><p translate="no" dir="auto">${esc(v.value)}</p>${btn("Approve for display", "text:" + i, "small", "check")}</div>`).join("")}</div></section>` : ""}<section class="block"><h2>Audience moderation</h2>${
      pending.length
        ? `<div class="list">${pending.map((m) => `<div class="listitem"><p translate="no" dir="auto">${esc(m.body)}</p>${btn("Approve", "approve-" + m.id, "small", "check")}</div>`).join("")}</div>`
        : empty("No questions awaiting approval.")
    }</section><section class="block" id="people"><h2>Participants</h2>${
      r.people.length
        ? capped(
            r.people.map(
              (p) =>
                `<details class="person" data-key="${esc(p.id)}"><summary>${icon("chevron")}${p.selfie ? `<img class="avatar" width="40" height="40" loading="lazy" alt="Selfie" src="/api/rooms/${esc(pin)}/photos/${esc(p.selfie)}?thumb=1">` : ""}<strong translate="no" dir="auto">${esc(p.name)}</strong>${p.team ? `<span class="chip" translate="no">${esc(p.team)}</span>` : ""}</summary><form novalidate class="feedback stack" data-id="${esc(p.id)}">${area("Private feedback", "feedback", p.feedback, `data-key="t${esc(p.id)}"`)}<div class="actions">${submitButton("Save feedback", "small")}${btn("Remove participant", "ask-remove-" + p.id, "small quiet danger", "trash")}</div></form></details>`,
            ),
          )
        : empty("Share the PIN or QR code to invite participants.")
    }</section></div><aside class="invite"><p>Participation PIN</p><strong class="pin">${esc(pin)}</strong>${qr(pin)}${link("Participation link", "#/join/" + pin, "textlink", "link")}${r.config.mode === "self" ? `<details><summary>${icon("chevron")}<span>Question links</span></summary>${r.snapshot.map((q, i) => `<div class="qlink">${link("Question " + (i + 1), "#/join/" + pin + "/" + i, "textlink")}${qr(pin, i)}</div>`).join("")}</details>` : ""}</aside></div>`;
    restore();
    if (focused)
      $(`[data-action="${CSS.escape(focused)}"]`)?.focus({
        preventScroll: true,
      });
    all(".feedback").forEach((f) => {
      f.onsubmit = (e) => {
        e.preventDefault();
        busy(e.submitter, async () => {
          await api(path + "control", "POST", {
            action: "feedback",
            person: f.dataset.id,
            feedback: f.feedback.value,
          });
          f.feedback.defaultValue = f.feedback.value;
          notice("Feedback saved.");
        });
      };
    });
    actions(async (a) => {
      if (a.startsWith("text:")) {
        const v = r.review[Number(a.slice(5))];
        await api(path + "control", "POST", { action: "approve-answer", ...v });
        await draw();
        return;
      }
      if (a === "ask-end") {
        if (
          await confirmAction(
            "End this session?",
            "Answering closes for everyone.",
            "End session",
          )
        ) {
          await api(path + "control", "POST", { action: "end" });
          await draw();
        }
        return;
      }
      if (a.startsWith("ask-remove-")) {
        const person = a.slice(11);
        if (
          await confirmAction(
            "Remove this participant?",
            "Their responses are erased and cannot be recovered.",
            "Remove participant",
          )
        ) {
          await api(path + "control", "POST", {
            action: "remove",
            person,
            message: person,
          });
          await draw();
        }
        return;
      }
      const [act, ...rest] = a.split("-");
      await api(path + "control", "POST", {
        action: act,
        person: rest.join("-"),
        message: rest.join("-"),
      });
      await draw();
    });
  };
  await draw();
  watch(pin, draw);
}
async function join(pin, q) {
  if (!/^\d{6}$/.test(pin || ""))
    throw Error("Enter the six-digit PIN from your presenter.");
  const info = await api("rooms/" + pin + "/info"),
    saved = localStorage.getItem(storageKey(pin)),
    play = "play/" + pin + "/" + (Number(q) || 0);
  main.innerHTML = `<section class="entry"><div class="stage-bar"><p class="stage-pin"><span>${tr("session")}</span> <b class="pin">${esc(pin)}</b></p>${chooseLanguage()}</div><h1 translate="no" dir="auto">${esc(info.title)}</h1>${saved ? `<div class="stack">${link(tr("continue"), "#/" + play, "button primary wide", "", "next")}${link(tr("results"), "#/results/" + pin + "/" + localStorage.getItem("chorus.results." + pin), "button wide", "lock")}</div>` : `<form novalidate id="join" class="stack">${info.anonymous ? "<p>" + tr("anonymous") + "</p>" : field(tr("name"), "name", "", "text", 'required maxlength="80" autocomplete="name" dir="auto"')}${info.private ? field(tr("phrase"), "passcode", "", "password", "required") : ""}${info.team ? field(tr("team"), "team", "", "text", 'dir="auto"') : ""}${info.selfie && !info.guardian ? selfieStep() : info.photography ? check(tr("consent"), "consent") + (info.selfie ? `<p class="hint">${tr("selfieGuardian")}</p>` : "") : ""}${submitButton(tr("join"), "primary wide", "", "next")}</form>`}</section>`;
  bindLanguage();
  const selfie = bindSelfie();
  closeLive = selfie.stop;
  submit("#join", async (b) => {
    const photo = selfie.photo();
    const v = await api("rooms/" + pin + "/join", "POST", {
      ...b,
      consent: b.consent === "on",
    });
    localStorage.setItem(storageKey(pin), v.token);
    localStorage.setItem("chorus.results." + pin, v.resultToken);
    if (photo) {
      const form = new FormData();
      form.append("moment", "Selfie");
      form.append("image", photo, "selfie.jpg");
      // Joining has already succeeded, so a failed upload never blocks entry.
      try {
        await api("rooms/" + pin + "/photos", "POST", form, v.token);
      } catch {
        notice(tr("selfieLater"), "error");
      }
    }
    go(play);
  });
}
const letter = (i) => "ABCDEFGHIJKL".charAt(i) || i + 1;
const many = ["Multiple choice", "Ordering", "Ranking"];
/* The answer surface for one question, on a phone or on the projector. */
function surface(q, s, { display, available, correct }) {
  const off = available ? "" : "disabled";
  if (q.type === "Slide") return "";
  if (q.labels?.length)
    return display
      ? `<div class="pairs"><ul>${q.labels.map((l) => `<li dir="auto">${esc(l)}</li>`).join("")}</ul><ul>${q.targets.map((l) => `<li dir="auto">${esc(l)}</li>`).join("")}</ul></div>`
      : `<fieldset class="matches" ${off}>${q.labels.map((label, i) => select(label, "pair" + i, [["", "—"], ...q.targets], s.response?.[i])).join("")}</fieldset>`;
  if (q.type === "Image hotspot")
    return display
      ? ""
      : `<fieldset class="fields" ${off}>${field("X (%)", "x", s.response?.[0] ?? 50, "number", 'min="0" max="100"')}${field("Y (%)", "y", s.response?.[1] ?? 50, "number", 'min="0" max="100"')}</fieldset>`;
  if (q.options.length)
    return `<div class="answers${s.solution !== undefined ? " settled" : ""}">${q.options.map((o, i) => `<button type="button" data-action="pick-${i}" class="answer tone${i % 4} ${esc(q.effect)}${correct.includes(o) ? " right" : ""}" ${display || !available ? "disabled" : ""}><span class="key">${mark(i)}<b>${letter(i)}</b></span><span class="label" dir="auto">${esc(o)}</span>${correct.includes(o) ? icon("check", "tick") : ""}</button>`).join("")}</div><p id="selection" class="meta"></p>`;
  if (display) return "";
  if (q.type === "Rating")
    return `<fieldset class="scale" ${off}><legend>${tr("rating")}</legend><div class="answers">${["1", "2", "3", "4", "5"].map((n) => `<label class="point"><input type="radio" required name="value" value="${n}" ${s.response === n ? "checked" : ""}><span>${num(n)}</span></label>`).join("")}</div></fieldset>`;
  return field(
    tr("response"),
    "value",
    s.response || "",
    q.type === "Numeric" ? "number" : "text",
    (q.type === "Numeric" ? 'step="any" required ' : 'required dir="auto" ') +
      off,
  );
}
function spread(q, s, correct) {
  const index = (v) => q.options.indexOf([v].flat()[0]);
  const rows = [...s.distribution].sort((a, b) =>
    Array.isArray(a.value) ? b.n - a.n : index(a.value) - index(b.value),
  );
  return `<section class="spread"><h2>${tr("stats")}</h2>${rows
    .map((d, n) => {
      const at = index(d.value),
        i = at < 0 ? n : at,
        share = Math.round((100 * d.n) / (s.answered || 1)),
        text = [d.value].flat().join(", "),
        hit = correct.includes(d.value);
      return `<div class="bar bar-${i % 4}${hit ? " right" : ""}"><span class="bar-label">${at >= 0 && !Array.isArray(d.value) ? mark(i) : ""}<span dir="auto">${esc(text)}</span>${hit ? icon("check", "tick") : ""}</span><progress value="${d.n}" max="${s.answered || 1}" aria-label="${esc(text)}"></progress><span class="bar-value"><b>${num(d.n)}</b> <small>${num(share)}%</small></span></div>`;
    })
    .join("")}</section>`;
}
async function stage(pin, requested, display) {
  const session = display ? null : localStorage.getItem(storageKey(pin));
  if (!display && !session) {
    go("join/" + pin + "/" + (Number(requested) || 0));
    return;
  }
  const path = "rooms/" + pin + "/",
    target = location.hash;
  let last = "",
    timer,
    answers = [],
    signature = "",
    priorPhase = "",
    talk = null,
    seated = -1;
  const draw = async () => {
    const s = await api(
      path + "state?q=" + (Number(requested) || 0) + "&lang=" + locale(),
      "GET",
      undefined,
      session,
    );
    if (location.hash !== target) return;
    const snapshot = JSON.stringify({
        ...s,
        now: 0,
        answered: 0,
        participants: 0,
        messages: [],
      }),
      changed = snapshot !== last;
    const q = s.question;
    if (changed) {
      const changedQ = signature !== String(s.position);
      if (changedQ || priorPhase === "waiting") {
        answers = Array.isArray(s.response) ? [...s.response] : [];
        signature = String(s.position);
      }
      const fresh = changedQ || priorPhase === "waiting";
      priorPhase = s.phase;
      last = snapshot;
      talk = null;
      seated = -1;
      const resultLink = session
        ? link(
            tr("results"),
            "#/results/" +
              pin +
              "/" +
              localStorage.getItem("chorus.results." + pin),
            "button",
            "lock",
          )
        : "";
      const available =
        q?.type !== "Slide" &&
        s.phase === "open" &&
        (!s.deadline || s.now < s.deadline) &&
        (s.response === undefined || s.changes) &&
        s.solution === undefined;
      const correct =
        s.solution && q?.options.length && q.type !== "Ordering"
          ? q.type === "Multiple choice"
            ? s.solution.split("|")
            : [s.solution]
          : [];
      const ended = s.phase === "ended";
      const body =
        s.phase === "waiting"
          ? `<div class="lobby"><div class="lobby-copy"><h1>${tr("wait")}</h1>${display ? `<div class="lobby-join">${qrImage(pin)}<div><span>${tr("pin")}</span><strong class="pin">${esc(pin)}</strong><span dir="ltr" translate="no">${esc(location.host)}</span></div></div>` : `<p>${tr("joined")}</p>`}</div><div id="hall"></div></div>`
          : ended
            ? `<div class="lobby"><div class="lobby-copy"><h1>${tr("ended")}</h1>${resultLink}</div><div id="hall"></div></div>`
            : `<div class="question ${fresh ? "enter" : ""}"><div class="question-meta"><p class="meta"><span>${tr("question")} ${num(s.position + 1)} ${tr("of")} ${num(s.count)}</span><span>${esc(q.type)}</span>${s.phase === "open" ? "" : chip(s.phase)}</p><strong id="timer" role="timer"></strong></div><div class="rich" role="heading" aria-level="1" dir="auto" translate="no">${q.rich || esc(q.prompt)}</div>${q.asset ? (q.asset.mime.startsWith("image/") ? `<img class="attachment" alt="Question illustration" src="/api/assets/${esc(q.asset.id)}">` : `<${q.asset.mime.startsWith("audio/") ? "audio" : "video"} class="attachment" controls src="/api/assets/${esc(q.asset.id)}"></${q.asset.mime.startsWith("audio/") ? "audio" : "video"}>`) : ""}<form novalidate class="stack" id="answer">${surface(q, s, { display, available, correct })}${!display && available ? `<div class="answer-bar"><button class="primary wide" id="send"><span>${tr("send")}</span></button></div>` : ""}</form>${s.response !== undefined ? `<p class="info recorded">✓ ${tr("recorded")}: ${esc([s.response].flat().join(", "))}</p>` : ""}${s.solution !== undefined ? `<div class="info solution"><strong>${s.solution ? tr("answer") + ": " + esc(s.solution) : tr("feedback")}</strong>${s.explanation ? `<p dir="auto" translate="no">${esc(s.explanation)}</p>` : ""}${s.reference ? `<small dir="auto" translate="no">${esc(s.reference)}</small>` : ""}</div>` : ""}${s.textStats ? `<section class="cloud" translate="no">${s.textStats.map((v, i) => `<span class="cloudword tone${i % 4} size${Math.min(4, v.n)}" dir="auto">${esc(v.value)} <small>×${num(v.n)}</small></span>`).join("")}</section>` : ""}${s.distribution ? spread(q, s, correct) : ""}</div>`;
      const links =
        (!display && s.mode === "self" && s.position > 0
          ? link(
              tr("previous"),
              "#/play/" + pin + "/" + (s.position - 1),
              "button",
              "prev",
            )
          : "") +
        (!display && s.mode === "self" && s.position < s.count - 1
          ? link(
              tr("next"),
              "#/play/" + pin + "/" + (s.position + 1),
              "button",
              "",
              "next",
            )
          : "") +
        (!display && !ended ? resultLink : "") +
        (s.rank
          ? link(tr("leaderboard"), "#/standings/" + pin, "button", "trophy")
          : "") +
        (!display && s.photos
          ? link(tr("gallery"), "#/gallery/" + pin, "button", "camera")
          : "");
      main.innerHTML = `<section class="stage ${display ? "projector" : ""} ${esc(s.phase)}"><div class="stage-bar"><strong class="stage-title" translate="no" dir="auto">${esc(s.title)}</strong><p class="stage-pin"><span>${tr("pin")}</span> <b class="pin">${esc(pin)}</b></p><p id="count" class="meta"></p>${chooseLanguage()}${display ? `<button type="button" class="icon-button" data-action="fullscreen" aria-label="${tr("fullscreen")}">${icon("fullscreen")}</button>` : ""}</div>${body}${display && s.projected?.length ? `<div class="projected">${s.projected.map((f) => `<img class="photo" alt="${esc(f.moment || "Session photograph")}" src="/api/rooms/${pin}/projected/${esc(f.id)}">`).join("")}</div>` : ""}${links ? `<div class="actions stage-links">${links}</div>` : ""}</section><section class="stage talk ${display ? "projector" : ""}"><h2>${tr("qa")}</h2><div id="discussion"></div>${display || ended ? "" : `<form novalidate id="discuss" class="askform">${field(tr("ask"), "body", "", "text", 'required maxlength="500" dir="auto"')}${submitButton(tr("moderate"), "")}</form>`}</section>`;
      bindLanguage();
      function selection() {
        all("[data-action^=pick]").forEach((b, i) => {
          const at = answers.indexOf(q.options[i]);
          b.classList.toggle("selected", at >= 0);
          b.setAttribute("aria-pressed", String(at >= 0));
          b.querySelector(".key b").textContent =
            at >= 0 && ["Ordering", "Ranking"].includes(q.type)
              ? num(at + 1)
              : letter(i);
        });
        if ($("#selection"))
          $("#selection").textContent =
            answers.length && many.includes(q.type)
              ? tr("selected") +
                ": " +
                answers.join(q.type === "Multiple choice" ? ", " : " → ")
              : "";
      }
      if (q?.options.length) {
        if (!answers.length && s.response !== undefined)
          answers = [s.response].flat();
        selection();
        bindEffects(q, s.style);
      }
      actions(async (a) => {
        if (a === "fullscreen") {
          await document.documentElement.requestFullscreen();
          return;
        }
        if (a.startsWith("vote-")) {
          await api(path + "discuss", "POST", { vote: a.slice(5) }, session);
          return;
        }
        if (a.startsWith("pick-")) {
          const value = q.options[Number(a.slice(5))];
          answers = many.includes(q.type)
            ? answers.includes(value)
              ? answers.filter((v) => v !== value)
              : [...answers, value]
            : [value];
          selection();
        }
      });
      if (q?.type === "Image hotspot" && $(".attachment") && !display) {
        const image = $(".attachment");
        image.classList.add("pinnable");
        image.onclick = (e) => {
          const rect = e.target.getBoundingClientRect();
          $("[name=x]").value = Math.round(
            (100 * (e.clientX - rect.left)) / rect.width,
          );
          $("[name=y]").value = Math.round(
            (100 * (e.clientY - rect.top)) / rect.height,
          );
        };
      }
      if (q?.type === "Drag and drop" && !display) {
        const form = $("#answer");
        const tray = document.createElement("div");
        tray.className = "tray";
        for (const target of q.targets) {
          const piece = document.createElement("span");
          piece.className = "piece";
          piece.textContent = target;
          piece.draggable = true;
          piece.ondragstart = (e) =>
            e.dataTransfer.setData("text/plain", target);
          tray.append(piece);
        }
        form.prepend(tray);
        form.ondragover = (e) => e.preventDefault();
        form.ondrop = (e) => {
          e.preventDefault();
          const choice = e.target.closest(".field")?.querySelector("select");
          if (choice) choice.value = e.dataTransfer.getData("text/plain");
        };
      }
      submit("#answer", async (b) => {
        const value = q.labels?.length
          ? q.labels.map((_, i) => b["pair" + i])
          : q.type === "Image hotspot"
            ? [Number(b.x), Number(b.y)]
            : q.options.length
              ? many.includes(q.type)
                ? answers
                : answers[0]
              : b.value;
        await api(
          path + "answer",
          "POST",
          { q: s.position, value, requestId: crypto.randomUUID() },
          session,
        );
        await draw();
      });
      submit("#discuss", async (b, f) => {
        await api(path + "discuss", "POST", b, session);
        f.reset();
        notice(tr("awaiting"));
      });
    }
    $("#count").innerHTML =
      `<span>${num(s.participants)} ${tr("participants")}</span>` +
      (s.phase === "waiting"
        ? ""
        : `<span>${num(s.answered)} ${tr("responses")}</span>`);
    if ($("#hall") && seated !== s.participants) {
      seated = s.participants;
      $("#hall").innerHTML = roomFigure(s.participants);
    }
    const messages = s.messages
      .map(
        (m) =>
          `<div class="listitem"><p translate="no" dir="auto">${esc(m.body)}</p>${display ? `<span class="meta">${num(m.votes)} ${tr("votes")}</span>` : `<button type="button" class="small" data-action="vote-${esc(m.id)}" aria-label="${num(m.votes)} ${tr("votes")}">${icon("up")}<span>${num(m.votes)}</span></button>`}</div>`,
      )
      .join("");
    if (messages !== talk) {
      talk = messages;
      $("#discussion").innerHTML = messages
        ? `<div class="list">${messages}</div>`
        : `<p class="hint">${tr("empty")}</p>`;
      $(".talk").hidden = !!display && !messages;
    }
    clearInterval(timer);
    const offset = s.now - Date.now();
    const tick = () => {
      const el = $("#timer");
      if (!el) return;
      if (s.deadline && s.phase === "open") {
        const left = Math.max(
          0,
          Math.ceil((s.deadline - Date.now() - offset) / 1000),
        );
        el.textContent = num(left);
        el.classList.toggle("urgent", left <= 5);
        if (!left && $("#send")) $("#send").disabled = true;
      } else el.textContent = "";
    };
    tick();
    timer = setInterval(tick, 500);
  };
  await draw();
  watch(pin, draw);
  const old = closeLive;
  closeLive = () => {
    old();
    clearInterval(timer);
  };
}
async function results(pin, raw) {
  const r = await api(
    "rooms/" + pin + "/results?lang=" + locale(),
    "GET",
    undefined,
    raw,
  );
  const verdict = (q) =>
    q.solution === undefined
      ? "pending"
      : q.correct === true
        ? "right"
        : q.correct === false
          ? "wrong"
          : "reviewed";
  main.innerHTML = `<section class="results"><div class="stage-bar"><p class="chip">${icon("lock")}<span>${tr("privateReport")}</span></p>${chooseLanguage()}${btn(tr("print"), "print", "small", "print")}</div><div class="score board"><div><h1 translate="no" dir="auto">${esc(r.name)}</h1><p translate="no" dir="auto">${esc(r.title)}</p></div><div class="score-value">${r.score === undefined ? "" : `<strong>${num(r.score)} ${tr("points")}</strong>`}${r.percentage != null ? `<p class="meta"><span>${num(r.correct)} ${tr("correct")}</span><span>${num(r.incorrect)} ${tr("incorrect")}</span><span>${num(r.percentage)}%</span></p>` : ""}</div></div><p class="hint">${tr("bookmark")}</p>${r.photos.length ? `<div class="photos">${r.photos.map((f) => `<figure><img id="photo-${esc(f.id)}" class="photo" alt="${esc(f.moment || "Session photograph")}"><figcaption translate="no">${esc(f.moment)}</figcaption></figure>`).join("")}</div>` : ""}${r.feedback ? `<p class="info" translate="no" dir="auto">${esc(r.feedback)}</p>` : ""}<h2 class="review-title">${tr("byQuestion")}</h2><ol class="review">${r.questions.map((q, i) => `<li class="${verdict(q)}"><p class="meta"><span>${tr("question")} ${num(i + 1)}</span>${q.elapsed !== null ? `<span>${num(Math.round(q.elapsed / 1000))} ${tr("seconds")}</span>` : ""}</p><h2 translate="no" dir="auto">${esc(q.prompt)}</h2><dl><div><dt>${tr("response")}</dt><dd translate="no" dir="auto">${esc(q.value === undefined ? tr("unanswered") : [q.value].flat().join(", "))}</dd></div>${q.solution ? `<div><dt>${tr("answer")}</dt><dd translate="no" dir="auto">${esc(q.solution)}</dd></div>` : ""}</dl>${q.solution === undefined ? `<p class="hint">${tr("pending")}</p>` : `<strong class="verdict">${q.correct === true ? "✓ " + tr("correct") : q.correct === false ? tr("incorrect") : tr("reviewed")} · ${num(q.points)} ${tr("points")}</strong>${q.explanation ? `<p translate="no" dir="auto">${esc(q.explanation)}</p>` : ""}`}</li>`).join("")}</ol>${r.leaders ? `<section class="block"><h2>${tr("leaderboard")}</h2><div class="list">${r.leaders.map((v, i) => `<div class="listitem"><strong><span class="place">${num(i + 1)}</span> <span translate="no" dir="auto">${esc(v.name)}</span></strong><span>${num(v.score)} ${tr("points")}</span></div>`).join("")}</div></section>` : ""}${r.certificate ? `<article class="certificate"><div class="seal" aria-hidden="true">${[0, 1, 2, 3].map((i) => mark(i)).join("")}</div><p>${esc(r.design?.title || tr("certificate"))}</p><h2 translate="no" dir="auto">${esc(r.name)}</h2><p>${tr("completed")} <span translate="no">${esc(r.title)}</span></p><div class="sign"><span translate="no">${esc(r.design?.issuer)}</span><strong translate="no">${esc(r.design?.signature)}</strong></div></article>` : ""}</section>`;
  bindLanguage();
  actions((a) => {
    if (a === "print") print();
  });
  const urls = [];
  closeLive = () => urls.forEach((u) => URL.revokeObjectURL(u));
  for (const f of r.photos) {
    const resp = await fetch("/api/rooms/" + pin + "/results/photos/" + f.id, {
      headers: { "x-results": raw },
    });
    const el = $("#photo-" + f.id);
    if (el && resp.ok) {
      const url = URL.createObjectURL(await resp.blob());
      urls.push(url);
      el.src = url;
    }
  }
}
async function report(pin) {
  const path = "rooms/" + pin + "/report",
    r = await api(path);
  const graded = r.table.filter((row) => row[4] !== ""),
    right = graded.filter((v) => v[4] === "true").length;
  const cell = (v, i) =>
    i === 4 && (v === "true" || v === "false")
      ? `<td><span class="chip ${v === "true" ? "live" : "bad"}">${v === "true" ? "Correct" : "Incorrect"}</span></td>`
      : `<td dir="auto" translate="no">${esc(v)}</td>`;
  main.innerHTML = `<div class="page-head"><div>${title(r.title)}<p class="meta"><span>Session report</span><span><span>PIN</span> <b class="pin">${esc(pin)}</b></span></p></div><div class="actions">${link("Export CSV", "/api/" + path + "?format=csv", "button", "download")}${link("Export Excel", "/api/" + path + "?format=xlsx", "button", "download")}${btn("Print / Save PDF", "print", "", "print")}</div></div><section class="accuracy"><h2>Answer accuracy</h2>${graded.length ? `<p class="big">${num(Math.round((100 * right) / graded.length))}%</p><div><progress value="${right}" max="${graded.length}" aria-label="Answer accuracy"></progress><p>${`${right} of ${graded.length} graded responses are correct`}</p></div>` : "<p>No graded responses yet.</p>"}</section>${r.table.length ? `<div><div class="scroll" tabindex="0" role="region" aria-label="Session report"><table class="report-table"><thead><tr>${r.headings.map((v) => `<th scope="col">${esc(v)}</th>`).join("")}</tr></thead><tbody class="${r.table.length > 20 ? "capped" : ""}">${r.table.map((row) => `<tr>${row.map(cell).join("")}</tr>`).join("")}</tbody></table></div>${r.table.length > 20 ? more(r.table.length) : ""}</div>` : empty("Responses appear here once participants answer.")}`;
  actions(() => print());
}
async function gallery(pin, selectedPerson) {
  const presenter = location.hash.includes("/host-gallery/"),
    path = "rooms/" + pin + "/",
    raw = presenter ? null : localStorage.getItem(storageKey(pin));
  const opts = raw ? { "x-participant": raw } : {};
  const photos = await api(path + "photos", "GET", undefined, raw),
    hostData = raw ? null : await api(path + "host"),
    s = raw ? await api(path + "state", "GET", undefined, raw) : null;
  const urls = [];
  const file = (label, attrs, glyph) =>
    `<label class="filefield">${icon(glyph)}<span>${label}</span><input type="file" ${attrs}></label>`;
  const head = hostData
    ? link(
        "Download authorized photos (ZIP)",
        "/api/" + path + "photo-archive",
        "button",
        "download",
      ) + link("Open controls", "#/host/" + pin, "button", "prev")
    : link("Session", "#/play/" + pin, "button", "prev");
  main.innerHTML = `<div class="gallery">${pageHead("Session photographs", "", head)}<div class="gallery-grid"><div class="gallery-tools">${raw ? `<form novalidate id="consent" class="stack tool"><h2>Consent</h2>${check("I consent to private photography in this session. Withdrawing removes my photos.", "consent", s.consent)}${check("Allow public display of my photographs", "publicPhoto", s.publicPhoto)}<div class="actions">${submitButton("Save consent", "")}${btn("Show my identification QR", "identify", "", "qr")}</div><div id="identification"></div></form>` : ""}${
    hostData?.config.guardian
      ? `<form novalidate id="guardian" class="stack tool"><h2>Guardian authorization</h2>${select(
          "Participant",
          "person",
          hostData.people.map((p) => [p.id, p.name]),
          selectedPerson,
        )}${field("Verified consent record reference (leave blank to withdraw)", "reference")}${submitButton("Record authorization", "")}</form>`
      : ""
  }<form novalidate id="upload" class="stack tool"><h2>Add a photograph</h2>${
    hostData
      ? select(
          "Consenting participant",
          "person",
          hostData.people
            .filter(
              (p) =>
                p.consent &&
                (!hostData.config.guardian || p.guardian_reference),
            )
            .map((p) => [p.id, p.name]),
          selectedPerson,
        )
      : ""
  }${field("Moment or question", "moment", "", "text", 'dir="auto"')}${file("Take a photograph", 'id="camera" accept="image/*" capture="environment"', "camera")}${file("Or select an existing photograph", 'name="image" accept="image/jpeg,image/png,image/webp" required', "image")}${submitButton("Upload privately", "primary", "upload")}</form></div>${photos.length ? `<div class="photos">${photos.map((f) => `<figure><img class="photo" id="p${esc(f.id)}" alt="${esc(f.moment || "Session photograph")}"><figcaption><strong translate="no" dir="auto">${esc(f.name)}</strong><span translate="no" dir="auto">${esc(f.moment)}</span><div class="actions">${hostData && !hostData.config.secret && f.public_photo ? btn(f.published ? "Remove from projector" : "Show on public projector", "publish:" + f.id, "small", "slides") : ""}${btn("Delete photo", "delete-" + f.id, "small quiet danger", "trash")}</div></figcaption></figure>`).join("")}</div>` : empty("Photographs added to this session appear here.")}</div></div>`;
  for (const f of photos) {
    const response = await fetch(
      "/api/" + path + "photos/" + f.id + "?thumb=1",
      { headers: opts },
    );
    if (response.ok) {
      const url = URL.createObjectURL(await response.blob());
      urls.push(url);
      const img = $("#p" + f.id);
      if (img) img.src = url;
    }
  }
  closeLive = () => urls.forEach((u) => URL.revokeObjectURL(u));
  const reload = async () => {
    roomCleanup();
    await gallery(pin);
  };
  submit("#guardian", async (b) => {
    await api(path + "control", "POST", { action: "guardian", ...b });
    await reload();
  });
  submit("#consent", async (b) => {
    if (
      s.consent &&
      b.consent !== "on" &&
      photos.length &&
      !(await confirmAction(
        "Withdraw photography consent?",
        "Your photographs in this session are removed.",
        "Withdraw consent",
      ))
    )
      return;
    await api(
      path + "consent",
      "POST",
      { consent: b.consent === "on", publicPhoto: b.publicPhoto === "on" },
      raw,
    );
    await reload();
  });
  $("#camera").onchange = (e) => {
    if (e.target.files.length) {
      $("[name=image]").files = e.target.files;
      $("[name=image]").dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  submit("#upload", async (b, f) => {
    await api(path + "photos", "POST", new FormData(f), raw);
    notice("Photograph saved.");
    await reload();
  });
  actions(async (a) => {
    if (a.startsWith("publish:")) {
      const f = photos.find((p) => p.id === a.slice(8));
      await api(path + "photos/" + f.id + "/publish", "PATCH", {
        published: !f.published,
      });
      await reload();
      return;
    }
    if (a === "identify") {
      const response = await fetch("/api/" + path + "identification", {
        headers: opts,
      });
      if (!response.ok) throw Error("QR unavailable.");
      const url = URL.createObjectURL(await response.blob());
      urls.push(url);
      $("#identification").innerHTML =
        `<img class="qr" width="220" height="220" alt="Presenter identification QR" src="${url}">`;
      return;
    }
    if (
      !(await confirmAction(
        "Delete this photograph?",
        "It is removed for everyone and cannot be recovered.",
        "Delete photo",
      ))
    )
      return;
    await api(path + "photos/" + a.slice(7), "DELETE", undefined, raw);
    await reload();
  });
}
export {
  launch,
  host,
  join,
  stage,
  results,
  report,
  roomCleanup,
  gallery,
  watch,
};
