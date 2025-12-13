import type { Metadata } from "next";
import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
import "./terms.css";

export const metadata: Metadata = {
  // ========================================
  // BASIC META TAGS
  // ========================================

  title: "Terms of Service - WhatsApp Automation Agreement | ReviseIt",

  description:
    "ReviseIt Terms of Service: User responsibilities, WhatsApp Business Policy compliance, data protection terms, SLA guarantees, and dispute resolution. Aligned with IT Act 2000 and DPDP Act 2023.",

  keywords: [
    "terms of service",
    "user agreement",
    "WhatsApp Business Policy",
    "service level agreement",
    "SLA",
    "data protection terms",
    "India IT Act 2000",
    "DPDP Act 2023",
    "WhatsApp automation terms",
    "subscription terms",
    "refund policy",
    "liability limitations",
  ],

  // ========================================
  // APPLICATION METADATA
  // ========================================

  applicationName: "ReviseIt",
  authors: [{ name: "ReviseIt Legal Team" }],
  creator: "ReviseIt",
  publisher: "ReviseIt",
  category: "Legal Document",
  classification: "Terms of Service - SaaS Agreement",

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
    url: "https://www.reviseit.in/terms",
    siteName: "ReviseIt",
    title: "Terms of Service - ReviseIt WhatsApp Automation Platform",
    description:
      "User agreement for ReviseIt: WhatsApp compliance requirements, data rights, service guarantees, and legal terms for businesses automating WhatsApp messaging.",
    images: [
      {
        url: "/og-terms-of-service.png",
        width: 1200,
        height: 630,
        alt: "ReviseIt Terms of Service - WhatsApp Automation Agreement",
        type: "image/png",
      },
    ],
  },

  // ========================================
  // TWITTER CARD
  // ========================================

  twitter: {
    card: "summary_large_image",
    title: "Terms of Service - ReviseIt",
    description:
      "Legal terms for using ReviseIt WhatsApp automation. Includes WhatsApp Business Policy compliance, data protection, and SLA guarantees.",
    images: ["/twitter-terms.png"],
    creator: "@reviseit",
    site: "@reviseit",
  },

  // ========================================
  // CANONICAL & ALTERNATES
  // ========================================

  alternates: {
    canonical: "https://www.reviseit.in/terms",
    languages: {
      "en-US": "https://www.reviseit.in/terms",
    },
  },

  referrer: "origin-when-cross-origin",
};

