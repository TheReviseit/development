/**
 * Metadata generation for showcase pages
 * SEO optimization with OpenGraph support
 */

import { Metadata } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

interface Props {
  params: Promise<{
    username: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  try {
    // Fetch showcase data for metadata
    const response = await fetch(`${BACKEND_URL}/api/showcase/${username}`, {
      next: { revalidate: 300 }, // Cache for 5 minutes (metadata changes infrequently)
    });

    if (!response.ok) {
      return {
        title: "Showcase Not Found",
        description: "This showcase does not exist or has been removed.",
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        title: "Showcase Not Found",
        description: "This showcase does not exist or has been removed.",
      };
    }

    const { businessName, items, canonicalSlug } = result.data;
    const firstItem = items[0];

    // Build canonical URL
    const canonicalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/showcase/${canonicalSlug || username}`;

    return {
      title: `${businessName} - Showcase`,
      description: firstItem
        ? `Explore ${businessName}'s collection. ${firstItem.title} and more.`
        : `Explore ${businessName}'s showcase collection.`,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title: `${businessName} - Showcase`,
        description: firstItem
          ? `Explore ${businessName}'s collection. ${firstItem.title} and more.`
          : `Explore ${businessName}'s showcase collection.`,
        images: firstItem?.imageUrl
          ? [
              {
                url: firstItem.imageUrl,
                width: 1200,
                height: 630,
                alt: firstItem.title,
              },
            ]
          : [],
        type: "website",
        url: canonicalUrl,
      },
      twitter: {
        card: "summary_large_image",
        title: `${businessName} - Showcase`,
        description: firstItem
          ? `Explore ${businessName}'s collection. ${firstItem.title} and more.`
          : `Explore ${businessName}'s showcase collection.`,
        images: firstItem?.imageUrl ? [firstItem.imageUrl] : [],
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Showcase",
      description: "View our collection",
    };
  }
}

export { default } from "./client-page";
