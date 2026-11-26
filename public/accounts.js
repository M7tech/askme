import {
  main,
  esc,
  $,
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
  pageHead,
  empty,
  capped,
  chip,
  icon,
} from "./shared.js";
import { num, locale } from "./locale.js";

const roles = [
  ["lecturer", "lecturer"],
  ["admin", "Organization administrator"],
  ["super", "Platform administrator"],
];
const roleName = (key) => roles.find((r) => r[0] === key)?.[1] || key;
function size(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let n = Number(bytes),
    i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${num(n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10)} ${units[i]}`;
}
const bytes = (n) => `<bdi dir="ltr" translate="no">${size(n)}</bdi>`;
const count = (n, one, many) => (n === 1 ? one : `${num(n)} ${many}`);
/** "5 minutes ago", in the reader's language. */
function ago(ms, now) {
  if (!ms) return "Never signed in";
  const words = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }),
    s = Math.round((ms - now) / 1000);
  for (const [unit, size] of [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ])
    if (Math.abs(s) >= size) return words.format(Math.round(s / size), unit);
  return words.format(0, "minute");
}
const activeNow = (u, r) => !u.suspended && r.now - u.last_seen < r.active;
const seen = (u, r) =>
  activeNow(u, r)
    ? '<span class="chip live">Active now</span>'
    : `<span class="seen">${u.last_seen ? "Last active" : ""} <time translate="no">${esc(ago(u.last_seen, r.now))}</time></span>`;
/* Removal asks for the email, then reports and returns where it was asked. */
async function remove(u, after) {
  const confirm = await confirmAction(
    "Remove this account?",
    "The account and all its data are deleted, including students’ result links. This cannot be undone.",
    "Remove account",
    u.email,
  );
  if (!confirm) return;
  await api("admin/accounts/" + u.id, "POST", { action: "remove", confirm });
  notice("Account removed.");
  await after();
}
const chips = (u, self) =>
  (u.suspended ? '<span class="chip bad">Suspended</span>' : "") +
  (u.verified ? "" : '<span class="chip">Email not verified</span>') +
  `<span class="chip${u.role === "super" ? " live" : ""}">${esc(roleName(u.role))}</span>` +
  (u.id === self ? '<span class="chip">You</span>' : "");

/** Every registered account on the platform, for the platform administrator. */
async function users() {
  const [r, live] = await Promise.all([
      api("admin/accounts"),
      api("admin/sessions"),
    ]),
    total = r.accounts.reduce((sum, u) => sum + u.usage.bytes, 0),
    most = Math.max(1, ...r.accounts.map((u) => u.usage.bytes));
  const row = (u) =>
    `<div class="listitem account-row"><div><strong translate="no" dir="auto">${esc(u.name)}</strong><p class="meta"><span translate="no" dir="ltr">${esc(u.email)}</span><span translate="no" dir="auto">${esc(u.organization)}</span></p></div><div class="account-chips">${chips(u, r.self)}</div><div class="account-data"><b>${bytes(u.usage.bytes)}</b><progress value="${u.usage.bytes}" max="${most}" aria-label="Data used"></progress></div><div class="account-actions">${seen(u, r)}<div class="actions">${link("Manage", "#/users/" + u.id, "button small")}${u.id === r.self || u.role === "super" ? "" : btn("Remove", "remove:" + u.id, "small quiet danger", "trash")}</div></div></div>`;
  const session = (v) =>
    `<div class="listitem session-row"><div><strong translate="no" dir="auto">${esc(v.title)}</strong><p class="meta"><span><span>PIN</span> <b class="pin">${esc(v.pin)}</b></span><span translate="no" dir="auto">${esc(v.presenter || "Removed account")}</span><span translate="no" dir="auto">${esc(v.organization)}</span></p></div>${chip(v.phase)}<p class="meta"><span>${`${num(v.participants)} participants`}</span><span>${`${num(v.responses)} responses`}</span>${v.phase === "waiting" ? "" : `<span>${`Question ${v.position + 1} of ${v.questions}`}</span>`}</p><div class="actions">${link("Open controls", "#/host/" + v.pin, "button small")}${btn("End session", "end:" + v.pin, "small quiet danger", "stop")}</div></div>`;
  main.innerHTML = `${pageHead("All users", "", link("Platform administration", "#/admin", "button", "prev"))}<dl class="figures">${[
    ["Users", num(r.accounts.length)],
    ["Active now", num(r.accounts.filter((u) => activeNow(u, r)).length)],
    ["Active sessions", num(live.length)],
    ["Data used", bytes(total)],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join(
      "",
    )}</dl><section class="block"><div class="row"><h2>Active sessions</h2><p class="hint">Sessions that have not ended, across every organization.</p></div>${live.length ? capped(live.map(session)) : empty("No sessions are running.")}</section><section class="block"><h2>Users</h2><div class="toolbar">${field("Search name, email or organization", "search", "", "search")}${select("Role", "filter", [["", "Every role"], ...roles], "")}${select(
    "Show",
    "state",
    [
      ["", "Everyone"],
      ["active", "Active now"],
      ["suspended", "Suspended"],
    ],
    "",
  )}${select(
    "Sort by",
    "sort",
    [
      ["name", "Name"],
      ["data", "Most data"],
      ["seen", "Recently active"],
    ],
    "name",
  )}</div><div id="users" aria-live="polite"></div></section>`;
  const draw = () => {
    const query = $("[name=search]").value.trim().toLowerCase(),
      role = $("[name=filter]").value,
      state = $("[name=state]").value;
    const list = r.accounts.filter(
      (u) =>
        (!role || u.role === role) &&
        (!state || (state === "active" ? activeNow(u, r) : u.suspended)) &&
        [u.name, u.email, u.organization]
          .join(" ")
          .toLowerCase()
          .includes(query),
    );
    if ($("[name=sort]").value === "data")
      list.sort((a, b) => b.usage.bytes - a.usage.bytes);
    if ($("[name=sort]").value === "seen")
      list.sort((a, b) => b.last_seen - a.last_seen);
    $("#users").innerHTML = list.length
      ? capped(list.map(row))
      : empty("No matching users.");
  };
  $("[name=search]").oninput = draw;
  $("[name=filter]").onchange = draw;
  $("[name=state]").onchange = draw;
  $("[name=sort]").onchange = draw;
  draw();
  actions(async (a) => {
    if (a.startsWith("remove:"))
      return remove(
        r.accounts.find((u) => u.id === a.slice(7)),
        users,
      );
    if (a.startsWith("end:")) {
      const pin = a.slice(4);
      if (
        !(await confirmAction(
          "End this session?",
          "Answering closes for everyone.",
          "End session",
        ))
      )
        return;
      await api("rooms/" + pin + "/control", "POST", { action: "end" });
      notice("Session ended.");
      await users();
    }
  });
}

/** One account: what it stores and what the administrator may do with it. */
async function account(id) {
  const r = await api("admin/accounts"),
    u = r.accounts.find((v) => v.id === id);
  if (!u) throw Error("Account unavailable.");
  const self = u.id === r.self,
    locked = u.role === "super" && !self,
    g = u.usage;
  const act = (action, data = {}) =>
    api("admin/accounts/" + id, "POST", { action, ...data });
  const part = (label, detail, value) =>
    `<div class="usage-row"><div><strong>${label}</strong><p class="meta"><span>${detail}</span></p></div><progress value="${value}" max="${Math.max(1, g.bytes)}" aria-label="${label}"></progress><b>${bytes(value)}</b></div>`;
  const section = (heading, note, body) =>
    `<section><div><h2>${heading}</h2><p>${note}</p></div><div class="stack">${body}</div></section>`;
  main.innerHTML = `${pageHead("Manage account", "", link("All users", "#/users", "button", "prev"))}<div class="account-card"><div><h2 translate="no" dir="auto">${esc(u.name)}</h2><p class="meta"><span translate="no" dir="ltr">${esc(u.email)}</span><span translate="no" dir="auto">${esc(u.organization)}</span></p></div><div class="account-chips">${chips(u, r.self)}${seen(u, r)}</div></div><div class="settings">${section(
    "Data used",
    "Space stored in the database.",
    `<p class="big">${bytes(g.bytes)}</p><div class="usage">${part("Quizzes", count(g.quizzes, "1 quiz", "quizzes"), g.data.quizzes)}${part("Question media", count(g.media, "1 file", "files"), g.data.media)}${part("Sessions and answers", `${count(g.sessions, "1 session", "sessions")}</span><span>${num(g.participants)} participants</span><span>${num(g.answers)} responses`, g.data.sessions)}${part("Session photographs", count(g.photos, "1 photo", "photos"), g.data.photos)}</div>`,
  )}${
    self
      ? `<section><div><h2>Your account</h2></div><p>You cannot change your own account here.</p></section>`
      : section(
          "Role",
          "Organization administrators manage their own organization. Platform administrators manage every account.",
          `<form novalidate id="role" class="stack">${select("Role", "role", roles, u.role)}${submitButton("Save role", "")}</form>`,
        ) +
        (locked
          ? `<section><div><h2>Access</h2></div><p>Change this platform administrator’s role first.</p></section>`
          : section(
              "Password",
              "You never see a password. The owner chooses a new one with a link that works once, for one hour.",
              `<div class="actions">${btn("Create reset link", "reset-link", "", "link")}${r.mail ? btn("Email reset link", "reset-email", "", "message") : ""}</div><div id="reset" role="status"></div>`,
            ) +
            section(
              "Access",
              "A suspended account cannot sign in and its sessions accept no new participants. Its data stays.",
              `<div>${u.suspended ? btn("Restore access", "restore", "", "check") : btn("Suspend account", "suspend", "danger", "lock")}</div>`,
            ) +
            section(
              "Clear data",
              "Deletes every quiz, session, answer, photograph and media file of this account. The account stays.",
              `<div>${btn("Clear data", "clear", "danger", "trash")}</div>`,
            ) +
            section(
              "Remove account",
              "Deletes the account and all its data. An organization with no accounts left is deleted too.",
              `<div>${btn("Remove account", "remove", "danger", "trash")}</div>`,
            ))
  }</div>`;
  submit("#role", async (b) => {
    if (b.role === u.role) return notice("Role saved.");
    if (
      b.role === "super" &&
      !(await confirmAction(
        "Make this account a platform administrator?",
        "It will be able to see and manage every account and all data.",
        "Make platform administrator",
      ))
    )
      return;
    await act("role", { role: b.role });
    notice("Role saved.");
    await account(id);
  });
  const reset = async (delivery) => {
    if (
      !(await confirmAction(
        "Reset this password?",
        "The current password stops working and the account is signed out everywhere.",
        "Reset password",
      ))
    )
      return;
    const out = await act("reset", { delivery });
    if (out.sent) {
      notice("Reset link sent.");
      return;
    }
    const box = $("#reset");
    box.innerHTML = `<div class="info stack">${field("Reset link", "link", out.link, "text", 'readonly dir="ltr"')}<p>Send it privately to the account owner. It works once and expires in one hour.</p><div class="actions">${btn("Copy link", "copy", "small", "copy")}</div></div>`;
    box.querySelector("input").select();
  };
  actions(async (a) => {
    if (a === "reset-link") return reset("link");
    if (a === "reset-email") return reset("email");
    if (a === "copy") {
      const input = $("#reset input");
      try {
        await navigator.clipboard.writeText(input.value);
        notice("Link copied.");
      } catch {
        input.select();
        notice("Press Ctrl+C to copy the selected link.");
      }
      return;
    }
    if (a === "suspend") {
      if (
        !(await confirmAction(
          "Suspend this account?",
          "It is signed out now and cannot sign in until you restore it.",
          "Suspend account",
        ))
      )
        return;
      await act("suspend");
      notice("Account suspended.");
      return account(id);
    }
    if (a === "restore") {
      await act("restore");
      notice("Access restored.");
      return account(id);
    }
    if (a === "clear") {
      const confirm = await confirmAction(
        "Clear all data of this account?",
        "Quizzes, sessions, answers, photographs and students’ result links are deleted. This cannot be undone.",
        "Clear data",
        u.email,
      );
      if (!confirm) return;
      await act("clear", { confirm });
      notice("Data cleared.");
      return account(id);
    }
    if (a === "remove") return remove(u, () => go("users"));
  });
}
export { users, account };
