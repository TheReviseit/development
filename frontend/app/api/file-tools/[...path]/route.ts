import { createHash, randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const GUEST_COOKIE = "file_tools_guest";
const DEFAULT_LOCAL_BACKEND_URL = "http://localhost:5000";
const DEFAULT_PRODUCTION_BACKEND_URL = "https://revsieit.onrender.com";
const FILE_TOOLS_PROXY_TIMEOUT_MS = Number(process.env.FILE_TOOLS_PROXY_TIMEOUT_MS || 90_000);
const FRONTEND_PROXY_HOSTS = new Set([
  "api.flowauxi.com",
  "files.flowauxi.com",
  "flowauxi.com",
  "marketing.flowauxi.com",
  "pages.flowauxi.com",
  "shop.flowauxi.com",
  "tools.flowauxi.com",
  "www.flowauxi.com",
]);

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
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const backendBaseUrl = resolveFileToolsBackendUrl(request);
  const backendUrl = `${backendBaseUrl}${backendPath}${url.search}`;

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

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), FILE_TOOLS_PROXY_TIMEOUT_MS);
    fetchOptions.signal = controller.signal;

    const backendResponse = await fetch(backendUrl, fetchOptions);
    clearTimeout(timeout);

    const missingDeployment = await detectMissingFileToolsDeployment(backendResponse);
    if (missingDeployment) {
      return fileToolsProxyErrorResponse({
        requestId,
        shouldSetGuestCookie,
        guestId,
        status: 503,
        code: "FILE_TOOLS_BACKEND_NOT_DEPLOYED",
        message: "The file processing service is reachable, but file tools are not deployed on it yet.",
      });
    }

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
    if (timeout) {
      clearTimeout(timeout);
    }
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[file-tools-proxy] backend request failed", {
      requestId,
      backendHost: safeHost(backendBaseUrl),
      backendPath,
      error: error instanceof Error ? error.message : String(error),
    });

    return fileToolsProxyErrorResponse({
      requestId,
      shouldSetGuestCookie,
      guestId,
      status: aborted ? 504 : 502,
      code: aborted ? "FILE_TOOLS_BACKEND_TIMEOUT" : "FILE_TOOLS_PROXY_ERROR",
      message: aborted
        ? "The file processing service took too long to respond."
        : "Unable to reach the file processing service.",
    });
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

async function detectMissingFileToolsDeployment(response: Response) {
  if (response.status !== 404) return false;
  try {
    const data = await response.clone().json();
    return data?.error === "Endpoint not found";
  } catch {
    return false;
  }
}

function resolveFileToolsBackendUrl(request: NextRequest) {
  const candidates = [
    process.env.FILE_TOOLS_BACKEND_URL,
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBackendUrl(candidate);
    if (!normalized) continue;
    if (isUnsafeProductionBackendUrl(normalized, request)) continue;
    return normalized;
  }

  return process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_BACKEND_URL
    : DEFAULT_LOCAL_BACKEND_URL;
}

function normalizeBackendUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isUnsafeProductionBackendUrl(value: string, request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.FILE_TOOLS_ALLOW_FRONTEND_PROXY_BACKEND === "true") return false;

  const backendHost = new URL(value).host.toLowerCase();
  const requestHost = request.nextUrl.host.toLowerCase();

  if (backendHost === requestHost) return true;
  if (backendHost.startsWith("localhost") || backendHost.startsWith("127.0.0.1")) return true;

  return FRONTEND_PROXY_HOSTS.has(backendHost);
}

function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "unknown";
  }
}

function fileToolsProxyErrorResponse(args: {
  requestId: string;
  shouldSetGuestCookie: boolean;
  guestId: string;
  status: number;
  code: string;
  message: string;
}) {
  const response = NextResponse.json(
    {
      success: false,
      error: {
        code: args.code,
        message: args.message,
        requestId: args.requestId,
      },
    },
    {
      status: args.status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": args.requestId,
      },
    },
  );

  if (args.shouldSetGuestCookie) {
    response.cookies.set(GUEST_COOKIE, args.guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
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
