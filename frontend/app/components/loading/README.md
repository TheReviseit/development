# SpaceshipLoader Component

A reusable animated spaceship loading component with customizable text.

## Location

- Component: `app/components/loading/SpaceshipLoader.tsx`
- Styles: `app/components/loading/SpaceshipLoader.css`

## Features

- Black background with white animated spaceship
- Centered spaceship with smooth animations
- Trailing particle effects
- Horizontal "fazer" lines moving across screen
- Customizable text (e.g., "Loading", "Redirecting")

## Usage

### Basic Usage (Default "Loading" text)

```tsx
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";

function MyComponent() {
  return <SpaceshipLoader />;
}
```

### Custom Text

```tsx
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";

// Show "Redirecting"
function RedirectPage() {
  return <SpaceshipLoader text="Redirecting" />;
}

// Show "Loading"
function LoadingPage() {
  return <SpaceshipLoader text="Loading" />;
}

// Show custom text
function CustomPage() {
  return <SpaceshipLoader text="Please Wait" />;
}
```

## Props

| Prop | Type   | Default   | Description                                       |
| ---- | ------ | --------- | ------------------------------------------------- |
| text | string | "Loading" | The text to display below the spaceship animation |

## Example Implementation

The component is currently used in:

- `app/onboarding/page.tsx` - Shows "Loading" while checking authentication

You can use it anywhere you need a loading state:

```tsx
if (loading) {
  return <SpaceshipLoader text="Loading" />;
}

if (redirecting) {
  return <SpaceshipLoader text="Redirecting" />;
}
```
