/**
 * Converts Firebase Auth error codes to user-friendly messages
 */
export function getFirebaseErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    // Email/Password errors
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters long.",
    "auth/user-not-found":
      "No account found with this email. Please check your email or sign up.",
    "auth/wrong-password":
      "Incorrect password. Please try again or reset your password.",
    "auth/too-many-requests":
      "Too many failed attempts. Please try again later.",
    "auth/user-disabled":
      "This account has been disabled. Please contact support.",
    "auth/operation-not-allowed": "This sign-in method is not enabled.",
    "auth/invalid-credential":
      "Invalid credentials. Please check your email or password.",

    // Google Sign-In errors
    "auth/popup-closed-by-user": "Sign-in cancelled. Please try again.",
    "auth/popup-blocked":
      "Popup was blocked. Please allow popups for this site.",
    "auth/cancelled-popup-request": "Sign-in cancelled. Please try again.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email using a different sign-in method.",

    // Network errors
    "auth/network-request-failed":
      "Network error. Please check your internet connection and try again.",
    "auth/timeout": "The operation timed out. Please try again.",

    // Other common errors
    "auth/requires-recent-login":
      "For security reasons, please log in again to complete this action.",
    "auth/invalid-verification-code":
      "Invalid verification code. Please try again.",
    "auth/invalid-verification-id": "Verification failed. Please try again.",
    "auth/missing-email": "Please enter your email address.",
    "auth/invalid-action-code":
      "This reset link is invalid or has expired. Please request a new one.",
    "auth/expired-action-code":
      "This reset link has expired. Please request a new one.",
  };

  return (
    errorMessages[errorCode] ||
    "An unexpected error occurred. Please try again."
  );
}

/**
 * Extracts user-friendly error message from Firebase error object
 */
export function handleFirebaseError(error: any): string {
  // If error has a code property (Firebase error)
  if (error?.code) {
    return getFirebaseErrorMessage(error.code);
  }

  // If error is a string
  if (typeof error === "string") {
    return error;
  }

  // If error has a message property
  if (error?.message) {
    // Check if message contains Firebase error code
    const codeMatch = error.message.match(/\(auth\/([^)]+)\)/);
    if (codeMatch) {
      return getFirebaseErrorMessage(`auth/${codeMatch[1]}`);
    }
    return error.message;
  }

  return "An unexpected error occurred. Please try again.";
}
