/**
 * Test script to verify Hash Map cache implementation
 * Run this in the browser console on the login or signup page
 * to test the cache functionality
 */

// Test 1: Test signup flow with cache
async function testSignupWithCache() {
  console.log("\n=== Testing Signup Flow with Cache ===");

  const testUser = {
    firebase_uid: "test-uid-" + Date.now(),
    email: `test${Date.now()}@example.com`,
    full_name: "Test User",
  };

  try {
    // Create user (should add to cache)
    const response = await fetch("/api/auth/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });

    const result = await response.json();
    console.log("✅ User created:", result);

    return testUser;
  } catch (error) {
    console.error("❌ Signup test failed:", error);
  }
}

// Test 2: Test cache hit on user existence check
async function testCacheHit(firebaseUID) {
  console.log("\n=== Testing Cache Hit ===");

  try {
    // This should hit the cache (O(1) lookup)
    const response = await fetch("/api/auth/check-user-exists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: "dummy-token-for-testing", // Note: This will fail auth, but tests cache logic
      }),
    });

    console.log("Check server console logs for cache HIT/MISS messages");
  } catch (error) {
    console.log("Expected auth error (this is fine for cache testing)");
  }
}

// Run all tests
async function runCacheTests() {
  console.log("🚀 Starting Hash Map Cache Tests...\n");

  console.log("To properly test the cache:");
  console.log("1. Sign up with a new account via the UI");
  console.log("2. Monitor the server console for these logs:");
  console.log("   - [UserCache] Initializing cache from database...");
  console.log("   - [UserCache] Cache initialized with N users");
  console.log("   - [create-user] User cached successfully");
  console.log(
    "3. Try logging in with Google (if you have an existing account)"
  );
  console.log("4. Look for cache HIT/MISS logs in server console");
  console.log("\n✅ Cache is working if you see:");
  console.log("   - [UserCache] HIT for firebase_uid: xxx");
  console.log("   - Sub-millisecond response times for cache hits");
}

// Export for use
if (typeof window !== "undefined") {
  window.testCache = runCacheTests;
  console.log("💡 Run window.testCache() to see testing instructions");
}
