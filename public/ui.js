import { initializePreferences, t } from "./preferences.js";
import {
  main,
  esc,
  $,
  all,
  link,
  btn,
  submitButton,
  field,
  select,
  go,
  notice,
  confirmAction,
  api,
  submit,
  actions,
  title,
  pageHead,
  empty,
  chip,
  capped,
  demo,
  icon,
} from "./shared.js";
import { mark, roomFigure, cover, liveRoom } from "./room.js";
import { num } from "./locale.js";
import { standings, certificates } from "./engagement.js";
import { admin } from "./admin.js";
import { users, account as manageAccount } from "./accounts.js";
import { marking } from "./marking.js";
import { editor, bank } from "./editor.js";
import {
  launch,
  host,
  join,
  stage,
  results,
  roomCleanup,
  gallery,
  watch,
} from "./live.js";
let user,
  epoch = 0,
  shownHash = null,
  platform = "Ask";

/* Routes: which shell a page uses, its navigation owner and document title. */
const sections = [
  ["dashboard", "Workspace", "workspace", true],
  ["library", "Quiz library", "library", true],
  ["presentations", "Presentations", "slides"],
  ["bank", "Question bank", "bank", true],
  ["sessions", "Live sessions", "live", true],
  ["settings", "Settings", "settings"],
];
const owner = {
  editor: "library",
  presentation: "presentations",
  launch: "sessions",
  host: "sessions",
  "host-gallery": "sessions",
  mark: "sessions",
  admin: "settings",
  users: "users",
  certificates: "settings",
};
for (const [key] of sections) owner[key] = key;
const titles = {
  "": "Make room for every answer.",
  login: "Sign in",
  register: "Create your workspace",
  recover: "Recover your account",
  verify: "Verify your email",
  reset: "Choose a new password",
  preview: "Template preview",
  editor: "Quiz studio",
  presentation: "Presentation studio",
  launch: "Launch a session",
  host: "Presenter controls",
  "host-gallery": "Session photographs",
  gallery: "Session photographs",
  mark: "Mark answers",
  admin: "Platform administration",
  users: "All users",
  certificates: "Certificate builder",
  standings: "Leaderboard",
  join: "Join session",
  play: "Session",
  display: "Session",
  results: "Private participant report",
  help: "Help center",
  privacy: "Participant privacy",
  terms: "Terms of use",
};
for (const [key, label] of sections) titles[key] = label;
const guarded = new Set(Object.keys(owner).filter((k) => k !== "host-gallery"));
function viewFor(page) {
  if (owner[page] && user) return "app";
  if (!page) return "home";
  if (["login", "register", "recover", "reset", "verify"].includes(page))
    return "auth";
  if (page === "display") return "display";
  if (["join", "play", "results", "gallery", "standings"].includes(page))
    return "session";
  return "page";
}
function shell(page) {
  document.body.dataset.view = viewFor(page);
  document.body.dataset.page = page || "home";
  document.title = t(titles[page] || "Page not found") + " | " + platform;
  const inApp = document.body.dataset.view === "app";
  $("#nav").innerHTML = user
    ? inApp
      ? `<a class="account" href="#/settings"><span class="initial" aria-hidden="true">${esc([...user.name][0] || "")}</span><span translate="no">${esc(user.name)}</span></a>`
      : link("Open workspace", "#/dashboard", "button primary", "workspace")
    : link("Sign in", "#/login", "quiet button") +
      link("Get started", "#/register", "button primary");
  const rail = $("#rail");
  rail.hidden = !inApp;
  rail.classList.remove("open");
  if (!inApp) {
    rail.replaceChildren();
    return;
  }
  rail.innerHTML = `<nav aria-label="Workspace sections">${sections
    .concat(user.role === "super" ? [["users", "All users", "users"]] : [])
    .map(
      ([key, label, glyph, primary]) =>
        `<a href="#/${key}" class="${primary ? "main-item" : "more-item"}" ${owner[page] === key ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${esc(label)}</span></a>`,
    )
    .join(
      "",
    )}<button type="button" id="rail-more" aria-expanded="false">${icon("more")}<span>More</span></button></nav><p class="rail-org" translate="no">${esc(user.organization)}</p>`;
  $("#rail-more").onclick = () => {
    const open = rail.classList.toggle("open");
    $("#rail-more").setAttribute("aria-expanded", String(open));
  };
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#rail").classList.contains("open")) {
    $("#rail").classList.remove("open");
    $("#rail-more").setAttribute("aria-expanded", "false");
    $("#rail-more").focus();
  }
});
document.addEventListener("click", (e) => {
  if ($("#rail").classList.contains("open") && !e.target.closest("#rail")) {
    $("#rail").classList.remove("open");
    $("#rail-more").setAttribute("aria-expanded", "false");
  }
});

