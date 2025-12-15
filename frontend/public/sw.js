// Service Worker for ReviseIt PWA
// Enhanced caching with separate strategies for different asset types

const CACHE_VERSION = "v2";
const STATIC_CACHE = `reviseit-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `reviseit-images-${CACHE_VERSION}`;
const FONT_CACHE = `reviseit-fonts-${CACHE_VERSION}`;

// Static assets to precache
const STATIC_ASSETS = [
  "/",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/manifest.webmanifest",
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
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
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
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - intelligent caching strategies
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip authentication and API requests entirely
  if (shouldExcludeFromCache(url)) return;

  // Handle font requests (cache-first, long expiry)
  if (
    url.includes("fonts.googleapis.com") ||
    url.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Handle image requests (cache-first)
  if (
    url.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/) ||
    url.includes("/images/")
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Handle same-origin requests (network-first with cache fallback)
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});
