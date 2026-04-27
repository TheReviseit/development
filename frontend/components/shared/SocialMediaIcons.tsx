/**
 * Social Media Icons Component (4 Core Platforms)
 * 
 * A production-grade, reusable social media icons component supporting
 * only the 4 core platforms: LinkedIn, X (Twitter), YouTube, Instagram
 * 
 * Features:
 * - Type-safe platform support (4 platforms only)
 * - Configurable via environment variables
 * - Accessible (ARIA labels, keyboard navigation)
 * - Multiple visual variants
 * - Optimized for performance (memoized)
 * - SEO-friendly
 * 
 * @module components/shared/SocialMediaIcons
 * @production-grade
 * 
 * @example
 * ```tsx
 * // Basic usage - shows all 4 configured platforms
 * <SocialMediaIcons />
 * 
 * // With custom styling
 * <SocialMediaIcons 
 *   variant="filled" 
 *   color="brand" 
 *   size={32}
 *   className="my-social-links"
 * />
 * ```
 */

'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Linkedin, Youtube, Instagram } from 'lucide-react';
import type {
  SocialMediaIconsProps,
  SocialPlatformConfig,
  SocialPlatform,
} from '@/types/social-media';
import { PLATFORM_METADATA } from '@/types/social-media';

// ============================================================================
// Icon Components (4 Core Platforms Only)
// ============================================================================

/**
 * X (Twitter) Icon Component
 */
const XIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// ============================================================================
// Icon Map (4 Core Platforms)
// ============================================================================

const ICON_MAP: Record<SocialPlatform, React.FC<{ size?: number; className?: string }>> = {
  linkedin: Linkedin,
  x: XIcon,
  youtube: Youtube,
  instagram: Instagram,
};

// ============================================================================
// Configuration - Hardcoded for SSR/CSR Consistency
// ============================================================================

/**
 * Hardcoded configuration to prevent hydration mismatches.
 * Environment variables are read at build time and baked into the component.
 */
const SOCIAL_CONFIG = ([
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN || '',
    external: true,
    enabled: true,
  },
  {
    id: 'x',
    name: 'X',
    url: process.env.NEXT_PUBLIC_SOCIAL_X || '',
    external: true,
    enabled: true,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || '',
    external: true,
    enabled: true,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || '',
    external: true,
    enabled: true,
  },
  // NOTE: Keep this list limited to the 4 core platforms defined in SocialPlatform.
] satisfies SocialPlatformConfig[]).filter(
  (platform) => platform.url && platform.url.trim() !== '',
);

// Default fallback configuration
const DEFAULT_CONFIG = [
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://instagram.com/flowauxi',
    external: true,
    enabled: true,
  },
] satisfies SocialPlatformConfig[];

// ============================================================================
// Individual Icon Component
// ============================================================================

interface SocialIconButtonProps {
  platform: SocialPlatformConfig;
  size: number;
  variant: NonNullable<SocialMediaIconsProps['variant']>;
  color: NonNullable<SocialMediaIconsProps['color']>;
  className?: string;
  showTooltip?: boolean;
  onClick?: (platform: SocialPlatformConfig) => void;
  brandName?: string;
}

