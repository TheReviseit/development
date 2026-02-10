/**
 * WhatsApp Automation API Client
 * Connects frontend components to backend APIs
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Types
export interface Template {
  id: string;
  template_name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "APPROVED" | "PENDING" | "REJECTED" | "DISABLED" | "PAUSED";
  body_text: string;
  header_type?: string;
  header_content?: string;
  footer_text?: string;
  buttons?: Array<{ type: string; text: string; url?: string }>;
  variables?: Array<{ index: number; example: string }>;
  language: string;
  waba_id: string;
  meta_template_id: string;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
}

export interface Contact {
  id: string;
  phone_number: string;
  phone_normalized: string;
  name?: string;
  email?: string;
  tags: string[];
  custom_fields: Record<string, any>;
  opted_in: boolean;
  first_message_at?: string;
  last_message_at?: string;
  total_messages_received: number;
  total_messages_sent: number;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsOverview {
  period: string;
  messages: {
    sent: number;
    received: number;
    delivered: number;
    read: number;
    failed: number;
    delivery_rate: number;
    read_rate: number;
  };
  ai: {
    replies_generated: number;
    tokens_used: number;
    tokens_limit: number;
    tokens_percent: number;
    cost_usd: number;
    cost_inr: number;
  };
  conversations: {
    started: number;
    active: number;
  };
  campaigns: {
    broadcast_messages: number;
  };
  trends: {
    dates: string[];
    sent: number[];
    received: number[];
    ai_replies: number[];
  };
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  template_id?: string;
  status:
    | "draft"
    | "scheduled"
    | "sending"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// API Response types
interface ApiResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  userId: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
        ...options.headers,
      },
    });
  } catch (err: any) {
    // Network error - backend is likely not running
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      console.error(
        `❌ Cannot reach backend at ${API_BASE}. Make sure the Flask server is running.`,
      );
      throw new Error(`Backend server not reachable`);
    }
    throw err;
  }

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `API Error: ${response.status}`);
  }

  return data;
}

// =====================================================
// TEMPLATES API
// =====================================================

export async function fetchTemplates(
  userId: string,
  params?: { status?: string; category?: string; search?: string },
): Promise<Template[]> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append("status", params.status);
  if (params?.category) queryParams.append("category", params.category);
  if (params?.search) queryParams.append("search", params.search);

  const endpoint = `/api/templates${
    queryParams.toString() ? `?${queryParams}` : ""
  }`;
  const response = await apiRequest<{ templates: Template[] }>(
    endpoint,
    userId,
  );
  return response.templates;
}

export async function syncTemplates(
  userId: string,
): Promise<{ synced_count: number; message: string }> {
  const response = await apiRequest<{ synced_count: number; message: string }>(
    "/api/templates/sync",
    userId,
    { method: "POST" },
  );
  return response;
}

export async function deleteTemplate(
  userId: string,
  templateId: string,
): Promise<void> {
  await apiRequest(`/api/templates/${templateId}`, userId, {
    method: "DELETE",
  });
}

export interface CreateTemplateData {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  header?: {
    type: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
    text?: string;
  };
  body: string;
  body_examples?: string[];
  footer?: string;
  buttons?: Array<{
    type: "URL" | "PHONE_NUMBER" | "QUICK_REPLY";
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export async function createTemplate(
  userId: string,
  template: CreateTemplateData,
): Promise<{ template_id: string; message: string }> {
  const response = await apiRequest<{
    template_id: string;
    message: string;
    data: Template;
  }>("/api/templates", userId, {
    method: "POST",
    body: JSON.stringify(template),
  });
  return response;
}

export interface SendTemplateData {
  template_id: string;
  phone_number: string;
  variables?: string[];
}

export async function sendTemplateMessage(
  userId: string,
  data: SendTemplateData,
): Promise<{ success: boolean; message_id?: string; message?: string }> {
  const response = await apiRequest<{
    success: boolean;
    message_id?: string;
    message?: string;
  }>("/api/templates/send", userId, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response;
}

// =====================================================
// CONTACTS API
// =====================================================

export async function fetchContacts(
  userId: string,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    tags?: string;
    opted_in?: boolean;
  },
): Promise<{
  contacts: Contact[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
  };
}> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.limit) queryParams.append("limit", params.limit.toString());
  if (params?.search) queryParams.append("search", params.search);
  if (params?.tags) queryParams.append("tags", params.tags);
  if (params?.opted_in !== undefined)
    queryParams.append("opted_in", params.opted_in.toString());

  const endpoint = `/api/contacts${
    queryParams.toString() ? `?${queryParams}` : ""
  }`;
  return apiRequest(endpoint, userId);
}

export async function createContact(
  userId: string,
  contact: {
    phone_number: string;
    name?: string;
    email?: string;
    tags?: string[];
  },
): Promise<Contact> {
  const response = await apiRequest<{ contact: Contact }>(
    "/api/contacts",
    userId,
    { method: "POST", body: JSON.stringify(contact) },
  );
  return response.contact;
}

export async function deleteContact(
  userId: string,
  contactId: string,
): Promise<void> {
  await apiRequest(`/api/contacts/${contactId}`, userId, { method: "DELETE" });
}

// =====================================================
// ANALYTICS API
// =====================================================

export async function fetchAnalyticsOverview(
  userId: string,
  period: "7d" | "30d" | "90d" = "7d",
): Promise<AnalyticsOverview | null> {
  try {
    return await apiRequest(`/api/analytics/overview?period=${period}`, userId);
  } catch (error) {
    // Gracefully handle analytics service unavailability
    console.warn(`⚠️ Analytics service unavailable: ${error}`);
    return null;
  }
}

export async function fetchMessageAnalytics(
  userId: string,
  period: "7d" | "30d" | "90d" = "7d",
): Promise<any | null> {
  try {
    return await apiRequest(`/api/analytics/messages?period=${period}`, userId);
  } catch (error) {
    console.warn(`⚠️ Message analytics unavailable: ${error}`);
    return null;
  }
}

export async function fetchConversationAnalytics(
  userId: string,
  period: "7d" | "30d" | "90d" = "7d",
): Promise<any | null> {
  try {
    return await apiRequest(
      `/api/analytics/conversations?period=${period}`,
      userId,
    );
  } catch (error) {
    console.warn(`⚠️ Conversation analytics unavailable: ${error}`);
    return null;
  }
}

// =====================================================
// CAMPAIGNS API
// =====================================================

export async function fetchCampaigns(userId: string): Promise<Campaign[]> {
  const response = await apiRequest<{ campaigns: Campaign[] }>(
    "/api/campaigns",
    userId,
  );
  return response.campaigns;
}

export async function createCampaign(
  userId: string,
  campaign: {
    name: string;
    description?: string;
    template_id: string;
    target_type: "list" | "segment" | "all";
    target_list_id?: string;
    target_filters?: Record<string, any>;
    variable_mapping?: Record<string, string>;
    scheduled_at?: string;
  },
): Promise<Campaign> {
  const response = await apiRequest<{ campaign: Campaign }>(
    "/api/campaigns",
    userId,
    { method: "POST", body: JSON.stringify(campaign) },
  );
  return response.campaign;
}

export async function startCampaign(
  userId: string,
  campaignId: string,
): Promise<void> {
  await apiRequest(`/api/campaigns/${campaignId}/send`, userId, {
    method: "POST",
  });
}

export async function pauseCampaign(
  userId: string,
  campaignId: string,
): Promise<void> {
  await apiRequest(`/api/campaigns/${campaignId}/pause`, userId, {
    method: "POST",
  });
}

export async function cancelCampaign(
  userId: string,
  campaignId: string,
): Promise<void> {
  await apiRequest(`/api/campaigns/${campaignId}/cancel`, userId, {
    method: "POST",
  });
}

export async function getCampaignStats(
  userId: string,
  campaignId: string,
): Promise<any> {
  return apiRequest(`/api/campaigns/${campaignId}/stats`, userId);
}

// =====================================================
// BULK MESSAGE CAMPAIGNS API
// =====================================================

export interface BulkContact {
  phone: string;
  name?: string;
  email?: string;
  variables?: Record<string, string>;
}

export interface BulkCampaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  message_text?: string;
  media_url?: string;
  media_type?: string;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export async function createBulkCampaign(
  userId: string,
  name: string,
): Promise<BulkCampaign> {
  const response = await apiRequest<{
    campaign?: BulkCampaign;
    id?: string;
    name?: string;
  }>("/api/bulk-campaigns", userId, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  // Handle different response formats
  if (response.campaign) {
    return response.campaign;
  }
  return response as unknown as BulkCampaign;
}

export async function addBulkCampaignContacts(
  userId: string,
  campaignId: string,
  contacts: BulkContact[],
): Promise<{ success: boolean; count: number }> {
  return apiRequest(`/api/bulk-campaigns/${campaignId}/contacts`, userId, {
    method: "POST",
    body: JSON.stringify({ contacts }),
  });
}

export async function sendBulkCampaign(
  userId: string,
  campaignId: string,
  message_text: string,
  media_url?: string,
  media_type?: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/bulk-campaigns/${campaignId}/send`, userId, {
    method: "POST",
    body: JSON.stringify({ message_text, media_url, media_type }),
  });
}

export async function fetchBulkCampaigns(
  userId: string,
): Promise<BulkCampaign[]> {
  const response = await apiRequest<{ campaigns: BulkCampaign[] }>(
    "/api/bulk-campaigns",
    userId,
  );
  return response.campaigns || [];
}
