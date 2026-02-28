import SubscriptionGate from "@/app/dashboard/components/SubscriptionGate";

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionGate requiredProduct="showcase">{children}</SubscriptionGate>
  );
}
