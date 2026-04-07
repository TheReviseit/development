/**
 * Contact Form API Client
 * Centralized submission logic with retry handling, error normalization, and logging
 */

export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export interface ContactFormSubmitOptions {
  accessKey?: string;
  source?: "landing" | "dashboard" | "shop";
  retryAttempts?: number;
  retryDelay?: number;
}

export interface ContactFormResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const DEFAULT_ACCESS_KEY = "a0f0556c-a204-4c99-96a8-a876893be26f";
const WEB3FORMS_API_URL = "https://api.web3forms.com/submit";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trackEvent(event: string, data?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", event, data);
  }
}

function logError(context: string, error: unknown): void {
  console.error(`[ContactAPI] ${context}:`, error);
}

export async function submitContactForm(
  data: ContactFormData,
  options: ContactFormSubmitOptions = {}
): Promise<ContactFormResponse> {
  const {
    accessKey = DEFAULT_ACCESS_KEY,
    source = "landing",
    retryAttempts = 3,
    retryDelay = 1000,
  } = options;

  trackEvent("form_submit", { source, ...data });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const response = await fetch(WEB3FORMS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: accessKey,
          name: data.name,
          email: data.email,
          phone: data.phone,
          subject: data.subject,
          message: data.message,
          ...(source !== "landing" && { subject: `[${source}] ${data.subject}` }),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        trackEvent("form_success", { source, ...data });
        return {
          success: true,
          message: result.message || "Thank you for contacting us! We'll get back to you soon.",
        };
      } else {
        logError("Submission failed", result);
        trackEvent("form_error", { source, error: result.message || "Unknown error", ...data });
        return {
          success: false,
          error: result.message || "Something went wrong. Please try again.",
        };
      }
    } catch (error) {
      lastError = error as Error;
      logError(`Attempt ${attempt} failed`, error);

      if (attempt < retryAttempts) {
        await sleep(retryDelay * attempt);
      }
    }
  }

  trackEvent("form_error", { source, error: lastError?.message || "All retries failed", ...data });
  return {
    success: false,
    error: lastError?.message || "Failed to send message. Please check your connection and try again.",
  };
}

export function getWhatsAppFallbackMessage(data: ContactFormData): string {
  const message = encodeURIComponent(
    `*Name:* ${data.name}\n*Email:* ${data.email}\n*Phone:* ${data.phone}\n*Subject:* ${data.subject}\n\n*Message:* ${data.message}`
  );
  return `https://wa.me/916383634873?text=${message}`;
}

export interface HoneypotCheckResult {
  isSpam: boolean;
  reason?: string;
}

export function validateHoneypot(honeypotValue: string): HoneypotCheckResult {
  if (honeypotValue && honeypotValue.length > 0) {
    return { isSpam: true, reason: "Bot detected" };
  }
  return { isSpam: false };
}

export function validateFormData(data: ContactFormData): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!data.name.trim()) {
    errors.name = "Name is required";
  }

  if (!data.email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Please enter a valid email";
  }

  if (!data.phone.trim()) {
    errors.phone = "Phone number is required";
  } else if (!/^\+?[\d\s\-()]+$/.test(data.phone)) {
    errors.phone = "Please enter a valid phone number";
  }

  if (!data.subject.trim()) {
    errors.subject = "Subject is required";
  }

  if (!data.message.trim()) {
    errors.message = "Message is required";
  } else if (data.message.trim().length < 10) {
    errors.message = "Message must be at least 10 characters";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}