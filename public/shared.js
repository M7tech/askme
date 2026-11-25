const main = document.querySelector("main");
document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (form instanceof HTMLFormElement && !form.reportValidity()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (s) => document.querySelector(s),
  all = (s) => [...document.querySelectorAll(s)];
const formData = (f) => Object.fromEntries(new FormData(f));
const link = (title, url, cls = "button") =>
  `<a class="${cls}" href="${esc(url)}">${esc(title)}</a>`;
const btn = (text, action, cls = "") =>
  `<button type="button" class="${cls}" data-action="${esc(action)}">${esc(text)}</button>`;
const field = (label, name, value = "", type = "text", attrs = "") =>
  `<label>${esc(label)}<input type="${type}" name="${esc(name)}" value="${esc(value)}" ${attrs}></label>`;
const area = (label, name, value = "") =>
  `<label>${esc(label)}<textarea name="${esc(name)}">${esc(value)}</textarea></label>`;
const select = (label, name, items, value) =>
  `<label>${esc(label)}<select name="${name}">${items
    .map((it) => {
      const [k, v] = Array.isArray(it) ? it : [it, it];
      return `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(v)}</option>`;
    })
    .join("")}</select></label>`;
const check = (label, name, checked = false) =>
  `<label class="check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}>${esc(label)}</label>`;
const go = (path) => {
  location.hash = "/" + path;
};
let timer;
function notice(text) {
  $("#notice").textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => ($("#notice").textContent = ""), 6500);
}
async function api(path, method = "GET", data, participant) {
  const headers = {};
  if (participant)
    headers[
      path.split("?")[0].endsWith("/results") ? "x-results" : "x-participant"
    ] = participant;
  const init = { method, headers };
  if (data instanceof FormData) init.body = data;
  else if (data !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(data);
  }
  const response = await fetch("/api/" + path, init);
  const json = await response.json();
  if (!response.ok) throw Error(json.error || "Request failed.");
  return json;
}
function submit(selector, fn) {
  $(selector)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = e.submitter;
    if (b) b.disabled = true;
    try {
      await fn(formData(e.target), e.target);
    } catch (error) {
      notice(error.message);
    } finally {
      if (b) b.disabled = false;
    }
  });
}
function actions(fn) {
  main.onclick = async (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    try {
      await fn(b.dataset.action, b);
    } catch (error) {
      notice(error.message);
    }
  };
}
function saveFile(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function title(name, desc = "") {
  return `<h1>${esc(name)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}`;
}
function tabs(active) {
  return `<div class="tabs">${[
    ["Workspace", "dashboard"],
    ["Quiz library", "library"],
    ["Presentations", "presentations"],
    ["Question bank", "bank"],
    ["Live sessions", "sessions"],
    ["Reports", "reports"],
    ["Settings", "settings"],
  ]
    .map(([label, url]) =>
      link(label, "#/" + url, url === active ? "active" : ""),
    )
    .join("")}</div>`;
}
const storageKey = (pin) => "chorus.participant." + pin;
const demo = [
  {
    title: "Color in context",
    category: "Design",
    questions: [
      {
        type: "Single choice",
        prompt: "Which pair creates the strongest light–dark contrast?",
        options: [
          "Navy and ivory",
          "Coral and peach",
          "Mint and sage",
          "Lavender and lilac",
        ],
        key: "Navy and ivory",
        explanation:
          "Navy and ivory have the greatest difference in relative luminance.",
        seconds: 30,
        points: 100,
      },
    ],
  },
  {
    title: "A room full of ideas",
    category: "Workshop",
    questions: [
      {
        type: "Brainstorm",
        prompt: "What would make this workshop valuable for you?",
        options: [],
        key: "",
        seconds: 60,
        points: 0,
      },
    ],
  },
  {
    title: "Check the pulse",
    category: "Feedback",
    questions: [
      {
        type: "Rating",
        prompt: "How confident do you feel applying today’s concept?",
        options: [],
        key: "",
        seconds: 0,
        points: 0,
      },
    ],
  },
];
export {
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
};
