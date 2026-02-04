"use client";

import Link from "next/link";

const OTPAPISection = () => {
  return (
    <section className="otp-api-section">
      <div className="otp-api-container">
        <div className="otp-api-content">
          <div className="otp-api-badge">NEW</div>
          <h2 className="otp-api-title">OTP Verification API</h2>
          <p className="otp-api-description">
            Secure phone verification via WhatsApp & SMS. Sub-200ms delivery,
            99.9% uptime, and built-in fraud protection. Perfect for 2FA and
            user verification.
          </p>
          <div className="otp-api-stats">
            <div className="otp-api-stat">
              <span className="otp-api-stat-value">&lt;200ms</span>
              <span className="otp-api-stat-label">Delivery</span>
            </div>
            <div className="otp-api-stat">
              <span className="otp-api-stat-value">99.9%</span>
              <span className="otp-api-stat-label">Uptime</span>
            </div>
            <div className="otp-api-stat">
              <span className="otp-api-stat-value">₹0.05</span>
              <span className="otp-api-stat-label">Per OTP</span>
            </div>
          </div>
          <div className="otp-api-actions">
            <Link href="/apis" className="otp-api-btn-primary">
              Explore API
            </Link>
            <Link href="/docs" className="otp-api-btn-secondary">
              View Docs
            </Link>
          </div>
        </div>
        <div className="otp-api-code">
          <div className="otp-api-code-header">
            <span className="otp-api-code-dot"></span>
            <span className="otp-api-code-dot"></span>
            <span className="otp-api-code-dot"></span>
            <span className="otp-api-code-title">Send OTP</span>
          </div>
          <pre className="otp-api-code-block">
            <code>{`curl -X POST api.flowauxi.com/v1/otp/send \\
  -H "Authorization: Bearer otp_live_xxx" \\
  -d '{
    "to": "+919876543210",
    "purpose": "login",
    "channel": "whatsapp"
  }'

// Response
{
  "success": true,
  "request_id": "otp_req_abc123",
  "expires_in": 300
}`}</code>
          </pre>
        </div>
      </div>

      <style jsx>{`
        .otp-api-section {
          background: linear-gradient(180deg, #0a0a0a 0%, #000 100%);
          padding: 80px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .otp-api-container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
        }

        .otp-api-badge {
          display: inline-block;
          padding: 4px 12px;
          background: #22c15a;
          color: #000;
          font-size: 11px;
          font-weight: 700;
          border-radius: 4px;
          margin-bottom: 16px;
          letter-spacing: 0.5px;
        }

        .otp-api-title {
          font-size: 40px;
          font-weight: 600;
          color: #fff;
          margin: 0 0 16px;
          letter-spacing: -0.02em;
        }

        .otp-api-description {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.6);
          line-height: 1.6;
          margin: 0 0 32px;
          max-width: 480px;
        }

        .otp-api-stats {
          display: flex;
          gap: 40px;
          margin-bottom: 32px;
        }

        .otp-api-stat {
          display: flex;
          flex-direction: column;
        }

        .otp-api-stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #fff;
          font-family: monospace;
        }

        .otp-api-stat-label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 4px;
        }

        .otp-api-actions {
          display: flex;
          gap: 16px;
        }

        .otp-api-btn-primary {
          padding: 12px 24px;
          background: #22c15a;
          color: #000;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s;
        }

        .otp-api-btn-primary:hover {
          background: #1ea84d;
          transform: translateY(-1px);
        }

        .otp-api-btn-secondary {
          padding: 12px 24px;
          background: transparent;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          text-decoration: none;
          transition: all 0.2s;
        }

        .otp-api-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .otp-api-code {
          background: #111;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
        }

        .otp-api-code-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: #0a0a0a;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .otp-api-code-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
        }

        .otp-api-code-title {
          margin-left: auto;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .otp-api-code-block {
          margin: 0;
          padding: 20px;
          font-family: "Monaco", "Menlo", monospace;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.8);
          overflow-x: auto;
        }

        @media (max-width: 900px) {
          .otp-api-container {
            grid-template-columns: 1fr;
            gap: 40px;
          }

          .otp-api-title {
            font-size: 28px;
          }

          .otp-api-stats {
            gap: 24px;
          }
        }
      `}</style>
    </section>
  );
};

export default OTPAPISection;
