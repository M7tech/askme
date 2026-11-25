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
async function admin() {
  const r = await api("admin"),
    c = r.config;
  main.innerHTML =
    tabs("settings") +
    title("Platform administration") +
    `<div class="grid">${[
      ["Organizations", r.orgs.length],
      ["Participants", r.usage.participants],
      [
        "Session photographs",
        Math.round(Number(r.usage.photo_bytes) / 1024) + " KB",
      ],
      ["API memory", Math.round(r.process.rss / 1048576) + " MB"],
    ]
      .map(
        ([k, v]) => `<article class="card"><p>${k}</p><h2>${v}</h2></article>`,
      )
      .join(
        "",
      )}</div><form novalidate class="panel stack" id="platform"><h2>Platform settings</h2><div class="fields">${field("Platform name", "name", c.name || "AskShaubo")}${field("Retention days", "retention", c.retention || 90, "number")}${field("Maximum image dimension", "maxDimension", c.maxDimension || 1280, "number")}${field("Thumbnail dimension", "thumbnail", c.thumbnail || 320, "number")}${field("Image quality", "quality", c.quality || 80, "number")}</div>${area("Operator terms of use", "terms", c.terms)}${area("Operator privacy notice", "privacy", c.privacy)}${check("Allow new organization registrations", "registration", c.registration !== false)}<button class="primary">Save settings</button></form><section class="panel stack"><h2>Account permissions</h2>${r.accounts.map((u) => `<form novalidate class="listitem role" data-id="${esc(u.id)}"><div><strong>${esc(u.name)}</strong><p>${esc(u.email)} · ${esc(r.orgs.find((o) => o.id === u.org)?.name)}</p></div>${u.role === "super" ? "<strong>Platform administrator</strong>" : select("Role", "role", ["admin", "lecturer"], u.role) + "<button>Save role</button>"}</form>`).join("")}</section><section class="panel stack"><h2>Audit log</h2>${r.activity.map((v) => `<div class="listitem">${esc(v.action)}<time>${new Date(Number(v.at)).toLocaleString()}</time></div>`).join("") || "<p>No activity recorded.</p>"}</section>`;
  submit("#platform", async (b) => {
    await api("admin", "PATCH", {
      ...b,
      registration: b.registration === "on",
    });
    notice("Platform settings saved.");
  });
  all(".role").forEach(
    (f) =>
      (f.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api("org/member/" + f.dataset.id, "PATCH", formData(f));
          notice("Role saved.");
        } catch (err) {
          notice(err.message);
        }
      }),
  );
}
export { admin };
