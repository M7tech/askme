import {
  main,
  esc,
  $,
  all,
  link,
  submitButton,
  field,
  area,
  select,
  check,
  formData,
  notice,
  busy,
  api,
  submit,
  pageHead,
  empty,
  capped,
} from "./shared.js";
import { num } from "./locale.js";
async function admin() {
  const r = await api("admin"),
    c = r.config;
  main.innerHTML = `${pageHead("Platform administration", "", link("Settings", "#/settings", "button", "prev") + link("All users", "#/users", "button primary", "users"))}<dl class="figures">${[
    ["Organizations", num(r.orgs.length)],
    ["Participants", num(r.usage.participants)],
    [
      "Session photographs",
      num(Math.round(Number(r.usage.photo_bytes) / 1024)) + " KB",
    ],
    ["API memory", num(Math.round(r.process.rss / 1048576)) + " MB"],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd dir="ltr">${v}</dd></div>`)
    .join(
      "",
    )}</dl><div class="settings"><section><div><h2>Platform settings</h2></div><form novalidate class="stack" id="platform"><div class="fields">${field("Platform name", "name", c.name || "Ask")}${field("Retention days", "retention", c.retention || 90, "number")}${field("Maximum image dimension", "maxDimension", c.maxDimension || 1280, "number")}${field("Thumbnail dimension", "thumbnail", c.thumbnail || 320, "number")}${field("Image quality", "quality", c.quality || 80, "number")}</div>${area("Operator terms of use", "terms", c.terms, 'dir="auto"')}${area("Operator privacy notice", "privacy", c.privacy, 'dir="auto"')}${check("Allow new organization registrations", "registration", c.registration !== false)}${submitButton("Save settings")}</form></section><section><div><h2>Audit log</h2></div><div>${r.activity.length ? capped(r.activity.map((v) => `<div class="listitem"><span>${esc(v.action)}</span><time class="meta">${new Date(Number(v.at)).toLocaleString()}</time></div>`)) : empty("No activity recorded.")}</div></section></div>`;
  submit("#platform", async (b) => {
    await api("admin", "PATCH", {
      ...b,
      registration: b.registration === "on",
    });
    notice("Platform settings saved.");
  });
}
/** Every registered account on the platform, for the platform administrator. */
async function users() {
  const r = await api("admin"),
    org = new Map(r.orgs.map((o) => [o.id, o.name])),
    label = {
      super: "Platform administrator",
      admin: "admin",
      lecturer: "lecturer",
    };
  const row = (u) =>
    `<form novalidate class="listitem role" data-id="${esc(u.id)}"><div><strong translate="no" dir="auto">${esc(u.name)}</strong><p class="meta"><span translate="no" dir="ltr">${esc(u.email)}</span><span translate="no" dir="auto">${esc(org.get(u.org))}</span></p><p class="meta"><span>${u.quizzes === 1 ? "1 quiz" : `${num(u.quizzes)} quizzes`}</span><span>${u.sessions === 1 ? "1 session" : `${num(u.sessions)} sessions`}</span><span>${`${num(u.participants)} participants`}</span></p></div>${u.verified ? "" : '<span class="chip">Email not verified</span>'}${u.role === "super" ? '<span class="chip live">Platform administrator</span>' : select("Role", "role", ["admin", "lecturer"], u.role) + submitButton("Save role", "small")}</form>`;
  main.innerHTML = `${pageHead("All users", "", link("Platform administration", "#/admin", "button", "prev"))}<dl class="figures">${[
    ["Users", r.accounts.length],
    ["Organizations", r.orgs.length],
    ["Sessions", r.usage.sessions],
    ["Participants", r.usage.participants],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${num(v)}</dd></div>`)
    .join(
      "",
    )}</dl><div class="toolbar">${field("Search name, email or organization", "search", "", "search")}${select(
    "Role",
    "filter",
    [["", "Every role"], ...Object.entries(label)],
    "",
  )}</div><div id="users" aria-live="polite"></div>`;
  const draw = () => {
    const query = $("[name=search]").value.trim().toLowerCase(),
      role = $("[name=filter]").value;
    const list = r.accounts.filter(
      (u) =>
        (!role || u.role === role) &&
        [u.name, u.email, org.get(u.org)]
          .join(" ")
          .toLowerCase()
          .includes(query),
    );
    $("#users").innerHTML = list.length
      ? capped(list.map(row))
      : empty("No matching users.");
    all(".role").forEach(
      (f) =>
        (f.onsubmit = (event) => {
          event.preventDefault();
          busy(event.submitter, async () => {
            const { role: next } = formData(f);
            await api("org/member/" + f.dataset.id, "PATCH", { role: next });
            r.accounts.find((u) => u.id === f.dataset.id).role = next;
            notice("Role saved.");
          });
        }),
    );
  };
  $("[name=search]").oninput = draw;
  $("[name=filter]").onchange = draw;
  draw();
}
export { admin, users };
