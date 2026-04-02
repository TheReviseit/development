import { useState, useCallback, useEffect } from "react";
import {
  submitContactForm,
  getWhatsAppFallbackMessage,
  validateHoneypot,
  validateFormData,
  type ContactFormData,
  type ContactFormSubmitOptions,
} from "@/lib/api/contact";

export interface ContactFormState {
  formData: ContactFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  submitStatus: {
    type: "success" | "error" | null;
    message: string;
  };
  honeypot: string;
}

export interface ContactFormHandlers {
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  resetForm: () => void;
  setFormData: React.Dispatch<React.SetStateAction<ContactFormData>>;
}

export interface UseContactFormOptions {
  defaultValues?: Partial<ContactFormData>;
  source?: "landing" | "dashboard" | "shop";
  onSuccess?: (data: ContactFormData) => void;
  onError?: (error: string) => void;
  accessKey?: string;
  autoDismissDelay?: number;
}

export interface UseContactFormReturn extends ContactFormState, ContactFormHandlers {}

const initialFormData: ContactFormData = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
};

export function useContactForm(options: UseContactFormOptions = {}): UseContactFormReturn {
  const {
    defaultValues,
    source = "landing",
    onSuccess,
    onError,
    accessKey,
    autoDismissDelay = 5000,
  } = options;

  const [formData, setFormData] = useState<ContactFormData>({
    ...initialFormData,
    ...defaultValues,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  const [honeypot, setHoneypot] = useState("");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;

      if (name === "honeypot") {
        setHoneypot(value);
        return;
      }

      setFormData((prev) => ({ ...prev, [name]: value }));
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    },
    [errors]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const honeypotCheck = validateHoneypot(honeypot);
      if (honeypotCheck.isSpam) {
        setSubmitStatus({
          type: "success",
          message: honeypotCheck.reason || "Message sent (spam protection)",
        });
        return;
      }

      const validation = validateFormData(formData);
      if (!validation.isValid) {
        setErrors(validation.errors);
        return;
      }

      setIsSubmitting(true);
      setSubmitStatus({ type: null, message: "" });

      const apiOptions: ContactFormSubmitOptions = {
        source,
        accessKey,
      };

      const result = await submitContactForm(formData, apiOptions);

      if (result.success) {
        setSubmitStatus({
          type: "success",
          message: result.message || "Thank you for contacting us! We'll get back to you soon.",
        });
        setFormData({ ...initialFormData });
        onSuccess?.(formData);
      } else {
        setSubmitStatus({
          type: "error",
          message: result.error || "Something went wrong. Please try again.",
        });
        onError?.(result.error || "Submission failed");
      }

      setIsSubmitting(false);
    },
    [formData, honeypot, source, accessKey, onSuccess, onError]
  );

  const resetForm = useCallback(() => {
    setFormData({ ...initialFormData });
    setErrors({});
    setSubmitStatus({ type: null, message: "" });
    setHoneypot("");
  }, []);

  useEffect(() => {
    if (submitStatus.type) {
      const timer = setTimeout(() => {
        setSubmitStatus({ type: null, message: "" });
      }, autoDismissDelay);

      return () => clearTimeout(timer);
    }
  }, [submitStatus.type, autoDismissDelay]);

  return {
    formData,
    errors,
    isSubmitting,
    submitStatus,
    honeypot,
    handleChange,
    handleSubmit,
    resetForm,
    setFormData,
  };
}

export function getWhatsAppLink(data: ContactFormData): string {
  return getWhatsAppFallbackMessage(data);
}