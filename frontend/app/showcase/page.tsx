import ShowcaseNavbar from "./components/ShowcaseNavbar";
import ShowcaseHero from "./components/ShowcaseHero";
import ShowcaseBrands from "./components/ShowcaseBrands";

export const metadata = {
  title: "Flowauxi Pages | Showcase & Portfolio Builder",
  description: "Drive Sales Growth, And Harness Ai-Powered User Content. Grow+ faster than ever.",
};

export default function ShowcaseLandingPage() {
  return (
    <div style={{ backgroundColor: "#fff", minHeight: "100vh", overflowX: "hidden" }}>
      <ShowcaseNavbar />
      <ShowcaseHero />
      <ShowcaseBrands />
    </div>
  );
}
