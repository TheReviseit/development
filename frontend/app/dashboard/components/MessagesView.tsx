"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { supabase } from "@/lib/supabase/client";
import { useNotification } from "@/app/hooks/useNotification";
import { usePushNotification } from "@/app/hooks/usePushNotification";
import NotificationBanner from "./NotificationBanner";
import styles from "../dashboard.module.css";
import msgStyles from "./MessagesView.module.css";

interface Conversation {
  id: string;
  name: string;
  phone: string;
  profilePic?: string;
  lastMessage: string;
  lastMessageType?: string;
  time: string;
  timestamp: string;
  unread: number;
  totalMessages?: number;
  online: boolean;
  // AI stats
  aiReplies?: number;
  humanReplies?: number;
  language?: string;
  // Status
  status?: string;
  priority?: string;
  tags?: string[];
  // AI enabled toggle
  aiEnabled?: boolean;
}

interface Message {
  id: string;
  messageId: string;
  sender: "contact" | "user";
  content: string;
  time: string;
  timestamp: string;
  type: string;
  status: string;
  mediaUrl?: string;
  mediaId?: string;
  // Thumbnail/preview URLs (async generated)
  thumbnailUrl?: string;
  previewUrl?: string;
  // AI metadata
  isAiGenerated?: boolean;
  intent?: string;
  confidence?: number;
  tokensUsed?: number;
  responseTimeMs?: number;
}

/**
 * Validate that a value is a valid displayable URL
 * Accepts:
 * - http:// / https:// for remote URLs (R2, CDN)
 * - blob: for local file previews (optimistic UI before upload)
 *
 * Guards against base64 data, storage keys, hashes being passed to <img src>
 */
function isValidUrl(value?: string | null): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("blob:"))
  );
}

/**
 * Resolve the best available media URL with priority fallback
 *
 * PRIORITY ORDER (CRITICAL):
 * 1. media_url (original/compressed) - ALWAYS available after R2 upload
 * 2. preview_url (800px) - faster loading if generated
 * 3. thumbnail_url (300px) - smallest, for list views
 *
 * WHY NOT thumbnail first?
 * Thumbnails are generated ASYNC after storage. For newly sent messages,
 * they won't exist yet. Original must be the fallback for reliability.
 *
 * Only returns valid HTTP URLs, never base64/keys
 */
function resolveMediaUrl(msg: {
  thumbnailUrl?: string;
  previewUrl?: string;
  mediaUrl?: string;
}): string | null {
  // PRIORITY: original first (always available), then optimized variants
  if (isValidUrl(msg.mediaUrl)) return msg.mediaUrl;
  if (isValidUrl(msg.previewUrl)) return msg.previewUrl;
  if (isValidUrl(msg.thumbnailUrl)) return msg.thumbnailUrl;
  return null;
}

interface ContactInfo {
  phone: string;
  name: string;
  profilePic?: string;
  totalMessages?: number;
  aiReplies?: number;
  humanReplies?: number;
  language?: string;
  tags?: string[];
  status?: string;
  firstMessageAt?: string;
}

// GLOBAL media cache with status tracking - prevents duplicate fetches
// Status machine: idle → loading → ready | failed
type MediaStatus = "idle" | "loading" | "ready" | "failed";
const mediaStatusCache = new Map<string, MediaStatus>(); // messageId → status
const mediaUrlCache = new Map<string, string>(); // messageId → mediaUrl

// Helper: decode image before paint to prevent layout shift
const preloadImage = async (url: string): Promise<void> => {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    // Decode failed, image will still render but may cause layout shift
  }
};

// Lazy loading image component for inbound media
// ENTERPRISE-GRADE with robust error handling:
// - Local failed state prevents infinite re-render loops
// - Retry mechanism for temporary network failures
// - Graceful fallback UI instead of broken images
// - Blob URL validation to prevent revoked blob errors
const LazyImage = memo(function LazyImage({
  mediaId,
  mediaUrl,
  messageId,
  conversationId,
  time,
  sender,
  onImageLoad,
  onImageClick,
}: {
  mediaId?: string;
  mediaUrl?: string;
  messageId: string;
  conversationId: string;
  time: string;
  sender: "contact" | "user";
  onImageLoad?: () => void;
  onImageClick?: (imageUrl: string) => void;
}) {
  // Local state for this component instance - prevents re-render loops
  const [localFailed, setLocalFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  // ✅ DERIVED STATE with URL validation
  // Priority: validated prop > validated cache > null
  // CRITICAL: Only valid HTTP/blob URLs are allowed
  const rawUrl = mediaUrl || mediaUrlCache.get(messageId) || null;
  const resolvedUrl = isValidUrl(rawUrl) ? rawUrl : null;

  // Check if blob URL is still valid (not revoked)
  // Blob URLs become invalid after URL.revokeObjectURL() is called
  const isBlobUrl = resolvedUrl?.startsWith("blob:");

  // Get status from global status cache
  // Cast to full MediaStatus type for proper TypeScript inference
  const globalStatus = (mediaStatusCache.get(messageId) ||
    "idle") as MediaStatus;

  // Combine global and local failed states
  const isFailed = localFailed || globalStatus === "failed";

  // Compute loading state
  // Note: !isFailed already guarantees globalStatus !== "failed"
  const isLoading =
    !isFailed && (globalStatus === "loading" || (!resolvedUrl && !!mediaId));

  // Should we attempt to render an image?
  // Only render if we have a valid URL and haven't failed
  const shouldRenderImage = resolvedUrl && !isFailed;

  // Cache-busted URL for retries - forces browser to bypass cached failed response
  // This is critical for WhatsApp/Meta URLs where auth tokens can expire
  const displayUrl = useMemo(() => {
    if (!resolvedUrl) return null;
    if (retryCount === 0) return resolvedUrl;
    // Don't cache-bust blob URLs
    if (resolvedUrl.startsWith("blob:")) return resolvedUrl;
    // Add timestamp to force fresh fetch
    const separator = resolvedUrl.includes("?") ? "&" : "?";
    return `${resolvedUrl}${separator}_retry=${Date.now()}`;
  }, [resolvedUrl, retryCount]);

  // Retry handler with cache busting
  const handleRetry = useCallback(() => {
    if (retryCount < MAX_RETRIES) {
      setLocalFailed(false);
      setRetryCount((c) => c + 1);
      // Clear global failed status to allow retry
      if (messageId) {
        mediaStatusCache.set(messageId, "idle");
      }
      console.log(
        `🔄 [LazyImage] Retry ${retryCount + 1}/${MAX_RETRIES} for ${messageId?.slice(-8)}`,
      );
    }
  }, [retryCount, messageId]);

  // Error handler with detailed logging and graceful degradation
  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const src = img.getAttribute("src") || "(no src)";

      // Detailed error logging for debugging
      console.warn(
        `⚠️ [LazyImage] Load failed for ${messageId?.slice(-8) || "unknown"}:`,
        {
          src: src.startsWith("blob:")
            ? "blob:..."
            : src.substring(0, 60) + "...",
          isBlobUrl: src.startsWith("blob:"),
          retryCount,
          naturalSize: `${img.naturalWidth}x${img.naturalHeight}`,
          complete: img.complete,
        },
      );

      // Set local failed state to prevent broken image display
      setLocalFailed(true);

      // Update global cache
      if (messageId) {
        mediaStatusCache.set(messageId, "failed");
      }
    },
    [messageId, retryCount],
  );

  // Handle image click for zoom
  const handleClick = useCallback(() => {
    if (displayUrl && onImageClick && shouldRenderImage) {
      onImageClick(displayUrl);
    }
  }, [displayUrl, onImageClick, shouldRenderImage]);

  // ✅ ALWAYS render a container with fixed dimensions
  // WhatsApp pattern: never conditionally hide the image wrapper
  return (
    <div className={msgStyles.lazyImageContainer}>
      {/* Image or placeholder - conditional INSIDE container */}
      {shouldRenderImage && displayUrl ? (
        // ✅ RENDER IMAGE with cache-busted URL
        <img
          key={`${messageId}-${retryCount}`} // Force remount on retry
          src={displayUrl}
          alt="Image"
          className={`${msgStyles.lazyImage} ${msgStyles.clickableImage}`}
          onClick={handleClick}
          style={{ cursor: onImageClick ? "pointer" : "default" }}
          onError={handleImageError}
          onLoad={() => {
            // Successfully loaded - ensure status is correct
            if (messageId) {
              mediaStatusCache.set(messageId, "ready");
            }
            // Notify parent that image loaded (for scroll handling)
            onImageLoad?.();
          }}
        />
      ) : isLoading ? (
        // ⏳ LOADING SKELETON
        <div className={msgStyles.imageSkeleton}>
          <div className={msgStyles.imageSpinner} />
        </div>
      ) : (
        // ❌ FAILED/UNAVAILABLE - with optional retry
        <div
          className={`${msgStyles.imageFailed} ${retryCount < MAX_RETRIES ? msgStyles.retryable : ""}`}
          onClick={retryCount < MAX_RETRIES ? handleRetry : undefined}
          title={retryCount < MAX_RETRIES ? "Click to retry" : undefined}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className={msgStyles.imageFailedText}>
            {retryCount < MAX_RETRIES ? "Tap to retry" : "Image unavailable"}
          </span>
        </div>
      )}

      {/* Timestamp overlay - always shown */}
      <div className={msgStyles.imageTimestamp}>
        <span className={msgStyles.imageTimestampText}>{time}</span>
        {sender === "user" && shouldRenderImage && (
          <span className={msgStyles.imageCheckmarks}>✓✓</span>
        )}
      </div>
    </div>
  );
});

