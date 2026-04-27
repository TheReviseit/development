// Cache testing helper (dev-only)
// The auth provisioning path is now `/api/auth/sync` (requires a real Firebase idToken),
// so this file only provides instructions.

async function runCacheTests() {
  console.log("Cache Tests");
  console.log("1) Start the app and open the signup/login UI.");
  console.log("2) Sign up or log in once (this will call /api/auth/sync).");
  console.log("3) Watch the server logs for cache HIT/MISS messages from:");
  console.log("   - /api/auth/check-user-exists");
  console.log("   - userCache initialization logs");
}

if (typeof window !== "undefined") {
  window.testCache = runCacheTests;
  console.log("Run window.testCache() for cache test instructions");
}

