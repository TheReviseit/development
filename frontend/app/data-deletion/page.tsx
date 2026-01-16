import type { Metadata } from "next";
import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
import "./data-deletion.css";

export const metadata: Metadata = {
  // ========================================
  // BASIC META TAGS
  // ========================================

  title:
    "User Data Deletion Instructions - Delete Your Flowauxi Account | DPDP Compliance",

  description:
    "Request deletion of your Flowauxi account and data. Step-by-step instructions for full or partial account deletion, timelines (30-90 days), and data portability. DPDP Act 2023 and Meta compliant.",

  keywords: [
    "data deletion",
    "delete account",
    "right to erasure",
    "DPDP Act 2023 deletion",
    "account deletion request",
    "data portability",
    "WhatsApp data removal",
    "user data rights",
    "delete personal data",
    "account termination",
    "Meta data deletion",
    "privacy rights",
  ],

  // ========================================
  // APPLICATION METADATA
  // ========================================

  applicationName: "Flowauxi",
  authors: [{ name: "Flowauxi Privacy Team" }],
  creator: "Flowauxi",
  publisher: "Flowauxi",
  category: "User Rights - Data Privacy",
  classification: "Data Deletion Instructions - DPDP Compliance",

  // ========================================
  // ROBOTS & CRAWLING (Critical for Meta Review)
  // ========================================

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ========================================
  // OPEN GRAPH (Facebook, WhatsApp, LinkedIn)
  // ========================================

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.flowauxi.com/data-deletion",
    siteName: "Flowauxi",
    title: "Delete Your Flowauxi Account - User Data Deletion Instructions",
    description:
      "Exercise your right to erasure under DPDP Act 2023. Request full or partial account deletion with clear timelines and data portability options.",
    images: [
      {
        url: "/og-data-deletion.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi Data Deletion Instructions - DPDP Act 2023 Compliant",
        type: "image/png",
      },
    ],
  },

  // ========================================
  // TWITTER CARD
  // ========================================

  twitter: {
    card: "summary_large_image",
    title: "Data Deletion Instructions - Flowauxi",
    description:
      "Request deletion of your Flowauxi account and data. DPDP Act 2023 compliant process with clear timelines and verification steps.",
    images: ["/twitter-data-deletion.png"],
    creator: "@flowauxi",
    site: "@flowauxi",
  },

  // ========================================
  // CANONICAL & ALTERNATES
  // ========================================

  alternates: {
    canonical: "https://www.flowauxi.com/data-deletion",
    languages: {
      "en-US": "https://www.flowauxi.com/data-deletion",
    },
  },

  referrer: "origin-when-cross-origin",

  // ========================================
  // META-SPECIFIC (Critical for App Review)
  // ========================================

  other: {
    "og:type": "website",
    "article:section": "Legal & Privacy",
    "article:tag": "Data Deletion, User Rights, DPDP Act 2023",
  },
};

