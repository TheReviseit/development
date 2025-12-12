"use client";

import React, { useState } from "react";
import CustomDropdown, { DropdownOption } from "../ui/CustomDropdown";

interface BusinessInfoFormProps {
  data: {
    businessName: string;
    category: string;
    website: string;
    address: string;
    logoUrl: string;
    description: string;
  };
  onChange: (field: string, value: string) => void;
  onLogoUpload: (file: File) => Promise<void>;
}

// Business categories with icons
const BUSINESS_CATEGORIES: DropdownOption[] = [
  {
    value: "E-commerce",
    label: "E-commerce",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    value: "Services",
    label: "Services",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    value: "Healthcare",
    label: "Healthcare",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    value: "Education",
    label: "Education",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
  {
    value: "Real Estate",
    label: "Real Estate",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    value: "Restaurant/Food",
    label: "Restaurant/Food",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
  {
    value: "Retail",
    label: "Retail",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    value: "Technology",
    label: "Technology",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    value: "Finance",
    label: "Finance",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    value: "Other",
    label: "Other",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

export default function BusinessInfoForm({
  data,
  onChange,
  onLogoUpload,
}: BusinessInfoFormProps) {
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingLogo(true);
      try {
        await onLogoUpload(file);
      } catch (error) {
        console.error("Logo upload error:", error);
        alert("Failed to upload logo. Please try again.");
      } finally {
        setUploadingLogo(false);
      }
    }
  };

  return (
    <div className="form-section">
      <div className="form-grid">
        <div className="form-group full-width">
          <label htmlFor="businessName">
            Business Name <span className="required">*</span>
          </label>
          <input
            type="text"
            id="businessName"
            placeholder="Enter your business name"
            value={data.businessName}
            onChange={(e) => onChange("businessName", e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="category">
            Business Category <span className="required">*</span>
          </label>
          <CustomDropdown
            id="category"
            value={data.category}
            options={BUSINESS_CATEGORIES}
            placeholder="Select category"
            onChange={(value) => onChange("category", value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="website">Website (Optional)</label>
          <input
            type="url"
            id="website"
            placeholder="https://yourwebsite.com"
            value={data.website}
            onChange={(e) => onChange("website", e.target.value)}
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="address">Address (Optional)</label>
          <input
            type="text"
            id="address"
            placeholder="Enter your business address"
            value={data.address}
            onChange={(e) => onChange("address", e.target.value)}
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="description">Business Description (Optional)</label>
          <textarea
            id="description"
            placeholder="Briefly describe what your business does"
            value={data.description}
            onChange={(e) => onChange("description", e.target.value)}
            rows={3}
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="logo">Business Logo (Optional)</label>
          <div className="logo-upload-container">
            <input
              type="file"
              id="logo"
              accept="image/*"
              onChange={handleLogoChange}
              className="file-input"
            />
            <label htmlFor="logo" className="logo-upload-button">
              {uploadingLogo ? (
                <span>Uploading...</span>
              ) : data.logoUrl ? (
                <div className="logo-preview">
                  <img src={data.logoUrl} alt="Business Logo" />
                  <span>Change Logo</span>
                </div>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Upload Logo</span>
                </>
              )}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
