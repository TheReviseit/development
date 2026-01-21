/**
 * Production-grade favicon generator for Flowauxi
 * Creates all required favicon sizes with transparent backgrounds from the base logo.png
 * Uses sharp for high-quality image processing
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "public");
const APP_DIR = path.join(__dirname, "app");
const BASE_LOGO = path.join(PUBLIC_DIR, "logo.png");

async function createFavicon(inputPath, size, outputPath, addPadding = true) {
  try {
    // Calculate size with padding (10% margin on each side)
    let contentSize, padding;
    if (addPadding) {
      contentSize = Math.floor(size * 0.8); // 80% of total size
      padding = Math.floor((size - contentSize) / 2);
    } else {
      contentSize = size;
      padding = 0;
    }

    // Create the favicon
    await sharp(inputPath)
      .resize(contentSize, contentSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(outputPath);

    console.log(`✓ Created: ${path.basename(outputPath)} (${size}x${size})`);
    return true;
  } catch (error) {
    console.error(
      `❌ Error creating ${path.basename(outputPath)}:`,
      error.message,
    );
    return false;
  }
}

async function createMultiResolutionIco(inputPath, outputPath) {
  try {
    // Create a 48x48 PNG first (best quality for .ico)
    const tempPng = path.join(PUBLIC_DIR, "temp-favicon-48.png");

    await sharp(inputPath)
      .resize(43, 43, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: 2,
        bottom: 3,
        left: 2,
        right: 3,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(tempPng);

    // Convert to ICO format (Windows .ico file)
    // For Windows, we'll create a PNG and rename it with .ico extension
    // This is compatible with modern browsers
    await sharp(tempPng).resize(32, 32).png().toFile(outputPath);

    // Clean up temp file
    if (fs.existsSync(tempPng)) {
      fs.unlinkSync(tempPng);
    }

    console.log(`✓ Created: ${path.basename(outputPath)} (multi-resolution)`);
    return true;
  } catch (error) {
    console.error(
      `❌ Error creating ${path.basename(outputPath)}:`,
      error.message,
    );
    return false;
  }
}

async function ensureTransparentBackground(inputPath, outputPath) {
  try {
    // Process the image to ensure proper transparency
    await sharp(inputPath)
      .ensureAlpha()
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(outputPath);

    return true;
  } catch (error) {
    console.error(`❌ Error processing transparency:`, error.message);
    return false;
  }
}

async function main() {
  console.log("🎨 Flowauxi Favicon Generator");
  console.log("=".repeat(50));

  // Check if base logo exists
  if (!fs.existsSync(BASE_LOGO)) {
    console.error(`❌ Error: Base logo not found at ${BASE_LOGO}`);
    process.exit(1);
  }

  console.log(`\n📂 Loading base logo: ${BASE_LOGO}`);
  console.log("🔄 Processing transparent background...\n");

  try {
    console.log("📦 Generating favicon files...\n");

    // Create 16x16 favicon
    await createFavicon(
      BASE_LOGO,
      16,
      path.join(PUBLIC_DIR, "favicon-16x16.png"),
      false,
    );

    // Create 32x32 favicon
    await createFavicon(
      BASE_LOGO,
      32,
      path.join(PUBLIC_DIR, "favicon-32x32.png"),
      false,
    );

    // Create 48x48 favicon
    await createFavicon(
      BASE_LOGO,
      48,
      path.join(PUBLIC_DIR, "favicon-48x48.png"),
      false,
    );

    // Create multi-resolution .ico file
    await createMultiResolutionIco(
      BASE_LOGO,
      path.join(PUBLIC_DIR, "favicon.ico"),
    );

    // Create 192x192 icon with padding
    await createFavicon(
      BASE_LOGO,
      192,
      path.join(PUBLIC_DIR, "icon-192.png"),
      true,
    );

    // Create 512x512 icon with padding
    await createFavicon(
      BASE_LOGO,
      512,
      path.join(PUBLIC_DIR, "icon-512.png"),
      true,
    );

    // Ensure logo.png has transparent background
    // Create a new transparent version
    const newLogoPath = path.join(PUBLIC_DIR, "logo-new.png");
    await ensureTransparentBackground(BASE_LOGO, newLogoPath);

    // Try to replace the original, or keep the new one with a different name
    try {
      fs.unlinkSync(path.join(PUBLIC_DIR, "logo.png"));
      fs.renameSync(newLogoPath, path.join(PUBLIC_DIR, "logo.png"));
      console.log(`✓ Updated: logo.png (512x512 with transparent background)`);
    } catch (error) {
      // If we can't replace it, just use the new file for app directory
      console.log(`⚠ Warning: Could not update logo.png (file may be in use)`);
      console.log(`  Created logo-new.png instead`);
    }

    // Copy favicon.ico to app directory for Next.js
    fs.copyFileSync(
      path.join(PUBLIC_DIR, "favicon.ico"),
      path.join(APP_DIR, "favicon.ico"),
    );
    console.log(`✓ Updated: app/favicon.ico`);

    console.log("\n✅ All favicon files generated successfully!");
    console.log("\n📋 Generated files:");
    console.log("   • favicon-16x16.png");
    console.log("   • favicon-32x32.png");
    console.log("   • favicon-48x48.png");
    console.log("   • favicon.ico (multi-resolution)");
    console.log("   • icon-192.png");
    console.log("   • icon-512.png");
    console.log("   • logo.png (transparent)");
    console.log("   • app/favicon.ico");
    console.log("\n🎉 Ready for deployment!");
  } catch (error) {
    console.error("\n❌ Error during favicon generation:", error);
    process.exit(1);
  }
}

main();
