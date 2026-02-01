"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { supabase } from "@/lib/supabase/client";
import { useNotification } from "@/app/hooks/useNotification";
import { usePushNotification } from "@/app/hooks/usePushNotification";
import NotificationBanner from "./NotificationBanner";
import styles from "../dashboard.module.css";

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
  // AI metadata
  isAiGenerated?: boolean;
  intent?: string;
  confidence?: number;
  tokensUsed?: number;
  responseTimeMs?: number;
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

// GLOBAL request cache - prevents duplicate fetches across component remounts
// This is singleton-level caching that survives component rerenders
const mediaRequestCache = new Set<string>();
const mediaUrlCache = new Map<string, string>(); // messageId -> mediaUrl

// Lazy loading image component for inbound media
// This fetches media from WhatsApp and uploads to R2 if no URL is available
const LazyImage = memo(function LazyImage({
  mediaId,
  mediaUrl,
  messageId,
  conversationId,
  time,
  sender,
}: {
  mediaId?: string;
  mediaUrl?: string;
  messageId: string;
  conversationId: string;
  time: string;
  sender: "contact" | "user";
}) {
  // Check global cache first
  const cachedUrl = mediaUrlCache.get(messageId);
  const [url, setUrl] = useState<string | null>(mediaUrl || cachedUrl || null);
  const [loading, setLoading] = useState(!mediaUrl && !cachedUrl && !!mediaId);
  const [error, setError] = useState(false);

  useEffect(() => {
    // If we already have a URL, skip
    if (url || !mediaId || !messageId || !conversationId) {
      return;
    }

    // Check if this messageId is already being fetched (global dedup)
    if (mediaRequestCache.has(messageId)) {
      console.log(
        `⏳ [LazyImage] Request already in progress for ${messageId}`,
      );
      // Poll for result every 500ms
      const pollInterval = setInterval(() => {
        const cachedResult = mediaUrlCache.get(messageId);
        if (cachedResult) {
          setUrl(cachedResult);
          setLoading(false);
          clearInterval(pollInterval);
        }
      }, 500);

      // Clean up after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        if (!mediaUrlCache.has(messageId)) {
          setError(true);
          setLoading(false);
        }
      }, 30000);

      return () => clearInterval(pollInterval);
    }

    // Mark as in-progress in global cache
    mediaRequestCache.add(messageId);
    setLoading(true);

    // Call the download-media API to fetch from WhatsApp and store in R2
    const fetchMedia = async () => {
      try {
        const res = await fetch("/api/whatsapp/download-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId, messageId, conversationId }),
        });

        const data = await res.json();

        // Handle 202 (in progress) - wait and retry
        if (res.status === 202 && data.retry) {
          console.log(`⏳ [LazyImage] Server says in progress, will retry...`);
          await new Promise((r) => setTimeout(r, 2000));
          // Retry once
          const retryRes = await fetch("/api/whatsapp/download-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaId, messageId, conversationId }),
          });
          const retryData = await retryRes.json();
          if (retryData.success && retryData.data?.mediaUrl) {
            mediaUrlCache.set(messageId, retryData.data.mediaUrl);
            setUrl(retryData.data.mediaUrl);
            return;
          }
        }

        if (data.success && data.data?.mediaUrl) {
          mediaUrlCache.set(messageId, data.data.mediaUrl);
          setUrl(data.data.mediaUrl);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Error fetching inbound media:", err);
        setError(true);
      } finally {
        setLoading(false);
        // Note: We keep messageId in cache to prevent re-fetches even after success
      }
    };

    fetchMedia();
  }, [mediaId, messageId, conversationId, url]);

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <div
          style={{
            width: "200px",
            height: "200px",
            borderRadius: "8px",
            background: "rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              border: "3px solid rgba(255, 255, 255, 0.3)",
              borderTopColor: "white",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "6px",
            right: "6px",
            background: "rgba(0, 0, 0, 0.5)",
            borderRadius: "4px",
            padding: "2px 6px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "0.6875rem", color: "white" }}>{time}</span>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div style={{ position: "relative" }}>
        <div
          style={{
            width: "200px",
            height: "150px",
            borderRadius: "8px",
            background: "rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255, 255, 255, 0.7)",
          }}
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
          <span style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
            Image unavailable
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "6px",
            right: "6px",
            background: "rgba(0, 0, 0, 0.5)",
            borderRadius: "4px",
            padding: "2px 6px",
          }}
        >
          <span style={{ fontSize: "0.6875rem", color: "white" }}>{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <img
        src={url}
        alt="Image"
        style={{
          maxWidth: "280px",
          borderRadius: "8px",
          display: "block",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "6px",
          right: "6px",
          background: "rgba(0, 0, 0, 0.5)",
          borderRadius: "4px",
          padding: "2px 6px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <span style={{ fontSize: "0.6875rem", color: "white" }}>{time}</span>
        {sender === "user" && (
          <span style={{ fontSize: "0.75rem", color: "#53bdeb" }}>✓✓</span>
        )}
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
}

const MessageBubble = memo(function MessageBubble({
  msg,
  styles,
  conversationId,
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
          <LazyImage
            mediaId={msg.mediaId}
            mediaUrl={msg.mediaUrl}
            messageId={msg.id}
            conversationId={conversationId}
            time={msg.time}
            sender={msg.sender}
          />
        )}
        {(msg.type === "document" || msg.type === "video") && (
          <div className={styles.imageMessage}>
            {msg.type === "video" && msg.mediaUrl ? (
              <video
                src={msg.mediaUrl}
                controls
                style={{
                  maxWidth: "200px",
                  borderRadius: "12px",
                }}
              />
            ) : msg.type === "document" && msg.mediaUrl ? (
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
  // Media upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
      }
    } catch (err) {
      console.error("Error loading older messages:", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, selectedConversation]);

  // Only fetch messages when the conversation ID changes, not when the object updates
  useEffect(() => {
    const currentId = selectedConversation?.id || null;
    const previousId = prevSelectedConversationIdRef.current;

    // Only fetch if the conversation ID actually changed
    if (currentId && currentId !== previousId && selectedConversation) {
      prevSelectedConversationIdRef.current = currentId;

      // Reset pagination state for new conversation
      setHasMore(true);
      oldestCursorRef.current = null;

      fetchMessages(selectedConversation.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Reset initial load flag when conversation changes
    isInitialLoadRef.current = true;
  }, [selectedConversation?.id]);

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
                // Check if message already exists
                if (prev.some((m) => m.messageId === formattedMsg.messageId)) {
                  return prev;
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
      handleSendMessage();
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

    setSelectedFile(file);
    if (mediaType === "image" || mediaType === "video") {
      setMediaPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Cancel media selection
  const handleCancelMedia = () => {
    setSelectedFile(null);
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
      setMediaPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle sending media
  const handleSendMedia = async () => {
    if (!selectedFile || !selectedConversation || uploading) return;

    const mediaType = getMediaTypeFromFile(selectedFile);
    if (!mediaType) return;

    setUploading(true);
    const caption = messageInput.trim();
    setMessageInput("");

    // Ensure scroll to bottom when sending
    isNearBottomRef.current = true;

    // Create optimistic message with local preview
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      messageId: tempId,
      sender: "user",
      content: caption || `[${mediaType}]`,
      time: new Date()
        .toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        })
        .toLowerCase(),
      timestamp: new Date().toISOString(),
      type: mediaType,
      status: "sending",
      mediaUrl: mediaPreviewUrl || undefined, // Local preview initially
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      // Step 1: Upload media to R2 + WhatsApp
      // Include conversationId for deterministic R2 path
      const uploadFormData = new FormData();
      uploadFormData.append("file", selectedFile);
      uploadFormData.append("conversationId", selectedConversation.id);

      const uploadResponse = await fetch("/api/whatsapp/upload-media", {
        method: "POST",
        body: uploadFormData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error(uploadData.message || "Failed to upload media");
      }

      console.log("📤 Media uploaded to R2:", uploadData.data);

      // Update optimistic message with R2 URL (persistent)
      // This URL will survive page refresh!
      if (uploadData.data.mediaUrl) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId
              ? { ...msg, mediaUrl: uploadData.data.mediaUrl }
              : msg,
          ),
        );
      }

      // Step 2: Send message with media
      // Pass both WhatsApp media_id (for delivery) and R2 metadata (for storage)
      const sendResponse = await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedConversation.phone,
          message: caption,
          // WhatsApp delivery
          mediaId: uploadData.data.whatsappMediaId || uploadData.data.mediaId,
          mediaType: uploadData.data.mediaType,
          filename: selectedFile.name,
          // R2 persistent storage (source of truth)
          mediaUrl: uploadData.data.mediaUrl,
          mediaKey: uploadData.data.mediaKey,
          mediaHash: uploadData.data.mediaHash,
          mediaSize: uploadData.data.mediaSize,
          mediaMime: uploadData.data.mediaMime,
          storageProvider: uploadData.data.storageProvider,
        }),
      });

      const sendData = await sendResponse.json();

      if (sendData.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId
              ? {
                  ...msg,
                  id: sendData.data.messageId,
                  messageId: sendData.data.messageId,
                  status: "sent",
                  // Keep R2 URL for persistent display
                  mediaUrl: uploadData.data.mediaUrl || msg.mediaUrl,
                }
              : msg,
          ),
        );
      } else {
        throw new Error(sendData.message || "Failed to send media");
      }
    } catch (err: any) {
      console.error("Error sending media:", err);
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== optimisticMessage.id),
      );
      alert(err.message || "Failed to send media. Please try again.");
    } finally {
      setUploading(false);
      handleCancelMedia();
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
                      {conv.lastMessage}
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
                      />
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
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
                  className={styles.mediaPreviewModal}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.92)",
                    zIndex: 50,
                    display: "flex",
                    flexDirection: "column",
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
                      onClick={handleCancelMedia}
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
                    <div style={{ color: "white", fontWeight: 500 }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ width: 40 }} /> {/* Spacer for centering */}
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
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: "24px",
                        padding: "0.75rem 1.25rem",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Add a caption..."
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
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
                    </div>
                    <button
                      onClick={handleSendMessage}
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
                  <button
                    className={styles.attachBtn}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </button>
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
                  <button className={styles.attachBtn}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  </button>
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
    </div>
  );
}
