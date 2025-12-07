"use server";

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dd2o44hzs",
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || "962159667733394",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "yGhhTwYvx4HZ2LH57bpxEYMZEeM",
});

export async function getSignature() {
  const timestamp = Math.round(new Date().getTime() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder: "reviseit/profile-pictures",
    },
    process.env.CLOUDINARY_API_SECRET || "yGhhTwYvx4HZ2LH57bpxEYMZEeM"
  );

  return { timestamp, signature };
}
