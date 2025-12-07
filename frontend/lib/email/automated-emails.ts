/**
 * Automated Email Triggers
 *
 * This file contains helper functions for sending automated emails
 * triggered by user actions (signup, password reset, etc.)
 */

import { sendEmail } from "./resend";
import { generateEmailHtml } from "./email-templates";

/**
 * Send welcome email to a new user
 * Called automatically when a user signs up
 */
export async function sendWelcomeEmail(email: string, userName: string) {
  try {
    const html = generateEmailHtml("welcome", {
      userName,
      userEmail: email,
    });

    if (!html) {
      console.error("Failed to generate welcome email HTML");
      return { success: false, error: "Failed to generate email template" };
    }

    const result = await sendEmail({
      to: email,
      subject: "Welcome to ReviseIt! 🎉",
      html,
    });

    return result;
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send custom announcement to a user
 */
export async function sendAnnouncementEmail(
  email: string,
  userName: string,
  title: string,
  message: string
) {
  try {
    const html = generateEmailHtml("announcement", {
      userName,
      userEmail: email,
      title,
      message,
    });

    if (!html) {
      return { success: false, error: "Failed to generate email template" };
    }

    const result = await sendEmail({
      to: email,
      subject: title,
      html,
    });

    return result;
  } catch (error: any) {
    console.error("Error sending announcement email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send newsletter to a user
 */
export async function sendNewsletterEmail(
  email: string,
  userName: string,
  message: string
) {
  try {
    const html = generateEmailHtml("newsletter", {
      userName,
      userEmail: email,
      message,
    });

    if (!html) {
      return { success: false, error: "Failed to generate email template" };
    }

    const result = await sendEmail({
      to: email,
      subject: "Newsletter from ReviseIt",
      html,
    });

    return result;
  } catch (error: any) {
    console.error("Error sending newsletter email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send custom email with any template
 */
export async function sendCustomEmail(
  email: string,
  subject: string,
  templateName: string,
  templateData: Record<string, any>
) {
  try {
    const html = generateEmailHtml(templateName, templateData);

    if (!html) {
      return { success: false, error: "Failed to generate email template" };
    }

    const result = await sendEmail({
      to: email,
      subject,
      html,
    });

    return result;
  } catch (error: any) {
    console.error("Error sending custom email:", error);
    return { success: false, error: error.message };
  }
}
