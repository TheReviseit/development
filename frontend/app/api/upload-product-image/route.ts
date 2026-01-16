import { NextRequest, NextResponse } from "next/server";
import { getProductImageSignature, deleteProductImage } from "@/lib/cloudinary";
import { adminAuth } from "@/lib/firebase-admin";

/**
 * POST /api/upload-product-image
 * Generate a secure signature for uploading a product image to Cloudinary.
 * Uses multi-tenant folder structure: flowauxi/users/{userId}/products/
 * Gets userId from Firebase session for security.
 */
export async function POST(request: NextRequest) {
  try {
    // Get userId from session cookie (secure server-side auth)
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(
        sessionCookie,
        true
      );
      userId = decodedClaims.uid;
    } catch (authError) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const signatureData = await getProductImageSignature(userId, productId);

    return NextResponse.json(signatureData);
  } catch (error) {
    console.error("Failed to generate upload signature:", error);
    return NextResponse.json(
      { error: "Failed to generate upload signature" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload-product-image
 * Delete a product image from Cloudinary.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { publicId } = await request.json();

    if (!publicId) {
      return NextResponse.json(
        { error: "publicId is required" },
        { status: 400 }
      );
    }

    const result = await deleteProductImage(publicId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete image" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete product image:", error);
    return NextResponse.json(
      { error: "Failed to delete product image" },
      { status: 500 }
    );
  }
}
