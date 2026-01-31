import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import { InvoiceData, BusinessInfo } from "./invoice-utils";

// Using built-in Helvetica font (no external font registration needed)

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 30,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    marginBottom: 20,
    padding: 20,
    marginLeft: -30,
    marginRight: -30,
    marginTop: -30,
    paddingLeft: 50,
    paddingRight: 50,
  },
  headerLeft: {
    flexGrow: 1,
  },
  headerRight: {
    width: 80,
    alignItems: "flex-end",
  },
  businessName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  headerDetail: {
    fontSize: 10,
    color: "white",
    opacity: 0.9,
    marginBottom: 2,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    objectFit: "contain",
    backgroundColor: "white",
    padding: 2,
  },
  logoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  logoPlaceholderText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 10,
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 1,
    fontWeight: "bold",
  },
  billToName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  billToDetail: {
    fontSize: 10,
    color: "#666",
    marginBottom: 2,
  },
  invoiceMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  invoiceBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  invoiceDate: {
    fontSize: 10,
    color: "#666",
  },
  table: {
    flexDirection: "column",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: "#f9fafb",
  },
  tableCellHeader: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#888",
    textTransform: "uppercase",
  },
  tableCell: {
    fontSize: 10,
    color: "#333",
  },
  colNo: { width: "8%", textAlign: "center" },
  colProduct: { width: "50%" },
  colQty: { width: "12%", textAlign: "center" },
  colPrice: { width: "15%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },

  productContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  productImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: "#f1f1f1",
    objectFit: "cover",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  productInfo: {
    justifyContent: "center",
  },
  productName: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  productVariant: {
    fontSize: 9,
    color: "#888",
  },

  footerSection: {
    flexDirection: "row",
    marginTop: 20,
  },
  qrSection: {
    width: "40%",
    alignItems: "center",
  },
  qrTitle: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  qrImage: {
    width: 100,
    height: 100,
  },
  orText: {
    fontSize: 9,
    color: "#999",
    marginVertical: 6,
    textAlign: "center",
  },
  clickButton: {
    backgroundColor: "black",
    color: "white",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    fontSize: 9,
    textDecoration: "none",
  },

  totalsSection: {
    width: "60%",
    paddingLeft: 20,
  },
  totalsBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalLabel: {
    fontSize: 10,
    color: "#666",
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#333",
    textAlign: "right", // Ensure visual alignment
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 8,
  },
  totalMainLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
  },
  totalMainValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
    textAlign: "right", // Ensure visual alignment
  },

  footer: {
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  paymentLabel: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 4,
  },
  paymentBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    color: "white",
    fontSize: 9,
    fontWeight: "bold",
    alignSelf: "flex-start",
  },
  orderId: {
    fontSize: 9,
    color: "#888",
    marginTop: 6,
  },
  footerRight: {
    textAlign: "right",
    justifyContent: "flex-end",
  },
  thankYou: {
    fontSize: 11,
    fontWeight: "bold",
  },
  poweredBy: {
    fontSize: 9,
    color: "#888",
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  flowauxiLogo: {
    width: 60,
    height: 20,
    marginLeft: 4,
  },
});

interface InvoicePDFProps {
  invoice: InvoiceData;
  business: BusinessInfo;
}