export default function DataDeletion() {
  return (
    <>
      <Header minimal />
      <div className="data-deletion-page">
        <div className="data-deletion-container">
          <div className="data-deletion-content">
            <h1 className="data-deletion-title">
              User Data Deletion Instructions
            </h1>
            <p className="data-deletion-last-updated">
              Last Updated: December 13, 2025
            </p>

            <div className="data-deletion-body">
              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">1. Introduction</h2>
                <p className="data-deletion-text">
                  You can request deletion of your Flowauxi account and
                  associated data at any time. We are committed to processing
                  your request promptly and in compliance with applicable data
                  protection laws, including the DPDP Act 2023.
                </p>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  2. How to Request Deletion
                </h2>
                <p className="data-deletion-text">
                  You can request a <strong>Full Account Deletion</strong> or a
                  <strong> Partial Deletion</strong> (e.g., clearing only
                  WhatsApp conversation history). Send an email to:
                </p>
                <div className="data-deletion-highlight-box">
                  <p className="data-deletion-highlight-text">
                    <strong>Email:</strong>{" "}
                    <a
                      href="mailto:connect@flowauxi.com?subject=Data%20Deletion%20Request%20%E2%80%93%20Flowauxi"
                      className="data-deletion-link"
                    >
                      connect@flowauxi.com
                    </a>
                  </p>
                  <p className="data-deletion-highlight-text">
                    <strong>Subject:</strong> "Data Deletion Request – Flowauxi"
                  </p>
                  <p className="data-deletion-highlight-text">
                    <strong>Specify:</strong> "Full Deletion" or "Partial
                    Deletion"
                  </p>
                </div>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  3. Information to Include
                </h2>
                <p className="data-deletion-text">
                  Please include the following verification details:
                </p>
                <ul className="data-deletion-list">
                  <li className="data-deletion-list-item">
                    <div className="data-deletion-bullet"></div>
                    <span className="data-deletion-item-text">
                      <strong>Registered Email:</strong> The email address
                      associated with your Flowauxi account
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>WhatsApp Number:</strong> Your WhatsApp Business
                      phone number linked to the account
                    </span>
                  </li>
                </ul>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  4. Timeline & Process
                </h2>
                <p className="data-deletion-text">
                  Your data deletion will be processed as follows:
                </p>
                <ul className="data-deletion-list">
                  <li className="data-deletion-list-item">
                    <div className="data-deletion-bullet"></div>
                    <span className="data-deletion-item-text">
                      <strong>Verification:</strong> Within 2 business days of
                      receiving your request
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>Pre-deletion Notification:</strong> You will
                      receive an email 48 hours before the actual deletion
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>Deletion Completion:</strong> Within 30 days of
                      verification
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>Backup Purging:</strong> Data in backup systems
                      will be permanently removed within 90 days
                    </span>
                  </li>
                </ul>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  5. Data Portability
                </h2>
                <p className="data-deletion-text">
                  Before requesting deletion, you have the right to export your
                  data (chatbot configurations, customer lists, message
                  templates) in a standard format (JSON/CSV). Please request
                  this export explicitly in your email if needed. We will
                  provide the export within 7 days.
                </p>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  6. What Data Will Be Deleted
                </h2>
                <ul className="data-deletion-list">
                  <li className="data-deletion-list-item">
                    <div className="data-deletion-bullet"></div>
                    <span className="data-deletion-item-text">
                      <strong>Account Info:</strong> Name, email, profile
                      details
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>Application Data:</strong> Chatbot flows, message
                      history stored on our servers, and analytics
                    </span>
                  </li>
                </ul>
                <p className="data-deletion-text" style={{ marginTop: "1rem" }}>
                  <strong>Third-Party Data:</strong> We will delete data stored
                  on Flowauxi servers. Data stored directly by Meta/WhatsApp
                  Business API is subject to their retention policies. You may
                  need to contact Meta directly for deletion of data on their
                  end.
                </p>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  7. Exceptions to Deletion
                </h2>
                <p className="data-deletion-text">
                  We cannot delete data required for:
                </p>
                <ul className="data-deletion-list">
                  <li className="data-deletion-list-item">
                    <div className="data-deletion-bullet"></div>
                    <span className="data-deletion-item-text">
                      <strong>Legal Obligations:</strong> Tax records and
                      financial transactions (retained for 7 years as per Indian
                      law)
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>Pending Disputes:</strong> Data related to ongoing
                      legal claims or investigations
                    </span>
                  </li>
                  <li className="data-deletion-list-item">
                    <span className="data-deletion-bullet-alt"></span>
                    <span className="data-deletion-item-text">
                      <strong>Security:</strong> Fraud prevention logs and audit
                      trails
                    </span>
                  </li>
                </ul>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  8. Consequences of Deletion
                </h2>
                <div className="data-deletion-warning-box">
                  <p className="data-deletion-text">
                    <strong>Warning:</strong> Deletion is{" "}
                    <strong>permanent</strong>.
                  </p>
                  <ul className="data-deletion-list">
                    <li className="data-deletion-list-item">
                      <div className="data-deletion-bullet"></div>
                      <span className="data-deletion-item-text">
                        Account cannot be recovered
                      </span>
                    </li>
                    <li className="data-deletion-list-item">
                      <span className="data-deletion-bullet-alt"></span>
                      <span className="data-deletion-item-text">
                        Active subscriptions will be terminated without refund
                      </span>
                    </li>
                    <li className="data-deletion-list-item">
                      <span className="data-deletion-bullet-alt"></span>
                      <span className="data-deletion-item-text">
                        WhatsApp integrations will be disconnected immediately
                      </span>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="data-deletion-section">
                <h2 className="data-deletion-section-title">
                  Contact Information
                </h2>
                <p className="data-deletion-text">
                  If you have any questions about the data deletion process,
                  please contact us:
                </p>
                <div className="data-deletion-contact-box">
                  <p className="data-deletion-text">
                    <strong>Email:</strong>{" "}
                    <a
                      href="mailto:connect@flowauxi.com"
                      className="data-deletion-link"
                    >
                      connect@flowauxi.com
                    </a>
                  </p>
                  <p className="data-deletion-text">
                    <strong>Business Name:</strong> Flowauxi
                  </p>
                </div>
              </section>

              <div className="data-deletion-footer">
                <p className="data-deletion-footer-text">
                  We are committed to protecting your privacy and honoring your
                  data deletion requests in accordance with the DPDP Act 2023.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
