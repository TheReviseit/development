/**
 * TypeScript type definitions for Firebase-Supabase auth sync system
 */

// Request body for /api/auth/sync endpoint
export interface SyncUserRequest {
  idToken: string;
  /** If true, allows creating new user in DB. If false/undefined, returns 404 for missing users. */
  allowCreate?: boolean;
}

// Response from /api/auth/sync endpoint
export interface SyncUserResponse {
  success: boolean;
  user?: SupabaseUser;
  error?: string;
}

// Firebase decoded token data
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

// Supabase user record
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

// Unified auth error
export interface AuthError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Explicit Auth State Machine
 *
 * State transitions:
 * INITIALIZING → VERIFYING_SESSION → SYNCING_TO_DB → AUTHENTICATED
 *                                   ↓ (on error)
 *                                SESSION_ONLY → UNAUTHENTICATED (after signout)
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

  /** Fully authenticated - Firebase + DB user exists */
  AUTHENTICATED = "AUTHENTICATED",

  /** Auth system error */
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
}

// Auth state from context
export interface AuthContextType {
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

  /** Sync Firebase user to Supabase (session restoration only, does NOT create users) */
  syncUser: (idToken: string) => Promise<SupabaseUser>;

  /** Sync Firebase user to Supabase (NEW USER SIGNUP ONLY, allows user creation) */
  syncUserForSignup: (idToken: string) => Promise<SupabaseUser>;

  /** Sign out from Firebase and clear all state */
  signOut: () => Promise<void>;

  /** Force clear session (for SESSION_ONLY state) */
  clearSession: () => Promise<void>;
}

/**
 * Type guards for auth state checking
 */
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

export const canAccessProtectedRoute = (state: AuthState): boolean => {
  return state === AuthState.AUTHENTICATED;
};
