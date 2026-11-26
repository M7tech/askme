import { icon } from "./icons.js";
const main = document.querySelector("main");
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
let sequence = 0;
const uid = (prefix = "f") => prefix + ++sequence;

/* Controls. `before` and `after` name icons from icons.js. */
const link = (title, url, cls = "button", before = "", after = "") =>
  `<a class="${cls}" href="${esc(url)}">${icon(before)}<span>${esc(title)}</span>${icon(after)}</a>`;
const btn = (text, action, cls = "", before = "", after = "") =>
  `<button type="button" class="${cls}" data-action="${esc(action)}">${icon(before)}<span>${esc(text)}</span>${icon(after)}</button>`;
const submitButton = (text, cls = "primary", before = "", after = "") =>
  `<button class="${cls}">${icon(before)}<span>${esc(text)}</span>${icon(after)}</button>`;
function field(label, name, value = "", type = "text", attrs = "") {
  const id = uid();
  const input = `<input id="${id}" type="${type}" name="${esc(name)}" value="${esc(value)}" ${type === "search" ? 'placeholder=" "' : ""} ${attrs}>`;
  const control =
    type === "password"
      ? `<div class="control secret">${input}<button type="button" class="inset" data-reveal aria-controls="${id}" aria-pressed="false">Show</button></div>`
      : type === "search"
        ? `<div class="control search">${icon("search")}${input}<button type="button" class="inset clear" data-clear aria-label="Clear search">${icon("close")}</button></div>`
        : input;
  return `<div class="field"><label for="${id}">${esc(label)}</label>${control}</div>`;
}
function area(label, name, value = "", attrs = "") {
  const id = uid();
  return `<div class="field"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${esc(name)}" ${attrs}>${esc(value)}</textarea></div>`;
}
function select(label, name, items, value) {
  const id = uid();
  return `<div class="field"><label for="${id}">${esc(label)}</label><div class="control choose"><select id="${id}" name="${name}">${items
    .map((it) => {
      const [k, v] = Array.isArray(it) ? it : [it, it];
      return `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(v)}</option>`;
    })
    .join("")}</select>${icon("chevron")}</div></div>`;
}
const check = (label, name, checked = false) =>
  `<label class="check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span>${esc(label)}</span></label>`;

/* Page furniture */
function title(name, desc = "") {
  return `<h1>${esc(name)}</h1>${desc ? `<p translate="no">${esc(desc)}</p>` : ""}`;
}
const pageHead = (name, desc = "", tools = "") =>
  `<div class="page-head"><div>${title(name, desc)}</div>${tools ? `<div class="actions">${tools}</div>` : ""}</div>`;
const empty = (text, action = "") =>
  `<div class="empty"><p>${esc(text)}</p>${action}</div>`;
const tones = {
  open: "live",
  waiting: "calm",
  paused: "warn",
  closed: "warn",
  ended: "done",
};
const chip = (phase) =>
  `<span class="chip ${tones[phase] || ""}">${esc(phase)}</span>`;
/** Long collections show 20 rows and offer the rest; print shows everything. */
const capped = (rows) =>
  rows.length > 20
    ? `<div class="list capped">${rows.join("")}</div>${more(rows.length)}`
    : `<div class="list">${rows.join("")}</div>`;
const more = (n) =>
  `<button type="button" class="quiet" data-more>Show all ${n}</button>`;

const go = (path) => {
  location.hash = "/" + path;
};
let timer;
function notice(text, tone = "info") {
  const el = $("#notice");
  clearTimeout(timer);
  el.className = tone;
  el.innerHTML = `${icon(tone === "error" ? "alert" : "done")}<span>${esc(text)}</span>`;
  timer = setTimeout(() => el.replaceChildren(), 6500);
}

/** App-owned confirmation. Resolves true only for the named action. */
/* With `typed`, the action unlocks once that text is entered, and the entered
   text is returned so the server can check it too. */
