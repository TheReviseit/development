/**
 * IndexNow Protocol — Instant Search Engine Indexing
 * ===================================================
 *
 * Submits URLs to Bing, Yandex, Seznam, and Naver simultaneously.
 * This dramatically reduces the time for new pages to appear in
 * search results — from days/weeks to hours.
 *
 * Usage:
 *   import { notifySearchEngines } from "@/lib/seo/indexnow";
 *   await notifySearchEngines("https://www.flowauxi.com/online-store-builder");
 *
 *   // Batch submission
 *   import { batchNotifySearchEngines } from "@/lib/seo/indexnow";
 *   await batchNotifySearchEngines([
 *     "https://www.flowauxi.com/online-store-builder",
 *     "https://www.flowauxi.com/free-website-builder",
 *     "https://www.flowauxi.com/ecommerce-website-builder",
 *     "https://www.flowauxi.com/create-online-store-free",
 *   ]);
 *
 * @see https://www.indexnow.org/
 */

const INDEXNOW_KEY = process.env.INDEXNOW_API_KEY || "flowauxi2024seo";
const INDEXNOW_HOST = "www.flowauxi.com";

const SEARCH_ENGINES = [
  "https://api.indexnow.org/indexnow",
  "https://searchengines.yandex.ru/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://api.naver.com/indexnow",
];

interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * Submit URLs to IndexNow API.
 * Returns array of booleans — true for each search engine that accepted.
 * @param urls Array of URLs to submit (max 10,000 per request)
 */
export async function submitToIndexNow(
  urls: string[],
): Promise<boolean[]> {
  const payload: IndexNowPayload = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000),
  };

  const results = await Promise.allSettled(
    SEARCH_ENGINES.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          console.log(
            `[indexnow] ✅ ${new URL(endpoint).hostname} accepted ${urls.length} URLs`,
          );
          return true;
        }
        console.warn(
          `[indexnow] ⚠️ ${new URL(endpoint).hostname} returned ${response.status}`,
        );
        return false;
      } catch (err) {
        console.error(
          `[indexnow] ❌ ${new URL(endpoint).hostname} error:`,
          err,
        );
        return false;
      }
    }),
  );

  return results.map(
    (r) => r.status === "fulfilled" && r.value === true,
  );
}

/**
 * Notify search engines about a single URL.
 */
export async function notifySearchEngines(
  url: string,
): Promise<void> {
  await submitToIndexNow([url]);
}

/**
 * Batch-notify search engines about multiple URLs.
 * Processes in batches of 100 with 1-second delay between batches
 * to avoid rate limiting.
 */
export async function batchNotifySearchEngines(
  urls: string[],
): Promise<void> {
  for (let i = 0; i < urls.length; i += 100) {
    const batch = urls.slice(i, i + 100);
    await submitToIndexNow(batch);
    if (i + 100 < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}