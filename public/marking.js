import {
  main,
  esc,
  $,
  all,
  link,
  btn,
  submitButton,
  select,
  notice,
  busy,
  api,
  actions,
  pageHead,
  empty,
  capped,
  uid,
} from "./shared.js";
import { num } from "./locale.js";

const status = (a) =>
  a.marked
    ? ["Marked", "live"]
    : a.correct === true
      ? ["Matched the key", "live"]
      : a.correct === false
        ? ["Did not match the key", "bad"]
        : ["To mark", "warn"];
const open = (a) => !a.marked && a.correct !== true;

/** Lecturers read typed answers and award points, during or after a session. */
async function marking(pin) {
  const data = await api("rooms/" + pin + "/marking");
  const row = (q, a) => {
    const id = uid("m"),
      [label, tone] = status(a);
    return `<form novalidate class="listitem mark-row" data-person="${esc(a.person)}" data-q="${q.q}"><div><strong translate="no" dir="auto">${esc(a.name)}</strong><p class="mark-answer" translate="no" dir="auto">${esc(a.value)}</p></div><span class="chip ${tone}" data-status>${label}</span><div class="mark-points field"><label for="${id}">Points</label><div class="mark-entry"><input id="${id}" name="points" type="number" inputmode="numeric" required min="0" max="${q.max}" value="${a.marked || a.correct !== null ? a.points : ""}"><span>${`of ${num(q.max)}`}</span></div></div><div class="actions"><button type="button" class="small" data-give="${q.max}"><span>Full points</span></button><button type="button" class="small" data-give="0"><span>No points</span></button>${submitButton("Save points", "primary small")}</div></form>`;
  };
  const draw = () => {
    const onlyOpen = ($("[name=show]")?.value || "open") === "open";
    const waiting = data.questions.reduce(
      (n, q) => n + q.answers.filter(open).length,
      0,
    );
    $("#waiting").textContent =
      waiting === 1 ? "1 answer to mark" : `${waiting} answers to mark`;
    const groups = data.questions
      .map((q) => {
        const list = q.answers.filter((a) => !onlyOpen || open(a));
        return list.length
          ? `<section class="block"><div><h2 translate="no" dir="auto">${esc(q.prompt)}</h2><p class="meta"><span>${esc(q.type)}</span>${q.key ? `<span><span>Answer key</span>: <b translate="no" dir="auto">${esc(q.key)}</b></span>` : ""}</p></div><div>${capped(list.map((a) => row(q, a)))}</div></section>`
          : "";
      })
      .join("");
    $("#marking").innerHTML =
      groups ||
      empty(
        data.questions.some((q) => q.answers.length)
          ? "Every answer is marked."
          : "Typed answers appear here once participants respond.",
      );
    all(".mark-row").forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        busy(e.submitter, () => save(form));
      };
    });
  };
  const save = async (form) => {
    const q = data.questions.find((v) => v.q === Number(form.dataset.q)),
      a = q.answers.find((v) => v.person === form.dataset.person),
      points = Number(form.points.value);
    await api("rooms/" + pin + "/control", "POST", {
      action: "mark",
      person: a.person,
      q: q.q,
      value: a.value,
      points,
    });
    Object.assign(a, {
      marked: true,
      points,
      correct: points >= q.max ? true : points === 0 ? false : null,
    });
    const next =
      form.nextElementSibling?.dataset.person ||
      form.previousElementSibling?.dataset.person;
    draw();
    notice("Points saved.");
    // Keep the keyboard in the list so marking a class stays quick.
    $(
      `.mark-row[data-q="${q.q}"][data-person="${CSS.escape(next || a.person)}"] input`,
    )?.focus();
  };
  main.innerHTML = `${pageHead("Mark answers", data.title, btn("Refresh", "refresh", "", "undo") + link("Open controls", "#/host/" + pin, "button", "prev"))}<div class="toolbar"><p id="waiting" role="status"></p>${select(
    "Show",
    "show",
    [
      ["open", "Answers to mark"],
      ["all", "All answers"],
    ],
    "open",
  )}</div><p class="hint">Students see points when the answer is released.</p><div id="marking"></div>`;
  $("[name=show]").onchange = draw;
  draw();
  actions(async (a) => {
    if (a === "refresh") await marking(pin);
  });
  $("#marking").onclick = (e) => {
    const give = e.target.closest("[data-give]");
    if (!give) return;
    const form = give.form;
    form.points.value = give.dataset.give;
    form.requestSubmit(form.querySelector(".primary"));
  };
}
export { marking };
