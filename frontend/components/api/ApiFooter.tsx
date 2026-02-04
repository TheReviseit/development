"use client";

/**
 * API Product Footer
 * Dark themed footer for api.flowauxi.com
 */

import React from "react";
import Link from "next/link";

export function ApiFooter() {
  return (
    <footer className="api-product-footer">
      <div className="api-product-footer-inner">
        {/* Product */}
        <div className="api-product-footer-section">
          <h4>Product</h4>
          <ul>
            <li>
              <Link href="/apis">Overview</Link>
            </li>
            <li>
              <Link href="/docs">Documentation</Link>
            </li>
            <li>
              <Link href="/apis/pricing">Pricing</Link>
            </li>
            <li>
              <a
                href="https://status.flowauxi.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Status
              </a>
            </li>
          </ul>
        </div>

        {/* Resources */}
        <div className="api-product-footer-section">
          <h4>Resources</h4>
          <ul>
            <li>
              <Link href="/docs#quickstart">Quick Start</Link>
            </li>
            <li>
              <Link href="/docs#errors">Error Reference</Link>
            </li>
            <li>
              <Link href="/docs#webhooks">Webhook Guide</Link>
            </li>
            <li>
              <Link href="/docs#sandbox">Sandbox Mode</Link>
            </li>
          </ul>
        </div>

        {/* Company */}
        <div className="api-product-footer-section">
          <h4>Company</h4>
          <ul>
            <li>
              <a href="https://flowauxi.com">Main Website</a>
            </li>
            <li>
              <a href="https://flowauxi.com/privacy">Privacy Policy</a>
            </li>
            <li>
              <a href="https://flowauxi.com/terms">Terms of Service</a>
            </li>
            <li>
              <a href="mailto:api-support@flowauxi.com">Contact Support</a>
            </li>
          </ul>
        </div>

        {/* SDKs */}
        <div className="api-product-footer-section">
          <h4>SDKs & Libraries</h4>
          <ul>
            <li>
              <a
                href="https://www.npmjs.com/package/@flowauxi/otp"
                target="_blank"
                rel="noopener noreferrer"
              >
                Node.js SDK
              </a>
            </li>
            <li>
              <a
                href="https://pypi.org/project/flowauxi-otp/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Python SDK
              </a>
            </li>
            <li>
              <Link href="/docs#curl">cURL Examples</Link>
            </li>
            <li>
              <Link href="/docs#postman">Postman Collection</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="api-product-footer-bottom">
        <p>
          © {new Date().getFullYear()} Flowauxi Technologies. All rights
          reserved.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>API Version 1.0</span>
          <span>•</span>
          <a
            href="https://flowauxi.com/dashboard"
            style={{
              color: "var(--api-text-secondary)",
              textDecoration: "none",
            }}
          >
            Go to Dashboard →
          </a>
        </div>
      </div>
    </footer>
  );
}
