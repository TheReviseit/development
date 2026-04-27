/**
 * Server-side fetch helpers (Next.js route handlers).
 *
 * Purpose: prevent "infinite loaders" caused by hung upstream calls
 * (Supabase PostgREST, network stalls, etc).
 */
export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    // If caller already provided a signal, respect it (don't override).
    if (init.signal) {
      return fetch(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

