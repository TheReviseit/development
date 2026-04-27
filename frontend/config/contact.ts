/**
 * Contact Configuration Constants
 * 
 * Centralized contact information configuration used across the application.
 * This ensures consistency and makes updates easier.
 * 
 * @module config/contact
 * @production-grade
 */

/**
 * Contact information interface
 */
export interface ContactConfig {
  /** Primary contact email */
  email: string;
  /** Support email (if different from primary) */
  supportEmail?: string;
  /** Sales email (if different from primary) */
  salesEmail?: string;
  /** Primary phone number (E.164 format) */
  phone: string;
  /** Formatted phone number for display */
  phoneFormatted: string;
  /** WhatsApp business number (if different from phone) */
  whatsapp?: string;
  /** Physical address */
  address?: {
    street?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    /** Full formatted address */
    full: string;
  };
  /** Business hours */
  businessHours?: {
    timezone: string;
    schedule: string;
  };
  /** Company legal name */
  legalName?: string;
  /** Company display name */
  companyName: string;
}

/**
 * Default contact configuration
 * 
 * NOTE: In production, sensitive values should come from environment variables
 * or a secure configuration service.
 */
export const CONTACT_CONFIG: ContactConfig = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@flowauxi.com',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@flowauxi.com',
  salesEmail: process.env.NEXT_PUBLIC_SALES_EMAIL,
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || '+916383634873',
  phoneFormatted: process.env.NEXT_PUBLIC_CONTACT_PHONE_FORMATTED || '+91 6383634873',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '+916383634873',
  address: {
    city: 'Tirunelveli',
    state: 'Tamil Nadu',
    postalCode: '627428',
    country: 'India',
    full: process.env.NEXT_PUBLIC_ADDRESS || 'Tirunelveli, Tamil Nadu 627428, India',
  },
  businessHours: {
    timezone: 'IST (UTC+5:30)',
    schedule: 'Monday to Friday, 9 AM to 6 PM IST',
  },
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME || 'SIVASANKARA BOOPATHY RAJA RAMAN',
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Flowauxi',
};

/**
 * Get mailto link for email
 */
export const getMailtoLink = (email?: string, subject?: string, body?: string): string => {
  const targetEmail = email || CONTACT_CONFIG.email;
  const params = new URLSearchParams();
  if (subject) params.append('subject', subject);
  if (body) params.append('body', body);
  const queryString = params.toString();
  return `mailto:${targetEmail}${queryString ? `?${queryString}` : ''}`;
};

/**
 * Get tel link for phone
 */
export const getTelLink = (phone?: string): string => {
  return `tel:${phone || CONTACT_CONFIG.phone}`;
};

/**
 * Get WhatsApp chat link
 */
export const getWhatsAppLink = (phone?: string, message?: string): string => {
  const targetPhone = (phone || CONTACT_CONFIG.whatsapp || CONTACT_CONFIG.phone).replace(/\D/g, '');
  const baseUrl = 'https://wa.me/';
  const params = message ? `?text=${encodeURIComponent(message)}` : '';
  return `${baseUrl}${targetPhone}${params}`;
};

/**
 * Contact form configuration
 */
export const CONTACT_FORM_CONFIG = {
  /** Web3Forms API endpoint */
  apiEndpoint: 'https://api.web3forms.com/submit',
  /** Access key (should be from env in production) */
  accessKey: process.env.NEXT_PUBLIC_WEB3FORMS_KEY || '',
  /** Success message */
  successMessage: 'Thank you for contacting us! We\'ll get back to you soon.',
  /** Error message */
  errorMessage: 'Something went wrong. Please try again.',
  /** Network error message */
  networkErrorMessage: 'Failed to send message. Please check your connection and try again.',
  /** Validation messages */
  validation: {
    nameRequired: 'Name is required',
    emailRequired: 'Email is required',
    emailInvalid: 'Please enter a valid email',
    phoneRequired: 'Phone number is required',
    phoneInvalid: 'Please enter a valid phone number',
    subjectRequired: 'Subject is required',
    messageRequired: 'Message is required',
    messageMinLength: 'Message must be at least 10 characters',
  },
};

/**
 * Contact section themes
 */
export type ContactTheme = 'default' | 'booking' | 'minimal' | 'dark';

/**
 * Contact section props
 */
export interface ContactSectionProps {
  /** Theme variant */
  theme?: ContactTheme;
  /** Custom CSS class */
  className?: string;
  /** Section ID for anchor links */
  id?: string;
  /** Whether to show contact info cards */
  showContactInfo?: boolean;
  /** Form source for analytics tracking */
  source?: 'landing' | 'dashboard' | 'shop' | 'booking' | 'footer';
}
