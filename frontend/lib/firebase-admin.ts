import admin from "firebase-admin";
import { getApps } from "firebase-admin/app";

/**
 * Initialize Firebase Admin SDK
 * Uses service account for server-side authentication
 */
function getFirebaseAdminApp() {
  if (getApps().length) {
    return admin.app();
  }

  try {
    // Get service account from environment variable (base64 encoded JSON)
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountBase64) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required. " +
          "Please set it with your base64-encoded service account JSON. " +
          "To convert your service account file: " +
          "base64 -i path/to/serviceAccount.json | tr -d '\\n'"
      );
    }

    // Decode from base64
    const serviceAccountJson = Buffer.from(
      serviceAccountBase64,
      "base64"
    ).toString("utf-8");
    const serviceAccount = JSON.parse(serviceAccountJson);

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

    console.log("Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
    throw new Error("Firebase Admin initialization failed");
  }
}

export function getAdminAuth() {
  return getFirebaseAdminApp().auth();
}

export function getAdminDb() {
  return getFirebaseAdminApp().firestore();
}

export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get(_target, prop, receiver) {
    const auth = getAdminAuth() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(auth, prop, receiver);
    return typeof value === "function" ? value.bind(auth) : value;
  },
});

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop, receiver) {
    const db = getAdminDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(db, prop, receiver);
    return typeof value === "function" ? value.bind(db) : value;
  },
});

/**
 * Verify Firebase ID token
 * @param idToken - Firebase ID token from client
 * @returns Decoded token with user information
 */
export async function verifyIdToken(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return {
      success: true,
      data: decodedToken,
    };
  } catch (error: any) {
    console.error("Token verification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get user data from Firebase Auth
 * @param uid - Firebase user ID
 */
export async function getFirebaseUser(uid: string) {
  try {
    const userRecord = await adminAuth.getUser(uid);
    return {
      success: true,
      data: userRecord,
    };
  } catch (error: any) {
    console.error("Failed to get Firebase user:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Safely verify session cookie with proper error handling
 * Handles common Firebase Auth errors like user-not-found, session-expired, etc.
 *
 * @param sessionCookie - The session cookie value
 * @param checkRevoked - Whether to check if the session was revoked (default: true)
 * @returns Result object with success status and either decoded claims or error info
 */
export async function verifySessionCookieSafe(
  sessionCookie: string,
  checkRevoked: boolean = true
): Promise<{
  success: boolean;
  data?: admin.auth.DecodedIdToken;
  error?: string;
  errorCode?: string;
  shouldClearSession?: boolean;
}> {
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      checkRevoked
    );
    return {
      success: true,
      data: decodedClaims,
    };
  } catch (error: any) {
    const errorCode =
      error?.errorInfo?.code || error?.code || "auth/unknown-error";
    const errorMessage = error?.message || "Session verification failed";

    // Determine if we should clear the session cookie
    const sessionInvalidErrors = [
      "auth/user-not-found",
      "auth/user-disabled",
      "auth/session-cookie-expired",
      "auth/session-cookie-revoked",
      "auth/invalid-session-cookie",
      "auth/argument-error",
    ];

    const shouldClearSession =
      sessionInvalidErrors.includes(errorCode) ||
      errorMessage.includes("no user record") ||
      errorMessage.includes("user record corresponding");

    // Only log non-routine errors
    if (!shouldClearSession) {
      console.error("Session verification failed:", errorCode, errorMessage);
    }

    return {
      success: false,
      error: errorMessage,
      errorCode: errorCode,
      shouldClearSession: shouldClearSession,
    };
  }
}
