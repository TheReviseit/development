import type { Metadata } from "next";
import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
import "./data-handling-policy.css";

export const metadata: Metadata = {
  title: "Data Handling Policy - Platform Data Processing | ReviseIt",
  description:
    "ReviseIt Data Handling Policy: How we process Meta Platform Data, our data processors (Supabase, Firebase, Vercel), government request policies, and data subject rights.",
  keywords: [
    "data handling policy",
    "platform data",
    "Meta data processing",
    "WhatsApp API data",
    "data processors",
    "Supabase",
    "Firebase",
    "Vercel",
    "DPDP Act 2023",
    "data controller",
    "government data requests",
  ],
  applicationName: "ReviseIt",
  authors: [{ name: "ReviseIt Legal Team" }],
  creator: "ReviseIt",
  publisher: "ReviseIt",
  category: "Legal Document",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.reviseit.in/data-handling-policy",
    siteName: "ReviseIt",
    title: "Data Handling Policy - ReviseIt",
    description:
      "Learn how ReviseIt processes and protects Platform Data from Meta and WhatsApp Business API.",
  },
  alternates: {
    canonical: "https://www.reviseit.in/data-handling-policy",
  },
};

export default function DataHandlingPolicy() {
  return (
    <>
      <Header minimal />
      <div className="data-handling-page">
        <div className="data-handling-container">
          <div className="data-handling-content">
            <h1 className="data-handling-title">Data Handling Policy</h1>
            <p className="data-handling-last-updated">
              Last Updated: December 25, 2024
            </p>

            <div className="data-handling-body">
              {/* Section 1: Data Controller */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  1. Data Controller
                </h2>
                <div className="data-handling-highlight-box">
                  <p className="data-handling-text">
                    <strong>ReviseIt</strong> acts as the Data Controller for
                    all Platform Data received from Meta, including WhatsApp
                    Business API data. We determine the purposes and means of
                    processing this data to provide our WhatsApp Business
                    messaging services.
                  </p>
                  <p className="data-handling-text">
                    <strong>Location:</strong> India
                  </p>
                </div>
              </section>

              {/* Section 2: Data Processors */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  2. Data Processors / Service Providers
                </h2>
                <p className="data-handling-text">
                  The following third-party service providers process Platform
                  Data on our behalf:
                </p>

                <table className="data-handling-table">
                  <thead>
                    <tr>
                      <th>Service Provider</th>
                      <th>Services</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Supabase Inc.</strong>
                      </td>
                      <td>Database hosting, authentication</td>
                      <td>United States</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Google Firebase</strong>
                      </td>
                      <td>Authentication, push notifications</td>
                      <td>United States</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Vercel Inc.</strong>
                      </td>
                      <td>Application hosting, edge functions</td>
                      <td>United States</td>
                    </tr>
                  </tbody>
                </table>

                <p className="data-handling-text">All data processors:</p>
                <ul className="data-handling-list-spaced">
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      Process data only on our documented instructions
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      Maintain strict confidentiality obligations
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      Implement appropriate technical and organizational
                      security measures
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      Do not sub-process data without authorization
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      Assist with data subject access requests
                    </span>
                  </li>
                </ul>
              </section>

              {/* Section 3: Platform Data */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  3. Platform Data We Process
                </h2>

                <table className="data-handling-table">
                  <thead>
                    <tr>
                      <th>Data Type</th>
                      <th>Purpose</th>
                      <th>Retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Meta User ID</td>
                      <td>Account linking</td>
                      <td>Duration of service + 30 days</td>
                    </tr>
                    <tr>
                      <td>WhatsApp Business Account ID</td>
                      <td>API communication</td>
                      <td>Duration of service + 30 days</td>
                    </tr>
                    <tr>
                      <td>Phone Number IDs</td>
                      <td>Message routing</td>
                      <td>Duration of service + 30 days</td>
                    </tr>
                    <tr>
                      <td>Message Template Names</td>
                      <td>Template management</td>
                      <td>Duration of service + 30 days</td>
                    </tr>
                    <tr>
                      <td>Access Tokens (encrypted)</td>
                      <td>API authentication</td>
                      <td>Until token expiry</td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="data-handling-subsection-title">
                  Data We Do Not Store
                </h3>
                <ul className="data-handling-list-spaced">
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      End customer phone numbers beyond immediate conversation
                      context
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      Personal data not required for service operation
                    </span>
                  </li>
                </ul>

                <h3 className="data-handling-subsection-title">
                  Analytics Data
                </h3>
                <p className="data-handling-text">
                  Analytics data is aggregated and anonymized. Analytics data
                  cannot be used to reconstruct individual conversations.
                </p>
              </section>

              {/* Section 4: Government Requests */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  4. Government & Public Authority Requests
                </h2>

                <div className="data-handling-highlight-box">
                  <p className="data-handling-text">
                    <strong>Requests received in past 12 months:</strong>{" "}
                    <span className="data-handling-zero-badge">Zero (0)</span>
                  </p>
                </div>

                <h3 className="data-handling-subsection-title">
                  4.1 Our Policy on Government Requests
                </h3>
                <ol className="data-handling-ordered-list">
                  <li>
                    <strong>Legal Review Requirement:</strong> All requests for
                    user data from government or public authorities will be
                    reviewed by legal counsel before any disclosure.
                  </li>
                  <li>
                    <strong>User Notification:</strong> Where legally permitted,
                    we will notify affected users of any government request for
                    their data.
                  </li>
                  <li>
                    <strong>Narrow Disclosure:</strong> We will only provide the
                    minimum data necessary to comply with a valid legal order.
                  </li>
                  <li>
                    <strong>Request Logging:</strong> All government requests
                    and our responses are logged and documented.
                  </li>
                  <li>
                    <strong>Jurisdictional Limits:</strong> We require proper
                    legal process appropriate to our jurisdiction (India) before
                    complying with requests.
                  </li>
                </ol>

                <h3 className="data-handling-subsection-title">
                  4.2 Request Handling Process
                </h3>
                <ol className="data-handling-ordered-list">
                  <li>Receive request in writing</li>
                  <li>Verify authenticity and authority of requester</li>
                  <li>Review scope and legal validity with counsel</li>
                  <li>Challenge overly broad or invalid requests</li>
                  <li>Provide only data legally required</li>
                  <li>Document and log the interaction</li>
                </ol>
              </section>

              {/* Section 5: Data Security */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  5. Data Security Measures
                </h2>
                <ul className="data-handling-list-spaced">
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Encryption at Rest:</strong> All Platform Data is
                      encrypted using AES-256
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Encryption in Transit:</strong> TLS 1.3 for all
                      API communications
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Access Controls:</strong> Role-based access
                      controls (RBAC) for team members
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Token Security:</strong> Access tokens are
                      encrypted before storage
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Audit Logging:</strong> All data access is logged
                      and monitored
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Regular Reviews:</strong> Quarterly security
                      reviews and updates
                    </span>
                  </li>
                </ul>
              </section>

              {/* Section 6: Data Subject Rights */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  6. Data Subject Rights
                </h2>
                <p className="data-handling-text">
                  Users and their customers can exercise the following rights:
                </p>
                <ul className="data-handling-list-spaced">
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Access:</strong> Request a copy of their data
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Rectification:</strong> Correct inaccurate data
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Erasure:</strong> Request deletion of their data
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Portability:</strong> Receive data in
                      machine-readable format
                    </span>
                  </li>
                  <li className="data-handling-list-item">
                    <div className="data-handling-bullet-alt"></div>
                    <span className="data-handling-item-text">
                      <strong>Objection:</strong> Object to certain processing
                      activities
                    </span>
                  </li>
                </ul>
                <p className="data-handling-text">
                  To exercise these rights, contact us at{" "}
                  <a
                    href="mailto:contact@reviseit.in"
                    className="data-handling-link"
                  >
                    contact@reviseit.in
                  </a>
                </p>
              </section>

              {/* Section 7: Contact */}
              <section className="data-handling-section">
                <h2 className="data-handling-section-title">
                  7. Contact Information
                </h2>
                <div className="data-handling-contact-box">
                  <p className="data-handling-text">
                    <strong>Email:</strong>{" "}
                    <a
                      href="mailto:contact@reviseit.in"
                      className="data-handling-link"
                    >
                      contact@reviseit.in
                    </a>
                  </p>
                  <p className="data-handling-text">
                    <strong>Data Protection Contact:</strong> ReviseIt Data
                    Protection Team
                  </p>
                  <p className="data-handling-text">
                    <strong>Location:</strong> India
                  </p>
                </div>
              </section>

              <div className="data-handling-footer">
                <p className="data-handling-footer-text">
                  This Data Handling Policy is designed to provide transparency
                  about how ReviseIt processes Platform Data obtained from Meta.
                  For our full Privacy Policy, please visit{" "}
                  <a href="/privacy-policy" className="data-handling-link">
                    Privacy Policy
                  </a>
                  .
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
