"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./services.module.css";
import CategorySelect from "./components/CategorySelect";
import { supabase } from "@/lib/supabase/client";

interface Service {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_urls: string[]; // Support multiple images
  image_public_id: string | null;
  price_type: "fixed" | "variable" | "hourly";
  price_amount: number | null;
  price_range_min: number | null;
  price_range_max: number | null;
  min_billable_minutes: number;
  duration_enabled: boolean;
  duration_minutes: number | null;
  max_bookings_per_slot: number;
  buffer_before: number;
  buffer_after: number;
  location_type: "business" | "customer" | "online";
  category: string | null;
  tags: string[];
  payment_mode: "online" | "cash" | "both";
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface ServiceFormData {
  name: string;
  description: string;
  image_url: string;
  image_urls: string[]; // Support multiple images
  image_public_id: string;
  price_type: "fixed" | "variable" | "hourly";
  price_amount: string;
  price_range_min: string;
  price_range_max: string;
  min_billable_minutes: string;
  duration_enabled: boolean;
  duration_minutes: string;
  max_bookings_per_slot: string;
  buffer_before: string;
  buffer_after: string;
  location_type: "business" | "customer" | "online";
  category: string;
  tags: string;
  payment_mode: "online" | "cash" | "both";
  is_active: boolean;
}

const INITIAL_FORM_DATA: ServiceFormData = {
  name: "",
  description: "",
  image_url: "",
  image_urls: [], // Support multiple images
  image_public_id: "",
  price_type: "fixed",
  price_amount: "",
  price_range_min: "",
  price_range_max: "",
  min_billable_minutes: "60",
  duration_enabled: false,
  duration_minutes: "60",
  max_bookings_per_slot: "1",
  buffer_before: "0",
  buffer_after: "0",
  location_type: "business",
  category: "",
  tags: "",
  payment_mode: "both",
  is_active: true,
};

const PRICE_TYPE_OPTIONS = [
  { value: "fixed", label: "Fixed Price" },
  { value: "variable", label: "Variable (Price Range)" },
  { value: "hourly", label: "Hourly Rate" },
];

const PAYMENT_MODE_OPTIONS = [
  { value: "both", label: "Online & Cash" },
  { value: "online", label: "Online Only" },
  { value: "cash", label: "Cash Only" },
];

const LOCATION_TYPE_OPTIONS = [
  { value: "business", label: "Business Location" },
  { value: "customer", label: "Customer Location" },
  { value: "online", label: "Online" },
];

const MIN_BILLABLE_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(INITIAL_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  // Fetch services
  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/services");
      const data = await response.json();
      if (data.success) {
        setServices(data.data);
        // Extract unique categories
        const uniqueCategories: string[] = [];
        const seenCategories = new Set<string>();
        for (const s of data.data as Service[]) {
          if (s.category && !seenCategories.has(s.category)) {
            seenCategories.add(s.category);
            uniqueCategories.push(s.category);
          }
        }
        setCategories(uniqueCategories);
      }
    } catch (err) {
      console.error("Error fetching services:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Real-time subscription for live updates (like the store)
  useEffect(() => {
    const channel = supabase
      .channel("services-realtime")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "services",
        },
        (payload) => {
          console.log("[Services] Real-time update:", payload.eventType);
          // Refetch services on any change
          fetchServices();
        },
      )
      .subscribe((status) => {
        console.log("[Services] Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchServices]);

  // Open modal for creating/editing
  const handleOpenModal = (service?: Service) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name,
        description: service.description || "",
        image_url: service.image_url || "",
        image_urls: service.image_urls || [], // Support multiple images
        image_public_id: service.image_public_id || "",
        price_type: service.price_type,
        price_amount: service.price_amount?.toString() || "",
        price_range_min: service.price_range_min?.toString() || "",
        price_range_max: service.price_range_max?.toString() || "",
        min_billable_minutes: service.min_billable_minutes?.toString() || "60",
        duration_enabled: service.duration_enabled,
        duration_minutes: service.duration_minutes?.toString() || "60",
        max_bookings_per_slot: service.max_bookings_per_slot?.toString() || "1",
        buffer_before: service.buffer_before?.toString() || "0",
        buffer_after: service.buffer_after?.toString() || "0",
        location_type: service.location_type || "business",
        category: service.category || "",
        tags: service.tags?.join(", ") || "",
        payment_mode: service.payment_mode,
        is_active: service.is_active,
      });
    } else {
      setEditingService(null);
      setFormData(INITIAL_FORM_DATA);
    }
    setError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingService(null);
    setFormData(INITIAL_FORM_DATA);
    setError(null);
  };

  // Handle multi-image upload (supports drag & drop and file input)
  const handleImagesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(
      0,
      5 - formData.image_urls.length,
    ); // Max 5 images
    if (fileArray.length === 0) return;

    try {
      setUploading(true);
      setError(null);

      // Upload all files in parallel
      const uploadPromises = fileArray.map(async (file) => {
        const sigResponse = await fetch("/api/services/image-signature", {
          method: "POST",
        });
        const sigData = await sigResponse.json();
        if (!sigData.success) throw new Error("Failed to get upload signature");

        const { timestamp, signature, folder, cloudName, apiKey } =
          sigData.data;
        const formDataUpload = new FormData();
        formDataUpload.append("file", file);
        formDataUpload.append("timestamp", timestamp.toString());
        formDataUpload.append("signature", signature);
        formDataUpload.append("api_key", apiKey);
        formDataUpload.append("folder", folder);

        const uploadResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: "POST", body: formDataUpload },
        );

        const uploadData = await uploadResponse.json();
        if (uploadData.error) throw new Error(uploadData.error.message);
        return uploadData.secure_url;
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      setFormData((prev) => ({
        ...prev,
        image_urls: [...prev.image_urls, ...uploadedUrls],
        image_url: prev.image_url || uploadedUrls[0],
      }));
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload images. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) handleImagesUpload(files);
    e.target.value = "";
  };

