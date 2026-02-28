import SubscriptionGate from "@/app/dashboard/components/SubscriptionGate";

export default function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionGate requiredProduct="marketing">{children}</SubscriptionGate>
  );
}
