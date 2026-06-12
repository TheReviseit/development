"use client";

/**
 * FeatureDifferenceModal — Premium Feature Changes Display
 * ========================================================
 *
 * Production-grade modal showing exactly what is included in the target plan.
 * Matches the pricing page exactly.
 *
 * Design: Glassmorphism backdrop, clean checklist styling
 */

import { useEffect, useRef } from "react";

interface FeatureDifferenceModalProps {
  planName: string;
  features: string[];
  onClose: () => void;
  domain?: string;
}

export default function FeatureDifferenceModal({
  planName,
  features,
  onClose,
}: FeatureDifferenceModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    
    // Prevent body scrolling while modal is open
    document.body.style.overflow = "hidden";
    
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const hasContent = features && features.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] font-[family-name:var(--font-jakarta)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-8 pt-8 pb-6 flex-none flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Everything in {planName}
            </h2>
            <p className="mt-2 text-sm text-gray-500 font-medium">
              A complete list of features included in this plan.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black bg-gray-50 hover:bg-gray-100 p-2.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
            aria-label="Close modal"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="px-8 pb-8 overflow-y-auto flex-1 custom-scrollbar">
          {hasContent ? (
            <ul className="space-y-4">
              {features.map((featureText, idx) => (
                <li
                  key={idx}
                  className="flex items-start group"
                >
                  <svg
                    className="h-5 w-5 text-black mr-3 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-gray-700 font-medium text-base leading-relaxed">
                    {featureText}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm font-medium">No features available.</p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-8 py-6 border-t border-gray-100 flex-none flex justify-end bg-white">
          <button
            onClick={onClose}
            className="bg-black text-white px-8 py-3.5 rounded-full text-sm font-bold tracking-wide hover:bg-gray-900 transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
          >
            Done
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
}
