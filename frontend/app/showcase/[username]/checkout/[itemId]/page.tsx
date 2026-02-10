import { use } from "react";
import CheckoutClientPage from "./client";

interface PageProps {
  params: Promise<{
    username: string;
    itemId: string;
  }>;
}

export default function CheckoutPage({ params }: PageProps) {
  const resolvedParams = use(params);
  return (
    <CheckoutClientPage
      username={resolvedParams.username}
      itemId={resolvedParams.itemId}
    />
  );
}
