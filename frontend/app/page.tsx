import { homeMetadata } from "./metadata";
import HomePageContent from "./components/HomePageContent";

// Export metadata for SEO (only works in server components)
export const metadata = homeMetadata;

export default function Home() {
  return <HomePageContent />;
}
