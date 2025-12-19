"use client";

import { useState, useEffect } from "react";
import styles from "./BotSettingsView.module.css";

// Types for business data
interface ProductService {
  id: string;
  name: string;
  category: string;
  price: number;
  priceUnit: string;
  duration: string;
  available: boolean;
}

interface DayTiming {
  open: string;
  close: string;
  isClosed: boolean;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

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
  location: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    googleMapsLink: string;
    landmarks: string[];
  };
  timings: {
    monday: DayTiming;
    tuesday: DayTiming;
    wednesday: DayTiming;
    thursday: DayTiming;
    friday: DayTiming;
    saturday: DayTiming;
    sunday: DayTiming;
  };
  products: ProductService[];
  policies: {
    refund: string;
    cancellation: string;
    delivery: string;
    paymentMethods: string[];
  };
  faqs: FAQ[];
}

const INDUSTRIES = [
  { value: "salon", label: "💇 Salon & Spa" },
  { value: "clinic", label: "🏥 Clinic / Healthcare" },
  { value: "restaurant", label: "🍽️ Restaurant / Food" },
  { value: "real_estate", label: "🏠 Real Estate" },
  { value: "coaching", label: "📚 Coaching / Tuition" },
  { value: "fitness", label: "💪 Gym / Fitness" },
  { value: "retail", label: "🛍️ Retail / Shop" },
  { value: "education", label: "🎓 Education" },
  { value: "other", label: "🏢 Other" },
];

const DEFAULT_TIMING: DayTiming = {
  open: "09:00",
  close: "18:00",
  isClosed: false,
};

const INITIAL_DATA: BusinessData = {
  businessId: "",
  businessName: "",
  industry: "other",
  description: "",
  contact: { phone: "", email: "", whatsapp: "", website: "" },
  location: {
    address: "",
    city: "",
    state: "",
    pincode: "",
    googleMapsLink: "",
    landmarks: [],
  },
  timings: {
    monday: { ...DEFAULT_TIMING },
    tuesday: { ...DEFAULT_TIMING },
    wednesday: { ...DEFAULT_TIMING },
    thursday: { ...DEFAULT_TIMING },
    friday: { ...DEFAULT_TIMING },
    saturday: { ...DEFAULT_TIMING },
    sunday: { open: "10:00", close: "16:00", isClosed: false },
  },
  products: [],
  policies: { refund: "", cancellation: "", delivery: "", paymentMethods: [] },
  faqs: [],
};

type TabType =
  | "profile"
  | "services"
  | "timings"
  | "policies"
  | "faqs"
  | "preview";

