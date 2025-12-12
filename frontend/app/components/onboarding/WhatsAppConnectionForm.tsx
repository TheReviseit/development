"use client";

import React, { useState } from "react";

interface WhatsAppConnectionFormProps {
  data: {
    providerType: string;
    phoneNumber: string;
    phoneNumberId: string;
    businessIdMeta: string;
    apiToken: string;
  };
  onChange: (field: string, value: string) => void;
}

export default function WhatsAppConnectionForm({
  data,
  onChange,
}: WhatsAppConnectionFormProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="form-section">
      {/* <div className="form-header">
        <h2>WhatsApp Connection</h2>
        <p>Connect your WhatsApp Business account</p>
      </div> */}

      <div className="form-grid">
        <div className="form-group full-width">
          <label>
            Provider Type <span className="required">*</span>
          </label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name="providerType"
                value="cloud_api"
                checked={data.providerType === "cloud_api"}
                onChange={(e) => onChange("providerType", e.target.value)}
              />
              <span className="radio-custom"></span>
              <div className="radio-content">
                <strong>WhatsApp Cloud API</strong>
                <small>Official Meta Business integration</small>
              </div>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="providerType"
                value="gupshup"
                checked={data.providerType === "gupshup"}
                onChange={(e) => onChange("providerType", e.target.value)}
              />
              <span className="radio-custom"></span>
              <div className="radio-content">
                <strong>Gupshup</strong>
                <small>Third-party provider</small>
              </div>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="providerType"
                value="twilio"
                checked={data.providerType === "twilio"}
                onChange={(e) => onChange("providerType", e.target.value)}
              />
              <span className="radio-custom"></span>
              <div className="radio-content">
                <strong>Twilio</strong>
                <small>Third-party provider</small>
              </div>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="providerType"
                value="360dialog"
                checked={data.providerType === "360dialog"}
                onChange={(e) => onChange("providerType", e.target.value)}
              />
              <span className="radio-custom"></span>
              <div className="radio-content">
                <strong>360dialog</strong>
                <small>Third-party provider</small>
              </div>
            </label>
          </div>
        </div>

        <div className="form-group full-width">
          <label htmlFor="phoneNumber">
            WhatsApp Business Phone Number <span className="required">*</span>
          </label>
          <input
            type="tel"
            id="phoneNumber"
            placeholder="+1234567890"
            value={data.phoneNumber}
            onChange={(e) => onChange("phoneNumber", e.target.value)}
            required
          />
          <small className="field-hint">
            Include country code (e.g., +91 for India)
          </small>
        </div>

        {data.providerType === "cloud_api" && (
          <>
            <div className="form-group">
              <label htmlFor="businessIdMeta">Meta Business ID</label>
              <input
                type="text"
                id="businessIdMeta"
                placeholder="Enter your Meta Business ID"
                value={data.businessIdMeta}
                onChange={(e) => onChange("businessIdMeta", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumberId">Phone Number ID</label>
              <input
                type="text"
                id="phoneNumberId"
                placeholder="Enter Phone Number ID"
                value={data.phoneNumberId}
                onChange={(e) => onChange("phoneNumberId", e.target.value)}
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="apiToken">
                Permanent Access Token <span className="required">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showToken ? "text" : "password"}
                  id="apiToken"
                  placeholder="Enter your access token"
                  value={data.apiToken}
                  onChange={(e) => onChange("apiToken", e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowToken(!showToken)}
                  aria-label="Toggle token visibility"
                >
                  {showToken ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
              <small className="field-hint">
                This token will be encrypted before storage
              </small>
            </div>
          </>
        )}

        {data.providerType !== "cloud_api" && data.providerType && (
          <div className="form-group full-width">
            <label htmlFor="apiToken">
              API Key / Token <span className="required">*</span>
            </label>
            <div className="password-input-wrapper">
              <input
                type={showToken ? "text" : "password"}
                id="apiToken"
                placeholder="Enter your API key"
                value={data.apiToken}
                onChange={(e) => onChange("apiToken", e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowToken(!showToken)}
                aria-label="Toggle token visibility"
              >
                {showToken ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
            <small className="field-hint">
              This will be encrypted before storage
            </small>
          </div>
        )}

        {!data.providerType && (
          <div className="form-group full-width">
            <div className="info-box">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p>Please select a provider type to continue</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
