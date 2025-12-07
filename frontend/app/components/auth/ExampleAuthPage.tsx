"use client";

import { useState } from "react";
import GoogleSignInButton from "./GoogleSignInButton";
import PhoneAuthForm from "./PhoneAuthForm";
import { useAuth } from "./AuthProvider";
import { useFirebaseAuth } from "@/lib/hooks/useFirebaseAuth";

/**
 * Example Authentication Page
 *
 * This demonstrates how to use the Firebase → Supabase auth system
 * Shows Google Sign-In, Phone OTP, and Email/Password authentication
 *
 * To use this page:
 * 1. Wrap your app with AuthProvider in layout.tsx
 * 2. Import this component where you need authentication
 * 3. Customize the UI to match your design
 */
export default function ExampleAuthPage() {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const {
    signInWithEmail,
    signUpWithEmail,
    signOut: firebaseSignOut,
    loading,
    error,
  } = useFirebaseAuth();

  const [authMode, setAuthMode] = useState<"signin" | "signup" | "phone">(
    "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (authMode === "signup") {
        await signUpWithEmail(email, password, fullName);
      } else {
        await signInWithEmail(email, password);
      }
      // User will be auto-synced by AuthProvider
    } catch (err) {
      console.error("Auth error:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await firebaseSignOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show authenticated user dashboard
  if (user && firebaseUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <span className="text-3xl text-white font-bold">
                  {user.full_name?.charAt(0).toUpperCase() || "?"}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome, {user.full_name}!
              </h1>
              <p className="text-gray-600">
                Successfully authenticated and synced to Supabase
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Firebase Data
                </h3>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">UID:</span> {firebaseUser.uid}
                  </p>
                  <p>
                    <span className="font-medium">Email:</span>{" "}
                    {firebaseUser.email}
                  </p>
                  <p>
                    <span className="font-medium">Provider:</span>{" "}
                    {firebaseUser.providerData[0]?.providerId || "N/A"}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Supabase Data
                </h3>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">ID:</span> {user.id}
                  </p>
                  <p>
                    <span className="font-medium">Firebase UID:</span>{" "}
                    {user.firebase_uid}
                  </p>
                  <p>
                    <span className="font-medium">Email:</span> {user.email}
                  </p>
                  <p>
                    <span className="font-medium">Phone:</span>{" "}
                    {user.phone || "Not set"}
                  </p>
                  <p>
                    <span className="font-medium">Provider:</span>{" "}
                    {user.provider || "N/A"}
                  </p>
                  <p>
                    <span className="font-medium">Role:</span> {user.role}
                  </p>
                  <p>
                    <span className="font-medium">Last Sign In:</span>{" "}
                    {user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString()
                      : "N/A"}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show authentication forms
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {authMode === "signup"
                ? "Create Account"
                : authMode === "phone"
                ? "Phone Sign In"
                : "Welcome Back"}
            </h1>
            <p className="text-gray-600">
              {authMode === "signup"
                ? "Sign up to get started"
                : authMode === "phone"
                ? "Sign in with phone number"
                : "Sign in to your account"}
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setAuthMode("signin")}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                authMode === "signin"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                authMode === "signup"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => setAuthMode("phone")}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                authMode === "phone"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Phone
            </button>
          </div>

          {authMode === "phone" ? (
            /* Phone Authentication */
            <PhoneAuthForm
              onSuccess={() => console.log("Phone auth successful!")}
              onError={(err) => console.error("Phone auth error:", err)}
            />
          ) : (
            /* Email/Password Authentication */
            <>
              <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
                {authMode === "signup" && (
                  <div>
                    <label
                      htmlFor="fullName"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Full Name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {authMode === "signup" && (
                    <p className="mt-1 text-xs text-gray-500">
                      At least 6 characters
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? "Processing..."
                    : authMode === "signup"
                    ? "Sign Up"
                    : "Sign In"}
                </button>
              </form>

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Or continue with
                  </span>
                </div>
              </div>

              {/* Google Sign-In */}
              <GoogleSignInButton
                onSuccess={() => console.log("Google sign-in successful!")}
                onError={(err) => console.error("Google sign-in error:", err)}
              />
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Toggle between modes */}
          {authMode !== "phone" && (
            <p className="mt-6 text-center text-sm text-gray-600">
              {authMode === "signup"
                ? "Already have an account?"
                : "Don't have an account?"}{" "}
              <button
                onClick={() =>
                  setAuthMode(authMode === "signup" ? "signin" : "signup")
                }
                className="text-blue-600 font-medium hover:text-blue-700"
              >
                {authMode === "signup" ? "Sign In" : "Sign Up"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
