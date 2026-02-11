/**
 * TypeScript type definitions for Enterprise Firebase-Supabase Auth System
 * Standard: Google Workspace / Zoho One Level
 * Architecture: Option B - Unified Identity + Product Activation
 */

// ============================================================================
// PRODUCT DOMAIN TYPES
// ============================================================================

export type ProductDomain =
  | "shop"
  | "marketing"
  | "showcase"
  | "dashboard"
  | "api";

export type ProductStatus = "trial" | "active" | "suspended" | "cancelled";

export interface ProductMembership {
  id: string;
  user_id: string;
  product: ProductDomain;
  status: ProductStatus;
  activated_at: string;
  activated_by: "signup" | "activation" | "admin" | "migration" | "system";
  trial_ends_at: string | null;
  trial_days: number;
  suspended_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// AUTH REQUEST/RESPONSE TYPES
// ============================================================================

export interface SyncUserRequest {
  idToken: string;
  /** If true, allows creating new user in DB. If false/undefined, returns 404 for missing users. */
  allowCreate?: boolean;
}

export interface SyncUserResponse {
  success: boolean;
  user?: SupabaseUser;
  error?: string;
  code?: AuthErrorCode;

  // NEW: Product activation data (returned when PRODUCT_NOT_ENABLED)
  currentProduct?: ProductDomain;
  availableProducts?: ProductDomain[];
  message?: string;
}

export interface ProductActivationRequest {
  product: ProductDomain;
}

export interface ProductActivationResponse {
  success: boolean;
  membership?: ProductMembership;
  trialEndsAt?: string;
  message?: string;
  code?: AuthErrorCode;
  error?: string;
}

// ============================================================================
// FIREBASE USER TYPES
// ============================================================================

export interface FirebaseUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  name?: string;
  picture?: string;
  firebase: {
    sign_in_provider: string;
    identities?: {
      [key: string]: any;
    };
  };
}

// ============================================================================
// SUPABASE USER TYPES
// ============================================================================

export interface SupabaseUser {
  id: string;
  firebase_uid: string;
  full_name: string;
  email: string;
  phone?: string;
  phone_verified?: boolean;
  provider?: string;
  role?: string;
  onboarding_completed?: boolean;
  last_sign_in_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// STANDARDIZED ERROR CODES (ENTERPRISE-GRADE)
// ============================================================================

/**
 * Exhaustive enumeration of all possible authentication error codes
 * Used consistently across frontend and backend for deterministic error handling
 */
export enum AuthErrorCode {
  // ===== TOKEN ERRORS =====
  /** Firebase ID token is invalid or malformed */
  INVALID_TOKEN = "INVALID_TOKEN",

  /** Firebase ID token has expired (>1 hour old) */
  EXPIRED_TOKEN = "EXPIRED_TOKEN",

  /** Token verification failed on backend */
  TOKEN_VERIFICATION_FAILED = "TOKEN_VERIFICATION_FAILED",

  // ===== USER ERRORS =====
  /** User exists in Firebase but not in Supabase database */
  USER_NOT_FOUND = "USER_NOT_FOUND",

  /** User already exists (tried to create duplicate) */
  DUPLICATE_USER = "DUPLICATE_USER",

  /** User account has been suspended by admin */
  USER_SUSPENDED = "USER_SUSPENDED",

  /** User account has been deleted */
  USER_DELETED = "USER_DELETED",

  // ===== PRODUCT MEMBERSHIP ERRORS (OPTION B) =====
  /** User does not have membership for the requested product */
  PRODUCT_NOT_ENABLED = "PRODUCT_NOT_ENABLED",

  /** Invalid product identifier provided */
  INVALID_PRODUCT = "INVALID_PRODUCT",

  /** User already has active membership for this product */
  ALREADY_ACTIVE = "ALREADY_ACTIVE",

  /** Product not available for activation (e.g., deprecated, enterprise-only) */
  PRODUCT_NOT_AVAILABLE = "PRODUCT_NOT_AVAILABLE",

  /** User's trial period has expired */
  TRIAL_EXPIRED = "TRIAL_EXPIRED",

  /** Product membership is suspended (e.g., payment failed) */
  MEMBERSHIP_SUSPENDED = "MEMBERSHIP_SUSPENDED",

  /** User cancelled this product */
  MEMBERSHIP_CANCELLED = "MEMBERSHIP_CANCELLED",

  // ===== SESSION ERRORS =====
  /** Session cookie has expired (>5 days old) */
  SESSION_EXPIRED = "SESSION_EXPIRED",

  /** No valid session cookie found */
  UNAUTHORIZED = "UNAUTHORIZED",

