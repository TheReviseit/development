/**
 * Shop Landing Page Layout — Pass-Through
 *
 * This layout exists for the (shop) route group.
 * 
 * IMPORTANT: Do NOT generate metadata or inject schemas here.
 * The root layout.tsx handles domain-aware metadata (generateDomainMetadata)
 * and schema injection (schema firewall) for all subdomains.
 * Adding metadata here would CONFLICT with the root layout and cause
 * duplicate titles like "Title | Flowauxi Shop | Flowauxi Shop".
 */

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
