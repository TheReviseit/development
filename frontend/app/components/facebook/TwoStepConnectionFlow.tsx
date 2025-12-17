/**
 * Two-Step Connection Flow Component
 *
 * Implements the Meta-approved 2-step flow for WhatsApp Business integration:
 *
 * STEP 1: Facebook Login for Business (NO config_id)
 *   - Gets business_management permission
 *   - Fetches and stores Business Managers
 *
 * STEP 2: WhatsApp Embedded Signup (WITH config_id)
 *   - Gets whatsapp_business_management + whatsapp_business_messaging
 *   - Connects WABA and phone number
 *   - Links to Business Manager from Step 1
 *
 * This architecture is the official Meta-approved pattern used by BSPs.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FacebookLoginForBusinessButton from "./FacebookLoginForBusinessButton";
import EmbeddedSignupButton from "./EmbeddedSignupButton";

interface Step {
  id: number;
  title: string;
  description: string;
  status: "pending" | "active" | "completed" | "error";
}

interface BusinessManager {
  id: string;
  business_id: string;
  business_name: string;
}

export default function TwoStepConnectionFlow() {
  const router = useRouter();

  // Flow state
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1 data
  const [step1Completed, setStep1Completed] = useState(false);
  const [businessManagers, setBusinessManagers] = useState<BusinessManager[]>(
    []
  );
  const [facebookAccountName, setFacebookAccountName] = useState<string | null>(
    null
  );

  // Step 2 data
  const [step2Completed, setStep2Completed] = useState(false);

  // Steps configuration
  const steps: Step[] = [
    {
      id: 1,
      title: "Connect Business Manager",
      description: "Log in with Facebook to access your Business Manager",
      status:
        currentStep === 1 ? "active" : step1Completed ? "completed" : "pending",
    },
    {
      id: 2,
      title: "Connect WhatsApp Business",
      description: "Select your WhatsApp Business Account and phone number",
      status:
        currentStep === 2 ? "active" : step2Completed ? "completed" : "pending",
    },
  ];

  // Check existing connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setIsLoading(true);
    try {
      // Check Step 1 status
      const step1Response = await fetch("/api/facebook/login-for-business");
      const step1Data = await step1Response.json();

      if (step1Data.step1Completed) {
        setStep1Completed(true);
        setBusinessManagers(step1Data.businessManagers || []);
        setFacebookAccountName(
          step1Data.facebookAccount?.facebook_user_name || null
        );
        setCurrentStep(2);
      }

      // Check if fully connected (Step 2 done)
      const connectionResponse = await fetch("/api/facebook/login");
      const connectionData = await connectionResponse.json();

      if (connectionData.connected && connectionData.whatsappAccount) {
        setStep2Completed(true);
        // Redirect to dashboard
        router.push("/dashboard?connection=success");
      }
    } catch (err) {
      console.error("Error checking connection status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Step 1 success
  const handleStep1Success = (fetchedBusinessManagers: any[]) => {
    console.log(
      "✅ [TwoStepFlow] Step 1 completed, Business Managers:",
      fetchedBusinessManagers.length
    );
    setStep1Completed(true);
    setBusinessManagers(fetchedBusinessManagers);
    setCurrentStep(2);
    setError(null);
  };

  // Handle Step 2 success
  const handleStep2Success = () => {
    console.log("✅ [TwoStepFlow] Step 2 completed");
    setStep2Completed(true);
    // Redirect handled by EmbeddedSignupButton
  };

  // Handle errors
  const handleError = (errorMessage: string) => {
    console.error("❌ [TwoStepFlow] Error:", errorMessage);
    setError(errorMessage);
  };

  // Retry connection
  const handleRetry = () => {
    setError(null);
    checkConnectionStatus();
  };

  // Reset flow (start over)
  const handleReset = async () => {
    setStep1Completed(false);
    setStep2Completed(false);
    setBusinessManagers([]);
    setFacebookAccountName(null);
    setCurrentStep(1);
    setError(null);
  };

  if (isLoading) {
    return (
      <div className="two-step-flow">
        <div className="loading-container">
          <div className="spinner" />
          <p>Checking connection status...</p>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="two-step-flow">
      {/* Header */}
      <div className="flow-header">
        <h1>Connect WhatsApp Business</h1>
        <p>Follow these two steps to connect your WhatsApp Business Account</p>
      </div>

      {/* Steps Progress */}
      <div className="steps-progress">
        {steps.map((step, index) => (
          <div key={step.id} className="step-wrapper">
            <div className={`step-indicator step-${step.status}`}>
              <div className="step-circle">
                {step.status === "completed" ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <div className="step-info">
                <div className="step-title">{step.title}</div>
                <div className="step-description">{step.description}</div>
              </div>
            </div>
            {index < steps.length - 1 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
          <button onClick={handleRetry} className="retry-button">
            Retry
          </button>
        </div>
      )}

      {/* Step Content */}
      <div className="step-content">
        {currentStep === 1 && (
          <div className="step-panel">
            <div className="step-badge">Step 1 of 2</div>
            <h2>Connect Your Business Manager</h2>
            <p>
              Log in with Facebook to grant access to your Business Manager.
              This allows us to see your businesses.
            </p>

            <div className="permission-info-box">
              <h4>What permissions are requested?</h4>
              <ul>
                <li>
                  <strong>business_management</strong> — Access your Business
                  Manager list
                </li>
                <li>
                  <strong>public_profile</strong> — Basic profile info
                </li>
                <li>
                  <strong>email</strong> — Your email address
                </li>
              </ul>
            </div>

            <FacebookLoginForBusinessButton
              onSuccess={handleStep1Success}
              onError={handleError}
            />

            <div className="info-note">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p>
                This is the first step. After connecting, you'll proceed to
                connect your WhatsApp Business Account.
              </p>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="step-panel">
            <div className="step-badge">Step 2 of 2</div>
            <h2>Connect WhatsApp Business</h2>
            <p>
              Now let's connect your WhatsApp Business Account and select a
              phone number.
            </p>

            {/* Show Step 1 completion status */}
            {step1Completed && (
              <div className="completion-status">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="completion-info">
                  <span className="completion-title">
                    Business Manager Connected
                  </span>
                  {facebookAccountName && (
                    <span className="completion-detail">
                      Logged in as {facebookAccountName}
                    </span>
                  )}
                  {businessManagers.length > 0 && (
                    <span className="completion-detail">
                      {businessManagers.length} Business Manager
                      {businessManagers.length > 1 ? "s" : ""} found
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="permission-info-box">
              <h4>What permissions are requested?</h4>
              <ul>
                <li>
                  <strong>whatsapp_business_management</strong> — Manage your
                  WhatsApp Business Account
                </li>
                <li>
                  <strong>whatsapp_business_messaging</strong> — Send and
                  receive WhatsApp messages
                </li>
              </ul>
            </div>

            <EmbeddedSignupButton
              onSuccess={handleStep2Success}
              onError={handleError}
            />

            <button onClick={handleReset} className="reset-button">
              ← Start Over
            </button>

            <div className="info-note">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p>
                Meta's popup will guide you through selecting your Business,
                WhatsApp Account, and phone number.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="faq-section">
        <h3>Frequently Asked Questions</h3>

        <div className="faq-item">
          <h4>Why are there two steps?</h4>
          <p>
            Meta requires separate authorizations for Business Manager access
            and WhatsApp access. This is the official, Meta-approved flow used
            by all WhatsApp Business Solution Providers (BSPs).
          </p>
        </div>

        <div className="faq-item">
          <h4>What if I don't have a Business Manager?</h4>
          <p>
            You need a Meta Business Manager at{" "}
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              business.facebook.com
            </a>{" "}
            before connecting.
          </p>
        </div>

        <div className="faq-item">
          <h4>Is this secure?</h4>
          <p>
            Yes! We use Meta's official OAuth flow and never see your Facebook
            password. Tokens are encrypted and you can revoke access anytime
            from your Meta settings.
          </p>
        </div>
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .two-step-flow {
    max-width: 700px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    color: #6c757d;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e9ecef;
    border-top-color: #1877f2;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .flow-header {
    text-align: center;
    margin-bottom: 40px;
  }

  .flow-header h1 {
    margin: 0 0 8px;
    font-size: 28px;
    font-weight: 700;
    color: #212529;
  }

  .flow-header p {
    margin: 0;
    color: #6c757d;
    font-size: 16px;
  }

  .steps-progress {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 32px;
  }

  .step-wrapper {
    display: flex;
    flex-direction: column;
  }

  .step-indicator {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 16px;
    border-radius: 12px;
    transition: all 0.3s ease;
  }

  .step-indicator.step-active {
    background: #e7f3ff;
  }

  .step-indicator.step-completed {
    background: #ecfdf5;
  }

  .step-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
    flex-shrink: 0;
  }

  .step-pending .step-circle {
    background: #e9ecef;
    color: #6c757d;
  }

  .step-active .step-circle {
    background: #1877f2;
    color: white;
    box-shadow: 0 0 0 4px rgba(24, 119, 242, 0.2);
  }

  .step-completed .step-circle {
    background: #10b981;
    color: white;
  }

  .step-info {
    flex: 1;
  }

  .step-title {
    font-weight: 600;
    font-size: 16px;
    color: #212529;
    margin-bottom: 4px;
  }

  .step-description {
    font-size: 14px;
    color: #6c757d;
  }

  .step-connector {
    width: 2px;
    height: 24px;
    background: #e9ecef;
    margin-left: 35px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 8px;
    color: #c33;
    margin-bottom: 24px;
  }

  .retry-button {
    margin-left: auto;
    padding: 6px 12px;
    background: #c33;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .step-content {
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .step-panel {
    padding: 32px;
  }

  .step-badge {
    display: inline-block;
    padding: 4px 12px;
    background: #e7f3ff;
    color: #1877f2;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .step-panel h2 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 600;
    color: #212529;
  }

  .step-panel > p {
    margin: 0 0 24px;
    color: #6c757d;
    font-size: 15px;
    line-height: 1.5;
  }

  .permission-info-box {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .permission-info-box h4 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #495057;
  }

  .permission-info-box ul {
    margin: 0;
    padding: 0 0 0 20px;
    font-size: 13px;
    color: #6c757d;
  }

  .permission-info-box li {
    margin-bottom: 8px;
  }

  .permission-info-box li:last-child {
    margin-bottom: 0;
  }

  .completion-status {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    background: #ecfdf5;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .completion-status svg {
    color: #10b981;
    flex-shrink: 0;
  }

  .completion-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .completion-title {
    font-weight: 600;
    color: #065f46;
    font-size: 14px;
  }

  .completion-detail {
    font-size: 13px;
    color: #059669;
  }

  .info-note {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: #f8f9fa;
    border-left: 3px solid #1877f2;
    border-radius: 4px;
    margin-top: 24px;
  }

  .info-note svg {
    flex-shrink: 0;
    color: #1877f2;
    margin-top: 2px;
  }

  .info-note p {
    margin: 0;
    font-size: 13px;
    color: #495057;
    line-height: 1.5;
  }

  .reset-button {
    display: inline-block;
    margin-top: 16px;
    padding: 8px 16px;
    background: none;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    color: #6c757d;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .reset-button:hover {
    background: #f8f9fa;
    color: #495057;
  }

  .faq-section {
    margin-top: 48px;
    padding-top: 32px;
    border-top: 1px solid #e9ecef;
  }

  .faq-section h3 {
    margin: 0 0 24px;
    font-size: 18px;
    font-weight: 600;
    color: #212529;
  }

  .faq-item {
    margin-bottom: 20px;
  }

  .faq-item h4 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: #495057;
  }

  .faq-item p {
    margin: 0;
    font-size: 14px;
    color: #6c757d;
    line-height: 1.6;
  }

  .faq-item a {
    color: #1877f2;
    text-decoration: none;
  }

  .faq-item a:hover {
    text-decoration: underline;
  }

  @media (max-width: 640px) {
    .two-step-flow {
      padding: 24px 16px;
    }

    .flow-header h1 {
      font-size: 24px;
    }

    .step-panel {
      padding: 24px;
    }

    .step-indicator {
      padding: 12px;
    }
  }
`;
