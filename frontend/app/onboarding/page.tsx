"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import BusinessInfoForm from "../components/onboarding/BusinessInfoForm";
import WhatsAppConnectionForm from "../components/onboarding/WhatsAppConnectionForm";
import MessagingSettingsForm from "../components/onboarding/MessagingSettingsForm";
import VerificationForm from "../components/onboarding/VerificationForm";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import "./onboarding.css";

const STEPS = [
  {
    id: 1,
    title: "Add organization details",
    subtitle: "Start your company data in Deep to",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 2,
    title: "Provide your tax details",
    subtitle: "Tax information",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    id: 3,
    title: "Configure your pay schedule",
    subtitle: "Payment settings",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 4,
    title: "Setup wallet details",
    subtitle: "Wallet configuration",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6m18 0V9M3 12V9m18 0a2 2 0 00-2-2H5a2 2 0 00-2 2m18 0l-3.879-4.879A2 2 0 0015.707 3H8.293a2 2 0 00-1.414.586L3 9" />
      </svg>
    ),
  },
];

const FORM_TITLES = [
  "Business Information",
  "WhatsApp Connection",
  "Messaging Settings",
  "Verification",
];

export default function OnboardingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);
  const router = useRouter();

  // Business Info State
  const [businessData, setBusinessData] = useState({
    businessName: "",
    category: "",
    website: "",
    address: "",
    logoUrl: "",
    description: "",
  });

  // WhatsApp Connection State
  const [whatsappData, setWhatsappData] = useState({
    providerType: "cloud_api",
    phoneNumber: "",
    phoneNumberId: "",
    businessIdMeta: "",
    apiToken: "",
  });

  // Messaging Settings State
  const [messagingData, setMessagingData] = useState({
    defaultSenderName: "",
    messagingCategory: "",
    timezone: "UTC",
    language: "English",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check if user already completed onboarding
        const response = await fetch("/api/onboarding/check");
        const data = await response.json();
        if (data.onboardingCompleted) {
          router.push("/dashboard");
          return;
        }
        setLoading(false);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleBusinessDataChange = (field: string, value: string) => {
    setBusinessData((prev) => ({ ...prev, [field]: value }));
  };

  const handleWhatsAppDataChange = (field: string, value: string) => {
    setWhatsappData((prev) => ({ ...prev, [field]: value }));
  };

  const handleMessagingDataChange = (field: string, value: string) => {
    setMessagingData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "business_logos");

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await response.json();
      setBusinessData((prev) => ({ ...prev, logoUrl: data.secure_url }));
    } catch (error) {
      console.error("Logo upload failed:", error);
      throw error;
    }
  };

  const validateStep = () => {
    switch (currentStep) {
      case 1:
        if (!businessData.businessName || !businessData.category) {
          alert("Please fill in all required fields");
          return false;
        }
        return true;
      case 2:
        if (!whatsappData.phoneNumber || !whatsappData.apiToken) {
          alert("Please fill in all required fields");
          return false;
        }
        return true;
      case 3:
        if (!messagingData.defaultSenderName || !messagingData.timezone) {
          alert("Please fill in all required fields");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const saveStepData = async () => {
    if (!user) return;

    try {
      switch (currentStep) {
        case 1:
          await fetch("/api/onboarding/business", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(businessData),
          });
          break;
        case 2:
          await fetch("/api/onboarding/whatsapp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(whatsappData),
          });
          break;
        case 3:
          await fetch("/api/onboarding/whatsapp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...whatsappData,
              ...messagingData,
            }),
          });
          break;
      }
    } catch (error) {
      console.error("Error saving data:", error);
    }
  };

  const handleNext = async () => {
    if (!validateStep()) return;

    await saveStepData();

    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = async () => {
    if (!user) return;

    setIsCompleting(true);
    try {
      // Mark onboarding as complete
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      alert("Failed to complete onboarding. Please try again.");
    } finally {
      setIsCompleting(false);
    }
  };

  if (loading) {
    return <SpaceshipLoader text="Loading" />;
  }

  const progressPercentage = (currentStep / 4) * 100;

  return (
    <div className="onboarding-container">
      {/* Left Sidebar */}
      <div className="onboarding-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Revise It Logo" />
          <span>Revise It</span>
        </div>

        <div className="sidebar-header">
          <h1>Get started</h1>
          <p className="sidebar-progress-text">
            Complete all the following steps {currentStep}/4
          </p>
        </div>

        <div className="sidebar-steps">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`sidebar-step ${
                currentStep === step.id
                  ? "active"
                  : currentStep > step.id
                  ? "completed"
                  : ""
              }`}
            >
              <div className="step-icon-wrapper">
                {step.icon}
                {currentStep > step.id && (
                  <div className="step-check">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="step-info">
                <h3 className="step-title">{step.title}</h3>
                <p className="step-subtitle">{step.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="onboarding-main">
        {/* Mobile Header - Only visible on mobile */}
        <div className="mobile-header">
          <img src="/logo.png" alt="Revise It Logo" />
          <span>Revise It</span>
        </div>

        {/* Progress Bar */}
        <div className="progress-bar-container">
          <div className="progress-bar-wrapper">
            <div className="progress-bar-label">
              <span>Progress</span>
              <span>{progressPercentage.toFixed(0)}%</span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="form-content-wrapper">
          <div className="form-card">
            <div className="form-header">
              <h2>{FORM_TITLES[currentStep - 1]}</h2>
              <p>
                {currentStep === 1 && "Tell us about your business"}
                {currentStep === 2 && "Connect your WhatsApp Business account"}
                {currentStep === 3 && "Configure your messaging preferences"}
                {currentStep === 4 &&
                  "Verify your setup and complete onboarding"}
              </p>
            </div>

            {currentStep === 1 && (
              <BusinessInfoForm
                data={businessData}
                onChange={handleBusinessDataChange}
                onLogoUpload={handleLogoUpload}
              />
            )}

            {currentStep === 2 && (
              <WhatsAppConnectionForm
                data={whatsappData}
                onChange={handleWhatsAppDataChange}
              />
            )}

            {currentStep === 3 && (
              <MessagingSettingsForm
                data={messagingData}
                onChange={handleMessagingDataChange}
              />
            )}

            {currentStep === 4 && (
              <VerificationForm
                onComplete={handleComplete}
                isCompleting={isCompleting}
              />
            )}

            {currentStep < 4 && (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                >
                  Save & Continue
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