// ============================================
// Image Zoom Viewer Component
// Full-screen image viewer with zoom capabilities
// ============================================
interface ImageZoomViewerProps {
  imageUrl: string;
  onClose: () => void;
}

const ImageZoomViewer = memo(function ImageZoomViewer({
  imageUrl,
  onClose,
}: ImageZoomViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // World-class gesture tracking refs
  const lastTouchDistance = useRef<number | null>(null);
  const lastTapTime = useRef(0);
  const tapCount = useRef(0);
  const tapTimeout = useRef<NodeJS.Timeout | null>(null);
  const isDoubleTapZooming = useRef(false); // Prevents immediate un-zoom
  const gestureState = useRef<"idle" | "pinch" | "pan" | "doubletap">("idle");
  const animationFrame = useRef<number | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTime = useRef(0);
  const lastMovePos = useRef({ x: 0, y: 0 });

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 5;
  const DOUBLE_TAP_DELAY = 300; // ms
  const DOUBLE_TAP_COOLDOWN = 400; // Cooldown after double-tap zoom

  // Reset position when scale changes to 1
  useEffect(() => {
    if (scale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  }, [scale]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Zoom functions with smooth animation
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.3, MAX_SCALE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s / 1.3, MIN_SCALE));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * delta)));
  }, []);

  // BULLETPROOF double-tap handler with extended cooldown
  const handleDoubleTap = useCallback(() => {
    // CRITICAL: Lock everything immediately
    gestureState.current = "doubletap";
    isDoubleTapZooming.current = true;

    // Clear any pending timeouts
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }

    if (scale > 1.2) {
      // Zoom out to normal
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      // Zoom in to 2.5x
      setScale(2.5);
    }

    // EXTENDED cooldown - 600ms to prevent ANY accidental re-trigger
    setTimeout(() => {
      isDoubleTapZooming.current = false;
      gestureState.current = "idle";
      tapCount.current = 0;
      lastTapTime.current = 0;
    }, 600);
  }, [scale]);

  // Touch start - only track, don't trigger
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Cancel any ongoing animations
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }

      // CRITICAL: If in cooldown, block EVERYTHING
      if (isDoubleTapZooming.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.touches.length === 2) {
        // PINCH GESTURE START
        gestureState.current = "pinch";
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        lastTouchDistance.current = distance;

        // Clear tap tracking - pinch cancels any tap sequence
        tapCount.current = 0;
        lastTapTime.current = 0;
        if (tapTimeout.current) {
          clearTimeout(tapTimeout.current);
          tapTimeout.current = null;
        }
      } else if (e.touches.length === 1) {
        // SINGLE TOUCH START - just record position and time, don't trigger yet
        const touch = e.touches[0];

        // Store touch start position for movement detection
        lastMovePos.current = { x: touch.clientX, y: touch.clientY };
        lastMoveTime.current = Date.now();

        // Only start pan if already zoomed and NOT in a potential tap sequence
        if (scale > 1 && gestureState.current === "idle") {
          // Don't set pan immediately - wait for movement
          setDragStart({
            x: touch.clientX - position.x,
            y: touch.clientY - position.y,
          });
          velocityRef.current = { x: 0, y: 0 };
        }
      }
    },
    [scale, position],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // CRITICAL: Block during cooldown
      if (isDoubleTapZooming.current) {
        e.preventDefault();
        return;
      }

      if (
        e.touches.length === 2 &&
        lastTouchDistance.current &&
        gestureState.current === "pinch"
      ) {
        // PINCH ZOOM
        e.preventDefault();
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const delta = distance / lastTouchDistance.current;
        lastTouchDistance.current = distance;
        setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * delta)));

        // Movement detected - not a tap
        tapCount.current = 0;
      } else if (e.touches.length === 1 && scale > 1) {
        // Check if this is significant movement (> 10px = it's a pan, not tap)
        const touch = e.touches[0];
        const moveDistance = Math.hypot(
          touch.clientX - lastMovePos.current.x,
          touch.clientY - lastMovePos.current.y,
        );

        if (moveDistance > 10) {
          // This is a pan gesture, not a tap
          gestureState.current = "pan";
          setIsDragging(true);
          tapCount.current = 0; // Cancel tap detection

          e.preventDefault();
          const now = Date.now();
          const dt = now - lastMoveTime.current;

          // Calculate velocity for momentum
          if (dt > 0) {
            velocityRef.current = {
              x: ((touch.clientX - lastMovePos.current.x) / dt) * 16,
              y: ((touch.clientY - lastMovePos.current.y) / dt) * 16,
            };
          }

          lastMoveTime.current = now;
          lastMovePos.current = { x: touch.clientX, y: touch.clientY };

          setPosition({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y,
          });
        }
      } else if (e.touches.length === 1) {
        // Check for movement even when not zoomed (for tap detection)
        const touch = e.touches[0];
        const moveDistance = Math.hypot(
          touch.clientX - lastMovePos.current.x,
          touch.clientY - lastMovePos.current.y,
        );

        if (moveDistance > 15) {
          // Too much movement - not a tap
          tapCount.current = 0;
        }
      }
    },
    [isDragging, dragStart, scale],
  );

  // BULLETPROOF: Tap detection on touchEnd
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // CRITICAL: Block during cooldown
      if (isDoubleTapZooming.current) {
        e.preventDefault();
        e.stopPropagation();
        lastTouchDistance.current = null;
        setIsDragging(false);
        return;
      }

      const wasPanning = gestureState.current === "pan";
      const wasPinching = gestureState.current === "pinch";

      lastTouchDistance.current = null;
      setIsDragging(false);

      // If was panning, apply momentum
      if (wasPanning && scale > 1) {
        const velocity = velocityRef.current;
        if (Math.abs(velocity.x) > 0.5 || Math.abs(velocity.y) > 0.5) {
          const animateMomentum = () => {
            velocityRef.current = {
              x: velocityRef.current.x * 0.92,
              y: velocityRef.current.y * 0.92,
            };

            setPosition((prev) => ({
              x: prev.x + velocityRef.current.x,
              y: prev.y + velocityRef.current.y,
            }));

            if (
              Math.abs(velocityRef.current.x) > 0.1 ||
              Math.abs(velocityRef.current.y) > 0.1
            ) {
              animationFrame.current = requestAnimationFrame(animateMomentum);
            } else {
              animationFrame.current = null;
            }
          };
          animationFrame.current = requestAnimationFrame(animateMomentum);
        }
        gestureState.current = "idle";
        return;
      }

      // If was pinching, just reset
      if (wasPinching) {
        gestureState.current = "idle";
        return;
      }

      // TAP DETECTION - only if no significant movement occurred
      const now = Date.now();
      const touchDuration = now - lastMoveTime.current;

      // Only count as tap if touch was short (< 300ms) and state is idle
      if (touchDuration < 300 && gestureState.current === "idle") {
        const timeSinceLastTap = now - lastTapTime.current;

        if (timeSinceLastTap < DOUBLE_TAP_DELAY && tapCount.current === 1) {
          // DOUBLE TAP DETECTED!
          e.preventDefault();
          e.stopPropagation();
          tapCount.current = 0;
          lastTapTime.current = 0;
          handleDoubleTap();
          return;
        }

        // First tap - record it
        lastTapTime.current = now;
        tapCount.current = 1;

        // Reset after delay if no second tap
        if (tapTimeout.current) clearTimeout(tapTimeout.current);
        tapTimeout.current = setTimeout(() => {
          tapCount.current = 0;
          tapTimeout.current = null;
        }, DOUBLE_TAP_DELAY);
      }

      gestureState.current = "idle";
    },
    [scale, handleDoubleTap],
  );

  // Mouse drag handlers for desktop
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
      }
    },
    [scale, position],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && scale > 1) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart, scale],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Close when clicking background (not image)
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === containerRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className={msgStyles.imageZoomViewer}
      ref={containerRef}
      onClick={handleBackgroundClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        className={msgStyles.zoomCloseBtn}
        onClick={onClose}
        title="Close (Esc)"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Zoom controls */}
      <div className={msgStyles.zoomControls}>
        <button
          className={msgStyles.zoomBtn}
          onClick={handleZoomIn}
          title="Zoom in (+)"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <span className={msgStyles.zoomLevel}>{Math.round(scale * 100)}%</span>
        <button
          className={msgStyles.zoomBtn}
          onClick={handleZoomOut}
          title="Zoom out (-)"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button
          className={msgStyles.zoomBtn}
          onClick={handleResetZoom}
          title="Reset zoom (0)"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      {/* Zoomed image */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Zoomed view"
        className={msgStyles.zoomedImage}
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
        }}
        onDoubleClick={handleDoubleTap}
        draggable={false}
      />

      {/* Instructions hint */}
      <div className={msgStyles.zoomHint}>
        Double-tap to zoom • Pinch or scroll to adjust • Drag to pan
      </div>
    </div>
  );
});

