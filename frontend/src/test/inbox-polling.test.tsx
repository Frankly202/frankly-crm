import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useConversations,
  useConversation,
  useUnreadCount,
  useSendMessage,
  INBOX_POLL_INTERVAL,
  queryKeys,
} from "@/lib/api/queries";
import * as clientModule from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
  buildQuery: vi.fn().mockReturnValue(""),
}));

describe("Inbox Polling & Query Freshness (Phase 8)", () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return function QueryWrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports INBOX_POLL_INTERVAL as 15000 (15 seconds)", () => {
    expect(INBOX_POLL_INTERVAL).toBe(15000);
  });

  it("configures useConversations with 15s polling, paused in background, and window focus refetch", async () => {
    vi.mocked(clientModule.apiRequest).mockResolvedValue({
      data: [{ id: "cv-001", lastMessageAt: new Date().toISOString() }],
      meta: {
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const wrapper = createWrapper();
    renderHook(() => useConversations({ limit: 50 }), { wrapper });

    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll();
      expect(queries.length).toBeGreaterThanOrEqual(1);
    });

    const convListQuery = queryClient
      .getQueryCache()
      .find({ queryKey: queryKeys.conversations.list({ limit: 50 }) });

    expect(convListQuery).toBeDefined();
    const options = convListQuery?.options as unknown as {
      refetchInterval: number;
      refetchIntervalInBackground: boolean;
      refetchOnWindowFocus: boolean;
    };
    expect(options.refetchInterval).toBe(15000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("configures useConversation detail with 15s polling, paused in background, and window focus refetch", async () => {
    vi.mocked(clientModule.apiRequest).mockResolvedValue({
      data: { id: "cv-001", messages: [] },
    });

    const wrapper = createWrapper();
    renderHook(() => useConversation("cv-001"), { wrapper });

    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll();
      expect(queries.length).toBeGreaterThanOrEqual(1);
    });

    const convDetailQuery = queryClient
      .getQueryCache()
      .find({ queryKey: queryKeys.conversations.detail("cv-001") });

    expect(convDetailQuery).toBeDefined();
    const options = convDetailQuery?.options as unknown as {
      refetchInterval: number;
      refetchIntervalInBackground: boolean;
      refetchOnWindowFocus: boolean;
    };
    expect(options.refetchInterval).toBe(15000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("configures useUnreadCount with 15s polling, paused in background, and window focus refetch", async () => {
    vi.mocked(clientModule.apiRequest).mockResolvedValue({
      data: { unreadCount: 3 },
    });

    const wrapper = createWrapper();
    renderHook(() => useUnreadCount("WHATSAPP"), { wrapper });

    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll();
      expect(queries.length).toBeGreaterThanOrEqual(1);
    });

    const unreadQuery = queryClient
      .getQueryCache()
      .find({ queryKey: queryKeys.conversations.unreadCount("WHATSAPP") });

    expect(unreadQuery).toBeDefined();
    const options = unreadQuery?.options as unknown as {
      refetchInterval: number;
      refetchIntervalInBackground: boolean;
      refetchOnWindowFocus: boolean;
    };
    expect(options.refetchInterval).toBe(15000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("invalidates conversations.detail(id) and conversations.all upon outbound sendMessage mutation", async () => {
    vi.mocked(clientModule.apiRequest).mockResolvedValue({
      data: { id: "msg-001", body: "Reply text" },
    });

    const wrapper = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSendMessage("cv-001"), { wrapper });

    await result.current.mutateAsync("Hello customer");

    expect(clientModule.apiRequest).toHaveBeenCalledWith("/conversations/cv-001/messages", {
      method: "POST",
      body: { body: "Hello customer" },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.detail("cv-001"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.all,
    });
  });
});
