import { tr, num, locale, chooseLanguage, bindLanguage } from "./locale.js";
import {
  main,
  esc,
  $,
  all,
  formData,
  link,
  btn,
  field,
  area,
  select,
  check,
  go,
  notice,
  api,
  submit,
  actions,
  saveFile,
  title,
  tabs,
  storageKey,
  demo,
} from "./shared.js";
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
      notice(e.message);
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
async function launch(id) {
  const q = await api("quizzes/" + id);
  main.innerHTML =
    tabs("sessions") +
    title("Launch a session", q.title) +
    `<form novalidate class="panel stack" id="launch"><div class="fields">${select(
      "Participation mode",
      "mode",
      [
        ["live", "Presenter-led live"],
        ["self", "Self-paced"],
      ],
    )}${select("Release correct answers", "release", [
      ["manual", "When I reveal them"],
      ["immediate", "After submission"],
      ["timer", "When time expires"],
      ["all", "After everyone answers"],
      ["end", "After the session ends"],
      ["scheduled", "On a scheduled date"],
      ["never", "Never"],
    ])}</div><div id="date"></div><div class="fields">${field("Scheduled opening (optional)", "starts", "", "datetime-local")}${select("Entertainment mode", "style", ["Professional", "Fun", "Party"])}${select("Competition display", "game", ["Leaderboard", "Car racing", "Space racing", "Horse racing", "Balloon race", "Mountain climb", "Treasure hunt", "Quiz battle"])}</div><div class="fields">${field("Participant limit", "max", 500, "number", 'min="1" max="10000" required')}${field("Expires in days", "days", 7, "number", 'min="1" max="365" required')}</div><div class="fields">${[
      ["Anonymous participation", "anonymous"],
      ["Private access phrase", "private"],
      ["Allow late joining", "late", true],
      ["Allow changes before release", "changes"],
      ["Keep multiple attempts (latest counts)", "repeat"],
      ["Enable leaderboard", "rank"],
      ["Enable teams", "team"],
      ["Speed bonus", "speed"],
      ["Negative marking", "negative"],
      ["Graded assessment (disables effects)", "graded", true],
      ["Completion certificates", "certificate"],
      ["Consent-based photography", "photography"],
      ["Require verified guardian authorization for photos", "guardian"],
      ["Shuffle questions", "randomQuestions"],
      ["Shuffle choices", "randomAnswers"],
    ]
      .map((v) => check(...v))
      .join(
        "",
      )}</div><div id="phrase"></div><button class="primary">Create session</button></form>`;
  $("[name=private]").onchange = (e) =>
    ($("#phrase").innerHTML = e.target.checked
      ? field(
          tr("phrase"),
          "passcode",
          "",
          "password",
          'required minlength="8"',
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
  submit("#launch", async (b, f) => {
    for (const box of f.querySelectorAll("[type=checkbox]"))
      b[box.name] = box.checked;
    if (b.starts) b.starts = new Date(b.starts).toISOString();
    if (b.releaseAt) b.releaseAt = new Date(b.releaseAt).toISOString();
    const r = await api("rooms", "POST", { ...b, quiz: id });
    go("host/" + r.pin);
  });
}
function qr(pin, q) {
  const base = "/api/rooms/" + pin + "/qr/",
    query = q === undefined ? "" : "?q=" + q;
  return `<img class="qr" src="${base}svg${query}" alt="QR code to join session ${esc(pin)}"><div class="actions"><a download="session-${pin}.png" class="button" href="${base}png${query}">Download PNG</a><a download="session-${pin}.svg" class="button" href="${base}svg${query}">Download SVG</a></div>`;
}
async function host(pin) {
  const path = "rooms/" + pin + "/";
  let last = "";
  const draw = async () => {
    const r = await api(path + "host");
    if (location.hash !== "#/host/" + pin) return;
    const json = JSON.stringify(r);
    if (last === json) return;
    last = json;
    main.innerHTML =
      tabs("sessions") +
      `<div class="row">${title(r.title)}<span class="pill">${esc(r.phase)}</span></div><div class="actions"><a href="#/display/${pin}" class="button primary" target="_blank" rel="noopener">Open projector ↗</a>${link("Session report", "#/report/" + pin)}${r.config.rank ? link("Competition display", "#/standings/" + pin) : ""}${r.config.photography ? link(tr("gallery"), "#/host-gallery/" + pin) : ""}</div><div class="split"><section class="panel stack"><span class="eyebrow">Presenter controls · ${r.position + 1} / ${r.snapshot.length}</span><h2>${esc(r.snapshot[r.position].prompt)}</h2><p>${r.tally.find((v) => v.q === r.position)?.total || 0} of ${r.people.length} participants answered</p><div class="actions">${r.phase === "waiting" ? btn("Start session", "start", "primary") : r.phase === "ended" ? "" : (r.phase === "open" ? btn("Pause", "pause") + btn("Close answering", "close") + (Number(r.deadline) ? btn("＋15 seconds", "extend") : "") : "") + (r.phase === "paused" ? btn("Resume", "resume", "primary") : "") + (r.position > 0 ? btn("← Previous", "previous") : "") + (r.position + 1 < r.snapshot.length ? btn("Next question →", "next", "primary") : "")}${r.config.release === "manual" && !r.revealed.includes(r.position) ? btn("Reveal answer", "reveal") : ""}${btn(r.config.stats ? "Hide statistics" : "Show statistics", "stats")}${r.phase !== "ended" ? btn("End session", "ask-end", "danger") : ""}</div><div id="end"></div><h3>Participants</h3>${r.people.map((p) => `<details><summary>${esc(p.name)} ${esc(p.team)}</summary><form novalidate class="feedback stack" data-id="${esc(p.id)}">${area("Private feedback", "feedback", p.feedback)}<button>Save feedback</button></form>${btn("Remove participant", "ask-remove-" + p.id, "danger")}<div id="remove-${p.id}"></div></details>`).join("") || "<p>Share the PIN or QR code to invite participants.</p>"}${r.review.length ? "<h3>Review text responses</h3>" + r.review.map((v, i) => `<div class="listitem">${esc(v.value)}${btn("Approve for display", "text:" + i)}</div>`).join("") : ""}<h3>Audience moderation</h3>${
        r.messages
          .filter((m) => !m.approved)
          .map(
            (m) =>
              `<div class="listitem">${esc(m.body)}${btn("Approve", "approve-" + m.id)}</div>`,
          )
          .join("") || "<p>No questions awaiting approval.</p>"
      }</section><aside class="panel stage"><p>Participation PIN</p><strong class="large">${esc(pin)}</strong>${qr(pin)}${link("Participation link ↗", "#/join/" + pin)}${r.config.mode === "self" ? `<details><summary>Question links</summary>${r.snapshot.map((q, i) => `<p>${link("Question " + (i + 1), "#/join/" + pin + "/" + i)}</p>${qr(pin, i)}`).join("")}</details>` : ""}</aside></div>`;
    all(".feedback").forEach((f) => {
      f.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api(path + "control", "POST", {
            action: "feedback",
            person: f.dataset.id,
            feedback: f.feedback.value,
          });
          notice("Feedback saved.");
        } catch (err) {
          notice(err.message);
        }
      };
    });
    actions(async (a) => {
      if (a === "ask-end") {
        $("#end").innerHTML =
          "<p>End answering for everyone?</p>" +
          btn("Confirm end session", "end", "danger");
        return;
      }
      if (a.startsWith("ask-remove-")) {
        const who = a.slice(11);
        $("#remove-" + who).innerHTML = btn(
          "Confirm removal and erase responses",
          "remove-" + who,
          "danger",
        );
        return;
      }
      if (a.startsWith("text:")) {
        const v = r.review[Number(a.slice(5))];
        await api(path + "control", "POST", { action: "approve-answer", ...v });
        await draw();
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
  main.innerHTML = `<section class="narrow panel stack">${chooseLanguage()}<span class="pill">${tr("session")} ${esc(pin)}</span>${title(info.title)}${saved ? link(tr("continue"), "#/" + play, "button primary") + link(tr("results"), "#/results/" + pin + "/" + localStorage.getItem("chorus.results." + pin)) : `<form novalidate id="join" class="stack">${info.anonymous ? "<p>" + tr("anonymous") + "</p>" : field(tr("name"), "name", "", "text", 'required maxlength="80"')}${info.private ? field(tr("phrase"), "passcode", "", "password", "required") : ""}${info.team ? field(tr("team"), "team") : ""}${info.photography ? check(tr("consent"), "consent") : ""}<button class="primary">${tr("join")} →</button></form>`}</section>`;
  bindLanguage();
  submit("#join", async (b) => {
    const v = await api("rooms/" + pin + "/join", "POST", {
      ...b,
      consent: b.consent === "on",
    });
    localStorage.setItem(storageKey(pin), v.token);
    localStorage.setItem("chorus.results." + pin, v.resultToken);
    go(play);
  });
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
    priorPhase = "";
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
      priorPhase = s.phase;
      last = snapshot;
      const resultLink = session
        ? link(
            tr("results"),
            "#/results/" +
              pin +
              "/" +
              localStorage.getItem("chorus.results." + pin),
          )
        : "";
      const available =
        q?.type !== "Slide" &&
        s.phase === "open" &&
        (!s.deadline || s.now < s.deadline) &&
        (s.response === undefined || s.changes) &&
        s.solution === undefined;
      main.innerHTML = `<section class="stage panel stack">${chooseLanguage()}<div class="row"><span class="pill">${esc(s.title)}</span><span>${tr("pin")} <strong>${esc(pin)}</strong></span></div><div id="count" class="sub"></div>${
        s.phase === "waiting"
          ? `<h1>${tr("wait")}</h1>${display ? qr(pin) : "<p>" + tr("joined") + "</p>"}`
          : s.phase === "ended"
            ? `<h1>${tr("ended")}</h1>${resultLink}`
            : `<div class="row"><span>${tr("question")} ${num(s.position + 1)} ${tr("of")} ${num(s.count)}</span><strong id="timer"></strong></div><div class="rich" role="heading" aria-level="1">${q.rich || esc(q.prompt)}</div>${q.asset ? (q.asset.mime.startsWith("image/") ? `<img class="attachment" alt="Question illustration" src="/api/assets/${esc(q.asset.id)}">` : `<${q.asset.mime.startsWith("audio/") ? "audio" : "video"} class="attachment" controls src="/api/assets/${esc(q.asset.id)}"></${q.asset.mime.startsWith("audio/") ? "audio" : "video"}>`) : ""}<span class="sub">${esc(q.type)} · ${esc(s.phase)}</span><form novalidate class="stack" id="answer">${q.type === "Slide" ? "" : q.labels?.length ? q.labels.map((label, i) => select(label, "pair" + i, [["", "—"], ...q.targets], s.response?.[i])).join("") : q.type === "Image hotspot" ? `<div class="fields">${field("X (%)", "x", 50, "number", 'min="0" max="100"')}${field("Y (%)", "y", 50, "number", 'min="0" max="100"')}</div>` : q.options.length ? `<div class="answers">${q.options.map((o, i) => `<button type="button" data-action="pick-${i}" class="answer tone${i % 4} ${esc(q.effect)}" ${display || !available ? "disabled" : ""}><span>${"ABCD".charAt(i) || i + 1}</span>${esc(o)}</button>`).join("")}</div><p id="selection"></p>` : display ? "" : q.type === "Rating" ? select(tr("rating"), "value", ["1", "2", "3", "4", "5"]) : field(tr("response"), "value", s.response || "", q.type === "Numeric" ? "number" : "text", q.type === "Numeric" ? 'step="any" required' : "required")} ${!display && available ? '<button class="primary" id="send">' + tr("send") + "</button>" : ""}</form>
 ${s.response !== undefined ? `<p class="info">✓ ${tr("recorded")}: ${esc([s.response].flat().join(", "))}</p>` : ""}${s.solution !== undefined ? `<div class="info"><strong>${s.solution ? tr("answer") + ": " + esc(s.solution) : tr("feedback")}</strong><p>${esc(s.explanation)}</p><small>${esc(s.reference)}</small></div>` : ""}
 ${s.textStats ? `<section class="cloud">${s.textStats.map((v) => `<span class="cloudword size${Math.min(4, v.n)}">${esc(v.value)} <small>×${v.n}</small></span>`).join("")}</section>` : ""}${s.distribution ? `<h3>${tr("stats")}</h3>${s.distribution.map((d) => `<label>${esc([d.value].flat().join(", "))} · ${d.n}<progress value="${d.n}" max="${s.answered || 1}"></progress></label>`).join("")}` : ""}`
      }
 <div class="actions">${display && s.projected?.length ? s.projected.map((f) => `<img class="photo" alt="${esc(f.moment || "Session photograph")}" src="/api/rooms/${pin}/projected/${esc(f.id)}">`).join("") : ""}${display ? btn(tr("fullscreen"), "fullscreen") : s.phase !== "ended" ? resultLink : ""}${!display && s.mode === "self" && s.position > 0 ? link(tr("previous"), "#/play/" + pin + "/" + (s.position - 1)) : ""}${!display && s.mode === "self" && s.position < s.count - 1 ? link(tr("next"), "#/play/" + pin + "/" + (s.position + 1)) : ""}${s.rank ? link(tr("leaderboard"), "#/standings/" + pin) : ""}${!display && s.photos ? link(tr("gallery"), "#/gallery/" + pin) : ""}</div></section><section class="stage panel stack"><h2>${tr("qa")}</h2><div id="discussion"></div>${display || s.phase === "ended" ? "" : `<form novalidate class="stack" id="discuss">${field(tr("ask"), "body", "", "text", 'required maxlength="500"')}<button>${tr("moderate")}</button></form>`}</section>`;
      bindLanguage();
      function selection() {
        all("[data-action^=pick]").forEach((b, i) => {
          const selected = answers.includes(q.options[i]);
          b.classList.toggle("selected", selected);
          b.setAttribute("aria-pressed", String(selected));
        });
        if ($("#selection"))
          $("#selection").textContent = answers.length
            ? tr("selected") + ": " + answers.join(" → ")
            : "";
      }
      if (q?.options.length) {
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
          answers = ["Multiple choice", "Ranking", "Ordering"].includes(q.type)
            ? answers.includes(value)
              ? answers.filter((v) => v !== value)
              : [...answers, value]
            : [value];
          selection();
        }
      });
      if (q?.type === "Image hotspot" && $(".attachment") && !display) {
        $(".attachment").onclick = (e) => {
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
        tray.className = "actions";
        for (const target of q.targets) {
          const chip = document.createElement("span");
          chip.className = "pill";
          chip.textContent = target;
          chip.draggable = true;
          chip.ondragstart = (e) =>
            e.dataTransfer.setData("text/plain", target);
          tray.append(chip);
        }
        form.prepend(tray);
        form.ondragover = (e) => e.preventDefault();
        form.ondrop = (e) => {
          e.preventDefault();
          const select = e.target.closest("label")?.querySelector("select");
          if (select) select.value = e.dataTransfer.getData("text/plain");
        };
      }
      submit("#answer", async (b) => {
        const value = q.labels?.length
          ? q.labels.map((_, i) => b["pair" + i])
          : q.type === "Image hotspot"
            ? [Number(b.x), Number(b.y)]
            : q.options.length
              ? ["Multiple choice", "Ordering", "Ranking"].includes(q.type)
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
    $("#count").textContent =
      num(s.participants) +
      " " +
      tr("participants") +
      " · " +
      num(s.answered) +
      " " +
      tr("responses");
    $("#discussion").innerHTML =
      s.messages
        .map(
          (m) =>
            `<div class="listitem">${esc(m.body)}${display ? `${num(m.votes)} ${tr("votes")}` : btn("↑ " + m.votes, "vote-" + m.id)}</div>`,
        )
        .join("") || "<p>" + tr("empty") + "</p>";
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
        el.textContent = left + " s";
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
  main.innerHTML = `<section class="panel stack">${chooseLanguage()}<span class="pill">${tr("privateReport")}</span>${title(r.name, r.title)}<p>${tr("bookmark")}</p><div class="row"><h2>${r.score === undefined ? tr("byQuestion") : num(r.score) + " " + tr("points")}</h2>${btn(tr("print"), "print")}</div>${r.percentage != null ? `<p>${r.correct} ${tr("correct")} · ${r.incorrect} ${tr("incorrect")} · ${num(r.percentage)}%</p>` : ""}${r.photos.length ? `<div class="grid">${r.photos.map((f) => `<figure><img id="photo-${esc(f.id)}" class="photo" alt="${esc(f.moment || "Session photograph")}"><figcaption>${esc(f.moment)}</figcaption></figure>`).join("")}</div>` : ""}${r.feedback ? `<p class="info">${esc(r.feedback)}</p>` : ""}${r.questions.map((q, i) => `<article class="panel stack"><span class="sub">${tr("question")} ${num(i + 1)}</span><h3>${esc(q.prompt)}</h3><p>${tr("response")} · ${esc(q.value === undefined ? tr("unanswered") : [q.value].flat().join(", "))}</p>${q.solution === undefined ? "<small>" + tr("pending") + "</small>" : `<strong>${q.correct === true ? "✓ " + tr("correct") : q.correct === false ? tr("incorrect") : tr("reviewed")} · ${num(q.points)} ${tr("points")}</strong><p>${esc(q.solution)}</p><p>${esc(q.explanation)}</p>`}${q.elapsed !== null ? `<small>${num(Math.round(q.elapsed / 1000))} ${tr("seconds")}</small>` : ""}</article>`).join("")}${r.leaders ? `<h2>${tr("leaderboard")}</h2>${r.leaders.map((v, i) => `<div class="listitem"><strong>${i + 1}. ${esc(v.name)}</strong>${v.score} points</div>`).join("")}` : ""}${r.certificate ? `<article class="panel"><span class="eyebrow">${esc(r.design?.title || tr("certificate"))}</span><h2>${esc(r.name)}</h2><p>${tr("completed")} ${esc(r.title)}</p><p>${esc(r.design?.issuer)}</p><strong>${esc(r.design?.signature)}</strong></article>` : ""}</section>`;
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
  const graded = r.table.filter((row) => row[4] !== "");
  main.innerHTML =
    tabs("reports") +
    title(r.title, "Session report · " + pin) +
    `<div class="actions">${link("Export CSV", "/api/" + path + "?format=csv")}${link("Export Excel", "/api/" + path + "?format=xlsx")}${btn("Print / Save PDF", "print")}</div><div class="panel"><h3>Answer accuracy</h3><p>${graded.length ? Math.round((100 * graded.filter((v) => v[4] === "true").length) / graded.length) + "% across " + graded.length + " graded responses" : "No graded responses yet."}</p></div><div class="panel scroll"><table><thead><tr>${r.headings.map((v) => `<th>${esc(v)}</th>`).join("")}</tr></thead><tbody>${r.table.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
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
  main.innerHTML = `<section class="panel stack">${title("Session photographs")}${hostData ? link("Download authorized photos (ZIP)", "/api/" + path + "photo-archive") : ""}${raw ? `<form novalidate id="consent" class="stack">${check("I consent to private photography in this session. Withdrawing removes my photos.", "consent", s.consent)}${check("Allow public display of my photographs", "publicPhoto", s.publicPhoto)}<button>Save consent</button></form>${btn("Show my identification QR", "identify")}<div id="identification"></div>` : ""}${
    hostData?.config.guardian
      ? `<form novalidate id="guardian" class="stack"><h3>Guardian authorization</h3>${select(
          "Participant",
          "person",
          hostData.people.map((p) => [p.id, p.name]),
          selectedPerson,
        )}${field("Verified consent record reference (leave blank to withdraw)", "reference")}<button>Record authorization</button></form>`
      : ""
  }<form novalidate id="upload" class="stack">${
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
  }${field("Moment or question", "moment")}<label>Take a photograph<input type="file" id="camera" accept="image/*" capture="environment"></label><label>Or select an existing photograph<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label><button class="primary">Upload privately</button></form><div class="grid">${photos.map((f) => `<article class="card"><img class="photo" id="p${esc(f.id)}" alt="${esc(f.moment || "Session photograph")}"><h3>${esc(f.name)}</h3><p>${esc(f.moment)}</p>${hostData && !hostData.config.secret && f.public_photo ? btn(f.published ? "Remove from projector" : "Show on public projector", "publish:" + f.id) : ""}${btn("Delete photo", "delete-" + f.id, "danger")}</article>`).join("")}</div></section>`;
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
  closeLive = () => urls.forEach(URL.revokeObjectURL);
  const reload = async () => {
    roomCleanup();
    await gallery(pin);
  };
  submit("#guardian", async (b) => {
    await api(path + "control", "POST", { action: "guardian", ...b });
    await reload();
  });
  submit("#consent", async (b) => {
    await api(
      path + "consent",
      "POST",
      { consent: b.consent === "on", publicPhoto: b.publicPhoto === "on" },
      raw,
    );
    await reload();
  });
  $("#camera").onchange = (e) => {
    if (e.target.files.length) $("[name=image]").files = e.target.files;
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
        `<img class="qr" alt="Presenter identification QR" src="${url}">`;
      return;
    }
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
