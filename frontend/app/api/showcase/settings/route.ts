/**
 * Next.js API Route: GET /api/showcase/settings
 *
 * Returns validated config with fallback to defaults
 */

import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export async function GET(request: Request) {
  try {
    // TODO: Get userId from auth session
    const userId = "temp-user-id"; // Replace with actual auth

    const response = await fetch(
      `${BACKEND_URL}/api/showcase/settings?userId=${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      // Return defaults if backend fails
      return NextResponse.json({
        version: 1,
        presentation: {
          version: 1,
          fields: {
            price: { visible: false },
            colors: { visible: false },
            sizes: { visible: false },
            stock: { visible: false },
            category: { visible: true },
            description: { visible: true },
          },
          actions: {
            order: { enabled: false, label: "Order Now" },
            book: { enabled: false, label: "Book Now" },
          },
          layout: {
            type: "standard",
            imageRatio: "1:1",
          },
        },
        contentType: "generic",
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching settings:", error);

    // Return defaults on error
    return NextResponse.json({
      version: 1,
      presentation: {
        version: 1,
        fields: {
          price: { visible: false },
          colors: { visible: false },
          sizes: { visible: false },
          stock: { visible: false },
          category: { visible: true },
          description: { visible: true },
        },
        actions: {
          order: { enabled: false, label: "Order Now" },
          book: { enabled: false, label: "Book Now" },
        },
        layout: {
          type: "standard",
          imageRatio: "1:1",
        },
      },
      contentType: "generic",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/showcase/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error || "Failed to save settings" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
