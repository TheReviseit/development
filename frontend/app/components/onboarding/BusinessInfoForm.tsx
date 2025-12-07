"use client";

import React, { useState } from "react";

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

const BUSINESS_CATEGORIES = [
  "E-commerce",
  "Services",
  "Healthcare",
  "Education",
  "Real Estate",
  "Restaurant/Food",
  "Retail",
  "Technology",
  "Finance",
  "Other",
];

export default function BusinessInfoForm({
  data,
  onChange,
  onLogoUpload,
}: BusinessInfoFormProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
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
      <div className="form-header">
        <h2>Business Information</h2>
        <p>Tell us about your business</p>
      </div>

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
          <select
            id="category"
            value={data.category}
            onChange={(e) => onChange("category", e.target.value)}
            required
          >
            <option value="">Select category</option>
            {BUSINESS_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
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
