import {
  main,
  esc,
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
  main.innerHTML = `${pageHead("Platform administration", "", link("Settings", "#/settings", "button", "prev"))}<dl class="figures">${[
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
    )}</dl><div class="settings"><section><div><h2>Platform settings</h2></div><form novalidate class="stack" id="platform"><div class="fields">${field("Platform name", "name", c.name || "AskShaubo")}${field("Retention days", "retention", c.retention || 90, "number")}${field("Maximum image dimension", "maxDimension", c.maxDimension || 1280, "number")}${field("Thumbnail dimension", "thumbnail", c.thumbnail || 320, "number")}${field("Image quality", "quality", c.quality || 80, "number")}</div>${area("Operator terms of use", "terms", c.terms, 'dir="auto"')}${area("Operator privacy notice", "privacy", c.privacy, 'dir="auto"')}${check("Allow new organization registrations", "registration", c.registration !== false)}${submitButton("Save settings")}</form></section><section><div><h2>Account permissions</h2></div><div>${capped(
    r.accounts.map(
      (u) =>
        `<form novalidate class="listitem role" data-id="${esc(u.id)}"><div><strong translate="no" dir="auto">${esc(u.name)}</strong><p class="meta"><span translate="no" dir="ltr">${esc(u.email)}</span><span translate="no" dir="auto">${esc(r.orgs.find((o) => o.id === u.org)?.name)}</span></p></div>${u.role === "super" ? '<span class="chip">Platform administrator</span>' : select("Role", "role", ["admin", "lecturer"], u.role) + submitButton("Save role", "small")}</form>`,
    ),
  )}</div></section><section><div><h2>Audit log</h2></div><div>${r.activity.length ? capped(r.activity.map((v) => `<div class="listitem"><span>${esc(v.action)}</span><time class="meta">${new Date(Number(v.at)).toLocaleString()}</time></div>`)) : empty("No activity recorded.")}</div></section></div>`;
  submit("#platform", async (b) => {
    await api("admin", "PATCH", {
      ...b,
      registration: b.registration === "on",
    });
    notice("Platform settings saved.");
  });
  all(".role").forEach(
    (f) =>
      (f.onsubmit = (e) => {
        e.preventDefault();
        busy(e.submitter, async () => {
          await api("org/member/" + f.dataset.id, "PATCH", formData(f));
          notice("Role saved.");
        });
      }),
  );
}
export { admin };
