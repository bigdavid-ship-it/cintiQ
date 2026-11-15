const STATIC_CACHE = "cintiq-static-v2";
const STATIC_ASSETS = ["/", "/explore", "/categories", "/icon.svg"];
const IS_LOCALHOST = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

// Never cache private, authenticated, payment, or API routes.
const PRIVATE_PREFIXES = [
  "/api/",
  "/account",
  "/cart",
  "/checkout",
  "/orders",
  "/seller",
  "/admin",
  "/login",
  "/register",
  "/auth/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  // Never cache dev server assets on localhost so CSS/JS hot-reloads work cleanly
  if (IS_LOCALHOST) return;

  // Cache-first for immutable Next static assets and icons
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first for public navigation pages
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(req) || caches.match("/")));
  }
});

// Native phone/desktop push notification handler
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "cintiQ";
  const options = {
    body: data.body || "You have a new update on cintiQ.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: data.link || "/account/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/account/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
