const version = "chorusroom-shell-v6";
const shell = [
  "/",
  "/style.css",
  "/ui.js",
  "/shared.js",
  "/editor.js",
  "/live.js",
  "/engagement.js",
  "/admin.js",
  "/locale.js",
  "/preferences.js",
  "/translations.js",
  "/translations-extra.js",
  "/translations-redesign.js",
  "/theme.js",
  "/icons.js",
  "/room.js",
  "/fonts/lexend-latin-wght-normal.woff2",
  "/fonts/kufam-latin-wght-normal.woff2",
  "/fonts/vazirmatn-arabic-wght-normal.woff2",
  "/fonts/kufam-arabic-wght-normal.woff2",
  "/mark.svg",
  "/manifest.json",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(version)
      .then((cache) => cache.addAll(shell))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("chorusroom-shell-") && key !== version,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !shell.includes(url.pathname)
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(version);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
