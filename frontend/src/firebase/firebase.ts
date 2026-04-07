/**
 * Firebase Configuration
 * ======================
 * 
 * PRODUCTION-GRADE SETUP with multi-domain support
 * 
 * This configuration handles:
 * - Multiple environments (localhost, staging, production)
 * - Domain validation for Firebase Auth
 * - Auth persistence and error handling
 * - Cross-origin auth compatibility
 * 
 * @version 2.0.0
 * @securityLevel Production
 */

import { initializeApp, FirebaseApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  Auth,
  browserLocalPersistence,
  setPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// =============================================================================
// CONFIGURATION INTERFACE
// =============================================================================

interface FirebaseConfig {
  apiKey: string | undefined;
  authDomain: string | undefined;
  projectId: string | undefined;
  storageBucket: string | undefined;
  messagingSenderId: string | undefined;
  appId: string | undefined;
}

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

/**
 * Get the appropriate auth domain based on current environment
 * 
 * This is CRITICAL for Firebase Auth to work across multiple domains:
 * - localhost:3000 (development)
 * - localhost:3001 (shop development)
 * - yourdomain.com (production)
 * - www.yourdomain.com (production with www)
 * 
 * Firebase Auth requires the authDomain to be authorized in the Firebase Console.
 * All variations must be added to: Firebase Console → Authentication → Settings → Authorized Domains
 */
function getAuthDomain(): string | undefined {
  // Priority 1: Environment variable (explicit override)
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) {
    return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  }

  // Priority 2: Auto-detect from browser (client-side only)
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // Production domains
    if (hostname === "flowauxi.com" || hostname === "www.flowauxi.com") {
      return "www.flowauxi.com";
    }
    
    // Subdomains
    if (hostname.endsWith(".flowauxi.com")) {
      return hostname;
    }
    
    // Localhost with specific ports
    if (hostname === "localhost") {
      return port ? `localhost:${port}` : "localhost";
    }
    
    // 127.0.0.1
    if (hostname === "127.0.0.1") {
      return port ? `127.0.0.1:${port}` : "127.0.0.1";
    }
  }

  // Fallback to environment variable or undefined
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
}

// =============================================================================
// FIREBASE CONFIG
// =============================================================================

const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: getAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// =============================================================================
// VALIDATION & INITIALIZATION
// =============================================================================

/**
 * Validate Firebase configuration
 */
function validateConfig(config: FirebaseConfig): void {
  const missingKeys: string[] = [];

  Object.entries(config).forEach(([key, value]) => {
    if (!value) {
      missingKeys.push(key);
    }
  });

  if (missingKeys.length > 0) {
    console.warn(
      `[Firebase] Missing configuration values: ${missingKeys.join(", ")}. ` +
      `Make sure they are set in your .env file.`
    );
  }
}

// Validate on load
validateConfig(firebaseConfig);

// =============================================================================
// APP INITIALIZATION (Singleton Pattern)
// =============================================================================

/**
 * Initialize Firebase app (singleton)
 * Prevents duplicate initialization in development with hot reload
 */
function initializeFirebaseApp(): FirebaseApp {
  // Check if app already exists
  if (getApps().length > 0) {
    return getApp();
  }

  try {
    const app = initializeApp(firebaseConfig);
    console.log("[Firebase] App initialized successfully");
    return app;
  } catch (error) {
    console.error("[Firebase] Failed to initialize app:", error);
    throw error;
  }
}

const app = initializeFirebaseApp();

// =============================================================================
// SERVICE INITIALIZATION
// =============================================================================

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// =============================================================================
// AUTH PERSISTENCE
// =============================================================================

/**
 * Set auth persistence to LOCAL (survives browser restarts)
 * 
 * This is important for:
 * - Maintaining login state across sessions
 * - Supporting redirect auth flows (the redirect loses in-memory state)
 * - Better UX (users stay logged in)
 */
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      console.log("[Firebase] Auth persistence set to LOCAL");
    })
    .catch((error) => {
      console.error("[Firebase] Error setting auth persistence:", error);
      
      // If local persistence fails (e.g., private browsing), try session
      if (error.code === "auth/storage-unauthorized") {
        console.warn("[Firebase] Local storage not available, using session persistence");
        import("firebase/auth").then(({ browserSessionPersistence, setPersistence }) => {
          setPersistence(auth, browserSessionPersistence).catch((err) => {
            console.error("[Firebase] Session persistence also failed:", err);
          });
        });
      }
    });
}

// =============================================================================
// EMULATOR SUPPORT (Development Only)
// =============================================================================

/**
 * Connect to Firebase Auth Emulator in development
 * Set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true to enable
 */
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
) {
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099";
  connectAuthEmulator(auth, `http://${emulatorHost}`);
  console.log(`[Firebase] Connected to Auth Emulator at ${emulatorHost}`);
}

// =============================================================================
// AUTH STATE DEBUGGING (Development Only)
// =============================================================================

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log("[Firebase] Auth state: SIGNED_IN", {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
    } else {
      console.log("[Firebase] Auth state: SIGNED_OUT");
    }
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export { app };
export default app;
