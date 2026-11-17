const STATIC_CACHE = "cintiq-static-v3";
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
          fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
              }
              return res;
            })
            .catch(() => Response.error()),
      ),
    );
    return;
  }

  // Network-first for public navigation pages, with safe fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cachedPage = await caches.match(req);
        if (cachedPage) return cachedPage;
        const cachedHome = await caches.match("/");
        if (cachedHome) return cachedHome;
        return new Response(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection issue · cintiQ</title><style>body{font-family:system-ui,sans-serif;background:#fafaf7;color:#12161c;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}.card{max-width:360px;background:#fff;border:1px solid #e2e0d8;border-radius:14px;padding:24px}button{margin-top:16px;background:#0e5c63;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:600;cursor:pointer}</style></head><body><div class="card"><h2>Could not load this page</h2><p style="font-size:14px;color:#5d6572">Please check your internet connection and tap below to retry.</p><button onclick="window.location.reload()">Reload page</button></div></body></html>`,
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }),
    );
  }
});

// Native Android / iPhone / Desktop push notification handler
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "cintiQ";
  const options = {
    body: data.body || "You have a new update on cintiQ.",
    icon: "/cintiq-logo.png",
    badge: "/cintiq-logo.png",
    tag: data.tag || `cintiq-${Date.now()}`,
    renotify: true,
    data: { url: data.link || "/account/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/account/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          try {
            if ("navigate" in client) await client.navigate(targetUrl);
          } catch {}
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
