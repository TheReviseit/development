import type { Metadata } from "next";
import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
import "./privacy.css";

export const metadata: Metadata = {
  // ========================================
  // BASIC META TAGS
  // ========================================

  title: "Privacy Policy - DPDP Act 2023 Compliance | Flowauxi",

  description:
    "Flowauxi Privacy Policy: Learn how we collect, use, protect, and delete your data in compliance with India's DPDP Act 2023 and WhatsApp Business API requirements. Transparent data handling for your WhatsApp automation platform.",

  keywords: [
    "privacy policy",
    "DPDP Act 2023",
    "data protection",
    "WhatsApp data privacy",
    "user data rights",
    "data deletion",
    "India privacy law",
    "personal data protection",
    "WhatsApp Business API privacy",
    "data security",
    "GDPR-style compliance",
    "grievance redressal",
  ],

  // ========================================
  // APPLICATION METADATA
  // ========================================

  applicationName: "Flowauxi",
  authors: [{ name: "Flowauxi Legal Team" }],
  creator: "Flowauxi",
  publisher: "Flowauxi",
  category: "Legal Document",
  classification: "Privacy Policy - Data Protection Compliance",

  // ========================================
  // ROBOTS & CRAWLING
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
    url: "https://www.flowauxi.com/privacy",
    siteName: "Flowauxi",
    title: "Privacy Policy - Flowauxi WhatsApp Automation",
    description:
      "Transparent privacy practices for Flowauxi users. DPDP Act 2023 compliant. Learn about data collection, user rights, and WhatsApp Business API data handling.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi Privacy Policy - DPDP Act 2023 Compliant",
        type: "image/png",
      },
    ],
  },

  // ========================================
  // TWITTER CARD
  // ========================================

  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy - Flowauxi",
    description:
      "DPDP Act 2023 compliant privacy policy. Learn how Flowauxi protects your data when using our WhatsApp automation platform.",
    images: ["/twitter-image.png"],
    creator: "@flowauxi",
    site: "@flowauxi",
  },

  // ========================================
  // CANONICAL & ALTERNATES
  // ========================================

  alternates: {
    canonical: "https://www.flowauxi.com/privacy",
    languages: {
      "en-US": "https://www.flowauxi.com/privacy",
    },
  },

  referrer: "origin-when-cross-origin",
};

