import admin from "firebase-admin";
import { getApps } from "firebase-admin/app";

/**
 * Initialize Firebase Admin SDK
 * Uses service account for server-side authentication
 */
if (!getApps().length) {
  try {
    // Get service account from environment variable (base64 encoded JSON)
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    let serviceAccount;
    if (serviceAccountBase64) {
      // Decode from base64 (for Vercel/production)
      const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
      serviceAccount = JSON.parse(serviceAccountJson);
    } else {
      // Fallback to reading from file (for local development)
      // Use static import to avoid Turbopack scanning issues
      serviceAccount = require("../credentials/reviseit-def4c-firebase-adminsdk-fbsvc-02f67295ed.json");
    }

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
