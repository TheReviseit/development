"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./AddProduct.module.css";
import ProductImageUpload from "../../../components/ProductImageUpload";
import CategorySelect from "../components/CategorySelect";
import { broadcastStoreUpdate } from "@/app/utils/storeSync";
import { useAuth } from "@/app/components/auth/AuthProvider";

// Upload result type
interface UploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  original_size?: number;
}

/**
 * AddProductPage - Simplified for Photography/Makeup Showcase
 *
 * Only shows essential fields:
 * - Product Name (required)
 * - Description
 * - Price
 * - Category
 * - Image Upload (required)
 */
export default function AddProductPage() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [username, setUsername] = useState<string | null>(null);

  // Fetch existing categories and username
  useEffect(() => {
    const fetchData = async () => {
      // Fetch username
      try {
        const usernameRes = await fetch("/api/user/username");
        if (usernameRes.ok) {
          const usernameData = await usernameRes.json();
          if (usernameData.success) {
            setUsername(usernameData.username);
          }
        }
      } catch (error) {
        console.error("Failed to fetch username:", error);
      }

      // Fetch categories
      try {
        const [showcaseRes, storeRes] = await Promise.all([
          fetch("/api/showcase/items"),
          fetch("/api/products/categories"),
        ]);

        const uniqueCategories = new Set<string>();

        if (showcaseRes.ok) {
          const data = await showcaseRes.json();
          data.items?.forEach((item: any) => {
            if (item.category) {
              uniqueCategories.add(item.category);
            }
          });
        }

        if (storeRes.ok) {
          const storeData = await storeRes.json();
          if (storeData.categories && Array.isArray(storeData.categories)) {
            storeData.categories.forEach((cat: { name: string }) => {
              if (cat.name) uniqueCategories.add(cat.name);
            });
          }
        }

        setCategories(Array.from(uniqueCategories).sort());
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    fetchData();
  }, []);

  // Simplified form data - only essential fields
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    image_url: "",
    image_public_id: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        description: formData.description || null,
        imageUrl: formData.image_url,
        imagePublicId: formData.image_public_id,
        metadata: {
          category: formData.category || null,
        },
        commerce: formData.price
          ? {
              price: parseFloat(formData.price),
              inventory: null,
              variants: [],
            }
          : null,
        isVisible: true,
        isFeatured: false,
      };

      const response = await fetch("/api/showcase/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create product");
      }

      // ✅ ENTERPRISE FIX: Broadcast with BOTH username and userId
      // - username: For BroadcastChannel/localStorage (same-browser instant sync)
      // - userId: For Supabase Realtime (cross-device, cross-browser sync)
      if (username) {
        broadcastStoreUpdate(username);
      }
      if (firebaseUser?.uid) {
        broadcastStoreUpdate(firebaseUser.uid);
      }

      router.push("/dashboard/showcase/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => router.push("/dashboard/showcase/products")}
          type="button"
        >
          ← Back to Products
        </button>
        <h1 className={styles.title}>Add New Product</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        {/* Image Upload - First for visual focus */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Product Image *</label>
          <ProductImageUpload
            productId={`showcase-${Date.now()}`}
            imageUrl={formData.image_url}
            imagePublicId={formData.image_public_id}
            onUpload={(result: UploadResult) => {
              setFormData({
                ...formData,
                image_url: result.secure_url,
                image_public_id: result.public_id,
              });
            }}
            onDelete={() => {
              setFormData({
                ...formData,
                image_url: "",
                image_public_id: "",
              });
            }}
          />
        </div>

        {/* Product Name */}
        <div className={styles.formGroup}>
          <label htmlFor="title" className={styles.label}>
            Product Name *
          </label>
          <input
            id="title"
            type="text"
            required
            className={styles.input}
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            placeholder="Enter product name"
          />
        </div>

        {/* Price */}
        <div className={styles.formGroup}>
          <label htmlFor="price" className={styles.label}>
            Price
          </label>
          <input
            id="price"
            type="number"
            step="0.01"
            min="0"
            className={styles.input}
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: e.target.value })
            }
            placeholder="0.00"
          />
        </div>

        {/* Description */}
        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            Description
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Enter product description"
            rows={4}
          />
        </div>

        {/* Category */}
        <div className={styles.formGroup}>
          <label htmlFor="category" className={styles.label}>
            Category
          </label>
          <CategorySelect
            value={formData.category}
            onChange={(value) => setFormData({ ...formData, category: value })}
            categories={categories}
            placeholder="Search or add category..."
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => router.push("/dashboard/showcase/products")}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