  /** Session cookie is invalid or tampered */
  INVALID_SESSION = "INVALID_SESSION",

  // ===== NETWORK/SYSTEM ERRORS =====
  /** Network request failed (cannot reach backend) */
  NETWORK_ERROR = "NETWORK_ERROR",

  /** Internal server error (500) */
  SERVER_ERROR = "SERVER_ERROR",

  /** Database operation failed */
  DATABASE_ERROR = "DATABASE_ERROR",

  /** Sync operation failed */
  SYNC_FAILED = "SYNC_FAILED",

  /** Product activation failed (backend error) */
  ACTIVATION_FAILED = "ACTIVATION_FAILED",

  /** Auth operation timed out (>10 seconds) */
  AUTH_TIMEOUT = "AUTH_TIMEOUT",

  // ===== VALIDATION ERRORS =====
  /** Missing required field in request */
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

  /** Invalid request format */
  INVALID_REQUEST = "INVALID_REQUEST",

  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: any;
  timestamp?: string;
}

// ============================================================================
// AUTH STATE MACHINE (DETERMINISTIC)
// ============================================================================

/**
 * Explicit Auth State Machine (Enterprise-Grade)
 *
 * State transitions:
 * INITIALIZING → VERIFYING_SESSION → SYNCING_TO_DB → AUTHENTICATED
 *                                   ↓ (on error)
 *                                SESSION_ONLY → UNAUTHENTICATED (after clearSession)
 *                                   ↓ (product membership missing)
 *                                PRODUCT_NOT_ENABLED → [activation UI]
 *
 * Terminal States: AUTHENTICATED, UNAUTHENTICATED, AUTH_ERROR
 * Ephemeral States: INITIALIZING, VERIFYING_SESSION, SYNCING_TO_DB
 * Actionable States: SESSION_ONLY, PRODUCT_NOT_ENABLED
 */
export enum AuthState {
  /** No authentication, user needs to login */
  UNAUTHENTICATED = "UNAUTHENTICATED",

  /** Initial state, checking for existing session */
  INITIALIZING = "INITIALIZING",

  /** Firebase session found, verifying validity */
  VERIFYING_SESSION = "VERIFYING_SESSION",

  /** Firebase auth valid, syncing to database */
  SYNCING_TO_DB = "SYNCING_TO_DB",

  /** CRITICAL: Firebase session exists but DB user missing - MUST signout */
  SESSION_ONLY = "SESSION_ONLY",

  /** NEW (Option B): User exists but no product membership for current domain */
  PRODUCT_NOT_ENABLED = "PRODUCT_NOT_ENABLED",

  /** Fully authenticated - Firebase + DB user exists + Product membership valid */
  AUTHENTICATED = "AUTHENTICATED",

  /** Auth system error (network, timeout, unknown) */
  AUTH_ERROR = "AUTH_ERROR",
}

/**
 * Auth state transition log entry for observability
 */
export interface AuthStateTransition {
  from: AuthState;
  to: AuthState;
  reason?: string;
  timestamp: number;
  userId?: string;
  product?: ProductDomain;
  errorCode?: AuthErrorCode;
}

// ============================================================================
// AUTH CONTEXT TYPE (PROVIDER)
// ============================================================================

export interface AuthContextType {
  // ===== CORE STATE =====
  /** Current Supabase user (null until AUTHENTICATED) */
  user: SupabaseUser | null;

  /** Firebase user object (null when logged out) */
  firebaseUser: any | null;

  /** Current auth state (replaces boolean loading) */
  authState: AuthState;

  /** Legacy loading flag for compatibility (derived from authState) */
  loading: boolean;

  /** Current auth error if any */
  error: AuthError | null;

  // ===== PRODUCT MEMBERSHIP (OPTION B) =====
  /** Current product domain (detected from URL) */
  currentProduct: ProductDomain | null;

  /** Products available for the user to activate */
  availableProducts: ProductDomain[];

  /** User's active product memberships */
  userMemberships: ProductMembership[];

  // ===== AUTH METHODS =====
  /** Sync Firebase user to Supabase (session restoration only, does NOT create users) */
  syncUser: (idToken: string) => Promise<SupabaseUser>;

  /** Sync Firebase user to Supabase (NEW USER SIGNUP ONLY, allows user creation) */
  syncUserForSignup: (idToken: string) => Promise<SupabaseUser>;

  /** Sign out from Firebase and clear all state */
  signOut: () => Promise<void>;

  /** Force clear session (for SESSION_ONLY state) */
  clearSession: () => Promise<void>;

  // ===== PRODUCT ACTIVATION (OPTION B) =====
  /** Activate a new product for the current user */
  activateProduct: (product: ProductDomain) => Promise<boolean>;

