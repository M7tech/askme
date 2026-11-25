import { initializePreferences } from "./preferences.js";
import {
  main,
  esc,
  $,
  all,
  formData,
  link,
  btn,
  field,
  select,
  check,
  go,
  notice,
  api,
  submit,
  actions,
  title,
  tabs,
  demo,
} from "./shared.js";
import { standings, analytics, certificates } from "./engagement.js";
import { admin } from "./admin.js";
import { editor, bank } from "./editor.js";
import {
  launch,
  host,
  join,
  stage,
  results,
  report,
  roomCleanup,
  gallery,
  watch,
} from "./live.js";
let user,
  epoch = 0;
if (localStorage.theme === "dark") document.body.classList.add("dark");
$("#theme").checked = localStorage.theme === "dark";
$("#theme").onchange = () => {
  document.body.classList.toggle("dark");
  localStorage.theme = document.body.classList.contains("dark")
    ? "dark"
    : "light";
};
function card(name, category, detail, url, index = 0, label = "Open") {
  return `<article class="card"><div class="tileicon tone${index % 4}" aria-hidden="true">${["◒", "✦", "▥", "◩"][index % 4]}</div><span class="sub">${esc(category)}</span><h3>${esc(name)}</h3><p>${esc(detail)}</p>${link(label, url)}</article>`;
}
function watchStandings(pin) {
  watch(pin, () => standings(pin));
}
function home() {
  main.innerHTML = `<section class="hero"><div><h1>Make room for<br><em>every answer.</em></h1><p>Bring your class into the conversation with live quizzes, audience polls and shared ideas.</p>${link(user ? "Open workspace →" : "Create a quiz →", user ? "#/dashboard" : "#/register", "button primary")}</div><div class="art" aria-hidden="true"><span class="burst">✦</span><div class="poster"><strong>Pick your answer.</strong><div class="shapes"><div class="shape">●</div><div class="shape">▲</div><div class="shape">✦</div><div class="shape">■</div></div></div><div class="mini">✓ &nbsp; Answer in!</div></div></section>
 <section class="joinbar"><span class="joinicon" aria-hidden="true">⌗</span><div><h3>Joining a session?</h3><p>Enter the PIN from your presenter.</p></div><form novalidate id="pin"><input required aria-label="Session PIN" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit PIN" name="pin"><button class="primary">Join session →</button></form></section>
 <div class="row"><h2>Explore the formats</h2><span class="sub">Interactive previews</span></div><div class="grid">${demo.map((d, i) => card(d.title, d.category, d.questions[0].prompt, "#/preview/" + i, i, "Try preview →")).join("")}</div>`;
  submit("#pin", (b) => go("join/" + b.pin));
}
function preview(i) {
  const d = demo[i] || demo[0],
    q = d.questions[0];
  main.innerHTML = `<section class="stage panel"><span class="pill">Template preview</span><h1>${esc(q.prompt)}</h1><form novalidate id="try">${q.options.length ? `<div class="answers">${q.options.map((o, n) => `<label class="answer button tone${n}"><input type="radio" required name="value" value="${esc(o)}">${esc(o)}</label>`).join("")}</div>` : field("Your response", "value", "", q.type === "Rating" ? "number" : "text", q.type === "Rating" ? 'required min="1" max="5"' : "required")}<div class="actions"><button class="primary">Submit preview</button>${link("Use template", user ? "#/editor/template/" + i : "#/register")}</div></form><p id="feedback" role="status"></p></section>`;
  submit("#try", (b) => {
    $("#feedback").textContent = q.key
      ? (b.value === q.key ? "Correct. " : "Correct answer: " + q.key + ". ") +
        q.explanation
      : "Preview response received.";
  });
}
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
  main.innerHTML = `<section class="narrow panel stack">${title(heading)}<form novalidate class="stack" id="account">${register ? field("Your name", "name", "", "text", 'required autocomplete="name"') + field("Organization", "organization", "", "text", "required") : ""}${register || login || recover ? field("Email address", "email", "", "email", 'required autocomplete="email"') : ""}${verify || recover ? "" : field("Password", "password", "", "password", login ? 'required autocomplete="current-password"' : 'required minlength="12" maxlength="256" autocomplete="new-password"')}<button class="primary">${esc(register ? "Create workspace" : login ? "Sign in" : recover ? "Send recovery link" : verify ? "Verify email" : "Save password")}</button></form><div class="row">${link(register ? "Already registered? Sign in" : "Create an account", register ? "#/login" : "#/register", "")}${login ? link("Forgot password?", "#/recover", "") : ""}</div></section>`;
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
async function workspace(page) {
  const [documents, rooms] = await Promise.all([api("quizzes"), api("rooms")]);
  const quizzes = documents.filter((q) =>
    page === "presentations"
      ? q.kind === "presentation"
      : q.kind !== "presentation",
  );
  const quizCards = (q) =>
    q
      .map((v, i) =>
        card(
          v.title,
          v.category,
          v.count + " questions",
          (v.kind === "presentation" ? "#/presentation/" : "#/editor/") + v.id,
          i,
          "Open quiz",
        ),
      )
      .join("");
  const sessions = (rs) =>
    rs.length
      ? rs
          .map(
            (r) =>
              `<div class="listitem"><div><strong>${esc(r.title)}</strong><p>PIN ${esc(r.pin)} · ${r.participants} participants · ${esc(r.phase)}</p></div>${link(page === "reports" ? "View report" : "Open controls", "#/" + (page === "reports" ? "report" : "host") + "/" + r.pin)}</div>`,
          )
          .join("")
      : "<p>Sessions appear here when you launch a quiz.</p>";
  main.innerHTML =
    tabs(page) +
    (page === "dashboard"
      ? `<section class="hero"><div><div class="pill" >${esc(user.organization)}</div><h1>Your teaching<br><em>workspace.</em></h1><p>Welcome back, ${esc(user.name)}. Prepare your next activity or bring a quiz to the room.</p>${link("＋ Create quiz", "#/editor", "button primary")}</div><div class="art" aria-hidden="true"><div class="poster"><strong>Live quiz studio</strong><div class="shapes">${["●", "▲", "✦", "■"].map((v) => `<div class="shape">${v}</div>`).join("")}</div></div></div></section><div class="grid">${[
          ["Quizzes", quizzes.length],
          [
            "Presentations",
            documents.filter((q) => q.kind === "presentation").length,
          ],
          [
            "Active sessions",
            rooms.filter(
              (r) => r.phase !== "ended" && r.config.expires > Date.now(),
            ).length,
          ],
          ["Participants", rooms.reduce((s, r) => s + r.participants, 0)],
        ]
          .map(([k, v]) => `<div class="card"><p>${k}</p><h2>${v}</h2></div>`)
          .join(
            "",
          )}</div><div class="row"><h2>Recent quizzes</h2>${link("View library →", "#/library", "")}</div><div class="grid">${quizCards(quizzes.slice(0, 3)) || "<p>Create your first quiz or start from a template.</p>"}</div><h2>Sessions</h2><div class="panel list">${sessions(rooms.slice(0, 5))}</div>`
      : page === "presentations"
        ? `<div class="row">${title("Presentations")}${link("＋ Create presentation", "#/presentation", "button primary")}</div><div class="grid">${quizCards(quizzes) || "<p>Create a presentation and add slides, questions or polls.</p>"}</div>`
        : page === "library"
          ? `<div class="row">${title("Quiz library")}${link("＋ Create quiz", "#/editor", "button primary")}</div><div class="panel fields">${field("Search library", "search", "", "search")}${select("Sort by", "sort", ["Last edited", "Title"])}</div><div class="grid" id="quizzes"></div><h2>Start from a template</h2><div class="grid">${demo.map((d, i) => card(d.title, "Optional template", d.category, "#/editor/template/" + i, i, "Use template")).join("")}</div>`
          : `${title(page === "reports" ? "Session reports" : "Live sessions")}${page === "reports" ? link("Compare sessions", "#/analytics") : ""}<div class="panel list">${sessions(rooms)}</div>${link("Choose a quiz to launch", "#/library", "button primary")}`);
  if (page === "library") {
    const filter = () => {
      let list = quizzes.filter((q) =>
        (q.title + " " + q.category)
          .toLowerCase()
          .includes($("[name=search]").value.toLowerCase()),
      );
      if ($("[name=sort]").value === "Title")
        list.sort((a, b) => a.title.localeCompare(b.title));
      $("#quizzes").innerHTML =
        quizCards(list) || "<p>No matching quizzes.</p>";
    };
    $("[name=search]").oninput = filter;
    $("[name=sort]").onchange = filter;
    filter();
  }
}
async function settings() {
  const org = user.role !== "lecturer" ? await api("org") : null;
  main.innerHTML =
    tabs("settings") +
    title("Settings") +
    `<div class="grid"><section class="panel stack"><h2>Profile</h2><p>${esc(user.email)}</p><form novalidate id="profile" class="stack">${field("Display name", "name", user.name, "text", "required")}<button>Save profile</button></form>${btn("Sign out", "logout")}${user.role === "super" ? link("Platform administration", "#/admin") : ""}<details><summary>Delete account</summary><form novalidate id="erase" class="stack"><p>Deleting the last account in an organization also deletes its quizzes, sessions, reports and photos.</p>${field("Confirm password", "password", "", "password", "required")}<button class="danger">Permanently delete account</button></form></details></section>${org ? `<section class="panel stack"><h2>Organization</h2>${link("Certificate builder", "#/certificates")}<form novalidate id="org" class="stack">${field("Organization name", "name", user.organization, "text", "required")}<button>Save organization</button></form></section>` : ""}</div>${org ? `<section class="panel stack"><h2>Members</h2>${org.map((v) => `<div class="listitem"><strong>${esc(v.name)}</strong><span>${esc(v.email)} · ${esc(v.role)}</span></div>`).join("")}<form novalidate id="invite" class="fields">${field("Lecturer name", "name", "", "text", "required")}${field("Email address", "email", "", "email", "required")}<button>Invite lecturer</button></form></section>` : ""}`;
  submit("#erase", async (b) => {
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
async function render() {
  const route = ++epoch;
  roomCleanup();
  main.dir = "ltr";
  main.lang = "en";
  main.onclick = null;
  const [page = "", a, b] = location.hash.replace(/^#\/?/, "").split("/");
  try {
    user = navigator.onLine ? await api("me") : null;
    if (route !== epoch) return;
    $("#nav").innerHTML = user
      ? link("Workspace", "#/dashboard", "quiet button") +
        link("Settings", "#/settings", "button")
      : link("Sign in", "#/login", "quiet button") +
        link("Get started", "#/register", "button primary");
    if (
      !user &&
      [
        "dashboard",
        "library",
        "presentations",
        "sessions",
        "reports",
        "settings",
        "editor",
        "presentation",
        "admin",
        "certificates",
        "analytics",
        "bank",
        "launch",
        "host",
        "report",
      ].includes(page)
    ) {
      go("login");
      return;
    }
    if (!page) home();
    else if (["login", "register", "recover", "reset", "verify"].includes(page))
      account(page, a);
    else if (page === "preview") preview(Number(a));
    else if (
      ["dashboard", "library", "presentations", "sessions", "reports"].includes(
        page,
      )
    )
      await workspace(page);
    else if (page === "standings") {
      await standings(a);
      watchStandings(a);
    } else if (page === "analytics") await analytics();
    else if (page === "certificates") await certificates();
    else if (page === "admin") await admin();
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
    else if (page === "report") await report(a);
    else if (page === "gallery" || page === "host-gallery") await gallery(a, b);
    else if (page === "terms") {
      const brand = await api("branding");
      main.innerHTML = `<section class="narrow panel stack">${title("Terms of use")}<p>${esc(brand.terms || "Use this workspace for educational sessions authorized by the hosting organization. Submit material you have permission to share. Keep private access phrases and results links confidential. Contact the session organizer for its participation and acceptable-use requirements.")}</p></section>`;
    } else if (page === "privacy" || page === "help")
      main.innerHTML = `<section class="narrow panel stack">${title(page === "privacy" ? "Participant privacy" : "Help center")}${page === "privacy" ? "<p>Your presenter can see your responses and session report. Anyone holding your private results link can read the results available to you. Keep it private.</p><p>Photography requires your consent. Withdraw consent in the session gallery to remove your pictures. Contact the organization running your session about access or deletion.</p>" : "<h3>Join a session</h3><p>Enter your presenter’s six-digit PIN on the home page or scan the session QR code. Keep the results link to return later.</p><h3>Present a quiz</h3><p>Create a workspace, add questions to a quiz, then choose Launch session. Open the projector display in another window and use the presenter controls to advance questions.</p>"}${page === "privacy" ? "<p>" + esc((await api("branding")).privacy) + "</p>" : ""}${link("Return home", "#/")}</section>`;
    else throw Error("Page not found.");
  } catch (e) {
    if (route === epoch)
      main.innerHTML = `<section class="panel narrow stack">${title("Unable to open this page")}<p>${esc(e.message)}</p>${link("Return home", "#/")}</section>`;
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
    $(".brand").lastChild.textContent = branding.name;
  } catch (error) {
    if (navigator.onLine) {
      main.innerHTML = `<section class="panel narrow stack">${title("Unable to open this page")}<p>${esc(error.message)}</p>${link("Reload", location.href)}</section>`;
      return;
    }
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("offline", () =>
    notice("Connection lost. Live participation resumes when you reconnect."),
  );
  window.addEventListener("online", () => location.reload());
  window.addEventListener("hashchange", render);
  initializePreferences();
  await render();
}
start();