function watchStandings(pin) {
  watch(pin, () => standings(pin));
}
/* The figure beside each format shows that format's real answer surface. */
const figures = [
  () =>
    `<div class="figure iris"><div class="mini-answers">${[0, 1, 2, 3].map((i) => `<i class="tone${i}">${mark(i)}</i>`).join("")}</div></div>`,
  () =>
    `<div class="figure rose"><div class="mini-notes"><i></i><i></i><i></i><i></i><i></i></div></div>`,
  () =>
    `<div class="figure aqua"><div class="mini-scale"><i></i><i></i><i></i><i class="on"></i><i></i></div></div>`,
];
function home() {
  const q = demo[0].questions[0],
    counts = [47, 18, 22, 12];
  main.innerHTML = `<section class="hero board"><div class="wrap"><div class="hero-copy"><h1>Make room for<br>every answer.</h1><p class="lead">Bring your class into the conversation with live quizzes, audience polls and shared ideas.</p><div class="actions">${link(user ? "Open workspace" : "Create a quiz", user ? "#/dashboard" : "#/register", "button sun", "", "next")}</div><form novalidate id="pin" class="pinform"><label for="pin-input">Joining a session?</label><div class="pinrow"><input required id="pin-input" aria-label="Session PIN" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" placeholder="000000" name="pin"><button><span>Join session</span></button></div><p class="hint">Enter the PIN from your presenter.</p></form></div><div class="hero-room"><svg class="room" role="img" viewBox="0 16 640 396"><path class="lectern" d="M262 404h116"/></svg><div class="ask"><p id="hero-question">${esc(q.prompt)}</p><div class="picks" role="group" aria-labelledby="hero-question">${q.options.map((o, i) => `<button type="button" class="pick tone${i}" data-pick="${i}" aria-pressed="false">${mark(i)}<span>${esc(o)}</span></button>`).join("")}</div><div class="verdict"><p id="verdict" role="status">Choose an answer to take your seat.</p><button type="button" class="quiet" id="again" hidden>${icon("undo")}<span>Ask again</span></button></div></div></div></div></section>
 <section class="wrap band"><div class="band-head"><h2>Explore the formats</h2><p>Interactive previews</p></div><div class="formats">${demo.map((d, i) => `<a class="format" href="#/preview/${i}">${figures[i]()}<h3>${esc(d.title)}</h3><p>${esc(d.questions[0].prompt)}</p><span class="go"><span>Try preview</span>${icon("next")}</span></a>`).join("")}</div></section>
 <section class="steps"><div class="wrap"><h2>From question to result</h2><ol>${[
   [
     "Show the PIN",
     "Students join from any phone with six digits or a QR code. No account needed.",
   ],
   [
     "Collect every answer",
     "Responses arrive live or at each student’s own pace, in English, Arabic or Sorani.",
   ],
   [
     "Release when ready",
     "You decide when answers appear. Each student keeps a private results link.",
   ],
 ]
   .map(([h, p]) => `<li><h3>${h}</h3><p>${p}</p></li>`)
   .join("")}</ol></div></section>`;
  submit("#pin", (b) => go("join/" + b.pin));
  const live = liveRoom($(".hero-room"), {
    options: q.options,
    key: q.key,
    counts,
    format: num,
    label: t("A lecture hall filling with answers"),
  });
  const picks = all("[data-pick]");
  const idle = "Choose an answer to take your seat.";
  picks.forEach((b, i) => {
    b.onclick = () => {
      picks.forEach((p, n) => {
        p.setAttribute("aria-pressed", String(n === i));
        p.classList.toggle("right", q.options[n] === q.key);
      });
      live.pick(i);
      $("#again").hidden = false;
      $("#verdict").innerHTML =
        q.options[i] === q.key
          ? `<strong>Correct.</strong> <span>${esc(q.explanation)}</span>`
          : `<strong>Not this time.</strong> <span>${esc(q.explanation)}</span>`;
    };
  });
  $("#again").onclick = () => {
    live.reset();
    $("#again").hidden = true;
    $("#verdict").textContent = idle;
    picks.forEach((p) => {
      p.setAttribute("aria-pressed", "false");
      p.classList.remove("right");
    });
    picks[0].focus();
  };
}
function preview(i) {
  const d = demo[i] || demo[0],
    q = d.questions[0];
  main.innerHTML = `<section class="stage"><p class="chip">Template preview</p><h1 class="prompt">${esc(q.prompt)}</h1><form novalidate id="try" class="stack">${q.options.length ? `<div class="answers">${q.options.map((o, n) => `<label class="answer tone${n}"><input type="radio" required name="value" value="${esc(o)}">${mark(n)}<span>${esc(o)}</span></label>`).join("")}</div>` : q.type === "Rating" ? scale("value") : field("Your response", "value", "", "text", "required")}<div class="actions">${submitButton("Submit preview")}${link("Use template", user ? "#/editor/template/" + i : "#/register")}</div></form><p id="feedback" role="status"></p></section>`;
  submit("#try", (b) => {
    const el = $("#feedback");
    el.className = "info";
    el.innerHTML = q.key
      ? b.value === q.key
        ? `${icon("done")}<span>Correct.</span> <span>${esc(q.explanation)}</span>`
        : `<span>Correct answer</span>: <strong>${esc(q.key)}</strong>. <span>${esc(q.explanation)}</span>`
      : `${icon("done")}<span>Preview response received.</span>`;
  });
}
const scale = (name) =>
  `<fieldset class="scale"><legend>Your response</legend><div class="answers">${[1, 2, 3, 4, 5].map((n) => `<label class="point"><input type="radio" required name="${name}" value="${n}"><span>${num(n)}</span></label>`).join("")}</div></fieldset>`;
