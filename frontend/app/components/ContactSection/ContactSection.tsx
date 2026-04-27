"use client";

import Image from "next/image";
import ContactForm from "../ContactForm/ContactForm";
import { SocialMediaIcons } from "@/components/shared/SocialMediaIcons";
import { CONTACT_CONFIG, type ContactTheme } from "@/config/contact";
import "./ContactSection.css";

/**
 * ContactSection Component
 * 
 * A production-grade contact section that uses centralized configuration
 * for all contact information and social media links.
 * 
 * @production-grade
 */

interface ContactSectionProps {
  theme?: ContactTheme;
}

export default function ContactSection({ theme = "default" }: ContactSectionProps) {
  const isBookingTheme = theme === "booking";

  return (
    <section id="contact" className="contact-section">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Section Header */}
        <div className="contact-header">
          <h2 className="contact-main-title">Get in Touch</h2>
          <p className="contact-main-subtitle">
            Have a question? We&apos;d love to hear from you. Send us a message and
            we&apos;ll respond as soon as possible.
          </p>
        </div>

        <div className="contact-grid">
          {/* Contact Form */}
          <div className="contact-form-container">
            <div className="glass-card contact-form-card">
              <h3 className="contact-form-title">Send us a Message</h3>
              <ContactForm variant="inline" source="landing" />
            </div>
          </div>

          {/* Contact Information */}
          <div className="contact-info-container">
            <div className="contact-info-card glass-card">
              <div className="contact-info-icon-wrapper">
                <svg
                  className="contact-info-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="contact-card-image-container">
                <Image
                  src="/email.jpg"
                  alt="Email contact"
                  fill
                  className="contact-card-image"
                />
              </div>
              <h3 className="contact-info-title">Email Us</h3>
              <p className="contact-info-text">Our team is here to help you</p>
              <a
                href={`mailto:${CONTACT_CONFIG.email}`}
                className="contact-info-link"
                aria-label={`Send email to ${CONTACT_CONFIG.email}`}
              >
                {CONTACT_CONFIG.email}
              </a>
            </div>

            <div className="contact-info-card glass-card contact-card-reverse">
              <div className="contact-info-icon-wrapper">
                <svg
                  className="contact-info-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              </div>
              <div className="contact-card-image-container">
                <Image
                  src="/phone.jpg"
                  alt="Call contact"
                  fill
                  className="contact-card-image"
                />
              </div>
              <h3 className="contact-info-title">Call Us</h3>
              <p className="contact-info-text">
                {isBookingTheme ? 'Available for booking inquiries' : CONTACT_CONFIG.businessHours?.schedule}
              </p>
              <a
                href={`tel:${CONTACT_CONFIG.phone}`}
                className="contact-info-link"
                aria-label={`Call ${CONTACT_CONFIG.phoneFormatted}`}
              >
                {CONTACT_CONFIG.phoneFormatted}
              </a>
            </div>

            <div className="contact-info-card glass-card">
              <div className="contact-info-icon-wrapper">
                <svg
                  className="contact-info-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div className="contact-card-image-container">
                <Image
                  src="/visit.jpg"
                  alt="Visit contact"
                  fill
                  className="contact-card-image"
                />
              </div>
              <h3 className="contact-info-title">Visit Us</h3>
              <p className="contact-info-text">Come say hello at our office</p>
              <p className="contact-info-address">
                {CONTACT_CONFIG.address?.full}
              </p>
            </div>
          </div>

          {/* Social Links - Using centralized component */}
          <div className="contact-social-card glass-card">
            <h3 className="contact-social-title">Follow Us</h3>
            <SocialMediaIcons 
              variant="minimal"
              size={24}
              className="contact-social-links"
              iconClassName="contact-social-link"
              gap={12}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
