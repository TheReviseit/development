// Service Worker for ReviseIt PWA
// Enhanced caching with separate strategies for different asset types

const CACHE_VERSION = "v3";
const STATIC_CACHE = `reviseit-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `reviseit-images-${CACHE_VERSION}`;
const FONT_CACHE = `reviseit-fonts-${CACHE_VERSION}`;

// Static assets to precache (only files that definitely exist)
const STATIC_ASSETS = [
  "/",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/offline",
];

// URLs to never cache (authentication, API calls)
const NEVER_CACHE = [
  "firebase",
  "firebaseapp",
  "googleapis.com/identitytoolkit",
  "securetoken.googleapis.com",
  "accounts.google.com",
  "__/auth",
  "/api/",
  "supabase.co",
];

// Check if URL should be excluded from caching
function shouldExcludeFromCache(url) {
  return NEVER_CACHE.some((pattern) => url.includes(pattern));
}

// Install event - precache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        // Use addAll with error handling for each item
        return Promise.allSettled(
          STATIC_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`Failed to cache ${url}:`, err);
            })
          )
        );
      })
      .then(() => {
        console.log("SW installed, static assets cached");
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete caches that don't match current version
            return (
              name.startsWith("reviseit-") && !name.includes(CACHE_VERSION)
            );
          })
          .map((name) => {
            console.log("Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - intelligent caching strategies
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const request = event.request;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip authentication and API requests entirely
  if (shouldExcludeFromCache(url)) return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.startsWith("http")) return;

  // Handle navigation requests (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline - try cache first, then offline page
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match("/offline");
          });
        })
    );
    return;
  }

  // Handle font requests (cache-first, long expiry)
  if (
    url.includes("fonts.googleapis.com") ||
    url.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              if (response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
        });
      })
    );
    return;
  }

  // Handle image requests (stale-while-revalidate)
  if (
    url.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/) ||
    url.includes("/images/")
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => null);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Handle other same-origin requests (network-first with cache fallback)
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
  }
});

// Handle messages from the client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
