import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Call the Flask backend
    const response = await fetch(`${BACKEND_URL}/api/ai/generate-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("AI Preview error:", error);
    return NextResponse.json(
      {
        error:
          "Could not connect to AI Brain. Make sure backend is running on port 5000.",
      },
      { status: 503 }
    );
  }
}