  // Handle drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files) handleImagesUpload(files);
  };

  // Remove a specific image
  const handleRemoveImage = (index: number) => {
    setFormData((prev) => {
      const newUrls = prev.image_urls.filter((_, i) => i !== index);
      return {
        ...prev,
        image_urls: newUrls,
        image_url: newUrls[0] || "",
        image_public_id: "",
      };
    });
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Service name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        image_url: formData.image_url || null,
        image_public_id: formData.image_public_id || null,
        price_type: formData.price_type,
        price_amount: formData.price_amount
          ? parseFloat(formData.price_amount)
          : null,
        price_range_min: formData.price_range_min
          ? parseFloat(formData.price_range_min)
          : null,
        price_range_max: formData.price_range_max
          ? parseFloat(formData.price_range_max)
          : null,
        min_billable_minutes:
          formData.price_type === "hourly"
            ? parseInt(formData.min_billable_minutes) || 60
            : 60,
        duration_enabled: formData.duration_enabled,
        duration_minutes:
          formData.duration_enabled && formData.duration_minutes
            ? parseInt(formData.duration_minutes)
            : null,
        max_bookings_per_slot: parseInt(formData.max_bookings_per_slot) || 1,
        buffer_before: parseInt(formData.buffer_before) || 0,
        buffer_after: parseInt(formData.buffer_after) || 0,
        location_type: formData.location_type,
        category: formData.category.trim() || null,
        tags: formData.tags.trim()
          ? formData.tags
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t)
          : [],
        payment_mode: formData.payment_mode,
        is_active: formData.is_active,
      };

      const url = editingService
        ? `/api/services/${editingService.id}`
        : "/api/services";
      const method = editingService ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save service");
      }

      handleCloseModal();
      fetchServices();
    } catch (err) {
      console.error("Save error:", err);
      setError(err instanceof Error ? err.message : "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (service: Service) => {
    if (!confirm(`Delete "${service.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/services/${service.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchServices();
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // Toggle active status
  const handleToggleActive = async (service: Service) => {
    try {
      await fetch(`/api/services/${service.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !service.is_active }),
      });
      fetchServices();
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  // Format price display
  const formatPrice = (service: Service): string => {
    if (service.price_type === "fixed" && service.price_amount) {
      return `₹${service.price_amount.toLocaleString()}`;
    }
    if (service.price_type === "hourly" && service.price_amount) {
      return `₹${service.price_amount.toLocaleString()}/hr`;
    }
    if (
      service.price_type === "variable" &&
      service.price_range_min &&
      service.price_range_max
    ) {
      return `₹${service.price_range_min.toLocaleString()} - ₹${service.price_range_max.toLocaleString()}`;
    }
    return "Price varies";
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>Services</h1>
          <p className={styles.subtitle}>
            Manage the services you offer to customers
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <a
            href="/dashboard/services/workload"
            className={styles.secondaryBtn}
            style={{ textDecoration: "none" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Workload
          </a>
          <button
            className={styles.primaryBtn}
            onClick={() => handleOpenModal()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
              <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
            </svg>
            Add Service
          </button>
        </div>
      </div>

      {/* Services Grid */}
      {services.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <h3>No services yet</h3>
          <p>Add your first service to start accepting bookings</p>
          <button
            className={styles.primaryBtn}
            onClick={() => handleOpenModal()}
          >
            Add Your First Service
          </button>
        </div>
      ) : (
        <div className={styles.servicesGrid}>
          {services.map((service) => (
            <div
              key={service.id}
              className={`${styles.serviceCard} ${
                !service.is_active ? styles.serviceCardInactive : ""
              }`}
            >
              {/* Service Image */}
              <div className={styles.serviceImage}>
                {service.image_url ? (
                  <img src={service.image_url} alt={service.name} />
                ) : (
                  <div className={styles.imagePlaceholder}>
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                )}
                {!service.is_active && (
                  <div className={styles.inactiveBadge}>Inactive</div>
                )}
              </div>

              {/* Service Info */}
              <div className={styles.serviceInfo}>
                <div className={styles.serviceHeader}>
                  <h3 className={styles.serviceName}>{service.name}</h3>
                  {service.category && (
                    <span className={styles.categoryBadge}>
                      {service.category}
                    </span>
                  )}
                </div>

                <div className={styles.priceRow}>
                  <span className={styles.price}>{formatPrice(service)}</span>
                  {service.duration_enabled && service.duration_minutes && (
                    <span className={styles.duration}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {service.duration_minutes} min
                    </span>
                  )}
                </div>

                <div className={styles.paymentMode}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  {service.payment_mode === "both"
                    ? "Online & Cash"
                    : service.payment_mode === "online"
                      ? "Online Only"
                      : "Cash Only"}
                </div>

                {service.description && (
                  <p className={styles.description}>{service.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className={styles.serviceActions}>
                <button
                  className={styles.toggleBtn}
                  onClick={() => handleToggleActive(service)}
                  title={service.is_active ? "Deactivate" : "Activate"}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    {service.is_active ? (
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    ) : (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    )}
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                <button
                  className={styles.editBtn}
                  onClick={() => handleOpenModal(service)}
                  title="Edit"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(service)}
                  title="Delete"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div className={styles.modalOverlay} onClick={handleCloseModal} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editingService ? "Edit Service" : "Add New Service"}</h2>
              <button className={styles.modalClose} onClick={handleCloseModal}>
                <svg
                  width="20"
                  height="20"
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

            <form onSubmit={handleSubmit} className={styles.modalForm}>
              {error && <div className={styles.errorAlert}>{error}</div>}

              {/* Multi-Image Upload */}
              <div className={styles.formGroup}>
                <label>Service Photos (Max 5)</label>
                <div className={styles.multiImageUpload}>
                  {/* Image Preview Grid */}
                  {formData.image_urls.length > 0 && (
                    <div className={styles.imageGrid}>
                      {formData.image_urls.map((url, index) => (
                        <div key={index} className={styles.imageGridItem}>
                          <img src={url} alt={`Service ${index + 1}`} />
                          <button
                            type="button"
                            className={styles.removeImageBtn}
                            onClick={() => handleRemoveImage(index)}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                          {index === 0 && (
                            <span className={styles.primaryBadge}>Primary</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drag & Drop Upload Zone */}
                  {formData.image_urls.length < 5 && (
                    <label
                      className={styles.dropZone}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileInputChange}
                        disabled={uploading}
                      />
                      {uploading ? (
                        <div className={styles.uploadingSpinner}></div>
                      ) : (
                        <>
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span>Drop images here or click to upload</span>
                          <span className={styles.dropZoneHint}>
                            {5 - formData.image_urls.length} slots remaining
                          </span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>

              {/* Service Name */}
              <div className={styles.formGroup}>
                <label>Service Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Haircut, Consultation, Massage"
                  required
                />
              </div>

              {/* Price Type */}
              <div className={styles.formGroup}>
                <label>Price Type</label>
                <select
                  value={formData.price_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price_type: e.target.value as
                        | "fixed"
                        | "variable"
                        | "hourly",
                    })
                  }
                >
                  {PRICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Fields */}
              {formData.price_type === "fixed" && (
                <div className={styles.formGroup}>
                  <label>Price (₹)</label>
                  <input
                    type="number"
                    value={formData.price_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, price_amount: e.target.value })
                    }
                    placeholder="e.g., 500"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              {formData.price_type === "hourly" && (
                <div className={styles.formGroup}>
                  <label>Hourly Rate (₹/hr)</label>
                  <input
                    type="number"
                    value={formData.price_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, price_amount: e.target.value })
                    }
                    placeholder="e.g., 1000"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              {formData.price_type === "variable" && (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Min Price (₹)</label>
                    <input
                      type="number"
                      value={formData.price_range_min}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          price_range_min: e.target.value,
                        })
                      }
                      placeholder="e.g., 300"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Max Price (₹)</label>
                    <input
                      type="number"
                      value={formData.price_range_max}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          price_range_max: e.target.value,
                        })
                      }
                      placeholder="e.g., 1000"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              )}

              {/* Duration - UX improved */}
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.duration_enabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        duration_enabled: e.target.checked,
                      })
                    }
                  />
                  <span>Fixed duration</span>
                </label>
                <small className={styles.fieldHint}>
                  Uncheck if duration varies by workload
                </small>
                {formData.duration_enabled && (
                  <div className={styles.inlineField}>
                    <input
                      type="number"
                      value={formData.duration_minutes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          duration_minutes: e.target.value,
                        })
                      }
                      placeholder="60"
                      min="5"
                      step="5"
                    />
                    <span>minutes</span>
                  </div>
                )}
              </div>

              {/* Min Billable Time (for hourly rate) */}
              {formData.price_type === "hourly" && (
                <div className={styles.formGroup}>
                  <label>Minimum Billable Time</label>
                  <select
                    value={formData.min_billable_minutes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        min_billable_minutes: e.target.value,
                      })
                    }
                  >
                    {MIN_BILLABLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Max Bookings Per Slot */}
              <div className={styles.formGroup}>
                <label>Max Bookings Per Slot</label>
                <input
                  type="number"
                  value={formData.max_bookings_per_slot}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_bookings_per_slot: e.target.value,
                    })
                  }
                  placeholder="1"
                  min="1"
                />
                <small className={styles.fieldHint}>
                  For classes, workshops, or group sessions
                </small>
              </div>

              {/* Service Location */}
              <div className={styles.formGroup}>
                <label>Service Location</label>
                <select
                  value={formData.location_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      location_type: e.target.value as
                        | "business"
                        | "customer"
                        | "online",
                    })
                  }
                >
                  {LOCATION_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buffer Times */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Buffer Before (min)</label>
                  <input
                    type="number"
                    value={formData.buffer_before}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        buffer_before: e.target.value,
                      })
                    }
                    placeholder="0"
                    min="0"
                    step="5"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Buffer After (min)</label>
                  <input
                    type="number"
                    value={formData.buffer_after}
                    onChange={(e) =>
                      setFormData({ ...formData, buffer_after: e.target.value })
                    }
                    placeholder="0"
                    min="0"
                    step="5"
                  />
                </div>
              </div>
              <small
                className={styles.fieldHint}
                style={{ marginTop: "-12px" }}
              >
                Preparation/cleanup time between bookings
              </small>

              {/* Category */}
              <div className={styles.formGroup}>
                <label>Category</label>
                <CategorySelect
                  value={formData.category}
                  onChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                  categories={categories}
                  placeholder="Search or add category..."
                />
              </div>

              {/* Tags (Internal) */}
              <div className={styles.formGroup}>
                <label>Tags (Internal)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData({ ...formData, tags: e.target.value })
                  }
                  placeholder="popular, premium, new (comma-separated)"
                />
                <small className={styles.fieldHint}>
                  Hidden from customers - for internal use
                </small>
              </div>

              {/* Payment Mode */}
              <div className={styles.formGroup}>
                <label>Payment Acceptance</label>
                <select
                  value={formData.payment_mode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payment_mode: e.target.value as
                        | "online"
                        | "cash"
                        | "both",
                    })
                  }
                >
                  {PAYMENT_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Status Toggle */}
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                  />
                  <span>Active (visible on booking page)</span>
                </label>
                <small className={styles.fieldHint}>
                  Inactive services are hidden from customers
                </small>
              </div>

              {/* Description */}
              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe what this service includes..."
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleCloseModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={saving || uploading}
                >
                  {saving ? "Saving..." : editingService ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
