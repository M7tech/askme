const messages = {
  join: ["Join session", "انضم إلى الجلسة", "بەشداری لە دانیشتنەکە بکە"],
  name: ["Your name", "اسمك", "ناوت"],
  team: ["Team name", "اسم الفريق", "ناوی تیم"],
  phrase: ["Access phrase", "عبارة الدخول", "وشەی چوونەژوورەوە"],
  anonymous: [
    "You will join with a guest nickname.",
    "ستنضم باسم ضيف مستعار.",
    "بە ناوێکی خوازراوی میوانەوە بەشدار دەبیت.",
  ],
  consent: [
    "I consent to private session photographs. I can withdraw consent in the gallery.",
    "أوافق على التصوير الخاص بالجلسة. يمكنني سحب موافقتي من معرض الصور.",
    "ڕەزامەندم بە وێنەگرتنی تایبەت لەم دانیشتنەدا. دەتوانم لە پێشانگای وێنەکان ڕەزامەندیم بکشێنمەوە.",
  ],
  continue: [
    "Continue participation",
    "تابع المشاركة",
    "بەردەوام بە لە بەشداریکردن",
  ],
  results: ["My private results", "نتائجي الخاصة", "ئەنجامە تایبەتەکانم"],
  session: ["Session", "الجلسة", "دانیشتن"],
  wait: [
    "Waiting for the presenter",
    "في انتظار المقدّم",
    "چاوەڕوانی پێشکەشکارین",
  ],
  joined: [
    "You’re in. The first question will appear here.",
    "تم انضمامك. سيظهر السؤال الأول هنا.",
    "بەشدار بوویت. یەکەم پرسیار لێرە دەردەکەوێت.",
  ],
  ended: ["Session complete", "انتهت الجلسة", "دانیشتنەکە کۆتایی هات"],
  question: ["Question", "السؤال", "پرسیار"],
  of: ["of", "من", "لە"],
  rating: ["Your rating", "تقييمك", "هەڵسەنگاندنت"],
  response: ["Your response", "إجابتك", "وەڵامت"],
  send: ["Submit response", "أرسل الإجابة", "وەڵام بنێرە"],
  recorded: ["Response recorded", "تم تسجيل الإجابة", "وەڵامەکە تۆمار کرا"],
  answer: ["Answer", "الإجابة", "وەڵام"],
  feedback: [
    "Feedback released",
    "الملاحظات متاحة",
    "تێبینییەکان بڵاو کرانەوە",
  ],
  stats: ["Response distribution", "توزيع الإجابات", "دابەشبوونی وەڵامەکان"],
  fullscreen: ["Full screen", "ملء الشاشة", "پڕ بە شاشە"],
  previous: ["Previous", "السابق", "پێشوو"],
  next: ["Next question", "السؤال التالي", "پرسیاری داهاتوو"],
  gallery: ["Photo gallery", "معرض الصور", "پێشانگای وێنەکان"],
  qa: ["Audience Q&A", "أسئلة الجمهور", "پرسیار و وەڵامی بەشداربووان"],
  ask: ["Ask the presenter", "اسأل المقدّم", "پرسیار لە پێشکەشکار بکە"],
  moderate: ["Submit for moderation", "أرسل للمراجعة", "بۆ پێداچوونەوە بینێرە"],
  selected: ["Selected", "المحدد", "هەڵبژێردراو"],
  participants: ["participants", "مشاركين", "بەشداربوو"],
  responses: ["responses", "إجابات", "وەڵام"],
  empty: [
    "No approved questions yet.",
    "لا توجد أسئلة معتمدة بعد.",
    "هێشتا هیچ پرسیارێک پەسەند نەکراوە.",
  ],
  privateReport: [
    "Private participant report",
    "تقرير المشارك الخاص",
    "ڕاپۆرتی تایبەتی بەشداربوو",
  ],
  bookmark: [
    "Bookmark this private link to revisit released answers.",
    "احفظ هذا الرابط الخاص للاطلاع لاحقاً على الإجابات المتاحة.",
    "ئەم بەستەرە تایبەتە پاشەکەوت بکە بۆ بینینەوەی وەڵامە بڵاوکراوەکان.",
  ],
  byQuestion: [
    "Results by question",
    "النتائج حسب السؤال",
    "ئەنجامەکان بە پێی پرسیار",
  ],
  points: ["points", "نقاط", "خاڵ"],
  print: ["Print report", "اطبع التقرير", "ڕاپۆرت چاپ بکە"],
  unanswered: ["Unanswered", "بلا إجابة", "بێ وەڵام"],
  pending: [
    "Answer release pending or disabled",
    "عرض الإجابة مؤجّل أو غير مفعّل",
    "بڵاوکردنەوەی وەڵام دوا خراوە یان ناچالاکە",
  ],
  correct: ["Correct", "صحيح", "ڕاست"],
  incorrect: ["Incorrect", "غير صحيح", "هەڵە"],
  reviewed: ["Reviewed", "تمت المراجعة", "پێداچوونەوە کرا"],
  seconds: ["seconds", "ثوانٍ", "چرکە"],
  leaderboard: ["Leaderboard", "لوحة المتصدرين", "ڕیزبەندی"],
  certificate: [
    "Certificate of completion",
    "شهادة إتمام",
    "بڕوانامەی تەواوکردن",
  ],
  completed: ["Completed", "أتمّ", "تەواوی کرد"],
  pin: ["PIN", "رمز المشاركة", "کۆدی بەشداری"],
  votes: ["votes", "أصوات", "دەنگ"],
  awaiting: [
    "Sent to presenter for approval.",
    "أُرسل إلى المقدّم للموافقة.",
    "بۆ پەسەندکردن نێردرا بۆ پێشکەشکار.",
  ],
};
const locales = ["en", "ar", "ckb"];
function locale() {
  return locales.includes(localStorage.getItem("chorus.locale"))
    ? localStorage.getItem("chorus.locale")
    : "en";
}
const tr = (k) => messages[k]?.[locales.indexOf(locale())] || k;
const num = (n) => new Intl.NumberFormat(locale()).format(n);
function chooseLanguage() {
  return (
    '<label class="language">Language · اللغة · زمان<select id="language">' +
    [
      ["en", "English"],
      ["ar", "العربية"],
      ["ckb", "کوردیی سۆرانی"],
    ]
      .map(
        ([k, v]) =>
          '<option value="' +
          k +
          '" ' +
          (locale() === k ? "selected" : "") +
          ">" +
          v +
          "</option>",
      )
      .join("") +
    "</select></label>"
  );
}
function bindLanguage() {
  const el = document.querySelector("#language");
  if (!el) return;
  const content = document.querySelector("main");
  content.lang = locale();
  content.dir = locale() === "en" ? "ltr" : "rtl";
  el.onchange = () => {
    localStorage.setItem("chorus.locale", el.value);
    location.reload();
  };
}
export { tr, num, locale, chooseLanguage, bindLanguage };
