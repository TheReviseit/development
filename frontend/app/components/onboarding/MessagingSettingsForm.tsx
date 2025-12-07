import React from "react";

interface MessagingSettingsFormProps {
  data: {
    defaultSenderName: string;
    messagingCategory: string;
    timezone: string;
    language: string;
  };
  onChange: (field: string, value: string) => void;
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Hindi",
  "Arabic",
  "Portuguese",
  "Japanese",
  "Chinese",
];

export default function MessagingSettingsForm({
  data,
  onChange,
}: MessagingSettingsFormProps) {
  return (
    <div className="form-section">
      <div className="form-header">
        <h2>Messaging Settings</h2>
        <p>Configure your messaging preferences</p>
      </div>

      <div className="form-grid">
        <div className="form-group full-width">
          <label htmlFor="defaultSenderName">
            Default Sender Name <span className="required">*</span>
          </label>
          <input
            type="text"
            id="defaultSenderName"
            placeholder="How your business appears in WhatsApp"
            value={data.defaultSenderName}
            onChange={(e) => onChange("defaultSenderName", e.target.value)}
            required
            maxLength={50}
          />
          <small className="field-hint">
            This name will appear in WhatsApp conversations
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="timezone">
            Timezone <span className="required">*</span>
          </label>
          <select
            id="timezone"
            value={data.timezone}
            onChange={(e) => onChange("timezone", e.target.value)}
            required
          >
            <option value="">Select timezone</option>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="language">Language (Optional)</label>
          <select
            id="language"
            value={data.language}
            onChange={(e) => onChange("language", e.target.value)}
          >
            <option value="">Select language</option>
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group full-width">
          <label>Messaging Category (Optional)</label>
          <div className="radio-group horizontal">
            <label className="radio-label">
              <input
                type="radio"
                name="messagingCategory"
                value="transactional"
                checked={data.messagingCategory === "transactional"}
                onChange={(e) => onChange("messagingCategory", e.target.value)}
              />
              <span className="radio-custom"></span>
              <div className="radio-content">
                <strong>Transactional</strong>
                <small>Order updates, notifications</small>
              </div>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="messagingCategory"
                value="marketing"
                checked={data.messagingCategory === "marketing"}
                onChange={(e) => onChange("messagingCategory", e.target.value)}
              />
              <span className="radio-custom"></span>
              <div className="radio-content">
                <strong>Marketing</strong>
                <small>Promotions, campaigns</small>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
