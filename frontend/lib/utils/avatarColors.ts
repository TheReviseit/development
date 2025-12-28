/**
 * Avatar Color System
 * Provides consistent colors for user avatars across the app
 * Colors are randomly assigned per session but stay consistent
 */

export interface AvatarColor {
  id: string;
  background: string;
  text: string;
}

// 5 distinct avatar color schemes
export const AVATAR_COLORS: AvatarColor[] = [
  { id: "teal", background: "#00bcd4", text: "#000000" },
  { id: "purple", background: "#9c27b0", text: "#ffffff" },
  { id: "green", background: "#4caf50", text: "#ffffff" },
  { id: "orange", background: "#ff9800", text: "#000000" },
  { id: "pink", background: "#e91e63", text: "#ffffff" },
];

// Session storage key
const AVATAR_COLOR_KEY = "avatarColorIndex";

/**
 * Get a random avatar color index and store it for the session
 */
function getSessionColorIndex(): number {
  if (typeof window === "undefined") return 0;

  // Check if we already have a color for this session
  const stored = sessionStorage.getItem(AVATAR_COLOR_KEY);
  if (stored !== null) {
    return parseInt(stored, 10);
  }

  // Generate random index and store it
  const randomIndex = Math.floor(Math.random() * AVATAR_COLORS.length);
  sessionStorage.setItem(AVATAR_COLOR_KEY, randomIndex.toString());
  return randomIndex;
}

/**
 * Get the avatar color for the current session
 * This will be consistent across all components during a session
 */
export function getSessionAvatarColor(): AvatarColor {
  const index = getSessionColorIndex();
  return AVATAR_COLORS[index];
}

/**
 * Get a deterministic avatar color based on a string (e.g., user ID, name)
 * Useful when you need consistent colors for different contacts
 */
export function getAvatarColorByString(str: string): AvatarColor {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Get avatar color by explicit index (0-4)
 */
export function getAvatarColorByIndex(index: number): AvatarColor {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
