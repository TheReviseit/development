/**
 * Navigation Type Definitions
 *
 * Shared interface for all per-product sidebar nav definitions.
 * Used by ShopSidebar, BookingSidebar, DashboardSidebar, etc.
 */

export interface SubNavItem {
  id: string;
  label: string;
  href: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string; // Icon component name (resolved at render time)
  badge?: number;
  href: string;
  subItems?: SubNavItem[];
}
