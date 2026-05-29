const CACHE_NAME = "board-games-v61";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=61",
  "./manifest.webmanifest?v=1",
  "./favicon.ico?v=2",
  "./assets/icons/icon-152.png?v=1",
  "./assets/icons/icon-167.png?v=1",
  "./assets/icons/icon-180.png?v=1",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./i18n/en.js?v=61",
  "./i18n/ru.js?v=61",
  "./i18n/tr.js?v=61",
  "./vendor/chess.js/chess.global.js?v=61",
  "./vendor/chess-pieces/cburnett.js?v=61",
  "./games/checkers/rules.js?v=61",
  "./games/checkers/engine.js?v=61",
  "./games/chess/rules.js?v=61",
  "./games/chess/engine.js?v=61",
  "./games/chess/stockfish-adapter.js?v=61",
  "./games/registry.js?v=61",
  "./config.js?v=61",
  "./app.js?v=61"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/vendor/stockfish/stockfish.wasm")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