export default function TermsOfService() {
  return (
    <>
      <Header minimal />
      <div className="terms-page">
        <div className="terms-container">
          <div className="terms-content">
            <h1 className="terms-title">Terms of Service</h1>
            <p className="terms-last-updated">
              Last Updated: December 13, 2025
            </p>

            <div className="terms-body">
              <section className="terms-section">
                <h2 className="terms-section-title">1. Acceptance of Terms</h2>
                <p className="terms-text">
                  By accessing or using ReviseIt ("Service", "Platform"), you
                  agree to be bound by these Terms of Service ("Terms"). These
                  Terms align with the Information Technology Act, 2000 and the
                  Digital Personal Data Protection (DPDP) Act, 2023. If you do
                  not agree, please do not use our Service.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  2. Description of Service
                </h2>
                <p className="terms-text">
                  ReviseIt is an AI-powered WhatsApp automation platform that
                  enables businesses to:
                </p>
                <ul className="terms-list-spaced">
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      Automate WhatsApp messaging and customer communications
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      Create and manage AI-powered chatbots
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      Integrate with WhatsApp Business API
                    </span>
                  </li>
                </ul>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  3. User Responsibilities & WhatsApp Compliance
                </h2>
                <p className="terms-text">You agree to:</p>
                <ul className="terms-list-spaced">
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>WhatsApp Policy:</strong> Strictly adhere to
                      Meta's Platform Terms and WhatsApp Business Policy,
                      including the prohibition of spam and requirement for
                      opt-in consent.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>24-Hour Window:</strong> Respect the 24-hour
                      messaging window for customer-initiated conversations.
                      Template messages used outside this window must be
                      approved by WhatsApp.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>Account Security:</strong> Maintain the
                      confidentiality of your credentials and notify us
                      immediately of unauthorized access.
                    </span>
                  </li>
                </ul>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  4. Data Privacy & Protection (DPDP Act 2023)
                </h2>
                <p className="terms-text">
                  We are committed to protecting your data in compliance with
                  the DPDP Act 2023.
                </p>
                <ul className="terms-list-spaced">
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>Data Ownership:</strong> You retain full ownership
                      of all customer data, chatbot configurations, and content
                      you upload to ReviseIt.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>Data Processing:</strong> We implement
                      industry-standard encryption (AES-256) for data at rest
                      and TLS for data in transit. We perform regular backups to
                      ensure data integrity.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>Data Rights:</strong> You have the right to
                      export, correct, or delete your data at any time via your
                      account settings or by contacting support.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>Breach Notification:</strong> In the event of a
                      data breach affecting your personal data, we will notify
                      you and the Data Protection Board within the timelines
                      prescribed by the DPDP Act (typically within 72 hours).
                    </span>
                  </li>
                </ul>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  5. Intellectual Property Rights
                </h2>
                <p className="terms-text">
                  <strong>Your IP:</strong> You grant ReviseIt a worldwide,
                  non-exclusive license to host, copy, and use your data solely
                  as necessary to provide the Service. We do not use your
                  proprietary data to train our core AI models for other
                  customers without explicit consent.
                </p>
                <p className="terms-text">
                  <strong>Our IP:</strong> ReviseIt owns all rights, title, and
                  interest in the Platform, software, code, and aggregated,
                  anonymized usage data.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  6. Service Level Agreement (SLA)
                </h2>
                <p className="terms-text">
                  We strive to maintain <strong>99.5% Service Uptime</strong>.
                </p>
                <ul className="terms-list">
                  <li className="terms-list-item">
                    <div className="terms-bullet"></div>
                    <span className="terms-item-text">
                      <strong>Support:</strong> We aim to respond to critical
                      support tickets within 6 hours and general inquiries
                      within 24 hours during business days.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>Maintenance:</strong> Planned maintenance windows
                      will be notified at least 48 hours in advance.
                    </span>
                  </li>
                  <li className="terms-list-item">
                    <div className="terms-bullet-alt"></div>
                    <span className="terms-item-text">
                      <strong>SLA Credits:</strong> If uptime falls below 99.5%
                      in a given month, you may be eligible for service credits,
                      pro-rated against your monthly fee, upon request.
                    </span>
                  </li>
                </ul>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  7. Payments & Subscriptions
                </h2>
                <p className="terms-text">
                  Fees are non-refundable unless required by law. Subscriptions
                  automatically renew unless cancelled.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  8. Limitation of Liability
                </h2>
                <p className="terms-text">
                  <strong>MAXIMUM LIABILITY:</strong> TO THE EXTENT PERMITTED BY
                  LAW, REVISEIT'S TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF
                  OR RELATED TO THESE TERMS SHALL NOT EXCEED THE TOTAL AMOUNT
                  PAID BY YOU TO REVISEIT IN THE 12 MONTHS PRECEDING THE
                  INCIDENT.
                </p>
                <p className="terms-text">
                  <strong>EXCLUSIONS:</strong> WE SHALL NOT BE LIABLE FOR ANY
                  INDIRECT, SPECIAL, OR CONSEQUENTIAL DAMAGES, OR DAMAGES
                  RESULTING FROM FORCE MAJEURE EVENTS, THIRD-PARTY INTEGRATION
                  FAILURES (INCLUDING WHATSAPP/META), OR INTERNET OUTAGES.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">9. Indemnification</h2>
                <p className="terms-text">
                  <strong>By You:</strong> You agree to indemnify and hold
                  ReviseIt harmless from claims arising from your use of the
                  Service, violation of these Terms, or violation of any
                  third-party rights (including WhatsApp policies).
                </p>
                <p className="terms-text">
                  <strong>By Us:</strong> We agree to indemnify you against
                  third-party claims that the Service infringes valid
                  intellectual property rights, provided you use the Service as
                  authorized.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">
                  10. Data Residency & Transfer
                </h2>
                <p className="terms-text">
                  Your data is primarily stored on secure servers located in
                  <strong> India</strong> to comply with data localization
                  norms. Any cross-border transfer of data will strictly adhere
                  to the conditions specified under the DPDP Act 2023 and
                  applicable laws.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">11. Dispute Resolution</h2>
                <p className="terms-text">
                  Any dispute arising out of these Terms shall first be
                  attempted to be resolved amicably. If unresolved, it shall be
                  referred to arbitration in accordance with the Arbitration and
                  Conciliation Act, 1996. The seat of arbitration shall be
                  [City, State, India], and the language shall be English.
                </p>
              </section>

              <section className="terms-section">
                <h2 className="terms-section-title">12. Contact</h2>
                <div className="terms-contact-box">
                  <p className="terms-text">
                    <strong>Email:</strong>{" "}
                    <a href="mailto:contact@reviseit.in" className="terms-link">
                      contact@reviseit.in
                    </a>
                  </p>
                  <p className="terms-text">
                    <strong>Business Name:</strong> ReviseIt
                  </p>
                </div>
              </section>

              <div className="terms-footer">
                <p className="terms-footer-text">
                  By using ReviseIt, you acknowledge that you have read,
                  understood, and agree to be bound by these Terms of Service.
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
