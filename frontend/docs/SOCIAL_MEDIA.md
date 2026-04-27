# Social Media Configuration (4 Core Platforms)

This document outlines how to configure social media links in the Flowauxi application.

## Supported Platforms (4 Only)

The system supports exactly **4 core social media platforms**:

| Platform  | Environment Variable              | Icon Type   | Brand Color |
|-----------|-----------------------------------|-------------|-------------|
| LinkedIn  | `NEXT_PUBLIC_SOCIAL_LINKEDIN`     | lucide      | #0A66C2     |
| X         | `NEXT_PUBLIC_SOCIAL_X`            | custom SVG  | #000000     |
| YouTube   | `NEXT_PUBLIC_SOCIAL_YOUTUBE`      | lucide      | #FF0000     |
| Instagram | `NEXT_PUBLIC_SOCIAL_INSTAGRAM`    | lucide      | #E4405F     |

## Environment Variables

Add the following to your `.env` file:

```env
# ═══════════════════════════════════════════════════════════════════
# Social Media Links (4 Core Platforms Only)
# ═══════════════════════════════════════════════════════════════════

NEXT_PUBLIC_SOCIAL_LINKEDIN=https://linkedin.com/company/flowauxi
NEXT_PUBLIC_SOCIAL_X=https://x.com/flowauxi
NEXT_PUBLIC_SOCIAL_YOUTUBE=https://youtube.com/@flowauxi
NEXT_PUBLIC_SOCIAL_INSTAGRAM=https://instagram.com/flowauxi
```

**Note:** Only these 4 platforms are supported. If you need additional platforms, you must modify the source code.

## Usage

### Basic Usage

```tsx
import { SocialMediaIcons } from '@/components/shared/SocialMediaIcons';

// Renders all 4 configured platforms
<SocialMediaIcons />
```

### With Custom Styling

```tsx
<SocialMediaIcons 
  variant="filled" 
  color="brand" 
  size={32}
  className="my-social-links"
  gap={16}
/>
```

### Filter Specific Platforms

```tsx
<SocialMediaIcons 
  filter={['linkedin', 'instagram']}
/>
```

### Available Variants

- `default` - Simple hover effect
- `filled` - Filled background on hover
- `outlined` - Bordered style
- `minimal` - No padding, just the icon

### Available Colors

- `current` - Uses current text color (default)
- `brand` - Uses platform's brand color
- `white` - White icons
- `dark` - Dark icons

## Component API

### Props

| Prop          | Type                                    | Default    | Description                           |
|---------------|-----------------------------------------|------------|---------------------------------------|
| `className`   | `string`                                | `''`       | CSS class for the container           |
| `iconClassName`| `string`                               | `''`       | CSS class for individual icons        |
| `size`        | `number`                                | `24`       | Icon size in pixels                   |
| `variant`     | `'default' \| 'filled' \| 'outlined' \| 'minimal'` | `'default'` | Visual variant           |
| `color`       | `'current' \| 'brand' \| 'white' \| 'dark'` | `'current'` | Color theme                    |
| `filter`      | `('linkedin' \| 'x' \| 'youtube' \| 'instagram')[]` | `undefined`| Filter to specific platforms |
| `limit`       | `number`                                | `0`        | Maximum icons to show (0 = all)       |
| `showTooltips`| `boolean`                               | `false`    | Show tooltips on hover                |
| `onIconClick` | `(platform) => void`                    | `undefined`| Custom click handler                  |
| `gap`         | `number`                                | `12`       | Gap between icons in pixels           |

## Accessibility

The component includes the following accessibility features:

- Proper ARIA labels for each icon
- Keyboard navigation support
- Screen reader announcements
- Focus indicators
- Semantic HTML (role="list")

## Default Fallback

If no social media URLs are configured, the component will display only Instagram with the URL `https://instagram.com/flowauxi`.

## Migration Guide

### From Hardcoded Icons

Before:
```tsx
<div className="social-links">
  <a href="#linkedin" aria-label="LinkedIn">
    <svg>...</svg>
  </a>
  <a href="#twitter" aria-label="Twitter">
    <svg>...</svg>
  </a>
</div>
```

After:
```tsx
import { SocialMediaIcons } from '@/components/shared/SocialMediaIcons';

<SocialMediaIcons />
```

Then add to your `.env`:
```env
NEXT_PUBLIC_SOCIAL_LINKEDIN=https://linkedin.com/company/yourcompany
NEXT_PUBLIC_SOCIAL_X=https://x.com/yourhandle
```

## Limitations

- **Only 4 platforms supported**: LinkedIn, X, YouTube, Instagram
- To add more platforms, modify:
  1. `types/social-media.ts` - Add platform to type and metadata
  2. `components/shared/SocialMediaIcons.tsx` - Add icon component and mapping
