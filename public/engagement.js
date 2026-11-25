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
const icons = {
  "Car racing": "🏎️",
  "Space racing": "🚀",
  "Horse racing": "🏇",
  "Balloon race": "🎈",
  "Mountain climb": "🧗",
  "Treasure hunt": "🧭",
  "Quiz battle": "⚔️",
  Leaderboard: "🏅",
};
async function standings(pin) {
  const r = await api(
    "rooms/" + pin + "/standings",
    "GET",
    undefined,
    localStorage.getItem(storageKey(pin)),
  );
  const max = Math.max(1, ...r.entries.map((v) => v.score));
  main.innerHTML = `<section class="panel stage stack"><div class="row"><span class="pill">${esc(r.game)}</span>${btn("Full screen", "fullscreen")}</div>${title(r.title)}${!r.visible ? "<p>Standings appear as scores are released.</p>" : r.entries.map((v, i) => `<div class="race"><div class="row"><strong>${i + 1}. ${esc(v.name)}</strong><span>${v.best >= 3 ? "★ " + v.best + " streak · " : ""}${numScore(v.score)} points</span></div><label>${icons[r.game] || "🏅"}<progress aria-label="${esc(v.name)} score" value="${Math.max(0, v.score)}" max="${max}"></progress></label></div>`).join("")}${r.teams.length ? "<h2>Team leaderboard</h2>" + r.teams.map(([team, points]) => `<div class="listitem"><strong>${esc(team)}</strong>${points} points</div>`).join("") : ""}</section>`;
  actions(async () => document.documentElement.requestFullscreen());
}
const numScore = (n) => Number(n).toLocaleString();
async function analytics() {
  const [data, insights] = await Promise.all([
    api("analytics"),
    api("insights"),
  ]);
  main.innerHTML =
    tabs("reports") +
    title("Session comparison") +
    `<div class="panel scroll"><table><thead><tr>${["Session", "Date", "Participants", "Response rate", "Answer accuracy", "Mean response time", "Total points"].map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>${data.map((r) => `<tr><td>${link(r.title, "#/report/" + r.pin, "")}</td><td>${new Date(Number(r.created)).toLocaleDateString()}</td><td>${r.participants}</td><td>${r.participants ? Math.round((100 * r.responses) / (r.participants * r.questions)) + "%" : "—"}</td><td>${r.graded ? Math.round((100 * r.correct) / r.graded) + "%" : "—"}</td><td>${r.elapsed ? Math.round(Number(r.elapsed) / 100) / 10 + " s" : "—"}</td><td>${r.points}</td></tr>`).join("")}</tbody></table>${!data.length ? "<p>Launch a session to begin collecting responses.</p>" : ""}</div><section class="panel stack"><h2>Question analysis</h2>${field("Filter question, lecturer or session", "filter", "", "search")}${select("Order by accuracy", "order", ["Lowest first", "Highest first"])}<div id="insights"></div></section>`;
  const draw = () => {
    const query = $("[name=filter]").value.toLowerCase();
    const list = insights
      .filter((v) =>
        [v.question, v.lecturer, v.session]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .sort(
        (a, b) =>
          ($("[name=order]").value === "Lowest first" ? 1 : -1) *
          ((a.accuracy ?? 101) - (b.accuracy ?? 101)),
      );
    $("#insights").innerHTML =
      list
        .map(
          (v) =>
            `<div class="listitem"><div><strong>${esc(v.question)}</strong><p>${esc(v.session)} · ${esc(v.lecturer)} · ${v.submitted} responses</p></div><span>${v.accuracy === null ? "Ungraded" : v.accuracy + "% correct"} · ${(v.elapsed / 1000).toFixed(1)} s</span></div>`,
        )
        .join("") || "<p>No matching responses.</p>";
  };
  $("[name=filter]").oninput = draw;
  $("[name=order]").onchange = draw;
  draw();
}
async function certificates() {
  const c = await api("certificate");
  main.innerHTML =
    tabs("settings") +
    title("Certificate builder") +
    `<form novalidate class="panel stack" id="certificate">${field("Certificate title", "title", c.title || "Certificate of completion")}${field("Issuing organization", "issuer", c.issuer)}${field("Signatory", "signature", c.signature)}<button class="primary">Save certificate design</button></form>`;
  submit("#certificate", async (b) => {
    await api("certificate", "PUT", b);
    notice("Certificate design saved.");
  });
}
export { standings, analytics, certificates };
