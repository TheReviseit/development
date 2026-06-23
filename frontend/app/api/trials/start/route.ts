import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey) {
    return NextResponse.json(
      { success: false, error: "Service configuration error.", error_code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body.", error_code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";
  try {
    const response = await fetch(`${backendUrl}/api/trials/internal/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Api-Key": internalApiKey,
        "X-Request-Id": request.headers.get("X-Request-Id") || `trial_${Date.now()}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Trial service unavailable.", error_code: "SERVICE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
