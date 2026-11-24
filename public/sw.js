// Offline shell: the app opens without a connection after the first visit.
// API calls are never cached; the app keeps its own data in localStorage.
// Paths are relative to the worker's scope, so it works at "/" and at "/life-manager/".
const CACHE = "lm-shell-v2";
const SCOPE = self.registration.scope; // e.g. https://denmokin.github.io/life-manager/

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([SCOPE, SCOPE + "manifest.webmanifest", SCOPE + "icon.svg"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only this app's own files; the API (another origin, or /api locally) always goes to the network.
  if (event.request.method !== "GET" || !url.href.startsWith(SCOPE) || url.pathname.includes("/api/")) return;

  // Pages: try the network for the newest version, fall back to the cached shell.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SCOPE, copy));
          return res;
        })
        .catch(() => caches.match(SCOPE)),
    );
    return;
  }

  // Hashed build assets and icons: cache first, they never change.
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        }),
    ),
  );
});
