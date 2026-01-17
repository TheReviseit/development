import { z } from "zod";

/**
 * Validation schemas for API requests
 * Using Zod for runtime type safety and input validation
 */

// User creation schema
export const createUserSchema = z.object({
  firebase_uid: z
    .string()
    .min(1, "Firebase UID is required")
    .max(128, "Firebase UID too long"),
  email: z
    .string()
    .email("Invalid email address")
    .transform((val) => val.toLowerCase().trim()),
  full_name: z.string().max(255, "Name too long").optional(),
  phone: z.string().max(20, "Phone number too long").optional(),
});

// Email sending schema
export const sendEmailSchema = z.object({
  to: z.union([
    z.string().email("Invalid email address"),
    z.array(z.string().email("Invalid email address")),
  ]),
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(998, "Subject too long"),
  html: z.string().optional(),
  templateName: z.string().optional(),
  templateData: z.record(z.string(), z.any()).optional(),
});

// Business onboarding schema
export const businessOnboardingSchema = z.object({
  businessName: z
    .string()
    .min(1, "Business name is required")
    .max(255, "Business name too long"),
  category: z.string().min(1, "Category is required"),
  website: z.union([z.string().url("Invalid URL"), z.literal("")]).optional(),
  address: z.string().max(500, "Address too long").optional(),
  logoUrl: z
    .union([z.string().url("Invalid logo URL"), z.literal("")])
    .optional(),
  description: z.string().max(1000, "Description too long").optional(),
});

// WhatsApp connection schema
export const whatsappConnectionSchema = z.object({
  provider_type: z.enum(["cloud_api", "gupshup", "twilio", "360dialog"]),
  phone_number: z.string().min(1, "Phone number is required"),
  phone_number_id: z.string().optional(),
  business_id_meta: z.string().optional(),
  api_token: z.string().min(1, "API token is required"),
  default_sender_name: z.string().min(1, "Sender name is required"),
  messaging_category: z.enum(["transactional", "marketing"]).optional(),
  test_number: z.string().optional(),
});

// Bulk email schema (already exists in send-bulk but centralizing here)
export const bulkEmailSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(1, "Message is required"),
  templateName: z.string().default("custom"),
  filters: z
    .object({
      role: z.string().optional(),
      onboardingCompleted: z.boolean().optional(),
    })
    .optional(),
  testMode: z.boolean().default(false),
});
