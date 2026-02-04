"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import "./docs.css";

export default function DocsPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user has console session cookie
    const hasCookie =
      document.cookie.includes("otp_console_session") ||
      document.cookie.includes("flowauxi_console_session");
    setIsLoggedIn(hasCookie);

    // Check saved theme preference
    const savedTheme = localStorage.getItem("docs-theme") as "dark" | "light";
    if (savedTheme) setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("docs-theme", newTheme);
  };

  return (
    <div className={`docs-page ${theme === "light" ? "docs-light" : ""}`}>
      {/* Top Navbar */}
      <nav className="docs-navbar">
        <Link href="/apis" className="docs-navbar-logo">
          <img src="/logo.png" alt="Flowauxi" className="docs-logo-img" />
          <span className="docs-navbar-title">Flowauxi</span>
        </Link>
        <div className="docs-navbar-divider" />
        <span className="docs-navbar-subtitle">API Documentation</span>
        <div className="docs-navbar-actions">
          <button
            onClick={toggleTheme}
            className="docs-theme-toggle"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <Link
            href={isLoggedIn ? "/console" : "/console/login"}
            className="docs-navbar-btn"
          >
            Get API Key
          </Link>
        </div>
      </nav>

      <div className="docs-layout">
        {/* Sidebar Navigation */}
        <aside className="docs-sidebar">
          <nav className="docs-nav">
            <h3 className="docs-nav-title">Getting Started</h3>
            <ul className="docs-nav-list">
              <li className="docs-nav-item">
                <a href="#quick-start" className="docs-nav-link">
                  Quick Start
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#authentication" className="docs-nav-link">
                  Authentication
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#rate-limits" className="docs-nav-link">
                  Rate Limits
                </a>
              </li>
            </ul>

            <h3 className="docs-nav-title">Endpoints</h3>
            <ul className="docs-nav-list">
              <li className="docs-nav-item">
                <a href="#send-otp" className="docs-nav-link">
                  Send OTP
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#verify-otp" className="docs-nav-link">
                  Verify OTP
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#resend-otp" className="docs-nav-link">
                  Resend OTP
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#check-status" className="docs-nav-link">
                  Check Status
                </a>
              </li>
            </ul>

            <h3 className="docs-nav-title">Reference</h3>
            <ul className="docs-nav-list">
              <li className="docs-nav-item">
                <a href="#error-codes" className="docs-nav-link">
                  Error Codes
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#webhooks" className="docs-nav-link">
                  Webhooks
                </a>
              </li>
              <li className="docs-nav-item">
                <a href="#sandbox" className="docs-nav-link">
                  Sandbox Mode
                </a>
              </li>
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="docs-main">
          <div className="docs-content">
            {/* Quick Start */}
            <section id="quick-start" className="docs-section">
              <h2 className="docs-section-title">Quick Start</h2>

              <div className="quick-start-steps">
                <div className="quick-start-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3 className="step-title">Get Your API Key</h3>
                    <p className="step-description">
                      Navigate to the API Keys section in your console and
                      create a new key. You&apos;ll receive a key starting with{" "}
                      <code className="inline-code">otp_live_</code> for
                      production or{" "}
                      <code className="inline-code">otp_test_</code> for sandbox
                      mode.
                    </p>
                  </div>
                </div>

                <div className="quick-start-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3 className="step-title">Send Your First OTP</h3>
                    <p className="step-description">
                      Make a POST request to send an OTP to your user&apos;s
                      phone number.
                    </p>
                    <div className="code-block">
                      <pre>
                        <code>{`curl -X POST https://api.flowauxi.com/v1/otp/send \\
  -H "Authorization: Bearer otp_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+919876543210",
    "purpose": "login",
    "channel": "whatsapp"
  }'`}</code>
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="quick-start-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3 className="step-title">Verify the OTP</h3>
                    <p className="step-description">
                      After your user enters the OTP, verify it using the
                      request_id from the send response.
                    </p>
                    <div className="code-block">
                      <pre>
                        <code>{`curl -X POST https://api.flowauxi.com/v1/otp/verify \\
  -H "Authorization: Bearer otp_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request_id": "otp_req_abc123",
    "otp": "123456"
  }'`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication" className="docs-section">
              <h2 className="docs-section-title">Authentication</h2>

              <div className="auth-box">
                <h3 className="auth-box-title">Bearer Token Authentication</h3>
                <p className="auth-box-text">
                  All API requests must include your API key in the
                  Authorization header. API keys are project-specific and can be
                  managed from your console.
                </p>
                <div className="code-block">
                  <pre>
                    <code>{`Authorization: Bearer otp_live_YOUR_API_KEY`}</code>
                  </pre>
                </div>
              </div>

              <div className="auth-box">
                <h3 className="auth-box-title">API Key Types</h3>
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Prefix</th>
                      <th>Environment</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <code className="inline-code">otp_live_</code>
                      </td>
                      <td>Production</td>
                      <td>
                        Live API key for production use. OTPs are actually
                        delivered.
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code className="inline-code">otp_test_</code>
                      </td>
                      <td>Sandbox</td>
                      <td>
                        Test API key for development. OTPs are returned in
                        response but not delivered.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Rate Limits */}
            <section id="rate-limits" className="docs-section">
              <h2 className="docs-section-title">Rate Limits</h2>

              <div className="auth-box">
                <p className="auth-box-text">
                  Rate limits protect against abuse and ensure fair usage.
                  Limits are applied per API key and per phone number.
                </p>
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Limit Type</th>
                      <th>Default</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Per API Key</td>
                      <td>60/minute</td>
                      <td>
                        Total requests per minute across all phone numbers
                      </td>
                    </tr>
                    <tr>
                      <td>Per Phone Number</td>
                      <td>5/minute</td>
                      <td>OTP send requests to the same phone number</td>
                    </tr>
                    <tr>
                      <td>Per Phone (Hourly)</td>
                      <td>10/hour</td>
                      <td>Maximum OTPs to same number per hour</td>
                    </tr>
                    <tr>
                      <td>Verification Attempts</td>
                      <td>5 per OTP</td>
                      <td>Maximum wrong attempts before OTP is invalidated</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Send OTP Endpoint */}
            <section id="send-otp" className="docs-section">
              <h2 className="docs-section-title">Send OTP</h2>

              <div className="endpoint-card">
                <div className="endpoint-header">
                  <span className="endpoint-method method-post">POST</span>
                  <span className="endpoint-path">/v1/otp/send</span>
                  <span className="endpoint-description">
                    Generate and send an OTP
                  </span>
                </div>
                <div className="endpoint-body">
                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Request Headers
                    </h4>
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>Header</th>
                          <th>Required</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <span className="param-name">Authorization</span>
                          </td>
                          <td>
                            <span className="param-required">Required</span>
                          </td>
                          <td>Bearer token with your API key</td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">Idempotency-Key</span>
                          </td>
                          <td>
                            <span className="param-optional">Optional</span>
                          </td>
                          <td>UUID to prevent duplicate requests</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">Request Body</h4>
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <span className="param-name">to</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-required">Required</span>
                          </td>
                          <td>
                            Phone number in E.164 format (e.g., +919876543210)
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">purpose</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-required">Required</span>
                          </td>
                          <td>
                            One of: login, signup, password_reset, transaction
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">channel</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-optional">Optional</span>
                          </td>
                          <td>Delivery channel: whatsapp (default) or sms</td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">otp_length</span>
                          </td>
                          <td>
                            <span className="param-type">integer</span>
                          </td>
                          <td>
                            <span className="param-optional">Optional</span>
                          </td>
                          <td>OTP length: 4-8 digits (default: 6)</td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">ttl</span>
                          </td>
                          <td>
                            <span className="param-type">integer</span>
                          </td>
                          <td>
                            <span className="param-optional">Optional</span>
                          </td>
                          <td>
                            Time to live in seconds: 60-600 (default: 300)
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">metadata</span>
                          </td>
                          <td>
                            <span className="param-type">object</span>
                          </td>
                          <td>
                            <span className="param-optional">Optional</span>
                          </td>
                          <td>Custom metadata to store with the OTP request</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Example Request
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "to": "+919876543210",
  "purpose": "login",
  "channel": "whatsapp",
  "otp_length": 6,
  "ttl": 300,
  "metadata": {
    "user_id": "usr_123",
    "session_id": "sess_456"
  }
}`}</code>
                      </pre>
                    </div>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Success Response (200)
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "success": true,
  "request_id": "otp_req_abc123def456",
  "expires_in": 300
}`}</code>
                      </pre>
                    </div>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Sandbox Response (200)
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "success": true,
  "request_id": "otp_req_abc123def456",
  "expires_in": 300,
  "sandbox": true,
  "otp": "123456"
}`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Verify OTP Endpoint */}
            <section id="verify-otp" className="docs-section">
              <h2 className="docs-section-title">Verify OTP</h2>

              <div className="endpoint-card">
                <div className="endpoint-header">
                  <span className="endpoint-method method-post">POST</span>
                  <span className="endpoint-path">/v1/otp/verify</span>
                  <span className="endpoint-description">
                    Verify a user-submitted OTP
                  </span>
                </div>
                <div className="endpoint-body">
                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">Request Body</h4>
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <span className="param-name">request_id</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-required">Required</span>
                          </td>
                          <td>The request_id from the send response</td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">otp</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-required">Required</span>
                          </td>
                          <td>The OTP code entered by the user</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Success Response (200)
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "success": true,
  "verified": true
}`}</code>
                      </pre>
                    </div>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Failed Response (400)
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "success": false,
  "verified": false,
  "error": "INVALID_OTP",
  "message": "The OTP entered is incorrect",
  "attempts_remaining": 4
}`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Resend OTP Endpoint */}
            <section id="resend-otp" className="docs-section">
              <h2 className="docs-section-title">Resend OTP</h2>

              <div className="endpoint-card">
                <div className="endpoint-header">
                  <span className="endpoint-method method-post">POST</span>
                  <span className="endpoint-path">/v1/otp/resend</span>
                  <span className="endpoint-description">
                    Resend an OTP with channel escalation
                  </span>
                </div>
                <div className="endpoint-body">
                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">Request Body</h4>
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <span className="param-name">request_id</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-required">Required</span>
                          </td>
                          <td>The request_id from the original send</td>
                        </tr>
                        <tr>
                          <td>
                            <span className="param-name">channel</span>
                          </td>
                          <td>
                            <span className="param-type">string</span>
                          </td>
                          <td>
                            <span className="param-optional">Optional</span>
                          </td>
                          <td>Force specific channel (whatsapp or sms)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Success Response (200)
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "success": true,
  "request_id": "otp_req_abc123def456",
  "expires_in": 300,
  "channel": "sms",
  "resend_count": 1
}`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Check Status Endpoint */}
            <section id="check-status" className="docs-section">
              <h2 className="docs-section-title">Check Status</h2>

              <div className="endpoint-card">
                <div className="endpoint-header">
                  <span className="endpoint-method method-get">GET</span>
                  <span className="endpoint-path">
                    /v1/otp/status/:request_id
                  </span>
                  <span className="endpoint-description">
                    Get OTP request status
                  </span>
                </div>
                <div className="endpoint-body">
                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Path Parameters
                    </h4>
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <span className="param-name">request_id</span>
                          </td>
                          <td>The request_id from the send response</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">
                      Success Response (200)
                    </h4>
                    <div className="code-block">
                      <pre>
                        <code>{`{
  "success": true,
  "request_id": "otp_req_abc123def456",
  "status": "pending",
  "delivery_status": "delivered",
  "expires_at": "2024-01-01T12:05:00Z",
  "attempts": 0,
  "resend_count": 0
}`}</code>
                      </pre>
                    </div>
                  </div>

                  <div className="endpoint-subsection">
                    <h4 className="endpoint-subsection-title">Status Values</h4>
                    <table className="docs-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <code className="inline-code">pending</code>
                          </td>
                          <td>OTP sent, waiting for verification</td>
                        </tr>
                        <tr>
                          <td>
                            <code className="inline-code">verified</code>
                          </td>
                          <td>OTP successfully verified</td>
                        </tr>
                        <tr>
                          <td>
                            <code className="inline-code">expired</code>
                          </td>
                          <td>OTP has expired</td>
                        </tr>
                        <tr>
                          <td>
                            <code className="inline-code">failed</code>
                          </td>
                          <td>Max attempts exceeded</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* Error Codes */}
            <section id="error-codes" className="docs-section">
              <h2 className="docs-section-title">Error Codes</h2>

              <div className="error-list">
                <div className="error-item">
                  <div>
                    <span className="error-code">INVALID_PHONE</span>
                    <span className="error-status">400</span>
                  </div>
                  <p className="error-message">
                    The phone number format is invalid. Use E.164 format.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">INVALID_PURPOSE</span>
                    <span className="error-status">400</span>
                  </div>
                  <p className="error-message">
                    Purpose must be: login, signup, password_reset, or
                    transaction.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">INVALID_CHANNEL</span>
                    <span className="error-status">400</span>
                  </div>
                  <p className="error-message">
                    Channel must be whatsapp or sms.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">INVALID_OTP</span>
                    <span className="error-status">400</span>
                  </div>
                  <p className="error-message">The OTP entered is incorrect.</p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">MISSING_REQUEST_ID</span>
                    <span className="error-status">400</span>
                  </div>
                  <p className="error-message">
                    request_id is required for verification.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">INVALID_API_KEY</span>
                    <span className="error-status">401</span>
                  </div>
                  <p className="error-message">
                    The API key is invalid or expired.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">PHONE_BLOCKED</span>
                    <span className="error-status">403</span>
                  </div>
                  <p className="error-message">
                    This phone number has been blocked due to suspicious
                    activity.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">REQUEST_NOT_FOUND</span>
                    <span className="error-status">404</span>
                  </div>
                  <p className="error-message">
                    No OTP request found with this request_id.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">ALREADY_VERIFIED</span>
                    <span className="error-status">409</span>
                  </div>
                  <p className="error-message">
                    This OTP has already been verified.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">OTP_EXPIRED</span>
                    <span className="error-status">410</span>
                  </div>
                  <p className="error-message">
                    The OTP has expired. Request a new one.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">RATE_LIMITED</span>
                    <span className="error-status">429</span>
                  </div>
                  <p className="error-message">
                    Too many requests. Check retry_after for when to retry.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">MAX_ATTEMPTS_EXCEEDED</span>
                    <span className="error-status">429</span>
                  </div>
                  <p className="error-message">
                    Maximum verification attempts reached.
                  </p>
                </div>

                <div className="error-item">
                  <div>
                    <span className="error-code">INTERNAL_ERROR</span>
                    <span className="error-status">500</span>
                  </div>
                  <p className="error-message">
                    An internal error occurred. Please try again.
                  </p>
                </div>
              </div>
            </section>

            {/* Webhooks */}
            <section id="webhooks" className="docs-section">
              <h2 className="docs-section-title">Webhooks</h2>

              <div className="auth-box">
                <h3 className="auth-box-title">Delivery Status Webhooks</h3>
                <p className="auth-box-text">
                  Configure webhooks in your project settings to receive
                  real-time delivery status updates. Webhooks are sent as POST
                  requests with HMAC-SHA256 signature verification.
                </p>
              </div>

              <div className="endpoint-subsection">
                <h4 className="endpoint-subsection-title">Webhook Payload</h4>
                <div className="code-block">
                  <pre>
                    <code>{`{
  "event": "otp.delivered",
  "request_id": "otp_req_abc123def456",
  "phone": "+919876543210",
  "channel": "whatsapp",
  "status": "delivered",
  "timestamp": "2024-01-01T12:00:00Z"
}`}</code>
                  </pre>
                </div>
              </div>

              <div className="endpoint-subsection">
                <h4 className="endpoint-subsection-title">Event Types</h4>
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <code className="inline-code">otp.sent</code>
                      </td>
                      <td>OTP has been sent to the delivery channel</td>
                    </tr>
                    <tr>
                      <td>
                        <code className="inline-code">otp.delivered</code>
                      </td>
                      <td>OTP successfully delivered to recipient</td>
                    </tr>
                    <tr>
                      <td>
                        <code className="inline-code">otp.failed</code>
                      </td>
                      <td>OTP delivery failed</td>
                    </tr>
                    <tr>
                      <td>
                        <code className="inline-code">otp.verified</code>
                      </td>
                      <td>OTP has been verified successfully</td>
                    </tr>
                    <tr>
                      <td>
                        <code className="inline-code">otp.expired</code>
                      </td>
                      <td>OTP has expired without verification</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Sandbox */}
            <section id="sandbox" className="docs-section">
              <h2 className="docs-section-title">Sandbox Mode</h2>

              <div className="auth-box">
                <h3 className="auth-box-title">
                  Testing Without Real Deliveries
                </h3>
                <p className="auth-box-text">
                  Use test API keys (
                  <code className="inline-code">otp_test_</code>) to test your
                  integration without sending real OTP messages. In sandbox
                  mode, the OTP is returned directly in the API response.
                </p>
              </div>

              <div className="rate-limit-box">
                <h4 className="rate-limit-title">Sandbox Features</h4>
                <ul
                  style={{
                    color: "#888888",
                    paddingLeft: "20px",
                    marginTop: "12px",
                    lineHeight: "1.8",
                  }}
                >
                  <li>OTPs are returned in the response (not delivered)</li>
                  <li>No charges for sandbox requests</li>
                  <li>Same rate limits as production</li>
                  <li>Full webhook support</li>
                </ul>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
