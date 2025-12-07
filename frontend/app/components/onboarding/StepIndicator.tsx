import React from "react";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepTitles: string[];
}

export default function StepIndicator({
  currentStep,
  totalSteps,
  stepTitles,
}: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      <div className="steps-container">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="step-item">
            <div className="step-line-wrapper">
              {step > 1 && (
                <div
                  className={`step-line ${
                    currentStep >= step ? "completed" : ""
                  }`}
                />
              )}
            </div>
            <div
              className={`step-circle ${
                currentStep > step
                  ? "completed"
                  : currentStep === step
                  ? "active"
                  : ""
              }`}
            >
              {currentStep > step ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M13.3333 4L6 11.3333L2.66667 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span>{step}</span>
              )}
            </div>
            <div className="step-label">
              <p className="step-title">{stepTitles[step - 1]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
