export interface RecommendedTemplate {
  id: string;
  name: string;
  displayName: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  description: string;
  useCase: string;

  // Header
  hasHeader: boolean;
  headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText?: string;

  // Body
  body: string;
  bodyExamples?: string[];

  // Footer
  hasFooter: boolean;
  footer?: string;

  // Buttons
  hasButtons: boolean;
  buttons?: Array<{
    type: "URL" | "PHONE_NUMBER" | "QUICK_REPLY";
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export const RECOMMENDED_TEMPLATES: RecommendedTemplate[] = [
  // ==================== AUTHENTICATION TEMPLATES ====================
  {
    id: "auth_otp_verification",
    name: "otp_verification_code",
    displayName: "OTP Verification",
    category: "AUTHENTICATION",
    language: "en",
    description: "One-time password for account verification",
    useCase: "Send OTP codes for login, signup, or transaction verification",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🔐 Verification Code",
    body: "Your verification code is {{1}}. This code will expire in {{2}} minutes. Please do not share this code with anyone for security reasons.",
    bodyExamples: ["123456", "5"],
    hasFooter: true,
    footer: "This is an automated message. Please do not reply.",
    hasButtons: false,
  },
  {
    id: "auth_account_verification",
    name: "account_verification_link",
    displayName: "Account Verification",
    category: "AUTHENTICATION",
    language: "en",
    description: "Email/phone verification for new accounts",
    useCase: "Verify user accounts during registration",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "Welcome to Our Platform! 🎉",
    body: "Hi {{1}}, thank you for signing up! Please verify your account to get started. Your verification will be complete once you click the button below.",
    bodyExamples: ["John"],
    hasFooter: true,
    footer: "Need help? Contact our support team.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Verify Account",
        url: "https://example.com/verify",
      },
    ],
  },
  {
    id: "auth_password_reset",
    name: "password_reset_request",
    displayName: "Password Reset",
    category: "AUTHENTICATION",
    language: "en",
    description: "Secure password reset link",
    useCase: "Send password reset links to users",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🔑 Password Reset Request",
    body: "Hi {{1}}, we received a request to reset your password. Click the button below to create a new password. This link will expire in {{2}} hours. If you didn't request this, please ignore this message.",
    bodyExamples: ["Sarah", "24"],
    hasFooter: true,
    footer: "For security, never share your password with anyone.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Reset Password",
        url: "https://example.com/reset",
      },
    ],
  },
  {
    id: "auth_login_alert",
    name: "new_login_detected",
    displayName: "Login Alert",
    category: "AUTHENTICATION",
    language: "en",
    description: "Security alert for new device login",
    useCase: "Notify users of login attempts from new devices",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🔔 New Login Detected",
    body: "Hi {{1}}, we detected a new login to your account from {{2}} on {{3}}. If this was you, you can safely ignore this message. If you don't recognize this activity, please secure your account immediately.",
    bodyExamples: ["Alex", "Chrome on Windows", "Jan 4, 2026 12:30 PM"],
    hasFooter: true,
    footer: "Your security is our priority.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Review Activity",
        url: "https://example.com/security",
      },
      {
        type: "QUICK_REPLY",
        text: "This was me",
      },
    ],
  },
  {
    id: "auth_2fa_setup",
    name: "two_factor_authentication_setup",
    displayName: "2FA Setup",
    category: "AUTHENTICATION",
    language: "en",
    description: "Two-factor authentication setup confirmation",
    useCase: "Confirm 2FA activation on user accounts",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "✅ 2FA Enabled Successfully",
    body: "Hi {{1}}, two-factor authentication has been successfully enabled on your account. Your account is now more secure. You'll need to enter a verification code along with your password when logging in.",
    bodyExamples: ["Michael"],
    hasFooter: true,
    footer: "Keep your backup codes in a safe place.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "View Backup Codes",
        url: "https://example.com/backup-codes",
      },
    ],
  },

  // ==================== UTILITY TEMPLATES ====================
  {
    id: "util_appointment_reminder",
    name: "appointment_reminder_notification",
    displayName: "Appointment Reminder",
    category: "UTILITY",
    language: "en",
    description: "Reminder for upcoming appointments",
    useCase: "Send appointment reminders to clients",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "📅 Appointment Reminder",
    body: "Hi {{1}}, this is a friendly reminder about your appointment scheduled for {{2}} at {{3}}. We look forward to seeing you! Please arrive 10 minutes early.",
    bodyExamples: ["Emma", "January 5, 2026", "2:00 PM"],
    hasFooter: true,
    footer: "Need to reschedule? Contact us anytime.",
    hasButtons: true,
    buttons: [
      {
        type: "QUICK_REPLY",
        text: "Confirm",
      },
      {
        type: "PHONE_NUMBER",
        text: "Call Us",
        phone_number: "+1234567890",
      },
    ],
  },
  {
    id: "util_order_confirmation",
    name: "order_confirmation_receipt",
    displayName: "Order Confirmation",
    category: "UTILITY",
    language: "en",
    description: "Confirmation of successful order placement",
    useCase: "Confirm customer orders with order details",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "✅ Order Confirmed!",
    body: "Thank you {{1}}! Your order #{{2}} has been confirmed. Total amount: {{3}}. Estimated delivery: {{4}}. We'll send you tracking information once your order ships.",
    bodyExamples: ["David", "ORD-12345", "$149.99", "Jan 8-10, 2026"],
    hasFooter: true,
    footer: "Questions? We're here to help 24/7.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Track Order",
        url: "https://example.com/track",
      },
      {
        type: "URL",
        text: "View Receipt",
        url: "https://example.com/receipt",
      },
    ],
  },
  {
    id: "util_shipping_update",
    name: "shipping_status_update",
    displayName: "Shipping Update",
    category: "UTILITY",
    language: "en",
    description: "Real-time shipping status updates",
    useCase: "Keep customers informed about delivery status",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "📦 Your Order is On The Way!",
    body: "Great news {{1}}! Your order #{{2}} has been shipped and is on its way. Tracking number: {{3}}. Expected delivery: {{4}}.",
    bodyExamples: ["Lisa", "ORD-67890", "TRK1234567890", "Jan 6, 2026"],
    hasFooter: true,
    footer: "Track your package in real-time.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Track Package",
        url: "https://example.com/track",
      },
    ],
  },
  {
    id: "util_payment_receipt",
    name: "payment_confirmation_receipt",
    displayName: "Payment Receipt",
    category: "UTILITY",
    language: "en",
    description: "Payment confirmation and receipt",
    useCase: "Send payment confirmations and digital receipts",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "💳 Payment Received",
    body: "Hi {{1}}, we've received your payment of {{2}} for invoice #{{3}}. Payment method: {{4}}. Transaction ID: {{5}}. Thank you for your business!",
    bodyExamples: [
      "Robert",
      "$299.00",
      "INV-2026-001",
      "Visa ending in 4242",
      "TXN-ABC123",
    ],
    hasFooter: true,
    footer: "Keep this receipt for your records.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Download Receipt",
        url: "https://example.com/receipt",
      },
    ],
  },
  {
    id: "util_booking_confirmation",
    name: "booking_confirmation_details",
    displayName: "Booking Confirmation",
    category: "UTILITY",
    language: "en",
    description: "Confirmation for reservations and bookings",
    useCase: "Confirm hotel, restaurant, or service bookings",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🎫 Booking Confirmed!",
    body: "Hi {{1}}, your booking is confirmed! Reservation #{{2}} for {{3}} on {{4}} at {{5}}. We're excited to host you!",
    bodyExamples: [
      "Jennifer",
      "RES-789",
      "2 guests",
      "Jan 10, 2026",
      "7:30 PM",
    ],
    hasFooter: true,
    footer: "See you soon!",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "View Booking",
        url: "https://example.com/booking",
      },
      {
        type: "QUICK_REPLY",
        text: "Add to Calendar",
      },
    ],
  },
  {
    id: "util_delivery_notification",
    name: "delivery_completed_notification",
    displayName: "Delivery Notification",
    category: "UTILITY",
    language: "en",
    description: "Notification when order is delivered",
    useCase: "Notify customers of successful delivery",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "✅ Delivered Successfully!",
    body: "Hi {{1}}, your order #{{2}} has been delivered to {{3}} at {{4}}. We hope you enjoy your purchase! Please rate your delivery experience.",
    bodyExamples: ["Chris", "ORD-45678", "123 Main St", "3:45 PM"],
    hasFooter: true,
    footer: "Thank you for choosing us!",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Rate Experience",
        url: "https://example.com/rate",
      },
      {
        type: "QUICK_REPLY",
        text: "Report Issue",
      },
    ],
  },

  // ==================== MARKETING TEMPLATES ====================
  {
    id: "mkt_flash_sale",
    name: "flash_sale_announcement",
    displayName: "Flash Sale Alert",
    category: "MARKETING",
    language: "en",
    description: "Limited-time flash sale promotion",
    useCase: "Announce time-sensitive sales and promotions",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "⚡ FLASH SALE - Limited Time!",
    body: "Hi {{1}}! Get {{2}} off everything! Use code {{3}} at checkout. Hurry, this offer ends in {{4}} hours! Shop now and save big on your favorite items.",
    bodyExamples: ["Jessica", "30%", "FLASH30", "6"],
    hasFooter: true,
    footer: "Terms and conditions apply. While supplies last.",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Shop Now",
        url: "https://example.com/sale",
      },
    ],
  },
  {
    id: "mkt_new_product_launch",
    name: "new_product_announcement",
    displayName: "New Product Launch",
    category: "MARKETING",
    language: "en",
    description: "Announce new product releases",
    useCase: "Introduce new products to customers",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🚀 New Arrival Alert!",
    body: "Hi {{1}}! Introducing {{2}} - our latest innovation designed just for you! Be among the first to experience {{3}}. Available now with exclusive launch pricing!",
    bodyExamples: [
      "Amanda",
      "Premium Wireless Earbuds",
      "crystal-clear sound and all-day comfort",
    ],
    hasFooter: true,
    footer: "Limited stock available. Order today!",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Learn More",
        url: "https://example.com/new",
      },
      {
        type: "URL",
        text: "Pre-Order Now",
        url: "https://example.com/preorder",
      },
    ],
  },
  {
    id: "mkt_exclusive_offer",
    name: "vip_exclusive_offer",
    displayName: "Exclusive VIP Offer",
    category: "MARKETING",
    language: "en",
    description: "Special offers for valued customers",
    useCase: "Reward loyal customers with exclusive deals",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "👑 Exclusive Offer Just For You!",
    body: "Hi {{1}}, as a valued customer, you're getting exclusive early access to our {{2}} sale! Enjoy {{3}} off with code {{4}}. This VIP offer is valid until {{5}}.",
    bodyExamples: [
      "Daniel",
      "Summer Collection",
      "40%",
      "VIP40",
      "Jan 15, 2026",
    ],
    hasFooter: true,
    footer: "You're special to us. Thank you for your loyalty!",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Shop VIP Sale",
        url: "https://example.com/vip",
      },
    ],
  },
  {
    id: "mkt_event_invitation",
    name: "special_event_invitation",
    displayName: "Event Invitation",
    category: "MARKETING",
    language: "en",
    description: "Invite customers to special events",
    useCase: "Promote webinars, launches, or in-store events",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🎉 You're Invited!",
    body: "Hi {{1}}! Join us for {{2}} on {{3}} at {{4}}. Experience {{5}} and connect with fellow enthusiasts. RSVP now to secure your spot!",
    bodyExamples: [
      "Sophia",
      "our exclusive product showcase",
      "Jan 20, 2026",
      "6:00 PM",
      "live demos, special discounts, and refreshments",
    ],
    hasFooter: true,
    footer: "Limited seats available. Register today!",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "RSVP Now",
        url: "https://example.com/rsvp",
      },
      {
        type: "QUICK_REPLY",
        text: "Add to Calendar",
      },
    ],
  },
  {
    id: "mkt_seasonal_promotion",
    name: "seasonal_sale_campaign",
    displayName: "Seasonal Promotion",
    category: "MARKETING",
    language: "en",
    description: "Holiday and seasonal sale campaigns",
    useCase: "Promote seasonal sales and holiday offers",
    hasHeader: true,
    headerType: "TEXT",
    headerText: "🎊 Seasonal Sale is Here!",
    body: "Hi {{1}}! Celebrate {{2}} with amazing deals! Save up to {{3}} on select items. Use code {{4}} for an extra discount. Don't miss out on these festive savings!",
    bodyExamples: ["Oliver", "the New Year", "50%", "NEWYEAR2026"],
    hasFooter: true,
    footer: "Offer valid while supplies last. Happy shopping!",
    hasButtons: true,
    buttons: [
      {
        type: "URL",
        text: "Browse Deals",
        url: "https://example.com/seasonal",
      },
    ],
  },
];

// Helper function to get templates by category
export const getTemplatesByCategory = (
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION"
): RecommendedTemplate[] => {
  return RECOMMENDED_TEMPLATES.filter((t) => t.category === category);
};

// Helper function to search templates
export const searchTemplates = (query: string): RecommendedTemplate[] => {
  const lowerQuery = query.toLowerCase();
  return RECOMMENDED_TEMPLATES.filter(
    (t) =>
      t.displayName.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.useCase.toLowerCase().includes(lowerQuery)
  );
};
