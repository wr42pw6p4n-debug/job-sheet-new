const CACHE = "rkey-job-manager-v8";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./logo-header.png", "./watermark.png"];

// Live lookups (mileage). These must always go straight to the network: caching them would let a
// single temporary error be replayed forever, and would fill the device with one-off answers.
const LIVE_API_HOSTS = ["api.postcodes.io", "router.project-osrm.org"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Precache each asset independently — if one fails (missing file, blip, etc.)
      // the whole update no longer silently fails to install.
      Promise.all(ASSETS.map(url => cache.add(url).catch(err => console.warn("Precache skipped for", url, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (LIVE_API_HOSTS.includes(new URL(event.request.url).hostname)) return; // straight to the network

  const isPage = event.request.mode === "navigate" || event.request.destination === "document";
  if (isPage) {
    // Always try to get the latest index.html from the network first, so a new
    // upload shows up immediately next time the app is opened. Only fall back to
    // the cached copy if there's no connection at all.
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // Static assets (icons, logo, watermark, PDF libraries): serve the cached copy immediately for
  // speed, but always fetch a fresh copy in the background and update the cache for next time.
  // Only successful responses are ever stored, so a failed download can't replace a good copy.
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
