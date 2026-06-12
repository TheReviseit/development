"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import InvoiceTemplate from "./InvoiceTemplate";
import {
  InvoiceData,
  BusinessInfo,
  generateInvoiceEmailHTML,
} from "@/lib/invoice-utils";
import styles from "./invoicePreview.module.css";

interface InvoicePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceData;
  business: BusinessInfo;
  customerEmail?: string;
  onEmailSent?: () => void;
}

/**
 * InvoicePreview - Modal for viewing, printing, and emailing invoices
 *
 * Features:
 * - Full invoice preview
 * - Print / Download as PDF
 * - Send via email with Resend
 * - Show success/error states
 */
export default function InvoicePreview({
  isOpen,
  onClose,
  invoice,
  business,
  customerEmail,
  onEmailSent,
}: InvoicePreviewProps) {
  const [email, setEmail] = useState(
    customerEmail || invoice.customer.email || "",
  );
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSendStatus("idle");
      setErrorMessage("");
      setEmail(customerEmail || invoice.customer.email || "");
    }
  }, [isOpen, customerEmail, invoice.customer.email]);

  // Handle print
  const handlePrint = useCallback(() => {
    const printContent = document.getElementById("invoice-content");
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups for printing");
      return;
    }

    // Get styles
    const styles = Array.from(
      document.querySelectorAll("style, link[rel='stylesheet']"),
    )
      .map((el) => el.outerHTML)
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice #${invoice.invoiceNumber}</title>
          ${styles}
          <style>
            body { 
              margin: 0; 
              padding: 20px;
              background: white;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.outerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }, [invoice.invoiceNumber]);

  // Handle send email
  const handleSendEmail = async () => {
    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address");
      setSendStatus("error");
      return;
    }

    setSending(true);
    setSendStatus("idle");
    setErrorMessage("");

    try {
      // Generate HTML for email
      const emailHTML = generateInvoiceEmailHTML(invoice, business);

      const response = await fetch("/api/invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `Invoice #${invoice.invoiceNumber} from ${business.name}`,
          html: emailHTML,
          orderId: invoice.orderId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSendStatus("success");
        onEmailSent?.();
      } else {
        setSendStatus("error");
        setErrorMessage(result.error || "Failed to send email");
      }
    } catch (error) {
      console.error("Error sending invoice:", error);
      setSendStatus("error");
      setErrorMessage("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Handle resend
  const handleResend = () => {
    setSendStatus("idle");
    handleSendEmail();
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            Invoice #{invoice.invoiceNumber}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Invoice Content */}
        <div className={styles.modalBody} ref={invoiceRef}>
          <InvoiceTemplate
            invoice={invoice}
            business={business}
            showActions={false}
          />
        </div>

        {/* Footer with Actions */}
        <div className={styles.modalFooter}>
          {/* Email Section */}
          <div className={styles.emailSection}>
            <div className={styles.emailInputGroup}>
              <input
                type="email"
                placeholder="Enter email to send invoice"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.emailInput}
                disabled={sending}
              />

              {sendStatus === "success" ? (
                <button
                  type="button"
                  className={`${styles.sendBtn} ${styles.sendBtnSuccess}`}
                  onClick={handleResend}
                >
                  <RefreshCw size={16} />
                  Resend
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.sendBtn} ${sending ? styles.sendBtnLoading : ""}`}
                  onClick={handleSendEmail}
                  disabled={sending || !email}
                >
                  {sending ? (
                    <>
                      <Loader2 size={16} className={styles.spinner} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send Invoice
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Status Messages */}
            {sendStatus === "success" && (
              <div className={styles.statusSuccess}>
                <CheckCircle size={16} />
                Invoice sent successfully to {email}
              </div>
            )}
            {sendStatus === "error" && (
              <div className={styles.statusError}>
                <AlertCircle size={16} />
                {errorMessage}
              </div>
            )}
          </div>

          {/* Print Button */}
          <button
            type="button"
            className={styles.printBtn}
            onClick={handlePrint}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}
