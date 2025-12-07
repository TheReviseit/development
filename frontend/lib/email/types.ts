// Email-related TypeScript types

export interface EmailTemplate {
  name: string;
  subject: string;
  generateHtml: (data: TemplateData) => string;
}

export interface TemplateData {
  userName?: string;
  userEmail?: string;
  message?: string;
  [key: string]: any;
}

export interface EmailRecipient {
  email: string;
  name?: string;
  userId?: string;
}

export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  templateName?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BulkEmailRequest {
  subject: string;
  message: string;
  templateName?: string;
  filters?: {
    role?: string;
    lastLoginAfter?: string;
    onboardingCompleted?: boolean;
  };
  testMode?: boolean; // If true, only sends to the requesting admin
}

export interface BulkEmailResponse {
  success: boolean;
  sentCount: number;
  failedCount: number;
  errors?: Array<{ email: string; error: string }>;
}

export interface EmailLog {
  id: string;
  sent_by: string;
  recipient_email: string;
  recipient_user_id?: string;
  subject: string;
  template_name?: string;
  status: "sent" | "failed" | "pending";
  error_message?: string;
  sent_at: string;
}
