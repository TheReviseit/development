"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { SocialMediaIcons } from "@/components/shared/SocialMediaIcons";
import { CONTACT_CONFIG, CONTACT_FORM_CONFIG } from "@/config/contact";
import styles from "./ShopGetInTouch.module.css";

/**
 * ShopGetInTouch Component (Route Group Version)
 * 
 * A production-grade contact section component that uses centralized
 * configuration for contact information and social media links.
 * 
 * @production-grade
 */

export default function ShopGetInTouch() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = CONTACT_FORM_CONFIG.validation.nameRequired;
    if (!formData.email.trim()) {
      newErrors.email = CONTACT_FORM_CONFIG.validation.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = CONTACT_FORM_CONFIG.validation.emailInvalid;
    }
    if (!formData.phone.trim()) {
      newErrors.phone = CONTACT_FORM_CONFIG.validation.phoneRequired;
    } else if (!/^\+?[\d\s\-()]+$/.test(formData.phone)) {
      newErrors.phone = CONTACT_FORM_CONFIG.validation.phoneInvalid;
    }
    if (!formData.subject.trim()) newErrors.subject = CONTACT_FORM_CONFIG.validation.subjectRequired;
    if (!formData.message.trim()) {
      newErrors.message = CONTACT_FORM_CONFIG.validation.messageRequired;
    } else if (formData.message.trim().length < 10) {
      newErrors.message = CONTACT_FORM_CONFIG.validation.messageMinLength;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: "" });

    try {
      const response = await fetch(CONTACT_FORM_CONFIG.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: CONTACT_FORM_CONFIG.accessKey,
          ...formData,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setSubmitStatus({
          type: "success",
          message: CONTACT_FORM_CONFIG.successMessage,
        });
        setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
      } else {
        setSubmitStatus({ type: "error", message: CONTACT_FORM_CONFIG.errorMessage });
      }
    } catch {
      setSubmitStatus({
        type: "error",
        message: CONTACT_FORM_CONFIG.networkErrorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (submitStatus.type) {
      const timer = setTimeout(() => setSubmitStatus({ type: null, message: "" }), 5000);
      return () => clearTimeout(timer);
    }
  }, [submitStatus.type]);

  return (
    <section id="contact" className={styles.section}>
      <div className={styles.inner}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Get in Touch</h2>
          <p className={styles.subtitle}>
            Have a question? We&apos;d love to hear from you. Send us a message
            and we&apos;ll respond as soon as possible.
          </p>
        </div>

        <div className={styles.grid}>
          {/* Contact Form */}
          <div className={styles.formContainer}>
            <div className={styles.formCard}>
              <h3 className={styles.formTitle}>Send us a Message</h3>
              <form onSubmit={handleSubmit} className={styles.form}>
                {submitStatus.type && (
                  <div className={`${styles.alert} ${styles[`alert_${submitStatus.type}`]}`}>
                    {submitStatus.message}
                  </div>
                )}

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="git-name" className={styles.formLabel}>Full Name</label>
                    <input
                      type="text"
                      id="git-name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className={`${styles.formInput} ${errors.name ? styles.inputError : ""}`}
                      placeholder="John Doe"
                    />
                    {errors.name && <span className={styles.errorMsg}>{errors.name}</span>}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="git-email" className={styles.formLabel}>Email Address</label>
                    <input
                      type="email"
                      id="git-email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`${styles.formInput} ${errors.email ? styles.inputError : ""}`}
                      placeholder="john@example.com"
                    />
                    {errors.email && <span className={styles.errorMsg}>{errors.email}</span>}
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="git-phone" className={styles.formLabel}>Phone Number</label>
                    <input
                      type="tel"
                      id="git-phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className={`${styles.formInput} ${errors.phone ? styles.inputError : ""}`}
                      placeholder="+91 98765 43210"
                    />
                    {errors.phone && <span className={styles.errorMsg}>{errors.phone}</span>}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="git-subject" className={styles.formLabel}>Subject</label>
                    <input
                      type="text"
                      id="git-subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className={`${styles.formInput} ${errors.subject ? styles.inputError : ""}`}
                      placeholder="How can we help?"
                    />
                    {errors.subject && <span className={styles.errorMsg}>{errors.subject}</span>}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="git-message" className={styles.formLabel}>Message</label>
                  <textarea
                    id="git-message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    className={`${styles.formTextarea} ${errors.message ? styles.inputError : ""}`}
                    placeholder="Tell us more about your inquiry..."
                    rows={6}
                  />
                  {errors.message && <span className={styles.errorMsg}>{errors.message}</span>}
                </div>

                <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className={styles.spinner} />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send Message
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Contact Info Cards */}
          <div className={styles.infoContainer}>
            <div className={styles.infoCard}>
              <div className={styles.infoIconWrap}>
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className={styles.infoCardImgWrap}>
                <Image src="/email.jpg" alt="Email contact" fill className={styles.infoCardImg} />
              </div>
              <h3 className={styles.infoTitle}>Email Us</h3>
              <p className={styles.infoText}>Our team is here to help you</p>
              <a
                href={`mailto:${CONTACT_CONFIG.email}`}
                className={styles.infoLink}
                aria-label={`Send email to ${CONTACT_CONFIG.email}`}
              >
                {CONTACT_CONFIG.email}
              </a>
            </div>

            <div className={`${styles.infoCard} ${styles.infoCardReverse}`}>
              <div className={styles.infoIconWrap}>
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div className={styles.infoCardImgWrap}>
                <Image src="/phone.jpg" alt="Call contact" fill className={styles.infoCardImg} />
              </div>
              <h3 className={styles.infoTitle}>Call Us</h3>
              <p className={styles.infoText}>{CONTACT_CONFIG.businessHours?.schedule}</p>
              <a
                href={`tel:${CONTACT_CONFIG.phone}`}
                className={styles.infoLink}
                aria-label={`Call ${CONTACT_CONFIG.phoneFormatted}`}
              >
                {CONTACT_CONFIG.phoneFormatted}
              </a>
            </div>

            <div className={styles.infoCard}>
              <div className={styles.infoIconWrap}>
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className={styles.infoCardImgWrap}>
                <Image src="/visit.jpg" alt="Visit contact" fill className={styles.infoCardImg} />
              </div>
              <h3 className={styles.infoTitle}>Visit Us</h3>
              <p className={styles.infoText}>Come say hello at our office</p>
              <p className={styles.infoAddress}>{CONTACT_CONFIG.address?.full}</p>
            </div>
          </div>

          {/* Social Links - Using centralized component */}
          <div className={styles.socialCard}>
            <h3 className={styles.socialTitle}>Follow Us</h3>
            <SocialMediaIcons 
              variant="minimal"
              size={24}
              className={styles.socialLinks}
              iconClassName={styles.socialLink}
              gap={12}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
