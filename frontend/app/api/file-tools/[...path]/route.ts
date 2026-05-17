import { createHash, randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const GUEST_COOKIE = "file_tools_guest";

export async function GET(request: NextRequest) {
  return proxyFileToolsRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return proxyFileToolsRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return proxyFileToolsRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return proxyFileToolsRequest(request, "DELETE");
}

export async function PATCH(request: NextRequest) {
  return proxyFileToolsRequest(request, "PATCH");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function proxyFileToolsRequest(request: NextRequest, method: string) {
  const url = new URL(request.url);
  const backendPath = url.pathname.replace("/api/file-tools", "/api/file-tools");
  const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;
  const requestId = request.headers.get("x-request-id") || randomUUID();

  const { guestId, shouldSetGuestCookie } = getOrCreateGuestId(request);
  const session = request.cookies.get("session")?.value;
  const userId = await verifyOptionalSession(session);

  const headers: Record<string, string> = {
    "X-Request-Id": requestId,
    "X-Product-Domain": "files",
    "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
    "User-Agent": request.headers.get("user-agent") || "",
  };

  if (userId) {
    headers["X-User-Id"] = userId;
  } else {
    headers["X-Guest-Session"] = hashGuestId(guestId);
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(method)) {
    fetchOptions.body = await request.arrayBuffer();
  }

  try {
    const backendResponse = await fetch(backendUrl, fetchOptions);
    const response = await toNextResponse(backendResponse);
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("Vary", "Cookie");
    if (shouldSetGuestCookie) {
      response.cookies.set(GUEST_COOKIE, guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: "FILE_TOOLS_PROXY_ERROR",
          message: "Unable to reach the file processing service.",
          requestId,
        },
      },
      { status: 502 },
    );
    if (shouldSetGuestCookie) {
      response.cookies.set(GUEST_COOKIE, guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  }
}

async function toNextResponse(response: Response) {
  const headers = new Headers();
  for (const header of ["content-type", "content-disposition", "cache-control"]) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return NextResponse.json(data, { status: response.status, headers });
  }

  const body = await response.arrayBuffer();
  return new NextResponse(body, { status: response.status, headers });
}

function getOrCreateGuestId(request: NextRequest) {
  const existing = request.cookies.get(GUEST_COOKIE)?.value;
  if (existing) {
    return { guestId: existing, shouldSetGuestCookie: false };
  }
  return {
    guestId: randomBytes(24).toString("base64url"),
    shouldSetGuestCookie: true,
  };
}

function hashGuestId(guestId: string) {
  return createHash("sha256").update(guestId).digest("hex");
}

async function verifyOptionalSession(sessionCookie?: string) {
  if (!sessionCookie) return null;
  try {
    const { verifySessionCookieSafe } = await import("@/lib/firebase-admin");
    const result = await verifySessionCookieSafe(sessionCookie, true);
    return result.success ? result.data?.uid || null : null;
  } catch {
    return null;
  }
}
