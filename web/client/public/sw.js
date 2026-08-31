/**
 * Service worker for the trip concierge.
 *
 * Visitors use this on foreign eSIMs, in subway tunnels, and on hotel wifi that
 * drops — so the shell has to open without the network, and the app has to say
 * "you're offline" rather than sit on a spinner.
 *
 * Two strategies, deliberately different:
 *   - the HTML document is network-first, so a deploy is picked up on the next
 *     load rather than being pinned by a stale cache;
 *   - hashed assets are cache-first, because their names change when they do.
 * Chat requests are never cached: an answer about what is open right now is
 * wrong the moment it is stale.
 */

const VERSION = "ktc-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data only

  // The page itself: fresh when we can, cached when we can't.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit ?? caches.match("/"))),
    );
    return;
  }

  // Hashed build assets and icons never change under the same name.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".png"))) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