function account(mode, raw) {
  const register = mode === "register",
    login = mode === "login",
    recover = mode === "recover",
    verify = mode === "verify";
  const heading = register
    ? "Create your workspace"
    : login
      ? "Welcome back"
      : recover
        ? "Recover your account"
        : verify
          ? "Verify your email"
          : "Choose a new password";
  main.innerHTML = `<section class="auth"><div class="auth-form stack">${title(heading)}<form novalidate class="stack" id="account">${register ? field("Your name", "name", "", "text", 'required autocomplete="name"') + field("Organization", "organization", "", "text", 'required autocomplete="organization"') : ""}${register || login || recover ? field("Email address", "email", "", "email", 'required autocomplete="email" dir="ltr"') : ""}${verify || recover ? "" : field("Password", "password", "", "password", login ? 'required autocomplete="current-password" dir="ltr"' : 'required minlength="12" maxlength="256" autocomplete="new-password" dir="ltr"')}${submitButton(register ? "Create workspace" : login ? "Sign in" : recover ? "Send recovery link" : verify ? "Verify email" : "Save password", "primary wide")}</form><div class="auth-links">${link(register ? "Already registered? Sign in" : "Create an account", register ? "#/login" : "#/register", "textlink")}${login ? link("Forgot password?", "#/recover", "textlink") : ""}</div></div><div class="auth-side board" aria-hidden="true">${roomFigure(71)}<p>Make room for every answer.</p></div></section>`;
  submit("#account", async (b) => {
    await api(verify || mode === "reset" ? "redeem" : mode, "POST", {
      ...b,
      token: raw,
      kind: mode,
    });
    if (recover) {
      notice("If your email is registered, check your inbox.");
      return;
    }
    go(register || login ? "dashboard" : "login");
  });
}
const quizCard = (q) =>
  `<article class="quiz"><a class="quiz-link" href="${(q.kind === "presentation" ? "#/presentation/" : "#/editor/") + esc(q.id)}">${cover(q.title, q.count)}<h3 translate="no" dir="auto">${esc(q.title)}</h3></a><p><span translate="no" dir="auto">${esc(q.category)}</span><span>${q.count === 1 ? "1 question" : q.count + " questions"}</span></p></article>`;