// Helper to format time in IST
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
    .toLowerCase();
}

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `${diffMinutes}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays < 7) {
    return `${diffDays}d`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// Helper to format phone numbers nicely
function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    const countryCode = digits.slice(0, digits.length - 10);
    const areaCode = digits.slice(-10, -7);
    const prefix = digits.slice(-7, -4);
    const line = digits.slice(-4);
    if (countryCode) {
      return `+${countryCode} ${areaCode} ${prefix} ${line}`;
    }
    return `(${areaCode}) ${prefix}-${line}`;
  }
  return phone;
}

// Generate consistent random color based on string (name)
const avatarColors = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #667eea 0%, #f093fb 100%)",
  "linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % avatarColors.length;
  return avatarColors[index];
}

// Memoized Message Bubble component to prevent re-rendering on new messages
interface MessageBubbleProps {
  msg: Message;
  styles: Record<string, string>;
  conversationId: string;
  onImageLoad?: () => void;
  onImageClick?: (imageUrl: string) => void;
}

const MessageBubble = memo(function MessageBubble({
  msg,
  styles,
  conversationId,
  onImageLoad,
  onImageClick,
}: MessageBubbleProps) {
  const isImageMessage = msg.type === "image";

  return (
    <div
      className={`${styles.messageWrapper} ${
        msg.sender === "user" ? styles.messageOut : styles.messageIn
      }`}
      style={{ marginBottom: "0.75rem" }}
    >
      <div
        className={isImageMessage ? undefined : styles.messageBubble}
        style={isImageMessage ? { padding: 0 } : undefined}
      >
        {msg.type === "text" && (
          <p className={styles.messageText}>{msg.content}</p>
        )}
        {msg.type === "audio" && (
          <div className={styles.audioMessage}>
            <button className={styles.playBtn}>▶</button>
            <div className={styles.audioWave}>
              {[...Array(20)].map((_, i) => (
                <span
                  key={i}
                  className={styles.audioBar}
                  style={{
                    height: `${30 + Math.sin(i * 0.5) * 20}%`,
                  }}
                />
              ))}
            </div>
            <span className={styles.audioDuration}>0:00</span>
          </div>
        )}
        {msg.type === "image" && (
          <div className={msgStyles.imageMessageContainer}>
            <LazyImage
              mediaId={msg.mediaId}
              mediaUrl={resolveMediaUrl(msg) || undefined}
              messageId={msg.id}
              conversationId={conversationId}
              time={msg.time}
              sender={msg.sender}
              onImageLoad={onImageLoad}
              onImageClick={onImageClick}
            />
            {/* Caption display for images - WhatsApp style white bubble */}
            {msg.content && msg.content !== "[image]" && (
              <div className={msgStyles.imageCaption}>{msg.content}</div>
            )}
          </div>
        )}
        {(msg.type === "document" || msg.type === "video") && (
          <div className={styles.imageMessage}>
            {msg.type === "video" && isValidUrl(msg.mediaUrl) ? (
              <video
                src={msg.mediaUrl}
                controls
                style={{
                  maxWidth: "200px",
                  borderRadius: "12px",
                }}
              />
            ) : msg.type === "document" && isValidUrl(msg.mediaUrl) ? (
              <a
                href={msg.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: "0.85rem" }}>Download Document</span>
              </a>
            ) : (
              <div className={styles.imagePlaceholder}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span
                  style={{
                    fontSize: "0.75rem",
                    marginTop: "0.5rem",
                  }}
                >
                  {msg.type === "video" ? "Video" : "Document"}
                </span>
              </div>
            )}
          </div>
        )}
        {/* Hide timestamp for image messages - it's overlaid on the image */}
        {!isImageMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              justifyContent: "flex-end",
            }}
          >
            <span className={styles.messageTime}>{msg.time}</span>
            {msg.sender === "user" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {msg.status === "sending" ? (
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                    <circle
                      cx="8"
                      cy="5.5"
                      r="4"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </svg>
                ) : msg.status === "sent" ? (
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                    <path
                      d="M4 5.5L7 8.5L12 2.5"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : msg.status === "delivered" ? (
                  <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
                    <path
                      d="M1 5.5L4 8.5L9 2.5"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 5.5L9 8.5L14 2.5"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : msg.status === "read" ? (
                  <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
                    <path
                      d="M1 5.5L4 8.5L9 2.5"
                      stroke="#53bdeb"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 5.5L9 8.5L14 2.5"
                      stroke="#53bdeb"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// Memoized DateSeparator component
const DateSeparator = memo(function DateSeparator({
  date,
  styles,
}: {
  date: string;
  styles: Record<string, string>;
}) {
  return (
    <div className={styles.dateSeparator}>
      <span>{date}</span>
    </div>
  );
});

export default function MessagesView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // Media upload states - supports queue of multiple files with per-file captions
  const [selectedFiles, setSelectedFiles] = useState<
    Array<{ file: File; previewUrl: string | null; caption: string }>
  >([]); // Queue of files with individual captions
  const [activeFileIndex, setActiveFileIndex] = useState(0); // Currently previewed file
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false); // Drag-drop overlay state
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null); // Image zoom viewer state
  // Computed values for backward compatibility
  const selectedFile = selectedFiles[activeFileIndex]?.file || null;
  const mediaPreviewUrl = selectedFiles[activeFileIndex]?.previewUrl || null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const messagesRef = useRef<Message[]>([]);
  // Track previous conversation ID to avoid fetching on object updates
  const prevSelectedConversationIdRef = useRef<string | null>(null);
  // Track if this is the initial load to control scroll behavior
  const isInitialLoadRef = useRef(true);
  // Track if user is scrolled near bottom
  const isNearBottomRef = useRef(true);
  // Conversation guard for prefetch - prevents stale responses on fast switching
  const activeConversationRef = useRef<string | null>(null);

  // Infinite scroll pagination state
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);

  // Notification hooks
  const { playSound, showNotification, permissionStatus, requestPermission } =
    useNotification();
  const { isSubscribed, subscribe, foregroundMessage, clearForegroundMessage } =
    usePushNotification();

  // Keep showNotification in a ref to avoid stale closure in useEffect
  const showNotificationRef = useRef(showNotification);
  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);

    // Listen for messages from Service Worker (Notification clicks)
    if ("serviceWorker" in navigator) {
      const handleSWMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === "NOTIFICATION_CLICK") {
          const conversationId = event.data.conversationId;
          if (conversationId) {
            console.log(
              "🖱️ Notification click detected via postMessage:",
              conversationId,
            );
            const conv = conversationsRef.current.find(
              (c) => c.id === conversationId,
            );
            if (conv) {
              setSelectedConversation(conv);
              if (window.innerWidth <= 768) setShowMobileChat(true);
            }
          }
        }
      };

      navigator.serviceWorker.addEventListener("message", handleSWMessage);
      return () => {
        window.removeEventListener("resize", checkMobile);
        navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      };
    }

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);

  // Keep refs in sync with state for use in realtime callback
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync caption input with active file's caption when switching files
  useEffect(() => {
    if (selectedFiles.length > 0 && activeFileIndex < selectedFiles.length) {
      const activeCaption = selectedFiles[activeFileIndex]?.caption || "";
      setMessageInput(activeCaption);
    }
  }, [activeFileIndex, selectedFiles.length]);

  // Update the active file's caption when user types
  const handleCaptionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newCaption = e.target.value;
      setMessageInput(newCaption);

      // Also save to the active file's caption
      if (selectedFiles.length > 0 && activeFileIndex < selectedFiles.length) {
        setSelectedFiles((prev) =>
          prev.map((sf, i) =>
            i === activeFileIndex ? { ...sf, caption: newCaption } : sf,
          ),
        );
      }
    },
    [activeFileIndex, selectedFiles.length],
  );

  // Fetch conversations on mount
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/whatsapp/conversations?filter=${filter}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (data.success) {
        setConversations(data.data);
        // Removed: auto-selection of first conversation
        // Users should explicitly click a conversation to view it
      } else {
        setError(data.error || "Failed to load conversations");
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
      setError("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchConversations();
  }, [filter, fetchConversations]);

  // Fetch messages when conversation is selected
  const fetchMessages = useCallback(async (contactPhone: string) => {
    try {
      setMessagesLoading(true);
      const response = await fetch(
        `/api/whatsapp/messages?contactPhone=${encodeURIComponent(
          contactPhone,
        )}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (data.success) {
        // Normalize messages to ensure type field is set correctly
        const normalizedMessages = data.data.messages.map((msg: any) => ({
          ...msg,
          type: msg.type || "text", // Default to text if type is missing
        }));
        setMessages(normalizedMessages);
        setContactInfo(data.data.contact);

        // Set pagination state
        setHasMore(data.data.hasMore ?? false);
        oldestCursorRef.current = data.data.oldestCursor ?? null;
      } else {
        console.error("Failed to load messages:", data.error);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Prefetch media URLs for image messages with priority-based loading
  // HIGH priority: last 10 messages (viewport), LOW priority: older messages
  // Uses AbortController for proper cleanup on conversation switch
  const prefetchAbortControllerRef = useRef<AbortController | null>(null);

  const prefetchMediaUrls = useCallback(
    async (messagesToPrefetch: Message[], conversationId: string) => {
      // Abort any in-flight prefetch from previous conversation
      if (prefetchAbortControllerRef.current) {
        prefetchAbortControllerRef.current.abort();
      }

      // Create new abort controller for this prefetch batch
      const abortController = new AbortController();
      prefetchAbortControllerRef.current = abortController;

      const needsFetch = messagesToPrefetch.filter(
        (m) =>
          m.type === "image" &&
          m.mediaId &&
          !m.mediaUrl &&
          !(["ready", "loading"] as MediaStatus[]).includes(
            mediaStatusCache.get(m.id) || "idle",
          ),
      );

      if (needsFetch.length === 0) return;

      console.log(
        `📸 [Prefetch] Starting prefetch for ${needsFetch.length} images`,
      );

      // Priority: last 10 first (viewport visible)
      const highPriority = needsFetch.slice(-10);
      const lowPriority = needsFetch.slice(0, -10);

      const fetchOne = async (msg: Message) => {
        // Check if aborted
        if (abortController.signal.aborted) return;

        // Conversation guard - abort if user switched chats
        if (activeConversationRef.current !== conversationId) {
          return;
        }

        // Skip if already loading
        const currentStatus = mediaStatusCache.get(msg.id);
        if (currentStatus === "loading") return;

        mediaStatusCache.set(msg.id, "loading");

        try {
          const res = await fetch("/api/whatsapp/download-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mediaId: msg.mediaId,
              messageId: msg.id,
              conversationId,
            }),
            signal: abortController.signal, // AbortController signal
          });

          const data = await res.json();

          // Guard check again after async operation
          if (
            abortController.signal.aborted ||
            activeConversationRef.current !== conversationId
          ) {
            return;
          }

          if (data.success && data.data?.mediaUrl) {
            // Decode image before paint to prevent layout shift
            await preloadImage(data.data.mediaUrl);

            mediaUrlCache.set(msg.id, data.data.mediaUrl);
            mediaStatusCache.set(msg.id, "ready");

            // Update message in state to trigger re-render
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id ? { ...m, mediaUrl: data.data.mediaUrl } : m,
              ),
            );
            console.log(`✅ [Prefetch] Ready: ${msg.id}`);
          } else {
            mediaStatusCache.set(msg.id, "failed");
            console.log(`❌ [Prefetch] Failed: ${msg.id}`);
          }
        } catch (err: any) {
          // Don't log abort errors - they're expected on conversation switch
          if (err.name !== "AbortError") {
            mediaStatusCache.set(msg.id, "failed");
            console.error(`❌ [Prefetch] Error for ${msg.id}:`, err);
          }
        }
      };

      // HIGH priority: fetch in parallel batch
      await Promise.allSettled(highPriority.map(fetchOne));

      // LOW priority: background fetch (fire and forget)
      if (!abortController.signal.aborted) {
        lowPriority.forEach(fetchOne);
      }

      console.log(`📸 [Prefetch] Batch complete`);
    },
    [],
  );

  // Load older messages when user scrolls up (infinite scroll)
  const loadOlderMessages = useCallback(async () => {
    if (
      !hasMore ||
      loadingOlder ||
      !oldestCursorRef.current ||
      !selectedConversation
    )
      return;

    setLoadingOlder(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    try {
      const response = await fetch(
        `/api/whatsapp/messages?contactPhone=${encodeURIComponent(
          selectedConversation.phone,
        )}&before=${encodeURIComponent(oldestCursorRef.current)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (data.success) {
        const normalizedMessages = data.data.messages.map((msg: any) => ({
          ...msg,
          type: msg.type || "text",
        }));

        // Prepend older messages (dedupe by id)
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = normalizedMessages.filter(
            (m: Message) => !existingIds.has(m.id),
          );
          return [...newMessages, ...prev];
        });

        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          }
        });

        // Update pagination state
        setHasMore(data.data.hasMore ?? false);
        oldestCursorRef.current = data.data.oldestCursor ?? null;

        // Prefetch media for older messages (low priority)
        if (selectedConversation?.id) {
          prefetchMediaUrls(normalizedMessages, selectedConversation.id);
        }
      }
    } catch (err) {
      console.error("Error loading older messages:", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, selectedConversation, prefetchMediaUrls]);

  // Only fetch messages when the conversation ID changes, not when the object updates
  useEffect(() => {
    const currentId = selectedConversation?.id || null;
    const previousId = prevSelectedConversationIdRef.current;

    // Only fetch if the conversation ID actually changed
    if (currentId && currentId !== previousId && selectedConversation) {
      prevSelectedConversationIdRef.current = currentId;

      // Set conversation guard BEFORE fetching - critical for prefetch cancellation
      activeConversationRef.current = currentId;

      // Reset pagination state for new conversation
      setHasMore(true);
      oldestCursorRef.current = null;

      // Fetch messages and prefetch media
      const fetchAndPrefetch = async () => {
        try {
          setMessagesLoading(true);
          const response = await fetch(
            `/api/whatsapp/messages?contactPhone=${encodeURIComponent(selectedConversation.phone)}`,
            { cache: "no-store" },
          );
          const data = await response.json();

          // Guard: abort if conversation changed during fetch
          if (activeConversationRef.current !== currentId) {
            console.log(
              `⏭️ [Messages] Discarding result - conversation changed`,
            );
            return;
          }

          if (data.success) {
            const normalizedMessages = data.data.messages.map((msg: any) => ({
              ...msg,
              type: msg.type || "text",
            }));
            setMessages(normalizedMessages);
            setContactInfo(data.data.contact);
            setHasMore(data.data.hasMore ?? false);
            oldestCursorRef.current = data.data.oldestCursor ?? null;

            // Prefetch media URLs immediately after setting messages
            prefetchMediaUrls(normalizedMessages, currentId);
          } else {
            console.error("Failed to load messages:", data.error);
          }
        } catch (err) {
          console.error("Error fetching messages:", err);
        } finally {
          // Only update loading state if still on same conversation
          if (activeConversationRef.current === currentId) {
            setMessagesLoading(false);
          }
        }
      };

      fetchAndPrefetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Reset initial load flag when conversation changes
    isInitialLoadRef.current = true;
  }, [selectedConversation?.id, prefetchMediaUrls]);

  // Scroll to bottom only on initial load or when user sends a message
  useEffect(() => {
    if (messages.length === 0) return;

    // Only auto-scroll on initial load OR if user is near bottom
    if (isInitialLoadRef.current) {
      // Use "auto" for instant scroll on initial load
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      isInitialLoadRef.current = false;
    } else if (isNearBottomRef.current) {
      // Smooth scroll for new messages when user is at bottom
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Callback for when images finish loading - scroll to show them if user is near bottom
  const handleImageLoad = useCallback(() => {
    // On initial load or if user is near the bottom of the chat, scroll to bottom
    // This fixes mobile issue where images load but don't trigger scroll
    if (isInitialLoadRef.current || isNearBottomRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        // Method 1: scrollIntoView (preferred)
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

        // Method 2: Fallback for mobile - directly set scroll position
        if (messagesContainerRef.current) {
          const container = messagesContainerRef.current;
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, []);

  // Drag-drop handlers for chat message area
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show overlay if dragging files
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide overlay if leaving the container (not entering a child)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));

      if (imageFiles.length === 0) {
        console.log("No image files dropped");
        return;
      }

      // Add dropped images to the file queue with previews
      const newFiles = imageFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
      }));

      setSelectedFiles((prev) => [...prev, ...newFiles]);
      setActiveFileIndex(selectedFiles.length); // Focus on first new file
      console.log(`📸 Added ${imageFiles.length} image(s) from drag-drop`);
    },
    [selectedFiles.length],
  );

  // Infinite scroll: load older messages when user scrolls near top
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Track if user is near bottom (for smart auto-scroll on new messages)
      const { scrollTop, scrollHeight, clientHeight } = container;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;

      // Trigger load older messages when near top
      if (scrollTop < 200 && hasMore && !loadingOlder) {
        loadOlderMessages();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingOlder, loadOlderMessages]);

  // Real-time subscription to whatsapp_messages and whatsapp_conversations tables
  useEffect(() => {
    console.log("🔌 Setting up Supabase realtime subscription...");

    // Subscribe to messages table for new messages
    const messagesChannel = supabase
      .channel("whatsapp-messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
        },
        (payload) => {
          console.log(
            "📨 Realtime message update:",
            payload.eventType,
            payload.new,
          );

          const newMsg = payload.new as any;
          if (!newMsg) return;

          const conversationId = newMsg.conversation_id;

          if (payload.eventType === "INSERT") {
            // Format the new message using correct schema columns
            const formattedMsg: Message = {
              id: newMsg.id,
              messageId: newMsg.wamid,
              sender: newMsg.direction === "inbound" ? "contact" : "user",
              content: newMsg.content || "",
              time: formatTime(newMsg.created_at),
              timestamp: newMsg.created_at,
              type: newMsg.message_type,
              status: newMsg.status,
              mediaUrl: newMsg.media_url,
              mediaId: newMsg.media_id,
              isAiGenerated: newMsg.is_ai_generated,
              intent: newMsg.intent_detected,
            };

            // Update messages if this conversation is currently selected
            const currentConv = selectedConversationRef.current;
            if (currentConv && currentConv.id === conversationId) {
              setMessages((prev) => {
                // IDEMPOTENCY CHECK: Always check if message exists first
                // This prevents duplicates AND handles multi-tab sync correctly:
                // - Tab A sends message (optimistic) -> Tab B receives via realtime -> Tab B adds it
                // - Tab A receives same message via realtime -> already exists -> skip
                const exists = prev.some(
                  (m) =>
                    m.messageId === formattedMsg.messageId ||
                    m.id === formattedMsg.id,
                );

                if (exists) {
                  // Message already in state (from optimistic update or previous realtime event)
                  console.log(
                    "⏭️ [Realtime] Message already exists, skipping:",
                    formattedMsg.messageId?.slice(-8),
                  );
                  return prev;
                }

                // Message not in state - add it
                // This handles:
                // 1. Inbound messages from contacts
                // 2. AI-generated messages (instant display - WhatsApp-level UX)
                // 3. Human messages from other tabs/devices (multi-session sync)
                if (newMsg.is_ai_generated) {
                  console.log(
                    "🤖 [Realtime] Adding AI-generated message:",
                    formattedMsg.messageId?.slice(-8),
                  );
                } else if (newMsg.direction === "outbound") {
                  console.log(
                    "📱 [Realtime] Adding outbound message from other session:",
                    formattedMsg.messageId?.slice(-8),
                  );
                } else {
                  console.log(
                    "📨 [Realtime] Adding inbound message:",
                    formattedMsg.messageId?.slice(-8),
                  );
                }

                return [...prev, formattedMsg];
              });
            }

            // Show browser notification for inbound messages (from contacts)
            if (newMsg.direction === "inbound") {
              // Find the conversation to get sender name
              const senderConv = conversationsRef.current.find(
                (c) => c.id === conversationId,
              );
              const senderName =
                senderConv?.name ||
                formatPhoneNumber(newMsg.sender_phone || "Unknown");

              // Only notify if viewing a different conversation or page is not focused
              const currentConvForNotify = selectedConversationRef.current;
              const isViewingDifferentConv =
                !currentConvForNotify ||
                currentConvForNotify.id !== conversationId;

              console.log("🔔 Notification check:", {
                isViewingDifferentConv,
                documentHidden: document.hidden,
                senderName,
                messageContent: formattedMsg.content,
              });

              if (isViewingDifferentConv || document.hidden) {
                console.log("🔔 Triggering notification...");
                showNotificationRef.current({
                  title: `💬 ${senderName}`,
                  body:
                    formattedMsg.type === "text"
                      ? formattedMsg.content
                      : `📎 ${
                          formattedMsg.type.charAt(0).toUpperCase() +
                          formattedMsg.type.slice(1)
                        }`,
                  tag: conversationId, // Prevents duplicate notifications
                  onClick: () => {
                    // Select this conversation when notification is clicked
                    if (senderConv) {
                      setSelectedConversation(senderConv);
                    }
                  },
                });
              }
            }
          } else if (payload.eventType === "UPDATE") {
            // Update message status
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageId === newMsg.wamid
                  ? { ...msg, status: newMsg.status }
                  : msg,
              ),
            );
          }
        },
      )
      .subscribe((status) => {
        console.log("🔌 Messages realtime subscription status:", status);
      });

    // Subscribe to conversations table for stats updates (last message, unread count, etc.)
    const conversationsChannel = supabase
      .channel("whatsapp-conversations-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
        },
        (payload) => {
          console.log(
            "📋 Realtime conversation update:",
            payload.eventType,
            payload.new,
          );

          const updatedConv = payload.new as any;
          if (!updatedConv) return;

          if (payload.eventType === "INSERT") {
            // New conversation - add to list
            const newConversation: Conversation = {
              id: updatedConv.id,
              name:
                updatedConv.customer_name ||
                formatPhoneNumber(updatedConv.customer_phone),
              phone: updatedConv.customer_phone,
              lastMessage: updatedConv.last_message_preview || "",
              time: formatRelativeTime(
                updatedConv.last_message_at || updatedConv.created_at,
              ),
              timestamp: updatedConv.last_message_at || updatedConv.created_at,
              unread: updatedConv.unread_count || 0,
              totalMessages: updatedConv.total_messages || 0,
              online: false,
              aiReplies: updatedConv.ai_replies_count || 0,
              humanReplies: updatedConv.human_replies_count || 0,
              status: updatedConv.status,
            };

            setConversations((prev) => {
              // Check if already exists
              if (prev.some((c) => c.id === newConversation.id)) {
                return prev;
              }
              return [newConversation, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            // Update existing conversation in place
            setConversations((prev) => {
              const index = prev.findIndex((c) => c.id === updatedConv.id);
              if (index === -1) return prev;

              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                lastMessage:
                  updatedConv.last_message_preview ||
                  updated[index].lastMessage,
                time: formatRelativeTime(
                  updatedConv.last_message_at || updated[index].timestamp,
                ),
                timestamp:
                  updatedConv.last_message_at || updated[index].timestamp,
                unread: updatedConv.unread_count ?? updated[index].unread,
                totalMessages:
                  updatedConv.total_messages ?? updated[index].totalMessages,
                aiReplies:
                  updatedConv.ai_replies_count ?? updated[index].aiReplies,
                humanReplies:
                  updatedConv.human_replies_count ??
                  updated[index].humanReplies,
                status: updatedConv.status || updated[index].status,
              };

              // Move updated conversation to top if it has a new message
              if (updatedConv.last_message_at) {
                const [moved] = updated.splice(index, 1);
                return [moved, ...updated];
              }

              return updated;
            });

            // Also update selected conversation if it's this one
            const currentConv = selectedConversationRef.current;
            if (currentConv && currentConv.id === updatedConv.id) {
              setSelectedConversation((prev) =>
                prev
                  ? {
                      ...prev,
                      unread: updatedConv.unread_count ?? prev.unread,
                      totalMessages:
                        updatedConv.total_messages ?? prev.totalMessages,
                    }
                  : prev,
              );
            }
          }
        },
      )
      .subscribe((status) => {
        console.log("🔌 Conversations realtime subscription status:", status);
      });

    return () => {
      console.log("🔌 Cleaning up realtime subscriptions...");
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, []);

  // Send message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation || sending) return;

    const messageText = messageInput.trim();
    setMessageInput("");
    setSending(true);

    // Optimistic update - add message to UI immediately
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      messageId: `temp-${Date.now()}`,
      sender: "user",
      content: messageText,
      time: new Date()
        .toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        })
        .toLowerCase(),
      timestamp: new Date().toISOString(),
      type: "text",
      status: "sending",
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const response = await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedConversation.phone,
          message: messageText,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update the optimistic message with real data
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === optimisticMessage.id
              ? {
                  ...msg,
                  id: data.data.messageId,
                  messageId: data.data.messageId,
                  status: "sent",
                }
              : msg,
          ),
        );
      } else {
        // Remove optimistic message on failure
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticMessage.id),
        );
        console.error("Send message failed:", data);
        alert(data.message || data.error || "Failed to send message");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== optimisticMessage.id),
      );
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // CRITICAL: Use the correct handler based on whether file is selected
      if (selectedFile) {
        handleSendMedia();
      } else {
        handleSendMessage();
      }
    }
  };

  // Get media type from file MIME type
  const getMediaTypeFromFile = (
    file: File,
  ): "image" | "video" | "document" | "audio" | null => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    if (
      file.type.includes("pdf") ||
      file.type.includes("document") ||
      file.type.includes("spreadsheet") ||
      file.type.includes("presentation") ||
      file.type.startsWith("text/")
    )
      return "document";
    return null;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaType = getMediaTypeFromFile(file);
    if (!mediaType) {
      alert(
        "Unsupported file type. Supported: images (JPEG, PNG, WebP), videos (MP4), audio, and documents (PDF, Word, Excel).",
      );
      return;
    }

    // Check file size limits
    const sizeLimits: Record<string, number> = {
      image: 5 * 1024 * 1024,
      video: 16 * 1024 * 1024,
      audio: 16 * 1024 * 1024,
      document: 100 * 1024 * 1024,
    };

    if (file.size > sizeLimits[mediaType]) {
      const maxMB = sizeLimits[mediaType] / (1024 * 1024);
      alert(`File too large. ${mediaType} files must be under ${maxMB} MB.`);
      return;
    }

    // Add file to queue (not replace)
    const previewUrl =
      mediaType === "image" || mediaType === "video"
        ? URL.createObjectURL(file)
        : null;

    setSelectedFiles((prev) => {
      const newFiles = [...prev, { file, previewUrl, caption: "" }];
      // Set active to the newly added file
      setActiveFileIndex(newFiles.length - 1);
      // Clear the shared input since we're switching to new file
      setMessageInput("");
      return newFiles;
    });

    // Reset file input for reuse
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Cancel media selection - remove current file or all files
  const handleCancelMedia = (removeAll = true) => {
    if (removeAll) {
      // Revoke all preview URLs and clear
      selectedFiles.forEach((sf) => {
        if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
      });
      setSelectedFiles([]);
      setActiveFileIndex(0);
    } else {
      // Remove only the active file
      const fileToRemove = selectedFiles[activeFileIndex];
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      setSelectedFiles((prev) => prev.filter((_, i) => i !== activeFileIndex));
      setActiveFileIndex((prev) => Math.max(0, prev - 1));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle sending media - PROCESSES ALL SELECTED FILES
  // Uses rate-limited concurrency (max 2 parallel) to avoid WhatsApp API throttling
  const handleSendMedia = async () => {
    // CRITICAL: Double-click safety guard
    if (uploading || sending) return;

    // Guard: No files or no conversation selected
    if (selectedFiles.length === 0 || !selectedConversation) return;

    // CRITICAL: Capture ALL files (with their individual captions) and clear state
    const filesToSend = [...selectedFiles];
    setSelectedFiles([]);
    setActiveFileIndex(0);
    setUploading(true);
    setMessageInput(""); // Clear the caption input

    const startTime = performance.now();

    // Debug: Log multi-file send start
    console.log("🚀 [handleSendMedia] Starting optimized multi-file send:", {
      fileCount: filesToSend.length,
      filesCaptions: filesToSend.map((f) => f.caption || "(no caption)"),
      conversationId: selectedConversation.id,
      recipientPhone: selectedConversation.phone,
    });

    // Ensure scroll to bottom when sending
    isNearBottomRef.current = true;

    // Track temp IDs for cleanup on error
    const tempIds: string[] = [];

    // Rate-limited concurrency helper (max 2 parallel to avoid WhatsApp API throttling)
    const MAX_CONCURRENT = 2;

    // Prepare all files with optimistic messages first (instant UI feedback)
    const preparedFiles = filesToSend.map((sf, i) => {
      const { file, previewUrl } = sf;
      const mediaType = getMediaTypeFromFile(file);
      const fileCaptionText = sf.caption?.trim();
      const messageCaption =
        fileCaptionText && fileCaptionText.length > 0
          ? fileCaptionText
          : undefined;

      const tempId = `temp-${Date.now()}-${i}`;
      tempIds.push(tempId);

      return {
        file,
        previewUrl,
        mediaType,
        messageCaption,
        tempId,
        index: i,
      };
    });

    // Create ALL optimistic messages in a SINGLE setState call (prevents React batching issues)
    // CRITICAL: forEach with multiple setMessages() causes race conditions - some messages get lost!
    const optimisticMessages: Message[] = preparedFiles
      .filter(
        ({ mediaType }) =>
          mediaType &&
          ["image", "video", "document", "audio"].includes(mediaType),
      )
      .map(({ mediaType, messageCaption, tempId, previewUrl }) => ({
        id: tempId,
        messageId: tempId,
        sender: "user" as const,
        content: messageCaption || `[${mediaType}]`,
        time: new Date()
          .toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          })
          .toLowerCase(),
        timestamp: new Date().toISOString(),
        type: mediaType!,
        status: "sending",
        mediaUrl: previewUrl || undefined,
      }));

    // SINGLE atomic state update - all messages added at once
    setMessages((prev) => [...prev, ...optimisticMessages]);

    console.log(
      `⏱️ [handleSendMedia] Optimistic UI shown in ${(performance.now() - startTime).toFixed(0)}ms (${optimisticMessages.length} messages)`,
    );

    // Process files with rate-limited parallelism
    const sendFile = async (pf: (typeof preparedFiles)[0]): Promise<void> => {
      const { file, previewUrl, mediaType, messageCaption, tempId, index } = pf;

      // Skip unsupported types
      if (
        !mediaType ||
        !["image", "video", "document", "audio"].includes(mediaType)
      ) {
        console.warn(`⚠️ [handleSendMedia] Skipping unsupported: ${file.type}`);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        return;
      }

      console.log(
        `📤 [handleSendMedia] Sending file ${index + 1}/${filesToSend.length}: ${file.name}`,
      );

      // Single API call to fast endpoint (upload + send in one request)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("to", selectedConversation.phone);
      formData.append("conversationId", selectedConversation.id);
      if (messageCaption) {
        formData.append("caption", messageCaption);
      }

      const response = await fetch("/api/whatsapp/send-media-fast", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        console.log(
          `✅ [handleSendMedia] File ${index + 1} sent in ${data.timing?.totalMs || "?"}ms (WhatsApp: ${data.timing?.whatsappMs || "?"}ms)`,
        );
        // Update message with real ID and status
        // IMPORTANT: Keep blob URL (previewUrl) in mediaUrl to continue displaying image
        // The blob URL will be replaced on page refresh when R2 URL is available
        // We intentionally do NOT revoke the blob URL here to prevent onError
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId
              ? {
                  ...msg,
                  id: data.data.messageId,
                  messageId: data.data.messageId,
                  status: "sent",
                  // Keep existing mediaUrl (blob) - it's still valid and displaying
                }
              : msg,
          ),
        );
        // NOTE: We intentionally do NOT revoke previewUrl here
        // Revoking causes <img> onError because the blob becomes invalid
        // The blob URL will be cleaned up on page unload by the browser naturally
      } else {
        throw new Error(data.message || `Failed to send ${file.name}`);
      }
    };

    try {
      // Process in batches with controlled concurrency
      const validFiles = preparedFiles.filter(
        (pf) =>
          pf.mediaType &&
          ["image", "video", "document", "audio"].includes(pf.mediaType),
      );

      // Process with concurrency limit of 2
      for (let i = 0; i < validFiles.length; i += MAX_CONCURRENT) {
        const batch = validFiles.slice(i, i + MAX_CONCURRENT);
        await Promise.all(batch.map(sendFile));
      }

      const totalTime = (performance.now() - startTime).toFixed(0);
      console.log(
        `🎉 [handleSendMedia] All ${filesToSend.length} files sent in ${totalTime}ms!`,
      );
    } catch (err: any) {
      console.error("❌ [handleSendMedia] Error:", err);
      // Remove all optimistic messages for this batch on error
      setMessages((prev) => prev.filter((msg) => !tempIds.includes(msg.id)));
      alert(err.message || "Failed to send media. Please try again.");

      // Revoke any remaining preview URLs
      filesToSend.forEach((sf) => {
        if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
      });
    } finally {
      setUploading(false);
      // Clean up file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Track scroll position to determine if user is near bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const threshold = 100; // pixels from bottom
    const isNearBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    isNearBottomRef.current = isNearBottom;
  }, []);

  // Mark conversation as read
  const handleMarkAsRead = async () => {
    if (!selectedConversation) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === selectedConversation.id ? { ...conv, unread: 0 } : conv,
      ),
    );
  };

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Filter conversations by search - memoized
  const filteredConversations = useMemo(
    () =>
      conversations.filter(
        (conv) =>
          conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          conv.phone.includes(searchQuery) ||
          conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [conversations, searchQuery],
  );

  // Group messages by date - memoized to prevent recalculation on every render
  const messageGroups = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });

      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  }, [messages]);

  if (loading) {
    return (
      <div className={styles.messagesView}>
        <div className={styles.conversationList}>
          <div className={styles.conversationListHeader}>
            <h2 className={styles.panelTitle}>Conversations</h2>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem",
              textAlign: "center",
              color: "var(--dash-text-secondary)",
            }}
          >
            Loading conversations...
          </div>
        </div>
        <div className={styles.chatArea}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dash-text-secondary)",
            }}
          >
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.messagesView}>
        <div className={styles.conversationList}>
          <div className={styles.conversationListHeader}>
            <h2 className={styles.panelTitle}>Conversations</h2>
          </div>
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--dash-danger)",
            }}
          >
            {error}
            <br />
            <button
              onClick={fetchConversations}
              style={{
                marginTop: "1rem",
                color: "var(--dash-accent)",
                cursor: "pointer",
                background: "none",
                border: "none",
              }}
            >
              Try again
            </button>
          </div>
        </div>
        <div className={styles.chatArea}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dash-text-secondary)",
            }}
          >
            Select a conversation to view messages
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messagesView}>
      {/* Push Notification Permission Banner */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          width: "90%",
          maxWidth: "800px",
        }}
      >
        <NotificationBanner />
      </div>

      {/* Conversation List Panel */}
      <div
        className={`${styles.conversationList} ${
          isMobile && showMobileChat ? styles.conversationListHidden : ""
        }`}
      >
        <div className={styles.conversationListHeader}>
          <h2 className={styles.panelTitle}>Conversations</h2>
          {/* Commented out filter dropdowns
          <div className={styles.conversationFilters}>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{conversations.length} All</option>
              <option value="unread">Unread</option>
            </select>
            <select className={styles.sortSelect}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
          */}
        </div>

        <div className={styles.conversationSearch}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.conversationItems}>
          {filteredConversations.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--dash-text-secondary)",
              }}
            >
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`${styles.conversationItem} ${
                  selectedConversation?.id === conv.id
                    ? styles.conversationActive
                    : ""
                }`}
                onClick={() => {
                  setSelectedConversation(conv);
                  if (isMobile) setShowMobileChat(true);
                }}
              >
                <div
                  className={styles.conversationAvatar}
                  style={{ background: getAvatarColor(conv.name) }}
                >
                  {getInitials(conv.name)}
                  {conv.online && <span className={styles.onlineIndicator} />}
                </div>
                <div className={styles.conversationInfo}>
                  <div className={styles.conversationTop}>
                    <span className={styles.conversationName}>{conv.name}</span>
                    <span className={styles.conversationTime}>{conv.time}</span>
                  </div>
                  <div className={styles.conversationBottom}>
                    <span className={styles.conversationPreview}>
                      {conv.lastMessage === "[image]" ? (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="18"
                              height="18"
                              rx="2"
                              ry="2"
                            />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          Photo
                        </span>
                      ) : conv.lastMessage === "[video]" ? (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect
                              x="1"
                              y="5"
                              width="15"
                              height="14"
                              rx="2"
                              ry="2"
                            />
                          </svg>
                          Video
                        </span>
                      ) : (
                        conv.lastMessage
                      )}
                    </span>
                    {/* {conv.unread > 0 && (
                      <span className={styles.unreadBadge}>{conv.unread}</span>
                    )} */}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area Panel */}
      <div
        className={`${styles.chatArea} ${
          isMobile && showMobileChat ? styles.chatAreaVisible : ""
        }`}
      >
        {selectedConversation ? (
          <>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderLeft}>
                {/* Mobile Back Button */}
                {isMobile && (
                  <button
                    className={styles.mobileBackBtn}
                    onClick={() => setShowMobileChat(false)}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}
                <div className={styles.chatAvatar}>
                  {getInitials(selectedConversation.name)}
                </div>
                <div
                  style={{ cursor: "pointer" }}
                  onClick={() => setShowContactPanel(!showContactPanel)}
                  title="Click to view details"
                >
                  <span className={styles.chatName}>
                    {selectedConversation.name}
                  </span>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--dash-text-muted)",
                    }}
                  >
                    {selectedConversation.phone}
                  </div>
                </div>
              </div>
              <div className={styles.chatHeaderActions}>
                {/* <button
                  className={styles.markReadBtn}
                  onClick={handleMarkAsRead}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Mark As Read
                </button> */}
                <div ref={moreMenuRef} style={{ position: "relative" }}>
                  <button
                    className={styles.moreBtn}
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </button>
                  {showMoreMenu && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: "0.5rem",
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        minWidth: "180px",
                        zIndex: 100,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => {
                          alert("Mute feature coming soon!");
                          setShowMoreMenu(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          width: "100%",
                          padding: "0.75rem 1rem",
                          background: "none",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#333")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <img
                          src="/icons/message_3_dots/notification.svg"
                          alt=""
                          width="18"
                          height="18"
                          style={{ filter: "invert(1)" }}
                        />
                        Mute Notifications
                      </button>
                      {/* AI Reply Toggle */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "0.75rem 1rem",
                          cursor: "pointer",
                        }}
                        onClick={async () => {
                          const newState = !(
                            selectedConversation?.aiEnabled ?? true
                          );
                          // Update local state optimistically
                          setSelectedConversation((prev) =>
                            prev ? { ...prev, aiEnabled: newState } : null,
                          );
                          setConversations((prev) =>
                            prev.map((c) =>
                              c.id === selectedConversation?.id
                                ? { ...c, aiEnabled: newState }
                                : c,
                            ),
                          );
                          // TODO: Call API to persist this setting
                          try {
                            await fetch(
                              `/api/whatsapp/conversations/${selectedConversation?.id}/ai-toggle`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ aiEnabled: newState }),
                              },
                            );
                          } catch (err) {
                            console.error("Failed to toggle AI:", err);
                          }
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#333")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                          }}
                        >
                          <img
                            src="/icons/message_3_dots/ai.svg"
                            alt=""
                            width="18"
                            height="18"
                            style={{ filter: "invert(1)" }}
                          />
                          <span style={{ color: "#fff", fontSize: "0.875rem" }}>
                            AI Reply
                          </span>
                        </div>
                        <div
                          style={{
                            width: "40px",
                            height: "22px",
                            backgroundColor:
                              (selectedConversation?.aiEnabled ?? true)
                                ? "#ffffff"
                                : "#555",
                            borderRadius: "11px",
                            position: "relative",
                            transition: "background-color 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              width: "18px",
                              height: "18px",
                              backgroundColor:
                                (selectedConversation?.aiEnabled ?? true)
                                  ? "#000"
                                  : "#fff",
                              borderRadius: "50%",
                              position: "absolute",
                              top: "2px",
                              left:
                                (selectedConversation?.aiEnabled ?? true)
                                  ? "20px"
                                  : "2px",
                              transition:
                                "left 0.2s ease, background-color 0.2s ease",
                            }}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          height: "1px",
                          backgroundColor: "#333",
                          margin: "0.25rem 0",
                        }}
                      />
                      <button
                        onClick={() => {
                          alert("Tags feature coming soon!");
                          setShowMoreMenu(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          width: "100%",
                          padding: "0.75rem 1rem",
                          background: "none",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#333")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <img
                          src="/icons/message_3_dots/tag.svg"
                          alt=""
                          width="18"
                          height="18"
                          style={{ filter: "invert(1)" }}
                        />
                        Add Tags
                      </button>
                      <button
                        onClick={() => {
                          alert("Archive feature coming soon!");
                          setShowMoreMenu(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          width: "100%",
                          padding: "0.75rem 1rem",
                          background: "none",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#333")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <img
                          src="/icons/message_3_dots/archive.svg"
                          alt=""
                          width="18"
                          height="18"
                          style={{ filter: "invert(1)" }}
                        />
                        Archive Chat
                      </button>
                      <div
                        style={{
                          height: "1px",
                          backgroundColor: "#333",
                          margin: "0.25rem 0",
                        }}
                      />
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Are you sure you want to block this contact?",
                            )
                          ) {
                            alert("Block feature coming soon!");
                          }
                          setShowMoreMenu(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          width: "100%",
                          padding: "0.75rem 1rem",
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#333")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <img
                          src="/icons/message_3_dots/block.svg"
                          alt=""
                          width="18"
                          height="18"
                          style={{
                            filter:
                              "invert(48%) sepia(79%) saturate(2476%) hue-rotate(335deg) brightness(97%) contrast(95%)",
                          }}
                        />
                        Block Contact
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Wrapper for chat messages with drag-drop overlay */}
            <div
              className={msgStyles.chatMessagesWrapper}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag-drop overlay - positioned outside scroll container */}
              {isDragOver && (
                <div className={msgStyles.dragDropOverlay}>
                  <div className={msgStyles.dragDropCard}>
                    <div className={msgStyles.dragDropIconContainer}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {/* Cloud with upload arrow */}
                        <path d="M16 16l-4-4-4 4" />
                        <path d="M12 12v9" />
                        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                      </svg>
                    </div>
                    <span className={msgStyles.dragDropTitle}>
                      Drag and drop files
                    </span>
                  </div>
                </div>
              )}

              <div
                className={styles.chatMessages}
                onScroll={handleScroll}
                ref={messagesContainerRef}
              >
                {messagesLoading ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      padding: "2rem",
                      color: "#000000",
                    }}
                  >
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--dash-text-secondary)",
                    }}
                  >
                    No messages yet. Send a message to start the conversation.
                  </div>
                ) : (
                  messageGroups.map((group) => (
                    <div key={group.date}>
                      <DateSeparator date={group.date} styles={styles} />
                      {group.messages.map((msg) => (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          styles={styles}
                          conversationId={selectedConversation.id}
                          onImageLoad={handleImageLoad}
                          onImageClick={(imageUrl) =>
                            setZoomedImageUrl(imageUrl)
                          }
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className={styles.chatInput}>
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain"
                style={{ display: "none" }}
              />

              {/* WhatsApp-style Media Preview - Inside chat area */}
              {selectedFile && (
                <div
                  className={`${styles.mediaPreviewModal} ${msgStyles.mediaPreviewOverlay}`}
                  style={{
                    background: "rgba(0, 0, 0, 0.92)",
                  }}
                >
                  {/* Modal Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "1rem 1.5rem",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <button
                      onClick={() => handleCancelMedia()}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "0.5rem",
                        color: "rgba(255,255,255,0.8)",
                        fontSize: "1.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div
                      style={{
                        color: "white",
                        fontWeight: 500,
                        flex: 1,
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectedFile.name}
                    </div>
                    {/* Spacer for visual balance */}
                    <div style={{ width: 40 }} />
                  </div>

                  {/* Image Preview Area */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "2rem",
                      overflow: "hidden",
                    }}
                  >
                    {mediaPreviewUrl &&
                    getMediaTypeFromFile(selectedFile) === "image" ? (
                      <img
                        src={mediaPreviewUrl}
                        alt="Preview"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                          borderRadius: "12px",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                      />
                    ) : mediaPreviewUrl &&
                      getMediaTypeFromFile(selectedFile) === "video" ? (
                      <video
                        src={mediaPreviewUrl}
                        controls
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          borderRadius: "12px",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "200px",
                          height: "200px",
                          borderRadius: "16px",
                          background: "rgba(255,255,255,0.1)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "1rem",
                        }}
                      >
                        <svg
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.6)"
                          strokeWidth="1.5"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div
                          style={{
                            color: "rgba(255,255,255,0.8)",
                            fontSize: "1.25rem",
                            fontWeight: 600,
                          }}
                        >
                          {selectedFile.name.split(".").pop()?.toUpperCase()}
                        </div>
                        <div
                          style={{
                            color: "rgba(255,255,255,0.5)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Thumbnail strip for multi-file queue */}
                  {selectedFiles.length > 1 && (
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        padding: "12px 24px",
                        overflowX: "auto",
                        background: "rgba(0,0,0,0.3)",
                        justifyContent: "center",
                      }}
                    >
                      {selectedFiles.map((sf, index) => (
                        <div
                          key={index}
                          onClick={() => setActiveFileIndex(index)}
                          style={{
                            position: "relative",
                            width: "56px",
                            height: "56px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            cursor: "pointer",
                            border:
                              index === activeFileIndex
                                ? "2px solid #00a884"
                                : "2px solid transparent",
                            opacity: index === activeFileIndex ? 1 : 0.6,
                            transition: "all 0.2s ease",
                            flexShrink: 0,
                          }}
                        >
                          {sf.previewUrl ? (
                            <img
                              src={sf.previewUrl}
                              alt=""
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                background: "rgba(255,255,255,0.1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "10px",
                                color: "rgba(255,255,255,0.7)",
                              }}
                            >
                              {sf.file.name.split(".").pop()?.toUpperCase()}
                            </div>
                          )}
                          {/* Remove button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (sf.previewUrl)
                                URL.revokeObjectURL(sf.previewUrl);
                              setSelectedFiles((prev) =>
                                prev.filter((_, i) => i !== index),
                              );
                              if (
                                index <= activeFileIndex &&
                                activeFileIndex > 0
                              ) {
                                setActiveFileIndex((prev) => prev - 1);
                              }
                            }}
                            style={{
                              position: "absolute",
                              top: "2px",
                              right: "2px",
                              width: "18px",
                              height: "18px",
                              borderRadius: "50%",
                              background: "rgba(0,0,0,0.7)",
                              border: "none",
                              color: "white",
                              fontSize: "12px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Caption Input + Send Button */}
                  <div
                    style={{
                      padding: "1rem 1.5rem",
                      background: "rgba(30, 30, 30, 0.95)",
                      borderTop: "1px solid rgba(255,255,255,0.1)",
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: "24px",
                        padding: "0.5rem 1rem",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Add a caption..."
                        value={messageInput}
                        onChange={handleCaptionChange}
                        onKeyPress={handleKeyPress}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          color: "white",
                          fontSize: "0.9375rem",
                          outline: "none",
                        }}
                        autoFocus
                      />
                      {/* Attach more files button - FIRST per WhatsApp order */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "rgba(255,255,255,0.7)",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Attach another file"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={handleSendMedia}
                      disabled={sending || uploading}
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "50%",
                        background: sending || uploading ? "#666" : "#00a884",
                        border: "none",
                        cursor:
                          sending || uploading ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {sending || uploading ? (
                        <div
                          style={{
                            width: "20px",
                            height: "20px",
                            border: "2px solid rgba(255,255,255,0.3)",
                            borderTopColor: "white",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                          }}
                        />
                      ) : (
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="white"
                        >
                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* <div className={styles.inputTypeSelect}>
                <select className={styles.messageTypeSelect}>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div> */}
              <div className={styles.inputWrapper}>
                <input
                  type="text"
                  placeholder="Write your message here..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className={styles.messageInput}
                  disabled={sending}
                />
                <div className={styles.inputActions}>
                  {/* Attach file button - triggers file picker */}
                  <button
                    className={styles.attachBtn}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  {/* CRITICAL: Hidden file input - this was completely missing! */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/opus,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                    style={{ display: "none" }}
                  />
                </div>
              </div>
              <button
                className={styles.sendBtn}
                onClick={selectedFile ? handleSendMedia : handleSendMessage}
                disabled={
                  (!messageInput.trim() && !selectedFile) ||
                  sending ||
                  uploading
                }
                style={{
                  opacity:
                    (!messageInput.trim() && !selectedFile) ||
                    sending ||
                    uploading
                      ? 0.5
                      : 1,
                }}
              >
                {uploading ? (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                    }}
                  >
                    ...
                  </div>
                ) : (
                  <img
                    src="/icons/message_3_dots/send.svg"
                    alt="Send"
                    width="28"
                    height="28"
                  />
                )}
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "black",
              gap: "1rem",
            }}
          >
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              style={{ opacity: 1 }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>Select a conversation to view messages</p>
          </div>
        )}
      </div>

      {/* Contact Details Panel */}
      {selectedConversation && (
        <div
          className={`${styles.contactPanel} ${
            showContactPanel ? styles.contactPanelVisible : ""
          }`}
        >
          <div className={styles.contactHeader}>
            <h3 className={styles.panelTitle}>Details</h3>
            <button
              className={styles.closeBtn}
              onClick={() => setShowContactPanel(false)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className={styles.contactProfile}>
            <div className={styles.contactAvatarLarge}>
              {getInitials(selectedConversation.name)}
            </div>
            <h4 className={styles.contactName}>{selectedConversation.name}</h4>
            <span className={styles.contactRole}>WhatsApp Contact</span>
          </div>

          <div className={styles.contactSections}>
            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Contact</h5>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>
                  <img
                    src="/icons/contact_details/phone.svg"
                    alt=""
                    width="18"
                    height="18"
                  />
                </span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                    }}
                  >
                    <span className={styles.fieldValue}>
                      {selectedConversation.phone}
                    </span>
                    <a
                      href={`tel:${selectedConversation.phone}`}
                      className={styles.callNowBtn}
                    >
                      Call Now
                    </a>
                  </div>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>
                  <img
                    src="/icons/contact_details/message.svg"
                    alt=""
                    width="18"
                    height="18"
                  />
                </span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Total Messages</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.totalMessages || messages.length}{" "}
                    messages
                  </span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>
                  <img
                    src="/icons/contact_details/language.svg"
                    alt=""
                    width="18"
                    height="18"
                  />
                </span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Language</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.language === "hi"
                      ? "Hindi"
                      : selectedConversation.language === "hinglish"
                        ? "Hinglish"
                        : selectedConversation.language || "English"}
                  </span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>
                  <img
                    src="/icons/contact_details/calender.svg"
                    alt=""
                    width="18"
                    height="18"
                  />
                </span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Last Active</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.time}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Viewer - Full screen lightbox */}
      {zoomedImageUrl && (
        <ImageZoomViewer
          imageUrl={zoomedImageUrl}
          onClose={() => setZoomedImageUrl(null)}
        />
      )}
    </div>
  );
}
