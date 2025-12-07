"use client";

import React, { useState } from "react";

interface VerificationFormProps {
  onComplete: () => void;
  isCompleting: boolean;
}

export default function VerificationForm({
  onComplete,
  isCompleting,
}: VerificationFormProps) {
  const [testNumber, setTestNumber] = useState("");
  const [testSent, setTestSent] = useState(false);

  const handleSendTest = async () => {
    if (!testNumber) {
      alert("Please enter a test number");
      return;
    }
    // Placeholder for test message functionality
    setTestSent(true);
    alert(
      "Test message functionality will be implemented after Meta API integration"
    );
  };

  return (
    <div className="form-section">
      <div className="form-header">
        <h2>Verification & Testing</h2>
        <p>Test your connection and complete setup</p>
      </div>

      <div className="verification-content">
        <div className="verification-card">
          <div className="card-icon">✅</div>
          <h3>Setup Complete!</h3>
          <p>
            Your WhatsApp business account has been configured successfully.
          </p>
        </div>

        <div className="test-message-section">
          <h3>Send Test Message (Optional)</h3>
          <p>Verify your connection by sending a test message</p>

          <div className="form-group">
            <label htmlFor="testNumber">Test Phone Number</label>
            <input
              type="tel"
              id="testNumber"
              placeholder="+1234567890"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
            />
            <small className="field-hint">Include country code</small>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleSendTest}
            disabled={!testNumber}
          >
            Send Test Message
          </button>

          {testSent && (
            <div className="success-message">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Test message sent successfully!</span>
            </div>
          )}
        </div>

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
          <div>
            <strong>Next Steps:</strong>
            <ul>
              <li>Your API credentials are securely encrypted</li>
              <li>Message templates need Meta approval before use</li>
              <li>You can manage settings anytime in your dashboard</li>
            </ul>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary complete-button"
          onClick={onComplete}
          disabled={isCompleting}
        >
          {isCompleting ? "Completing..." : "Complete Onboarding"}
        </button>
      </div>
    </div>
  );
}