function confirmAction(heading, consequence, verb, typed = "") {
  return new Promise((resolve) => {
    const opener = document.activeElement,
      id = uid("d"),
      dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.setAttribute("aria-labelledby", id);
    dialog.innerHTML = `<form method="dialog" novalidate><h2 id="${id}">${esc(heading)}</h2><p>${esc(consequence)}</p>${typed ? `<p class="typed"><span>Type this to confirm</span>: <b dir="ltr" translate="no">${esc(typed)}</b></p>${field("Confirmation", "typed", "", "text", 'autocomplete="off" dir="ltr" spellcheck="false" autocapitalize="off"')}` : ""}<div class="actions"><button value="" autofocus><span>Cancel</span></button><button value="yes" class="danger solid" ${typed ? "disabled" : ""}><span>${esc(verb)}</span></button></div></form>`;
    const entry = dialog.querySelector("[name=typed]"),
      matches = () => entry.value.trim().toLowerCase() === typed.toLowerCase();
    if (typed) {
      entry.oninput = () =>
        (dialog.querySelector(".solid").disabled = !matches());
      // Enter would otherwise press Cancel, the first button.
      entry.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (matches()) dialog.close("yes");
      };
    }
    dialog.onclose = () => {
      const agreed = dialog.returnValue === "yes";
      dialog.remove();
      if (opener?.isConnected) opener.focus();
      resolve(agreed && typed ? entry.value.trim() : agreed);
    };
    dialog.onclick = (e) => {
      if (e.target === dialog) dialog.close("");
    };
    document.body.append(dialog);
    dialog.showModal();
  });
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
async function busy(button, fn) {
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    await fn();
  } catch (error) {
    notice(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}
function submit(selector, fn) {
  $(selector)?.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => fn(formData(e.target), e.target));
  });
}
function actions(fn) {
  main.onclick = async (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    try {
      await fn(b.dataset.action, b);
    } catch (error) {
      notice(error.message, "error");
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

/* Validation lives in the page: text beside the field, translated, linked. */
function problem(el) {
  const v = el.validity;
  if (v.valueMissing)
    return el.type === "radio"
      ? "Choose an answer."
      : el.type === "file"
        ? "Choose a file."
        : el.tagName === "SELECT"
          ? "Choose an option."
          : "Fill in this field.";
  if (v.typeMismatch) return "Enter a valid email address.";
  if (v.tooShort) return `Use at least ${el.minLength} characters.`;
  if (v.patternMismatch) return "Enter the six-digit PIN.";
  if (v.rangeUnderflow || v.rangeOverflow)
    return el.max
      ? `Enter a number from ${el.min} to ${el.max}.`
      : `Enter ${el.min} or more.`;
  return "Enter a valid number.";
}
function clearProblem(el) {
  const note = el.form?.querySelector(
    `[data-error-for="${CSS.escape(el.name)}"]`,
  );
  if (!note) return;
  note.remove();
  for (const peer of el.form.elements)
    if (peer.name === el.name) {
      peer.removeAttribute("aria-invalid");
      peer.removeAttribute("aria-describedby");
    }
}
document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method === "dialog") return;
    for (const el of form.elements) if (el.name) clearProblem(el);
    if (form.checkValidity()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const seen = new Set();
    let first;
    for (const el of form.elements) {
      if (!el.willValidate || el.validity.valid || seen.has(el.name)) continue;
      seen.add(el.name);
      first ||= el;
      const note = document.createElement("p"),
        id = uid("e");
      note.className = "field-error";
      note.id = id;
      note.dataset.errorFor = el.name;
      note.innerHTML = `${icon("alert")}<span>${esc(problem(el))}</span>`;
      const host = el.closest(".field, .answers, .pinform, .filefield") || el;
      if (host.matches(".answers")) host.after(note);
      else host === el ? el.after(note) : host.append(note);
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", id);
    }
    const hidden = first?.closest("details:not([open])");
    if (hidden) hidden.open = true;
    first?.focus();
  },
  true,
);
document.addEventListener("input", (e) => {
  if (e.target.name) clearProblem(e.target);
});
document.addEventListener("click", (e) => {
  const reveal = e.target.closest("[data-reveal]");
  if (reveal) {
    const input = document.getElementById(reveal.getAttribute("aria-controls")),
      shown = input.type === "text";
    input.type = shown ? "password" : "text";
    reveal.setAttribute("aria-pressed", String(!shown));
    reveal.textContent = shown ? "Show" : "Hide";
  }
  const clear = e.target.closest("[data-clear]");
  if (clear) {
    const input = clear.parentNode.querySelector("input");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }
  const expand = e.target.closest("[data-more]");
  if (expand) {
    expand.parentNode.querySelector(".capped")?.classList.remove("capped");
    expand.remove();
  }
});
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
  uid,
  formData,
  link,
  btn,
  submitButton,
  field,
  area,
  select,
  check,
  go,
  notice,
  confirmAction,
  busy,
  api,
  submit,
  actions,
  saveFile,
  title,
  pageHead,
  empty,
  chip,
  capped,
  more,
  storageKey,
  demo,
  icon,
};
