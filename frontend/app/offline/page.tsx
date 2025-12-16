"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="offline-container">
      <div className="offline-content">
        <div className="offline-icon">
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className="offline-title">You&apos;re Offline</h1>

        <p className="offline-message">
          It looks like you&apos;ve lost your internet connection. Some features
          may not be available until you&apos;re back online.
        </p>

        <div className="offline-actions">
          <button
            onClick={() => window.location.reload()}
            className="retry-button"
          >
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
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Try Again
          </button>

          <Link href="/" className="home-link">
            Go to Homepage
          </Link>
        </div>
      </div>

      <style jsx>{`
        .offline-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: linear-gradient(135deg, #f8fffe 0%, #e8f5e9 100%);
        }

        .offline-content {
          text-align: center;
          max-width: 400px;
        }

        .offline-icon {
          width: 120px;
          height: 120px;
          margin: 0 auto 24px;
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 8px 30px rgba(238, 90, 90, 0.3);
        }

        .offline-title {
          font-size: 2rem;
          font-weight: 700;
          color: #1a1a2e;
          margin: 0 0 16px;
        }

        .offline-message {
          font-size: 1rem;
          color: #666;
          line-height: 1.6;
          margin: 0 0 32px;
        }

        .offline-actions {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
        }

        .retry-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
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

        .retry-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 193, 90, 0.4);
        }

        .home-link {
          color: #22c15a;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }

        .home-link:hover {
          color: #1da14c;
          text-decoration: underline;
        }

        @media (prefers-color-scheme: dark) {
          .offline-container {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          }

          .offline-title {
            color: #ffffff;
          }

          .offline-message {
            color: #aaa;
          }
        }
      `}</style>
    </div>
  );
}
