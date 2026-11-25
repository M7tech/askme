import {
  main,
  esc,
  $,
  all,
  formData,
  link,
  btn,
  submitButton,
  field,
  area,
  select,
  go,
  notice,
  confirmAction,
  api,
  submit,
  actions,
  saveFile,
  title,
  pageHead,
  empty,
  capped,
  demo,
  icon,
} from "./shared.js";
import { mark } from "./room.js";
const types = [
  "Single choice",
  "Multiple choice",
  "True or false",
  "Text answer",
  "Fill in the blank",
  "Numeric",
  "Word cloud",
  "Poll",
  "Rating",
  "Survey",
  "Ranking",
  "Ordering",
  "Brainstorm",
  "Personality",
  "Matching",
  "Drag and drop",
  "Image hotspot",
  "Slide",
];
const optionsTypes = [
  "Single choice",
  "Multiple choice",
  "True or false",
  "Poll",
  "Personality",
  "Ranking",
  "Ordering",
  "Matching",
  "Drag and drop",
];
const fresh = () => ({
  type: "Single choice",
  prompt: "",
  options: ["", ""],
  key: "",
  seconds: 30,
  points: 100,
  effect: "None",
  explanation: "",
  reference: "",
});
const pairTypes = ["Matching", "Drag and drop"];
const keyed = {
  "Single choice": "radio",
  "True or false": "radio",
  "Multiple choice": "checkbox",
};
/* One row per option. The correct answer is marked on the row itself. */
function optionFields(q) {
  const kind = keyed[q.type],
    ordered = q.type === "Ordering",
    fixed = q.type === "True or false",
    options =
      q.options.length >= 2 ? q.options : [...q.options, "", ""].slice(0, 2),
    keys = q.type === "Multiple choice" ? (q.key || "").split("|") : [q.key];
  return `<fieldset class="options"><legend>${ordered ? "Options in correct order" : "Answer options"}</legend>${kind ? `<p class="hint">${q.type === "Multiple choice" ? "Tick every correct option." : "Mark the correct option."}</p>` : ""}<div class="option-list">${options
    .map(
      (o, i) =>
        `<div class="option-row"><span class="option-key tone${i % 4}">${ordered ? `<b>${i + 1}</b>` : mark(i)}</span><input data-option dir="auto" maxlength="400" aria-label="Option ${i + 1}" placeholder="Option ${i + 1}" value="${esc(o)}">${kind ? `<label class="mark-correct"><input type="${kind}" data-correct name="correct" aria-label="Option ${i + 1} is correct" ${o && keys.includes(o) ? "checked" : ""}>${icon("check")}</label>` : ""}${ordered ? `<button type="button" class="icon-button" data-action="option-up-${i}" aria-label="Move option ${i + 1} up" ${i ? "" : "disabled"}>${icon("up")}</button>` : ""}${!fixed && options.length > 2 ? `<button type="button" class="icon-button" data-action="option-remove-${i}" aria-label="Remove option ${i + 1}">${icon("close")}</button>` : ""}</div>`,
    )
    .join(
      "",
    )}</div>${!fixed && options.length < 12 ? btn("Add option", "option-add", "small", "plus") : ""}</fieldset>`;
}
function matchingFields(q) {
  const pairs = Array.from(
    { length: Math.max(2, q.options.length) },
    (_, index) => {
      const [label = "", ...target] = (q.options[index] || "").split("|");
      return { label, target: target.join("|") };
    },
  );
  return `<section class="options stack"><h3>Matching pairs</h3>${pairs
    .map(
      (pair, index) =>
        `<fieldset class="pair" data-pair><legend>Pair ${index + 1}</legend><div class="fields">${field("Label", "pairLabel" + index, pair.label, "text", 'data-label maxlength="180" dir="auto"')}${field("Matching target", "pairTarget" + index, pair.target, "text", 'data-target maxlength="180" dir="auto"')}</div>${pairs.length > 2 ? btn("Remove pair", "pair-remove-" + index, "small quiet danger", "trash") : ""}</fieldset>`,
    )
    .join(
      "",
    )}${pairs.length < 12 ? btn("Add pair", "pair-add", "small", "plus") : ""}</section>`;
}
async function editor(key, index, kind = "quiz") {
  const deck = kind === "presentation";
  const editorRoute = deck ? "presentation/" : "editor/";
  const isExisting = key && key !== "template";
  const ai = await api("ai");
  const initial = isExisting
    ? await api("quizzes/" + key)
    : key === "template"
      ? structuredClone(demo[index] || demo[0])
      : {
          title: "",
          category: deck ? "Presentation" : "General",
          questions: [{ ...fresh(), type: deck ? "Slide" : "Single choice" }],
        };
  const doc = {
    kind: initial.kind || kind,
    title: initial.title,
    category: initial.category,
    questions: initial.document || initial.questions,
  };
  let version = initial.version,
    idx = 0,
    past = [],
    future = [],
    pending,
    chain = Promise.resolve(),
    drag = null,
    update = 0;
  const local =
    "chorus.draft." +
    (await api("me")).id +
    "." +
    (key || kind + "-new") +
    "." +
    (index || 0);
  try {
    const draft = JSON.parse(localStorage.getItem(local));
    if (draft && draft.version === (version || 0))
      Object.assign(doc, draft.doc);
  } catch {}
  function checkpoint() {
    past.push(JSON.stringify(doc));
    if (past.length > 60) past.shift();
    future = [];
  }
  function capture() {
    const f = $("#edit");
    if (!f) return;
    const v = formData(f),
      q = doc.questions[idx];
    Object.assign(doc, { title: v.title, category: v.category });
    Object.assign(q, {
      prompt: v.prompt,
      type: v.type,
      seconds: Number(v.seconds),
      points: Number(v.points),
      explanation: v.explanation,
      reference: v.reference,
      effect: v.effect,
      moves: Number(v.moves),
      intensity: Number(v.intensity),
      duration: Number(v.duration),
      target: Number(v.target),
      difficulty: v.difficulty,
      tags: v.tags,
    });
    q.translations = {
      ar: { prompt: v.arPrompt, explanation: v.arExplanation },
      ckb: { prompt: v.ckbPrompt, explanation: v.ckbExplanation },
    };
    const rows = [...f.querySelectorAll(".option-row")];
    if (rows.length) {
      q.options = rows.map((row) =>
        row.querySelector("[data-option]").value.trim(),
      );
      if (rows[0].querySelector("[data-correct]"))
        q.key = rows
          .filter((row) => row.querySelector("[data-correct]").checked)
          .map((row) => row.querySelector("[data-option]").value.trim())
          .filter(Boolean)
          .join("|");
    }
    if (v.key !== undefined) q.key = v.key;
    if (pairTypes.includes(q.type) && f.querySelector("[data-pair]"))
      q.options = [...f.querySelectorAll("[data-pair]")]
        .map((row) => [
          row.querySelector("[data-label]").value.trim(),
          row.querySelector("[data-target]").value.trim(),
        ])
        .map((pair) => pair.join("|"));
  }
  function draft() {
    localStorage.setItem(local, JSON.stringify({ doc, version: version || 0 }));
  }
  async function persist() {
    clearTimeout(pending);
    const payload = structuredClone(doc),
      rev = update;
    // Rows left blank in the editor are not answers.
    for (const q of payload.questions)
      if (optionsTypes.includes(q.type) && !pairTypes.includes(q.type))
        q.options = q.options.filter(Boolean);
    const save = async () => {
      const result = await api(
        key && key !== "template" ? "quizzes/" + key : "quizzes",
        key && key !== "template" ? "PUT" : "POST",
        { ...payload, version },
      );
      key = result.id;
      version = result.version;
      if (update === rev) localStorage.removeItem(local);
      else draft();
      return result;
    };
    chain = chain.catch(() => {}).then(save);
    return chain;
  }
  function changed() {
    update++;
    draft();
    clearTimeout(pending);
    const status = $("#saved");
    if (status) status.textContent = "Draft saved on this device";
    const current = $(".outline [aria-current] .outline-text");
    if (current)
      current.textContent = doc.questions[idx].prompt || "Untitled question";
    if (isExisting)
      pending = setTimeout(async () => {
        try {
          await persist();
          if (status?.isConnected) status.textContent = "Saved to library";
        } catch (e) {
          if (status?.isConnected) status.textContent = e.message;
        }
      }, 950);
  }
  function draw() {
    idx = Math.max(0, Math.min(idx, doc.questions.length - 1));
    const q = doc.questions[idx];
    const named = [
      "Single choice",
      "Multiple choice",
      "True or false",
      "Text answer",
      "Fill in the blank",
      "Numeric",
      "Image hotspot",
    ];
    main.innerHTML = `<div class="studio-bar"><div class="with-chip">${title(deck ? "Presentation studio" : "Quiz studio")}<span class="chip" id="saved">${version ? "Saved quiz" : "Local draft"}</span></div><div class="actions"><button type="button" class="icon-button" data-action="undo" aria-label="Undo">${icon("undo")}</button><button type="button" class="icon-button" data-action="redo" aria-label="Redo">${icon("redo")}</button>${btn("Preview", "preview", "", "eye")}${btn("Launch session", "launch", "", "play")}${btn(deck ? "Save presentation" : "Save quiz", "save", "primary", "save")}</div></div><form novalidate id="edit" class="studio"><aside class="outline" aria-label="Questions"><h2>Questions</h2><div class="outline-list">${doc.questions
      .map(
        (v, n) =>
          `<div draggable="true" data-index="${n}"><button type="button" class="outline-item" data-action="q-${n}" ${idx === n ? 'aria-current="true"' : ""}><b>${n + 1}</b><span class="outline-text" dir="auto" translate="no">${esc(v.prompt || "Untitled question")}</span><small>${esc(v.type)}</small></button></div>`,
      )
      .join(
        "",
      )}</div><div class="outline-tools">${btn("Add question", "add", "wide", "plus")}<div class="actions">${btn("Move up", "up", "small", "up")}${btn("Move down", "down", "small", "down")}</div>${btn("Duplicate question", "duplicate", "small quiet", "copy")}${btn("Insert from question bank", "pickbank", "small quiet", "bank")}${doc.questions.length > 1 ? btn("Remove question", "remove", "small quiet danger", "trash") : ""}<div id="bankpick" class="stack"></div></div></aside><section class="canvas stack"><div class="fields">${field(deck ? "Presentation title" : "Quiz title", "title", doc.title, "text", 'required maxlength="200" dir="auto"')}${field("Category", "category", doc.category, "text", 'dir="auto"')}</div><div class="canvas-head"><h2>Question ${idx + 1}</h2>${select("Format", "type", types, q.type)}</div><div class="prompt-field">${area("Question (Markdown and $math$ supported)", "prompt", q.prompt, 'dir="auto"')}</div>${pairTypes.includes(q.type) ? matchingFields(q) : optionsTypes.includes(q.type) ? optionFields(q) : ""}${named.includes(q.type) && !keyed[q.type] ? field(q.type === "Image hotspot" ? "Target X,Y,radius (0–100%)" : "Correct answer", "key", q.key, "text", 'dir="auto"') : ""}<label class="filefield">${icon("image")}<span>Question media (shared with participants)</span><input type="file" id="asset" accept="image/*,video/mp4,video/webm,audio/*"></label>${q.asset ? `<div class="row attached"><p><span>Attached</span> <span dir="ltr" translate="no">${esc(q.asset.mime)}</span></p>${btn("Remove attachment", "detach", "small quiet danger", "trash")}</div>` : ""}${area("Explanation", "explanation", q.explanation, 'dir="auto"')}${field("Reference", "reference", q.reference, "text", 'dir="auto"')}<details><summary>${icon("chevron")}<span>Multilingual wording</span></summary><div class="stack">${area("السؤال بالعربية", "arPrompt", q.translations?.ar?.prompt, 'dir="rtl" lang="ar"')}${area("الشرح بالعربية", "arExplanation", q.translations?.ar?.explanation, 'dir="rtl" lang="ar"')}${area("پرسیار بە کوردی", "ckbPrompt", q.translations?.ckb?.prompt, 'dir="rtl" lang="ckb"')}${area("ڕوونکردنەوە بە کوردی", "ckbExplanation", q.translations?.ckb?.explanation, 'dir="rtl" lang="ckb"')}</div></details></section><aside class="inspector stack" aria-label="Question settings"><h2>Question settings</h2>${field("Time limit in seconds (0 for untimed)", "seconds", q.seconds, "number", 'min="0" max="3600"')}${field("Points", "points", q.points, "number", 'min="0" max="10000"')}${select("Difficulty", "difficulty", ["Introductory", "Standard", "Advanced"], q.difficulty || "Standard")}${field("Tags", "tags", q.tags || "", "text", 'dir="auto"')}${select("Answer effect for informal sessions", "effect", ["None", "Float", "Bounce", "Shake", "Run away", "Vertical", "Escape and return", "Random"], q.effect)}<details><summary>${icon("chevron")}<span>Effect settings</span></summary><div class="stack"><p class="hint">Moving a particular answer can hint at the solution. Graded sessions disable these effects.</p>${field("Movements", "moves", q.moves || 1, "number", 'min="1" max="3"')}${field("Intensity", "intensity", q.intensity || 2, "number", 'min="1" max="5"')}${field("Duration (ms)", "duration", q.duration || 450, "number", 'min="150" max="1500"')}${field("Target option index (−1 for all)", "target", q.target ?? -1, "number", 'min="-1" max="11"')}</div></details></aside></form><section class="manage"><details><summary>${icon("chevron")}<span>Import, export and manage quiz</span></summary><div class="stack"><p>Review imported questions in the editor before launching. CSV and Excel columns include prompt, type, options and key. Separate options with |. In Word and PDF, start each question with Q:, list options as A. and B., then add Answer: A. Imported text requires review.</p><label class="filefield">${icon("upload")}<span>Import JSON, CSV, Excel, Word or PDF</span><input type="file" id="import" accept=".json,.csv,.xlsx,.docx,.pdf"></label><div class="actions">${btn("Export quiz JSON", "export", "", "download")}${isExisting ? btn("Duplicate quiz", "copy", "", "copy") + btn("Delete quiz", "delete", "quiet danger", "trash") : ""}</div></div></details></section>${ai.enabled ? `<section class="manage"><form novalidate class="stack" id="ai"><h2>Generate a draft</h2>${area("Learning objective or source text", "topic", "", 'dir="auto"')}${submitButton("Generate for review", "")}</form></section>` : ""}`;
    const f = $("#edit");
    f.onsubmit = (e) => e.preventDefault();
    f.onfocusin = (e) => {
      if (e.target.matches("input,textarea,select")) checkpoint();
    };
    f.oninput = (e) => {
      capture();
      if (e.target.name === "type") {
        if (q.type === "True or false") {
          q.options = ["True", "False"];
          q.key = "True";
        }
        draw();
        $("[name=type]").focus();
      }
      changed();
    };
    // Enter adds a row; pasting a list fills one row per line.
    f.onkeydown = (e) => {
      if (e.key !== "Enter" || !e.target.matches("[data-option]")) return;
      e.preventDefault();
      if (!e.isComposing) $('[data-action="option-add"]')?.click();
    };
    f.onpaste = (e) => {
      if (!e.target.matches("[data-option]") || q.type === "True or false")
        return;
      const lines = e.clipboardData
        .getData("text/plain")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length < 2) return;
      e.preventDefault();
      capture();
      checkpoint();
      const at = all("[data-option]").indexOf(e.target);
      q.options.splice(at, lines.length, ...lines);
      q.options = q.options.slice(0, 12);
      draw();
      changed();
    };
    for (const el of all("[data-index]")) {
      el.ondragstart = () => (drag = Number(el.dataset.index));
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => {
        e.preventDefault();
        if (drag !== null) {
          checkpoint();
          doc.questions.splice(
            Number(el.dataset.index),
            0,
            doc.questions.splice(drag, 1)[0],
          );
          idx = Number(el.dataset.index);
          drag = null;
          draw();
          changed();
        }
      };
    }
    submit("#ai", async (b) => {
      const generated = await api("ai", "POST", b);
      checkpoint();
      Object.assign(doc, generated);
      idx = 0;
      draw();
      draft();
      notice("Review the generated questions before saving.");
    });
    $("#asset").onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        const asset = await api("assets", "POST", fd);
        checkpoint();
        q.asset = asset;
        draw();
        changed();
      } catch (err) {
        notice(err.message, "error");
      }
    };
    $("#import").onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        let next;
        if (file.name.endsWith(".json")) {
          next = JSON.parse(await file.text());
          if (!Array.isArray(next.questions))
            throw Error("Invalid quiz document.");
        } else {
          const data = new FormData();
          data.append("file", file);
          next = {
            questions: await api(
              /\.(docx|pdf)$/i.test(file.name) ? "import/document" : "import",
              "POST",
              data,
            ),
          };
        }
        if (!next.questions.length || next.questions.length > 200)
          throw Error("Use 1–200 questions.");
        const cleaned = next.questions.map((v) => ({
          ...fresh(),
          ...v,
          options: Array.isArray(v.options) ? v.options.map(String) : [],
        }));
        checkpoint();
        Object.assign(doc, {
          title: next.title || doc.title,
          category: next.category || doc.category,
          questions: cleaned,
        });
        idx = 0;
        draw();
        changed();
        notice("Imported into draft for review.");
      } catch (err) {
        notice(err.message, "error");
      }
    };
    actions(async (a) => {
      capture();
      if (a.startsWith("q-")) {
        idx = Number(a.slice(2));
        draw();
        return;
      }
      if (a === "pickbank") {
        const qs = await api("quizzes");
        $("#bankpick").innerHTML = qs.length
          ? select(
              "Source quiz",
              "source",
              qs.map((v) => [v.id, v.title]),
            ) + btn("Show questions", "picksource")
          : '<p class="hint">Your question bank is empty.</p>';
        return;
      }
      if (a === "picksource") {
        const source = await api("quizzes/" + $("[name=source]").value);
        $("#bankpick").innerHTML =
          select(
            "Question to insert",
            "bankIndex",
            source.document.map((q, i) => [String(i), q.prompt]),
          ) + btn("Insert question", "insert-bank");
        $("#bankpick").dataset.source = source.id;
        return;
      }
      if (a === "insert-bank") {
        const source = await api("quizzes/" + $("#bankpick").dataset.source);
        checkpoint();
        doc.questions.splice(
          ++idx,
          0,
          structuredClone(source.document[Number($("[name=bankIndex]").value)]),
        );
        draw();
        changed();
        return;
      }
      if (a === "pair-add") {
        checkpoint();
        q.options.push("|");
        draw();
        changed();
        return;
      }
      if (a.startsWith("pair-remove-")) {
        checkpoint();
        q.options.splice(Number(a.slice(12)), 1);
        draw();
        changed();
        return;
      }
      if (a === "option-add") {
        checkpoint();
        while (q.options.length < 2) q.options.push("");
        q.options.push("");
        draw();
        all("[data-option]").at(-1).focus();
        changed();
        return;
      }
      if (a.startsWith("option-remove-")) {
        checkpoint();
        const [gone] = q.options.splice(Number(a.slice(14)), 1);
        if (gone && keyed[q.type])
          q.key = (q.key || "")
            .split("|")
            .filter((k) => k !== gone)
            .join("|");
        draw();
        changed();
        return;
      }
      if (a.startsWith("option-up-")) {
        checkpoint();
        const at = Number(a.slice(10));
        q.options.splice(at - 1, 0, q.options.splice(at, 1)[0]);
        draw();
        all("[data-option]")[at - 1].focus();
        changed();
        return;
      }
      if (a === "detach") {
        checkpoint();
        q.asset = null;
        draw();
        changed();
        return;
      }
      if (a === "save" || a === "launch") {
        await persist();
        notice("Quiz saved.");
        go((a === "launch" ? "launch/" : editorRoute) + key);
        return;
      }
      if (a === "export") {
        saveFile("quiz.json", JSON.stringify(doc, null, 2));
        return;
      }
      if (a === "copy") {
        const out = await api("quizzes", "POST", {
          ...doc,
          title: doc.title + " (copy)",
        });
        go(editorRoute + out.id);
        return;
      }
      if (a === "delete") {
        if (
          !(await confirmAction(
            "Delete this quiz?",
            "It leaves the library. Existing sessions retain their questions.",
            "Delete quiz",
          ))
        )
          return;
        clearTimeout(pending);
        await api("quizzes/" + key, "DELETE");
        localStorage.removeItem(local);
        go(deck ? "presentations" : "library");
        return;
      }
      if (a === "preview") {
        const dialog = document.createElement("dialog");
        dialog.className = "dialog preview";
        dialog.setAttribute("aria-label", "Participant preview");
        dialog.innerHTML = `<form method="dialog" novalidate><div class="row"><p class="chip">Participant preview</p><button class="icon-button" aria-label="Close preview">${icon("close")}</button></div><h2 class="prompt" dir="auto" translate="no">${esc(q.prompt)}</h2><div class="answers">${q.options
          .filter(Boolean)
          .map(
            (o, n) =>
              `<div class="answer tone${n % 4}"><span class="key">${mark(n)}</span><span class="label" dir="auto" translate="no">${esc(pairTypes.includes(q.type) ? o.replace("|", " – ") : o)}</span></div>`,
          )
          .join("")}</div></form>`;
        dialog.onclose = () => {
          dialog.remove();
          $('[data-action="preview"]')?.focus();
        };
        dialog.onclick = (e) => {
          if (e.target === dialog) dialog.close();
        };
        document.body.append(dialog);
        dialog.showModal();
        return;
      }
      if (a === "undo" || a === "redo") {
        const src = a === "undo" ? past : future,
          dst = a === "undo" ? future : past;
        if (!src.length) return;
        dst.push(JSON.stringify(doc));
        Object.assign(doc, JSON.parse(src.pop()));
      } else {
        checkpoint();
        if (a === "add" || a === "duplicate") {
          doc.questions.splice(
            ++idx,
            0,
            a === "add"
              ? { ...fresh(), type: deck ? "Slide" : "Single choice" }
              : structuredClone(q),
          );
        } else if (a === "remove") doc.questions.splice(idx, 1);
        else if (a === "up" || a === "down") {
          const dest = idx + (a === "up" ? -1 : 1);
          if (dest >= 0 && dest < doc.questions.length) {
            doc.questions.splice(dest, 0, doc.questions.splice(idx, 1)[0]);
            idx = dest;
          }
        }
      }
      draw();
      changed();
    });
  }
  draw();
}
async function bank() {
  const list = await api("quizzes"),
    docs = await Promise.all(list.map((q) => api("quizzes/" + q.id)));
  main.innerHTML = `${pageHead("Question bank")}<div class="toolbar">${field("Search questions", "search", "", "search")}</div><div id="items" aria-live="polite"></div>`;
  const draw = () => {
    const query = $("[name=search]").value.toLowerCase();
    const rows = docs.flatMap((d) =>
      d.document
        .filter((q) => q.prompt.toLowerCase().includes(query))
        .map(
          (q) =>
            `<div class="listitem"><div><strong translate="no" dir="auto">${esc(q.prompt)}</strong><p class="meta"><span>${esc(q.type)}</span><span translate="no" dir="auto">${esc(d.title)}</span></p></div>${link("Open source quiz", (d.kind === "presentation" ? "#/presentation/" : "#/editor/") + d.id, "button small")}</div>`,
        ),
    );
    $("#items").innerHTML = rows.length
      ? capped(rows)
      : docs.length
        ? empty("No matching questions.")
        : empty(
            "Questions you write in quizzes collect here.",
            link("Create quiz", "#/editor", "button primary", "plus"),
          );
  };
  $("[name=search]").oninput = draw;
  draw();
}
export { editor, bank };
