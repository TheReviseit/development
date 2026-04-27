/**
 * Blog Schema — Article Structured Data with E-E-A-T Signals
 * ============================================================
 *
 * Generates Google-compliant Article schema for blog posts.
 * Every blog post MUST use this generator to ensure proper
 * E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals.
 *
 * CRITICAL E-E-A-T REQUIREMENTS:
 *   - authorName MUST be a real person's name (not "Flowauxi Team")
 *   - authorUrl MUST link to a real author profile page (/about/[author-slug])
 *   - authorTitle SHOULD include verifiable credentials
 *   - datePublished and dateModified MUST be accurate
 *   - wordCount MUST match the actual article word count
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/article
 */

/**
 * Generate Article schema for blog posts.
 *
 * Usage in blog page components:
 *   const schema = generateBlogSchema({
 *     title: "How to Sell on WhatsApp in 2026",
 *     description: "...",
 *     url: "https://www.flowauxi.com/blog/how-to-sell-on-whatsapp",
 *     imageUrl: "https://www.flowauxi.com/og-blog-whatsapp.png",
 *     datePublished: "2026-03-15",
 *     dateModified: "2026-04-01",
 *     authorName: "Real Author Name",
 *     authorUrl: "https://www.flowauxi.com/about/real-author-name",
 *     authorTitle: "Content Lead, Flowauxi",
 *     wordCount: 3500,
 *   });
 */
export function generateBlogSchema(data: {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
  authorUrl: string;
  authorTitle: string;
  wordCount: number;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.title,
    description: data.description,
    url: data.url,
    image: {
      "@type": "ImageObject",
      url: data.imageUrl,
      width: 1200,
      height: 630,
    },
    datePublished: data.datePublished,
    dateModified: data.dateModified,
    author: {
      "@type": "Person",
      name: data.authorName,
      url: data.authorUrl,
      jobTitle: data.authorTitle,
      worksFor: {
        "@type": "Organization",
        name: "Flowauxi Technologies",
        url: "https://www.flowauxi.com",
      },
    },
    publisher: {
      "@type": "Organization",
      name: "Flowauxi",
      url: "https://www.flowauxi.com",
      logo: {
        "@type": "ImageObject",
        url: "https://www.flowauxi.com/icon-512.png",
      },
    },
    wordCount: data.wordCount,
    inLanguage: "en-US",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": data.url,
    },
  };
}