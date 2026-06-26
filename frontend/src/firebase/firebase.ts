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
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
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
 * Resolve the Firebase hosted auth domain.
 * 
 * This should be the Firebase auth handler host, for example
 * flowauxi.firebaseapp.com. Localhost, preview URLs, and custom app domains
 * must be added separately in Firebase Authentication -> Authorized domains.
 */
function getAuthDomain(): string | undefined {
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) {
    return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  }

  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    return `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
  }

  return undefined;
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

if (
  typeof window !== "undefined" &&
  firebaseConfig.authDomain &&
  /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(firebaseConfig.authDomain)
) {
  console.warn(
    "[Firebase] NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN should be the Firebase auth host " +
      "(for example flowauxi.firebaseapp.com), not the local app host. " +
      "Add localhost in Firebase Authorized domains instead.",
  );
}

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

/**
 * Initialize Firebase Auth with optimal multi-layered persistence.
 * Solves the "Duplicate Tab Logout" race condition by synchronously
 * providing all persistence layers during initialization.
 */
function initializeFirebaseAuth(firebaseApp: FirebaseApp): Auth {
  if (typeof window === "undefined") {
    // Server-side initialization
    return getAuth(firebaseApp);
  }

  try {
    // Synchronously initialize with all fallback layers.
    // Firebase will search these in order for an existing session.
    // This prevents onAuthStateChanged from firing with 'null' 
    // before an async setPersistence call can complete.
    return initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (error: any) {
    // If auth is already initialized (e.g., during React Fast Refresh),
    // we safely fall back to getAuth.
    if (error.code === "auth/already-initialized") {
      return getAuth(firebaseApp);
    }
    console.error("[Firebase] Failed to initialize auth:", error);
    return getAuth(firebaseApp);
  }
}

export const auth: Auth = initializeFirebaseAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

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
  try {
    const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099";
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
    console.log(`[Firebase] Connected to Auth Emulator at ${emulatorHost}`);
  } catch (error: any) {
    if (error.code !== "auth/emulator-config-failed") {
      console.error("[Firebase] Emulator connection failed:", error);
    }
  }
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
