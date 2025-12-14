/**
 * WhatsApp Connection Flow Component
 * Complete flow for connecting a WhatsApp Business Account
 * Steps: Facebook Login → Business Manager → WABA → Phone Number
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FacebookLoginButton from './FacebookLoginButton';
import {
  MetaBusinessManager,
  MetaWhatsAppBusinessAccount,
  MetaPhoneNumber,
  QUALITY_RATING_COLORS,
  QUALITY_RATING_LABELS,
} from '@/types/facebook-whatsapp.types';

interface Step {
  id: number;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

export default function WhatsAppConnectionFlow() {
  const router = useRouter();
  
  // Connection flow state
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [businessManagers, setBusinessManagers] = useState<MetaBusinessManager[]>([]);
  const [selectedBusinessManager, setSelectedBusinessManager] = useState<MetaBusinessManager | null>(null);
  const [whatsappAccounts, setWhatsappAccounts] = useState<MetaWhatsAppBusinessAccount[]>([]);
  const [selectedWhatsAppAccount, setSelectedWhatsAppAccount] = useState<MetaWhatsAppBusinessAccount | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<MetaPhoneNumber[]>([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<MetaPhoneNumber | null>(null);

  // Steps
  const steps: Step[] = [
    { id: 1, title: 'Connect Facebook', status: currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : 'pending' },
    { id: 2, title: 'Select Business Manager', status: currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : 'pending' },
    { id: 3, title: 'Select WhatsApp Account', status: currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : 'pending' },
    { id: 4, title: 'Select Phone Number', status: currentStep === 4 ? 'active' : currentStep > 4 ? 'completed' : 'pending' },
  ];

  // Check existing connection on mount
  useEffect(() => {
    checkExistingConnection();
  }, []);

  const checkExistingConnection = async () => {
    try {
      const response = await fetch('/api/facebook/login');
      const data = await response.json();

      if (data.connected && data.account) {
        setFacebookConnected(true);
        setCurrentStep(2);
        // Fetch business managers
        await fetchBusinessManagers();
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  // Step 1: Handle Facebook Login
  const handleFacebookSuccess = async (data: {
    accessToken: string;
    userID: string;
    expiresIn: number;
    grantedPermissions: string[];
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/facebook/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setFacebookConnected(true);
        setCurrentStep(2);
        // Fetch business managers
        await fetchBusinessManagers();
      } else {
        setError(result.error || 'Failed to connect Facebook account');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to connect Facebook account');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Fetch Business Managers
  const fetchBusinessManagers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/facebook/business-managers');
      const result = await response.json();

      if (result.success && result.data) {
        setBusinessManagers(result.data);
        
        if (result.data.length === 0) {
          setError('No Business Managers found. Please create one in Meta Business Suite.');
        }
      } else {
        setError(result.error || 'Failed to fetch business managers');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch business managers');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Fetch WhatsApp Accounts
  const fetchWhatsAppAccounts = async (businessId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/facebook/whatsapp-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessId }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        setWhatsappAccounts(result.data);
        setCurrentStep(3);

        if (result.data.length === 0) {
          setError('No WhatsApp Business Accounts found. Please create one in Meta Business Suite.');
        }
      } else {
        setError(result.error || 'Failed to fetch WhatsApp accounts');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch WhatsApp accounts');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Fetch Phone Numbers
  const fetchPhoneNumbers = async (wabaId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/facebook/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wabaId }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        setPhoneNumbers(result.data);
        setCurrentStep(4);

        if (result.data.length === 0) {
          setError('No phone numbers found. Please add a phone number in Meta Business Suite.');
        }
      } else {
        setError(result.error || 'Failed to fetch phone numbers');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to fetch phone numbers');
    } finally {
      setIsLoading(false);
    }
  };

  // Final: Connect Phone Number
  const connectPhoneNumber = async () => {
    if (!selectedPhoneNumber || !selectedWhatsAppAccount) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/facebook/connect-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: selectedPhoneNumber.id,
          wabaId: selectedWhatsAppAccount.id,
          isPrimary: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Complete onboarding
        await fetch('/api/onboarding/complete', { method: 'POST' });
        
        // Redirect to dashboard
        router.push('/dashboard?connection=success');
      } else {
        setError(result.error || 'Failed to connect phone number');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to connect phone number');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBusinessManagerSelect = (bm: MetaBusinessManager) => {
    setSelectedBusinessManager(bm);
    fetchWhatsAppAccounts(bm.id);
  };

  const handleWhatsAppAccountSelect = (waba: MetaWhatsAppBusinessAccount) => {
    setSelectedWhatsAppAccount(waba);
    fetchPhoneNumbers(waba.id);
  };

  const handlePhoneNumberSelect = (phone: MetaPhoneNumber) => {
    setSelectedPhoneNumber(phone);
  };

  return (
    <div className="whatsapp-connection-flow">
      {/* Progress Steps */}
      <div className="steps-header">
        {steps.map((step, index) => (
          <div key={step.id} className="step-item-wrapper">
            <div className={`step-item step-${step.status}`}>
              <div className="step-number">
                {step.status === 'completed' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <div className="step-title">{step.title}</div>
            </div>
            {index < steps.length - 1 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-close">×</button>
        </div>
      )}

      {/* Step Content */}
      <div className="step-content">
        {currentStep === 1 && (
          <div className="step-panel">
            <h2>Connect Your Facebook Account</h2>
            <p>To use WhatsApp Business API, we need to connect to your Facebook account that has access to your Business Manager.</p>
            
            <FacebookLoginButton
              onSuccess={handleFacebookSuccess}
              onError={setError}
              disabled={isLoading}
            />
          </div>
        )}

        {currentStep === 2 && (
          <div className="step-panel">
            <h2>Select Business Manager</h2>
            <p>Choose the Business Manager that contains your WhatsApp Business Account.</p>

            {isLoading ? (
              <div className="loading">Loading business managers...</div>
            ) : businessManagers.length > 0 ? (
              <div className="selection-grid">
                {businessManagers.map((bm) => (
                  <button
                    key={bm.id}
                    className={`selection-card ${selectedBusinessManager?.id === bm.id ? 'selected' : ''}`}
                    onClick={() => handleBusinessManagerSelect(bm)}
                  >
                    <div className="selection-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                      </svg>
                    </div>
                    <div className="selection-info">
                      <div className="selection-name">{bm.name}</div>
                      <div className="selection-id">ID: {bm.id}</div>
                    </div>
                    {selectedBusinessManager?.id === bm.id && (
                      <div className="selection-check">✓</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">No business managers found</div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="step-panel">
            <h2>Select WhatsApp Business Account</h2>
            <p>Choose the WhatsApp Business Account you want to connect.</p>

            {isLoading ? (
              <div className="loading">Loading WhatsApp accounts...</div>
            ) : whatsappAccounts.length > 0 ? (
              <div className="selection-grid">
                {whatsappAccounts.map((waba) => (
                  <button
                    key={waba.id}
                    className={`selection-card ${selectedWhatsAppAccount?.id === waba.id ? 'selected' : ''}`}
                    onClick={() => handleWhatsAppAccountSelect(waba)}
                  >
                    <div className="selection-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </div>
                    <div className="selection-info">
                      <div className="selection-name">{waba.name}</div>
                      <div className="selection-meta">
                        {waba.quality_rating && (
                          <span 
                            className="quality-badge"
                            style={{ 
                              backgroundColor: QUALITY_RATING_COLORS[waba.quality_rating],
                              color: 'white'
                            }}
                          >
                            {QUALITY_RATING_LABELS[waba.quality_rating]}
                          </span>
                        )}
                        {waba.account_review_status && (
                          <span className="status-badge">{waba.account_review_status}</span>
                        )}
                      </div>
                    </div>
                    {selectedWhatsAppAccount?.id === waba.id && (
                      <div className="selection-check">✓</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">No WhatsApp accounts found</div>
            )}

            <button onClick={() => setCurrentStep(2)} className="back-button">
              ← Back to Business Managers
            </button>
          </div>
        )}

        {currentStep === 4 && (
          <div className="step-panel">
            <h2>Select Phone Number</h2>
            <p>Choose the phone number you want to use for sending messages.</p>

            {isLoading ? (
              <div className="loading">Loading phone numbers...</div>
            ) : phoneNumbers.length > 0 ? (
              <div className="selection-grid">
                {phoneNumbers.map((phone) => (
                  <button
                    key={phone.id}
                    className={`selection-card ${selectedPhoneNumber?.id === phone.id ? 'selected' : ''}`}
                    onClick={() => handlePhoneNumberSelect(phone)}
                  >
                    <div className="selection-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                      </svg>
                    </div>
                    <div className="selection-info">
                      <div className="selection-name">{phone.display_phone_number}</div>
                      <div className="selection-id">{phone.verified_name}</div>
                      {phone.quality_rating && (
                        <span 
                          className="quality-badge"
                          style={{ 
                            backgroundColor: QUALITY_RATING_COLORS[phone.quality_rating],
                            color: 'white'
                          }}
                        >
                          {QUALITY_RATING_LABELS[phone.quality_rating]}
                        </span>
                      )}
                    </div>
                    {selectedPhoneNumber?.id === phone.id && (
                      <div className="selection-check">✓</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">No phone numbers found</div>
            )}

            <div className="action-buttons">
              <button onClick={() => setCurrentStep(3)} className="back-button">
                ← Back
              </button>
              <button
                onClick={connectPhoneNumber}
                disabled={!selectedPhoneNumber || isLoading}
                className="connect-button"
              >
                {isLoading ? 'Connecting...' : 'Complete Connection'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .whatsapp-connection-flow {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .steps-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
          position: relative;
        }

        .step-item-wrapper {
          display: flex;
          align-items: center;
          flex: 1;
        }

        .step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          position: relative;
          z-index: 1;
        }

        .step-number {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.3s ease;
        }

        .step-pending .step-number {
          background: #e9ecef;
          color: #6c757d;
        }

        .step-active .step-number {
          background: #1877f2;
          color: white;
          box-shadow: 0 0 0 4px rgba(24, 119, 242, 0.2);
        }

        .step-completed .step-number {
          background: #10b981;
          color: white;
        }

        .step-title {
          font-size: 13px;
          color: #6c757d;
          text-align: center;
          white-space: nowrap;
        }

        .step-active .step-title {
          color: #212529;
          font-weight: 600;
        }

        .step-connector {
          flex: 1;
          height: 2px;
          background: #e9ecef;
          margin: 0 8px;
          margin-bottom: 28px;
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

        .error-close {
          margin-left: auto;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #c33;
        }

        .step-content {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 32px;
        }

        .step-panel h2 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #212529;
        }

        .step-panel > p {
          margin: 0 0 24px 0;
          color: #6c757d;
          font-size: 14px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #6c757d;
        }

        .selection-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .selection-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: #f8f9fa;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .selection-card:hover {
          background: #e9ecef;
          transform: translateY(-2px);
        }

        .selection-card.selected {
          background: #e7f3ff;
          border-color: #1877f2;
        }

        .selection-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          background: white;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1877f2;
        }

        .selection-info {
          flex: 1;
          min-width: 0;
        }

        .selection-name {
          font-weight: 600;
          color: #212529;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .selection-id {
          font-size: 12px;
          color: #6c757d;
          font-family: monospace;
        }

        .selection-meta {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .quality-badge,
        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .status-badge {
          background: #e9ecef;
          color: #495057;
        }

        .selection-check {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          background: #1877f2;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #6c757d;
        }

        .action-buttons {
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin-top: 24px;
        }

        .back-button {
          padding: 10px 20px;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          color: #495057;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .back-button:hover {
          background: #f8f9fa;
        }

        .connect-button {
          padding: 12px 32px;
          background: #1877f2;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-left: auto;
        }

        .connect-button:hover:not(:disabled) {
          background: #166fe5;
          transform: translateY(-1px);
        }

        .connect-button:disabled {
          background: #ccc;
          cursor: not-allowed;
          opacity: 0.6;
        }

        @media (max-width: 768px) {
          .steps-header {
            overflow-x: auto;
            padding-bottom: 10px;
          }

          .step-title {
            font-size: 11px;
          }

          .selection-grid {
            grid-template-columns: 1fr;
          }

          .action-buttons {
            flex-direction: column;
          }

          .connect-button {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
}

