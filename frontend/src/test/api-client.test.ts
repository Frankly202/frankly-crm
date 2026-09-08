import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  apiRequest,
  buildQuery,
  storageKeys,
  ApiError,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
} from "@/lib/api/client";

describe("Frontend API Client & Single-Flight Refresh Queue", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should construct query strings accurately via buildQuery", () => {
    const q1 = buildQuery({ page: 1, limit: 20, channel: "WHATSAPP", unreadOnly: true });
    expect(q1).toBe("?page=1&limit=20&channel=WHATSAPP&unreadOnly=true");

    const q2 = buildQuery({ page: undefined, empty: "", valid: "test" });
    expect(q2).toBe("?valid=test");

    const q3 = buildQuery({});
    expect(q3).toBe("");
  });

  it("should attach Bearer token from localStorage on requests", async () => {
    window.localStorage.setItem(storageKeys.TOKEN_KEY, "test-jwt-token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { status: "ok" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await apiRequest<{ status: string }>("/health");

    expect(res.data).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall!;
    expect(url).toContain("/api/v1/health");
    expect(init.headers["Authorization"]).toBe("Bearer test-jwt-token");
  });

  it("should throw ApiError with status 503 and NETWORK_ERROR when network fails without mock fallback", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(apiRequest("/contacts")).rejects.toThrow(ApiError);
    await expect(apiRequest("/contacts")).rejects.toMatchObject({
      status: 503,
      code: "NETWORK_ERROR",
    });
  });

  it("should throw ApiError with backend status and code when backend returns an error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: { code: "NOT_FOUND", message: "Contact not found" },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(apiRequest("/contacts/unknown-id")).rejects.toThrow(ApiError);
    await expect(apiRequest("/contacts/unknown-id")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Contact not found",
    });
  });

  it("should handle single-flight 401 refresh: multiple concurrent requests trigger only ONE refresh call", async () => {
    window.localStorage.setItem(storageKeys.TOKEN_KEY, "expired-token");
    window.localStorage.setItem(storageKeys.REFRESH_KEY, "valid-refresh-token");

    let refreshCalledTimes = 0;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      // 1. Refresh endpoint: returns new rotated tokens
      if (url.endsWith("/auth/refresh")) {
        refreshCalledTimes++;
        const body = JSON.parse(init?.body as string);
        expect(body.refreshToken).toBe("valid-refresh-token");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              accessToken: "new-rotated-access-token",
              refreshToken: "new-rotated-refresh-token",
            },
          }),
        };
      }

      // 2. Business endpoints: return 401 if using expired-token, return 200 if using new-rotated-access-token
      const authHeader = (init?.headers as Record<string, string>)?.["Authorization"];
      if (authHeader === "Bearer expired-token") {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Token expired" },
          }),
        };
      }

      if (authHeader === "Bearer new-rotated-access-token") {
        if (url.includes("/leads")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [{ id: "lead-1" }] }),
          };
        }
        if (url.includes("/contacts")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [{ id: "contact-1" }] }),
          };
        }
        if (url.includes("/conversations")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [{ id: "conv-1" }] }),
          };
        }
      }

      return {
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: { code: "SERVER_ERROR", message: "Unknown" } }),
      };
    });

    vi.stubGlobal("fetch", mockFetch);

    // Fire 3 concurrent API calls simultaneously with expired token
    const [leadsRes, contactsRes, convsRes] = await Promise.all([
      apiRequest<{ id: string }[]>("/leads"),
      apiRequest<{ id: string }[]>("/contacts"),
      apiRequest<{ id: string }[]>("/conversations"),
    ]);

    // All 3 requests must succeed with data after single refresh replay
    expect(leadsRes.data).toEqual([{ id: "lead-1" }]);
    expect(contactsRes.data).toEqual([{ id: "contact-1" }]);
    expect(convsRes.data).toEqual([{ id: "conv-1" }]);

    // Crucial check: /auth/refresh was called EXACTLY ONCE (single-flight deduplication)
    expect(refreshCalledTimes).toBe(1);

    // Tokens in storage must be updated with the rotated values
    expect(getAccessToken()).toBe("new-rotated-access-token");
    expect(getRefreshToken()).toBe("new-rotated-refresh-token");
  });

  it("should clear tokens and dispatch auth-cleared event when refresh token is rejected", async () => {
    window.localStorage.setItem(storageKeys.TOKEN_KEY, "expired-token");
    window.localStorage.setItem(storageKeys.REFRESH_KEY, "reused-stale-refresh-token");

    const authClearedListener = vi.fn();
    window.addEventListener("frankly:auth-cleared", authClearedListener);

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: "REFRESH_TOKEN_REUSED", message: "Refresh token has been reused" },
          }),
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Token expired" },
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(apiRequest("/leads")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Session expired. Please sign in again.",
    });

    expect(authClearedListener).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("should not trigger token refresh when /auth/login returns 401", async () => {
    let refreshAttempted = false;

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshAttempted = true;
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      apiRequest("/auth/login", {
        method: "POST",
        body: { email: "wrong@test.com", password: "bad" },
      }),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
    });

    expect(refreshAttempted).toBe(false);
  });
});
