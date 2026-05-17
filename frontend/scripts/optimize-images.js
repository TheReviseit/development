const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");

const imagesToOptimize = [
  {
    input: "public/email.jpg",
    maxWidth: 1200,
    quality: 80,
    formats: ["webp", "jpg"],
  },
  {
    input: "public/phone.jpg",
    maxWidth: 1200,
    quality: 80,
    formats: ["webp", "jpg"],
  },
  {
    input: "public/visit.jpg",
    maxWidth: 1200,
    quality: 80,
    formats: ["webp", "jpg"],
  },
  {
    input: "public/gradient-waves.png",
    outputBaseName: "public/auth-gradient-v1",
    maxWidth: 1400,
    quality: 74,
    avifQuality: 52,
    formats: ["avif", "webp"],
  },
  {
    input: "public/og-image.png",
    maxWidth: 1200,
    quality: 90,
    formats: ["webp", "png"],
  },
  {
    input: "public/twitter-image.png",
    maxWidth: 1200,
    quality: 90,
    formats: ["webp", "png"],
  },
];

async function optimizeImages() {
  console.log("🔧 Starting image optimization...\n");

  for (const img of imagesToOptimize) {
    try {
      const inputPath = path.join(__dirname, "..", img.input);
      const inputStats = await fs.stat(inputPath);
      const originalSizeKB = (inputStats.size / 1024).toFixed(2);

      console.log(`📸 Processing: ${img.input} (${originalSizeKB} KB)`);

      // Generate optimized versions in different formats
      for (const format of img.formats) {
        const outputPath =
          img.outputBaseName || img.input.replace(/\.(jpg|png)$/i, "-optimized");
        const versionedOutputPath = `${outputPath}.${format}`;
        const fullOutputPath = path.join(__dirname, "..", versionedOutputPath);

        const sharpInstance = sharp(inputPath).resize({
          width: img.maxWidth,
          withoutEnlargement: true,
        });

        let info;
        const formatQuality =
          format === "avif" ? img.avifQuality || img.quality : img.quality;

        if (format === "avif") {
          info = await sharpInstance
            .avif({
              quality: formatQuality,
              effort: 7,
              chromaSubsampling: "4:2:0",
            })
            .toFile(fullOutputPath);
        } else if (format === "webp") {
          info = await sharpInstance
            .webp({ quality: formatQuality })
            .toFile(fullOutputPath);
        } else if (format === "jpg") {
          info = await sharpInstance
            .jpeg({ quality: formatQuality, progressive: true })
            .toFile(fullOutputPath);
        } else if (format === "png") {
          info = await sharpInstance
            .png({ quality: formatQuality, compressionLevel: 9 })
            .toFile(fullOutputPath);
        }

        const optimizedSizeKB = (info.size / 1024).toFixed(2);
        const savings = (
          ((inputStats.size - info.size) / inputStats.size) *
          100
        ).toFixed(1);

        console.log(
          `  ✅ ${format.toUpperCase()}: ${optimizedSizeKB} KB (${savings}% smaller)`
        );
      }

      console.log("");
    } catch (err) {
      console.error(`  ❌ Error optimizing ${img.input}:`, err.message);
    }
  }

  console.log("✨ Image optimization complete!\n");
  console.log("📝 Next steps:");
  console.log("  1. Review the optimized images in your public folder");
  console.log("  2. Replace original images with optimized versions");
  console.log("  3. Update your components to use Next.js Image component");
  console.log(
    "  4. Consider using WebP format with fallbacks for better compression\n"
  );
}

optimizeImages().catch(console.error);
