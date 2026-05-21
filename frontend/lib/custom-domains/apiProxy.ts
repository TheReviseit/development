import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";

const DEFAULT_LOCAL_BACKEND_URL = "http://127.0.0.1:5000";
const DEFAULT_PRODUCTION_BACKEND_URL = "https://revsieit.onrender.com";

function getBackendUrl(): string {
  const configured =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;

  if (configured?.trim()) {
    return configured.replace(/\/+$/, "");
  }

  return process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_BACKEND_URL
    : DEFAULT_LOCAL_BACKEND_URL;
}

type ProxyOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  backendPath: string;
  request: NextRequest;
};

export async function proxyDomainRequest({
  method,
  backendPath,
  request,
}: ProxyOptions): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const session = await verifySessionCookieSafe(sessionCookie, true);
  if (!session.success) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${getBackendUrl()}${backendPath}`);
  sourceUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${sessionCookie}`,
    "X-User-ID": session.data!.uid,
    "X-Request-Id":
      request.headers.get("X-Request-Id") || `domains_${Date.now()}`,
  };

  const idempotencyKey = request.headers.get("X-Idempotency-Key");
  if (idempotencyKey) {
    headers["X-Idempotency-Key"] = idempotencyKey;
  }

  let body: string | undefined;
  if (method === "POST" || method === "PATCH") {
    const requestBody = await request.text();
    if (requestBody.trim()) {
      headers["Content-Type"] =
        request.headers.get("Content-Type") || "application/json";
      body = requestBody;
    }
  }

  let response: Response;
  try {
    response = await fetch(targetUrl.toString(), {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch (error) {
    console.error("[CustomDomainsAPI] Backend request failed", {
      backendPath,
      targetOrigin: targetUrl.origin,
      error,
    });
    return NextResponse.json(
      {
        success: false,
        code: "PROVIDER_UNAVAILABLE",
        message:
          "The domain service is temporarily unavailable. Check BACKEND_URL in Vercel and confirm the Render backend is running.",
        retryable: true,
        nextRetryAt: null,
        requestId: headers["X-Request-Id"],
      },
      { status: 503 },
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  }

  const text = await response.text();
  if (!text.trim()) {
    return NextResponse.json(
      response.ok
        ? { success: true }
        : { success: false, error: "Empty backend response" },
      { status: response.status },
    );
  }

  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": contentType || "text/plain" },
  });
}
