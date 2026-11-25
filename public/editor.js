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
    if (v.options !== undefined)
      q.options = v.options.split("\n").map((s) => s.trim());
    if (v.key !== undefined) q.key = v.key;
  }
  function draft() {
    localStorage.setItem(local, JSON.stringify({ doc, version: version || 0 }));
  }
  async function persist() {
    clearTimeout(pending);
    const payload = structuredClone(doc),
      rev = update;
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
    main.innerHTML =
      tabs(deck ? "presentations" : "library") +
      `<div class="row">${title(deck ? "Presentation studio" : "Quiz studio")}<span class="pill" id="saved">${version ? "Saved quiz" : "Local draft"}</span></div><div class="actions">${btn(deck ? "Save presentation" : "Save quiz", "save", "primary")}${btn("Launch session →", "launch")}${btn("Undo", "undo")}${btn("Redo", "redo")}${btn("Preview", "preview")}</div><form novalidate id="edit"><div class="panel fields">${field(deck ? "Presentation title" : "Quiz title", "title", doc.title, "text", 'required maxlength="200"')}${field("Category", "category", doc.category)}</div><div class="split"><section class="panel stack"><div class="row"><h2>Question ${idx + 1}</h2>${select("Format", "type", types, q.type)}</div>${area("Question (Markdown and $math$ supported)", "prompt", q.prompt)}<label>Question media (shared with participants)<input type="file" id="asset" accept="image/*,video/mp4,video/webm,audio/*"></label>${q.asset ? "<p>Attached " + esc(q.asset.mime) + "</p>" + btn("Remove attachment", "detach") : ""}${optionsTypes.includes(q.type) ? area(["Matching", "Drag and drop"].includes(q.type) ? "One label|target pair per line" : q.type === "Ordering" ? "Options in correct order, one per line" : "Answer options, one per line", "options", q.options.join("\n")) : ""}${["Single choice", "Multiple choice", "True or false", "Text answer", "Fill in the blank", "Numeric", "Image hotspot"].includes(q.type) ? field(q.type === "Image hotspot" ? "Target X,Y,radius (0–100%)" : q.type === "Multiple choice" ? "Correct options, separated by |" : "Correct answer", "key", q.key) : ""}<div class="fields">${field("Time limit in seconds (0 for untimed)", "seconds", q.seconds, "number", 'min="0" max="3600"')}${field("Points", "points", q.points, "number", 'min="0" max="10000"')}</div>${area("Explanation", "explanation", q.explanation)}${field("Reference", "reference", q.reference)}<details><summary>Multilingual wording</summary><div class="stack">${area("السؤال بالعربية", "arPrompt", q.translations?.ar?.prompt)}${area("الشرح بالعربية", "arExplanation", q.translations?.ar?.explanation)}${area("پرسیار بە کوردی", "ckbPrompt", q.translations?.ckb?.prompt)}${area("ڕوونکردنەوە بە کوردی", "ckbExplanation", q.translations?.ckb?.explanation)}</div></details>${select("Answer effect for informal sessions", "effect", ["None", "Float", "Bounce", "Shake", "Run away", "Vertical", "Escape and return", "Random"], q.effect)}<details><summary>Effect settings</summary><p>Moving a particular answer can hint at the solution. Graded sessions disable these effects.</p><div class="fields">${field("Movements", "moves", q.moves || 1, "number", 'min="1" max="3"')}${field("Intensity", "intensity", q.intensity || 2, "number", 'min="1" max="5"')}${field("Duration (ms)", "duration", q.duration || 450, "number", 'min="150" max="1500"')}${field("Target option index (−1 for all)", "target", q.target ?? -1, "number", 'min="-1" max="11"')}</div></details>${select("Difficulty", "difficulty", ["Introductory", "Standard", "Advanced"], q.difficulty || "Standard")}${field("Tags", "tags", q.tags || "")}</section><aside class="panel stack"><h2>Questions</h2><div class="list">${doc.questions.map((v, n) => `<div draggable="true" data-index="${n}">${btn(n + 1 + ". " + (v.prompt || "Untitled question"), "q-" + n, idx === n ? "primary" : "")}</div>`).join("")}</div>${btn("＋ Add question", "add")}${btn("Duplicate question", "duplicate")}<div class="actions">${btn("↑ Move", "up")}${btn("↓ Move", "down")}</div>${doc.questions.length > 1 ? btn("Remove question", "remove", "danger") : ""}${btn("Insert from question bank", "pickbank")}<div id="bankpick"></div></aside></div></form><section class="panel"><details><summary>Import, export and manage quiz</summary><div class="stack"><p>Review imported questions in the editor before launching. CSV and Excel columns include prompt, type, options and key. Separate options with |. In Word and PDF, start each question with Q:, list options as A. and B., then add Answer: A. Imported text requires review.</p><label>Import JSON, CSV, Excel, Word or PDF<input type="file" id="import" accept=".json,.csv,.xlsx,.docx,.pdf"></label><div class="actions">${btn("Export quiz JSON", "export")}${isExisting ? btn("Duplicate quiz", "copy") + btn("Delete quiz", "delete", "danger") : ""}</div><div id="confirm"></div></div></details></section>${ai.enabled ? '<section class="panel"><form novalidate class="stack" id="ai"><h2>Generate a draft</h2>' + area("Learning objective or source text", "topic") + "<button>Generate for review</button></form></section>" : ""}<div id="preview"></div>`;
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
      }
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
        notice(err.message);
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
        notice(err.message);
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
          : "<p>Your question bank is empty.</p>";
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
        $("#confirm").innerHTML =
          "<p>Delete this quiz from the library? Existing sessions retain their questions.</p>" +
          btn("Confirm deletion", "confirm-delete", "danger");
        return;
      }
      if (a === "confirm-delete") {
        clearTimeout(pending);
        await api("quizzes/" + key, "DELETE");
        localStorage.removeItem(local);
        go(deck ? "presentations" : "library");
        return;
      }
      if (a === "preview") {
        $("#preview").innerHTML =
          `<section class="stage panel"><span class="pill">Participant preview</span><h1>${esc(q.prompt)}</h1><div class="answers">${q.options
            .filter(Boolean)
            .map(
              (s, n) =>
                `<div class="button answer tone${n % 4}">${esc(s)}</div>`,
            )
            .join("")}</div></section>`;
        $("#preview").scrollIntoView();
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
  main.innerHTML =
    tabs("bank") +
    title("Question bank") +
    `<div class="panel stack">${field("Search questions", "search", "", "search")}<div class="list" id="items"></div></div>`;
  const draw = () => {
    $("#items").innerHTML =
      docs
        .flatMap((d) =>
          d.document
            .filter((q) =>
              q.prompt
                .toLowerCase()
                .includes($("[name=search]").value.toLowerCase()),
            )
            .map(
              (q) =>
                `<div class="listitem"><div><strong>${esc(q.prompt)}</strong><p>${esc(d.title)} · ${esc(q.type)}</p></div>${link("Open source quiz", "#/editor/" + d.id)}</div>`,
            ),
        )
        .join("") || "<p>No matching questions.</p>";
  };
  $("[name=search]").oninput = draw;
  draw();
}
export { editor, bank };
