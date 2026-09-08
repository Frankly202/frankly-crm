import type { PaginationMeta } from "./types";

export const API_BASE_URL =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "frankly.accessToken";
const REFRESH_KEY = "frankly.refreshToken";
const USER_KEY = "frankly.user";
export const storageKeys = { TOKEN_KEY, REFRESH_KEY, USER_KEY };

export const getAccessToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);

export const getRefreshToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(REFRESH_KEY);

export function clearAuthTokens() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKeys.TOKEN_KEY);
    window.localStorage.removeItem(storageKeys.REFRESH_KEY);
    window.localStorage.removeItem(storageKeys.USER_KEY);
    window.dispatchEvent(new CustomEvent("frankly:auth-cleared"));
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta | undefined;
}

// Single-flight token refresh promise queue
let refreshPromise: Promise<string | null> | null = null;

async function executeTokenRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthTokens();
    return null;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const payload = (await res.json().catch(() => null)) as {
      success: boolean;
      data?: { accessToken: string; refreshToken: string };
      error?: { code: string; message: string };
    } | null;

    if (!res.ok || !payload?.success || !payload.data?.accessToken) {
      clearAuthTokens();
      return null;
    }

    const { accessToken, refreshToken: nextRefreshToken } = payload.data;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKeys.TOKEN_KEY, accessToken);
      window.localStorage.setItem(storageKeys.REFRESH_KEY, nextRefreshToken);
    }
    return accessToken;
  } catch {
    clearAuthTokens();
    return null;
  } finally {
    refreshPromise = null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  isRetry = false,
): Promise<ApiResult<T>> {
  const method = options.method ?? "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const token = getAccessToken();
    const body: BodyInit | null = options.body === undefined ? null : JSON.stringify(options.body);

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });

    const payload = (await res.json().catch(() => null)) as {
      success: boolean;
      data?: T;
      meta?: PaginationMeta;
      error?: { code: string; message: string; details?: unknown };
    } | null;

    // Handle 401 Unauthorized with token refresh rotation
    if (res.status === 401) {
      // Direct login or refresh calls must not trigger refresh loop
      if (path === "/auth/login" || path === "/auth/refresh") {
        throw new ApiError(
          401,
          payload?.error?.code ?? "UNAUTHORIZED",
          payload?.error?.message ?? "Invalid email or password",
          payload?.error?.details,
        );
      }

      if (isRetry) {
        clearAuthTokens();
        throw new ApiError(401, "UNAUTHORIZED", "Session expired. Please sign in again.");
      }

      // Single-flight refresh: reuse in-flight promise if one is already executing
      if (!refreshPromise) {
        refreshPromise = executeTokenRefresh();
      }

      const newAccessToken = await refreshPromise;
      if (!newAccessToken) {
        throw new ApiError(401, "UNAUTHORIZED", "Session expired. Please sign in again.");
      }

      // Replay original request with updated access token
      return apiRequest<T>(path, options, true);
    }

    if (!res.ok || !payload?.success) {
      throw new ApiError(
        res.status,
        payload?.error?.code ?? "INTERNAL_ERROR",
        payload?.error?.message ?? "Request failed",
        payload?.error?.details,
      );
    }

    return { data: payload.data as T, meta: payload.meta };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      503,
      "NETWORK_ERROR",
      "Cannot connect to Frankly CRM server. Please check your network connection.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export function buildQuery(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
