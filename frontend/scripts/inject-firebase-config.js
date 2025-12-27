/**
 * Script to inject Firebase config into service worker
 * This runs at build time to replace placeholder values with actual config
 *
 * Run before build: node scripts/inject-firebase-config.js
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// Read the service worker file
const swPath = path.join(__dirname, "../public/sw.js");
let swContent = fs.readFileSync(swPath, "utf8");

// Get Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// Check if config values are present
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missingKeys.length > 0) {
  console.warn(`⚠️ Missing Firebase config values: ${missingKeys.join(", ")}`);
  console.warn(
    "   Make sure .env.local has all NEXT_PUBLIC_FIREBASE_* values set"
  );
}

// Replace placeholders with actual values
swContent = swContent.replace("%%FIREBASE_API_KEY%%", firebaseConfig.apiKey);
swContent = swContent.replace(
  "%%FIREBASE_AUTH_DOMAIN%%",
  firebaseConfig.authDomain
);
swContent = swContent.replace(
  "%%FIREBASE_PROJECT_ID%%",
  firebaseConfig.projectId
);
swContent = swContent.replace(
  "%%FIREBASE_STORAGE_BUCKET%%",
  firebaseConfig.storageBucket
);
swContent = swContent.replace(
  "%%FIREBASE_MESSAGING_SENDER_ID%%",
  firebaseConfig.messagingSenderId
);
swContent = swContent.replace("%%FIREBASE_APP_ID%%", firebaseConfig.appId);

// Write back to service worker
fs.writeFileSync(swPath, swContent, "utf8");

console.log("✅ Firebase config injected into service worker");
console.log(`   Project ID: ${firebaseConfig.projectId || "(not set)"}`);
