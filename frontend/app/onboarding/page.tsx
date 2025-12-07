"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import StepIndicator from "../components/onboarding/StepIndicator";
import BusinessInfoForm from "../components/onboarding/BusinessInfoForm";
import WhatsAppConnectionForm from "../components/onboarding/WhatsAppConnectionForm";
import MessagingSettingsForm from "../components/onboarding/MessagingSettingsForm";
import VerificationForm from "../components/onboarding/VerificationForm";
import { v2 as cloudinary } from "cloudinary";
import "./onboarding.css";

const STEP_TITLES = [
  "Business Info",
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
        const response = await fetch("/api/onboarding/check", {
          headers: {
            "firebase-uid": currentUser.uid,
          },
        });
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
              "firebase-uid": user.uid,
            },
            body: JSON.stringify(businessData),
          });
          break;
        case 2:
          await fetch("/api/onboarding/whatsapp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "firebase-uid": user.uid,
            },
            body: JSON.stringify(whatsappData),
          });
          break;
        case 3:
          await fetch("/api/onboarding/whatsapp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "firebase-uid": user.uid,
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
          "firebase-uid": user.uid,
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
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="onboarding-container">
      <div className="onboarding-wrapper">
        <div className="onboarding-header">
          <div className="brand-tag">
            <img src="/logo.png" alt="Revise It Logo" width="24" height="24" />
            <span>Revise It</span>
          </div>
          <h1>Welcome! Let's set up your WhatsApp automation</h1>
        </div>

        <StepIndicator
          currentStep={currentStep}
          totalSteps={4}
          stepTitles={STEP_TITLES}
        />

        <div className="form-container">
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
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
