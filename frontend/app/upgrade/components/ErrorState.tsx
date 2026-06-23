"use client";

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
}

type ErrorCategory = "network" | "auth" | "server" | "conflict" | "unknown";

function categorizeError(error: Error): ErrorCategory {
  const msg = error.message.toLowerCase();
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
    return "network";
  }
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("unauthenticated") || msg === "Not authenticated") {
    return "auth";
  }
  if (msg.includes("500") || msg.includes("server error") || msg.includes("internal")) {
    return "server";
  }
  if (msg.includes("409") || msg.includes("conflict")) {
    return "conflict";
  }
  return "unknown";
}

const ERROR_CONFIG: Record<ErrorCategory, {
  title: string;
  description: string;
  icon: "wifi" | "lock" | "server" | "warning" | "alert";
}> = {
  network: {
    title: "Network Error",
    description: "Unable to reach our servers. Check your internet connection and try again.",
    icon: "wifi",
  },
  auth: {
    title: "Authentication Required",
    description: "Please sign in again to continue.",
    icon: "lock",
  },
  server: {
    title: "Server Error",
    description: "Our servers are having trouble. Please try again in a moment.",
    icon: "server",
  },
  conflict: {
    title: "Conflict Detected",
    description: "There is an existing checkout in progress. Cancel it and try again.",
    icon: "warning",
  },
  unknown: {
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again.",
    icon: "alert",
  },
};

function ErrorIcon({ type }: { type: ErrorCategory }) {
  const className = "mx-auto h-12 w-12";
  const iconMap: Record<string, React.ReactNode> = {
    wifi: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01M4.929 12.93a9.5 9.5 0 0114.142 0M2.1 9.456a13.5 13.5 0 0119.8 0" />
      </svg>
    ),
    lock: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    server: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    warning: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    alert: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return <>{iconMap[icon] || iconMap.alert}</>;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  const category = categorizeError(error);
  const config = ERROR_CONFIG[category];

  return (
    <div className="text-center py-12">
      <div className="mx-auto max-w-md">
        <div className="text-gray-400">
          <ErrorIcon type={category} />
        </div>

        <h3 className="mt-4 text-lg font-semibold text-black">
          {config.title}
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {config.description}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {error.message}
        </p>

        <button
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-black px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  );
}
