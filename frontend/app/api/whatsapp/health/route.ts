import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("http://localhost:5000/api/health", {
      method: "GET",
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: "Backend server is not reachable" },
      { status: 503 }
    );
  }
}