export const InvoiceDocument: React.FC<InvoicePDFProps> = ({
  invoice,
  business,
}) => {
  const brandColor = business.brandColor || "#22c55e";
  const trackOrderUrl = `https://flowauxi.com/store/${business.storeSlug || "demo"}/track-order`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(trackOrderUrl)}`;

  const formatPrice = (price: number) => {
    // Amazon India style - 100% reliable, no rendering bugs
    return `Rs. ${price.toLocaleString("en-IN")}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getPaymentLabel = () => {
    // Correct business logic: payment method takes precedence
    if (invoice.paymentMethod === "cod") {
      return "CASH ON DELIVERY";
    }

    if (invoice.paymentStatus === "paid") {
      return "PAID ONLINE";
    }

    return "PAYMENT PENDING";
  };

  const getPaymentBadgeColor = () => {
    if (invoice.paymentMethod === "cod") {
      return "#f59e0b"; // amber for COD
    }
    return brandColor; // green for paid
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: brandColor }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.businessName}>{business.name}</Text>
            {business.phone && (
              <Text style={styles.headerDetail}>{business.phone}</Text>
            )}
            {business.address && (
              <Text style={styles.headerDetail}>{business.address}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            {business.logoUrl ? (
              <Image src={business.logoUrl} style={styles.logo} />
            ) : (
              <View
                style={[styles.logoPlaceholder, { borderColor: brandColor }]}
              >
                <Text
                  style={[styles.logoPlaceholderText, { color: brandColor }]}
                >
                  {business.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.billToName}>{invoice.customer.name}</Text>
          <Text style={styles.billToDetail}>{invoice.customer.phone}</Text>
          {invoice.customer.email && (
            <Text style={styles.billToDetail}>{invoice.customer.email}</Text>
          )}
          <Text style={styles.billToDetail}>{invoice.customer.address}</Text>
        </View>

        {/* Meta Row */}
        <View style={styles.invoiceMeta}>
          <View style={[styles.invoiceBadge, { backgroundColor: brandColor }]}>
            <Text>INVOICE</Text>
          </View>
          <Text style={styles.invoiceDate}>
            #{invoice.invoiceNumber} • {formatDate(invoice.date)}
          </Text>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCellHeader, styles.colNo]}>S.No</Text>
            <Text style={[styles.tableCellHeader, styles.colProduct]}>
              Product
            </Text>
            <Text style={[styles.tableCellHeader, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableCellHeader, styles.colPrice]}>Price</Text>
            <Text style={[styles.tableCellHeader, styles.colTotal]}>Total</Text>
          </View>

          {invoice.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colNo]}>{index + 1}</Text>
              <View style={styles.colProduct}>
                <View style={styles.productContainer}>
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} style={styles.productImage} />
                  ) : (
                    <View
                      style={[
                        styles.productImage,
                        { justifyContent: "center", alignItems: "center" },
                      ]}
                    >
                      <Text style={{ fontSize: 12, color: "#999" }}>
                        {item.name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{item.name}</Text>
                    {(item.size || item.color) && (
                      <Text style={styles.productVariant}>
                        {item.color}
                        {item.color && item.size ? " • " : ""}
                        {item.size}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <Text style={[styles.tableCell, styles.colQty]}>
                {item.quantity}
              </Text>
              <Text style={[styles.tableCell, styles.colPrice]}>
                {formatPrice(item.price)}
              </Text>
              <Text style={[styles.tableCell, styles.colTotal]}>
                {formatPrice(item.price * item.quantity)}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer Section: QR | Totals */}
        <View style={styles.footerSection}>
          <View style={styles.qrSection}>
            <Text style={styles.qrTitle}>Track your order here</Text>
            <Image src={qrCodeUrl} style={styles.qrImage} />
            <Text style={styles.orText}>- OR -</Text>
            <Text style={styles.clickButton}>Click here (Scanner)</Text>
          </View>

          <View style={styles.totalsSection}>
            <View style={styles.totalsBox}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>
                  {formatPrice(invoice.subtotal)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Shipping</Text>
                <Text
                  style={[
                    styles.totalValue,
                    { color: invoice.shipping === 0 ? "#22c55e" : "#333" },
                  ]}
                >
                  {invoice.shipping === 0
                    ? "FREE"
                    : formatPrice(invoice.shipping)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalMainLabel}>Total</Text>
                <Text style={styles.totalMainValue}>
                  {formatPrice(invoice.total)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bottom Footer */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.paymentLabel}>Mode of Payment</Text>
            <View
              style={[
                styles.paymentBadge,
                { backgroundColor: getPaymentBadgeColor() },
              ]}
            >
              <Text>{getPaymentLabel()}</Text>
            </View>
            <Text style={styles.orderId}>Order ID: {invoice.orderId}</Text>
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.thankYou}>Thank you for your order!</Text>
            <View
              style={{
                flexDirection: "column",
                alignItems: "center",
                marginTop: 8,
                width: "100%",
              }}
            >
              <Text style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>
                Powered by
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "bold", color: "#1a1a1a" }}
                >
                  Flowauxi
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};
