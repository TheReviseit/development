"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// Simple inline icons to avoid external dependencies
const XIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const DownloadIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const SmartphoneIcon = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
    <line x1="12" y1="18" x2="12.01" y2="18"></line>
  </svg>
);

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user already dismissed the prompt (don't show again for 7 days)
    const dismissedAt = localStorage.getItem("pwa-prompt-dismissed");
    if (dismissedAt) {
      const dismissedDate = new Date(dismissedAt);
      const now = new Date();
      const daysDiff =
        (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < 7) {
        return;
      }
    }

    // Detect iOS
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // Show iOS-specific install instructions after a delay
      const timer = setTimeout(() => {
        // Check if running in standalone mode
        if (
          !(
            "standalone" in navigator &&
            (navigator as unknown as { standalone?: boolean }).standalone
          )
        ) {
          setShowPrompt(true);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Capture the beforeinstallprompt event for Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show the install prompt after a short delay (better UX)
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    // Check if app was installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      console.log("PWA was installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the browser's install prompt
    deferredPrompt.prompt();

    // Wait for user choice
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the install prompt`);

    if (outcome === "accepted") {
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-prompt-dismissed", new Date().toISOString());
  };

  // Don't render if installed or not showing
  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div className="pwa-install-overlay">
      <div className="pwa-install-prompt">
        <button
          className="pwa-close-btn"
          onClick={handleDismiss}
          aria-label="Close"
        >
          <XIcon />
        </button>

        <div className="pwa-content">
          <div className="pwa-icon">
            <img
              src="/logo.svg"
              alt="ReviseIt Logo"
              width="50"
              height="50"
              style={{ borderRadius: "12px" }}
            />
          </div>

          <div className="pwa-text">
            <h3>Install ReviseIt App</h3>
            <p>
              Get the full app experience! Install ReviseIt for quick access,
              offline support, and a native-like experience.
            </p>
          </div>

          {isIOS ? (
            <div className="pwa-ios-instructions">
              <p>
                <strong>To install on iOS:</strong>
              </p>
              <ol>
                <li>
                  Tap the <strong>Share</strong> button{" "}
                  <span className="share-icon"></span>
                </li>
                <li>
                  Scroll down and tap{" "}
                  <strong>&quot;Add to Home Screen&quot;</strong>
                </li>
                <li>
                  Tap <strong>&quot;Add&quot;</strong> to confirm
                </li>
              </ol>
            </div>
          ) : (
            <div className="pwa-actions">
              <button className="pwa-install-btn" onClick={handleInstallClick}>
                <DownloadIcon />
                Install App
              </button>
              <button className="pwa-later-btn" onClick={handleDismiss}>
                Maybe Later
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .pwa-install-overlay {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 9999;
          padding: 16px;
          animation: slideUp 0.4s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .pwa-install-prompt {
          position: relative;
          background: #000000;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 -4px 30px rgba(34, 193, 90, 0.15),
            0 10px 40px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(34, 193, 90, 0.2);
          max-width: 420px;
          margin: 0 auto;
        }

        .pwa-close-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #cccccc;
          transition: all 0.2s ease;
        }

        .pwa-close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }

        .pwa-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 16px;
        }

        .pwa-icon {
          width: 70px;
          height: 70px;
          background: transparent;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .pwa-text h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #ffffff;
        }

        .pwa-text p {
          margin: 8px 0 0;
          font-size: 0.9rem;
          color: #cccccc;
          line-height: 1.5;
        }

        .pwa-actions {
          display: flex;
          gap: 12px;
          width: 100%;
          margin-top: 8px;
        }

        .pwa-install-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          background: linear-gradient(135deg, #22c15a 0%, #1da14c 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(34, 193, 90, 0.3);
        }

        .pwa-install-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 193, 90, 0.4);
        }

        .pwa-install-btn:active {
          transform: translateY(0);
        }

        .pwa-later-btn {
          padding: 14px 20px;
          background: transparent;
          color: #cccccc;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pwa-later-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .pwa-ios-instructions {
          text-align: left;
          background: rgba(255, 255, 255, 0.05);
          padding: 16px;
          border-radius: 12px;
          width: 100%;
        }

        .pwa-ios-instructions p {
          margin: 0 0 12px;
          font-size: 0.9rem;
          color: #ffffff;
        }

        .pwa-ios-instructions ol {
          margin: 0;
          padding-left: 20px;
        }

        .pwa-ios-instructions li {
          margin-bottom: 8px;
          font-size: 0.85rem;
          color: #cccccc;
          line-height: 1.5;
        }

        .share-icon {
          font-size: 1rem;
        }

        @media (max-width: 480px) {
          .pwa-install-overlay {
            padding: 12px;
          }

          .pwa-install-prompt {
            padding: 20px;
          }

          .pwa-actions {
            flex-direction: column;
          }

          .pwa-later-btn {
            order: 1;
          }
        }
      `}</style>
    </div>
  );
}
