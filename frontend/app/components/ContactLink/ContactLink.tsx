"use client";

import React from "react";

interface ContactLinkProps {
  type: "email" | "phone";
  value: string;
  displayValue?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ContactLink - Production-grade reusable component for email and phone links
 * 
 * Features:
 * - Automatically generates mailto: and tel: links
 * - Handles display formatting (shows formatted number while linking correctly)
 * - Supports custom styling via className
 * - Supports custom children content
 * - Includes click tracking attributes for analytics
 * - Follows accessibility best practices
 * 
 * Usage:
 * <ContactLink type="email" value="contact@flowauxi.com" />
 * <ContactLink type="phone" value="+916383634873" displayValue="+91 6383634873" />
 */
export default function ContactLink({
  type,
  value,
  displayValue,
  className = "",
  children,
}: ContactLinkProps) {
  // Generate the appropriate href based on type
  const href = type === "email" ? `mailto:${value}` : `tel:${value}`;
  
  // Determine what to display
  const displayText = displayValue || value;
  
  // Accessibility label
  const ariaLabel = type === "email" 
    ? `Send email to ${displayText}` 
    : `Call ${displayText}`;

  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      data-contact-type={type}
      data-contact-value={value}
    >
      {children || displayText}
    </a>
  );
}

/**
 * Pre-configured contact information for Flowauxi
 * Use these constants to ensure consistency across the application
 */
export const FLOWAUXI_CONTACT = {
  email: {
    primary: "contact@flowauxi.com",
    support: "support@flowauxi.com",
    sales: "sales@flowauxi.com",
  },
  phone: {
    full: "+916383634873",
    formatted: "+91 6383634873",
    waMe: "916383634873",
  },
  address: {
    city: "Tirunelveli",
    state: "Tamil Nadu",
    pincode: "627428",
    country: "India",
    full: "Tirunelveli, Tamil Nadu 627428, India",
  },
} as const;

/**
 * Pre-styled contact link variants for common use cases
 */
export function EmailLink({
  email = FLOWAUXI_CONTACT.email.primary,
  className = "",
  children,
}: {
  email?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <ContactLink
      type="email"
      value={email}
      className={className}
    >
      {children || email}
    </ContactLink>
  );
}

export function PhoneLink({
  phone = FLOWAUXI_CONTACT.phone.full,
  formatted = FLOWAUXI_CONTACT.phone.formatted,
  className = "",
  children,
}: {
  phone?: string;
  formatted?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <ContactLink
      type="phone"
      value={phone}
      displayValue={formatted}
      className={className}
    >
      {children || formatted}
    </ContactLink>
  );
}

/**
 * Contact Info Card Component - Displays email, phone, and address together
 */
interface ContactInfoCardProps {
  showEmail?: boolean;
  showPhone?: boolean;
  showAddress?: boolean;
  emailClassName?: string;
  phoneClassName?: string;
  addressClassName?: string;
  wrapperClassName?: string;
}

export function ContactInfoCard({
  showEmail = true,
  showPhone = true,
  showAddress = true,
  emailClassName = "",
  phoneClassName = "",
  addressClassName = "",
  wrapperClassName = "",
}: ContactInfoCardProps) {
  return (
    <div className={wrapperClassName}>
      {showEmail && (
        <div className="contact-info-item">
          <span className="contact-info-label">Email:</span>{" "}
          <EmailLink className={emailClassName} />
        </div>
      )}
      {showPhone && (
        <div className="contact-info-item">
          <span className="contact-info-label">Phone:</span>{" "}
          <PhoneLink className={phoneClassName} />
        </div>
      )}
      {showAddress && (
        <div className={`contact-info-item ${addressClassName}`}>
          <span className="contact-info-label">Address:</span>{" "}
          {FLOWAUXI_CONTACT.address.full}
        </div>
      )}
    </div>
  );
}
