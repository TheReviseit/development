import { useState, useCallback } from "react";

export interface AuthFormState {
  email: string;
  password: string;
  error: string;
  loading: boolean;
}

export interface AuthFormHandlers {
  handleEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearError: () => void;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
}

/**
 * Custom hook for managing authentication form state
 * Provides memoized handlers to prevent unnecessary re-renders
 *
 * @returns Object containing form state and handlers
 */
export function useAuthForm(): AuthFormState & AuthFormHandlers {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Memoized handlers to prevent re-creation on every render
  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
    },
    []
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
    },
    []
  );

  const clearError = useCallback(() => {
    setError("");
  }, []);

  return {
    // State
    email,
    password,
    error,
    loading,
    // Setters
    setEmail,
    setPassword,
    setError,
    setLoading,
    // Handlers
    handleEmailChange,
    handlePasswordChange,
    clearError,
  };
}
