import { NextRequest, NextResponse } from "next/server";

/**
 * Bing URL Submission API
 *
 * This endpoint allows you to programmatically submit URLs to Bing for indexing.
 *
 * Usage:
 * POST /api/bing/submit-url
 * Body: { "urls": ["https://www.reviseit.in/page1", "https://www.reviseit.in/page2"] }
 *
 * Or submit a single URL:
 * POST /api/bing/submit-url
 * Body: { "url": "https://www.reviseit.in/page1" }
 */

const BING_API_ENDPOINT =
  "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch";
const SITE_URL = "https://www.reviseit.in";

export async function POST(request: NextRequest) {
  try {
    // Get Bing API key from environment
    const apiKey = process.env.BING_WEBMASTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Bing Webmaster API key not configured",
          message:
            "Please set BING_WEBMASTER_API_KEY in your environment variables",
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Support both single URL and multiple URLs
    let urls: string[] = [];
    if (body.url) {
      urls = [body.url];
    } else if (body.urls && Array.isArray(body.urls)) {
      urls = body.urls;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          message: "Please provide either 'url' (string) or 'urls' (array)",
        },
        { status: 400 }
      );
    }

    // Validate URLs
    if (urls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No URLs provided",
        },
        { status: 400 }
      );
    }

    // Bing allows max 10 URLs per request
    if (urls.length > 10) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many URLs",
          message: "Bing API allows maximum 10 URLs per request",
        },
        { status: 400 }
      );
    }

    // Validate that all URLs belong to your site
    const invalidUrls = urls.filter((url) => !url.startsWith(SITE_URL));
    if (invalidUrls.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid URLs",
          message: `All URLs must start with ${SITE_URL}`,
          invalidUrls,
        },
        { status: 400 }
      );
    }

    // Prepare request to Bing
    const bingRequestBody = {
      siteUrl: SITE_URL,
      urlList: urls,
    };

    // Submit to Bing
    const response = await fetch(`${BING_API_ENDPOINT}?apikey=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(bingRequestBody),
    });

    // Check response
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Bing API Error:", errorText);

      return NextResponse.json(
        {
          success: false,
          error: "Bing API request failed",
          status: response.status,
          message: errorText || response.statusText,
        },
        { status: response.status }
      );
    }

    // Bing returns 200 OK with empty body on success
    return NextResponse.json({
      success: true,
      message: "URLs submitted to Bing successfully",
      submittedUrls: urls,
      count: urls.length,
    });
  } catch (error) {
    console.error("Error submitting URLs to Bing:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to check API status
export async function GET() {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;

  return NextResponse.json({
    configured: !!apiKey,
    endpoint: BING_API_ENDPOINT,
    siteUrl: SITE_URL,
    maxUrlsPerRequest: 10,
    usage: {
      single:
        "POST /api/bing/submit-url with body: { url: 'https://www.reviseit.in/page' }",
      multiple:
        "POST /api/bing/submit-url with body: { urls: ['url1', 'url2'] }",
    },
  });
}
