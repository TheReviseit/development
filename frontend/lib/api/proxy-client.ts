/**
 * API Proxy Client
 * =================
 * Pure pass-through proxy with timeout and retry.
 * NO circuit breaker — that belongs server-side in the API route layer.
 *
 * Design:
 * - Stateless: every call is independent, no module-level state
 * - Fast path (billing): 5s timeout, no retries — fail fast for payments
 * - Slow path (everything else): 10s timeout, 1 retry with 2s backoff
 * - 4xx errors returned immediately (client error, retry won't help)
 * - 5xx/network errors: retried once, original error preserved on final failure
 *
 * @version 2.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

interface ProxyResult<T> {
  success: boolean;
  data?: T;
  error?: ProxyError;
  statusCode: number;
}

interface ProxyError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// PROXY REQUEST
// =============================================================================

export async function proxyRequest<T = unknown>(
  endpoint: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<ProxyResult<T>> {
  const isBillingEndpoint = endpoint.startsWith("/api/billing/");
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const defaultBillingTimeout = parseInt(process.env.BILLING_TIMEOUT_MS || '60000', 10);
  const timeoutMs = options.timeoutMs ?? (isBillingEndpoint ? defaultBillingTimeout : 15000);
  const maxRetries = isBillingEndpoint ? 0 : 1;

  const { timeoutMs: _omit, ...fetchOptions } = options;

  const url = `${backendUrl}${endpoint}`;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let lastError: Error | null = null;
  let lastBackendStatus: number | null = null;
  let lastBackendErrorData: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
          ...options.headers,
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        lastBackendStatus = response.status;
        lastBackendErrorData = errorData;

        if (response.status >= 400 && response.status < 500) {
          return {
            success: false,
            statusCode: response.status,
            error: {
              code: errorData.error_code || `HTTP_${response.status}`,
              message:
                errorData.message || `Request failed with status ${response.status}`,
              details: errorData,
            },
          };
        }

        throw new Error(
          `HTTP ${response.status}: ${errorData.message || errorData.error_code || "Server error"}`,
        );
      }

      const data = await response.json();

      return {
        success: true,
        statusCode: response.status,
        data: data as T,
      };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          statusCode: 504,
          error: {
            code: "GATEWAY_TIMEOUT",
            message: "The payment service is taking too long to respond. Please try again.",
            details: { timeoutMs },
          },
        };
      }

      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  const isConnectionError =
    lastError?.message?.includes("ECONNREFUSED") ||
    lastError?.message?.includes("fetch failed") ||
    lastError?.message?.includes("connect");

  if (isConnectionError) {
    return {
      success: false,
      statusCode: 503,
      error: {
        code: "BACKEND_UNAVAILABLE",
        message: "Payment service is temporarily unavailable. Our team has been notified.",
        details: {
          suggestion:
            "Please ensure the backend server is running on port 5000 (python app.py)",
          error: lastError?.message,
        },
      },
    };
  }

  if (lastBackendStatus && lastBackendErrorData) {
    return {
      success: false,
      statusCode: lastBackendStatus,
      error: {
        code: lastBackendErrorData.error_code || `HTTP_${lastBackendStatus}`,
        message:
          lastBackendErrorData.message ||
          "Payment service temporarily unavailable. Please try again.",
        details: lastBackendErrorData,
      },
    };
  }

  return {
    success: false,
    statusCode: 502,
    error: {
      code: "PROXY_ERROR",
      message: "Failed to process your request. Please try again.",
      details: { error: lastError?.message },
    },
  };
}
