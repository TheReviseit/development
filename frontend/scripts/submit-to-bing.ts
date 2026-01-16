/**
 * Script to submit all sitemap URLs to Bing
 *
 * Usage:
 * npm run submit-to-bing
 *
 * Or with tsx:
 * npx tsx scripts/submit-to-bing.ts
 */

const BING_API_ENDPOINT =
  "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch";
const SITE_URL = "https://www.flowauxi.com";

// Get API key from environment
const API_KEY = process.env.BING_WEBMASTER_API_KEY;

if (!API_KEY) {
  console.error(
    "❌ Error: BING_WEBMASTER_API_KEY not found in environment variables"
  );
  console.log("\nPlease add your Bing Webmaster API key to .env.local:");
  console.log("BING_WEBMASTER_API_KEY=your_api_key_here\n");
  process.exit(1);
}

// All URLs from your sitemap
const urls = [
  SITE_URL,
  `${SITE_URL}/signup`,
  `${SITE_URL}/login`,
  `${SITE_URL}/forgot-password`,
  `${SITE_URL}/reset-password`,
  `${SITE_URL}/verify-email`,
  `${SITE_URL}/terms`,
  `${SITE_URL}/privacy`,
  `${SITE_URL}/data-deletion`,
];

async function submitBatch(urlBatch: string[]) {
  const requestBody = {
    siteUrl: SITE_URL,
    urlList: urlBatch,
  };

  try {
    const response = await fetch(`${BING_API_ENDPOINT}?apikey=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    return true;
  } catch (error) {
    console.error("Error submitting batch:", error);
    return false;
  }
}

async function main() {
  console.log("🚀 Starting Bing URL submission...\n");
  console.log(`📍 Site: ${SITE_URL}`);
  console.log(`📊 Total URLs: ${urls.length}\n`);

  let successCount = 0;
  let failCount = 0;

  // Submit in batches of 10 (Bing's limit)
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    const batchNumber = Math.floor(i / 10) + 1;
    const totalBatches = Math.ceil(urls.length / 10);

    console.log(
      `📤 Submitting batch ${batchNumber}/${totalBatches} (${batch.length} URLs)...`
    );

    const success = await submitBatch(batch);

    if (success) {
      console.log(`✅ Batch ${batchNumber} submitted successfully`);
      successCount += batch.length;
    } else {
      console.log(`❌ Batch ${batchNumber} failed`);
      failCount += batch.length;
    }

    // Add delay between batches to avoid rate limiting
    if (i + 10 < urls.length) {
      console.log("⏳ Waiting 1 second before next batch...\n");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Submission Summary");
  console.log("=".repeat(50));
  console.log(`✅ Successful: ${successCount} URLs`);
  console.log(`❌ Failed: ${failCount} URLs`);
  console.log(
    `📈 Success Rate: ${((successCount / urls.length) * 100).toFixed(1)}%`
  );
  console.log("=".repeat(50) + "\n");

  if (successCount === urls.length) {
    console.log("🎉 All URLs submitted successfully!");
    console.log(
      "\n💡 Tip: You can check indexing status in Bing Webmaster Tools:"
    );
    console.log("   https://www.bing.com/webmasters\n");
  } else {
    console.log(
      "⚠️  Some URLs failed to submit. Please check the errors above.\n"
    );
    process.exit(1);
  }
}

main();
