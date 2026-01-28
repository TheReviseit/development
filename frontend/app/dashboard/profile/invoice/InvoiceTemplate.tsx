"use client";

import React from "react";
import styles from "./invoice.module.css";

import { InvoiceData, InvoiceItem, BusinessInfo } from "@/lib/invoice-utils";

interface InvoiceTemplateProps {
  invoice: InvoiceData;
  business: BusinessInfo;
  showActions?: boolean;
  onPrint?: () => void;
  onSendEmail?: () => void;
}

/**
 * InvoiceTemplate - Enterprise-level invoice component
 *
 * Features:
 * - Store logo on RIGHT side (as requested)
 * - Clean, professional design
 * - Product table with images
 * - Print-friendly
 * - Email-ready HTML generation
 */
export default function InvoiceTemplate({
  invoice,
  business,
  showActions = false,
  onPrint,
  onSendEmail,
}: InvoiceTemplateProps) {
  // Format price in INR
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Get payment status badge class
  const getPaymentStatusClass = () => {
    switch (invoice.paymentStatus) {
      case "paid":
        return styles.statusPaid;
      case "pending":
        return styles.statusPending;
      case "cod":
        return styles.statusCod;
      default:
        return styles.statusPending;
    }
  };

  // Get payment status label
  const getPaymentStatusLabel = () => {
    switch (invoice.paymentStatus) {
      case "paid":
        return "PAID";
      case "pending":
        return "PENDING";
      case "cod":
        return "CASH ON DELIVERY";
      default:
        return "PENDING";
    }
  };

  return (
    <div className={styles.invoiceContainer}>
      {/* Invoice Paper */}
      <div className={styles.invoicePaper} id="invoice-content">
        {/* Header - Store Name Left, Logo Right */}
        <header
          className={styles.invoiceHeader}
          style={{
            background: business.brandColor,
            margin: "-32px -32px 32px -32px",
            padding: "32px",
            borderRadius: "16px 16px 0 0",
          }}
        >
          <div className={styles.headerLeft}>
            <h1 className={styles.storeName} style={{ color: "white" }}>
              {business.name}
            </h1>
            {(business.phone || business.address) && (
              <div className={styles.storeDetails}>
                {business.phone && (
                  <p className={styles.storeDetail} style={{ color: "white" }}>
                    {business.phone}
                  </p>
                )}
                {business.address && (
                  <p
                    className={styles.storeDetail}
                    style={{ color: "rgba(255,255,255,0.9)" }}
                  >
                    {business.address}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className={styles.headerRight}>
            {business.logoUrl ? (
              <img
                src={business.logoUrl}
                alt={business.name}
                className={styles.storeLogo}
                style={{ background: "white" }}
              />
            ) : (
              <div
                className={styles.logoPlaceholder}
                style={{ background: "white" }}
              >
                <span style={{ color: business.brandColor }}>
                  {business.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Customer Info */}
        <section className={styles.customerSection}>
          <div className={styles.sectionTitle}>Bill To</div>
          <div className={styles.customerInfo}>
            <p className={styles.customerName}>{invoice.customer.name}</p>
            <p className={styles.customerDetail}>{invoice.customer.phone}</p>
            {invoice.customer.email && (
              <p className={styles.customerDetail}>{invoice.customer.email}</p>
            )}
            <p className={styles.customerDetail}>{invoice.customer.address}</p>
          </div>
        </section>

        {/* Products Table */}
        <section className={styles.itemsSection}>
          <div className={styles.invoiceMeta}>
            <div
              className={styles.invoiceLabel}
              style={{ background: business.brandColor }}
            >
              INVOICE
            </div>
            <div className={styles.invoiceDetails}>
              <span className={styles.invoiceNumber}>
                #{invoice.invoiceNumber}
              </span>
              <span className={styles.invoiceDate}>
                {formatDate(invoice.date)}
              </span>
            </div>
          </div>
          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th className={styles.thSerial}>S.No</th>
                <th className={styles.thProduct}>Product</th>
                <th className={styles.thQty}>Qty</th>
                <th className={styles.thPrice}>Price</th>
                <th className={styles.thTotal}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={item.id || index}>
                  <td className={styles.tdSerial}>{index + 1}</td>
                  <td className={styles.tdProduct}>
                    <div className={styles.productCell}>
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className={styles.productImage}
                        />
                      ) : (
                        <div className={styles.productImagePlaceholder}>
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="18"
                              height="18"
                              rx="2"
                              ry="2"
                            />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        </div>
                      )}
                      <div className={styles.productInfo}>
                        <span className={styles.productName}>{item.name}</span>
                        {(item.color || item.size) && (
                          <span className={styles.productVariant}>
                            {item.color && `Color: ${item.color}`}
                            {item.color && item.size && " • "}
                            {item.size && `Size: ${item.size}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={styles.tdQty}>{item.quantity}</td>
                  <td className={styles.tdPrice}>{formatPrice(item.price)}</td>
                  <td className={styles.tdTotal}>
                    {formatPrice(item.price * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Totals */}
        <section className={styles.totalsSection}>
          {/* QR Code Section - Moved aligned with Totals */}
          <div className={styles.qrSection}>
            <p className={styles.qrLabel}>Track your order here</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                `https://flowauxi.com/store/${business.storeSlug || "demo"}/track-order`,
              )}`}
              alt="Track Order QR"
              className={styles.qrCode}
            />
            <span className={styles.orText}>OR</span>
            <a
              href={`https://flowauxi.com/store/${business.storeSlug || "demo"}/track-order`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.qrLink}
            >
              Click here
            </a>
          </div>

          <div className={styles.totalsBox}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span>{formatPrice(invoice.subtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Shipping</span>
              <span
                className={invoice.shipping === 0 ? styles.freeShipping : ""}
              >
                {invoice.shipping === 0
                  ? "FREE"
                  : formatPrice(invoice.shipping)}
              </span>
            </div>
            <div className={styles.dividerThin} />
            <div className={`${styles.totalRow} ${styles.grandTotal}`}>
              <span>Total</span>
              <span>{formatPrice(invoice.total)}</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className={styles.invoiceFooter}>
          <div className={styles.footerLeft}>
            <div>
              <span className={styles.paymentLabel}>Mode of Payment</span>
              <div
                className={`${styles.paymentBadge} ${getPaymentStatusClass()}`}
                style={{
                  background: business.brandColor,
                  color: business.brandColor ? "white" : undefined,
                }}
              >
                {getPaymentStatusLabel()}
              </div>
            </div>
            <span className={styles.orderId}>Order ID: {invoice.orderId}</span>
          </div>
          <div className={styles.footerRight}>
            <p className={styles.thankYou}>
              Thank you for your order! <span className={styles.heart}>❤</span>
            </p>
            <a
              href="https://flowauxi.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.poweredBy}
            >
              <span>Powered by</span>
              <span className={styles.brandName}>
                Flowauxi
                <img
                  src="/logo.png"
                  alt="Flowauxi"
                  className={styles.brandLogo}
                />
              </span>
            </a>
          </div>
        </footer>
      </div>

      {/* Actions (Print, Send Email) */}
      {showActions && (
        <div className={styles.invoiceActions}>
          <button type="button" className={styles.actionBtn} onClick={onPrint}>
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
            Print / Download PDF
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={onSendEmail}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Send via Email
          </button>
        </div>
      )}
    </div>
  );
}

import { generateInvoiceEmailHTML } from "@/lib/invoice-utils";
