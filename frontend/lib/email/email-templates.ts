import { EmailTemplate, TemplateData } from "./types";

// Base email template with styling
const baseEmailHtml = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReviseIt</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #22c15a;
      margin-bottom: 10px;
    }
    .content {
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #000000;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e4;
      text-align: center;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">ReviseIt</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ReviseIt. All rights reserved.</p>
      <p>This email was sent from contact@reviseit.in</p>
    </div>
  </div>
</body>
</html>
`;

// Welcome email template
export const welcomeTemplate: EmailTemplate = {
  name: "welcome",
  subject: "Welcome to ReviseIt!",
  generateHtml: (data: TemplateData) => {
    const userName = data.userName || "there";
    const content = `
      <h1>Welcome to ReviseIt, ${userName}! 🎉</h1>
      <p>We're thrilled to have you on board. ReviseIt is here to help you achieve your goals.</p>
      <p>To get started, simply log in to your dashboard and explore our features.</p>
      <a href="https://reviseit.in/dashboard" class="button">Go to Dashboard</a>
      <p>If you have any questions, feel free to reach out to us at contact@reviseit.in</p>
    `;
    return baseEmailHtml(content);
  },
};

// Newsletter template
export const newsletterTemplate: EmailTemplate = {
  name: "newsletter",
  subject: "Newsletter from ReviseIt",
  generateHtml: (data: TemplateData) => {
    const userName = data.userName || "Valued User";
    const message = data.message || "Here's what's new with ReviseIt!";
    const content = `
      <h1>Hello ${userName}!</h1>
      <div style="margin: 20px 0;">
        ${message}
      </div>
      <p>Stay tuned for more updates!</p>
    `;
    return baseEmailHtml(content);
  },
};

// Custom message template
export const customTemplate: EmailTemplate = {
  name: "custom",
  subject: "Message from ReviseIt",
  generateHtml: (data: TemplateData) => {
    const message = data.message || "";
    const content = `
      <div style="margin: 20px 0;">
        ${message}
      </div>
    `;
    return baseEmailHtml(content);
  },
};

// Announcement template
export const announcementTemplate: EmailTemplate = {
  name: "announcement",
  subject: "Important Update from ReviseIt",
  generateHtml: (data: TemplateData) => {
    const title = data.title || "Important Announcement";
    const message = data.message || "";
    const content = `
      <h1>📢 ${title}</h1>
      <div style="margin: 20px 0; padding: 20px; background-color: #f0f9ff; border-left: 4px solid #2563eb; border-radius: 4px;">
        ${message}
      </div>
      <p>Thank you for being part of the ReviseIt community!</p>
    `;
    return baseEmailHtml(content);
  },
};

// Map of all available templates
export const emailTemplates: Record<string, EmailTemplate> = {
  welcome: welcomeTemplate,
  newsletter: newsletterTemplate,
  custom: customTemplate,
  announcement: announcementTemplate,
};

// Helper function to get template by name
export function getEmailTemplate(templateName: string): EmailTemplate | null {
  return emailTemplates[templateName] || null;
}

// Helper function to generate HTML from template
export function generateEmailHtml(
  templateName: string,
  data: TemplateData
): string | null {
  const template = getEmailTemplate(templateName);
  if (!template) {
    return null;
  }
  return template.generateHtml(data);
}