const quizCards = (list) => list.map(quizCard).join("");
const templateCard = (d, i) =>
  `<article class="quiz template"><a class="quiz-link" href="#/editor/template/${i}">${figures[i]()}<h3>${esc(d.title)}</h3><small>${esc(d.category)}</small><span class="go"><span>Use template</span>${icon("next")}</span></a></article>`;
const sessionRow = (r) =>
  `<div class="listitem"><div><strong translate="no" dir="auto">${esc(r.title)}</strong><p class="meta"><span><span>PIN</span> <b class="pin">${esc(r.pin)}</b></span><span>${r.participants} participants</span></p></div>${chip(r.phase)}${link("Open controls", "#/host/" + r.pin, "button small")}</div>`;
const sessionList = (rs) =>
  rs.length
    ? capped(rs.map((r) => sessionRow(r)))
    : empty(
        "Sessions appear here when you launch a quiz.",
        link("Choose a quiz to launch", "#/library", "button primary"),
      );
async function workspace(page) {
  const [documents, rooms] = await Promise.all([api("quizzes"), api("rooms")]);
  const quizzes = documents.filter((q) =>
    page === "presentations"
      ? q.kind === "presentation"
      : q.kind !== "presentation",
  );
  const active = rooms.filter(
    (r) => r.phase !== "ended" && r.config.expires > Date.now(),
  );
  const create = link("Create quiz", "#/editor", "button primary", "plus");
  if (page === "dashboard") {
    const now = active.find((r) => r.phase === "open") || active[0];
    main.innerHTML = `<div class="page-head"><div><h1>Your teaching<br class="phone"> workspace.</h1><p>Welcome back, ${esc(user.name)}. Prepare your next activity or bring a quiz to the room.</p></div><div class="actions">${create}</div></div>${
      now
        ? `<section class="now board"><div class="now-room">${roomFigure(now.participants)}</div><div class="now-copy">${chip(now.phase)}<h2 translate="no" dir="auto">${esc(now.title)}</h2><p>${now.participants} participants</p></div><div class="now-pin"><span>Participation PIN</span><strong class="pin">${esc(now.pin)}</strong></div><div class="actions">${link("Open controls", "#/host/" + now.pin, "button sun")}<a class="button" href="#/display/${esc(now.pin)}" target="_blank" rel="noopener"><span>Open projector</span>${icon("external")}</a></div></section>`
        : ""
    }<dl class="figures">${[
      ["Quizzes", quizzes.length],
      [
        "Presentations",
        documents.filter((q) => q.kind === "presentation").length,
      ],
      ["Active sessions", active.length],
      ["Participants", rooms.reduce((s, r) => s + r.participants, 0)],
    ]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${num(v)}</dd></div>`)
      .join(
        "",
      )}</dl><section class="block"><div class="row"><h2>Recent quizzes</h2>${link("View library", "#/library", "textlink", "", "next")}</div>${quizzes.length ? `<div class="quizzes">${quizCards(quizzes.slice(0, 4))}</div>` : empty("Create your first quiz or start from a template.", create + link("Start from a template", "#/library"))}</section><section class="block"><h2>Sessions</h2>${sessionList(rooms.slice(0, 5))}</section>`;
  } else if (page === "presentations") {
    const start = link(
      "Create presentation",
      "#/presentation",
      "button primary",
      "plus",
    );
    main.innerHTML =
      pageHead("Presentations", "", start) +
      (quizzes.length
        ? `<div class="quizzes">${quizCards(quizzes)}</div>`
        : empty(
            "Create a presentation and add slides, questions or polls.",
            start,
          ));
  } else if (page === "library") {
    main.innerHTML = `${pageHead("Quiz library", "", create)}<div class="toolbar">${field("Search library", "search", "", "search")}${select("Sort by", "sort", ["Last edited", "Title"])}</div><div class="quizzes" id="quizzes" aria-live="polite"></div><section class="block"><h2>Start from a template</h2><div class="quizzes">${demo.map(templateCard).join("")}</div></section>`;
    const filter = () => {
      let list = quizzes.filter((q) =>
        (q.title + " " + q.category)
          .toLowerCase()
          .includes($("[name=search]").value.toLowerCase()),
      );
      if ($("[name=sort]").value === "Title")
        list.sort((a, b) => a.title.localeCompare(b.title));
      $("#quizzes").innerHTML =
        quizCards(list) ||
        empty(
          quizzes.length
            ? "No matching quizzes."
            : "Create your first quiz or start from a template.",
        );
    };
    $("[name=search]").oninput = filter;
    $("[name=sort]").onchange = filter;
    filter();
  } else
    main.innerHTML =
      pageHead(
        "Live sessions",
        "",
        link("Choose a quiz to launch", "#/library", "button primary", "play"),
      ) + sessionList(rooms);
}
async function settings() {
  const org = user.role !== "lecturer" ? await api("org") : null;
  main.innerHTML = `${pageHead(
    "Settings",
    "",
    user.role === "super"
      ? link("Platform administration", "#/admin", "button", "shield")
      : "",
  )}<div class="settings"><section><div><h2>Profile</h2><p translate="no" dir="ltr">${esc(user.email)}</p></div><div class="stack"><form novalidate id="profile" class="stack">${field("Display name", "name", user.name, "text", "required")}${submitButton("Save profile", "")}</form></div></section>${org ? `<section><div><h2>Organization</h2>${link("Certificate builder", "#/certificates", "textlink", "award")}</div><form novalidate id="org" class="stack">${field("Organization name", "name", user.organization, "text", "required")}${submitButton("Save organization", "")}</form></section><section><div><h2>Members</h2><p>${org.length === 1 ? "1 member" : org.length + " members"}</p></div><div class="stack">${capped(org.map((v) => `<div class="listitem"><div><strong translate="no">${esc(v.name)}</strong><p translate="no" dir="ltr">${esc(v.email)}</p></div><span class="chip">${esc(v.role === "super" ? "Platform administrator" : v.role)}</span></div>`))}<form novalidate id="invite" class="stack inviting"><h3>Invite lecturer</h3><div class="fields">${field("Lecturer name", "name", "", "text", "required")}${field("Email address", "email", "", "email", 'required dir="ltr"')}</div>${submitButton("Invite lecturer", "", "plus")}</form></div></section>` : ""}<section><div><h2>Account</h2></div><div class="stack">${btn("Sign out", "logout", "", "logout")}<details class="danger-zone"><summary>${icon("chevron")}<span>Delete account</span></summary><form novalidate id="erase" class="stack"><p>Deleting the last account in an organization also deletes its quizzes, sessions, reports and photos.</p>${field("Confirm password", "password", "", "password", 'required autocomplete="current-password" dir="ltr"')}${submitButton("Permanently delete account", "danger solid")}</form></details></div></section></div>`;
  submit("#erase", async (b) => {
    if (
      !(await confirmAction(
        "Delete this account?",
        "This cannot be undone.",
        "Permanently delete account",
      ))
    )
      return;
    await api("profile", "DELETE", b);
    go("");
  });
  for (const f of ["profile", "org"])
    submit("#" + f, async (b) => {
      await api(f, "PATCH", b);
      notice("Changes saved.");
      await render();
    });
  submit("#invite", async (b) => {
    await api("org/member", "POST", b);
    notice("Invitation sent.");
    await render();
  });
  actions(async (a) => {
    if (a === "logout") {
      await api("logout", "POST", {});
      go("");
    }
  });
}
const article = (heading, body) =>
  `<section class="article">${title(heading)}${body}</section>`;
function failed(message) {
  main.innerHTML = `<section class="article failed">${mark(0)}${title("Unable to open this page")}<p>${esc(message)}</p><div class="actions">${link("Return home", "#/", "button primary")}</div></section>`;
}
async function render() {
  const route = ++epoch;
  roomCleanup();
  const [page = "", a, b] = location.hash.replace(/^#\/?/, "").split("/");
  const navigated = shownHash !== null && shownHash !== location.hash;
  const slow = setTimeout(() => document.body.classList.add("busy"), 140);
  main.onclick = null;
  try {
    user = navigator.onLine ? await api("me") : null;
    if (route !== epoch) return;
    if (!user && guarded.has(page)) {
      go("login");
      return;
    }
    shell(page);
    if (!page) home();
    else if (["login", "register", "recover", "reset", "verify"].includes(page))
      account(page, a);
    else if (page === "preview") preview(Number(a));
    else if (
      ["dashboard", "library", "presentations", "sessions"].includes(page)
    )
      await workspace(page);
    else if (page === "standings") {
      await standings(a);
      watchStandings(a);
    } else if (page === "certificates") await certificates();
    else if (page === "admin") await admin();
    else if (page === "users") await (a ? manageAccount(a) : users());
    else if (page === "settings") await settings();
    else if (page === "presentation") await editor(a, b, "presentation");
    else if (page === "editor") await editor(a, b);
    else if (page === "bank") await bank();
    else if (page === "launch") await launch(a);
    else if (page === "host") await host(a);
    else if (page === "join") await join(a, b);
    else if (page === "play" || page === "display")
      await stage(a, b, page === "display");
    else if (page === "results") await results(a, b);
    else if (page === "mark") await marking(a);
    else if (page === "gallery" || page === "host-gallery") await gallery(a, b);
    else if (page === "terms") {
      const brand = await api("branding");
      main.innerHTML = article(
        "Terms of use",
        `<p>${esc(brand.terms || "Use this workspace for educational sessions authorized by the hosting organization. Submit material you have permission to share. Keep private access phrases and results links confidential. Contact the session organizer for its participation and acceptable-use requirements.")}</p>`,
      );
    } else if (page === "privacy") {
      const own = (await api("branding")).privacy;
      main.innerHTML = article(
        "Participant privacy",
        `<p>Your presenter can see your responses and session report. Anyone holding your private results link can read the results available to you. Keep it private.</p><p>Photography requires your consent. Withdraw consent in the session gallery to remove your pictures. Contact the organization running your session about access or deletion.</p>${own ? `<p translate="no">${esc(own)}</p>` : ""}${link("Return home", "#/", "textlink", "prev")}`,
      );
    } else if (page === "help")
      main.innerHTML = article(
        "Help center",
        `<h2>Join a session</h2><p>Enter your presenter’s six-digit PIN on the home page or scan the session QR code. Keep the results link to return later.</p><h2>Present a quiz</h2><p>Create a workspace, add questions to a quiz, then choose Launch session. Open the projector display in another window and use the presenter controls to advance questions.</p>${link("Return home", "#/", "textlink", "prev")}`,
      );
    else throw Error("Page not found.");
    if (route === epoch && navigated) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        main.animate([{ opacity: 0.4 }, { opacity: 1 }], {
          duration: 180,
          easing: "ease-out",
        });
    }
  } catch (e) {
    if (route === epoch) {
      if (document.body.dataset.view === "loading") shell(page);
      failed(e.message);
    }
  } finally {
    clearTimeout(slow);
    if (route === epoch) {
      document.body.classList.remove("busy");
      shownHash = location.hash;
    }
  }
}
async function start() {
  try {
    const branding = await api("branding");
    if (branding.publicOrigin) {
      const canonical = new URL(branding.publicOrigin);
      if (canonical.origin !== location.origin) {
        canonical.pathname = location.pathname;
        canonical.search = location.search;
        canonical.hash = location.hash;
        location.replace(canonical.href);
        return;
      }
    }
    platform = branding.name;
    $(".brand").lastElementChild.textContent = branding.name;
  } catch (error) {
    if (navigator.onLine) {
      document.body.dataset.view = "page";
      main.innerHTML = `<section class="article failed">${title("Unable to open this page")}<p>${esc(error.message)}</p>${link("Reload", location.href, "button primary")}</section>`;
      return;
    }
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("offline", () =>
    notice(
      "Connection lost. Live participation resumes when you reconnect.",
      "error",
    ),
  );
  window.addEventListener("online", () => location.reload());
  window.addEventListener("hashchange", render);
  initializePreferences();
  await render();
}
start();
