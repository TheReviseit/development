#!/usr/bin/env node
/**
 * Email System Verification Script
 *
 * This script checks if all email system files are in place
 * and verifies the basic configuration.
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 Verifying Email Automation System...\n");

const files = [
  // Email library files
  "lib/email/resend.ts",
  "lib/email/email-templates.ts",
  "lib/email/types.ts",
  "lib/email/README.md",

  // API endpoints
  "app/api/email/send-email/route.ts",
  "app/api/email/send-bulk/route.ts",
  "app/api/email/test-email/route.ts",

  // Admin UI
  "app/admin/email/page.tsx",
  "app/components/admin/EmailComposer.tsx",

  // Documentation
  "docs/email-automation-guide.md",
  "docs/EMAIL-QUICKSTART.md",
  "docs/email-setup.sql",
];

let allFilesExist = true;

files.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

console.log("\n📦 Checking package.json...");
const packageJson = require("./package.json");
if (packageJson.dependencies.resend) {
  console.log(
    `✅ resend package installed (v${packageJson.dependencies.resend})`
  );
} else {
  console.log("❌ resend package NOT installed");
  allFilesExist = false;
}

console.log("\n🔐 Checking environment variables...");
require("dotenv").config();
if (process.env.RESEND_API_KEY) {
  console.log("✅ RESEND_API_KEY is set");
} else {
  console.log("⚠️  RESEND_API_KEY is not set in .env");
}

console.log("\n" + "=".repeat(50));
if (allFilesExist) {
  console.log("✅ All email system files are in place!");
  console.log("\n📝 Next steps:");
  console.log("1. Make yourself admin in Supabase");
  console.log("2. Verify domain at https://resend.com/domains");
  console.log("3. Visit http://localhost:3000/admin/email");
  console.log('4. Click "Test Email Configuration"');
} else {
  console.log("❌ Some files are missing. Please check the implementation.");
}
console.log("=".repeat(50));
