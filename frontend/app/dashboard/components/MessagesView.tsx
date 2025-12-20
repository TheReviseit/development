"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { supabase } from "@/lib/supabase/client";
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

// Helper to format time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
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

// Memoized Message Bubble component to prevent re-rendering on new messages
interface MessageBubbleProps {
  msg: Message;
  styles: Record<string, string>;
}

const MessageBubble = memo(function MessageBubble({
  msg,
  styles,
}: MessageBubbleProps) {
  return (
    <div
      className={`${styles.messageWrapper} ${
        msg.sender === "user" ? styles.messageOut : styles.messageIn
      }`}
    >
      <div className={styles.messageBubble}>
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
          <div className={styles.imageMessage}>
            {msg.mediaUrl ? (
              <img
                src={msg.mediaUrl}
                alt="Image"
                style={{
                  maxWidth: "200px",
                  borderRadius: "12px",
                }}
              />
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
          </div>
        )}
        {(msg.type === "document" || msg.type === "video") && (
          <div className={styles.imageMessage}>
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
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            justifyContent: "flex-end",
          }}
        >
          <span className={styles.messageTime}>{msg.time}</span>
          {msg.sender === "user" && (
            <span
              style={{
                fontSize: "0.7rem",
                color:
                  msg.status === "read"
                    ? "var(--dash-accent)"
                    : "var(--dash-text-muted)",
              }}
            >
              {msg.status === "sending"
                ? "○"
                : msg.status === "sent"
                ? "✓"
                : msg.status === "delivered"
                ? "✓✓"
                : msg.status === "read"
                ? "✓✓"
                : ""}
            </span>
          )}
        </div>
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
  const [showContactPanel, setShowContactPanel] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  // Keep refs in sync with state for use in realtime callback
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Fetch conversations on mount
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/whatsapp/conversations?filter=${filter}`
      );
      const data = await response.json();

      if (data.success) {
        setConversations(data.data);
        if (data.data.length > 0 && !selectedConversationRef.current) {
          setSelectedConversation(data.data[0]);
        }
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
  }, [filter]);

  // Fetch messages when conversation is selected
  const fetchMessages = useCallback(async (contactPhone: string) => {
    try {
      setMessagesLoading(true);
      const response = await fetch(
        `/api/whatsapp/messages?contactPhone=${encodeURIComponent(
          contactPhone
        )}`
      );
      const data = await response.json();

      if (data.success) {
        setMessages(data.data.messages);
        setContactInfo(data.data.contact);
      } else {
        console.error("Failed to load messages:", data.error);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.phone);
    }
  }, [selectedConversation, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
            payload.new
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
          } else if (payload.eventType === "UPDATE") {
            // Update message status
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageId === newMsg.wamid
                  ? { ...msg, status: newMsg.status }
                  : msg
              )
            );
          }
        }
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
            payload.new
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
                updatedConv.last_message_at || updatedConv.created_at
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
                  updatedConv.last_message_at || updated[index].timestamp
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
                  : prev
              );
            }
          }
        }
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
        .toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
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
              : msg
          )
        );
      } else {
        // Remove optimistic message on failure
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticMessage.id)
        );
        alert(data.message || "Failed to send message");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== optimisticMessage.id)
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

  // Mark conversation as read
  const handleMarkAsRead = async () => {
    if (!selectedConversation) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === selectedConversation.id ? { ...conv, unread: 0 } : conv
      )
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
          conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [conversations, searchQuery]
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
      {/* Conversation List Panel */}
      <div className={styles.conversationList}>
        <div className={styles.conversationListHeader}>
          <h2 className={styles.panelTitle}>Conversations</h2>
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
                onClick={() => setSelectedConversation(conv)}
              >
                <div className={styles.conversationAvatar}>
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
                    {conv.unread > 0 && (
                      <span className={styles.unreadBadge}>{conv.unread}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area Panel */}
      <div className={styles.chatArea}>
        {selectedConversation ? (
          <>
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderLeft}>
                <div className={styles.chatAvatar}>
                  {getInitials(selectedConversation.name)}
                </div>
                <div>
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
                <button
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
                </button>
                <button
                  className={styles.togglePanelBtn}
                  onClick={() => setShowContactPanel(!showContactPanel)}
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
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                </button>
                <button className={styles.moreBtn}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="5" cy="12" r="1" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={styles.chatMessages}>
              {messagesLoading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "var(--dash-text-secondary)",
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
                      <MessageBubble key={msg.id} msg={msg} styles={styles} />
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.chatInput}>
              <div className={styles.inputTypeSelect}>
                <select className={styles.messageTypeSelect}>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
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
                  <button className={styles.attachBtn}>
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
                  <button className={styles.attachBtn}>
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
                onClick={handleSendMessage}
                disabled={!messageInput.trim() || sending}
                style={{ opacity: !messageInput.trim() || sending ? 0.5 : 1 }}
              >
                {sending ? "Sending..." : "Send"}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
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
              color: "var(--dash-text-secondary)",
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
              style={{ opacity: 0.5 }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>Select a conversation to view messages</p>
          </div>
        )}
      </div>

      {/* Contact Details Panel */}
      {showContactPanel && selectedConversation && (
        <div className={styles.contactPanel}>
          <div className={styles.contactHeader}>
            <h3 className={styles.panelTitle}>Details</h3>
            <button
              className={styles.closeBtn}
              onClick={() => setShowContactPanel(false)}
            >
              <svg
                width="18"
                height="18"
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
                <span className={styles.fieldIcon}>📞</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.phone}
                  </span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>💬</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Total Messages</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.totalMessages || messages.length}{" "}
                    messages
                  </span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>🌐</span>
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
                <span className={styles.fieldIcon}>📅</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Last Active</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.time}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Stats Section */}
            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>🤖 AI Stats</h5>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>🤖</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>AI Replies</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.aiReplies || 0}
                  </span>
                </div>
              </div>
              <div className={styles.contactField}>
                <span className={styles.fieldIcon}>👤</span>
                <div className={styles.fieldContent}>
                  <span className={styles.fieldLabel}>Human Replies</span>
                  <span className={styles.fieldValue}>
                    {selectedConversation.humanReplies || 0}
                  </span>
                </div>
              </div>
              {(selectedConversation.aiReplies || 0) > 0 && (
                <div className={styles.contactField}>
                  <span className={styles.fieldIcon}>📊</span>
                  <div className={styles.fieldContent}>
                    <span className={styles.fieldLabel}>
                      AI Automation Rate
                    </span>
                    <span className={styles.fieldValue}>
                      {Math.round(
                        ((selectedConversation.aiReplies || 0) /
                          ((selectedConversation.aiReplies || 0) +
                            (selectedConversation.humanReplies || 0))) *
                          100
                      )}
                      %
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Tags & Status</h5>
              <div className={styles.tagsContainer}>
                <span className={styles.tag}>WhatsApp</span>
                {selectedConversation.unread > 0 && (
                  <span
                    className={styles.tag}
                    style={{ background: "var(--dash-warning)", color: "#000" }}
                  >
                    {selectedConversation.unread} Unread
                  </span>
                )}
                {selectedConversation.priority === "high" && (
                  <span
                    className={styles.tag}
                    style={{ background: "var(--dash-danger)" }}
                  >
                    High Priority
                  </span>
                )}
                {selectedConversation.priority === "urgent" && (
                  <span
                    className={styles.tag}
                    style={{ background: "#ff0000" }}
                  >
                    🚨 Urgent
                  </span>
                )}
                {selectedConversation.status === "resolved" && (
                  <span
                    className={styles.tag}
                    style={{ background: "var(--dash-success)" }}
                  >
                    ✓ Resolved
                  </span>
                )}
                {selectedConversation.tags?.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.contactSection}>
              <h5 className={styles.sectionTitle}>Notes</h5>
              <textarea
                className={styles.notesInput}
                placeholder="Add notes about this contact..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
