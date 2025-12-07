/**
 * TypeScript type definitions for Firebase-Supabase auth sync system
 */

// Request body for /api/auth/sync endpoint
export interface SyncUserRequest {
  idToken: string;
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

// Auth state from context
export interface AuthContextType {
  user: SupabaseUser | null;
  firebaseUser: any | null;
  loading: boolean;
  error: AuthError | null;
  syncUser: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}
