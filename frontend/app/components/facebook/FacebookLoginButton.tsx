/**
 * Facebook Login Button Component
 * Handles Facebook OAuth login and permission requests
 */

'use client';

import { useState, useEffect } from 'react';
import { facebookSDK } from '@/lib/facebook/facebook-sdk';
import {
  REQUIRED_FACEBOOK_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS_REQUIRING_REVIEW,
} from '@/types/facebook-whatsapp.types';

interface FacebookLoginButtonProps {
  onSuccess: (data: {
    accessToken: string;
    userID: string;
    expiresIn: number;
    grantedPermissions: string[];
  }) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function FacebookLoginButton({
  onSuccess,
  onError,
  disabled = false,
  className = '',
}: FacebookLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [showPermissionInfo, setShowPermissionInfo] = useState(false);

  useEffect(() => {
    // Initialize Facebook SDK
    facebookSDK
      .init()
      .then(() => {
        setSdkLoaded(true);
      })
      .catch((error) => {
        console.error('Failed to load Facebook SDK:', error);
        onError('Failed to load Facebook SDK');
      });
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);

    try {
      const result = await facebookSDK.login();

      if (result.success && result.accessToken && result.userID) {
        // Check if all required permissions were granted
        const missingPermissions = REQUIRED_FACEBOOK_PERMISSIONS.filter(
          (perm) => !result.grantedPermissions?.includes(perm)
        );

        if (missingPermissions.length > 0) {
          onError(
            `Missing required permissions: ${missingPermissions.join(', ')}. Please grant all permissions to continue.`
          );
          setIsLoading(false);
          return;
        }

        // Success
        onSuccess({
          accessToken: result.accessToken,
          userID: result.userID,
          expiresIn: result.expiresIn || 3600,
          grantedPermissions: result.grantedPermissions || [],
        });
      } else {
        onError(result.error || 'Login failed');
      }
    } catch (error: any) {
      onError(error.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="facebook-login-container">
      <button
        onClick={handleLogin}
        disabled={!sdkLoaded || isLoading || disabled}
        className={`facebook-login-button ${className}`}
        aria-label="Connect with Facebook"
      >
        {isLoading ? (
          <>
            <div className="spinner" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="facebook-icon"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Connect WhatsApp Business</span>
          </>
        )}
      </button>

      <button
        onClick={() => setShowPermissionInfo(!showPermissionInfo)}
        className="permission-info-toggle"
      >
        {showPermissionInfo ? 'Hide' : 'Show'} required permissions
      </button>

      {showPermissionInfo && (
        <div className="permission-info-panel">
          <h4>Required Permissions</h4>
          <p className="permission-info-description">
            To enable WhatsApp automation, we need the following permissions:
          </p>

          <ul className="permission-list">
            {REQUIRED_FACEBOOK_PERMISSIONS.map((permission) => (
              <li key={permission} className="permission-item">
                <div className="permission-name">{permission}</div>
                <div className="permission-description">
                  {PERMISSION_DESCRIPTIONS[permission]}
                </div>
                {PERMISSIONS_REQUIRING_REVIEW.includes(permission) && (
                  <span className="permission-badge">Requires Meta Review</span>
                )}
              </li>
            ))}
          </ul>

          <div className="permission-info-note">
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
              Your WhatsApp Business Account credentials remain secure. We only
              access data you explicitly authorize.
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        .facebook-login-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .facebook-login-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 12px 24px;
          background: #1877f2;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .facebook-login-button:hover:not(:disabled) {
          background: #166fe5;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(24, 119, 242, 0.3);
        }

        .facebook-login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .facebook-login-button:disabled {
          background: #ccc;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .facebook-icon {
          width: 24px;
          height: 24px;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .permission-info-toggle {
          align-self: center;
          background: none;
          border: none;
          color: #1877f2;
          font-size: 14px;
          cursor: pointer;
          text-decoration: underline;
          padding: 4px 8px;
        }

        .permission-info-toggle:hover {
          color: #166fe5;
        }

        .permission-info-panel {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 20px;
          margin-top: 8px;
        }

        .permission-info-panel h4 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
          color: #212529;
        }

        .permission-info-description {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #6c757d;
        }

        .permission-list {
          list-style: none;
          padding: 0;
          margin: 0 0 16px 0;
        }

        .permission-item {
          padding: 12px;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          margin-bottom: 8px;
        }

        .permission-name {
          font-size: 14px;
          font-weight: 600;
          color: #212529;
          margin-bottom: 4px;
          font-family: monospace;
        }

        .permission-description {
          font-size: 13px;
          color: #6c757d;
          margin-bottom: 4px;
        }

        .permission-badge {
          display: inline-block;
          padding: 2px 8px;
          background: #ffc107;
          color: #000;
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
          margin-top: 4px;
        }

        .permission-info-note {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: #e7f3ff;
          border-left: 3px solid #1877f2;
          border-radius: 4px;
        }

        .permission-info-note svg {
          flex-shrink: 0;
          color: #1877f2;
        }

        .permission-info-note p {
          margin: 0;
          font-size: 13px;
          color: #495057;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

