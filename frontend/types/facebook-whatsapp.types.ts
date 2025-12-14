/**
 * TypeScript Types for Facebook Login + WhatsApp Business API Integration
 * Multi-Tenant SaaS Architecture
 */

// =====================================================
// FACEBOOK AUTHENTICATION TYPES
// =====================================================

export interface FacebookLoginResponse {
  authResponse: {
    accessToken: string;
    userID: string;
    expiresIn: number;
    signedRequest: string;
    graphDomain: string;
    data_access_expiration_time: number;
  };
  status: 'connected' | 'not_authorized' | 'unknown';
}

export interface FacebookUserProfile {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

export interface FacebookPermission {
  permission: string;
  status: 'granted' | 'declined' | 'expired';
}

// =====================================================
// DATABASE RECORD TYPES
// =====================================================

export interface ConnectedFacebookAccount {
  id: string;
  user_id: string;
  facebook_user_id: string;
  facebook_user_name: string | null;
  facebook_email: string | null;
  access_token: string; // Encrypted
  token_type: string;
  expires_at: string | null;
  refresh_token: string | null;
  last_refreshed_at: string | null;
  granted_permissions: string[];
  status: 'active' | 'expired' | 'revoked' | 'error';
  connection_error: string | null;
  connected_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConnectedBusinessManager {
  id: string;
  facebook_account_id: string;
  user_id: string;
  business_id: string; // Meta Business Manager ID
  business_name: string;
  business_email: string | null;
  business_vertical: string | null;
  permitted_roles: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConnectedWhatsAppAccount {
  id: string;
  business_manager_id: string;
  user_id: string;
  waba_id: string; // WhatsApp Business Account ID
  waba_name: string | null;
  account_review_status: string | null;
  business_verification_status: string | null;
  currency: string;
  message_template_namespace: string | null;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | null;
  messaging_limit_tier: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConnectedPhoneNumber {
  id: string;
  whatsapp_account_id: string;
  user_id: string;
  phone_number_id: string; // Meta's phone number ID
  display_phone_number: string;
  verified_name: string | null;
  code_verification_status: string | null;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | null;
  platform_type: string;
  webhook_url: string | null;
  webhook_verified: boolean;
  webhook_verify_token: string | null;
  is_official_business_account: boolean;
  can_send_messages: boolean;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WhatsAppMessage {
  id: string;
  phone_number_id: string;
  user_id: string;
  message_id: string;
  wamid: string | null;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  message_type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'template';
  message_body: string | null;
  media_url: string | null;
  media_id: string | null;
  template_name: string | null;
  template_language: string | null;
  template_parameters: Record<string, any> | null;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error_code: string | null;
  error_message: string | null;
  conversation_id: string | null;
  conversation_category: string | null;
  pricing_model: string | null;
  metadata: Record<string, any> | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  conversation_origin: string | null;
}

// =====================================================
// META GRAPH API RESPONSE TYPES
// =====================================================

export interface MetaBusinessManager {
  id: string;
  name: string;
  created_time?: string;
  verification_status?: string;
  permitted_roles?: string[];
}

export interface MetaWhatsAppBusinessAccount {
  id: string;
  name: string;
  account_review_status?: string;
  business_verification_status?: string;
  currency?: string;
  message_template_namespace?: string;
  quality_rating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  timezone_id?: string;
}

export interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  code_verification_status?: string;
  is_official_business_account?: boolean;
  platform_type?: string;
}

export interface MetaGraphAPIError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id: string;
}

export interface MetaGraphAPIResponse<T> {
  data?: T[];
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
  error?: MetaGraphAPIError;
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface FacebookLoginRequest {
  accessToken: string;
  userID: string;
  expiresIn: number;
  grantedPermissions: string[];
}

export interface FacebookLoginAPIResponse {
  success: boolean;
  data?: {
    facebookAccount: ConnectedFacebookAccount;
    user: {
      id: string;
      email: string;
      full_name: string;
    };
  };
  error?: string;
}

export interface FetchBusinessManagersRequest {
  facebookAccountId: string;
}

export interface FetchBusinessManagersResponse {
  success: boolean;
  data?: MetaBusinessManager[];
  error?: string;
}

export interface FetchWABARequest {
  businessManagerId: string;
}

export interface FetchWABAResponse {
  success: boolean;
  data?: MetaWhatsAppBusinessAccount[];
  error?: string;
}

export interface FetchPhoneNumbersRequest {
  wabaId: string;
}

export interface FetchPhoneNumbersResponse {
  success: boolean;
  data?: MetaPhoneNumber[];
  error?: string;
}

export interface ConnectPhoneNumberRequest {
  businessManagerId: string;
  wabaId: string;
  phoneNumberId: string;
  webhookUrl?: string;
}

export interface ConnectPhoneNumberResponse {
  success: boolean;
  data?: {
    phoneNumber: ConnectedPhoneNumber;
    whatsappAccount: ConnectedWhatsAppAccount;
  };
  error?: string;
}

export interface SendWhatsAppMessageRequest {
  to: string;
  message: string;
  phoneNumberId?: string; // Optional: use specific phone number
}

export interface SendWhatsAppMessageResponse {
  success: boolean;
  data?: {
    messageId: string;
    wabaId?: string;
    phoneNumberId?: string;
  };
  error?: string;
}

// =====================================================
// WEBHOOK TYPES
// =====================================================

export interface WhatsAppWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: {
      name: string;
    };
    wa_id: string;
  }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'location' | 'contacts';
    text?: {
      body: string;
    };
    image?: {
      id: string;
      mime_type: string;
      sha256: string;
      caption?: string;
    };
    // Add other message types as needed
  }>;
  statuses?: Array<{
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
    conversation?: {
      id: string;
      origin: {
        type: string;
      };
      expiration_timestamp?: string;
    };
    pricing?: {
      pricing_model: string;
      billable: boolean;
      category: 'authentication' | 'marketing' | 'utility' | 'service';
    };
    errors?: Array<{
      code: number;
      title: string;
      message: string;
      error_data?: {
        details: string;
      };
    }>;
  }>;
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: WhatsAppWebhookValue;
    field: 'messages';
  }>;
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

// =====================================================
// UI STATE TYPES
// =====================================================

export interface FacebookConnectionStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  error?: string;
}

