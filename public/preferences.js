import { extra } from "./translations-extra.js";
import { copy } from "./translations.js";
import { locale } from "./locale.js";
import { icon } from "./icons.js";
import { redesign, phrases } from "./translations-redesign.js";

const originals = new WeakMap();
const dictionary = new Map(
  [...copy, ...extra, ...redesign].map((row) => [row[0], row]),
);
function translate(value) {
  const index = ["en", "ar", "ckb"].indexOf(locale());
  const trimmed = value.trim();
  const row = dictionary.get(trimmed);
  if (row) return value.replace(trimmed, row[index]);
  const patterns = [
    ...phrases,
    [/^Pair (\d+)$/, ["Pair $1", "الزوج $1", "جووتی $1"]],
    [/^Question (\d+)$/, ["Question $1", "السؤال $1", "پرسیاری $1"]],
    [/^(\d+) questions$/, ["$1 questions", "$1 أسئلة", "$1 پرسیار"]],
    [
      /^Welcome back, (.+)\. Prepare your next activity or bring a quiz to the room\.$/,
      [
        "Welcome back, $1. Prepare your next activity or bring a quiz to the room.",
        "مرحباً بعودتك، $1. حضّر نشاطك التالي أو قدّم اختباراً للمشاركين.",
        "بەخێربێیتەوە، $1. چالاکییەکەی داهاتووت ئامادە بکە یان تاقیکردنەوەیەک پێشکەش بکە.",
      ],
    ],
  ];
  for (const [pattern, translations] of patterns) {
    if (pattern.test(trimmed))
      return value.replace(
        trimmed,
        trimmed.replace(pattern, translations[index]),
      );
  }
  const match = /^([＋↑↓←]?\s*)(.*?)(\s*[→↗])$/.exec(trimmed);
  if (match && dictionary.has(match[2]))
    return match[1] + dictionary.get(match[2])[index] + match[3];
  return value;
}
function applyLanguage() {
  document.documentElement.lang = locale();
  document.documentElement.dir = locale() === "en" ? "ltr" : "rtl";
  const main = document.querySelector("main");
  main.lang = locale();
  main.dir = document.documentElement.dir;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (
      node.parentElement.closest(
        'script,style,textarea,[translate="no"],.brand,#preferences-slot',
      )
    )
      continue;
    const prior = originals.get(node);
    const source =
      prior && node.nodeValue === prior.translated
        ? prior.source
        : node.nodeValue;
    const translated = translate(source);
    originals.set(node, { source, translated });
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }
  for (const el of document.querySelectorAll("[placeholder],[aria-label]")) {
    for (const name of ["placeholder", "aria-label"]) {
      if (!el.hasAttribute(name)) continue;
      const key = "data-original-" + name;
      if (!el.hasAttribute(key)) el.setAttribute(key, el.getAttribute(name));
      el.setAttribute(name, translate(el.getAttribute(key)));
    }
  }
  document.querySelector("#global-language").value = locale();
  for (const el of document.querySelectorAll("#preferences-slot [data-label]"))
    el.setAttribute("aria-label", translate(el.dataset.label));
  document
    .querySelector("#font-controls")
    .setAttribute("aria-label", translate("Font size"));
}
let stored = Number(localStorage.getItem("chorus.fontSize") || 100);
let fontSize = Number.isFinite(stored)
  ? Math.max(80, Math.min(150, stored))
  : 100;
function applySize() {
  document.documentElement.style.fontSize = fontSize + "%";
  document.documentElement.style.setProperty(
    "--text-scale",
    String(fontSize / 100),
  );
  document.querySelector("#font-level").textContent =
    new Intl.NumberFormat(locale()).format(fontSize) + "%";
  document.querySelector("#font-decrease").disabled = fontSize <= 80;
  document.querySelector("#font-increase").disabled = fontSize >= 150;
  localStorage.setItem("chorus.fontSize", String(fontSize));
}
function initializePreferences() {
  const slot = document.querySelector("#preferences-slot");
  slot.innerHTML = `<button type="button" id="preferences-toggle" class="icon-button" data-label="Display preferences" aria-expanded="false" aria-controls="preferences">${icon("sliders")}</button><div id="preferences"><label class="language">${icon("globe")}<span class="sr">Language · اللغة · زمان</span><select id="global-language"><option value="en">English</option><option value="ar">العربية</option><option value="ckb">کوردیی سۆرانی</option></select></label><div id="font-controls" role="group"><button type="button" id="font-decrease" data-label="Decrease font size">${icon("minus")}</button><output id="font-level" aria-live="polite"></output><button type="button" id="font-increase" data-label="Increase font size">${icon("plus")}</button></div><label class="theme"><input id="theme" type="checkbox" role="switch" data-label="Dark theme"><span aria-hidden="true">${icon("sun")}${icon("moon")}</span></label></div>`;
  const toggle = document.querySelector("#preferences-toggle"),
    open = (state) => {
      slot.classList.toggle("open", state);
      toggle.setAttribute("aria-expanded", String(state));
    };
  toggle.onclick = () => open(!slot.classList.contains("open"));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#preferences-slot")) open(false);
  });
  slot.onkeydown = (e) => {
    if (e.key === "Escape" && slot.classList.contains("open")) {
      open(false);
      toggle.focus();
    }
  };
  const theme = document.querySelector("#theme");
  theme.checked = document.documentElement.classList.contains("dark");
  theme.onchange = () => {
    document.documentElement.classList.toggle("dark", theme.checked);
    localStorage.theme = theme.checked ? "dark" : "light";
  };
  document.querySelector("#global-language").onchange = (event) => {
    localStorage.setItem("chorus.locale", event.target.value);
    location.reload();
  };
  for (const [id, delta] of [
    ["font-increase", 10],
    ["font-decrease", -10],
  ])
    document.getElementById(id).onclick = () => {
      fontSize = Math.max(80, Math.min(150, fontSize + delta));
      applySize();
    };
  applySize();
  applyLanguage();
  const observer = new MutationObserver(() => {
    observer.disconnect();
    applyLanguage();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
export { initializePreferences, translate as t };
