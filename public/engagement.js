import {
  main,
  esc,
  $,
  all,
  link,
  btn,
  submitButton,
  field,
  notice,
  api,
  submit,
  actions,
  title,
  pageHead,
  empty,
  storageKey,
} from "./shared.js";
import { mark } from "./room.js";
import { num } from "./locale.js";
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
// These emoji are drawn facing left, so they turn around on LTR tracks.
const facesLeft = new Set(["Car racing", "Horse racing"]);
let positions = {},
  drawn = "";
async function standings(pin) {
  const r = await api(
    "rooms/" + pin + "/standings",
    "GET",
    undefined,
    localStorage.getItem(storageKey(pin)),
  );
  const key = pin + JSON.stringify(r);
  if (key === drawn && $(".standings")) return;
  drawn = key;
  const top = Math.max(1, ...r.entries.map((v) => v.score)),
    share = (v) => (100 * Math.max(0, v.score)) / top;
  main.innerHTML = `<section class="stage standings"><div class="stage-bar"><p class="chip">${esc(r.game)}</p>${btn("Full screen", "fullscreen", "small", "fullscreen")}</div>${title(r.title)}${
    !r.visible
      ? empty("Standings appear as scores are released.")
      : `<ol class="lanes">${r.entries
          .map(
            (v, i) =>
              `<li class="lane${i < 3 ? " podium-place" : ""}"><span class="place">${num(i + 1)}</span><div class="lane-body"><p><strong translate="no" dir="auto">${esc(v.name)}</strong><span class="meta">${v.best >= 3 ? `<span>${`${v.best} in a row`}</span>` : ""}<span>${`${num(v.score)} points`}</span></span></p><div class="track"><progress aria-label="${esc(v.name)}" value="${Math.max(0, v.score)}" max="${top}"></progress><span class="runner${facesLeft.has(r.game) ? " faces-left" : ""}" data-at="${share(v)}" data-name="${esc(v.name)}" aria-hidden="true">${icons[r.game] || "🏅"}</span></div></div></li>`,
          )
          .join("")}</ol>`
  }${r.teams.length ? `<section class="block"><h2>Team leaderboard</h2><div class="list">${r.teams.map(([team, points], i) => `<div class="listitem"><strong>${mark(i)}<span translate="no" dir="auto">${esc(team)}</span></strong><span>${`${num(points)} points`}</span></div>`).join("")}</div></section>` : ""}</section>`;
  // Runners start where they last stood, then move to the new score.
  const runners = all(".runner");
  for (const el of runners)
    el.style.setProperty("--at", positions[el.dataset.name] ?? 0);
  positions = {};
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const el of runners) {
        positions[el.dataset.name] = el.dataset.at;
        el.style.setProperty("--at", el.dataset.at);
      }
    }),
  );
  actions(async () => document.documentElement.requestFullscreen());
}
async function certificates() {
  const c = await api("certificate");
  main.innerHTML = `${pageHead("Certificate builder", "", link("Settings", "#/settings", "button", "prev"))}<div class="certificate-builder"><form novalidate class="stack" id="certificate">${field("Certificate title", "title", c.title || "Certificate of completion", "text", 'dir="auto"')}${field("Issuing organization", "issuer", c.issuer, "text", 'dir="auto"')}${field("Signatory", "signature", c.signature, "text", 'dir="auto"')}${submitButton("Save certificate design")}</form><article class="certificate" aria-label="Preview"><div class="seal" aria-hidden="true">${[0, 1, 2, 3].map((i) => mark(i)).join("")}</div><p data-show="title"></p><h2>Participant</h2><p>Session</p><div class="sign"><span data-show="issuer"></span><strong data-show="signature"></strong></div></article></div>`;
  const form = $("#certificate"),
    show = () =>
      all("[data-show]").forEach(
        (el) => (el.textContent = form.elements[el.dataset.show].value),
      );
  form.oninput = show;
  show();
  submit("#certificate", async (b) => {
    await api("certificate", "PUT", b);
    notice("Certificate design saved.");
  });
}
export { standings, certificates };
