import { NextRequest } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Proxy SSE stream from Flask backend
    const response = await fetch(
      `${BACKEND_URL}/api/ai/generate-reply-stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok || !response.body) {
      return new Response(
        JSON.stringify({
          error: "AI Brain stream unavailable. Backend may not be running.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Forward the SSE stream directly
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("AI Preview Stream error:", error);
    return new Response(
      JSON.stringify({
        error:
          "Could not connect to AI Brain stream. Make sure the backend server is running.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
