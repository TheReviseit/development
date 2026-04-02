"use client";

import Image from "next/image";
import ContactForm from "./ContactForm";

export interface ContactSectionProps {
  id?: string;
  className?: string;
  source?: "landing" | "dashboard" | "shop";
  theme?: "default" | "booking";
  showHeader?: boolean;
  showContactInfo?: boolean;
  showSocialLinks?: boolean;
}

export default function ContactSection({
  id = "contact",
  className = "",
  source = "landing",
  theme = "default",
  showHeader = true,
  showContactInfo = true,
  showSocialLinks = true,
}: ContactSectionProps) {
  const isBookingTheme = theme === "booking";

  return (
    <section id={id} className={`contact-section ${className} ${isBookingTheme ? "booking-contact-theme" : ""}`}>
      <div className="container mx-auto px-4 max-w-7xl">
        {showHeader && (
          <div className="contact-header">
            <h2 className="contact-main-title">Get in Touch</h2>
            <p className="contact-main-subtitle">
              Have a question? We&apos;d love to hear from you. Send us a message and
              we&apos;ll respond as soon as possible.
            </p>
          </div>
        )}

        <div className="contact-grid">
          {/* Contact Form */}
          <div className="contact-form-container">
            <div className="glass-card contact-form-card">
              <h3 className="contact-form-title">Send us a Message</h3>
              <ContactForm variant="inline" source={source} />
            </div>
          </div>

          {/* Contact Information */}
          {showContactInfo && (
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
                  href="mailto:contact@flowauxi.com"
                  className="contact-info-link"
                >
                  contact@flowauxi.com
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
                  Catch us Monday to Friday, between 9 AM and 6 PM IST — we&apos;ll be
                  there!
                </p>
                <a href="tel:+918123456789" className="contact-info-link">
                  +91 8438147100
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
                  Bangalore, Karnataka
                  <br />
                  India 560001
                </p>
              </div>
            </div>
          )}

          {/* Social Links */}
          {showSocialLinks && (
            <div className="contact-social-card glass-card">
              <h3 className="contact-social-title">Follow Us</h3>
              <div className="contact-social-links">
                <a
                  href="#linkedin"
                  className="contact-social-link"
                  aria-label="LinkedIn"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                </a>
                <a
                  href="#twitter"
                  className="contact-social-link"
                  aria-label="Twitter"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="#youtube"
                  className="contact-social-link"
                  aria-label="YouTube"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/flowauxi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-social-link"
                  aria-label="Instagram"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}