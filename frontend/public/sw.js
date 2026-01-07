self.addEventListener("push", (event) => {
  console.log("🔔 Native push event received:", event);

  if (!event.data) {
    console.warn("Push event has no data");
    return;
  }

  let payload;
  try {
    payload = event.data.json();
    console.log("📦 Push payload:", payload);
  } catch (e) {
    console.warn("Could not parse push data as JSON:", e);
    payload = {
      notification: { title: "New Message", body: event.data.text() },
    };
  }

  // Extract notification data (FCM format)
  // FCM sends: { notification: {title, body}, data: {...} }
  const notification = payload.notification || {};
  const data = payload.data || {};

  // FCM may also send fcmOptions with link
  const fcmOptions = payload.fcmOptions || {};

  const title = notification.title || data.title || "ReviseIt - New Message";
  const body = notification.body || data.body || "You have a new message";
  const icon = notification.icon || data.icon || "/logo-circle.png";

  // Build URL for click action
  let clickUrl = fcmOptions.link || data.url || "/dashboard/messages";
  if (data.conversationId) {
    clickUrl = `/dashboard/messages?conversation=${data.conversationId}`;
  }

  const options = {
    body,
    icon,
    badge: "/logo-circle.png",
    tag: data.conversationId || "message",
    data: {
      url: clickUrl,
      conversationId: data.conversationId,
      senderPhone: data.senderPhone,
      senderName: data.senderName,
      ...data,
    },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================
// Firebase Cloud Messaging (FCM) Setup
// ============================================

// Import Firebase SDKs for service worker
importScripts(
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js"
);

// ============================================
// Firebase Config - HARDCODED for SW to work without client
// IMPORTANT: Replace these values with your actual Firebase config
// Get these from Firebase Console -> Project Settings -> General
// ============================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAll4KrhbRPu5W7MR3TVj3-X60Hexapk8k",
  authDomain: "www.reviseit.in",
  projectId: "reviseit-def4c",
  storageBucket: "reviseit-def4c.firebasestorage.app",
  messagingSenderId: "636743724509",
  appId: "1:636743724509:web:25460ed67da07100555a34",
  measurementId: "G-N6F5JK2FKE",
};

let firebaseApp = null;
let messaging = null;

// Initialize Firebase immediately if config is valid
// This allows onBackgroundMessage to work as a fallback
function initializeFirebase(config) {
  if (firebaseApp) return true;

  try {
    // Check if config has real values (not placeholders)
    if (config.apiKey && !config.apiKey.includes("%%")) {
      firebaseApp = firebase.initializeApp(config);
      messaging = firebase.messaging(firebaseApp);
      console.log("✅ Firebase initialized in service worker");
      setupBackgroundMessageHandler();
      return true;
    }
  } catch (error) {
    console.error("❌ Failed to initialize Firebase in SW:", error);
  }
  return false;
}

// Try to initialize with hardcoded config
initializeFirebase(FIREBASE_CONFIG);

// Listen for Firebase config from the client (fallback/update)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG") {
    // Initialize with client-provided config if not already done
    if (!firebaseApp && event.data.config) {
      initializeFirebase(event.data.config);
    }
  }

  // Handle skip waiting message
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Setup background message handler
function setupBackgroundMessageHandler() {
  if (!messaging) return;

  messaging.onBackgroundMessage((payload) => {
    console.log("📬 Background message received:", payload);

    // Extract notification data
    const notificationTitle =
      payload.notification?.title || payload.data?.title || "New Message";
    const notificationBody =
      payload.notification?.body ||
      payload.data?.body ||
      "You have a new message";
    const notificationIcon =
      payload.notification?.icon || payload.data?.icon || "/logo-circle.png";
    const conversationId = payload.data?.conversationId;
    const url =
      payload.data?.url || payload.fcmOptions?.link || "/dashboard/messages";

    // Show notification
    const notificationOptions = {
      body: notificationBody,
      icon: notificationIcon,
      badge: "/logo-circle.png",
      tag: conversationId || "message",
      data: {
        url: url,
        conversationId: conversationId,
        ...payload.data,
      },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" },
      ],
    };

    return self.registration.showNotification(
      notificationTitle,
      notificationOptions
    );
  });
}

// ============================================
// PWA Caching Configuration
// ============================================

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

  // Skip Vercel scripts and third-party resources - let browser handle them
  if (
    url.includes("_vercel/") ||
    url.includes("vercel.live") ||
    url.includes("vercel-scripts.com")
  )
    return;

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

// ============================================
// Notification Click Handler
// ============================================

self.addEventListener("notificationclick", (event) => {
  console.log("🔔 Notification clicked:", event);

  event.notification.close();

  // Handle action buttons
  if (event.action === "dismiss") {
    return;
  }

  // Get the URL to open
  const data = event.notification.data || {};
  const urlToOpen = data.url || "/dashboard/messages";

  // Focus existing window or open new one
  const promiseChain = clients
    .matchAll({
      type: "window",
      includeUncontrolled: true,
    })
    .then((windowClients) => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          // If we have a conversation ID, post a message to navigate
          if (data.conversationId) {
            client.postMessage({
              type: "NOTIFICATION_CLICK",
              conversationId: data.conversationId,
            });
          }
          return client.focus();
        }
      }
      // No window open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    });

  event.waitUntil(promiseChain);
});

// Handle notification close (for analytics if needed)
self.addEventListener("notificationclose", (event) => {
  console.log("🔔 Notification closed:", event.notification.tag);
});
