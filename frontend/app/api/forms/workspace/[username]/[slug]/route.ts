import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// GET /api/forms/workspace/[username]/[slug] — Workspace-scoped public form (no auth)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; slug: string }> }
) {
  try {
    const { username, slug } = await params;
    const response = await fetch(
      `${BACKEND_URL}/api/forms/public/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in GET /api/forms/workspace/[username]/[slug]:", error);
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }
}

// POST /api/forms/workspace/[username]/[slug] — Workspace-scoped form submission (no auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; slug: string }> }
) {
  try {
    const { username, slug } = await params;
    const body = await request.json();

    // Resolve the form via workspace endpoint to get the canonical slug
    const formRes = await fetch(
      `${BACKEND_URL}/api/forms/public/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
    );
    const formData = await formRes.json();

    if (!formData.success || !formData.form?.slug) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    const formSlug = formData.form.slug;
    const response = await fetch(`${BACKEND_URL}/api/forms/public/${formSlug}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For":
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown",
        "User-Agent": request.headers.get("user-agent") || "",
        Referer: request.headers.get("referer") || "",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in POST /api/forms/workspace/[username]/[slug]:", error);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