  /** Check if user has active membership for a product */
  hasProductAccess: (product: ProductDomain) => boolean;

  /** Get membership details for a product */
  getProductMembership: (product: ProductDomain) => ProductMembership | null;
}

// ============================================================================
// TYPE GUARDS (UTILITY)
// ============================================================================

export const isAuthenticated = (state: AuthState): boolean => {
  return state === AuthState.AUTHENTICATED;
};

export const isLoading = (state: AuthState): boolean => {
  return [
    AuthState.INITIALIZING,
    AuthState.VERIFYING_SESSION,
    AuthState.SYNCING_TO_DB,
  ].includes(state);
};

export const needsSignout = (state: AuthState): boolean => {
  return state === AuthState.SESSION_ONLY;
};

export const needsActivation = (state: AuthState): boolean => {
  return state === AuthState.PRODUCT_NOT_ENABLED;
};

export const canAccessProtectedRoute = (state: AuthState): boolean => {
  return state === AuthState.AUTHENTICATED;
};

export const isErrorState = (state: AuthState): boolean => {
  return state === AuthState.AUTH_ERROR;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get human-readable error message for an error code
 */
export function getErrorMessage(code: AuthErrorCode): string {
  const messages: Record<AuthErrorCode, string> = {
    [AuthErrorCode.INVALID_TOKEN]:
      "Your session is invalid. Please log in again.",
    [AuthErrorCode.EXPIRED_TOKEN]:
      "Your session has expired. Please log in again.",
    [AuthErrorCode.TOKEN_VERIFICATION_FAILED]:
      "Session verification failed. Please log in again.",

    [AuthErrorCode.USER_NOT_FOUND]:
      "Your account was not fully created. Please sign up again.",
    [AuthErrorCode.DUPLICATE_USER]:
      "An account with this email already exists.",
    [AuthErrorCode.USER_SUSPENDED]:
      "Your account has been suspended. Contact support.",
    [AuthErrorCode.USER_DELETED]: "Your account has been deleted.",

    [AuthErrorCode.PRODUCT_NOT_ENABLED]:
      "You need to activate this product to continue.",
    [AuthErrorCode.INVALID_PRODUCT]: "Invalid product specified.",
    [AuthErrorCode.ALREADY_ACTIVE]: "This product is already activated.",
    [AuthErrorCode.PRODUCT_NOT_AVAILABLE]:
      "This product is not available for activation.",
    [AuthErrorCode.TRIAL_EXPIRED]:
      "Your trial has expired. Please upgrade to continue.",
    [AuthErrorCode.MEMBERSHIP_SUSPENDED]:
      "Your product access is suspended. Please update payment.",
    [AuthErrorCode.MEMBERSHIP_CANCELLED]: "This product has been cancelled.",

    [AuthErrorCode.SESSION_EXPIRED]:
      "Your session has expired. Please log in again.",
    [AuthErrorCode.UNAUTHORIZED]: "You are not authorized. Please log in.",
    [AuthErrorCode.INVALID_SESSION]: "Invalid session. Please log in again.",

    [AuthErrorCode.NETWORK_ERROR]:
      "Network error. Please check your connection.",
    [AuthErrorCode.SERVER_ERROR]: "Server error. Please try again later.",
    [AuthErrorCode.DATABASE_ERROR]: "Database error. Please try again.",
    [AuthErrorCode.SYNC_FAILED]:
      "Failed to sync your account. Please try again.",
    [AuthErrorCode.ACTIVATION_FAILED]:
      "Failed to activate product. Please try again.",
    [AuthErrorCode.AUTH_TIMEOUT]: "Authentication timed out. Please try again.",

    [AuthErrorCode.MISSING_REQUIRED_FIELD]: "Missing required information.",
    [AuthErrorCode.INVALID_REQUEST]: "Invalid request.",
    [AuthErrorCode.RATE_LIMIT_EXCEEDED]:
      "Too many requests. Please wait and try again.",
  };

  return messages[code] || "An unknown error occurred.";
}

/**
 * Check if a product domain is valid
 */
export function isValidProductDomain(domain: string): domain is ProductDomain {
  return ["shop", "marketing", "showcase", "dashboard", "api"].includes(domain);
}

/**
 * Check if a product status is active (trial or active)
 */
export function isActiveStatus(status: ProductStatus): boolean {
  return status === "trial" || status === "active";
}

/**
 * Get display name for a product
 */
export function getProductDisplayName(product: ProductDomain): string {
  const names: Record<ProductDomain, string> = {
    shop: "Shop",
    marketing: "Marketing",
    showcase: "Showcase",
    dashboard: "Dashboard",
    api: "API Console",
  };
  return names[product];
}
