"use server";

import { v2 as cloudinary } from "cloudinary";

// ⚠️ IMPORTANT: Ensure these environment variables are set
// Never use hardcoded values for secrets
if (!process.env.CLOUDINARY_API_SECRET) {
  throw new Error(
    "CLOUDINARY_API_SECRET is required. Please set it in your .env file."
  );
}

if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  throw new Error(
    "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is required. Please set it in your .env file."
  );
}

if (!process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY) {
  throw new Error(
    "NEXT_PUBLIC_CLOUDINARY_API_KEY is required. Please set it in your .env file."
  );
}

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function getSignature() {
  const timestamp = Math.round(new Date().getTime() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder: "flowauxi/profile-pictures",
    },
    process.env.CLOUDINARY_API_SECRET!
  );

  return { timestamp, signature };
}

/**
 * Generate a secure signature for product image uploads.
 * Uses multi-tenant folder structure for proper isolation:
 * flowauxi/users/{userId}/products/{productId}/
 */
export async function getProductImageSignature(
  userId: string,
  productId: string
) {
  const timestamp = Math.round(new Date().getTime() / 1000);

  // Multi-tenant folder structure: flowauxi/users/{userId}/products/
  const folder = `flowauxi/users/${userId}/products`;

  // Only sign the essential parameters
  const params = {
    timestamp,
    folder,
  };

  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET!
  );

  return {
    timestamp,
    signature,
    folder,
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  };
}

/**
 * Delete a product image from Cloudinary.
 * @param publicId The public_id of the image to delete
 */
export async function deleteProductImage(publicId: string) {
  if (!publicId) {
    return { success: false, error: "No public ID provided" };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return { success: result.result === "ok", result };
  } catch (error) {
    console.error("Failed to delete product image:", error);
    return { success: false, error: String(error) };
  }
}
