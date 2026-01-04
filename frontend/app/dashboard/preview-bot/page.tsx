"use client";

import { useState, useEffect, useRef } from "react";
import styles from "../components/BotSettingsView.module.css";

interface BusinessData {
  businessId: string;
  businessName: string;
  industry: string;
  description: string;
  contact: {
    phone: string;
    email: string;
    whatsapp: string;
    website: string;
  };
  socialMedia: {
    instagram: string;
    facebook: string;
    twitter: string;
    linkedin: string;
    youtube: string;
  };
  location: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    googleMapsLink: string;
    landmarks: string[];
  };
  timings: Record<string, { open: string; close: string; isClosed: boolean }>;
  products: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    price: number;
    priceUnit: string;
    duration: string;
    available: boolean;
    sku: string;
    stockStatus: string;
    imageUrl: string;
    variants: string[];
  }>;
  productCategories: string[];
  policies: {
    refund: string;
    cancellation: string;
    delivery: string;
    paymentMethods: string[];
  };
  ecommercePolicies: {
    shippingPolicy: string;
    shippingZones: string[];
    shippingCharges: string;
    estimatedDelivery: string;
    returnPolicy: string;
    returnWindow: number;
    warrantyPolicy: string;
    codAvailable: boolean;
    internationalShipping: boolean;
  };
  faqs: Array<{ id: string; question: string; answer: string }>;
  brandVoice: {
    tone: string;
    languagePreference: string;
    greetingStyle: string;
    tagline: string;
    uniqueSellingPoints: string[];
    avoidTopics: string[];
    customGreeting: string;
  };
}

export default function PreviewBotPage() {
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "bot"; content: string; time: string; intent?: string }[]
  >([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load business data
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setData(result.data);
          }
        }
      } catch (error) {
        console.error("Error loading business data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Initialize chat with welcome message
  useEffect(() => {
    if (data && chatMessages.length === 0) {
      setChatMessages([
        {
          role: "bot",
          content: `Hi! I'm your AI Business Assistant. I've learned all about ${
            data.businessName || "your business"
          }. Ask me anything to see how I'll respond to your customers!`,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }
  }, [data, chatMessages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const convertToApiFormat = (d: BusinessData) => ({
    business_id: d.businessId || "user_business",
    business_name: d.businessName,
    industry: d.industry,
    description: d.description,
    contact: d.contact,
    social_media: d.socialMedia,
    location: {
      ...d.location,
      google_maps_link: d.location.googleMapsLink,
    },
    timings: Object.fromEntries(
      Object.entries(d.timings).map(([day, timing]) => [
        day,
        { open: timing.open, close: timing.close, is_closed: timing.isClosed },
      ])
    ),
    products_services: d.products.map((p) => ({
      name: p.name,
      category: p.category,
      description: p.description,
      price: p.price,
      price_unit: p.priceUnit,
      duration: p.duration,
      available: p.available,
      sku: p.sku,
      stock_status: p.stockStatus,
      image_url: p.imageUrl,
      variants: p.variants,
    })),
    policies: {
      refund: d.policies.refund,
      cancellation: d.policies.cancellation,
      delivery: d.policies.delivery,
      payment_methods: d.policies.paymentMethods,
    },
    ecommerce_policies: {
      shipping_policy: d.ecommercePolicies.shippingPolicy,
      shipping_zones: d.ecommercePolicies.shippingZones,
      shipping_charges: d.ecommercePolicies.shippingCharges,
      estimated_delivery: d.ecommercePolicies.estimatedDelivery,
      return_policy: d.ecommercePolicies.returnPolicy,
      return_window: d.ecommercePolicies.returnWindow,
      warranty_policy: d.ecommercePolicies.warrantyPolicy,
      cod_available: d.ecommercePolicies.codAvailable,
      international_shipping: d.ecommercePolicies.internationalShipping,
    },
    faqs: d.faqs.map((f) => ({ question: f.question, answer: f.answer })),
    brand_voice: {
      tone: d.brandVoice.tone,
      language_preference: d.brandVoice.languagePreference,
      greeting_style: d.brandVoice.greetingStyle,
      tagline: d.brandVoice.tagline,
      unique_selling_points: d.brandVoice.uniqueSellingPoints,
      avoid_topics: d.brandVoice.avoidTopics,
      custom_greeting: d.brandVoice.customGreeting,
    },
  });

  const handlePreview = async (customQuery?: string) => {
    if (!data) return;

    const query = customQuery || previewQuery;
    if (!query.trim()) return;

    const userTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Add user message to chat
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: query, time: userTime },
    ]);

    setPreviewQuery("");
    setPreviewLoading(true);

    try {
      const response = await fetch("/api/ai/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_data: convertToApiFormat(data),
          user_message: query,
          history: chatMessages.map((m) => ({
            role: m.role === "bot" ? "assistant" : "user",
            content: m.content,
          })),
        }),
      });

      const result = await response.json();

      // Add bot response to chat
      setChatMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content:
            result.reply ||
            result.error ||
            "I'm sorry, I couldn't generate a response.",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          intent: result.intent,
        },
      ]);
    } catch (error) {
      const errorMsg =
        "Could not connect to AI Brain. Make sure backend is running.";
      setChatMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: errorMsg,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 60px)",
          background: "#0a0a0a",
          color: "#888",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid #333",
              borderTop: "3px solid #25D366",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          Loading...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 60px)",
          background: "#0a0a0a",
          color: "#888",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤖</div>
          <p>No business data found.</p>
          <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
            Please set up your AI Settings first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100dvh - 80px)",
        maxHeight: "calc(100dvh - 80px)",
        padding: "0",
        background: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Title Header */}
        <div
          style={{
            padding: "1rem",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            background: "#111",
          }}
        >
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "#fff",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            🤖 AI Assistant Preview
          </h1>
        </div>
        <div
          className={styles.chatContainer}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxHeight: "none",
            margin: 0,
            borderRadius: 0,
          }}
        >
          <div
            className={styles.messageList}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1rem",
            }}
          >
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`${styles.message} ${
                  msg.role === "user" ? styles.userMessage : styles.botMessage
                }`}
              >
                <div className={styles.bubble}>{msg.content}</div>
                <div className={styles.messageTime}>
                  {msg.time}
                  {msg.intent && ` • Intent: ${msg.intent}`}
                </div>
              </div>
            ))}

            {previewLoading && (
              <div className={`${styles.message} ${styles.botMessage}`}>
                <div className={styles.typingBubble}>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div
            className={styles.suggestions}
            style={{
              padding: "0.75rem 1rem",
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              overflowX: "auto",
              gap: "0.5rem",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {[
              "What is the price?",
              "What are your timings?",
              "Where are you located?",
              "How to book an appointment?",
            ].map((s, i) => (
              <button
                key={i}
                className={styles.suggestionChip}
                onClick={() => handlePreview(s)}
                disabled={previewLoading}
                style={{
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div
            className={styles.chatFooter}
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              background: "#111",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "0.5rem",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <input
              type="text"
              value={previewQuery}
              onChange={(e) => setPreviewQuery(e.target.value)}
              placeholder="Type a question..."
              onKeyDown={(e) => e.key === "Enter" && handlePreview()}
              disabled={previewLoading}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#1a1a1a",
                color: "#fff",
                fontSize: "0.9rem",
              }}
            />
            <button
              className={styles.sendButton}
              onClick={() => handlePreview()}
              disabled={previewLoading || !previewQuery.trim()}
              style={{
                padding: "0.75rem 1.25rem",
                borderRadius: "8px",
                background: "#fff",
                color: "#000",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {previewLoading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
