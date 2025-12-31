"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./BotSettingsView.module.css";
import CustomDropdown, { DropdownOption } from "./CustomDropdown";
import SearchableDropdown from "./SearchableDropdown";
import { AlertToast } from "@/components/ui/alert-toast";
import alertStyles from "@/components/ui/alert.module.css";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX, AlertTriangle } from "lucide-react";

// Types for business data
interface ProductService {
  id: string;
  name: string;
  category: string;
  price: number;
  priceUnit: string;
  duration: string;
  available: boolean;
  description: string;
  sku: string;
  stockStatus: string;
  imageUrl: string;
  variants: string[];
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

// Appointment configuration types
interface AppointmentField {
  id: string;
  label: string;
  type: "text" | "phone" | "email" | "date" | "time" | "textarea" | "select";
  required: boolean;
  order: number;
  options?: string[];
  placeholder?: string;
}

interface BusinessHours {
  start: string;
  end: string;
  duration: number;
  buffer?: number;
}

interface SocialMediaLinks {
  instagram: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  youtube: string;
}

interface EcommercePolicies {
  shippingPolicy: string;
  shippingZones: string[];
  shippingCharges: string;
  estimatedDelivery: string;
  returnPolicy: string;
  returnWindow: number;
  warrantyPolicy: string;
  codAvailable: boolean;
  internationalShipping: boolean;
}

interface BrandVoice {
  tone: string;
  languagePreference: string;
  greetingStyle: string;
  tagline: string;
  uniqueSellingPoints: string[];
  avoidTopics: string[];
  customGreeting: string;
}

interface BusinessData {
  businessId: string;
  businessName: string;
  industry: string;
  customIndustry?: string;
  description: string;
  contact: {
    phone: string;
    email: string;
    whatsapp: string;
    website: string;
  };
  socialMedia: SocialMediaLinks;
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
  ecommercePolicies: EcommercePolicies;
  faqs: FAQ[];
  brandVoice: BrandVoice;
}

const INDUSTRIES = [
  {
    value: "salon",
    label: "Salon & Spa",
    iconPath: "/icons/ai_settings/bussiness_type/salon.svg",
  },
  {
    value: "clinic",
    label: "Clinic / Healthcare",
    iconPath: "/icons/ai_settings/bussiness_type/clinic.svg",
  },
  {
    value: "restaurant",
    label: "Restaurant / Food",
    iconPath: "/icons/ai_settings/bussiness_type/restoreent.svg",
  },
  {
    value: "real_estate",
    label: "Real Estate",
    iconPath: "/icons/ai_settings/bussiness_type/real_esate.svg",
  },
  {
    value: "coaching",
    label: "Coaching / Tuition",
    iconPath: "/icons/ai_settings/bussiness_type/others.svg",
  },
  {
    value: "fitness",
    label: "Gym / Fitness",
    iconPath: "/icons/ai_settings/bussiness_type/gym.svg",
  },
  {
    value: "retail",
    label: "Retail / Shop",
    iconPath: "/icons/ai_settings/bussiness_type/retail.svg",
  },
  {
    value: "education",
    label: "Education",
    iconPath: "/icons/ai_settings/bussiness_type/others.svg",
  },
  {
    value: "ecommerce",
    label: "E-commerce / Online Store",
    iconPath: "/icons/ai_settings/bussiness_type/ecommers.svg",
  },
  {
    value: "travel",
    label: "Travel & Tourism",
    iconPath: "/icons/ai_settings/bussiness_type/travel.svg",
  },
  {
    value: "logistics",
    label: "Logistics & Delivery",
    iconPath: "/icons/ai_settings/bussiness_type/logistics.svg",
  },
  // {
  //   value: "home_services",
  //   label: "Home Services",
  //   iconPath: "/icons/ai_settings/bussiness_type/others.svg",
  // },
  {
    value: "automobile",
    label: "Automobile",
    iconPath: "/icons/ai_settings/bussiness_type/automobile.svg",
  },
  {
    value: "finance",
    label: "Finance & Banking",
    iconPath: "/icons/ai_settings/bussiness_type/finance.svg",
  },
  {
    value: "events",
    label: "Events & Entertainment",
    iconPath: "/icons/ai_settings/bussiness_type/events.svg",
  },
  {
    value: "other",
    label: "Other (Custom)",
    iconPath: "/icons/ai_settings/bussiness_type/others.svg",
  },
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
  socialMedia: {
    instagram: "",
    facebook: "",
    twitter: "",
    linkedin: "",
    youtube: "",
  },
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
  ecommercePolicies: {
    shippingPolicy: "",
    shippingZones: [],
    shippingCharges: "",
    estimatedDelivery: "",
    returnPolicy: "",
    returnWindow: 7,
    warrantyPolicy: "",
    codAvailable: false,
    internationalShipping: false,
  },
  faqs: [],
  brandVoice: {
    tone: "friendly",
    languagePreference: "en",
    greetingStyle: "",
    tagline: "",
    uniqueSellingPoints: [],
    avoidTopics: [],
    customGreeting: "",
  },
};

type TabType =
  | "profile"
  | "brand"
  | "services"
  | "timings"
  | "policies"
  | "ecommerce"
  | "faqs"
  | "capabilities"
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
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "bot"; content: string; time: string; intent?: string }[]
  >([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // AI Capabilities state
  const [appointmentBookingEnabled, setAppointmentBookingEnabled] =
    useState(false);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [capabilityExpanded, setCapabilityExpanded] = useState(false);
  const [alertToast, setAlertToast] = useState<{
    show: boolean;
    variant: "success" | "warning" | "info" | "error";
    title: string;
    description: string;
  } | null>(null);

  // Appointment configuration state
  const [appointmentFields, setAppointmentFields] = useState<
    AppointmentField[]
  >([
    { id: "name", label: "Full Name", type: "text", required: true, order: 1 },
    {
      id: "phone",
      label: "Phone Number",
      type: "phone",
      required: true,
      order: 2,
    },
    {
      id: "date",
      label: "Appointment Date",
      type: "date",
      required: true,
      order: 3,
    },
    {
      id: "time",
      label: "Appointment Time",
      type: "time",
      required: true,
      order: 4,
    },
  ]);
  const [businessHours, setBusinessHours] = useState<BusinessHours>({
    start: "09:00",
    end: "18:00",
    duration: 60,
    buffer: 0,
  });
  const [minimalMode, setMinimalMode] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);

  // Initialize chat with welcome message if empty
  useEffect(() => {
    if (activeTab === "preview" && chatMessages.length === 0) {
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
  }, [activeTab, data.businessName, chatMessages.length]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, previewLoading]);

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

  // Load AI capabilities on mount
  useEffect(() => {
    const loadCapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setAppointmentBookingEnabled(
              result.data.appointment_booking_enabled || false
            );
            // Load appointment configuration
            if (result.data.appointment_fields) {
              setAppointmentFields(result.data.appointment_fields);
            }
            if (result.data.appointment_business_hours) {
              setBusinessHours(result.data.appointment_business_hours);
            }
            if (result.data.appointment_minimal_mode !== undefined) {
              setMinimalMode(result.data.appointment_minimal_mode);
            }
          }
        }
      } catch (error) {
        console.log("Error loading AI capabilities");
      }
    };
    loadCapabilities();
  }, []);

  // Handle appointment booking toggle
  const handleAppointmentToggle = async () => {
    const newValue = !appointmentBookingEnabled;
    setCapabilitiesLoading(true);

    // Immediately update local state for instant UI feedback
    setAppointmentBookingEnabled(newValue);

    // Immediately dispatch event to update sidebar (don't wait for API)
    window.dispatchEvent(
      new CustomEvent("ai-capabilities-updated", {
        detail: { appointment_booking_enabled: newValue },
      })
    );

    try {
      const response = await fetch("/api/ai-capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_booking_enabled: newValue }),
      });

      if (response.ok) {
        setAlertToast({
          show: true,
          variant: "success",
          title: newValue ? "Booking Enabled!" : "Booking Disabled!",
          description: "",
        });
      } else {
        setAlertToast({
          show: true,
          variant: "warning",
          title: newValue ? "Enabled Locally" : "Disabled Locally",
          description: "",
        });
      }
    } catch (error) {
      setAlertToast({
        show: true,
        variant: "warning",
        title: newValue ? "Enabled Locally" : "Disabled Locally",
        description: "",
      });
    } finally {
      setCapabilitiesLoading(false);
    }
  };

  // Appointment field management functions
  const addAppointmentField = () => {
    const newField: AppointmentField = {
      id: `custom_${Date.now()}`,
      label: "",
      type: "text",
      required: false,
      order: appointmentFields.length + 1,
      placeholder: "",
    };
    setAppointmentFields([...appointmentFields, newField]);
  };

  const updateAppointmentField = (
    id: string,
    updates: Partial<AppointmentField>
  ) => {
    setAppointmentFields(
      appointmentFields.map((field) =>
        field.id === id ? { ...field, ...updates } : field
      )
    );
  };

  const removeAppointmentField = (id: string) => {
    // Don't allow removing core fields
    const coreFields = ["name", "phone", "date", "time"];
    if (coreFields.includes(id)) {
      setAlertToast({
        show: true,
        variant: "warning",
        title: "Cannot Remove",
        description: "Core fields cannot be removed",
      });
      return;
    }
    setAppointmentFields(
      appointmentFields
        .filter((field) => field.id !== id)
        .map((field, index) => ({ ...field, order: index + 1 }))
    );
  };

  const moveFieldUp = (id: string) => {
    const index = appointmentFields.findIndex((f) => f.id === id);
    if (index <= 0) return;
    const newFields = [...appointmentFields];
    [newFields[index - 1], newFields[index]] = [
      newFields[index],
      newFields[index - 1],
    ];
    setAppointmentFields(newFields.map((f, i) => ({ ...f, order: i + 1 })));
  };

  const moveFieldDown = (id: string) => {
    const index = appointmentFields.findIndex((f) => f.id === id);
    if (index >= appointmentFields.length - 1) return;
    const newFields = [...appointmentFields];
    [newFields[index], newFields[index + 1]] = [
      newFields[index + 1],
      newFields[index],
    ];
    setAppointmentFields(newFields.map((f, i) => ({ ...f, order: i + 1 })));
  };

  // Save appointment configuration
  const saveAppointmentConfig = async () => {
    setCapabilitiesLoading(true);
    try {
      const response = await fetch("/api/ai-capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_fields: appointmentFields,
          appointment_business_hours: businessHours,
          appointment_minimal_mode: minimalMode,
        }),
      });

      if (response.ok) {
        setAlertToast({
          show: true,
          variant: "success",
          title: "Configuration Saved!",
          description: "",
        });
      } else {
        setAlertToast({
          show: true,
          variant: "error",
          title: "Save Failed",
          description: "",
        });
      }
    } catch (error) {
      setAlertToast({
        show: true,
        variant: "error",
        title: "Save Failed",
        description: "",
      });
    } finally {
      setCapabilitiesLoading(false);
    }
  };

  // Auto-dismiss toast notification after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Auto-dismiss alert toast after 3 seconds
  useEffect(() => {
    if (alertToast?.show) {
      const timer = setTimeout(() => {
        setAlertToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [alertToast]);

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
        const backendUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        await fetch(`${backendUrl}/api/whatsapp/set-business-data`, {
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

  const handlePreview = async (customQuery?: string) => {
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
    setPreviewResponse(null);

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
      setPreviewResponse(result);

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
      setPreviewResponse({ error: errorMsg });
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
          description: "",
          price: 0,
          priceUnit: "",
          duration: "",
          available: true,
          sku: "",
          stockStatus: "in_stock",
          imageUrl: "",
          variants: [],
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

  // Tab configuration with SVG icons
  const tabs: { id: TabType; label: string; iconPath: string }[] = [
    {
      id: "profile",
      label: "Profile",
      iconPath: "/icons/ai_settings/profile.svg",
    },
    {
      id: "brand",
      label: "Brand Voice",
      iconPath: "/icons/ai_settings/brand_voice.svg",
    },
    {
      id: "services",
      label: "Services",
      iconPath: "/icons/ai_settings/services.svg",
    },
    {
      id: "timings",
      label: "Timings",
      iconPath: "/icons/ai_settings/store_timings.svg",
    },
    {
      id: "policies",
      label: "Policies",
      iconPath: "/icons/ai_settings/policies.svg",
    },
    {
      id: "ecommerce",
      label: "E-commerce",
      iconPath: "/icons/ai_settings/ecommerce.svg",
    },
    { id: "faqs", label: "FAQs", iconPath: "/icons/ai_settings/faqs.svg" },
    {
      id: "capabilities",
      label: "Capabilities",
      iconPath: "/icons/ai_settings/preview.svg",
    },
    {
      id: "preview",
      label: "Preview",
      iconPath: "/icons/ai_settings/preview.svg",
    },
  ];

  // Check if a tab's required fields are complete
  const checkTabCompletion = (tabId: TabType): boolean => {
    switch (tabId) {
      case "profile":
        return !!(
          data.businessName.trim() &&
          data.industry &&
          data.contact.phone.trim()
        );
      case "brand":
        return !!(data.brandVoice.tone && data.brandVoice.languagePreference);
      case "services":
        return (
          data.products.length > 0 &&
          data.products.every((p) => p.name.trim() && p.price > 0)
        );
      case "timings":
        return Object.values(data.timings).some(
          (t) => !t.isClosed && t.open && t.close
        );
      case "policies":
        return !!(
          data.policies.refund.trim() || data.policies.cancellation.trim()
        );
      case "ecommerce":
        return !!(
          data.ecommercePolicies.shippingPolicy.trim() ||
          data.ecommercePolicies.returnPolicy.trim()
        );
      case "faqs":
        return (
          data.faqs.length > 0 &&
          data.faqs.every((f) => f.question.trim() && f.answer.trim())
        );
      case "capabilities":
        return true; // Capabilities is always "complete"
      case "preview":
        return true; // Preview is always "complete"
      default:
        return false;
    }
  };

  const getTabStatus = (tabId: TabType) => {
    if (tabId === "preview") return null;
    return checkTabCompletion(tabId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🤖 AI Settings</h1>
        <p className={styles.subtitle}>
          Configure your business profile for AI-powered responses
        </p>
      </div>

      {/* Toast Notification */}
      {message && (
        <div className={styles.toastContainer}>
          <div
            className={`${styles.toast} ${
              message.type === "success" ? styles.success : styles.error
            }`}
          >
            <div className={styles.toastIcon}>
              {message.type === "success" ? "✓" : "✕"}
            </div>
            <div className={styles.toastContent}>
              <div className={styles.toastTitle}>
                {message.type === "success" ? "Success" : "Error"}
              </div>
              <div className={styles.toastMessage}>{message.text}</div>
            </div>
            <button
              className={styles.toastClose}
              onClick={() => setMessage(null)}
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Alert Toast for Appointment Toggle */}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999 }}>
        <AnimatePresence>
          {alertToast?.show && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`${alertStyles.alertNotification} ${
                alertToast.variant === "success"
                  ? alertStyles.alertSuccess
                  : alertToast.variant === "warning"
                  ? alertStyles.alertWarning
                  : alertStyles.alertError
              }`}
            >
              <div className={alertStyles.alertRow}>
                <span className={alertStyles.alertIcon}>
                  {alertToast.variant === "success" ? (
                    <CircleCheck
                      className={alertStyles.iconSuccess}
                      size={20}
                      strokeWidth={2}
                    />
                  ) : alertToast.variant === "warning" ? (
                    <AlertTriangle
                      className={alertStyles.iconWarning}
                      size={20}
                      strokeWidth={2}
                    />
                  ) : (
                    <CircleX
                      className={alertStyles.iconError}
                      size={20}
                      strokeWidth={2}
                    />
                  )}
                </span>
                <p className={alertStyles.alertText}>{alertToast.title}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Dropdown - Custom Component */}
      <div className={styles.mobileTabSelect}>
        <CustomDropdown
          options={tabs.map((tab) => ({
            id: tab.id,
            label: tab.label,
            iconPath: tab.iconPath,
            status:
              getTabStatus(tab.id) === null
                ? null
                : getTabStatus(tab.id)
                ? "complete"
                : "incomplete",
          }))}
          value={activeTab}
          onChange={(value) => setActiveTab(value as TabType)}
          placeholder="Select a section"
        />
      </div>

      {/* Desktop Tabs */}
      <div className={styles.tabs}>
        {tabs.map((tab) => {
          const status = getTabStatus(tab.id);
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${
                activeTab === tab.id ? styles.tabActive : ""
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <img
                src={tab.iconPath}
                alt=""
                className={styles.tabIcon}
                width={20}
                height={20}
              />
              <span>{tab.label}</span>
              {status !== null && (
                <span
                  className={`${styles.tabStatus} ${
                    status ? styles.tabComplete : styles.tabIncomplete
                  }`}
                >
                  {status ? "✓" : "!"}
                </span>
              )}
            </button>
          );
        })}
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
                <SearchableDropdown
                  options={INDUSTRIES.map((ind) => ({
                    id: ind.value,
                    label: ind.label,
                    iconPath: ind.iconPath,
                  }))}
                  value={data.industry}
                  customValue={data.customIndustry || ""}
                  onChange={(value, customValue) =>
                    setData({
                      ...data,
                      industry: value,
                      customIndustry: customValue,
                    })
                  }
                  placeholder="Type to search or add your business type..."
                />
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

            <h3 className={styles.subTitle}>Social Media</h3>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Instagram</label>
                <input
                  type="url"
                  value={data.socialMedia.instagram}
                  onChange={(e) =>
                    setData({
                      ...data,
                      socialMedia: {
                        ...data.socialMedia,
                        instagram: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., https://instagram.com/yourbusiness"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Facebook</label>
                <input
                  type="url"
                  value={data.socialMedia.facebook}
                  onChange={(e) =>
                    setData({
                      ...data,
                      socialMedia: {
                        ...data.socialMedia,
                        facebook: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., https://facebook.com/yourbusiness"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Twitter / X</label>
                <input
                  type="url"
                  value={data.socialMedia.twitter}
                  onChange={(e) =>
                    setData({
                      ...data,
                      socialMedia: {
                        ...data.socialMedia,
                        twitter: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., https://twitter.com/yourbusiness"
                />
              </div>
              <div className={styles.formGroup}>
                <label>YouTube</label>
                <input
                  type="url"
                  value={data.socialMedia.youtube}
                  onChange={(e) =>
                    setData({
                      ...data,
                      socialMedia: {
                        ...data.socialMedia,
                        youtube: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., https://youtube.com/@yourbusiness"
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

        {activeTab === "brand" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Brand Voice & Identity</h2>
            <p className={styles.previewHint}>
              Define your brand personality to help the AI communicate in your
              unique voice.
            </p>

            <div className={styles.formGroup}>
              <label>Tagline / Slogan</label>
              <input
                type="text"
                value={data.brandVoice.tagline}
                onChange={(e) =>
                  setData({
                    ...data,
                    brandVoice: { ...data.brandVoice, tagline: e.target.value },
                  })
                }
                placeholder="e.g., 'Quality you can trust'"
              />
            </div>

            <div className={styles.formGroup}>
              <label>AI Tone</label>
              <select
                value={data.brandVoice.tone}
                onChange={(e) =>
                  setData({
                    ...data,
                    brandVoice: { ...data.brandVoice, tone: e.target.value },
                  })
                }
              >
                <option value="friendly">😊 Friendly & Casual</option>
                <option value="professional">💼 Professional & Formal</option>
                <option value="casual">🎉 Fun & Playful</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Custom Greeting Message</label>
              <textarea
                value={data.brandVoice.customGreeting}
                onChange={(e) =>
                  setData({
                    ...data,
                    brandVoice: {
                      ...data.brandVoice,
                      customGreeting: e.target.value,
                    },
                  })
                }
                placeholder="e.g., 'Welcome to our store! I'm here to help you find exactly what you need.'"
                rows={2}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Unique Selling Points (comma separated)</label>
              <input
                type="text"
                value={data.brandVoice.uniqueSellingPoints.join(", ")}
                onChange={(e) =>
                  setData({
                    ...data,
                    brandVoice: {
                      ...data.brandVoice,
                      uniqueSellingPoints: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                placeholder="e.g., Free shipping, 24/7 support, 100% organic"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Topics AI Should Avoid (comma separated)</label>
              <input
                type="text"
                value={data.brandVoice.avoidTopics.join(", ")}
                onChange={(e) =>
                  setData({
                    ...data,
                    brandVoice: {
                      ...data.brandVoice,
                      avoidTopics: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                placeholder="e.g., Competitor names, pricing negotiations"
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

        {activeTab === "ecommerce" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>E-commerce Policies</h2>
            <p className={styles.previewHint}>
              Configure shipping, returns, and warranty policies for your online
              store.
            </p>

            <h3 className={styles.subTitle}>Shipping</h3>
            <div className={styles.formGroup}>
              <label>Shipping Policy</label>
              <textarea
                value={data.ecommercePolicies.shippingPolicy}
                onChange={(e) =>
                  setData({
                    ...data,
                    ecommercePolicies: {
                      ...data.ecommercePolicies,
                      shippingPolicy: e.target.value,
                    },
                  })
                }
                placeholder="e.g., We ship via trusted courier partners with package tracking..."
                rows={2}
              />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Shipping Charges</label>
                <input
                  type="text"
                  value={data.ecommercePolicies.shippingCharges}
                  onChange={(e) =>
                    setData({
                      ...data,
                      ecommercePolicies: {
                        ...data.ecommercePolicies,
                        shippingCharges: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., Free above ₹500, else ₹50"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Estimated Delivery Time</label>
                <input
                  type="text"
                  value={data.ecommercePolicies.estimatedDelivery}
                  onChange={(e) =>
                    setData({
                      ...data,
                      ecommercePolicies: {
                        ...data.ecommercePolicies,
                        estimatedDelivery: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., 3-5 business days"
                />
              </div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.closedToggle}>
                  <input
                    type="checkbox"
                    checked={data.ecommercePolicies.codAvailable}
                    onChange={(e) =>
                      setData({
                        ...data,
                        ecommercePolicies: {
                          ...data.ecommercePolicies,
                          codAvailable: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>Cash on Delivery (COD) Available</span>
                </label>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.closedToggle}>
                  <input
                    type="checkbox"
                    checked={data.ecommercePolicies.internationalShipping}
                    onChange={(e) =>
                      setData({
                        ...data,
                        ecommercePolicies: {
                          ...data.ecommercePolicies,
                          internationalShipping: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>International Shipping Available</span>
                </label>
              </div>
            </div>

            <h3 className={styles.subTitle}>Returns & Warranty</h3>
            <div className={styles.formGroup}>
              <label>Return Policy</label>
              <textarea
                value={data.ecommercePolicies.returnPolicy}
                onChange={(e) =>
                  setData({
                    ...data,
                    ecommercePolicies: {
                      ...data.ecommercePolicies,
                      returnPolicy: e.target.value,
                    },
                  })
                }
                placeholder="e.g., Easy returns within 7 days of delivery..."
                rows={2}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Return Window (days)</label>
              <input
                type="number"
                value={data.ecommercePolicies.returnWindow}
                onChange={(e) =>
                  setData({
                    ...data,
                    ecommercePolicies: {
                      ...data.ecommercePolicies,
                      returnWindow: parseInt(e.target.value) || 0,
                    },
                  })
                }
                placeholder="e.g., 7"
                min={0}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Warranty Policy</label>
              <textarea
                value={data.ecommercePolicies.warrantyPolicy}
                onChange={(e) =>
                  setData({
                    ...data,
                    ecommercePolicies: {
                      ...data.ecommercePolicies,
                      warrantyPolicy: e.target.value,
                    },
                  })
                }
                placeholder="e.g., 1 year manufacturer warranty on all electronics..."
                rows={2}
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

        {activeTab === "capabilities" && (
          <div className={styles.section}>
            <h2 className={`${styles.sectionTitle} ${styles.hideOnMobile}`}>
              AI Capabilities
            </h2>
            <p
              className={`${styles.capabilityDescription} ${styles.hideOnMobile}`}
              style={{ marginBottom: "24px" }}
            >
              Enable or disable AI-powered features for your business.
            </p>

            {/* Appointment Booking Toggle */}
            <div
              className={`${styles.capabilitiesSection} ${
                capabilityExpanded ? styles.capabilitiesExpanded : ""
              }`}
              onClick={() => setCapabilityExpanded(!capabilityExpanded)}
            >
              <div className={styles.capabilityRow}>
                <div className={styles.capabilityInfo}>
                  <div className={styles.capabilityTitle}>
                    <img
                      src="/icons/ai_settings/bussiness_type/calender.svg"
                      alt="Calendar"
                      width={20}
                      height={20}
                      style={{ filter: "invert(1)" }}
                    />
                    Appointment Booking
                    <span className={styles.newBadge}>NEW</span>
                    <span
                      className={`${styles.chevron} ${
                        capabilityExpanded ? styles.chevronUp : ""
                      }`}
                    >
                      ▼
                    </span>
                  </div>
                </div>
                <label
                  className={styles.toggleSwitch}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={appointmentBookingEnabled}
                    onChange={handleAppointmentToggle}
                    disabled={capabilitiesLoading}
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>
              <div
                className={`${styles.capabilityDropdown} ${
                  capabilityExpanded ? styles.capabilityDropdownOpen : ""
                }`}
              >
                <p className={styles.capabilityDropdownText}>
                  Enable AI-powered appointment scheduling. When enabled, your
                  AI assistant can book appointments through WhatsApp and a new
                  Appointments menu appears in the sidebar.
                </p>
              </div>
            </div>

            {/* Appointment Configuration - Only show when enabled */}
            {appointmentBookingEnabled && (
              <div className={styles.appointmentConfig}>
                {/* Business Hours Configuration */}
                <div
                  className={styles.configCard}
                  style={{ marginTop: "1.5rem" }}
                >
                  <h3 className={styles.configCardTitle}>Business Hours</h3>
                  <p className={styles.configCardDescription}>
                    Set your available hours for appointments
                  </p>
                  <div className={styles.businessHoursGrid}>
                    <div className={styles.formGroup}>
                      <label>Opens At</label>
                      <input
                        type="time"
                        value={businessHours.start}
                        onChange={(e) =>
                          setBusinessHours({
                            ...businessHours,
                            start: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Closes At</label>
                      <input
                        type="time"
                        value={businessHours.end}
                        onChange={(e) =>
                          setBusinessHours({
                            ...businessHours,
                            end: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Slot Duration</label>
                      <select
                        value={businessHours.duration}
                        onChange={(e) =>
                          setBusinessHours({
                            ...businessHours,
                            duration: parseInt(e.target.value),
                          })
                        }
                      >
                        <option value={15}>15 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={45}>45 minutes</option>
                        <option value={60}>1 hour</option>
                        <option value={90}>1.5 hours</option>
                        <option value={120}>2 hours</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Field Builder - Appointment Questions */}
                <div
                  className={styles.configCard}
                  style={{ marginTop: "1rem" }}
                >
                  <div className={styles.configCardHeader}>
                    <div>
                      <h3 className={styles.configCardTitle}>
                        Appointment Questions
                      </h3>
                      <p className={styles.configCardDescription}>
                        Configure what information the AI will collect from
                        customers
                      </p>
                    </div>
                    <button
                      className={styles.addButton}
                      onClick={addAppointmentField}
                    >
                      + Add Question
                    </button>
                  </div>

                  <div className={styles.fieldBuilderList}>
                    {appointmentFields
                      .sort((a, b) => a.order - b.order)
                      .map((field, index) => {
                        return (
                          <div
                            key={field.id}
                            className={styles.fieldBuilderItem}
                          >
                            <div className={styles.fieldBuilderOrder}>
                              <button
                                className={styles.orderBtn}
                                onClick={() => moveFieldUp(field.id)}
                                disabled={index === 0}
                                title="Move up"
                              >
                                ↑
                              </button>
                              <span className={styles.orderNumber}>
                                {field.order}
                              </span>
                              <button
                                className={styles.orderBtn}
                                onClick={() => moveFieldDown(field.id)}
                                disabled={
                                  index === appointmentFields.length - 1
                                }
                                title="Move down"
                              >
                                ↓
                              </button>
                            </div>

                            <div className={styles.fieldBuilderContent}>
                              <div className={styles.fieldBuilderRow}>
                                <input
                                  type="text"
                                  placeholder="Question/Field Label"
                                  value={field.label}
                                  onChange={(e) =>
                                    updateAppointmentField(field.id, {
                                      label: e.target.value,
                                    })
                                  }
                                  className={styles.fieldLabelInput}
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) =>
                                    updateAppointmentField(field.id, {
                                      type: e.target
                                        .value as AppointmentField["type"],
                                    })
                                  }
                                  className={styles.fieldTypeSelect}
                                >
                                  <option value="text">Text</option>
                                  <option value="phone">Phone</option>
                                  <option value="email">Email</option>
                                  <option value="date">Date</option>
                                  <option value="time">Time</option>
                                  <option value="textarea">Long Text</option>
                                  <option value="select">Dropdown</option>
                                </select>
                                <label className={styles.requiredToggle}>
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                      updateAppointmentField(field.id, {
                                        required: e.target.checked,
                                      })
                                    }
                                  />
                                  <span>Required</span>
                                </label>
                              </div>
                            </div>

                            <button
                              className={styles.removeFieldBtn}
                              onClick={() => removeAppointmentField(field.id)}
                              title="Remove field"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Save Configuration Button */}
                <div style={{ marginTop: "1.5rem", textAlign: "right" }}>
                  <button
                    className={styles.primaryButton}
                    onClick={saveAppointmentConfig}
                    disabled={capabilitiesLoading}
                  >
                    {capabilitiesLoading ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "preview" && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>AI Brain Preview</h2>
              <div className={styles.intentBadge}>
                Tone: {data.brandVoice.tone}
              </div>
            </div>

            <div className={styles.chatContainer}>
              <div className={styles.messageList}>
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`${styles.message} ${
                      msg.role === "user"
                        ? styles.userMessage
                        : styles.botMessage
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

              <div className={styles.suggestions}>
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
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className={styles.chatFooter}>
                <input
                  type="text"
                  value={previewQuery}
                  onChange={(e) => setPreviewQuery(e.target.value)}
                  placeholder="Type a customer question..."
                  onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                  disabled={previewLoading}
                />
                <button
                  className={styles.sendButton}
                  onClick={() => handlePreview()}
                  disabled={previewLoading || !previewQuery.trim()}
                >
                  {previewLoading ? "..." : "Send"}
                </button>
              </div>
            </div>

            <p className={styles.previewHint} style={{ marginTop: "20px" }}>
              💡 This preview uses the business data you've entered above. Save
              your changes to sync them with the live WhatsApp automation.
            </p>
          </div>
        )}
      </div>

      {activeTab !== "preview" && activeTab !== "capabilities" && (
        <div className={styles.footer}>
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "💾 Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
