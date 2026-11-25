// Runs before first paint so theme, direction and text size never flash.
(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem("theme");
    if (
      theme === "dark" ||
      (!theme && matchMedia("(prefers-color-scheme: dark)").matches)
    )
      root.classList.add("dark");
    var locale = localStorage.getItem("chorus.locale");
    if (locale === "ar" || locale === "ckb") {
      root.lang = locale;
      root.dir = "rtl";
    }
    var size = Number(localStorage.getItem("chorus.fontSize") || 100);
    if (size >= 80 && size <= 150) root.style.fontSize = size + "%";
  } catch (error) {
    /* Storage can be unavailable; defaults stay readable. */
  }
})();
