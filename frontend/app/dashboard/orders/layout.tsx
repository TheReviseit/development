import SubscriptionGate from "@/app/dashboard/components/SubscriptionGate";

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SubscriptionGate requiredProduct="shop">{children}</SubscriptionGate>;
}
