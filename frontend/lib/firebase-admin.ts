import admin from "firebase-admin";
import { getApps } from "firebase-admin/app";

/**
 * Initialize Firebase Admin SDK
 * Uses service account for server-side authentication
 */
if (!getApps().length) {
  try {
    // Path to service account key file
    const serviceAccountPath =
      process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH ||
      "./credentials/reviseit-def4c-firebase-adminsdk-fbsvc-02f67295ed.json";

    const serviceAccount = require(`../${serviceAccountPath}`);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

    console.log("Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
    throw new Error("Firebase Admin initialization failed");
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();

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