export interface WhatsAppConnectionState {
  currentStep: number;
  facebookAccount: ConnectedFacebookAccount | null;
  businessManagers: MetaBusinessManager[];
  selectedBusinessManager: MetaBusinessManager | null;
  whatsappAccounts: MetaWhatsAppBusinessAccount[];
  selectedWhatsAppAccount: MetaWhatsAppBusinessAccount | null;
  phoneNumbers: MetaPhoneNumber[];
  selectedPhoneNumber: MetaPhoneNumber | null;
  isLoading: boolean;
  error: string | null;
}

// =====================================================
// PERMISSION CONSTANTS
// =====================================================

export const REQUIRED_FACEBOOK_PERMISSIONS = [
  'business_management',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
  'public_profile',
  'email',
] as const;

export type FacebookPermissionType = typeof REQUIRED_FACEBOOK_PERMISSIONS[number];

export const PERMISSION_DESCRIPTIONS: Record<FacebookPermissionType, string> = {
  business_management: 'Access and manage your Business Manager',
  whatsapp_business_management: 'Manage WhatsApp Business Accounts',
  whatsapp_business_messaging: 'Send and receive WhatsApp messages',
  public_profile: 'Access your basic profile information',
  email: 'Access your email address',
};

export const PERMISSIONS_REQUIRING_REVIEW: FacebookPermissionType[] = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
];

// =====================================================
// QUALITY RATING HELPERS
// =====================================================

export const QUALITY_RATING_COLORS = {
  GREEN: '#10b981',
  YELLOW: '#f59e0b',
  RED: '#ef4444',
  UNKNOWN: '#6b7280',
} as const;

export const QUALITY_RATING_LABELS = {
  GREEN: 'High Quality',
  YELLOW: 'Medium Quality',
  RED: 'Low Quality',
  UNKNOWN: 'Not Rated',
} as const;

// =====================================================
// MESSAGE LIMIT TIERS
// =====================================================

export const MESSAGE_LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Infinity,
} as const;