export default function BotSettingsView() {
  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [data, setData] = useState<BusinessData>(INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewResponse, setPreviewResponse] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const saved = await response.json();
          if (saved.data) {
            setData({ ...INITIAL_DATA, ...saved.data });
          }
        }
      } catch (error) {
        console.log("No existing data found");
      }
    };
    loadData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Save to Firestore
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Also sync to Flask backend for WhatsApp webhook
      try {
        await fetch("http://localhost:5000/api/whatsapp/set-business-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(convertToApiFormat(data)),
        });
      } catch (syncError) {
        console.log("Backend sync skipped (backend may not be running)");
      }

      if (response.ok) {
        setMessage({
          type: "success",
          text: "Business profile saved successfully! 🎉",
        });
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!previewQuery.trim()) return;
    setPreviewLoading(true);
    setPreviewResponse(null);
    try {
      const response = await fetch("/api/ai/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_data: convertToApiFormat(data),
          user_message: previewQuery,
          history: [],
        }),
      });
      const result = await response.json();
      setPreviewResponse(result);
    } catch (error) {
      setPreviewResponse({
        error: "Could not connect to AI Brain. Make sure backend is running.",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const convertToApiFormat = (d: BusinessData) => ({
    business_id: d.businessId || "user_business",
    business_name: d.businessName,
    industry: d.industry,
    description: d.description,
    contact: d.contact,
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
      price: p.price,
      price_unit: p.priceUnit,
      duration: p.duration,
      available: p.available,
    })),
    policies: {
      refund: d.policies.refund,
      cancellation: d.policies.cancellation,
      delivery: d.policies.delivery,
      payment_methods: d.policies.paymentMethods,
    },
    faqs: d.faqs.map((f) => ({ question: f.question, answer: f.answer })),
  });

  // Product management
  const addProduct = () => {
    setData({
      ...data,
      products: [
        ...data.products,
        {
          id: Date.now().toString(),
          name: "",
          category: "",
          price: 0,
          priceUnit: "",
          duration: "",
          available: true,
        },
      ],
    });
  };

  const updateProduct = (
    id: string,
    field: keyof ProductService,
    value: any
  ) => {
    setData({
      ...data,
      products: data.products.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      ),
    });
  };

  const removeProduct = (id: string) => {
    setData({ ...data, products: data.products.filter((p) => p.id !== id) });
  };

  // FAQ management
  const addFaq = () => {
    setData({
      ...data,
      faqs: [
        ...data.faqs,
        { id: Date.now().toString(), question: "", answer: "" },
      ],
    });
  };

  const updateFaq = (
    id: string,
    field: "question" | "answer",
    value: string
  ) => {
    setData({
      ...data,
      faqs: data.faqs.map((f) => (f.id === id ? { ...f, [field]: value } : f)),
    });
  };

  const removeFaq = (id: string) => {
    setData({ ...data, faqs: data.faqs.filter((f) => f.id !== id) });
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "🏢" },
    { id: "services", label: "Services", icon: "🛒" },
    { id: "timings", label: "Timings", icon: "🕐" },
    { id: "policies", label: "Policies", icon: "📋" },
    { id: "faqs", label: "FAQs", icon: "❓" },
    { id: "preview", label: "Preview", icon: "🤖" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🤖 AI Settings</h1>
        <p className={styles.subtitle}>
          Configure your business profile for AI-powered responses
        </p>
      </div>

      {message && (
        <div
          className={`${styles.message} ${
            message.type === "success" ? styles.success : styles.error
          }`}
        >
          {message.text}
        </div>
      )}

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${
              activeTab === tab.id ? styles.tabActive : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === "profile" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Business Profile</h2>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Business Name *</label>
                <input
                  type="text"
                  value={data.businessName}
                  onChange={(e) =>
                    setData({ ...data, businessName: e.target.value })
                  }
                  placeholder="e.g., Style Studio"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Industry *</label>
                <select
                  value={data.industry}
                  onChange={(e) =>
                    setData({ ...data, industry: e.target.value })
                  }
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind.value} value={ind.value}>
                      {ind.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Description</label>
              <textarea
                value={data.description}
                onChange={(e) =>
                  setData({ ...data, description: e.target.value })
                }
                placeholder="Brief description of your business..."
                rows={3}
              />
            </div>

            <h3 className={styles.subTitle}>Contact Information</h3>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={data.contact.phone}
                  onChange={(e) =>
                    setData({
                      ...data,
                      contact: { ...data.contact, phone: e.target.value },
                    })
                  }
                  placeholder="e.g., 9876543210"
                />
              </div>
              <div className={styles.formGroup}>
                <label>WhatsApp Number</label>
                <input
                  type="tel"
                  value={data.contact.whatsapp}
                  onChange={(e) =>
                    setData({
                      ...data,
                      contact: { ...data.contact, whatsapp: e.target.value },
                    })
                  }
                  placeholder="e.g., 9876543210"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Email</label>
                <input
                  type="email"
                  value={data.contact.email}
                  onChange={(e) =>
                    setData({
                      ...data,
                      contact: { ...data.contact, email: e.target.value },
                    })
                  }
                  placeholder="e.g., hello@business.com"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Website</label>
                <input
                  type="url"
                  value={data.contact.website}
                  onChange={(e) =>
                    setData({
                      ...data,
                      contact: { ...data.contact, website: e.target.value },
                    })
                  }
                  placeholder="e.g., https://example.com"
                />
              </div>
            </div>

            <h3 className={styles.subTitle}>Location</h3>
            <div className={styles.formGroup}>
              <label>Address</label>
              <input
                type="text"
                value={data.location.address}
                onChange={(e) =>
                  setData({
                    ...data,
                    location: { ...data.location, address: e.target.value },
                  })
                }
                placeholder="e.g., 123, MG Road"
              />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>City</label>
                <input
                  type="text"
                  value={data.location.city}
                  onChange={(e) =>
                    setData({
                      ...data,
                      location: { ...data.location, city: e.target.value },
                    })
                  }
                  placeholder="e.g., Mumbai"
                />
              </div>
              <div className={styles.formGroup}>
                <label>State</label>
                <input
                  type="text"
                  value={data.location.state}
                  onChange={(e) =>
                    setData({
                      ...data,
                      location: { ...data.location, state: e.target.value },
                    })
                  }
                  placeholder="e.g., Maharashtra"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Pincode</label>
                <input
                  type="text"
                  value={data.location.pincode}
                  onChange={(e) =>
                    setData({
                      ...data,
                      location: { ...data.location, pincode: e.target.value },
                    })
                  }
                  placeholder="e.g., 400001"
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Google Maps Link</label>
              <input
                type="url"
                value={data.location.googleMapsLink}
                onChange={(e) =>
                  setData({
                    ...data,
                    location: {
                      ...data.location,
                      googleMapsLink: e.target.value,
                    },
                  })
                }
                placeholder="e.g., https://maps.google.com/?q=..."
              />
            </div>
          </div>
        )}

        {activeTab === "services" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Products & Services</h2>
              <button className={styles.addButton} onClick={addProduct}>
                + Add Service
              </button>
            </div>

            {data.products.length === 0 ? (
              <div className={styles.emptyState}>
                <p>
                  No services added yet. Add your first service to help the AI
                  answer pricing questions!
                </p>
              </div>
            ) : (
              <div className={styles.productList}>
                {data.products.map((product, index) => (
                  <div key={product.id} className={styles.productCard}>
                    <div className={styles.productHeader}>
                      <span className={styles.productNumber}>#{index + 1}</span>
                      <button
                        className={styles.removeButton}
                        onClick={() => removeProduct(product.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.formGroup}>
                        <label>Service Name *</label>
                        <input
                          type="text"
                          value={product.name}
                          onChange={(e) =>
                            updateProduct(product.id, "name", e.target.value)
                          }
                          placeholder="e.g., Haircut - Men"
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Category</label>
                        <input
                          type="text"
                          value={product.category}
                          onChange={(e) =>
                            updateProduct(
                              product.id,
                              "category",
                              e.target.value
                            )
                          }
                          placeholder="e.g., Hair"
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Price (₹)</label>
                        <input
                          type="number"
                          value={product.price || ""}
                          onChange={(e) =>
                            updateProduct(
                              product.id,
                              "price",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="e.g., 300"
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Duration</label>
                        <input
                          type="text"
                          value={product.duration}
                          onChange={(e) =>
                            updateProduct(
                              product.id,
                              "duration",
                              e.target.value
                            )
                          }
                          placeholder="e.g., 30 min"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "timings" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Operating Hours</h2>
            <div className={styles.timingsList}>
              {(
                [
                  "monday",
                  "tuesday",
                  "wednesday",
                  "thursday",
                  "friday",
                  "saturday",
                  "sunday",
                ] as const
              ).map((day) => (
                <div key={day} className={styles.timingRow}>
                  <span className={styles.dayLabel}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </span>
                  <label className={styles.closedToggle}>
                    <input
                      type="checkbox"
                      checked={data.timings[day].isClosed}
                      onChange={(e) =>
                        setData({
                          ...data,
                          timings: {
                            ...data.timings,
                            [day]: {
                              ...data.timings[day],
                              isClosed: e.target.checked,
                            },
                          },
                        })
                      }
                    />
                    <span>Closed</span>
                  </label>
                  {!data.timings[day].isClosed && (
                    <>
                      <input
                        type="time"
                        value={data.timings[day].open}
                        onChange={(e) =>
                          setData({
                            ...data,
                            timings: {
                              ...data.timings,
                              [day]: {
                                ...data.timings[day],
                                open: e.target.value,
                              },
                            },
                          })
                        }
                        className={styles.timeInput}
                      />
                      <span className={styles.timeSeparator}>to</span>
                      <input
                        type="time"
                        value={data.timings[day].close}
                        onChange={(e) =>
                          setData({
                            ...data,
                            timings: {
                              ...data.timings,
                              [day]: {
                                ...data.timings[day],
                                close: e.target.value,
                              },
                            },
                          })
                        }
                        className={styles.timeInput}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "policies" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Business Policies</h2>
            <div className={styles.formGroup}>
              <label>Refund Policy</label>
              <textarea
                value={data.policies.refund}
                onChange={(e) =>
                  setData({
                    ...data,
                    policies: { ...data.policies, refund: e.target.value },
                  })
                }
                placeholder="e.g., No refunds after service is completed..."
                rows={2}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Cancellation Policy</label>
              <textarea
                value={data.policies.cancellation}
                onChange={(e) =>
                  setData({
                    ...data,
                    policies: {
                      ...data.policies,
                      cancellation: e.target.value,
                    },
                  })
                }
                placeholder="e.g., Free cancellation up to 2 hours before..."
                rows={2}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Delivery Policy</label>
              <textarea
                value={data.policies.delivery}
                onChange={(e) =>
                  setData({
                    ...data,
                    policies: { ...data.policies, delivery: e.target.value },
                  })
                }
                placeholder="e.g., Free delivery within 5km..."
                rows={2}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Payment Methods (comma separated)</label>
              <input
                type="text"
                value={data.policies.paymentMethods.join(", ")}
                onChange={(e) =>
                  setData({
                    ...data,
                    policies: {
                      ...data.policies,
                      paymentMethods: e.target.value
                        .split(",")
                        .map((s) => s.trim()),
                    },
                  })
                }
                placeholder="e.g., Cash, UPI, Card"
              />
            </div>
          </div>
        )}

        {activeTab === "faqs" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                Frequently Asked Questions
              </h2>
              <button className={styles.addButton} onClick={addFaq}>
                + Add FAQ
              </button>
            </div>

            {data.faqs.length === 0 ? (
              <div className={styles.emptyState}>
                <p>
                  No FAQs added yet. Add common questions to help the AI answer
                  better!
                </p>
              </div>
            ) : (
              <div className={styles.faqList}>
                {data.faqs.map((faq, index) => (
                  <div key={faq.id} className={styles.faqCard}>
                    <div className={styles.faqHeader}>
                      <span>FAQ #{index + 1}</span>
                      <button
                        className={styles.removeButton}
                        onClick={() => removeFaq(faq.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Question</label>
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(e) =>
                          updateFaq(faq.id, "question", e.target.value)
                        }
                        placeholder="e.g., Do you accept walk-ins?"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Answer</label>
                      <textarea
                        value={faq.answer}
                        onChange={(e) =>
                          updateFaq(faq.id, "answer", e.target.value)
                        }
                        placeholder="e.g., Yes, walk-ins are welcome but appointments are preferred."
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "preview" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Test AI Responses</h2>
            <p className={styles.previewHint}>
              Try asking questions like: "What is the price?", "Timing?", "Where
              are you located?"
            </p>

            <div className={styles.previewInput}>
              <input
                type="text"
                value={previewQuery}
                onChange={(e) => setPreviewQuery(e.target.value)}
                placeholder="Type a customer question..."
                onKeyDown={(e) => e.key === "Enter" && handlePreview()}
              />
              <button
                onClick={handlePreview}
                disabled={previewLoading || !previewQuery.trim()}
              >
                {previewLoading ? "..." : "Send"}
              </button>
            </div>

            {previewResponse && (
              <div className={styles.previewResponse}>
                {previewResponse.error ? (
                  <div className={styles.previewError}>
                    {previewResponse.error}
                  </div>
                ) : (
                  <>
                    <div className={styles.previewMeta}>
                      <span className={styles.intentBadge}>
                        Intent: {previewResponse.intent} (
                        {Math.round(previewResponse.confidence * 100)}%)
                      </span>
                      {previewResponse.needs_human && (
                        <span className={styles.humanBadge}>Needs Human</span>
                      )}
                    </div>
                    <div className={styles.previewMessage}>
                      <div className={styles.botIcon}>🤖</div>
                      <div className={styles.botReply}>
                        {previewResponse.reply}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "💾 Save Changes"}
        </button>
      </div>
    </div>
  );
}
