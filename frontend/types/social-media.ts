/**
 * Social Media Configuration Types
 * 
 * Production-grade type definitions for social media platform configuration.
 * These types ensure type safety across all social media components.
 * 
 * @module types/social-media
 */

/**
 * Supported social media platforms (Limited to 4 core platforms)
 * - LinkedIn: Professional networking
 * - X (Twitter): Microblogging
 * - YouTube: Video content
 * - Instagram: Visual content
 */
export type SocialPlatform = 
  | 'linkedin' 
  | 'x'
  | 'youtube' 
  | 'instagram';

/**
 * Configuration for a single social media platform
 */
export interface SocialPlatformConfig {
  /** Unique identifier for the platform */
  id: SocialPlatform;
  /** Display name for the platform */
  name: string;
  /** Full URL to the profile/page */
  url: string;
  /** Whether the link should open in a new tab */
  external?: boolean;
  /** Custom aria-label for accessibility (optional, uses default if not provided) */
  ariaLabel?: string;
  /** Whether to show this platform (defaults to true if URL is provided) */
  enabled?: boolean;
}

/**
 * Complete social media configuration object
 */
export interface SocialMediaConfig {
  /** Array of configured platforms */
  platforms: SocialPlatformConfig[];
  /** Default target behavior for external links */
  defaultExternal?: boolean;
  /** Company/brand name for default aria labels */
  brandName?: string;
}

/**
 * Props for the SocialMediaIcons component
 */
export interface SocialMediaIconsProps {
  /** CSS class for the container */
  className?: string;
  /** CSS class for individual icon buttons */
  iconClassName?: string;
  /** Size of the icons in pixels */
  size?: number;
  /** Variant style for the icons */
  variant?: 'default' | 'filled' | 'outlined' | 'minimal';
  /** Color theme */
  color?: 'current' | 'brand' | 'white' | 'dark';
  /** Filter to only show specific platforms */
  filter?: SocialPlatform[];
  /** Maximum number of platforms to show (0 = all) */
  limit?: number;
  /** Whether to show tooltips on hover */
  showTooltips?: boolean;
  /** Custom click handler */
  onIconClick?: (platform: SocialPlatformConfig) => void;
  /** Gap between icons in pixels */
  gap?: number;
}

/**
 * Props for individual social icon component
 */
export interface SocialIconProps {
  platform: SocialPlatformConfig;
  size?: number;
  variant?: SocialMediaIconsProps['variant'];
  color?: SocialMediaIconsProps['color'];
  className?: string;
  showTooltip?: boolean;
  onClick?: (platform: SocialPlatformConfig) => void;
}

/**
 * Icon component type definition
 */
export type SocialIconComponent = React.FC<{
  size?: number;
  className?: string;
}>;

/**
 * Platform metadata for rendering
 */
export interface PlatformMetadata {
  name: string;
  brandColor: string;
  defaultAriaLabel: (brandName?: string) => string;
}

/**
 * Map of platform metadata (4 Core Platforms Only)
 */
export const PLATFORM_METADATA: Record<SocialPlatform, PlatformMetadata> = {
  linkedin: {
    name: 'LinkedIn',
    brandColor: '#0A66C2',
    defaultAriaLabel: (brand) => brand ? `Follow ${brand} on LinkedIn` : 'Follow us on LinkedIn',
  },
  x: {
    name: 'X',
    brandColor: '#000000',
    defaultAriaLabel: (brand) => brand ? `Follow ${brand} on X` : 'Follow us on X',
  },
  youtube: {
    name: 'YouTube',
    brandColor: '#FF0000',
    defaultAriaLabel: (brand) => brand ? `Subscribe to ${brand} on YouTube` : 'Subscribe to our YouTube channel',
  },
  instagram: {
    name: 'Instagram',
    brandColor: '#E4405F',
    defaultAriaLabel: (brand) => brand ? `Follow ${brand} on Instagram` : 'Follow us on Instagram',
  },
};
