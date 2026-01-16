/**
 * Bing URL Submission Utilities
 *
 * Helper functions to submit URLs to Bing for indexing
 */

const API_ENDPOINT = "/api/bing/submit-url";

interface BingSubmissionResponse {
  success: boolean;
  message?: string;
  error?: string;
  submittedUrls?: string[];
  count?: number;
}

/**
 * Submit a single URL to Bing for indexing
 */
export async function submitUrlToBing(
  url: string
): Promise<BingSubmissionResponse> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error submitting URL to Bing:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Submit multiple URLs to Bing for indexing
 * Automatically batches URLs in groups of 10 (Bing's limit)
 */
export async function submitUrlsToBing(
  urls: string[]
): Promise<BingSubmissionResponse[]> {
  const results: BingSubmissionResponse[] = [];

  // Batch URLs in groups of 10
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: batch }),
      });

      const data = await response.json();
      results.push(data);

      // Add small delay between batches to avoid rate limiting
      if (i + 10 < urls.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error("Error submitting batch to Bing:", error);
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Submit all URLs from your sitemap to Bing
 */
export async function submitSitemapToBing(): Promise<BingSubmissionResponse[]> {
  const baseUrl = "https://www.flowauxi.com";

  // These should match your sitemap.ts
  const urls = [
    baseUrl,
    `${baseUrl}/signup`,
    `${baseUrl}/login`,
    `${baseUrl}/forgot-password`,
    `${baseUrl}/reset-password`,
    `${baseUrl}/verify-email`,
    `${baseUrl}/terms`,
    `${baseUrl}/privacy`,
    `${baseUrl}/data-deletion`,
  ];

  return submitUrlsToBing(urls);
}
