// Types for Invoice data
export interface InvoiceItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string;
  size?: string;
  color?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  orderId: string;
  date: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  shipping: number;
  total: number;
  paymentStatus: "paid" | "pending" | "cod";
  paymentMethod?: string;
}

export interface BusinessInfo {
  name: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  address?: string;
  storeSlug?: string;
  brandColor?: string;
}

/**
 * Ensures a URL is absolute for email clients.
 * if starts with http/https, returns as is.
 * otherwise prepends the site base URL.
 */
function getAbsoluteUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  // Fallback to a base URL env var or a hardcoded one if not present
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flowauxi.com";
  // remove leading slash if base url has trailing slash, etc. logic can be added
  // for now simple concatenation
  return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Generate HTML string for email
 * This creates inline-styled HTML that works well in email clients
 */
export function generateInvoiceEmailHTML(
  invoice: InvoiceData,
  business: BusinessInfo,
): string {
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getPaymentLabel = () => {
    // Check payment method first (takes precedence over status)
    if (invoice.paymentMethod === "cod") {
      return "CASH ON DELIVERY";
    }
    if (
      invoice.paymentMethod === "online" &&
      invoice.paymentStatus === "paid"
    ) {
      return "PAID ONLINE";
    }
    // Fallback to status-based logic for backward compatibility
    switch (invoice.paymentStatus) {
      case "paid":
        return "PAID ONLINE";
      case "pending":
        return "PAYMENT PENDING";
      case "cod":
        return "CASH ON DELIVERY";
      default:
        return "PAYMENT PENDING";
    }
  };

  // Use brand color for payment badge if available, otherwise fallback
  const brandColor = business.brandColor || "#22c55e";

  // Header styles based on brand color
  const headerBg = brandColor;
  const headerText = "white";
  const headerDetailText = "rgba(255,255,255,0.9)";

  const businessLogoUrl = getAbsoluteUrl(business.logoUrl);
  const trackOrderUrl = `https://flowauxi.com/store/${business.storeSlug || "demo"}/track-order`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(trackOrderUrl)}`;

  const itemsHTML = invoice.items
    .map((item, index) => {
      const itemImageUrl = getAbsoluteUrl(item.imageUrl);
      return `
      <tr>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; text-align: center; color: #666; font-size: 13px;">${index + 1}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${
              itemImageUrl
                ? `<img src="${itemImageUrl}" alt="${item.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;" />`
                : `<div style="width: 40px; height: 40px; background: #f5f5f5; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;">📦</div>`
            }
            <div>
              <div style="font-weight: 600; color: #1a1a1a; font-size: 14px;">${item.name}</div>
              ${
                item.color || item.size
                  ? `<div style="font-size: 12px; color: #888; margin-top: 2px;">${item.color ? `Color: ${item.color}` : ""}${item.color && item.size ? " • " : ""}${item.size ? `Size: ${item.size}` : ""}</div>`
                  : ""
              }
            </div>
          </div>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; text-align: center; font-weight: 600; color: #1a1a1a;">${item.quantity}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #666;">${formatPrice(item.price)}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: 700; color: #1a1a1a;">${formatPrice(item.price * item.quantity)}</td>
      </tr>
    `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${invoice.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: ${headerBg}; padding: 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: top;">
                    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 800; color: ${headerText};">${business.name}</h1>
                     ${business.phone ? `<p style="margin: 0; font-size: 13px; color: ${headerText};">${business.phone}</p>` : ""}
                     ${business.address ? `<p style="margin: 2px 0 0; font-size: 13px; color: ${headerDetailText};">${business.address}</p>` : ""}
                  </td>
                  <td style="vertical-align: top; text-align: right; width: 80px;">
                    ${
                      businessLogoUrl
                        ? `<img src="${businessLogoUrl}" alt="${business.name}" style="width: 70px; height: 70px; object-fit: contain; border-radius: 12px; background: white; padding: 4px;" />`
                        : `<div style="width: 70px; height: 70px; background: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: ${brandColor}; font-size: 28px; font-weight: 800;">${business.name.charAt(0).toUpperCase()}</div>`
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Customer Info -->
          <tr>
            <td style="padding: 24px 32px;">
              <div style="font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Bill To</div>
              <p style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #1a1a1a;">${invoice.customer.name}</p>
              <p style="margin: 0 0 4px; font-size: 13px; color: #666;">${invoice.customer.phone}</p>
              ${invoice.customer.email ? `<p style="margin: 0 0 4px; font-size: 13px; color: #666;">${invoice.customer.email}</p>` : ""}
              <p style="margin: 0; font-size: 13px; color: #666;">${invoice.customer.address}</p>
            </td>
          </tr>
          
          <!-- Items Table -->
          <tr>
            <td style="padding: 0 32px 24px;">
              
              <!-- Invoice Meta -->
              <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                 <div style="background: ${brandColor}; color: white; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);">INVOICE</div>
                 <div style="font-size: 13px; color: #888;">
                    <span style="font-weight: 600; color: #1a1a1a;">#${invoice.invoiceNumber}</span> • ${formatDate(invoice.date)}
                 </div>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f0f0f0; border-radius: 12px; overflow: hidden;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 14px 8px; text-align: center; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; width: 50px;">S.No</th>
                    <th style="padding: 14px 8px; text-align: left; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                    <th style="padding: 14px 8px; text-align: center; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; width: 50px;">Qty</th>
                    <th style="padding: 14px 8px; text-align: right; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; width: 80px;">Price</th>
                    <th style="padding: 14px 8px; text-align: right; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; width: 90px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML}
                </tbody>
              </table>
            </td>
          </tr>
          
          <!-- Totals & QR Section -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- QR Code (Left) -->
                  <td width="40%" valign="bottom" style="padding-bottom: 4px;"> 
                    <div style="text-align: center; width: 120px;">
                        <p style="margin: 0 0 8px; font-size: 10px; font-weight: 700; color: #1a1a1a; text-transform: uppercase;">TRACK YOUR ORDER HERE</p>
                        <img src="${qrCodeUrl}" width="120" height="120" style="display: block; width: 120px; height: 120px; mix-blend-mode: multiply;" />
                        <div style="margin: 8px 0; font-size: 10px; font-weight: 600; color: #999; display: flex; align-items: center; justify-content: center; gap: 6px;">
                           <span style="display: inline-block; height: 1px; width: 20px; background: #e5e5e5;"></span> OR <span style="display: inline-block; height: 1px; width: 20px; background: #e5e5e5;"></span>
                        </div>
                        <a href="${trackOrderUrl}" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;">Click here</a>
                    </div>
                  </td>
                  
                  <!-- Totals Box (Right) -->
                  <td width="60%" valign="top">
                    <div style="background: #f9fafb; border-radius: 12px; padding: 20px 24px; margin-left: auto; max-width: 260px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="padding: 6px 0; font-size: 14px; color: #666;">Subtotal</td>
                            <td style="padding: 6px 0; font-size: 14px; color: #1a1a1a; text-align: right;">${formatPrice(invoice.subtotal)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-size: 14px; color: #666;">Shipping</td>
                            <td style="padding: 6px 0; font-size: 14px; text-align: right; ${invoice.shipping === 0 ? "color: #22c55e; font-weight: 600;" : "color: #1a1a1a;"}">${invoice.shipping === 0 ? "FREE" : formatPrice(invoice.shipping)}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="padding: 12px 0 8px;">
                            <div style="height: 1px; background: #e0e0e0;"></div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; font-size: 18px; font-weight: 800; color: #1a1a1a;">Total</td>
                            <td style="padding: 4px 0; font-size: 18px; font-weight: 800; color: #1a1a1a; text-align: right;">${formatPrice(invoice.total)}</td>
                        </tr>
                        </table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 0 32px 32px; border-top: 1px solid #f0f0f0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                <tr>
                  <td>
                    <span style="display: block; font-size: 11px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">Mode of Payment</span>
                    <span style="display: inline-block; background: ${brandColor}; color: white; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; letter-spacing: 0.5px;">${getPaymentLabel()}</span>
                    <span style="display: block; margin-top: 8px; font-size: 12px; color: #888;">Order ID: ${invoice.orderId}</span>
                  </td>
                  <td style="text-align: right; vertical-align: bottom;">
                    <p style="margin: 0; font-size: 14px; color: #1a1a1a; font-weight: 600;">Thank you for your order! <span style="color: #ef4444;">❤</span></p>
                    <a href="https://flowauxi.com" style="display: block; margin-top: 8px; font-size: 11px; color: #888; text-decoration: none;">Powered by <span style="color: #1a1a1a; font-weight: 700;">Flowauxi</span></a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        
        <!-- Footer Text -->
        <p style="margin: 24px 0 0; font-size: 12px; color: #888; text-align: center;">
          This invoice was generated by ${business.name}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
