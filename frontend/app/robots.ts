import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/dashboard/",
          "/settings/",
          "/onboarding/",
          "/test-google-auth/",
          "/whatsapp-admin/",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/dashboard/",
          "/settings/",
          "/onboarding/",
          "/test-google-auth/",
          "/whatsapp-admin/",
        ],
        crawlDelay: 0,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/dashboard/",
          "/settings/",
          "/onboarding/",
          "/test-google-auth/",
          "/whatsapp-admin/",
        ],
      },
    ],
    sitemap: "https://www.flowauxi.com/sitemap.xml",
  };
}