export default function PrivacyPolicy() {
  return (
    <>
      <Header minimal />
      <div className="privacy-page">
        <div className="privacy-container">
          <div className="privacy-content">
            <h1 className="privacy-title">Privacy Policy</h1>
            <p className="privacy-last-updated">
              Last Updated: December 13, 2025
            </p>

            <div className="privacy-body">
              <section className="privacy-section">
                <h2 className="privacy-section-title">1. Introduction</h2>
                <p className="privacy-text">
                  Flowauxi is an AI-powered WhatsApp automation platform. This
                  Privacy Policy describes how we collect, use, and protect your
                  personal data in accordance with the Digital Personal Data
                  Protection (DPDP) Act, 2023.
                </p>
                <div className="privacy-highlight-box">
                  <p className="privacy-highlight-text">
                    <strong>Data Fiduciary:</strong> Flowauxi
                  </p>
                  <p className="privacy-highlight-text">
                    <strong>Registered Address:</strong> Ambasamudram,
                    Tirunelveli, Tamil Nadu 627428
                  </p>
                  <p className="privacy-highlight-text">
                    <strong>Business Type:</strong> Sole Proprietorship
                  </p>
                  <p className="privacy-highlight-text">
                    <strong>GST Registration:</strong> In Progress
                  </p>
                </div>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  2. Legal Basis for Processing
                </h2>
                <p className="privacy-text">
                  We process your personal data based on the following legal
                  grounds:
                </p>
                <ul className="privacy-list">
                  <li className="privacy-list-item">
                    <div className="privacy-bullet"></div>
                    <span className="privacy-item-text">
                      <strong>Consent:</strong> For marketing communications and
                      specific data collection (e.g., location access). You
                      explicitly consent to this processing.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Legitimate Uses:</strong> For fraud prevention,
                      network security, and employment-related purposes as
                      permitted by law.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Contractual Necessity:</strong> To provide the
                      services you have subscribed to (e.g., processing
                      payments, delivering messages).
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Legal Compliance:</strong> To comply with legal
                      usage obligations like tax reporting and law enforcement
                      requests.
                    </span>
                  </li>
                </ul>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  3. Information We Collect
                </h2>
                <p className="privacy-text">
                  We collect the following information when you use Flowauxi:
                </p>
                <ul className="privacy-list">
                  <li className="privacy-list-item">
                    <div className="privacy-bullet"></div>
                    <span className="privacy-item-text">
                      <strong>Identity Data:</strong> Name, Email, Phone Number
                      (Legal Basis: Contractual Necessity)
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>WhatsApp Data:</strong> WhatsApp Business Number,
                      Message Metadata (Timestamps, Status). Content is
                      encrypted. (Legal Basis: Contractual Necessity)
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Technical Data:</strong> IP address, device info,
                      cookies (Legal Basis: Legitimate Use)
                    </span>
                  </li>
                </ul>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">4. Data Retention</h2>
                <p className="privacy-text">
                  We retain personal data only as long as necessary:
                </p>
                <ul className="privacy-list">
                  <li className="privacy-list-item">
                    <div className="privacy-bullet"></div>
                    <span className="privacy-item-text">
                      <strong>Account Data:</strong> Retained for 3 years after
                      account closure or last interaction.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Financial Records:</strong> Retained for 7 years
                      as required by tax laws.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Log Data:</strong> Retained for 90 days for
                      security auditing.
                    </span>
                  </li>
                </ul>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  5. Cross-Border Data Transfers
                </h2>
                <p className="privacy-text">
                  Some data may be processed outside India (e.g., via Meta's
                  servers or cloud providers like AWS/Google Cloud). We ensure
                  these transfers comply with the DPDP Act through:
                </p>
                <ul className="privacy-list">
                  <li className="privacy-list-item">
                    <div className="privacy-bullet"></div>
                    <span className="privacy-item-text">
                      <strong>Standard Contractual Clauses (SCCs):</strong>{" "}
                      Ensuring equivalent protection levels.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Negative List Adherence:</strong> We do not
                      transfer data to countries restricted by the Indian
                      government.
                    </span>
                  </li>
                </ul>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  6. Third-Party Services
                </h2>
                <p className="privacy-text">
                  <strong>Meta & WhatsApp:</strong> We use the WhatsApp Business
                  API. Meta processes message metadata. By using our service,
                  you consent to Meta's privacy practices.
                </p>
                <p className="privacy-text">
                  <strong>Other Processors:</strong> We use secure cloud hosting
                  and email providers bound by Data Processing Agreements
                  (DPAs).
                </p>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  7. Data Security & Breaches
                </h2>
                <p className="privacy-text">
                  We use AES-256 encryption and TLS 1.3. In the event of a
                  personal data breach, we will notify the Data Protection Board
                  of India and affected users promptly (as required by law,
                  typically within 72 hours).
                </p>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">8. User Rights</h2>
                <p className="privacy-text">
                  Under the DPDP Act, you have the right to:
                </p>
                <ul className="privacy-list-spaced">
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Access & Correction:</strong> Request a summary of
                      your data and correct inaccuracies.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Erasure:</strong> Request deletion of your data
                      (see{" "}
                      <a href="/data-deletion" className="privacy-link">
                        Data Deletion
                      </a>
                      ).
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Withdraw Consent:</strong> Withdraw consent for
                      specific processing (e.g., marketing) at any time.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Nominate:</strong> Nominate an individual to
                      exercise your rights in the event of death or incapacity.
                    </span>
                  </li>
                  <li className="privacy-list-item">
                    <div className="privacy-bullet-alt"></div>
                    <span className="privacy-item-text">
                      <strong>Grievance Redressal:</strong> File a complaint
                      with our Grievance Officer.
                    </span>
                  </li>
                </ul>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">9. Children's Privacy</h2>
                <p className="privacy-text">
                  Our services are not intended for users under the age of 18.
                  We do not knowingly collect data from minors. If you believe
                  we have collected such data, please contact us immediately for
                  deletion.
                </p>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  10. Automated Decision-Making
                </h2>
                <p className="privacy-text">
                  We use AI to power chatbot responses. We do not use automated
                  decision-making for significant legal or financial effects on
                  users without human review.
                </p>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">11. Cookies</h2>
                <p className="privacy-text">
                  We use essential session cookies (lifespan: session only) for
                  authentication. We do not use third-party tracking cookies.
                </p>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">
                  12. Grievance Redressal
                </h2>
                <p className="privacy-text">
                  For any privacy-related concerns or grievances, please contact
                  our Grievance Officer:
                </p>
                <div className="privacy-contact-box">
                  <p className="privacy-text">
                    <strong>Name:</strong> S.Raja Raman
                  </p>
                  <p className="privacy-text">
                    <strong>Designation:</strong> Grievance Officer
                  </p>
                  <p className="privacy-text">
                    <strong>Email:</strong>{" "}
                    <a
                      href="mailto:contact@flowauxi.com"
                      className="privacy-link"
                    >
                      contact@flowauxi.com
                    </a>
                  </p>
                  <p className="privacy-text">
                    <strong>Response Time:</strong> We aim to respond to all
                    grievances within 5 business days.
                  </p>
                </div>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">13. Changes to Policy</h2>
                <p className="privacy-text">
                  We may update this policy. Material changes will be notified
                  via email at least 30 days in advance.
                </p>
              </section>

              <section className="privacy-section">
                <h2 className="privacy-section-title">14. Contact</h2>
                <div className="privacy-contact-box">
                  <p className="privacy-text">
                    <strong>Email:</strong>{" "}
                    <a
                      href="mailto:contact@flowauxi.com"
                      className="privacy-link"
                    >
                      contact@flowauxi.com
                    </a>
                  </p>
                  <p className="privacy-text">
                    <strong>Business Name:</strong> Flowauxi
                  </p>
                </div>
              </section>

              <div className="privacy-footer">
                <p className="privacy-footer-text">
                  <strong>Last Updated:</strong> December 13, 2025
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