const SocialIconButton: React.FC<SocialIconButtonProps> = React.memo(({
  platform,
  size,
  variant,
  color,
  className = '',
  showTooltip = false,
  onClick,
  brandName,
}) => {
  const IconComponent = ICON_MAP[platform.id];
  const metadata = PLATFORM_METADATA[platform.id];
  
  const ariaLabel = platform.ariaLabel || metadata.defaultAriaLabel(brandName);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick(platform);
    }
  }, [onClick, platform]);

  // Style variants
  const getVariantStyles = (): string => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    switch (variant) {
      case 'filled':
        return `${baseStyles} hover:scale-110`;
      case 'outlined':
        return `${baseStyles} border-2 hover:scale-110`;
      case 'minimal':
        return `${baseStyles} hover:scale-110 hover:opacity-80`;
      case 'default':
      default:
        return `${baseStyles} hover:scale-110 hover:opacity-80`;
    }
  };

  const getColorStyles = (): string => {
    switch (color) {
      case 'brand':
        return '';
      case 'white':
        return 'text-white';
      case 'dark':
        return 'text-gray-900';
      case 'current':
      default:
        return 'text-current';
    }
  };

  const getSizeStyles = (): string => {
    const padding = variant === 'minimal' ? 'p-1' : variant === 'outlined' ? 'p-2' : 'p-2';
    return padding;
  };

  const linkProps = platform.external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <a
      href={platform.url}
      className={`${getVariantStyles()} ${getColorStyles()} ${getSizeStyles()} ${className}`}
      aria-label={ariaLabel}
      title={showTooltip ? metadata.name : undefined}
      onClick={onClick ? handleClick : undefined}
      {...linkProps}
      style={color === 'brand' ? { color: metadata.brandColor } : undefined}
    >
      <IconComponent size={size} className="block" />
    </a>
  );
});

SocialIconButton.displayName = 'SocialIconButton';

// ============================================================================
// Main Component
// ============================================================================

/**
 * SocialMediaIcons Component
 * 
 * A production-grade social media icons component that reads configuration
 * from environment variables and renders accessible, styled icon links.
 * 
 * Supports only 4 core platforms: LinkedIn, X, YouTube, Instagram
 */
export const SocialMediaIcons: React.FC<SocialMediaIconsProps> = React.memo(({
  className = '',
  iconClassName = '',
  size = 24,
  variant = 'default',
  color = 'current',
  filter,
  limit = 0,
  showTooltips = false,
  onIconClick,
  gap = 12,
}) => {
  // Prevent hydration mismatch by only rendering on client
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use hardcoded config to ensure SSR/CSR consistency
  const platforms = useMemo(() => {
    const config = SOCIAL_CONFIG.length > 0 ? SOCIAL_CONFIG : DEFAULT_CONFIG;
    return config;
  }, []);

  // Filter and limit platforms
  const visiblePlatforms = useMemo(() => {
    let filtered = platforms;
    
    if (filter && filter.length > 0) {
      filtered = platforms.filter(p => filter.includes(p.id));
    }
    
    if (limit > 0 && limit < filtered.length) {
      filtered = filtered.slice(0, limit);
    }
    
    return filtered;
  }, [platforms, filter, limit]);

  // Get brand name from environment
  const brandName = useMemo(() => {
    return process.env.NEXT_PUBLIC_COMPANY_NAME || 'Flowauxi';
  }, []);

  // Don't render during SSR to prevent hydration mismatch
  if (!mounted || visiblePlatforms.length === 0) {
    return <div className={`flex items-center flex-wrap ${className}`} style={{ gap: `${gap}px`, minHeight: `${size}px` }} />;
  }

  return (
    <div 
      className={`flex items-center flex-wrap ${className}`}
      style={{ gap: `${gap}px` }}
      role="list"
      aria-label="Social media links"
    >
      {visiblePlatforms.map((platform) => (
        <div key={platform.id} role="listitem">
          <SocialIconButton
            platform={platform}
            size={size}
            variant={variant}
            color={color}
            className={iconClassName}
            showTooltip={showTooltips}
            onClick={onIconClick}
            brandName={brandName}
          />
        </div>
      ))}
    </div>
  );
});

SocialMediaIcons.displayName = 'SocialMediaIcons';

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Hook to get social media configuration
 */
export const useSocialMediaConfig = (): SocialPlatformConfig[] => {
  return useMemo(() => {
    return SOCIAL_CONFIG.length > 0 ? SOCIAL_CONFIG : DEFAULT_CONFIG;
  }, []);
};

/**
 * Get social media URL for a specific platform
 */
export const getSocialUrl = (platform: SocialPlatform): string | undefined => {
  const found = SOCIAL_CONFIG.find(p => p.id === platform);
  return found?.url;
};

export default SocialMediaIcons;
