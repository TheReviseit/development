/**
 * Script to inject Firebase config into service worker
 * This runs at build time to replace placeholder values with actual config
 */

const fs = require("fs");
const path = require("path");

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

// Create the config object string
const configString = `const firebaseConfig = ${JSON.stringify(
  firebaseConfig,
  null,
  2
)};`;

// Replace the placeholder config in service worker
swContent = swContent.replace(
  /const firebaseConfig = \{[\s\S]*?\};/,
  configString
);

// Write back to service worker
fs.writeFileSync(swPath, swContent, "utf8");

console.log("✅ Firebase config injected into service worker");
