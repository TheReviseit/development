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
      folder: "reviseit/profile-pictures",
    },
    process.env.CLOUDINARY_API_SECRET!
  );

  return { timestamp, signature };
}
